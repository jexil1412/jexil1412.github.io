// 主程序：贴图（走 http）、超采样、视角控制
const canvas = document.getElementById('c');
const errBox = document.getElementById('e');
const status = document.getElementById('s');

if (location.protocol === 'file:') {
  errBox.style.display = 'grid';
  errBox.textContent = '请用本地服务打开：\n\n  node serve.mjs\n\n然后在浏览器访问 http://127.0.0.1:8123/\n（file:// 直开时浏览器禁止 WebGL 读取本地贴图）';
  throw 0;
}

const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, powerPreference: 'high-performance' });
if (!gl) { errBox.style.display = 'grid'; errBox.textContent = '需要 WebGL2。'; throw 0; }

/* ---------------- 场景 ---------------- */
const ALT = 0.10;                        // 相机高度（地球半径为单位）≈ 640 km
const LAT = 0.34;                        // 相机纬度 ≈ 19°N
const RELIEF = 2.2;                      // 法线贴图强度
const DAY_OFFSET = 0.55;                 // 相机相对太阳直射点的经度差（弧度）≈ 2 小时，下午光

// 真实太阳方位（近似）：赤纬 + 太阳直射点经度，误差约 0.5°
function sunFromUTC(d) {
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const N = (d.getTime() - start) / 86400000;
  const decl = (23.44 * Math.PI / 180) * Math.sin(2 * Math.PI * (N - 81) / 365.24);
  const utcH = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const lon = -(utcH - 12) * 15 * Math.PI / 180;
  return { lat: decl, lon };
}
const sunNow = sunFromUTC(new Date());
const LON = sunNow.lat === undefined ? 0 : sunNow.lon - DAY_OFFSET;   // 相机放在太阳直射点西侧
const CAM = norm([Math.cos(LAT) * Math.cos(LON), Math.sin(LAT), Math.cos(LAT) * Math.sin(LON)]).map((v) => v * (1 + ALT));
const MOON = norm([0.22, 0.66, -0.72]);
const sunDirOf = (s) => norm([Math.cos(s.lat) * Math.cos(s.lon), Math.sin(s.lat), Math.cos(s.lat) * Math.sin(s.lon)]);
let SUN = sunDirOf(sunNow);

const UP = norm(CAM);
const NORTH = norm([0 - UP[0] * UP[1], 1 - UP[1] * UP[1], 0 - UP[2] * UP[1]]);
const EAST = [NORTH[1] * UP[2] - NORTH[2] * UP[1], NORTH[2] * UP[0] - NORTH[0] * UP[2], NORTH[0] * UP[1] - NORTH[1] * UP[0]];
const YAW0 = 0.18, PITCH0 = -0.40;
let yaw = YAW0, pitch = PITCH0;

function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

/* ---------------- 管线 ---------------- */
const mk = (type, src) => {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
};
const prog = gl.createProgram();
gl.attachShader(prog, mk(gl.VERTEX_SHADER, VS));
gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FS));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { errBox.style.display = 'grid'; errBox.textContent = gl.getProgramInfoLog(prog); throw 0; }
gl.useProgram(prog);
const U = {};
for (const n of ['uRes', 'uTime', 'uRelief', 'uCam', 'uSun', 'uMoonDir', 'uFwd', 'uRight', 'uUp', 'uTexel']) U[n] = gl.getUniformLocation(prog, n);
gl.bindVertexArray(gl.createVertexArray());

/* ---------------- 贴图 ---------------- */
// [uniform 名, 路径, 纹理单元, 是否单通道(灰度,省 4 倍显存)]
const TEX = [
  ['uDay', 'assets/day8k.jpg', 0, 0],
  ['uClouds', 'assets/clouds8k.jpg', 1, 1],
  ['uLights', 'assets/night8k.jpg', 2, 0],
  ['uSpec', 'assets/spec.jpg', 3, 0],
  ['uNorm', 'assets/normal.jpg', 4, 0],
  ['uMoon', 'assets/moon8k.jpg', 5, 0],
];
let loaded = 0;
function loadTex(name, url, unit, gray) {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([8, 10, 16, 255]));
  gl.uniform1i(gl.getUniformLocation(prog, name), unit);
  const img = new Image();
  img.onload = () => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (gray) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, img);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const an = gl.getExtension('EXT_texture_filter_anisotropic');
    if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, 16);
    // 反锐化半径必须跟着贴图实际分辨率走，写死会在降级版上失效
    if (name === 'uDay') gl.uniform2f(U.uTexel, 1 / img.width, 1 / img.height);
    if (++loaded === TEX.length) status.textContent = '';
    else status.textContent = `贴图加载中 ${loaded}/${TEX.length}`;
  };
  img.onerror = () => { status.textContent = '贴图加载失败：' + url; };
  img.src = url;
}
for (const [name, url, unit, gray] of TEX) loadTex(name, url, unit, gray);
status.textContent = '贴图加载中 0/' + TEX.length;

/* ---------------- 控制 ---------------- */
const keys = { f: 0, b: 0, l: 0, r: 0 };
let drag = false, lx = 0, ly = 0;
addEventListener('pointerdown', (ev) => {
  if (ev.target.closest && ev.target.closest('#pad')) return;
  drag = true; lx = ev.clientX; ly = ev.clientY;
});
addEventListener('pointermove', (ev) => {
  if (!drag) return;
  yaw += (ev.clientX - lx) * 0.0022;
  pitch = Math.max(-1.52, Math.min(1.2, pitch - (ev.clientY - ly) * 0.0022));
  lx = ev.clientX; ly = ev.clientY;
});
for (const t of ['pointerup', 'pointercancel', 'pointerleave']) addEventListener(t, () => { drag = false; });

const pad = document.getElementById('pad');
pad.addEventListener('pointerdown', (ev) => {
  const b = ev.target.closest('button'); if (!b) return;
  ev.preventDefault();
  const k = b.dataset.k;
  if (k === 'c') { yaw = YAW0; pitch = PITCH0; return; }
  keys[k] = 1; b.classList.add('on');
  try { b.setPointerCapture(ev.pointerId); } catch {}
});
for (const t of ['pointerup', 'pointercancel']) {
  pad.addEventListener(t, (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    const k = b.dataset.k; if (k in keys) { keys[k] = 0; b.classList.remove('on'); }
  });
}
const release = () => { keys.f = keys.b = keys.l = keys.r = 0; document.querySelectorAll('#pad button').forEach((b) => b.classList.remove('on')); };
for (const t of ['pointerup', 'pointercancel', 'blur']) addEventListener(t, release);

const KEYMAP = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r' };
addEventListener('keydown', (ev) => { const k = KEYMAP[ev.code]; if (k) { keys[k] = 1; ev.preventDefault(); } });
addEventListener('keyup', (ev) => { const k = KEYMAP[ev.code]; if (k) keys[k] = 0; });

const view = { fwd: [0, 0, 0], right: [0, 0, 0], up: [0, 0, 0] };
function updateView() {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), sy = Math.sin(yaw), cy = Math.cos(yaw);
  for (let i = 0; i < 3; i++) view.fwd[i] = NORTH[i] * cp * cy + EAST[i] * cp * sy + UP[i] * sp;
  const l = Math.hypot(...view.fwd); for (let i = 0; i < 3; i++) view.fwd[i] /= l;
  const r = [view.fwd[1] * UP[2] - view.fwd[2] * UP[1], view.fwd[2] * UP[0] - view.fwd[0] * UP[2], view.fwd[0] * UP[1] - view.fwd[1] * UP[0]];
  const rl = Math.hypot(...r); for (let i = 0; i < 3; i++) view.right[i] = r[i] / rl;
  view.up = [view.right[1] * view.fwd[2] - view.right[2] * view.fwd[1], view.right[2] * view.fwd[0] - view.right[0] * view.fwd[2], view.right[0] * view.fwd[1] - view.right[1] * view.fwd[0]];
}

/* ---------------- 循环（2× 超采样） ---------------- */
const SS = 2;
let last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
  last = now;
  if (document.hidden) return;
  const t = now / 1000;

  const sp = 0.75 * dt;
  yaw += (keys.r - keys.l) * sp;
  pitch = Math.max(-1.52, Math.min(1.2, pitch + (keys.f - keys.b) * sp));

  const w = Math.round((canvas.clientWidth || innerWidth) * Math.min(devicePixelRatio || 1, 2) * SS);
  const h = Math.round((canvas.clientHeight || innerHeight) * Math.min(devicePixelRatio || 1, 2) * SS);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }

  updateView();
  gl.uniform2f(U.uRes, w, h);
  gl.uniform1f(U.uTime, t);
  gl.uniform1f(U.uRelief, RELIEF);
  gl.uniform3fv(U.uCam, CAM);
  SUN = sunDirOf(sunFromUTC(new Date()));   // 真实 UTC 太阳方位，晨昏线随之移动
  gl.uniform3fv(U.uSun, SUN);
  gl.uniform3fv(U.uMoonDir, MOON);
  gl.uniform3fv(U.uFwd, view.fwd);
  gl.uniform3fv(U.uRight, view.right);
  gl.uniform3fv(U.uUp, view.up);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
requestAnimationFrame(frame);
