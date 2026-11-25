import { createEye } from './eye.js';
import { FaceTracker } from './face.js';

/* ============================================================
   瞳渊 · 主程序
   输入源只有两类：面部网格 / 指针。两者都产出同一组状态：
     eyeOpen  0..1      睁眼度
     gaze     vec2      视线（-1..1）
     lean     vec2      脸部或指针的位置（镜头轻移）
   ============================================================ */

const canvas = document.getElementById('scene');
const els = {
  intro: document.getElementById('intro'),
  introNote: document.getElementById('introNote'),
  btnStart: document.getElementById('btnStart'),
  btnStartLabel: document.querySelector('#btnStart .btn__label'),
  btnPointer: document.getElementById('btnPointer'),
  btnCamera: document.getElementById('btnCamera'),
  btnFull: document.getElementById('btnFull'),
  statusPill: document.getElementById('statusPill'),
  statusText: document.getElementById('statusText'),
  fpsValue: document.getElementById('fpsValue'),
  hud: document.getElementById('hud'),
  meterFill: document.getElementById('meterFill'),
  meterKnob: document.getElementById('meterKnob'),
  eyeState: document.getElementById('eyeState'),
  hudHint: document.getElementById('hudHint'),
  preview: document.getElementById('preview'),
  video: document.getElementById('video'),
  faceCanvas: document.getElementById('faceCanvas'),
  toast: document.getElementById('toast'),
  modes: document.getElementById('modes'),
};

const params = new URLSearchParams(location.search);
const hideUI = params.get('ui') === '0';
const forceOpen = params.has('open') ? clamp(parseFloat(params.get('open')), 0, 1) : null;
const forcedGaze = params.has('gaze')
  ? (() => {
      const [x, y] = params.get('gaze').split(',').map(Number);
      return { x: clamp(x || 0, -1, 1), y: clamp(y || 0, -1, 1) };
    })()
  : null;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
  started: false,
  mode: 'pointer',
  cameraBusy: false,
  faceSeen: false,
  open: 1,
  openTarget: 1,
  openVel: 0,
  gaze: { x: 0, y: 0 },
  gazeTarget: { x: 0, y: 0 },
  lean: { x: 0, y: 0 },
  leanTarget: { x: 0, y: 0 },
  flash: 0,
  spinBoost: 0,
  statusKind: '',
  hint: '',
  hand: null,
};

const pointer = { inside: false, x: 0.5, y: 0.5, lastX: 0, lastY: 0 };
let blink = { active: false, t: 0, dur: 0.36 };
let lastFlashAt = 0;
let autoBlinkIn = 4.5;
let time = 0;
let last = performance.now();
let fpsFrames = 0;
let fpsClock = last;

function clamp(v, a, b) {
  return Math.min(b, Math.max(a, v));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/* ---------------- 程序化“眨眼” ---------------- */

function fireFlash(strength = 1) {
  state.flash = Math.min(1.4, Math.max(state.flash, strength));
  state.spinBoost = Math.min(2.4, state.spinBoost + 0.8);
}

function triggerBlink(dur = 0.36) {
  blink.active = true;
  blink.t = 0;
  blink.dur = dur;
  fireFlash(0.75);
}

/* ---------------- UI ---------------- */

let toastTimer = 0;
function toast(text, ms = 3800) {
  if (!els.toast) return;
  els.toast.textContent = text;
  els.toast.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('is-on'), ms);
}

function setStatus(kind, text) {
  if (state.statusKind === kind && els.statusText.textContent === text) return;
  state.statusKind = kind;
  els.statusText.textContent = text;
  els.statusPill.classList.toggle('is-live', kind === 'live');
  els.statusPill.classList.toggle('is-warn', kind === 'warn');
}

function setBusy(text) {
  if (!els.btnStart) return;
  if (text) {
    els.btnStart.classList.add('is-busy');
    els.btnStartLabel.textContent = text;
  } else {
    els.btnStart.classList.remove('is-busy');
    els.btnStartLabel.textContent = '开启摄像头';
  }
}

function setHint(text) {
  if (state.hint === text) return;
  state.hint = text;
  els.hudHint.textContent = text;
}

function startExperience() {
  if (state.started) return;
  state.started = true;
  els.intro.classList.add('is-hidden');
  els.intro.setAttribute('aria-hidden', 'true');
  els.hud.hidden = false;
  els.hud.style.display = 'flex';
}

function showMode(mode) {
  state.mode = mode;
  if (mode === 'camera') {
    els.preview.hidden = false;
    requestAnimationFrame(() => els.preview.classList.add('is-on'));
    setStatus('live', '摄像头 · 寻找面部');
  } else {
    els.preview.classList.remove('is-on');
    setTimeout(() => {
      if (state.mode !== 'camera') els.preview.hidden = true;
    }, 700);
    setStatus('', '指针模式');
  }
}

/* ---------------- 眼睛 ---------------- */

let eye = null;
try {
  eye = createEye(canvas);
} catch (err) {
  console.error(err);
  els.introNote.textContent = '这台设备的浏览器无法创建 WebGL 场景。请换用 Chrome / Edge，或开启硬件加速后再试。';
  els.introNote.classList.add('is-warn');
  els.btnStart.disabled = true;
  els.btnPointer.disabled = true;
}

/* ---------------- 瞳式 ---------------- */

function paintModeChips() {
  if (!eye) return;
  document.body.dataset.mode = String(eye.mode);
  previewAccent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#ff4a3d';
  document.querySelectorAll('[data-mode-btn]').forEach((btn) => {
    btn.setAttribute('aria-pressed', btn.dataset.modeBtn === String(eye.mode) ? 'true' : 'false');
  });
}

function setMode(index, silent = false) {
  if (!eye) return;
  eye.setMode(index);
  paintModeChips();
  try {
    localStorage.setItem('iris-mode', String(eye.mode));
  } catch {}
  if (!silent) {
    fireFlash(0.5);
    toast(`瞳式 · ${eye.modes[eye.mode].name}`, 1800);
  }
}

els.modes?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-mode-btn]');
  if (!btn) return;
  setMode(Number(btn.dataset.modeBtn));
});

/* ---------------- 摄像头 ---------------- */

const tracker = new FaceTracker(els.video, {
  onStage: (stage) => {
    if (!state.cameraBusy) return;
    if (stage === 'model') setBusy('正在载入面部模型…');
    else if (stage === 'camera') setBusy('等待摄像头授权…');
    else if (stage === 'ready') setBusy('即将开始…');
  },
});

function humanError(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return '摄像头权限被拒绝，已切到指针模式。可点右上角相机按钮重试。';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return '没有找到可用的摄像头，已切到指针模式。';
  }
  if (name === 'NotReadableError') {
    return '摄像头正被其他程序占用，已切到指针模式。';
  }
  if (err?.code === 'unsupported' || !window.isSecureContext) {
    return '当前页面不是安全上下文（需 localhost 或 https），摄像头不可用，已切到指针模式。';
  }
  return '面部识别启动失败，已切到指针模式。' + (err?.message ? `（${err.message}）` : '');
}

async function enableCamera() {
  if (!eye || state.cameraBusy || state.mode === 'camera') return;
  state.cameraBusy = true;
  if (!state.started) setBusy('正在载入面部模型…');

  try {
    await tracker.start();
    showMode('camera');
    startExperience();
    els.btnCamera.classList.add('is-active');
    els.btnCamera.setAttribute('aria-label', '关闭摄像头');
    toast('面部已连接 · 眨眼收拢，视线即朝向');
    els.introNote.textContent = '478 个面部关键点全部在本地推理，不上传。';
    els.introNote.classList.remove('is-warn');
  } catch (err) {
    console.warn('[camera]', err);
    const msg = humanError(err);
    tracker.stop();
    showMode('pointer');
    els.introNote.textContent = msg;
    els.introNote.classList.add('is-warn');
    els.btnCamera.classList.remove('is-active');
    els.btnCamera.setAttribute('aria-label', '摄像头开关');
    toast(msg, 5200);
    startExperience();
    setHint('移动指针 · 点击眨眼');
  } finally {
    state.cameraBusy = false;
    setBusy(null);
  }
}

function disableCamera() {
  tracker.stop();
  showMode('pointer');
  state.faceSeen = false;
  els.btnCamera.classList.remove('is-active');
  els.btnCamera.setAttribute('aria-label', '摄像头开关');
  setHint('移动指针 · 点击眨眼');
  toast('摄像头已关闭 · 指针模式');
}

/* ---------------- 指针输入 ---------------- */

window.addEventListener(
  'pointermove',
  (e) => {
    const nx = clamp((e.clientX / window.innerWidth) * 2 - 1, -1.2, 1.2);
    const ny = clamp(1 - (e.clientY / window.innerHeight) * 2, -1.2, 1.2);
    pointer.x = nx;
    pointer.y = ny;
    pointer.inside = true;
    autoBlinkIn = Math.max(autoBlinkIn, 4.0);
  },
  { passive: true }
);

window.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, a, .modes, .intro')) return;
  pointer.inside = true;
  triggerBlink(0.34);
});

document.addEventListener('pointerleave', () => {
  pointer.inside = false;
});

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space') {
    e.preventDefault();
    triggerBlink(0.36);
  } else if (e.key === '1' || e.key === '2' || e.key === '3') {
    setMode(Number(e.key) - 1);
  } else if (e.key === 'c' || e.key === 'C') {
    if (state.mode === 'camera') disableCamera();
    else enableCamera();
  } else if (e.key === 'f' || e.key === 'F') {
    toggleFullscreen();
  }
});

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

els.btnStart?.addEventListener('click', enableCamera);
els.btnStart?.addEventListener('pointerenter', () => {
  tracker.ensureModel().catch(() => {});
});
els.btnPointer?.addEventListener('click', () => {
  startExperience();
  showMode('pointer');
  setHint('移动指针 · 点击眨眼');
  els.btnCamera.classList.remove('is-active');
  toast('指针模式 · 移动控制视线，点击眨眼');
});
els.btnCamera?.addEventListener('click', () => {
  if (state.mode === 'camera') disableCamera();
  else enableCamera();
});
els.btnFull?.addEventListener('click', toggleFullscreen);

document.addEventListener('fullscreenchange', () => {
  els.btnFull.setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '切换全屏');
});

/* ---------------- 手部网格预览 ---------------- */

const fctx = els.faceCanvas?.getContext('2d');
let previewAccent = '#ff4a3d';

function drawPreview(face) {
  if (!fctx) return;
  const w = els.faceCanvas.width;
  const h = els.faceCanvas.height;
  fctx.clearRect(0, 0, w, h);
  if (!state.faceSeen || !face?.landmarks) return;

  const lm = face.landmarks;
  fctx.fillStyle = 'rgba(225, 225, 240, 0.22)';
  for (let i = 0; i < lm.length; i += 1) {
    fctx.fillRect((1 - lm[i].x) * w, lm[i].y * h, 1, 1);
  }

  fctx.fillStyle = previewAccent;
  const iris = [468, 469, 470, 471, 472, 473, 474, 475, 476, 477];
  for (const i of iris) {
    if (!lm[i]) continue;
    fctx.beginPath();
    fctx.arc((1 - lm[i].x) * w, lm[i].y * h, 1.8, 0, Math.PI * 2);
    fctx.fill();
  }
}

/* ---------------- 状态推进 ---------------- */

function updateInput(dt, now, face) {
  const faceFresh = !!(face && now - face.time < 260);
  state.faceSeen = faceFresh;
  const idle = Math.min(1, Math.abs(state.gaze.x) + Math.abs(state.gaze.y));

  let openTarget = 1;
  let gazeX = 0;
  let gazeY = 0;
  let leanX = 0;
  let leanY = 0;

  if (state.mode === 'camera') {
    if (faceFresh) {
      openTarget = face.openness;
      gazeX = face.gaze.x;
      gazeY = face.gaze.y;
      leanX = face.facePos.x;
      leanY = face.facePos.y;
      setStatus('live', '摄像头 · 已锁定');
      setHint('眨眼收拢 · 视线即朝向');
    } else {
      const a = time * 0.35;
      gazeX = Math.sin(a) * 0.35;
      gazeY = Math.cos(a * 0.8) * 0.22;
      setStatus('warn', '摄像头 · 寻找面部');
      setHint('把脸放进画面中央');
    }
  } else {
    if (pointer.inside) {
      gazeX = pointer.x * 0.92;
      gazeY = pointer.y * 0.92;
      leanX = pointer.x;
      leanY = pointer.y;
    } else {
      const a = time * 0.33;
      gazeX = Math.sin(a) * 0.34;
      gazeY = Math.cos(a * 0.77) * 0.2;
    }
    setStatus('', '指针模式');
    setHint('移动指针 · 点击眨眼');
  }

  /* 程序化眨眼只在没有面部数据时接管 */
  if (blink.active) {
    blink.t += dt;
    const t = blink.t / blink.dur;
    openTarget = t < 0.42 ? 0.02 : 1;
    if (t >= 1) blink.active = false;
  } else if (state.mode === 'camera' && faceFresh) {
    autoBlinkIn = 5.5;
  } else {
    autoBlinkIn -= dt;
    if (autoBlinkIn <= 0) {
      triggerBlink(0.34);
      autoBlinkIn = 3.6 + Math.random() * 4.2;
    }
  }

  if (forceOpen !== null) {
    openTarget = forceOpen;
  }
  if (forcedGaze) {
    gazeX = forcedGaze.x;
    gazeY = forcedGaze.y;
  }

  /* 边缘检测：合上 / 睁开各自给一次冲击 */
  const prev = state.openTarget;
  state.openTarget = clamp(openTarget, 0, 1);
  if (prev >= 0.35 && state.openTarget < 0.3 && now - lastFlashAt > 220) {
    lastFlashAt = now;
    fireFlash(1.0);
  }
  if (prev <= 0.55 && state.openTarget > 0.75) {
    state.spinBoost = Math.min(2.2, state.spinBoost + 0.45);
    state.flash = Math.max(state.flash, 0.32);
  }

  state.gazeTarget.x = gazeX;
  state.gazeTarget.y = gazeY;
  state.leanTarget.x = leanX;
  state.leanTarget.y = leanY;

  /* 平滑：视线快，脸/指针位置慢 */
  const gazeLerp = 1 - Math.exp(-11 * dt);
  state.gaze.x += (gazeX - state.gaze.x) * gazeLerp;
  state.gaze.y += (gazeY - state.gaze.y) * gazeLerp;

  const leanLerp = 1 - Math.exp(-3.5 * dt);
  state.lean.x += (leanX - state.lean.x) * leanLerp;
  state.lean.y += (leanY - state.lean.y) * leanLerp;

  /* 睁眼度：更硬的弹簧，让眨眼干脆 */
  const K = 150;
  const D = 17;
  state.openVel += (state.openTarget - state.open) * K * dt;
  state.openVel *= Math.exp(-D * dt);
  state.open += state.openVel * dt;
  if (state.open < 0) {
    state.open = 0;
    state.openVel *= 0.4;
  }
  if (state.open > 1) {
    state.open = 1;
    state.openVel *= 0.4;
  }

  state.flash *= Math.exp(-4.4 * dt);
  state.spinBoost *= Math.exp(-3.2 * dt);
}

/* ---------------- 帧循环 ---------------- */

let lastEyeLabel = '';
function updateHud() {
  const o = clamp(state.open, 0, 1);
  els.meterFill.style.transform = `scaleX(${o.toFixed(4)})`;
  els.meterKnob.style.left = `${(o * 100).toFixed(2)}%`;
  const label = o < 0.12 ? '闭合' : o < 0.5 ? '微睁' : '凝视';
  if (label !== lastEyeLabel) {
    lastEyeLabel = label;
    els.eyeState.textContent = label;
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  if (!eye) return;

  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  time += dt;

  const face = tracker.update(now);
  updateInput(dt, now, face);

  eye.update({
    time,
    dt,
    open: state.open,
    gaze: state.gaze,
    flash: state.flash,
    spinBoost: state.spinBoost,
    lean: state.lean,
  });
  eye.render();

  updateHud();
  drawPreview(face);

  fpsFrames += 1;
  if (now - fpsClock > 500) {
    const fps = Math.round((fpsFrames * 1000) / (now - fpsClock));
    els.fpsValue.textContent = String(Math.min(240, fps));
    fpsFrames = 0;
    fpsClock = now;
  }
}

/* ---------------- 启动 ---------------- */

const modeParam = params.get('mode');
let initialMode = 0;
if (modeParam !== null) initialMode = clamp(parseInt(modeParam, 10) || 0, 0, 2);
else {
  try {
    const saved = localStorage.getItem('iris-mode');
    if (saved !== null) initialMode = clamp(parseInt(saved, 10) || 0, 0, 2);
  } catch {}
}

if (eye) {
  setMode(initialMode, true);
  if (params.has('bloom')) {
    const b = parseFloat(params.get('bloom'));
    if (Number.isFinite(b)) eye.setBloom(b);
  }
  if (forceOpen !== null) {
    state.open = forceOpen;
    state.openTarget = forceOpen;
    state.openVel = 0;
  }
  if (forcedGaze) {
    state.gaze.x = forcedGaze.x;
    state.gaze.y = forcedGaze.y;
  }
}

if (hideUI) {
  document.querySelector('.topbar')?.setAttribute('style', 'display:none');
  els.intro?.setAttribute('style', 'display:none');
  els.preview?.setAttribute('style', 'display:none');
  els.toast?.setAttribute('style', 'display:none');
  state.started = true;
}

if (state.started) {
  els.hud.hidden = true;
}

if (eye) {
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });
  setTimeout(() => {
    if (!state.started || state.mode !== 'camera') tracker.ensureModel().catch(() => {});
  }, 2600);
}

window.__iris = { state, eye, tracker, setMode, triggerBlink, enableCamera, disableCamera };