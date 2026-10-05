/* ============================================================================
 * theme.js —— 主题引擎（白日 / 黑夜）
 * ----------------------------------------------------------------------------
 * 功能：
 *   1. 手动模式：点击按钮一键切换，带完整切换动效
 *   2. 自动模式：根据「电脑时间」判断白天/黑夜，到点自动切换（每 30 秒检查一次）
 *   3. 三种切换特效：ripple 波纹 / wipe 圆形擦除 / fade 淡入淡出
 *   4. 优先使用原生 View Transitions API，不支持时自动降级为令牌插值 + 特效层
 *   5. 自定义配色：字体颜色 / 背景颜色（白天、黑夜各自独立），
 *      并由背景色推导出新拟态所需的整套表面色与阴影
 * ========================================================================== */
(function (window, document) {
  'use strict';

  const store = window.DSH.store;
  const root = document.documentElement;
  const listeners = [];

  /* 强调色色板：全部取自 Apple 系统色板，其中「石墨灰 / 银白」就是苹果那套灰白选项 ——
     想要整页灰白极简，选它们即可（装饰光斑、按钮、进度条都会跟着变成灰白）。 */
  const ACCENTS = [
    { name: 'Apple 系统蓝', value: '#0071e3' },
    { name: '石墨灰', value: '#8e8e93' },
    { name: '银白', value: '#c7c7cc' },
    { name: '紫色', value: '#bf5af2' },
    { name: '粉色', value: '#ff375f' },
    { name: '红色', value: '#ff453a' },
    { name: '橙色', value: '#ff9f0a' },
    { name: '绿色', value: '#30d158' }
  ];
  const DEFAULT_ACCENT = '#0071e3';

  /* 作者原本的内置配色 —— ⚠️ 必须与 css/theme.css 里 --bg / --text 的默认值保持一致。
     `preset: 'native'` 时完全不注入样式，页面就长成作者写的那套新拟态皮肤。 */
  const NATIVE = {
    light: { bg: '#e8edf5', text: '#0b0d12' },
    dark:  { bg: '#14161c', text: '#f2f4f8' }
  };

  /* --------------------------------------------------------------------------
   * 配色预设
   * ---------------------------------------------------------------------------
   * 每套预设同时定义「白天 / 黑夜」两套主题的底色、文字色与新拟态阴影，
   * 并自带配套强调色（accent: null 表示不动用户当前的强调色）。
   *   · native —— 不注入任何覆盖，完全用 css/theme.css 的原生配色
   *   · 其余   —— 由预设的 bg / text / 阴影 推导出整套新拟态令牌
   *   · custom —— 用设置页里挑的背景色与文字色
   * ------------------------------------------------------------------------ */
  const PRESETS = [
    {
      id: 'native',
      name: '原生新拟物',
      desc: '作者原本的冷灰蓝底',
      accent: DEFAULT_ACCENT,
      native: true
    },
    {
      id: 'apple',
      name: 'Apple 简约灰白',
      desc: 'systemGray6 灰白 · 石墨强调',
      accent: '#8e8e93',
      light: { bg: '#f5f5f7', text: '#1d1d1f', shLight: 'rgba(255,255,255,.98)', shDark: 'rgba(60,60,67,.20)' },
      dark:  { bg: '#1c1c1e', text: '#f5f5f7', shLight: 'rgba(255,255,255,.06)', shDark: 'rgba(0,0,0,.60)' }
    },
    {
      id: 'warm',
      name: '暖阳米白',
      desc: '米白底 · 柔和暖调强调色',
      /* 强调色刻意压低饱和度（原来的 #ff9f0a 太扎眼）：
         现在是低饱和的琥珀色，和这层米白底、暖调阴影以及淡淡的暖色光斑同一色系，
         整体更柔和，也不会抢走内容。 */
      accent: '#bd8a4e',
      light: { bg: '#f7f3ec', text: '#221c14', shLight: 'rgba(255,255,255,.98)', shDark: 'rgba(97,74,48,.22)' },
      dark:  { bg: '#1b1714', text: '#f6efe4', shLight: 'rgba(255,255,255,.06)', shDark: 'rgba(0,0,0,.62)' }
    },
    {
      id: 'graphite',
      name: '墨玉深灰',
      desc: '近乎无彩的高级灰',
      accent: '#6e6e73',
      light: { bg: '#ececee', text: '#111113', shLight: 'rgba(255,255,255,.96)', shDark: 'rgba(0,0,0,.18)' },
      dark:  { bg: '#131315', text: '#eaeaec', shLight: 'rgba(255,255,255,.055)', shDark: 'rgba(0,0,0,.65)' }
    },
    {
      id: 'midnight',
      name: '深海夜蓝',
      desc: '冷调深蓝 · 更适合夜晚',
      accent: '#0a84ff',
      light: { bg: '#eaeff7', text: '#0d1522', shLight: 'rgba(255,255,255,.96)', shDark: 'rgba(20,38,66,.20)' },
      dark:  { bg: '#0d1219', text: '#e6ecf5', shLight: 'rgba(255,255,255,.06)', shDark: 'rgba(0,0,0,.66)' }
    },
    {
      id: 'custom',
      name: '自定义',
      desc: '自己挑背景与文字色',
      accent: null,
      custom: true
    }
  ];

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
    // 特效层的颜色必须与「目标主题」的背景一致，否则切换时会闪出旧底色。
    // 背景色可能来自配色预设，所以这里走同一套推导；原生预设定就用作者写的底色。
    const m = theme === 'dark' ? 'dark' : 'light';
    const tokens = deriveTokens(m);
    if (tokens && tokens['--bg']) return tokens['--bg'];
    return NATIVE[m].bg;
  }

  function clearFx() {
    fxNodes.forEach((n) => { n.remove(); });
    fxNodes = [];
    document.body.classList.remove('is-switching');
  }

  /* --------------------------------------------------------------------------
   * 自定义配色：字体颜色 / 背景颜色
   * ---------------------------------------------------------------------------
   * 用户可以在设置页分别给「白天」「黑夜」指定字体色与背景色。实现要点：
   *
   *   1. 用一段注入的 <style> 写 :root 与 [data-theme="dark"] 两组规则，
   *      两套主题各自保留自己的配色 —— 行内样式做不到这一点（会同时盖住两套）。
   *      注入的样式表排在所有 <link> 之后，同权重时按文档顺序胜出。
   *
   *   2. ★ 新拟态（Neumorphism）的铁律是「表面色 == 背景色」，
   *      所以背景色一改，surface / surface-2 / bg-2 / border / 阴影
   *      全都必须由新背景色重新推导，否则控件就不再是「从背景里长出来」的，
   *      而是浮在背景上的一块补丁，立体感直接崩掉。
   *
   *   3. 混色全部在 JS 里算成具体颜色值（不依赖 color-mix），
   *      老浏览器打开线上站点也不会掉色。
   * ------------------------------------------------------------------------ */

  /** 归一化 #abc / #aabbcc；非法值返回 fallback */
  function normHex(v, fallback) {
    const s = String(v == null ? '' : v).trim();
    if (/^#[0-9a-f]{3}$/i.test(s)) return ('#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
    if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
    return fallback === undefined ? '' : fallback;
  }
  /** 线性混色：ratioA = 0.7 表示「70% a + 30% b」 */
  function mixHex(a, b, ratioA) {
    const A = hexToRgb(a), B = hexToRgb(b);
    if (!A || !B) return a;
    return rgbToHex(
      A.r * ratioA + B.r * (1 - ratioA),
      A.g * ratioA + B.g * (1 - ratioA),
      A.b * ratioA + B.b * (1 - ratioA)
    );
  }
  const withAlpha = (hex, alpha) => {
    const c = hexToRgb(hex);
    return c ? 'rgba(' + c.r + ', ' + c.g + ', ' + c.b + ', ' + alpha + ')' : hex;
  };
  /** 相对亮度（WCAG），用来判断背景是「亮底」还是「暗底」 */
  function relLuminance(hex) {
    const c = hexToRgb(hex);
    if (!c) return 1;
    const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
    return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b);
  }

  /** 取预设对象（找不到就回落到原生） */
  function getPreset(id) {
    return PRESETS.filter((p) => p.id === id)[0] || PRESETS[0];
  }

  /**
   * 推导某套主题下要覆盖的令牌
   * @param {'light'|'dark'} mode
   * @returns {Object|null} null = 不注入任何覆盖（原生预设，完全走 css/theme.css）
   */
  function deriveTokens(mode) {
    const t = store.get('theme') || {};
    const m = mode === 'dark' ? 'dark' : 'light';
    const preset = getPreset(t.preset);

    // ★ 原生预设：一个令牌都不覆盖，页面就是作者原本写的那套新拟态皮肤
    if (preset.native) return null;

    let bg, text, shLight, shDark;
    if (preset.custom) {
      const c = (t.customColor || {})[m] || {};
      bg = normHex(c.bg, NATIVE[m].bg);
      text = normHex(c.text, NATIVE[m].text);
      shLight = null; shDark = null;                 // 交给亮度自动判定
    } else {
      const p = preset[m] || {};
      bg = normHex(p.bg, NATIVE[m].bg);
      text = normHex(p.text, NATIVE[m].text);
      shLight = p.shLight || null;
      shDark = p.shDark || null;
    }

    // 背景偏暗 → 走暗色新拟态方案（亮面极弱、阴影纯黑）
    const darkBg = relLuminance(bg) < .45;
    const fallbackShadow = darkBg ? withAlpha('#000000', .60) : withAlpha(mixHex(bg, '#000000', .70), .20);
    const shadow = shDark || fallbackShadow;

    return {
      '--bg': bg,
      '--surface': bg,                                                     // 新拟态：表面 = 背景
      '--surface-2': mixHex(bg, darkBg ? '#ffffff' : '#000000', darkBg ? .965 : .97), // 凹槽：暗底抬亮 / 亮底压暗
      // 浮起面（弹层、提示条、下拉选项、滑块/开关的圆点）。
      // ⚠️ mixHex(a, b, r) = r*a + (1-r)*b，所以「暗底往白里抬」必须传一个接近 1 的比例，
      //    早先写成 .10 变成了「10% 背景 + 90% 白」——黑夜主题下提示条会变成白底，
      //    配白色文字直接白到看不见。
      '--bg-2': mixHex(bg, '#ffffff', darkBg ? .90 : .35),
      '--text': text,
      '--muted': mixHex(text, bg, .62),                                    // 次级文字 = 字体色与背景色的混合
      '--border': withAlpha(text, darkBg ? .08 : .06),
      '--track': withAlpha(text, .10),
      '--ink-line': withAlpha(text, .03),
      '--shadow': shadow,
      '--sh-dark': shadow,                                                 // 新拟态的背光面
      '--sh-light': shLight || (darkBg ? withAlpha('#ffffff', .06) : withAlpha('#ffffff', .96))  // 受光面
    };
  }

  /** 把推导结果写进注入的样式表（两套主题各一组规则）；原生预设则清空，不干预 CSS */
  let colorStyleEl = null;
  function applyColorOverrides() {
    if (!colorStyleEl) {
      colorStyleEl = document.createElement('style');
      colorStyleEl.id = 'dsh-color-overrides';
      document.head.appendChild(colorStyleEl);
    }
    const light = deriveTokens('light');
    const dark = deriveTokens('dark');
    if (!light && !dark) { colorStyleEl.textContent = ''; return; }   // 原生：不覆盖任何令牌
    const decls = (map) => Object.keys(map).map((k) => k + ':' + map[k]).join(';');
    colorStyleEl.textContent =
      (light ? ':root{' + decls(light) + '}\n' : '') +
      (dark ? '[data-theme="dark"]{' + decls(dark) + '}' : '');
  }

  /** 切换配色预设（设置页调用）：预设自带的强调色会一起套用 */
  function applyPreset(id) {
    const preset = getPreset(id);
    const pairs = { 'theme.preset': preset.id };
    if (preset.accent) pairs['theme.accent'] = preset.accent;
    store.patch(pairs);
    applyTokens();
    return preset;
  }

  /* --------------------------------------------------------------------------
   * 应用设置里的个性化令牌（配色预设 / 强调色 / 圆角 / 动效）
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
    // 注意：毛玻璃强度（--blur）已改为 CSS 固定值，不再由设置页控制
    applyColorOverrides();
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
    // 渐变第二色的推导：
    // 冷色（蓝/紫/青）正向转，得到同色系的紫或青；
    // 暖色（橙/黄）正向转会掉进橄榄绿、发脏 —— 所以暖色朝红的方向转，
    // 于是暖调强调色的渐变是「琥珀 → 陶土红」，整体依然柔和、不刺眼。
    const hueDeg = hsl.h * 360;
    const warm = hueDeg < 90 || hueDeg > 300;
    hsl.h = (hsl.h + (warm ? -deg : deg) / 360 + 1) % 1;
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
    applyPreset: applyPreset,
    getPreset: getPreset,
    get presetList() { return PRESETS; },
    get current() { return current; },
    ACCENTS: ACCENTS,
    DEFAULT_ACCENT: DEFAULT_ACCENT,
    onChange(fn) { listeners.push(fn); },
    bgColorOf: bgColorOf
  };
})(window, document);
