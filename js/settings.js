/* ============================================================================
 * settings.js —— 设置页逻辑
 * ----------------------------------------------------------------------------
 * 左侧导航切换板块，右侧面板编辑内容：
 *   1. 外观主题：手动按钮 / 跟随电脑时间、强调色、圆角、毛玻璃、切换特效
 *   2. 个人资料：头像导入（本地压缩）、姓名、头衔、简介、GitHub 地址
 *   3. 自身技能：加号按钮新增，可设置尺寸（对应前端的网格合并）
 *   4. 个人项目：名称/描述/标签/链接（留空则跳转 GitHub 主页）
 *   5. 联系方式：微信 / QQ / 邮箱 / 电话
 *   6. 音乐：导入本地音频（存入 IndexedDB）、曲目信息与歌词
 *   7. 数据：导出 / 导入 / 恢复默认
 * ========================================================================== */
(function (window, document) {
  'use strict';

  const store = window.DSH.store;
  const theme = window.DSH.theme;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));

  const toast = (m) => window.DSH.ui.toast(m);
  const uid = store.uid;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  /* 昼夜按钮用的太阳 / 月亮图标（与主页保持一致的内联 SVG） */
  const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/></svg>';
  const ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.3A8.6 8.6 0 0 1 9.7 3.5a8.6 8.6 0 1 0 10.8 10.8z"/></svg>';

  let localEdit = false;          // 标记「这次改动来自本页」，避免自己触发整页重渲染
  function local(fn) { localEdit = true; try { return fn(); } finally { localEdit = false; } }

  /* --------------------------------------------------------------------------
   * 1. 左侧导航切换（支持 URL hash，如 settings.html#music）
   * ------------------------------------------------------------------------ */
  function initNav() {
    const items = $$('.s-nav__item');
    const panes = $$('.s-pane');
    function activate(id) {
      if (!$('.s-pane[data-pane="' + id + '"]')) id = 'theme';
      items.forEach((it) => it.classList.toggle('is-active', it.dataset.pane === id));
      panes.forEach((p) => p.classList.toggle('is-active', p.dataset.pane === id));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (history.replaceState) history.replaceState(null, '', '#' + id);
    }
    items.forEach((it) => it.addEventListener('click', () => activate(it.dataset.pane)));
    window.addEventListener('hashchange', () => activate((location.hash || '#theme').slice(1)));
    activate((location.hash || '#theme').slice(1));
  }

  /* --------------------------------------------------------------------------
   * 2. 通用表单绑定：[data-path] 自动同步到数据仓库
   * ------------------------------------------------------------------------ */
  function paint(el) {
    if (el.type === 'range') {
      const min = Number(el.min || 0), max = Number(el.max || 100), v = Number(el.value);
      el.style.setProperty('--p', ((v - min) / (max - min) * 100) + '%');
    }
  }

  function readValue(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'range' || el.type === 'number') return Number(el.value);
    return el.value;
  }

  function bindFields() {
    $$('[data-path]').forEach((el) => {
      const evt = (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'color' || el.type === 'range') ? 'input' : 'input';
      el.addEventListener(evt, () => {
        local(() => store.set(el.dataset.path, readValue(el)));
        paint(el);
        updateCounters();
        flashSaved();
        if (/^theme\./.test(el.dataset.path)) theme.applyTokens();
        if (el.dataset.path === 'theme.accent') syncAccent();
      });
      el.addEventListener('change', () => {
        local(() => store.set(el.dataset.path, readValue(el)));
        updateCounters();
      });
    });
  }

  /** 把数据回填到表单（外部标签页改动时调用） */
  function syncFields() {
    $$('[data-path]').forEach((el) => {
      if (el === document.activeElement) return;    // 正在输入的框不要打断用户
      const v = store.get(el.dataset.path);
      if (el.type === 'checkbox') el.checked = !!v;
      else if (v !== undefined && v !== null) el.value = v;
      paint(el);
    });
    syncSegments();
    syncAccent();
    syncMiniThemes();
    updateCounters();
    renderAvatar();
  }

  function flashSaved() {
    const el = $('#savedFlag');
    if (!el) return;
    el.innerHTML = '<i></i>已自动保存';
    el.animate ? el.animate([{ opacity: .35 }, { opacity: 1 }], { duration: 260 }) : null;
  }

  /* --------------------------------------------------------------------------
   * 3. 分段控件（主题模式 / 循环模式）
   * ------------------------------------------------------------------------ */
  function initSegments() {
    $$('.seg[data-seg]').forEach((seg) => {
      seg.addEventListener('click', (e) => {
        const btn = e.target.closest('.seg__item');
        if (!btn) return;
        const path = seg.dataset.seg;
        let value = btn.dataset.value;
        if (btn.dataset.num === '1') value = Number(value);
        local(() => store.set(path, value));
        syncSegments();
        updateCounters();
        if (/^theme\./.test(path)) { theme.applyTokens(); theme.apply(store.resolveTheme(), { animate: true }); }
        toast('已切换：' + btn.textContent.trim());
      });
    });
  }

  function syncSegments() {
    $$('.seg[data-seg]').forEach((seg) => {
      const v = String(store.get(seg.dataset.seg));
      $$('.seg__item', seg).forEach((b) => b.classList.toggle('is-active', b.dataset.value === v));
    });
  }

  /* --------------------------------------------------------------------------
   * 4. 强调色
   * ------------------------------------------------------------------------ */
  function initAccent() {
    const box = $('#accentDots');
    if (!box) return;
    box.innerHTML = theme.ACCENTS.map((c) =>
      '<button class="color-dot" data-color="' + c + '" style="background:' + c + '" title="' + c + '" aria-label="强调色 ' + c + '"></button>'
    ).join('');
    box.addEventListener('click', (e) => {
      const dot = e.target.closest('.color-dot');
      if (!dot) return;
      local(() => store.set('theme.accent', dot.dataset.color));
      theme.applyTokens();
      syncAccent();
      toast('强调色已更新');
    });
  }
  function syncAccent() {
    const cur = String(store.get('theme.accent')).toLowerCase();
    $$('#accentDots .color-dot').forEach((d) => d.classList.toggle('is-active', d.dataset.color.toLowerCase() === cur));
    const picker = $('#accentPicker');
    if (picker && picker !== document.activeElement) picker.value = cur;
  }

  /* --------------------------------------------------------------------------
   * 5. 主题预览小卡 + 一键切换
   * ------------------------------------------------------------------------ */
  function syncMiniThemes() {
    const cur = theme.current || store.resolveTheme();
    $$('.theme-mini').forEach((m) => m.classList.toggle('is-active', m.dataset.theme === cur));
    const label = $('#themeNow');
    if (label) label.textContent = (cur === 'dark' ? '当前：黑夜模式' : '当前：白日模式') +
      (store.get('theme.mode') === 'auto' ? '（跟随时间 ' + store.get('theme.dayStart') + ':00 - ' + store.get('theme.nightStart') + ':00）' : '（手动）');
  }

  function initMiniThemes() {
    $$('.theme-mini').forEach((m) => {
      m.addEventListener('click', () => {
        const target = m.dataset.theme;
        local(() => store.patch({ 'theme.mode': 'manual', 'theme.manual': target }));
        theme.applyTokens();
        theme.apply(target, { animate: true, origin: { x: window.innerWidth / 2, y: window.innerHeight / 2 } });
        syncSegments(); syncMiniThemes(); updateCounters();
        toast(target === 'dark' ? '已切换为黑夜模式（手动）' : '已切换为白日模式（手动）');
      });
    });
    const now = $('#switchNow');
    if (now) now.addEventListener('click', () => {
      const next = theme.current === 'dark' ? 'light' : 'dark';
      local(() => store.patch({ 'theme.mode': 'manual', 'theme.manual': next }));
      theme.apply(next, { animate: true, origin: { x: window.innerWidth / 2, y: 80 } });
      syncSegments(); syncMiniThemes();
    });
  }

  /* --------------------------------------------------------------------------
   * 6. 个人资料 + 头像导入（本地等比裁剪 + 压缩，避免撑爆存储）
   * ------------------------------------------------------------------------ */
  function renderAvatar() {
    const box = $('#avatarPreview');
    if (!box) return;
    const data = store.get('profile.avatar');
    if (data) box.innerHTML = '<img src="' + data + '" alt="头像预览">';
    else box.textContent = (store.get('profile.name') || 'A').slice(0, 1).toUpperCase();
  }

  /** 读取图片 → 居中裁成正方形 → 缩放到 max 尺寸 → 输出 dataURL */
  function fileToAvatar(file, max, cb) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
        const out = Math.min(max, side);
        const cv = document.createElement('canvas');
        cv.width = cv.height = out;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, out, out);
        ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
        cb(cv.toDataURL('image/jpeg', .88));
      };
      img.onerror = () => toast('这张图片无法读取');
      img.src = reader.result;
    };
    reader.onerror = () => toast('文件读取失败');
    reader.readAsDataURL(file);
  }

  function initAvatar() {
    const input = $('#avatarInput');
    if (!input) return;
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      if (!/^image\//.test(file.type)) return toast('请选择图片文件（jpg / png / webp）');
      fileToAvatar(file, 400, (dataUrl) => {
        local(() => store.set('profile.avatar', dataUrl));
        renderAvatar();
        toast('头像已更新（约 ' + Math.round(dataUrl.length / 1365) + ' KB）');
      });
      input.value = '';
    });
    const rm = $('#avatarRemove');
    if (rm) rm.addEventListener('click', () => {
      local(() => store.set('profile.avatar', ''));
      renderAvatar();
      toast('已移除头像，将显示姓名首字');
    });
    const name = $('[data-path="profile.name"]');
    if (name) name.addEventListener('input', renderAvatar);
  }

  /* --------------------------------------------------------------------------
   * 7. 技能编辑器（加号按钮新增 + 网格合并尺寸）
   * ------------------------------------------------------------------------ */
  function renderSkills() {
    const box = $('#skillList');
    if (!box) return;
    const list = store.get('skills') || [];
    if (!list.length) {
      box.innerHTML = '<div class="skills-empty" style="min-height:80px">还没有技能，点下面的 ＋ 添加第一条</div>';
      return;
    }
    box.innerHTML = list.map((s, i) => '' +
      '<div class="edit-card" data-id="' + s.id + '">' +
        '<div class="edit-card__head">' +
          '<span class="edit-card__idx">' + (i + 1) + '</span>' +
          '<span class="edit-card__title">' + esc(s.title || '未命名技能') + '</span>' +
        '</div>' +
        '<div class="edit-card__ops">' +
          '<button class="icon-btn icon-btn--sm" data-act="up" title="上移">↑</button>' +
          '<button class="icon-btn icon-btn--sm" data-act="down" title="下移">↓</button>' +
          '<button class="icon-btn icon-btn--sm" data-act="del" title="删除">✕</button>' +
        '</div>' +
        '<div class="edit-card__body form-grid">' +
          '<div class="field"><label class="field__label">技能名称</label>' +
            '<input class="input" data-f="title" value="' + esc(s.title) + '" placeholder="例如：JavaScript"></div>' +
          '<div class="field"><label class="field__label">卡片尺寸<span class="field__hint">（网格合并）</span></label>' +
            '<select class="select" data-f="size">' +
              ['normal:标准单元格', 'wide:横向合并 2 列', 'tall:纵向合并 2 行', 'big:2×2 合并 4 格']
                .map((o) => { const [v, t] = o.split(':'); return '<option value="' + v + '"' + (s.size === v ? ' selected' : '') + '>' + t + '</option>'; }).join('') +
            '</select></div>' +
          '<div class="field field--full"><label class="field__label">补充说明</label>' +
            '<input class="input" data-f="desc" value="' + esc(s.desc) + '" placeholder="一句话描述，留空则只显示标题"></div>' +
          '<div class="field field--full"><label class="field__label">熟练度 <span class="field__hint" data-lv>' + (Number(s.level) || 0) + '%</span></label>' +
            '<input class="range" type="range" min="0" max="100" step="1" data-f="level" value="' + (Number(s.level) || 0) + '"></div>' +
        '</div>' +
      '</div>'
    ).join('');

    $$('.edit-card', box).forEach((card) => {
      const id = card.dataset.id;
      const idx = () => (store.get('skills') || []).findIndex((x) => x.id === id);
      $$('input,select', card).forEach((el) => {
        if (el.type === 'range') paint(el);
        el.addEventListener('input', () => {
          const i = idx(); if (i < 0) return;
          const field = el.dataset.f;
          let v = el.type === 'range' ? Number(el.value) : el.value;
          local(() => store.update((d) => { d.skills[i][field] = v; }));
          if (el.type === 'range') { paint(el); const lv = $('[data-lv]', card); if (lv) lv.textContent = v + '%'; }
          if (field === 'title') $('.edit-card__title', card).textContent = v || '未命名技能';
          updateCounters();
        });
      });
      $$('[data-act]', card).forEach((btn) => btn.addEventListener('click', () => {
        const i = idx(); if (i < 0) return;
        const act = btn.dataset.act;
        local(() => store.update((d) => {
          if (act === 'del') d.skills.splice(i, 1);
          if (act === 'up' && i > 0) d.skills.splice(i - 1, 0, d.skills.splice(i, 1)[0]);
          if (act === 'down' && i < d.skills.length - 1) d.skills.splice(i + 1, 0, d.skills.splice(i, 1)[0]);
        }));
        renderSkills(); updateCounters();
      }));
    });
  }

  function addSkill() {
    local(() => store.update((d) => d.skills.push({ id: uid('sk'), title: '新技能', desc: '', size: 'normal', level: 70 })));
    renderSkills(); updateCounters();
    const box = $('#skillList');
    const last = box.lastElementChild;
    if (last) { last.classList.add('is-new'); last.scrollIntoView({ block: 'center', behavior: 'smooth' }); const inp = $('input[data-f="title"]', last); if (inp) { inp.focus(); inp.select(); } }
  }

  /* --------------------------------------------------------------------------
   * 8. 项目编辑器
   * ------------------------------------------------------------------------ */
  function renderProjects() {
    const box = $('#projectList');
    if (!box) return;
    const list = store.get('projects') || [];
    if (!list.length) {
      box.innerHTML = '<div class="skills-empty" style="min-height:80px">还没有项目，点下面的 ＋ 添加第一个</div>';
      return;
    }
    box.innerHTML = list.map((p, i) => '' +
      '<div class="edit-card" data-id="' + p.id + '">' +
        '<div class="edit-card__head">' +
          '<span class="edit-card__idx">' + (i + 1) + '</span>' +
          '<span class="edit-card__title">' + esc(p.name || '未命名项目') + '</span>' +
        '</div>' +
        '<div class="edit-card__ops">' +
          '<button class="icon-btn icon-btn--sm" data-act="up" title="上移">↑</button>' +
          '<button class="icon-btn icon-btn--sm" data-act="down" title="下移">↓</button>' +
          '<button class="icon-btn icon-btn--sm" data-act="del" title="删除">✕</button>' +
        '</div>' +
        '<div class="edit-card__body form-grid">' +
          '<div class="field"><label class="field__label">项目名称</label>' +
            '<input class="input" data-f="name" value="' + esc(p.name) + '" placeholder="项目名"></div>' +
          '<div class="field"><label class="field__label">标签<span class="field__hint">（英文逗号分隔）</span></label>' +
            '<input class="input" data-f="tags" value="' + esc((p.tags || []).join(',')) + '" placeholder="Web,工具"></div>' +
          '<div class="field field--full"><label class="field__label">项目描述</label>' +
            '<textarea class="textarea" data-f="desc" style="min-height:74px" placeholder="一句话介绍这个项目">' + esc(p.desc) + '</textarea></div>' +
          '<div class="field field--full"><label class="field__label">跳转链接<span class="field__hint">（留空 = 打开 GitHub 主页）</span></label>' +
            '<input class="input" data-f="link" value="' + esc(p.link) + '" placeholder="https://github.com/用户名/仓库"></div>' +
        '</div>' +
      '</div>'
    ).join('');

    $$('.edit-card', box).forEach((card) => {
      const id = card.dataset.id;
      const idx = () => (store.get('projects') || []).findIndex((x) => x.id === id);
      $$('input,textarea', card).forEach((el) => el.addEventListener('input', () => {
        const i = idx(); if (i < 0) return;
        const field = el.dataset.f;
        const v = field === 'tags' ? el.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean) : el.value;
        local(() => store.update((d) => { d.projects[i][field] = v; }));
        if (field === 'name') $('.edit-card__title', card).textContent = v || '未命名项目';
        updateCounters();
      }));
      $$('[data-act]', card).forEach((btn) => btn.addEventListener('click', () => {
        const i = idx(); if (i < 0) return;
        const act = btn.dataset.act;
        local(() => store.update((d) => {
          if (act === 'del') d.projects.splice(i, 1);
          if (act === 'up' && i > 0) d.projects.splice(i - 1, 0, d.projects.splice(i, 1)[0]);
          if (act === 'down' && i < d.projects.length - 1) d.projects.splice(i + 1, 0, d.projects.splice(i, 1)[0]);
        }));
        renderProjects(); updateCounters();
      }));
    });
  }

  function addProject() {
    local(() => store.update((d) => d.projects.push({ id: uid('pj'), name: '新项目', desc: '', tags: [], link: '' })));
    renderProjects(); updateCounters();
    const last = $('#projectList').lastElementChild;
    if (last) { last.classList.add('is-new'); last.scrollIntoView({ block: 'center', behavior: 'smooth' }); const inp = $('input[data-f="name"]', last); if (inp) { inp.focus(); inp.select(); } }
  }

  /* --------------------------------------------------------------------------
   * 9. 音乐：导入本地文件 → IndexedDB；编辑曲目信息与歌词
   * ------------------------------------------------------------------------ */
  const fmtSize = (b) => (!b ? '—' : b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

  function renderTracks() {
    const box = $('#trackList');
    if (!box) return;
    const list = store.get('music.tracks') || [];
    if (!list.length) {
      box.innerHTML = '<div class="skills-empty" style="min-height:96px">曲库是空的<br>用上面的「导入音乐」按钮或把音频文件拖进来</div>';
      return;
    }
    box.innerHTML = list.map((t, i) => '' +
      '<div class="edit-card" data-id="' + t.id + '">' +
        '<div class="edit-card__head">' +
          '<span class="edit-card__idx">' + (i + 1) + '</span>' +
          '<span class="edit-card__title">' + esc(t.title || t.fileName || '未命名') + '</span>' +
        '</div>' +
        '<div class="edit-card__ops">' +
          '<button class="icon-btn icon-btn--sm" data-act="preview" title="试听">▶</button>' +
          '<button class="icon-btn icon-btn--sm" data-act="up" title="上移">↑</button>' +
          '<button class="icon-btn icon-btn--sm" data-act="down" title="下移">↓</button>' +
          '<button class="icon-btn icon-btn--sm" data-act="del" title="删除">✕</button>' +
        '</div>' +
        '<div class="edit-card__body">' +
          '<div class="form-grid">' +
            '<div class="field"><label class="field__label">歌曲名</label>' +
              '<input class="input" data-f="title" value="' + esc(t.title) + '"></div>' +
            '<div class="field"><label class="field__label">歌手</label>' +
              '<input class="input" data-f="artist" value="' + esc(t.artist) + '" placeholder="未知歌手"></div>' +
            '<div class="field field--full"><label class="field__label">歌词<span class="field__hint">（支持 LRC 时间轴，例如 [00:12.30]第一句；纯文本会按总时长自动铺开）</span></label>' +
              '<textarea class="textarea" data-f="lyrics" style="min-height:96px" placeholder="[00:00.00]第一句歌词&#10;[00:05.20]第二句歌词">' + esc(t.lyrics) + '</textarea></div>' +
          '</div>' +
          '<div class="track-meta">' +
            '<span>文件：' + esc(t.fileName || '—') + '</span>' +
            '<span>大小：' + fmtSize(t.size) + '</span>' +
            '<span>歌词：' + ((t.lyrics || '').trim() ? ((t.lyrics || '').trim().split(/\r?\n/).length + ' 行') : '未填写') + '</span>' +
          '</div>' +
        '</div>' +
      '</div>'
    ).join('');

    $$('.edit-card', box).forEach((card) => {
      const id = card.dataset.id;
      const idx = () => (store.get('music.tracks') || []).findIndex((x) => x.id === id);
      $$('input,textarea', card).forEach((el) => el.addEventListener('input', () => {
        const i = idx(); if (i < 0) return;
        local(() => store.update((d) => { d.music.tracks[i][el.dataset.f] = el.value; }));
        if (el.dataset.f === 'title') $('.edit-card__title', card).textContent = el.value || '未命名';
        updateCounters();
      }));
      $$('[data-act]', card).forEach((btn) => btn.addEventListener('click', async () => {
        const i = idx(); if (i < 0) return;
        const act = btn.dataset.act;
        if (act === 'preview') { previewTrack(store.get('music.tracks')[i]); return; }
        if (act === 'del') {
          const t = store.get('music.tracks')[i];
          await store.Audio.del(t.id);
          store.releaseURL(t.id);
          local(() => store.update((d) => d.music.tracks.splice(i, 1)));
        }
        if (act === 'up' && i > 0) local(() => store.update((d) => d.music.tracks.splice(i - 1, 0, d.music.tracks.splice(i, 1)[0])));
        if (act === 'down' && i < store.get('music.tracks').length - 1) local(() => store.update((d) => d.music.tracks.splice(i + 1, 0, d.music.tracks.splice(i, 1)[0])));
        renderTracks(); updateCounters();
      }));
    });
  }

  let previewAudio = null;
  async function previewTrack(track) {
    if (!track) return;
    if (previewAudio && !previewAudio.paused && previewAudio.dataset.id === track.id) {
      previewAudio.pause(); toast('已暂停试听'); return;
    }
    previewAudio = previewAudio || new Audio();
    const url = await store.audioURL(track);
    if (!url) return toast('音频文件不存在，请重新导入');
    previewAudio.src = url;
    previewAudio.dataset.id = track.id;
    previewAudio.play().then(() => toast('试听：' + (track.title || track.fileName))).catch(() => toast('浏览器拦截了播放，请再点一次'));
  }

  /** 导入音频：File → Blob 存 IndexedDB，元数据存 localStorage */
  async function importFiles(files) {
    const arr = Array.prototype.slice.call(files).filter((f) => /^audio\//.test(f.type) || /\.(mp3|wav|flac|m4a|aac|ogg|opus|wma)$/i.test(f.name));
    if (!arr.length) return toast('没有识别到音频文件');
    toast('正在导入 ' + arr.length + ' 个文件…');
    let ok = 0;
    for (const file of arr) {
      const id = uid('tk');
      const stored = await store.Audio.put(id, file);
      store.data.music.tracks.push({
        id: id,
        title: file.name.replace(/\.[^.]+$/, ''),
        artist: '',
        lyrics: '',
        fileName: file.name,
        size: file.size,
        hasAudio: true
      });
      if (stored) ok++;
    }
    local(() => store.save());
    renderTracks(); updateCounters(); updateStorage();
    toast('已导入 ' + ok + ' 首音乐' + (store.Audio.mode === 'memory' ? '（仅本次会话有效）' : ''));
  }

  function initMusic() {
    const input = $('#musicInput');
    const zone = $('#musicDrop');
    if (input) input.addEventListener('change', () => { importFiles(input.files); input.value = ''; });
    if (zone) {
      zone.addEventListener('click', () => input && input.click());
      ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('is-over'); }));
      ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('is-over'); }));
      zone.addEventListener('drop', (e) => {
        if (e.dataTransfer && e.dataTransfer.files) importFiles(e.dataTransfer.files);
      });
    }
    const clear = $('#musicClear');
    if (clear) clear.addEventListener('click', async () => {
      if (!confirm('确定清空整个曲库吗？此操作不可撤销。')) return;
      await store.Audio.clear();
      (store.get('music.tracks') || []).forEach((t) => store.releaseURL(t.id));
      local(() => store.set('music.tracks', []));
      renderTracks(); updateCounters(); updateStorage();
      toast('曲库已清空');
    });
  }

  /* --------------------------------------------------------------------------
   * 10. 数据：导出 / 导入 / 恢复默认 / 存储占用
   * ------------------------------------------------------------------------ */
  function updateStorage() {
    const box = $('#storageBox');
    if (!box) return;
    const text = JSON.stringify(store.data);
    const usedKB = Math.round(new Blob([text]).size / 1024);
    const avatarKB = store.get('profile.avatar') ? Math.round(store.get('profile.avatar').length / 1365) : 0;
    const musicMB = (store.get('music.tracks') || []).reduce((a, t) => a + (t.size || 0), 0) / 1048576;
    const maxKB = 5120;
    box.innerHTML = '' +
      row('文本数据', usedKB, maxKB, usedKB + ' KB', 'localStorage 上限约 5 MB') +
      row('头像图片', avatarKB, 512, avatarKB + ' KB', '已压缩为 400px 正方形') +
      row('音乐文件', Math.round(musicMB * 10) / 10, 500, (Math.round(musicMB * 10) / 10) + ' MB', 'IndexedDB 存储' + (store.Audio.mode === 'memory' ? '（当前为临时内存）' : ''));

    function row(label, val, max, text, hint) {
      const w = Math.min(100, Math.round(val / max * 100));
      return '<div class="storage-row">' +
        '<span title="' + hint + '">' + label + '</span>' +
        '<span class="storage-row__bar"><i style="--w:' + w + '%"></i></span>' +
        '<span>' + text + '</span>' +
      '</div>';
    }
  }

  function initData() {
    const exp = $('#exportBtn');
    if (exp) exp.addEventListener('click', () => {
      const blob = new Blob([store.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'homepage-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('已导出配置文件（不含音乐文件）');
    });

    const imp = $('#importInput');
    if (imp) imp.addEventListener('change', () => {
      const f = imp.files && imp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          local(() => store.importJSON(String(r.result)));
          syncFields(); renderAllLists(); updateStorage();
          toast('配置已导入');
        } catch (e) {
          toast('导入失败：不是有效的配置文件');
        }
      };
      r.readAsText(f);
      imp.value = '';
    });

    const rst = $('#resetBtn');
    if (rst) rst.addEventListener('click', () => {
      if (!confirm('恢复默认会清空所有已编辑的文字内容（音乐文件也会一并清除），确定继续吗？')) return;
      store.Audio.clear();
      local(() => store.reset());
      syncFields(); renderAllLists(); updateStorage();
      toast('已恢复默认设置');
    });

    const openHome = $('#openHome');
    if (openHome) openHome.addEventListener('click', () => { location.href = 'index.html'; });
  }

  /* --------------------------------------------------------------------------
   * 11. 计数与顶部状态
   * ------------------------------------------------------------------------ */
  function updateCounters() {
    const set = (sel, n) => { const el = $(sel); if (el) el.textContent = n; };
    set('#navCountSkills', (store.get('skills') || []).length);
    set('#navCountProjects', (store.get('projects') || []).length);
    set('#navCountTracks', (store.get('music.tracks') || []).length);
    const filled = ['wechat', 'qq', 'email', 'phone'].filter((k) => String(store.get('contact.' + k) || '').trim()).length;
    set('#navCountContact', filled + '/4');
    const bio = $('#bioCount');
    if (bio) bio.textContent = String(store.get('profile.bio') || '').length + ' 字';
    syncMiniThemes();
  }

  function renderAllLists() { renderSkills(); renderProjects(); renderTracks(); }

  /* --------------------------------------------------------------------------
   * 12. 初始化
   * ------------------------------------------------------------------------ */
  function init() {
    store.load();
    store.watchStorage();
    theme.init();

    initNav();
    initSegments();
    initAccent();
    initMiniThemes();
    initAvatar();
    initMusic();
    initData();
    bindFields();
    syncFields();
    renderAllLists();
    updateCounters();
    updateStorage();

    // 加号按钮：新增技能 / 新增项目
    const addS = $('#addSkill');
    if (addS) addS.addEventListener('click', addSkill);
    const addP = $('#addProject');
    if (addP) addP.addEventListener('click', addProject);

    // 默认音量滑杆（存储为 0~1 的小数）
    const vol = $('#volRange');
    if (vol) {
      vol.value = Math.round((Number(store.get('music.volume')) || .8) * 100);
      paint(vol);
      vol.addEventListener('input', () => {
        paint(vol);
        local(() => store.set('music.volume', Number(vol.value) / 100));
      });
    }

    // 顶部昼夜按钮
    const tg = $('#settingsThemeToggle');
    if (tg) {
      tg.innerHTML = '<span class="tm-ico tm-ico--sun">' + ICON_SUN + '</span>' +
                     '<span class="tm-ico tm-ico--moon">' + ICON_MOON + '</span>';
      tg.addEventListener('click', () => {
        const r = tg.getBoundingClientRect();
        const next = theme.current === 'dark' ? 'light' : 'dark';
        local(() => store.patch({ 'theme.mode': 'manual', 'theme.manual': next }));
        theme.apply(next, { animate: true, origin: { x: r.left + r.width / 2, y: r.top + r.height / 2 } });
        syncSegments(); syncMiniThemes();
      });
    }

    // 另一个标签页保存了数据 → 同步界面（不打断正在输入的框）
    store.on('change', () => {
      updateCounters();
      if (localEdit) return;
      syncFields();
      renderAllLists();
      updateStorage();
    });
    store.on('saved', flashSaved);
    store.on('warn', toast);

    // 离开前确保数据落盘
    window.addEventListener('beforeunload', () => store.save());

    // 主题自动模式的提示
    if (store.get('theme.mode') === 'auto') {
      const label = $('#autoHint');
      if (label) label.textContent = '当前每 30 秒检测一次系统时间，到点自动切换';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})(window, document);
