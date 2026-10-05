/* ============================================================================
 * store.js —— 数据层（全局数据仓库）
 * ----------------------------------------------------------------------------
 * 职责：
 *   1. 定义「个人主页」的全部默认数据（未编辑状态下的占位内容）
 *   2. 统一读写 localStorage（文本类数据），并做深度合并，保证后续版本升级不丢字段
 *   3. 提供 IndexedDB 音乐仓库（音频是二进制大文件，不能塞进 localStorage）
 *   4. 提供订阅 / 广播机制：主页与设置页分属两个标签页，靠 storage 事件实时同步
 *   5. ★ 站点默认内容：部署到 GitHub Pages 后，访客的浏览器里没有任何本地数据，
 *      页面会退化成占位模板。因此支持读取仓库里的 content.json 作为「站点内容」，
 *      首次访问自动载入，保证线上显示效果和作者本地完全一致。
 *
 * 说明：本文件为传统脚本（非 ES Module），因为直接用 file:// 双击打开时
 *       ES Module 会被浏览器以 CORS 策略拦截；用全局对象 window.DSH.store 暴露接口。
 * ========================================================================== */
(function (window) {
  'use strict';

  const LS_KEY = 'dsh.home.v1';        // localStorage 键名（文本数据）
  const META_KEY = 'dsh.home.meta.v1'; // 本地元信息（是否被访客改过、已装载的站点内容版本）
  const SITE_CONTENT = 'content.json'; // 站点默认内容文件名（放在仓库根目录）
  const DB_NAME = 'dsh-home-db';  // IndexedDB 库名（音频二进制）
  const DB_VER = 1;
  const STORE_AUDIO = 'audio';

  /* --------------------------------------------------------------------------
   * 1. 默认数据 —— 这就是「未进行文本编辑过」的初始状态
   * ------------------------------------------------------------------------ */
  function defaultData() {
    return {
      version: 1,

      /* ---- 主题设置：手动按钮切换 / 跟随电脑时间自动切换 ---- */
      theme: {
        mode: 'auto',          // 'manual' 手动按钮一键切换 | 'auto' 根据电脑时间自动切换
        manual: 'light',       // 手动模式下当前主题：'light' 白天 | 'dark' 黑夜
        dayStart: 7,           // 白天开始（0-23 点）
        nightStart: 19,        // 黑夜开始（0-23 点），与 dayStart 相同表示不切换

        /* 配色：默认「原生新拟物」= 完全使用 css/theme.css 里作者写的那套新拟态配色 */
        accent: '#0071e3',     // 强调色（Apple 系统蓝）
        radius: 22,            // 圆角
        preset: 'native',      // 配色预设：native | apple | warm | graphite | midnight | custom
        customColor: {         // 仅当 preset = 'custom' 时生效（白天 / 黑夜各一套）
          light: { bg: '#e8edf5', text: '#0b0d12' },
          dark:  { bg: '#14161c', text: '#f2f4f8' }
        },
        // 说明：毛玻璃强度已下线（新拟态皮肤不再需要调节模糊），--blur 改为 CSS 固定值

        motion: true,          // 是否开启切换动效
        duration: 620,         // 动效时长(ms)
        effect: 'ripple'       // 切换特效：ripple 波纹 | wipe 圆形擦除 | fade 淡入淡出
      },

      /* ---- 个人资料：左侧栏圆形头像 + 姓名 ---- */
      profile: {
        name: '你的名字',
        title: '一句话介绍你自己',
        motto: '',
        avatar: '',                                   // 头像（压缩后的 dataURL，可直接存 localStorage）
        bio: '这里还是空的。\n点击左上角的设置按钮，写下属于你的个人简介 —— 你的经历、你在做的事、以及你想遇见的人。',
        github: 'https://github.com/'                 // 个人项目卡片点击后跳转的 GitHub 主页
      },

      /* ---- 自身技能：可在设置里用「加号按钮」无限新增 ---- */
      skills: [
        { id: 's1', title: 'HTML / CSS', desc: '语义化结构与现代布局', size: 'normal', level: 90 },
        { id: 's2', title: 'JavaScript', desc: '原生交互、动效与数据流', size: 'wide', level: 85 },
        { id: 's3', title: 'UI 设计', desc: '简约现代的视觉语言', size: 'tall', level: 78 },
        { id: 's4', title: '待补充技能', desc: '在设置 → 自身技能里点「+」新增', size: 'normal', level: 60 }
      ],

      /* ---- 个人项目：点击毛玻璃卡片跳转 GitHub 主页 ---- */
      projects: [
        {
          id: 'p1',
          name: '示例项目 · 待编辑',
          desc: '在这里写项目的一句话介绍。点击这张卡片会打开你的 GitHub 主页（可在设置里修改地址）。',
          tags: ['Web', 'Demo'],
          link: ''
        },
        {
          id: 'p2',
          name: '第二个项目',
          desc: '项目描述支持多行文本，卡片按毛玻璃风格展示，悬停有光斑跟随效果。',
          tags: ['OpenSource'],
          link: ''
        }
      ],

      /* ---- 联系方式：微信 / QQ / 邮箱 / 电话 ---- */
      contact: {
        wechat: '',
        qq: '',
        email: '',
        phone: ''
      },

      /* ---- 音乐播放器 ---- */
      music: {
        // { id, title, artist, lyrics, src(可选：仓库内/外链音频地址), fileName, size, hasAudio }
        tracks: [],
        volume: 0.8,
        autoplay: false,
        loop: 'list',               // list 列表循环 | single 单曲循环 | shuffle 随机
        showLyrics: true,
        emptyText: '还没有音乐 · 去设置里导入'
      },

      /* ---- 界面微调 ---- */
      ui: {
        reveal: true                // 滚动渐入动画
      }
    };
  }

  /* --------------------------------------------------------------------------
   * 2. 小工具
   * ------------------------------------------------------------------------ */
  const uid = (prefix) => (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  /** 深度合并：以 defaults 为骨架，用 saved 覆盖，缺失字段自动补齐 */
  function mergeDeep(defaults, saved) {
    if (Array.isArray(defaults)) return Array.isArray(saved) ? saved : defaults.slice();
    if (!isPlainObject(defaults)) return saved === undefined ? defaults : saved;
    const out = {};
    Object.keys(defaults).forEach((k) => { out[k] = mergeDeep(defaults[k], isPlainObject(saved) ? saved[k] : undefined); });
    if (isPlainObject(saved)) {
      Object.keys(saved).forEach((k) => { if (!(k in out)) out[k] = saved[k]; });
    }
    return out;
  }

  /** 按 "a.b.c" 路径读值 */
  function getPath(obj, path) {
    return String(path).split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
  }

  /** 按 "a.b.c" 路径写值 */
  function setPath(obj, path, value) {
    const keys = String(path).split('.');
    const last = keys.pop();
    let cur = obj;
    keys.forEach((k) => {
      if (!isPlainObject(cur[k]) && !Array.isArray(cur[k])) cur[k] = {};
      cur = cur[k];
    });
    cur[last] = value;
    return obj;
  }

  /* --------------------------------------------------------------------------
   * 3. localStorage 读写（失败时降级为内存存储，保证页面不崩）
   * ------------------------------------------------------------------------ */
  let memoryFallback = null;   // file:// 或隐私模式下 localStorage 可能不可用

  function readLS() {
    if (memoryFallback) return memoryFallback;
    try {
      const raw = window.localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn('[store] localStorage 不可用，已降级为内存存储：', err);
      return null;
    }
  }

  function writeLS(obj) {
    if (memoryFallback) { memoryFallback = obj; return; }
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(obj));
    } catch (err) {
      console.warn('[store] 写入 localStorage 失败，已降级为内存存储：', err);
      memoryFallback = obj;
      store.emit('warn', '浏览器未开放本地存储，本次编辑仅在当前标签页有效');
    }
  }

  /* 元信息：dirty（本地「内容」是否被手动改过）、seededAt（已装载的站点内容版本） */
  function readMeta() {
    try { return JSON.parse(window.localStorage.getItem(META_KEY)) || {}; }
    catch (err) { return {}; }
  }
  function writeMeta(meta) {
    try { window.localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (err) { /* 忽略 */ }
  }

  /* --------------------------------------------------------------------------
   * 2.9 「内容」与「个性化设置」的边界
   * ---------------------------------------------------------------------------
   * ★ 这里踩过一个坑：以前 set/patch/update 一律把 dirty 置为 true，
   *   而只要 dirty 为 true，loadSiteContent() 就永远不再装载仓库里的 content.json。
   *   于是访客（包括作者自己在线上）随手切一下昼夜、换个循环模式，
   *   整份 content.json 就被永久拒之门外 —— 主页右侧只剩内置示例内容。
   *   现在只有真的改了「资料 / 技能 / 项目 / 联系方式 / 曲库」才算改过内容；
   *   主题、昼夜、音量、循环模式这些个性化偏好不影响装载。
   * ------------------------------------------------------------------------ */
  function isContentPath(path) {
    const p = String(path || '');
    return /^(profile|skills|projects|contact)(\.|$)/.test(p) || /^music\.tracks(\.|$)/.test(p);
  }
  /** 站点内容指纹：不含 theme / ui / 播放偏好 */
  function contentSignature(d) {
    if (!d) return '';
    return JSON.stringify([d.profile, d.skills, d.projects, d.contact, (d.music && d.music.tracks) || []]);
  }
  /** 本地内容是否还和内置示例一模一样（说明从来没真正编辑过内容） */
  function isPristineContent(d) {
    return contentSignature(d) === contentSignature(defaultData());
  }
  /**
   * 更宽松的「这份数据还没被认领」判断：姓名还是占位名、没有头像/简介/联系方式/曲库。
   * isPristineContent() 要求逐字节相同，跨版本（内置示例文案改过）会失效，所以再加这一层，
   * 用来修复老版本留下的"假 dirty"——它会让 content.json 永远装载不进来。
   */
  function looksUnclaimed(d) {
    if (!d) return true;
    const p = d.profile || {};
    const c = d.contact || {};
    const sample = defaultData();
    const placeholder = String((sample.profile && sample.profile.name) || '你的名字');
    return !p.avatar
      && !String(p.bio || '').trim()
      && String(p.name || '') === placeholder
      && !Object.keys(c).some((k) => String(c[k] || '').trim())
      && !(((d.music && d.music.tracks) || []).length);
  }

  /* --------------------------------------------------------------------------
   * 3.1 版本迁移 + 统一的数据构建入口
   * ---------------------------------------------------------------------------
   * 老版本留在 localStorage / content.json 里的字段需要被搬到新结构上，
   * 否则用户升级后看到的还是旧配色。原则：只改「旧版默认值」，用户真正自定义过的值不动。
   * ------------------------------------------------------------------------ */
  const LEGACY_ACCENTS = ['#5b7cfa', '#6d8bff'];   // v1 的默认强调色（靛蓝）→ 现在统一为 Apple 系统蓝

  function migrate(data) {
    const t = (data && data.theme) || {};
    if (LEGACY_ACCENTS.indexOf(String(t.accent).toLowerCase()) >= 0) t.accent = defaultData().theme.accent;
    delete t.blur;                                  // 「毛玻璃强度」设置已下线，--blur 改为 CSS 固定值

    /* 早期版本用过 theme.textColor / theme.bgColor 这种「白天黑夜手动二选一」的写法，
       现在改为「配色预设」。若用户当时确实改过颜色，就把那套颜色平移成 custom 预设，
       没改过的直接回落到原生新拟态配色。 */
    const def = defaultData().theme;
    if (t.textColor || t.bgColor) {
      const tc = t.textColor || {}, bc = t.bgColor || {};
      const touched =
        (tc.light && tc.light !== def.customColor.light.text) || (tc.dark && tc.dark !== def.customColor.dark.text) ||
        (bc.light && bc.light !== def.customColor.light.bg) || (bc.dark && bc.dark !== def.customColor.dark.bg);
      if (touched) {
        t.preset = 'custom';
        t.customColor = {
          light: { bg: normHexish(bc.light, def.customColor.light.bg), text: normHexish(tc.light, def.customColor.light.text) },
          dark:  { bg: normHexish(bc.dark, def.customColor.dark.bg),  text: normHexish(tc.dark, def.customColor.dark.text) }
        };
      }
      delete t.textColor;
      delete t.bgColor;
    }
    return data;
  }

  /** 迁移时用的宽松颜色校验：不是 #rrggbb 就回落到默认值 */
  function normHexish(v, fallback) {
    return /^#[0-9a-f]{6}$/i.test(String(v || '').trim()) ? String(v).trim().toLowerCase() : fallback;
  }

  /** 所有数据都必须经过这里：合并默认值 → 迁移 → 交给页面 */
  function buildData(raw) {
    return migrate(mergeDeep(defaultData(), raw));
  }

  /* --------------------------------------------------------------------------
   * 4. IndexedDB —— 音乐文件仓库（支持拖入 mp3/flac/wav 等）
   * ------------------------------------------------------------------------ */
  const Audio = {
    mode: 'idb',      // 'idb' | 'memory'
    _db: null,
    _mem: new Map(),

    open() {
      if (this._db) return Promise.resolve(this._db);
      return new Promise((resolve) => {
        let req;
        try { req = window.indexedDB.open(DB_NAME, DB_VER); }
        catch (err) { return this._fallback(resolve, err); }
        if (!req) return this._fallback(resolve, new Error('indexedDB 不可用'));

        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_AUDIO)) db.createObjectStore(STORE_AUDIO);
        };
        req.onsuccess = () => { this._db = req.result; resolve(this._db); };
        req.onerror = () => this._fallback(resolve, req.error);
      });
    },

    _fallback(resolve, err) {
      this.mode = 'memory';
      console.warn('[store] IndexedDB 不可用（file:// 直接打开时常见），音乐仅保存在当前标签页：', err);
      store.emit('warn', '当前环境不支持音乐持久化，建议用本地服务器打开（见 README）');
      resolve(null);
    },

    _tx(write) {
      return this.open().then((db) => {
        if (!db) return null;
        return db.transaction(STORE_AUDIO, write ? 'readwrite' : 'readonly').objectStore(STORE_AUDIO);
      });
    },

    put(id, blob) {
      if (this.mode === 'memory') { this._mem.set(id, blob); return Promise.resolve(true); }
      return this._tx(true).then((os) => new Promise((resolve) => {
        if (!os) { this._mem.set(id, blob); return resolve(true); }
        const r = os.put(blob, id);
        r.onsuccess = () => resolve(true);
        r.onerror = () => { this._mem.set(id, blob); resolve(false); };
      }));
    },

    get(id) {
      if (this._mem.has(id)) return Promise.resolve(this._mem.get(id));
      return this._tx(false).then((os) => new Promise((resolve) => {
        if (!os) return resolve(null);
        const r = os.get(id);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => resolve(null);
      }));
    },

    del(id) {
      this._mem.delete(id);
      return this._tx(true).then((os) => new Promise((resolve) => {
        if (!os) return resolve(false);
        const r = os.delete(id);
        r.onsuccess = () => resolve(true);
        r.onerror = () => resolve(false);
      }));
    },

    clear() {
      this._mem.clear();
      return this._tx(true).then((os) => new Promise((resolve) => {
        if (!os) return resolve(true);
        const r = os.clear();
        r.onsuccess = () => resolve(true);
        r.onerror = () => resolve(false);
      }));
    }
  };

  /* --------------------------------------------------------------------------
   * 5. 对外接口
   * ------------------------------------------------------------------------ */
  const listeners = new Map();   // 事件名 -> [fn]

  const store = {
    data: defaultData(),
    Audio: Audio,
    uid: uid,

    /** 重新从 localStorage 读取（另一个标签页保存后会触发） */
    reload() {
      this.data = buildData(readLS());
      this.emit('change', this.data);
      return this.data;
    },

    /** 首次加载 */
    load() {
      const saved = readLS();
      this.hasSaved = !!saved;                 // 是否已经有本地数据（决定要不要装载站点内容）
      this.meta = readMeta();
      this.data = buildData(saved);
      // 老版本留下的本地数据没有 meta 记录：如果内容确实被编辑过，视同「作者自己改过」，
      // 标记为 dirty，避免升级后被仓库里的 content.json 覆盖掉手工内容。
      // （内容还是内置示例时不算改过 —— 否则只调过主题的访客会被误判，从此再也装不到 content.json）
      if (this.hasSaved && !this.meta.seededAt && !this.meta.dirty && !isPristineContent(this.data)) {
        this.meta.dirty = true;
        writeMeta(this.meta);
      }
      // ★ 自愈：早期版本只要动过任何设置就把 dirty 置了 true，导致 content.json 永远装载不了。
      //   两种"假 dirty"都要清掉，让 content.json 正常装载：
      //   ① 本地内容与内置示例完全一致；② 从未装载过 content.json，且这份内容从没被认领过。
      if (this.meta.dirty && (isPristineContent(this.data) || (!this.meta.seededAt && looksUnclaimed(this.data)))) {
        this.meta.dirty = false;
        writeMeta(this.meta);
      }
      return this.data;
    },

    /* ---------------- 站点默认内容（content.json） ----------------
     * 场景：作者在本地把主页编辑好 → 设置页「导出为站点默认内容」→ 把 content.json 提交到仓库。
     * 之后任何访客（包括作者换设备）第一次打开线上站点，都会自动载入这份内容，
     * 于是线上和本地显示效果一致；访客自己改过之后则不再覆盖他的改动。
     * ------------------------------------------------------------ */
    hasSaved: false,
    meta: {},

    /** 标记「本地内容已被手动修改」，避免后续被 content.json 覆盖 */
    markEdited() {
      this.meta = readMeta();
      this.meta.dirty = true;
      writeMeta(this.meta);
    },

    /** 把一份站点内容写入本地（不算"访客修改"） */
    applySiteContent(json) {
      this.data = buildData(json);
      writeLS(this.data);
      this.hasSaved = true;
      this.meta = readMeta();
      this.meta.dirty = false;
      this.meta.seededAt = json.updatedAt || json.exportedAt || 'unknown';
      writeMeta(this.meta);
      this.emit('change', this.data);
      return this.data;
    },

    /**
     * 装载 content.json
     * @param {Object} [opts] force=true 时忽略 dirty 标记强制载入
     * @returns {Promise<Object|null>} 载入成功返回数据，否则 null
     */
    async loadSiteContent(opts) {
      if (window.location.protocol === 'file:') return null;   // file:// 下 fetch 会被拦截，跳过
      const force = !!(opts && opts.force);
      try {
        const res = await window.fetch(SITE_CONTENT + '?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return null;
        const json = await res.json();
        if (!json || typeof json !== 'object') return null;
        /* ★ 本地「内容」与仓库里的完全一致 → 这个 dirty 是历史误判（早期版本动过任何设置都会置 true），
             清掉它，否则这份 content.json 以后再也更新不进来了。 */
        if (!force && this.meta.dirty &&
            contentSignature(buildData(json)) === contentSignature(this.data)) {
          this.meta.dirty = false;
          writeMeta(this.meta);
        }
        if (!force && this.hasSaved && this.meta.dirty) return null;   // 访客确实改过内容，不覆盖
        const stamp = json.updatedAt || json.exportedAt || '';
        // 已有本地数据、且就是同一版本 → 不必重载
        if (!force && this.hasSaved && stamp && stamp === this.meta.seededAt) return null;
        return this.applySiteContent(json);
      } catch (err) {
        // 没有 content.json（404）或跨域失败都属正常，静默忽略
        return null;
      }
    },

    /** 防抖保存 */
    _timer: null,
    save() {
      clearTimeout(this._timer);
      this._timer = setTimeout(() => {
        writeLS(this.data);
        this.emit('saved', this.data);
      }, 120);
    },

    get(path) { return path ? getPath(this.data, path) : this.data; },

    set(path, value) {
      setPath(this.data, path, value);
      if (isContentPath(path)) this.markEdited();      // 主题/播放偏好不算改过内容
      this.save();
      this.emit('change', this.data);
      return this.data;
    },

    /** 用回调批量修改（回调直接改 data 即可） */
    update(mutator) {
      const before = contentSignature(this.data);
      mutator(this.data);
      if (contentSignature(this.data) !== before) this.markEdited();
      this.save();
      this.emit('change', this.data);
      return this.data;
    },

    /** 合并式写入一组 { path: value } */
    patch(pairs) {
      Object.keys(pairs).forEach((p) => setPath(this.data, p, pairs[p]));
      if (Object.keys(pairs).some(isContentPath)) this.markEdited();
      this.save();
      this.emit('change', this.data);
      return this.data;
    },

    /** 本地内容是否仍是内置示例（用来判断线上有没有装到 content.json） */
    isPristine() { return isPristineContent(this.data); },

    reset() {
      this.data = defaultData();
      writeLS(this.data);
      this.markEdited();
      this.emit('change', this.data);
      return this.data;
    },

    exportJSON() { return JSON.stringify(this.data, null, 2); },

    importJSON(text) {
      const parsed = JSON.parse(text);
      this.data = buildData(parsed);
      writeLS(this.data);
      this.markEdited();
      this.emit('change', this.data);
      return this.data;
    },

    /* ---- 极简事件总线 ---- */
    on(evt, fn) {
      if (!listeners.has(evt)) listeners.set(evt, []);
      listeners.get(evt).push(fn);
      return () => this.off(evt, fn);
    },
    off(evt, fn) {
      const arr = listeners.get(evt);
      if (arr) listeners.set(evt, arr.filter((f) => f !== fn));
    },
    emit(evt, payload) {
      (listeners.get(evt) || []).forEach((fn) => { try { fn(payload); } catch (e) { console.error(e); } });
    },

    /** 计算「此刻应该是什么主题」—— 自动模式的判定核心 */
    resolveTheme(data) {
      const t = (data || this.data).theme;
      if (t.mode === 'manual') return t.manual === 'dark' ? 'dark' : 'light';
      const hour = new Date().getHours();
      const day = Number(t.dayStart), night = Number(t.nightStart);
      if (day === night) return 'light';
      const isDay = day < night
        ? (hour >= day && hour < night)          // 例：7 点~19 点为白天
        : (hour >= day || hour < night);         // 跨午夜：例 20 点~次日 6 点为白天
      return isDay ? 'light' : 'dark';
    },

    /** 音乐对象 URL 缓存：避免重复读 IndexedDB */
    _urlCache: new Map(),
    async audioURL(track) {
      if (!track) return '';
      // ★ 线上部署关键：曲目可以直接写仓库内的音频地址（如 audio/song.mp3）或外链。
      //   IndexedDB 里的本地导入文件只存在作者自己的浏览器里，部署到 GitHub Pages
      //   之后访客是拿不到的，因此线上站点请使用 src 方式提供音乐。
      if (track.src && String(track.src).trim()) return String(track.src).trim();
      if (!track.hasAudio) return '';
      if (this._urlCache.has(track.id)) return this._urlCache.get(track.id);
      const blob = await Audio.get(track.id);
      if (!blob) return '';
      const url = URL.createObjectURL(blob);
      this._urlCache.set(track.id, url);
      return url;
    },
    releaseURL(id) {
      const url = this._urlCache.get(id);
      if (url) { URL.revokeObjectURL(url); this._urlCache.delete(id); }
    },

    /** 跨标签页同步：设置页保存后，主页自动刷新 */
    watchStorage() {
      window.addEventListener('storage', (e) => {
        if (e.key === LS_KEY) this.reload();
      });
    }
  };

  window.DSH = window.DSH || {};

  /* --------------------------------------------------------------------------
   * 6. 通用 UI 工具：轻提示（主页与设置页共用，所以放在数据层里）
   * ------------------------------------------------------------------------ */
  const ui = {
    toast(msg) {
      const el = document.getElementById('toast');
      if (!el) { console.log('[toast]', msg); return; }
      el.textContent = msg;
      el.classList.add('is-on');
      clearTimeout(ui._t);
      ui._t = setTimeout(() => el.classList.remove('is-on'), 2400);
    }
  };

  window.DSH.store = store;
  window.DSH.ui = ui;
  window.DSH.defaultData = defaultData;
  window.DSH.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
})(window);
