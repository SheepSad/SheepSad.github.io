/* ============================================================================
 * store.js —— 数据层（全局数据仓库）
 * ----------------------------------------------------------------------------
 * 职责：
 *   1. 定义「个人主页」的全部默认数据（未编辑状态下的占位内容）
 *   2. 统一读写 localStorage（文本类数据），并做深度合并，保证后续版本升级不丢字段
 *   3. 提供 IndexedDB 音乐仓库（音频是二进制大文件，不能塞进 localStorage）
 *   4. 提供订阅 / 广播机制：主页与设置页分属两个标签页，靠 storage 事件实时同步
 *
 * 说明：本文件为传统脚本（非 ES Module），因为直接用 file:// 双击打开时
 *       ES Module 会被浏览器以 CORS 策略拦截；用全局对象 window.DSH.store 暴露接口。
 * ========================================================================== */
(function (window) {
  'use strict';

  const LS_KEY = 'dsh.home.v1';   // localStorage 键名（文本数据）
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
        accent: '#5b7cfa',     // 强调色（可自定义）
        radius: 20,            // 圆角
        blur: 18,              // 毛玻璃模糊强度
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
        tracks: [],                 // { id, title, artist, lyrics, fileName, size, hasAudio }
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
      const saved = readLS();
      this.data = mergeDeep(defaultData(), saved);
      this.emit('change', this.data);
      return this.data;
    },

    /** 首次加载 */
    load() {
      this.data = mergeDeep(defaultData(), readLS());
      return this.data;
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
      this.save();
      this.emit('change', this.data);
      return this.data;
    },

    /** 用回调批量修改（回调直接改 data 即可） */
    update(mutator) {
      mutator(this.data);
      this.save();
      this.emit('change', this.data);
      return this.data;
    },

    /** 合并式写入一组 { path: value } */
    patch(pairs) {
      Object.keys(pairs).forEach((p) => setPath(this.data, p, pairs[p]));
      this.save();
      this.emit('change', this.data);
      return this.data;
    },

    reset() {
      this.data = defaultData();
      writeLS(this.data);
      this.emit('change', this.data);
      return this.data;
    },

    exportJSON() { return JSON.stringify(this.data, null, 2); },

    importJSON(text) {
      const parsed = JSON.parse(text);
      this.data = mergeDeep(defaultData(), parsed);
      writeLS(this.data);
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
      if (!track || !track.hasAudio) return '';
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
