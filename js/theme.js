/* ============================================================================
 * theme.js —— 主题引擎（白日 / 黑夜）
 * ----------------------------------------------------------------------------
 * 功能：
 *   1. 手动模式：点击按钮一键切换，带完整切换动效
 *   2. 自动模式：根据「电脑时间」判断白天/黑夜，到点自动切换（每 30 秒检查一次）
 *   3. 三种切换特效：ripple 波纹 / wipe 圆形擦除 / fade 淡入淡出
 *   4. 优先使用原生 View Transitions API，不支持时自动降级为令牌插值 + 特效层
 * ========================================================================== */
(function (window, document) {
  'use strict';

  const store = window.DSH.store;
  const root = document.documentElement;
  const listeners = [];

  /* 强调色 → 深浅色主题下的默认值由 CSS 提供；用户自定义时覆盖在 <html> 行内样式上 */
  const ACCENTS = ['#5b7cfa', '#8a6bff', '#12b8a6', '#ff7a59', '#e8467c', '#f2b53c'];
  const DEFAULT_ACCENT = '#5b7cfa';

  let current = 'light';
  let autoTimer = null;
  let fxNodes = [];

  /* --------------------------------------------------------------------------
   * 工具
   * ------------------------------------------------------------------------ */
  const prefersReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function motionOn() {
    const t = store.get('theme');
    return !!t.motion && !prefersReduced() && !root.classList.contains('no-motion');
  }

  function bgColorOf(theme) {
    // 特效层的颜色需要和「目标主题」的背景一致，这里读取一份镜像变量
    return theme === 'dark' ? '#0a0c12' : '#eef1f8';
  }

  function clearFx() {
    fxNodes.forEach((n) => { n.remove(); });
    fxNodes = [];
    document.body.classList.remove('is-switching');
  }

  /* --------------------------------------------------------------------------
   * 应用设置里的个性化令牌（强调色 / 圆角 / 毛玻璃 / 动效）
   * ------------------------------------------------------------------------ */
  function applyTokens() {
    const t = store.get('theme');
    // 强调色为默认值时移除行内覆盖，让深浅两套主题各自使用自己的配色；
    // 一旦用户自定义，就用行内样式覆盖两套主题，保持品牌色一致。
    if (String(t.accent).toLowerCase() === DEFAULT_ACCENT) {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--accent-2');
    } else {
      root.style.setProperty('--accent', t.accent);
      root.style.setProperty('--accent-2', shiftHue(t.accent, 38));
    }
    root.style.setProperty('--radius', (Number(t.radius) || 0) + 'px');
    root.style.setProperty('--blur', (Number(t.blur) || 0) + 'px');
    root.classList.toggle('no-motion', !t.motion);
    if (t.motion) {
      root.style.setProperty('--dur', (Number(t.duration) || 620) + 'ms');
      root.style.setProperty('--dur-fast', Math.max(80, Math.round((Number(t.duration) || 620) * 0.36)) + 'ms');
    } else {
      root.style.removeProperty('--dur');
      root.style.removeProperty('--dur-fast');
    }
    document.body.dataset.themeMode = t.mode;
  }

  /** 把十六进制色相旋转一定角度，得到渐变的第二个颜色 */
  function shiftHue(hex, deg) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    hsl.h = (hsl.h + deg / 360) % 1;
    const out = hslToRgb(hsl.h, Math.min(1, hsl.s * 1.05), Math.min(.92, hsl.l * 1.08));
    return rgbToHex(out.r, out.g, out.b);
  }
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim());
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
  }
  const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > .5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return { h, s, l };
  }
  function hslToRgb(h, s, l) {
    if (!s) { const v = l * 255; return { r: v, g: v, b: v }; }
    const q = l < .5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return { r: f(h + 1 / 3) * 255, g: f(h) * 255, b: f(h - 1 / 3) * 255 };
  }

  /* --------------------------------------------------------------------------
   * 切换特效（三种）
   * ------------------------------------------------------------------------ */
  function fxRipple(origin, target, done) {
    const w = 12;
    const rect = { w: window.innerWidth, h: window.innerHeight };
    const dist = Math.hypot(Math.max(origin.x, rect.w - origin.x), Math.max(origin.y, rect.h - origin.y));
    const dur = (Number(store.get('theme').duration) * 1.25) || 760;
    const node = document.createElement('div');
    node.className = 'fx-wave';
    node.style.setProperty('--fx-x', origin.x + 'px');
    node.style.setProperty('--fx-y', origin.y + 'px');
    node.style.setProperty('--fx-scale', String(Math.ceil(dist / w) + 2));
    node.style.animationDuration = dur + 'ms';
    document.body.appendChild(node);
    fxNodes.push(node);
    // 动画结束后自行移除，不长期占用 DOM
    setTimeout(() => {
      node.remove();
      fxNodes = fxNodes.filter((n) => n !== node);
    }, dur + 80);
  }

  function fxWipe(origin, target, done) {
    const rect = { w: window.innerWidth, h: window.innerHeight };
    const r = Math.hypot(Math.max(origin.x, rect.w - origin.x), Math.max(origin.y, rect.h - origin.y));
    const node = document.createElement('div');
    node.className = 'fx-wipe';
    node.style.setProperty('--wipe-color', bgColorOf(target));
    node.style.setProperty('--fx-x', origin.x + 'px');
    node.style.setProperty('--fx-y', origin.y + 'px');
    node.style.setProperty('--fx-r', Math.ceil(r / Math.min(rect.w, rect.h) * 100 + 130) + '%');
    node.style.setProperty('--fx-dur', (Number(store.get('theme').duration) || 620) + 'ms');
    document.body.appendChild(node);
    fxNodes.push(node);
    // 第一帧：铺满 → 铺满后立刻换成目标主题 → 淡出幕布
    requestAnimationFrame(() => {
      node.classList.add('is-grow');
      setTimeout(() => {
        root.dataset.theme = target;
        node.classList.add('is-out');
        setTimeout(clearFx, 320);
      }, (Number(store.get('theme').duration) || 620) * .92);
    });
  }

  function fxFade(origin, target, done) {
    const node = document.createElement('div');
    node.className = 'fx-veil';
    node.style.setProperty('--wipe-color', bgColorOf(target));
    node.style.setProperty('--fx-dur', (Number(store.get('theme').duration) || 620) + 'ms');
    document.body.appendChild(node);
    fxNodes.push(node);
    requestAnimationFrame(() => {
      node.classList.add('is-on');
      setTimeout(() => {
        root.dataset.theme = target;
        node.classList.remove('is-on');
        setTimeout(clearFx, 400);
      }, (Number(store.get('theme').duration) || 620) * .42);
    });
  }

  /* --------------------------------------------------------------------------
   * 应用主题
   *   apply(target, { origin:{x,y}, animate:Boolean, silent:Boolean })
   * ------------------------------------------------------------------------ */
  function apply(target, opts) {
    opts = opts || {};
    const prev = current;
    target = target === 'dark' ? 'dark' : 'light';
    const store2 = store.get('theme');
    const newBg = bgColorOf(target);

    // 同步滚动条与浏览器 UI 配色
    const meta = document.getElementById('metaTheme');
    if (meta) meta.setAttribute('content', newBg);

    if (prev === target && root.dataset.theme === target) {
      current = target;
      if (!opts.silent) emit();
      return;
    }

    const animate = opts.animate !== false && motionOn() && !!prev;
    current = target;

    if (!animate) {
      root.dataset.theme = target;
      if (!opts.silent) emit();
      return;
    }

    const origin = opts.origin || { x: window.innerWidth - 48, y: 48 };
    clearFx();
    document.body.classList.add('is-switching');
    setTimeout(() => document.body.classList.remove('is-switching'), 700);

    const effect = store2.effect || 'ripple';
    const useViewTransition = effect === 'wipe' && typeof document.startViewTransition === 'function' && !prefersReduced();

    if (useViewTransition) {
      // 原生实现：圆形揭示动画交给浏览器合成器，性能最好
      const w = window.innerWidth, h = window.innerHeight;
      const r = Math.hypot(Math.max(origin.x, w - origin.x), Math.max(origin.y, h - origin.y));
      const vt = document.startViewTransition(() => { root.dataset.theme = target; });
      vt.ready.then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${origin.x}px ${origin.y}px)`, `circle(${r}px at ${origin.x}px ${origin.y}px)`] },
          { duration: Number(store2.duration) || 620, easing: 'cubic-bezier(.16,1,.3,1)', pseudoElement: '::view-transition-new(root)' }
        );
      }).catch(() => { root.dataset.theme = target; });
    } else if (effect === 'wipe') {
      fxWipe(origin, target);
    } else if (effect === 'fade') {
      root.dataset.theme = target;
      fxFade(origin, target);
    } else {
      root.dataset.theme = target;   // 令牌插值负责全局颜色流动
      fxRipple(origin, target);
    }

    if (!opts.silent) emit();
  }

  function emit() {
    const evt = { theme: current, resolved: store.resolveTheme() };
    listeners.forEach((fn) => { try { fn(evt); } catch (e) { console.error(e); } });
    window.dispatchEvent(new CustomEvent('dshthemechange', { detail: evt }));
  }

  /* --------------------------------------------------------------------------
   * 自动模式：按电脑时间判断
   * ------------------------------------------------------------------------ */
  function followTime(opts) {
    const want = store.resolveTheme();
    const t = store.get('theme');
    // 自动模式下若与当前不符，用动画切过去
    apply(want, Object.assign({ animate: !!opts && opts.animate !== false }, opts || {}));
    return want;
  }

  function startAutoWatcher() {
    clearInterval(autoTimer);
    let lastHour = new Date().getHours();
    autoTimer = setInterval(() => {
      const h = new Date().getHours();
      const t = store.get('theme');
      if (t.mode !== 'auto') return;
      if (h !== lastHour) { lastHour = h; apply(store.resolveTheme(), { animate: true }); }
    }, 30000);
    // 从休眠/切回标签页时立即校正
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && store.get('theme').mode === 'auto') {
        apply(store.resolveTheme(), { animate: true });
      }
    });
  }

  /* --------------------------------------------------------------------------
   * 一键切换（按钮点击）
   * ------------------------------------------------------------------------ */
  function toggle(origin) {
    const t = store.get('theme');
    const next = current === 'dark' ? 'light' : 'dark';
    if (t.mode === 'manual') {
      store.set('theme.manual', next);
      apply(next, { origin: origin });
    } else {
      // 自动模式下点击按钮 = 临时接管为手动模式，并切到相反的主题
      store.patch({ 'theme.mode': 'manual', 'theme.manual': next });
      document.body.dataset.themeMode = 'manual';
      apply(next, { origin: origin });
      window.DSH.ui && window.DSH.ui.toast('已切换为手动模式，可在设置里改回自动');
    }
    return next;
  }

  /* --------------------------------------------------------------------------
   * 初始化
   * ------------------------------------------------------------------------ */
  function init() {
    applyTokens();
    // 首屏不做动画，避免"打开就闪一下"
    const target = store.resolveTheme();
    root.dataset.theme = target;
    current = target;
    document.body.dataset.themeMode = store.get('theme').mode;
    const meta = document.getElementById('metaTheme');
    if (meta) meta.setAttribute('content', bgColorOf(target));

    startAutoWatcher();

    // 设置页修改了主题相关配置（或另一个标签页保存了数据）→ 立即重算
    store.on('change', () => {
      applyTokens();
      if (store.get('theme').mode === 'auto') apply(store.resolveTheme(), { animate: true });
    });

    // 键盘快捷键：Shift + D 切换昼夜
    document.addEventListener('keydown', (e) => {
      if (e.shiftKey && (e.key === 'D' || e.key === 'd') && !/input|textarea|select/i.test(document.activeElement.tagName)) {
        toggle();
      }
    });
  }

  window.DSH = window.DSH || {};
  window.DSH.theme = {
    init: init,
    apply: apply,
    toggle: toggle,
    followTime: followTime,
    applyTokens: applyTokens,
    get current() { return current; },
    ACCENTS: ACCENTS,
    onChange(fn) { listeners.push(fn); },
    bgColorOf: bgColorOf
  };
})(window, document);
