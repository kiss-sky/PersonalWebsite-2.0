/*!
 * sakura-rain.js — 網頁櫻花飄落動畫
 * https://github.com/minz71/sakura-rain
 */
(() => {
  "use strict";

  const CANVAS_ID = "canvas_sakura";
  // 速度參數（xSpeed/ySpeed/rSpeed）以 60fps 的每幀位移為單位，
  // 在高更新率螢幕上以 delta time 換算，飄落速度不會隨螢幕變快
  const BASE_FRAME_MS = 1000 / 60;
  // 分頁休眠或卡頓後恢復時，單幀最多追趕的幀數，避免花瓣瞬間跳出畫面
  const MAX_DELTA = 3;
  const MAX_PETAL_SIZE = 30;
  // DPR 超過 2 對這種小貼圖沒有可見畫質差異，只會增加像素填充量
  const DPR_CAP = 2;

  // 預設從腳本所在位置載入花瓣圖（CDN 與自架都同源）；
  // 拿不到腳本位置時（例如被內嵌執行）退回 jsDelivr
  const SCRIPT_SRC = document.currentScript && document.currentScript.src;
  const DEFAULT_IMAGE_SRC = SCRIPT_SRC
    ? new URL("sakura.png", SCRIPT_SRC).href
    : "https://cdn.jsdelivr.net/gh/minz71/sakura-rain/sakura.png";

  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );

  const reducedMotionQuery = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );

  function toNumber(value, fallback) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function normalizeConfig(raw) {
    const config = raw || {};
    let count = Math.max(0, Math.floor(toNumber(config.sakura, 30)));
    if (isMobile) count = Math.floor(count * 0.5);
    return {
      count,
      xSpeed: toNumber(config.xSpeed, 0.5),
      ySpeed: toNumber(config.ySpeed, 0.5),
      rSpeed: toNumber(config.rSpeed, 0.025),
      direction: config.direction || "TopRight",
      zIndex: Math.trunc(toNumber(config.zIndex, -1)),
      imageSrc: config.imageSrc || DEFAULT_IMAGE_SRC,
      renderer: config.renderer || "2d",
    };
  }

  class Petal {
    constructor(config) {
      this.config = config;
      this.reset();
    }

    // 從畫面邊緣重新進場。direction 代表進場的邊：
    // TopRight = 從上緣或右緣進場、往左下飄，其餘方向類推
    reset() {
      const { xSpeed, ySpeed, rSpeed, direction } = this.config;
      const fromPrimaryEdge = Math.random() > 0.5;
      const randomX = Math.random() * window.innerWidth;
      const randomY = Math.random() * window.innerHeight;
      const vx = Math.random() * xSpeed;
      const vy = Math.random() * ySpeed;

      switch (direction) {
        case "TopLeft":
          this.x = fromPrimaryEdge ? randomX : 0;
          this.y = fromPrimaryEdge ? 0 : randomY;
          this.vx = vx;
          this.vy = vy;
          break;
        case "BottomRight":
          this.x = fromPrimaryEdge ? randomX : window.innerWidth;
          this.y = fromPrimaryEdge ? window.innerHeight : randomY;
          this.vx = -vx;
          this.vy = -vy;
          break;
        case "BottomLeft":
          this.x = fromPrimaryEdge ? randomX : 0;
          this.y = fromPrimaryEdge ? window.innerHeight : randomY;
          this.vx = vx;
          this.vy = -vy;
          break;
        case "TopRight":
        default:
          this.x = fromPrimaryEdge ? randomX : window.innerWidth;
          this.y = fromPrimaryEdge ? 0 : randomY;
          this.vx = -vx;
          this.vy = vy;
          break;
      }

      this.rotation = Math.random() * 6;
      this.vr = Math.random() * rSpeed;
      this.size = MAX_PETAL_SIZE * Math.random() * (Math.random() * 0.4 + 0.6);
    }

    // 回傳 false 表示已飄出畫面
    update(delta) {
      this.x += this.vx * delta;
      this.y += this.vy * delta;
      this.rotation += this.vr * delta;
      return (
        this.x >= 0 &&
        this.x <= window.innerWidth &&
        this.y >= 0 &&
        this.y <= window.innerHeight
      );
    }
  }

  class CanvasRenderer2D {
    constructor(config, image) {
      this.image = image;
      this.dpr = 1;
      this.sprite = null;

      const existing = document.getElementById(CANVAS_ID);
      if (existing) existing.remove();

      this.canvas = document.createElement("canvas");
      this.canvas.id = CANVAS_ID;
      Object.assign(this.canvas.style, {
        position: "fixed",
        left: "0",
        top: "0",
        pointerEvents: "none",
        zIndex: config.zIndex.toString(),
      });
      this.ctx = this.canvas.getContext("2d");
      this.onResize = () => this.resize();
      window.addEventListener("resize", this.onResize);
      this.resize();
      document.body.appendChild(this.canvas);
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      this.canvas.width = Math.round(window.innerWidth * dpr);
      this.canvas.height = Math.round(window.innerHeight * dpr);
      this.canvas.style.width = window.innerWidth + "px";
      this.canvas.style.height = window.innerHeight + "px";
      if (dpr !== this.dpr) {
        this.dpr = dpr;
        this.buildSprite();
      }
    }

    // 先把花瓣圖縮繪到小畫布，之後每幀從小畫布取樣，
    // 比每幀直接縮放原圖便宜，也不會在高 DPR 螢幕上糊掉
    buildSprite() {
      const size = Math.ceil(MAX_PETAL_SIZE * this.dpr);
      this.sprite = document.createElement("canvas");
      this.sprite.width = size;
      this.sprite.height = size;
      this.sprite.getContext("2d").drawImage(this.image, 0, 0, size, size);
    }

    draw(petals) {
      const ctx = this.ctx;
      const dpr = this.dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      for (const petal of petals) {
        const cos = Math.cos(petal.rotation) * dpr;
        const sin = Math.sin(petal.rotation) * dpr;
        ctx.setTransform(cos, sin, -sin, cos, petal.x * dpr, petal.y * dpr);
        ctx.drawImage(this.sprite, 0, 0, petal.size, petal.size);
      }
    }

    destroy() {
      window.removeEventListener("resize", this.onResize);
      this.canvas.remove();
    }
  }

  // renderer 欄位為未來的 3D 實作預留；目前僅支援 canvas 2D
  function createRenderer(config, image) {
    if (config.renderer !== "2d") {
      console.warn(
        `[sakura-rain] 不支援的 renderer "${config.renderer}"，改用 2d`
      );
    }
    return new CanvasRenderer2D(config, image);
  }

  const imageCache = new Map();

  function loadImage(src) {
    if (!imageCache.has(src)) {
      imageCache.set(
        src,
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () =>
            reject(new Error(`[sakura-rain] 無法載入花瓣圖片：${src}`));
          img.src = src;
        })
      );
    }
    return imageCache.get(src);
  }

  const state = {
    wantsRunning: false,
    running: false,
    config: null,
    petals: [],
    renderer: null,
    rafId: 0,
    lastTime: 0,
    startToken: 0,
  };

  function frame(now) {
    const delta = Math.min((now - state.lastTime) / BASE_FRAME_MS, MAX_DELTA);
    state.lastTime = now;
    for (const petal of state.petals) {
      if (!petal.update(delta)) petal.reset();
    }
    state.renderer.draw(state.petals);
    state.rafId = requestAnimationFrame(frame);
  }

  // 拆掉畫布並停止繪製，但保留 wantsRunning（供減少動態偏好切換時恢復）
  function suspend() {
    state.startToken++;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = 0;
    state.running = false;
    if (state.renderer) {
      state.renderer.destroy();
      state.renderer = null;
    }
    state.petals = [];
  }

  async function runIfAllowed() {
    if (!state.wantsRunning || state.running) return;
    if (reducedMotionQuery.matches) return;

    const token = ++state.startToken;
    const config = state.config;
    let image;
    try {
      image = await loadImage(config.imageSrc);
    } catch (error) {
      console.error(error.message);
      return;
    }
    if (!document.body) {
      await new Promise((resolve) =>
        document.addEventListener("DOMContentLoaded", resolve, { once: true })
      );
    }
    // 等待期間若被 stop() 或重新 start()，放棄這次啟動
    if (token !== state.startToken || !state.wantsRunning || state.running) {
      return;
    }

    state.renderer = createRenderer(config, image);
    state.petals = Array.from(
      { length: config.count },
      () => new Petal(config)
    );
    state.running = true;
    state.lastTime = performance.now();
    state.rafId = requestAnimationFrame(frame);
  }

  function start(rawConfig) {
    state.config = normalizeConfig(
      rawConfig === undefined ? window.sakuraConfig : rawConfig
    );
    state.wantsRunning = true;
    suspend();
    runIfAllowed();
  }

  function stop() {
    state.wantsRunning = false;
    suspend();
  }

  const onReducedMotionChange = () => {
    if (reducedMotionQuery.matches) suspend();
    else runIfAllowed();
  };
  if (reducedMotionQuery.addEventListener) {
    reducedMotionQuery.addEventListener("change", onReducedMotionChange);
  } else if (reducedMotionQuery.addListener) {
    // Safari 13 以前
    reducedMotionQuery.addListener(onReducedMotionChange);
  }

  window.sakuraRain = {
    start,
    stop,
    restart: start,
    get running() {
      return state.running;
    },
  };

  // 向下相容：舊版全域函數 startSakura(sakura, direction, zIndex)
  window.startSakura = (sakura, direction, zIndex) => {
    const overrides = {};
    if (sakura !== undefined) overrides.sakura = sakura;
    if (direction !== undefined) overrides.direction = direction;
    if (zIndex !== undefined) overrides.zIndex = zIndex;
    start(Object.assign({}, window.sakuraConfig, overrides));
  };

  if (!window.sakuraConfig || window.sakuraConfig.autoStart !== false) {
    start(window.sakuraConfig);
  }
})();
