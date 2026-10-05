/* ============================================================================
 * main.js —— 个人主页逻辑
 * ----------------------------------------------------------------------------
 * 渲染顺序（自上而下）：个人简介 → 自身技能 → 个人项目 → 联系方式
 * 另有：左侧栏圆形头像+姓名、头像下方的音乐播放器与浮层歌词、左上角设置入口
 * ========================================================================== */
(function (window, document) {
  'use strict';

  const store = window.DSH.store;
  const theme = window.DSH.theme;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  /* --------------------------------------------------------------------------
   * 通用工具
   * ------------------------------------------------------------------------ */
  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ESC_MAP[m]);

  /** 轻提示由 store.js 统一提供，主页与设置页共用一套实现 */
  const toast = (msg) => window.DSH.ui.toast(msg);

  /** 只允许 http/https 链接，防止 javascript: 注入 */
  function safeUrl(u) {
    const v = String(u || '').trim();
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v;
    if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v)) return 'https://' + v;
    return '';
  }

  const fmtTime = (s) => {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
  };

  async function copyText(text, label) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      toast((label || '内容') + ' 已复制');
    } catch (e) {
      toast('复制失败，请手动选择文本');
    }
  }

  /* --------------------------------------------------------------------------
   * 图标库（内联 SVG，避免外部依赖）
   * ------------------------------------------------------------------------ */
  const ICONS = {
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8.9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 8.9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.35.4.65.74.85.3.17.63.26.97.26H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.3A8.6 8.6 0 0 1 9.7 3.5a8.6 8.6 0 1 0 10.8 10.8z"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.2c0-.9 1-1.4 1.7-.9l8.1 5.3c.7.4.7 1.4 0 1.8l-8.1 5.3c-.7.5-1.7 0-1.7-.9z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="5" width="3.6" height="14" rx="1.2"/><rect x="13.4" y="5" width="3.6" height="14" rx="1.2"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5.5a1 1 0 0 1 2 0v13a1 1 0 0 1-2 0z"/><path d="M18.4 5.9c.8-.5 1.8.1 1.8 1v10.2c0 .9-1 1.5-1.8 1l-7.2-5.1a1.2 1.2 0 0 1 0-2z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15 5.5a1 1 0 0 1 2 0v13a1 1 0 0 1-2 0z"/><path d="M5.6 5.9c-.8-.5-1.8.1-1.8 1v10.2c0 .9 1 1.5 1.8 1l7.2-5.1a1.2 1.2 0 0 0 0-2z"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h11M4 12h11M4 17h7"/><path d="M18.5 14.5v6M15.5 17.5h6"/></svg>',
    /* 循环模式三态图标：列表循环 / 单曲循环（带 1）/ 随机 */
    repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2.6 20.4 6 17 9.4"/><path d="M3.6 12.4V9.6A3.6 3.6 0 0 1 7.2 6h13.2"/><path d="M7 21.4 3.6 18 7 14.6"/><path d="M20.4 11.6v2.8a3.6 3.6 0 0 1-3.6 3.6H3.6"/></svg>',
    repeatOne: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2.6 20.4 6 17 9.4"/><path d="M3.6 12.4V9.6A3.6 3.6 0 0 1 7.2 6h13.2"/><path d="M7 21.4 3.6 18 7 14.6"/><path d="M20.4 11.6v2.8a3.6 3.6 0 0 1-3.6 3.6H3.6"/><text x="12" y="14.6" text-anchor="middle" font-size="8.4" font-weight="700" fill="currentColor" stroke="none">1</text></svg>',
    shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2.6 20.4 6 17 9.4"/><path d="M17 14.6 20.4 18 17 21.4"/><path d="M3.6 6h3.1c1.2 0 2.3.6 3 1.6l4.6 6.8c.7 1 1.8 1.6 3 1.6h3.1"/><path d="M3.6 18h3.1c1.2 0 2.3-.6 3-1.6l1-1.5"/><path d="M14.3 9.1l1-1.5c.7-1 1.8-1.6 3-1.6h2.1"/></svg>',
    volume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6.5 9H3v6h3.5L11 19z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg>',
    github: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/></svg>',
    wechat: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.1 3C5.1 3 1.9 5.7 1.9 9c0 1.9 1.1 3.6 2.8 4.7l-.7 2.1 2.4-1.2c.8.2 1.6.4 2.5.4h.6a5.3 5.3 0 0 1-.2-1.4c0-3.2 3.1-5.8 7-5.8h.6C16.2 5.1 13 3 9.1 3zm-2.6 3a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm5.2 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/><path d="M22.1 13.6c0-2.8-2.7-5-6-5s-6 2.2-6 5 2.7 5 6 5c.7 0 1.4-.1 2-.3l2 1-.6-1.7c1.6-.9 2.6-2.4 2.6-4zm-8-1.6a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8zm4 0a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8z"/></svg>',
    qq: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c3.3 0 5.6 2.5 5.6 6 0 .9.2 1.6.7 2.5 1 1.7 1.9 3.4 1.9 5.2 0 1.3-.5 2.2-1.3 2.2-.7 0-1.3-.6-1.8-1.5-.5.8-1.3 1.5-2.4 1.9l.5 1.2c.1.4-.1.7-.5.7H9.3c-.4 0-.6-.3-.5-.7l.5-1.2c-1.1-.4-1.9-1.1-2.4-1.9-.5.9-1.1 1.5-1.8 1.5-.8 0-1.3-.9-1.3-2.2 0-1.8.9-3.5 1.9-5.2.5-.9.7-1.6.7-2.5C6.4 4.5 8.7 2 12 2zm-2.2 6.1c-.6 0-1 .6-1 1.4s.4 1.4 1 1.4 1-.6 1-1.4-.4-1.4-1-1.4zm4.4 0c-.6 0-1 .6-1 1.4s.4 1.4 1 1.4 1-.6 1-1.4-.4-1.4-1-1.4z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.8" y="5" width="18.4" height="14" rx="3"/><path d="m4.5 8 6.4 4.4c.7.5 1.5.5 2.2 0L19.5 8"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6.6 3.5h2.2l1.5 3.7-1.9 1.2a11.4 11.4 0 0 0 5.2 5.2l1.2-1.9 3.7 1.5v2.2c0 1.5-1.2 2.7-2.7 2.6C9.6 17.6 6.4 14.4 4.9 7.1 4.6 5.4 5.2 3.5 6.6 3.5z"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>',
    music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V6.6l10-2.1V16"/><circle cx="6.5" cy="18" r="2.6"/><circle cx="16.5" cy="16" r="2.6"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.2 10.2 12.6 4.5 10.8 10.2 9z"/></svg>'
  };
  const svg = (name) => ICONS[name] || '';

  /* 循环模式：主页按钮与设置页分段控件共用同一份数据（store 的 music.loop） */
  const LOOP_MODES = [
    { id: 'list', name: '列表循环', icon: 'repeat' },
    { id: 'single', name: '单曲循环', icon: 'repeatOne' },
    { id: 'shuffle', name: '随机播放', icon: 'shuffle' }
  ];

  /* --------------------------------------------------------------------------
   * 1. 个人资料（左侧栏：圆形头像 + 姓名）
   * ------------------------------------------------------------------------ */
  function renderProfile(d) {
    const p = d.profile;
    const name = p.name || '你的名字';
    $('#profileName').textContent = name;
    $('#profileTitle').textContent = p.title || '';
    const motto = $('#profileMotto');
    motto.textContent = p.motto || '';
    $('#profileTitle').hidden = !p.title;

    const img = $('#avatarImg');
    const fb = $('#avatarFallback');
    if (p.avatar) {
      img.src = p.avatar;
      img.hidden = false;
      fb.hidden = true;
    } else {
      img.removeAttribute('src');
      img.hidden = true;
      fb.hidden = false;
      fb.textContent = name.slice(0, 1).toUpperCase();
    }
    document.title = name + ' · 个人主页';
  }

  /* --------------------------------------------------------------------------
   * 2. 个人简介（普通文本）
   * ------------------------------------------------------------------------ */
  function renderBio(d) {
    const el = $('#bioText');
    const text = (d.profile.bio || '').trim();
    el.textContent = text || '还没有写简介。点击左上角设置按钮 → 个人资料，写下你的故事。';
    el.classList.toggle('is-empty', !text);

    const meta = $('#bioMeta');
    const chips = [];
    if (d.profile.github) {
      const gh = safeUrl(d.profile.github);
      if (gh) chips.push('<a class="chip" href="' + esc(gh) + '" target="_blank" rel="noopener">' + svg('github') + 'GitHub</a>');
    }
    const skills = d.skills || [];
    if (skills.length) chips.push('<span class="chip">' + svg('spark') + skills.length + ' 项技能</span>');
    const projects = d.projects || [];
    if (projects.length) chips.push('<span class="chip">' + svg('pin') + projects.length + ' 个项目</span>');
    const tracks = (d.music && d.music.tracks) || [];
    if (tracks.length) chips.push('<span class="chip">' + svg('music') + tracks.length + ' 首音乐</span>');
    meta.innerHTML = chips.join('');
    meta.hidden = chips.length === 0;
  }

  /* --------------------------------------------------------------------------
   * 3. 自身技能（毛玻璃卡片 + 网格合并）
   *    尺寸对应 CSS 里的 grid-column/grid-row span，实现单元格合并
   * ------------------------------------------------------------------------ */
  const SIZE_LABEL = { normal: '标准单元格', wide: '横向合并 2 列', tall: '纵向合并 2 行', big: '2×2 合并四格' };

  function renderSkills(d) {
    const grid = $('#skillsGrid');
    const list = d.skills || [];
    const count = $('#skillCount');
    if (count) count.textContent = list.length ? list.length + ' 项' : '';
    if (!list.length) {
      grid.innerHTML = '<div class="skills-empty">还没有技能标签<br>在「设置 → 自身技能」里点 ＋ 添加</div>';
      return;
    }
    grid.innerHTML = list.map((s, i) => {
      const lv = Math.max(0, Math.min(100, Number(s.level) || 0));
      return '' +
        '<article class="skill-card reveal" data-size="' + esc(s.size || 'normal') + '" style="--i:' + i + '" title="' + esc(SIZE_LABEL[s.size] || '') + '">' +
          '<div>' +
            '<div class="skill-card__title">' + esc(s.title || '未命名技能') + '</div>' +
            (s.desc ? '<div class="skill-card__desc">' + esc(s.desc) + '</div>' : '') +
          '</div>' +
          '<div>' +
            '<div class="skill-card__bar"><i style="--lv:' + lv + '%"></i></div>' +
            '<div class="skill-card__level">熟练度 ' + lv + '%</div>' +
          '</div>' +
        '</article>';
    }).join('');
  }

  /* --------------------------------------------------------------------------
   * 4. 个人项目（点击毛玻璃卡片 → 我的 GitHub 主页）
   * ------------------------------------------------------------------------ */
  function renderProjects(d) {
    const grid = $('#projectsGrid');
    const list = d.projects || [];
    const home = safeUrl(d.profile.github);
    const ghLink = $('#githubHome');
    if (ghLink) {
      ghLink.href = home || '#';
      ghLink.hidden = !home;
      ghLink.innerHTML = svg('github') + '我的 GitHub';
    }
    if (!list.length) {
      grid.innerHTML = '<div class="projects-empty">还没有项目<br>在「设置 → 个人项目」里点 ＋ 添加</div>';
      return;
    }
    grid.innerHTML = list.map((p, i) => {
      const target = safeUrl(p.link) || home || '';
      const tags = (p.tags || []).filter(Boolean).map((t) => '<span class="tag">' + esc(t) + '</span>').join('');
      return '' +
        '<article class="project-card reveal" style="--i:' + i + '" data-href="' + esc(target) + '" tabindex="0" role="link" ' +
          'aria-label="' + esc((p.name || '项目') + '，点击前往 GitHub') + '">' +
          '<div class="project-card__top">' +
            '<div class="project-card__name">' + esc(p.name || '未命名项目') + '</div>' +
            '<span class="project-card__arrow">' + svg('arrow') + '</span>' +
          '</div>' +
          (p.desc ? '<p class="project-card__desc">' + esc(p.desc) + '</p>' : '') +
          (tags ? '<div class="project-card__tags">' + tags + '</div>' : '') +
          (target ? '<span class="project-card__gh">' + svg('github') + '点击跳转 GitHub</span>' : '') +
        '</article>';
    }).join('');
  }

  const CONTACTS = [
    { key: 'wechat', label: 'WeChat', name: '微信', icon: 'wechat' },
    { key: 'qq', label: 'QQ', name: 'QQ', icon: 'qq' },
    { key: 'email', label: 'Email', name: '邮箱', icon: 'mail' },
    { key: 'phone', label: 'Phone', name: '电话', icon: 'phone' }
  ];

  /* --------------------------------------------------------------------------
   * 5. 联系方式（微信 / QQ / 邮箱 / 电话）
   * ------------------------------------------------------------------------ */
  function renderContact(d) {
    const grid = $('#contactGrid');
    grid.innerHTML = CONTACTS.map((c, i) => {
      const val = String((d.contact && d.contact[c.key]) || '').trim();
      const empty = !val;
      return '' +
        '<article class="contact-card reveal' + (empty ? ' is-empty' : '') + '" style="--i:' + i + '" ' +
          'data-key="' + c.key + '" data-value="' + esc(val) + '" data-label="' + esc(c.name) + '" ' +
          (empty ? '' : 'tabindex="0" role="button"') + '>' +
          '<span class="contact-card__icon">' + svg(c.icon) + '</span>' +
          '<div class="contact-card__body">' +
            '<div class="contact-card__label">' + esc(c.label) + '</div>' +
            '<div class="contact-card__value' + (empty ? ' is-empty' : '') + '">' + esc(empty ? '未填写' : val) + '</div>' +
          '</div>' +
          (empty ? '' : '<span class="contact-card__copy">点击复制</span>') +
        '</article>';
    }).join('');
  }

  /* --------------------------------------------------------------------------
   * 6. 音乐播放器 + 歌词
   * ------------------------------------------------------------------------ */
  const player = {
    audio: null,
    index: -1,
    tracks: [],
    lines: [],
    lineIndex: -1,
    lineH: 33,
    playing: false,

    init() {
      this.audio = $('#audio');
      this.audio.volume = Number(store.get('music.volume')) || .8;

      $('#playBtn').addEventListener('click', () => this.toggle());
      $('#prevBtn').addEventListener('click', () => this.prev());
      $('#nextBtn').addEventListener('click', () => this.next());
      $('#listBtn').addEventListener('click', () => this.togglePlaylist());
      $('#loopBtn').addEventListener('click', () => this.cycleLoop());   // 主页直接切循环模式

      const seek = $('#seek');
      seek.addEventListener('input', () => {
        if (!this.audio.duration) return;
        const p = Number(seek.value) / 1000;
        this.audio.currentTime = p * this.audio.duration;
        this.paintRange(seek, p * 100);
      });

      const vol = $('#volume');
      vol.addEventListener('input', () => {
        const v = Number(vol.value) / 100;
        this.audio.volume = v;
        this.paintRange(vol, v * 100);
        // 直接写数据 + 落盘：不走 set()，避免每次拖动音量都触发整页重渲染
        store.data.music.volume = v;
        store.save();
      });

      this.audio.addEventListener('timeupdate', () => this.onTime());
      this.audio.addEventListener('loadedmetadata', () => {
        $('#dur').textContent = fmtTime(this.audio.duration);
        // 纯文本歌词需要按总时长均分，此时才知道真实时长 → 重新解析一次
        const t = this.currentTrack();
        if (t) this.renderLyrics(t);
      });
      this.audio.addEventListener('play', () => this.setPlayingUI(true));
      this.audio.addEventListener('pause', () => this.setPlayingUI(false));
      this.audio.addEventListener('ended', () => this.onEnded());
      this.audio.addEventListener('error', () => {
        if (this.audio.src) toast('这首音乐无法播放，可能文件已被清理');
        this.setPlayingUI(false);
      });

      // 全局快捷键：空格 播放/暂停（输入框内不触发）
      document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && !/input|textarea|select/i.test(document.activeElement.tagName)) {
          e.preventDefault();
          this.toggle();
        }
      });

      vol.value = Math.round((this.audio.volume || .8) * 100);
      this.paintRange(vol, (this.audio.volume || .8) * 100);
      this.paintRange(seek, 0);
    },

    paintRange(el, pct) {
      if (el) el.style.setProperty('--p', Math.max(0, Math.min(100, pct)) + '%');
    },

    setTracks(tracks, keepIndex) {
      const prevId = keepIndex && this.tracks[this.index] ? this.tracks[this.index].id : null;
      this.tracks = tracks.slice();
      if (prevId) {
        const i = this.tracks.findIndex((t) => t.id === prevId);
        this.index = i >= 0 ? i : (this.tracks.length ? 0 : -1);
      } else if (this.index >= this.tracks.length) {
        this.index = this.tracks.length ? 0 : -1;
      }
      if (this.index < 0 && this.tracks.length) this.index = 0;   // 默认选中第一首（但不自动播放）
      this.renderPlaylist();
      this.renderCurrent();
    },

    currentTrack() { return this.tracks[this.index] || null; },

    async load(i, autoplay) {
      if (!this.tracks.length) { this.renderCurrent(); return; }
      this.index = (i + this.tracks.length) % this.tracks.length;
      const track = this.currentTrack();
      const url = await store.audioURL(track);
      this.renderCurrent();
      this.renderLyrics(track);
      if (!url) {
        const t = this.currentTrack();
        toast(t && !t.src && !t.hasAudio
          ? '这首还没有音频源，去「设置 → 音乐」导入，或填写音频地址'
          : '音频文件不在本机，请重新导入或改用音频地址');
        this.setPlayingUI(false);
        return;
      }
      this.audio.src = url;
      this.audio.load();
      if (autoplay !== false) {
        try { await this.audio.play(); } catch (e) { this.setPlayingUI(false); }
      }
    },

    play() {
      if (!this.tracks.length) { toast('还没有音乐，去设置里导入吧'); return; }
      if (this.index < 0 || !this.audio.src) { this.load(0, true); return; }
      this.audio.play().catch(() => {});
    },
    pause() { this.audio.pause(); },
    toggle() { this.audio.paused ? this.play() : this.pause(); },
    next(auto) { if (this.tracks.length) this.load(this.index + 1, true); },
    prev() {
      if (!this.tracks.length) return;
      // 播放超过 3 秒时，"上一首"先回到本曲开头（更符合直觉）
      if (this.audio.currentTime > 3 && !this.audio.paused) { this.audio.currentTime = 0; return; }
      this.load(this.index - 1, true);
    },

    onEnded() {
      const mode = store.get('music.loop');
      if (mode === 'single') { this.audio.currentTime = 0; this.audio.play(); return; }
      if (mode === 'shuffle' && this.tracks.length > 1) {
        let n = this.index;
        while (n === this.index) n = Math.floor(Math.random() * this.tracks.length);
        this.load(n, true);
        return;
      }
      this.load(this.index + 1, true);
    },

    setPlayingUI(on) {
      this.playing = on;
      const btn = $('#playBtn');
      btn.innerHTML = on ? svg('pause') : svg('play');
      btn.classList.toggle('is-playing', on);
      btn.setAttribute('aria-label', on ? '暂停' : '播放');
      $('#disc').classList.toggle('is-playing', on);
      $$('#playlist .playlist__item').forEach((el, i) => el.classList.toggle('is-active', i === this.index));
    },

    onTime() {
      const a = this.audio;
      if (!a.duration) return;
      const pct = (a.currentTime / a.duration) * 100;
      this.paintRange($('#seek'), pct);
      $('#seek').value = Math.round(pct * 10);
      $('#cur').textContent = fmtTime(a.currentTime);
      this.syncLyrics(a.currentTime);
    },

    renderCurrent() {
      const t = this.currentTrack();
      $('#songTitle').textContent = t ? (t.title || t.fileName || '未命名') : '未加载音乐';
      $('#songArtist').textContent = t ? (t.artist || '未知歌手') : (this.tracks.length ? '选择一首开始播放' : store.get('music.emptyText'));
      this.updateLoopUI();
    },

    /* ---- 循环模式：列表 → 单曲 → 随机，主页按钮与设置页分段控件共用一份数据 ---- */
    cycleLoop() {
      const modes = LOOP_MODES.map((m) => m.id);
      const cur = String(store.get('music.loop') || 'list');
      const next = modes[(modes.indexOf(cur) + 1) % modes.length];
      store.set('music.loop', next);
      this.updateLoopUI();
      const hit = LOOP_MODES.filter((m) => m.id === next)[0];
      toast('循环模式：' + hit.name);
      return next;
    },

    updateLoopUI() {
      const btn = $('#loopBtn');
      if (!btn) return;
      const cur = String(store.get('music.loop') || 'list');
      const hit = LOOP_MODES.filter((m) => m.id === cur)[0] || LOOP_MODES[0];
      btn.innerHTML = svg(hit.icon);
      btn.title = '循环模式：' + hit.name + '（点击切换）';
      btn.setAttribute('aria-label', '循环模式：' + hit.name);
      btn.classList.toggle('is-on', cur !== 'list');   // 非默认模式时点亮，一眼看出状态
    },

    renderPlaylist() {
      const box = $('#playlist');
      if (!this.tracks.length) {
        box.innerHTML = '<div class="playlist__empty">播放列表是空的<br>去「设置 → 音乐」导入本地音乐</div>';
        return;
      }
      box.innerHTML = this.tracks.map((t, i) =>
        '<div class="playlist__item' + (i === this.index ? ' is-active' : '') + '" data-index="' + i + '">' +
          '<span class="playlist__no">' + (i + 1) + '</span>' +
          '<span class="playlist__name">' + esc(t.title || t.fileName || '未命名') + '</span>' +
          '<span class="playlist__no">' + esc(t.artist || '') + '</span>' +
        '</div>'
      ).join('');
      $$('#playlist .playlist__item').forEach((el) => {
        el.addEventListener('click', () => this.load(Number(el.dataset.index), true));
      });
    },

    togglePlaylist() {
      const box = $('#playlist');
      box.hidden = !box.hidden;
    },

    /* ---- 歌词解析与滚动 ---- */
    parseLyrics(raw, duration) {
      const out = [];
      if (!raw || !String(raw).trim()) return out;
      const lines = String(raw).split(/\r?\n/);
      const plain = [];
      let hasTime = false;
      lines.forEach((line) => {
        // 注意：matchAll 返回的是迭代器（没有 length），必须用 Array.from / 展开运算符，
        // 用 Array.prototype.slice.call(iterator) 会永远得到空数组，导致 LRC 时间轴被忽略。
        const stamps = Array.from(line.matchAll(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g));
        const text = line.replace(/\[[^\]]*\]/g, '').trim();
        if (stamps.length) {
          hasTime = true;
          stamps.forEach((m) => {
            const min = Number(m[1]);
            const sec = Number(m[2]);
            const ms = m[3] ? Number((m[3] + '00').slice(0, 3)) : 0;
            out.push({ time: min * 60 + sec + ms / 1000, text: text });
          });
        } else if (text) {
          plain.push(text);
        }
      });

      if (!hasTime) {
        // 纯文本歌词：按总时长均匀铺开，也能跟着滚动
        out.length = 0;
        const total = isFinite(duration) && duration > 0 ? duration : plain.length * 4.5;
        const step = plain.length ? Math.max(2.6, total / (plain.length + 1)) : 4;
        plain.forEach((text, i) => out.push({ time: step * i, text: text }));
      }
      return out.sort((a, b) => a.time - b.time);
    },

    renderLyrics(track) {
      const wrap = $('#lyricViewport');
      const showLyrics = store.get('music.showLyrics');
      const panel = $('#lyricsPanel');
      if (panel) panel.hidden = !showLyrics;
      if (!showLyrics) return;

      if (!track) {
        wrap.innerHTML = '<div class="lyric-empty">播放音乐后，歌词会在这里浮现</div>';
        this.lines = []; this.lineIndex = -1;
        return;
      }
      this.lines = this.parseLyrics(track.lyrics, this.audio.duration);
      this.lineIndex = -1;

      if (!this.lines.length) {
        wrap.innerHTML = '<div class="lyric-empty">♪ ' + esc(track.title || '纯音乐') + '<br>还没有歌词，可在设置 → 音乐里粘贴</div>';
        return;
      }
      // 顶部内边距由 CSS 变量给出（0 = 当前句贴顶，上一句被裁到视口外）
      const pad = parseFloat(getComputedStyle(wrap).getPropertyValue('--lyric-top-pad')) || 0;
      wrap.innerHTML = '<div class="lyrics__track" id="lyricTrack" style="padding:' + pad + 'px 0">' +
        this.lines.map((l, i) => '<div class="lyric-line" data-i="' + i + '">' + (esc(l.text) || '·') + '</div>').join('') +
        '</div>';
      $('#lyricHint').textContent = this.lines.length + ' 行';
      this.syncLyrics(this.audio.currentTime || 0, true);
    },

    syncLyrics(t, force) {
      if (!this.lines.length) return;
      let idx = -1;
      for (let i = 0; i < this.lines.length; i++) {
        if (t + 0.15 >= this.lines[i].time) idx = i; else break;
      }
      if (idx === this.lineIndex && !force) return;
      this.lineIndex = idx;

      const track = $('#lyricTrack');
      if (track) {
        // 轨道上方已用 padding 预留了半屏，所以只需按行高向上平移
        const y = -Math.max(0, idx) * this.lineH;
        track.style.transform = 'translateY(' + y + 'px)';
      }
      $$('#lyricViewport .lyric-line').forEach((el) => {
        const i = Number(el.dataset.i);
        // 只让「当前句」和「下一句（常见为翻译行）」完整显示；
        // 上一句直接隐藏，其余（更远的）保持虚化
        el.classList.toggle('is-active', i === idx);
        el.classList.toggle('is-next', i === idx + 1);
        el.classList.toggle('is-prev', i === idx - 1);
      });
    }
  };

  /* --------------------------------------------------------------------------
   * 7. 交互增强：卡片光斑、按压涟漪、点击跳转、复制、滚动渐入
   * ------------------------------------------------------------------------ */

  /* 卡片光斑：把指针位置写进 --mx / --my，卡片上的柔光会跟着鼠标走 */
  function bindCardEffects() {
    document.addEventListener('pointermove', (e) => {
      const card = e.target.closest && e.target.closest('.skill-card, .project-card, .contact-card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });
  }

  /**
   * 新拟态按压涟漪
   * ---------------------------------------------------------------------------
   * 新拟态的「按下去」是由 box-shadow 从外阴影翻转成内阴影完成的，很快（约 120ms），
   * 但视觉上只发生在边缘，手指/鼠标落点本身没有任何反馈。
   * 这里在落点补一圈水波：它和新拟态的凹陷是同一个隐喻 —— 表面被压下去、
   * 涟漪从受力点向外散开。苹果在 iOS 的按钮与列表项上用的也是同一套手感。
   *
   * 实现要点：
   *   · 用一个 document 级委托，覆盖主页与设置页所有可点控件，无需逐个绑定；
   *   · 只对「确实有边框圆角」的控件生效，命中列表写死，避免误伤正文链接；
   *   · 波纹节点在动画结束后自行移除，不长期占用 DOM。
   */
  const RIPPLE_SEL = '.btn, .icon-btn, .ctrl, .seg__item, .s-nav__item, .chip,' +
                     '.add-btn, .playlist__item, .color-dot, .theme-mini';

  function spawnRipple(e) {
    const host = e.target.closest && e.target.closest(RIPPLE_SEL);
    if (!host || host.disabled) return;
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    // 以落点为圆心、以「到最远角的距离」为半径，保证波纹能铺满整个控件
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    // 键盘触发（回车/空格）时 clientX/Y 恒为 0，这时退化为从控件中心扩散
    const cx = (e.clientX || e.detail === 0) ? x : r.width / 2;
    const cy = (e.clientY || e.detail === 0) ? y : r.height / 2;
    const radius = Math.hypot(Math.max(cx, r.width - cx), Math.max(cy, r.height - cy));

    const wave = document.createElement('span');
    wave.className = 'press-wave';
    wave.setAttribute('aria-hidden', 'true');
    wave.style.setProperty('--pw-x', cx + 'px');
    wave.style.setProperty('--pw-y', cy + 'px');
    wave.style.setProperty('--pw-r', radius + 'px');
    host.appendChild(wave);
    setTimeout(() => wave.remove(), 620);
  }

  function bindPressRipple() {
    document.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;                       // 只响应左键
      if (!store.get('theme.motion')) return;           // 设置里关掉动效就完全不插 DOM
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      spawnRipple(e);
    }, { passive: true });
  }

  function bindDelegates() {
    // 项目卡片：点击 / 回车 → 跳转 GitHub
    document.addEventListener('click', (e) => {
      const card = e.target.closest && e.target.closest('.project-card');
      if (!card) return;
      const href = card.dataset.href;
      if (href) open(href);
      else toast('请先在设置 → 个人资料 里填写 GitHub 主页地址');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const card = e.target.closest && e.target.closest('.project-card, .contact-card');
      if (card) card.click();
    });
    // 联系方式卡片：点击复制
    document.addEventListener('click', (e) => {
      const card = e.target.closest && e.target.closest('.contact-card');
      if (!card) return;
      const val = card.dataset.value;
      if (val) copyText(val, card.dataset.label);
      else toast('这项联系方式还没填写，去设置里补上吧');
    });
  }

  /** 滚动渐入：只对首屏之外的元素生效 */
  function observeReveal() {
    if (!store.get('ui.reveal')) {
      $$('.reveal').forEach((el) => el.classList.add('is-in'));
      return;
    }
    if (!('IntersectionObserver' in window)) {
      $$('.reveal').forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    },
    // 只要露头就浮现：原来是 -8% 底边 + 8% 面积阈值，
    // 结果"在首屏底部只露出一部分"的板块（最典型的就是最下面的联系方式）
    // 会一直停在 opacity:0，屏幕上留下一块看不见的空白，要再滚一下才突然冒出来。
    { rootMargin: '0px', threshold: 0 });
    $$('.reveal:not(.is-in)').forEach((el) => io.observe(el));
  }

  /**
   * 立刻浮现：不等滚动就给元素加 is-in。
   * 隔两帧再加，好让 CSS 的淡入/上浮过渡真的播出来，而不是硬切。
   */
  function revealNow(selector) {
    const scope = typeof selector === 'string' ? $(selector) : selector;
    if (!scope) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (scope.classList && scope.classList.contains('reveal')) scope.classList.add('is-in');
      $$('.reveal', scope).forEach((el) => el.classList.add('is-in'));
    }));
  }

  /* --------------------------------------------------------------------------
   * 8. 渲染总入口
   * ---------------------------------------------------------------------------
   * ★ 按板块比对数据指纹，只有真的变了才重建 DOM。
   *   否则每次 store 变动（切循环模式、切昼夜、拖音量…）都会把右侧卡片
   *   整块重建 —— 新节点带着 .reveal 的初始态（opacity:0 + 下移 22px），
   *   于是整片内容又"刷新浮起"一次，看起来像页面在闪。
   * ------------------------------------------------------------------------ */
  const SIGS = Object.create(null);
  function renderWhenChanged(key, payload, fn) {
    let sig;
    try { sig = JSON.stringify(payload); } catch (e) { sig = null; }
    if (sig !== null && SIGS[key] === sig) return false;
    SIGS[key] = sig;
    fn();
    return true;
  }

  let firstRender = true;
  function renderAll() {
    const d = store.data;

    renderWhenChanged('profile',
      [d.profile.name, d.profile.title, d.profile.motto, d.profile.avatar],
      () => renderProfile(d));

    renderWhenChanged('bio',
      [d.profile.bio, d.profile.github, (d.skills || []).length, (d.projects || []).length, (d.music.tracks || []).length],
      () => renderBio(d));

    renderWhenChanged('skills', d.skills, () => renderSkills(d));
    renderWhenChanged('projects', [d.projects, d.profile.github], () => renderProjects(d));
    renderWhenChanged('contact', d.contact, () => renderContact(d));

    // 播放器：只有曲库真的变了才重建列表（并且保留播放列表抽屉的开合状态）
    renderWhenChanged('tracks', (d.music && d.music.tracks) || [], () => {
      player.setTracks((d.music && d.music.tracks) || [], !firstRender);
    });
    // 歌词只在「换歌 / 改歌词 / 切换显示」时重建，避免重置滚动位置
    const cur = player.currentTrack();
    renderWhenChanged('lyrics',
      [cur && cur.id, cur && cur.lyrics, store.get('music.showLyrics')],
      () => player.renderLyrics(cur));
    // 循环模式可能在设置页被改，这里同步主页按钮
    renderWhenChanged('loop', store.get('music.loop'), () => player.updateLoopUI());

    observeReveal();
    // ★ 联系方式板块不等滚动：页面一渲染就让它浮现（它位于页面最底部，
    //   若交给滚动观察，首屏底部会先留一块看不见的空白）
    revealNow('#sec-contact');
    firstRender = false;
  }

  function init() {
    store.load();
    store.watchStorage();
    theme.init();
    player.init();
    bindCardEffects();
    bindPressRipple();
    bindDelegates();

    // 主题按钮
    const toggleBtn = $('#themeToggle');
    toggleBtn.innerHTML =
      '<span class="tm-ico tm-ico--sun">' + svg('sun') + '</span>' +
      '<span class="tm-ico tm-ico--moon">' + svg('moon') + '</span>' +
      '<span class="auto-badge">AUTO</span>';
    toggleBtn.addEventListener('click', (e) => {
      const r = toggleBtn.getBoundingClientRect();
      theme.toggle({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    });
    $('#settingsBtn').innerHTML = svg('settings');
    $('#listBtn').innerHTML = svg('list');
    $('#prevBtn').innerHTML = svg('prev');
    $('#nextBtn').innerHTML = svg('next');
    $('#volumeIco').innerHTML = svg('volume');
    $('#playBtn').innerHTML = svg('play');

    renderAll();

    // ★ 部署到 GitHub Pages 后，访客浏览器里没有任何本地数据：
    //   这里自动装载仓库根目录的 content.json，让线上显示效果与作者本地一致。
    store.loadSiteContent().then((seeded) => {
      if (seeded) toast('已载入站点预设内容');
    });

    // 设置页在另一个标签页保存 → 这里实时刷新
    store.on('change', () => { renderAll(); });
    store.on('warn', (msg) => toast(msg));

    // 首屏自动播放（用户允许时才尝试，浏览器可能拦截，属正常现象）
    if (store.get('music.autoplay') && (store.get('music.tracks') || []).length) {
      setTimeout(() => player.load(0, true), 800);
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  // 调试/扩展入口：在控制台可用 DSH.player 查看或控制播放器
  window.DSH.player = player;
})(window, document);
