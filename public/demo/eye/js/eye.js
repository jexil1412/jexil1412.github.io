import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/* ============================================================
   瞳渊 · 赛博异瞳
   ------------------------------------------------------------
   渲染层重构：
     1. 眼睛主体：plane + GLSL
        - 眼白：蓝紫渐变 + 眼眶暗角 + 环境反光
        - 虹膜：极坐标放射星芒、领状环、发光角膜缘
        - 瞳孔：菱形异形瞳孔 + 霓虹描边
        - 高光：step()/smoothstep() 切出的多边形“宝石切面”碎片
     2. 睫毛 / 眼眶：离屏 Canvas 2D 绘制成 CanvasTexture，
        上睑、下睑分开，上睑随眨眼下压
     3. 后期：强泛光（threshold 0.4）+ 轻微色差
   ============================================================ */

const MODES = [
  {
    id: 'cyan',
    name: '青焰',
    accent: '#6fe9ff',
    irisDeep: 0x020a14,
    irisMid: 0x075a78,
    irisBright: 0x8ff6ff,
    pupil: 0x01060f,
    sclera: 0x2a4a66,
    scleraDark: 0x03080f,
    neon: 0x39e6ff,
    rim: 0x5a7cff,
    glow: 0x7fe8ff,
    aura: 0x061a30,
    bloom: 1.0,
  },
  {
    id: 'crimson',
    name: '绯月',
    accent: '#ff5a9a',
    irisDeep: 0x0d0106,
    irisMid: 0x8a1248,
    irisBright: 0xffd0e4,
    pupil: 0x080103,
    sclera: 0x4a3038,
    scleraDark: 0x0a0308,
    neon: 0xff4a90,
    rim: 0xff6ab0,
    glow: 0xffa8cc,
    aura: 0x22081a,
    bloom: 0.95,
  },
  {
    id: 'amber',
    name: '琥珀',
    accent: '#ffc463',
    irisDeep: 0x0d0802,
    irisMid: 0x8a5a08,
    irisBright: 0xfff0c0,
    pupil: 0x060300,
    sclera: 0x4a3c24,
    scleraDark: 0x0a0601,
    neon: 0xffb545,
    rim: 0xffd27a,
    glow: 0xffd88c,
    aura: 0x201404,
    bloom: 0.95,
  },
];

/* ---------------- 几何常量 ---------------- */

const QW = 1.5;
const QH = 0.8;
const EYE_HALF = 1.15;
const IRIS_R = 0.46;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const EYE_FRAG = /* glsl */ `
uniform float uBlink;
uniform float uTime;
uniform vec2  uGaze;
uniform vec3  uIrisDeep;
uniform vec3  uIrisMid;
uniform vec3  uIrisBright;
uniform vec3  uPupil;
uniform vec3  uSclera;
uniform vec3  uScleraDark;
uniform vec3  uNeon;
uniform vec3  uRim;

varying vec2 vUv;

float lidA(float x) {
  float u = clamp(abs(x) / 1.15, 0.0, 1.0);
  return pow(max(0.0, 1.0 - pow(u, 2.0)), 0.58);
}
float topY(float x) {
  return 0.52 * lidA(x) * mix(0.02, 1.0, 1.0 - uBlink) + 0.03 * x;
}
float botY(float x) {
  return -0.48 * lidA(x) * mix(0.02, 0.95, 1.0 - uBlink) + 0.03 * x;
}

/* 三角形内部判定：两种绕向都接受，硬边 */
float cross2(vec2 a, vec2 b) {
  return a.x * b.y - a.y * b.x;
}
float inTri(vec2 p, vec2 a, vec2 b, vec2 c) {
  float d1 = cross2(b - a, p - a);
  float d2 = cross2(c - b, p - b);
  float d3 = cross2(a - c, p - c);
  bool allPos = (d1 >= 0.0 && d2 >= 0.0 && d3 >= 0.0);
  bool allNeg = (d1 <= 0.0 && d2 <= 0.0 && d3 <= 0.0);
  return (allPos || allNeg) ? 1.0 : 0.0;
}

void main() {
  vec2 q = vec2(mix(-${QW.toFixed(1)}, ${QW.toFixed(1)}, vUv.x),
                mix(-${QH.toFixed(1)}, ${QH.toFixed(1)}, vUv.y));

  float x = q.x;
  float top = topY(x);
  float bot = botY(x);

  /* 睑裂遮罩 */
  float ap = smoothstep(-0.008, 0.008, top - q.y)
           * smoothstep(-0.008, 0.008, q.y - bot)
           * smoothstep(1.18, 1.12, abs(x))
           * smoothstep(0.02, 0.1, 1.0 - uBlink);

  /* 关键：睑裂之外的像素直接丢弃，闭合时绝不可能穿模 */
  if (ap < 0.004) discard;

  vec2 c = uGaze * vec2(0.10, 0.06) + vec2(0.0, 0.02);
  vec2 ip = q - c;
  float dIris = length(ip);

  /* ---------- 眼白：渐变 + 眼眶暗角 + 蓝紫反光 ---------- */
  vec3 sclera = mix(uSclera, uScleraDark, smoothstep(0.3, 1.15, length(q * vec2(0.8, 1.0))));
  sclera *= 1.0 - 0.5 * exp(-max(0.0, top - q.y) * 12.0);
  sclera += uRim * 0.1 * smoothstep(0.55, 1.15, abs(x));
  sclera += uRim * 0.2 * exp(-max(0.0, q.y - bot) * 60.0);
  sclera += uNeon * 0.05 * exp(-max(0.0, top - q.y) * 40.0);

  /* ---------- 虹膜：极坐标星芒 ---------- */
  float r = dIris / ${IRIS_R.toFixed(2)};
  float ang = atan(ip.y, ip.x);

  vec3 iris = mix(uIrisDeep, uIrisMid, smoothstep(0.95, 0.25, r));
  iris = mix(iris, uIrisBright, smoothstep(0.55, 0.2, r) * 0.28);

  /* 星芒：atan2 生成笔直的放射线 */
  float spokes = pow(abs(sin(ang * 96.0)), 12.0);
  iris += uIrisBright * spokes * smoothstep(0.15, 0.4, r) * smoothstep(1.0, 0.7, r) * 0.8;

  float fine = pow(abs(sin(ang * 220.0 + r * 4.0)), 28.0);
  iris += uIrisBright * fine * 0.15;

  iris += uIrisBright * exp(-pow((r - 0.42) / 0.035, 2.0)) * 0.35;

  iris = mix(iris, uPupil, smoothstep(0.9, 0.99, r));
  iris += uNeon * exp(-pow((r - 1.0) / 0.025, 2.0)) * 1.0;

  /* ---------- 异形瞳孔：菱形 + 霓虹描边 ---------- */
  float pd = abs(ip.x) * 2.4 + abs(ip.y) * 1.0;
  float pupilR = 0.19;
  float inPupil = smoothstep(pupilR + 0.004, pupilR - 0.004, pd);
  iris = mix(iris, uPupil, inPupil);

  /* 瞳孔周围的暗环，让霓虹边更突出 */
  iris *= 1.0 - 0.5 * exp(-pow((pd - (pupilR + 0.025)) / 0.022, 2.0));

  float pupilEdge = exp(-abs(pd - pupilR) * 130.0);
  iris += uNeon * pupilEdge * 1.9;
  iris += uRim * exp(-abs(pd - pupilR) * 26.0) * 0.5;

  /* ---------- 宝石切面高光 ---------- */
  vec2 s1 = ip - vec2(-0.17, 0.2);
  float shard1 = inTri(s1, vec2(-0.07, -0.04), vec2(0.015, 0.09), vec2(0.08, -0.015));
  vec2 s2 = ip - vec2(0.2, -0.16);
  float shard2 = inTri(s2, vec2(-0.045, -0.015), vec2(0.015, 0.05), vec2(0.05, -0.03));
  vec2 s3 = ip - vec2(0.04, -0.27);
  float shard3 = inTri(s3, vec2(-0.07, -0.015), vec2(0.0, 0.018), vec2(0.05, -0.008));

  iris = mix(iris, vec3(1.0), clamp(shard1 + shard2 + shard3, 0.0, 1.0));
  iris += uNeon * 0.3 * (shard1 + shard2 + shard3);

  iris *= 0.72 + 0.4 * smoothstep(1.0, 0.2, r);

  /* ---------- 合成 ---------- */
  vec3 col = sclera;
  float irisMask = smoothstep(0.49, 0.46, dIris);
  col = mix(col, iris, irisMask * ap);

  col += uRim * 0.3 * exp(-abs(q.y - top) * 120.0) * ap;
  col += uRim * 0.14 * exp(-abs(q.y - bot) * 90.0) * ap;

  col *= 1.0 - 0.45 * smoothstep(0.75, 1.25, abs(x));

  gl_FragColor = vec4(col, ap);
}
`;

/* ---------------- Canvas 2D：上/下眼睑线稿 ---------------- */

const CANVAS_W = 2048;
const CANVAS_H = Math.round((CANVAS_W * QH * 2) / (QW * 2));

function qx(x) {
  return ((x + QW) / (QW * 2)) * CANVAS_W;
}
function qy(y) {
  return ((QH - y) / (QH * 2)) * CANVAS_H;
}

function lidAOf(x) {
  const u = Math.min(1, Math.abs(x) / EYE_HALF);
  return Math.pow(Math.max(0, 1 - Math.pow(u, 2.0)), 0.58);
}
function topOf(x) {
  return 0.52 * lidAOf(x) + 0.03 * x;
}
function botOf(x) {
  return -0.48 * lidAOf(x) + 0.03 * x;
}

/* 锐利的上眼线 + 睫毛 + 蓝紫边缘光 */
function drawUpperLid(ctx) {
  const W = CANVAS_W;
  const H = CANVAS_H;
  ctx.clearRect(0, 0, W, H);

  const samples = 46;
  const xs = [];
  for (let i = 0; i <= samples; i++) xs.push(-1.28 + (2.42 * i) / samples);

  const band = [];
  for (const x of xs) {
    const t = (x + 1.28) / 2.42;
    const thick = 0.004 + 0.1 * Math.pow(t, 1.5);
    band.push({ x, y: topOf(x), thick });
  }

  ctx.save();
  /* 外层蓝紫光 */
  ctx.shadowColor = 'rgba(90, 150, 255, 0.9)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = 'rgba(90, 150, 255, 0.28)';
  ctx.beginPath();
  for (let i = 0; i < band.length; i++) {
    const p = band[i];
    const t = i / (band.length - 1);
    const off = 0.03 * Math.sin(Math.PI * t);
    if (i === 0) ctx.moveTo(qx(p.x), qy(p.y + off));
    else ctx.lineTo(qx(p.x), qy(p.y + off));
  }
  for (let i = band.length - 1; i >= 0; i--) {
    const p = band[i];
    ctx.lineTo(qx(p.x), qy(p.y - p.thick * 2.6));
  }
  ctx.closePath();
  ctx.fill();

  /* 黑色眼线本体 */
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#02040a';
  ctx.beginPath();
  for (let i = 0; i < band.length; i++) {
    const p = band[i];
    if (i === 0) ctx.moveTo(qx(p.x), qy(p.y));
    else ctx.lineTo(qx(p.x), qy(p.y));
  }
  for (let i = band.length - 1; i >= 0; i--) {
    const p = band[i];
    ctx.lineTo(qx(p.x), qy(p.y - p.thick * 2.2));
  }
  ctx.closePath();
  ctx.fill();

  /* 外眼角挑线 */
  ctx.beginPath();
  ctx.moveTo(qx(1.02), qy(topOf(1.02) + 0.005));
  ctx.quadraticCurveTo(qx(1.24), qy(topOf(1.02) + 0.07), qx(1.38), qy(topOf(1.02) + 0.17));
  ctx.quadraticCurveTo(qx(1.2), qy(topOf(1.02) + 0.02), qx(1.0), qy(topOf(1.02) - 0.06));
  ctx.closePath();
  ctx.fill();

  /* 睫毛：6 根锐利尖梢 */
  const lashes = [
    { x0: 0.30, len: 0.24, ang: 0.55, w: 0.022 },
    { x0: 0.48, len: 0.30, ang: 0.52, w: 0.026 },
    { x0: 0.66, len: 0.36, ang: 0.46, w: 0.03 },
    { x0: 0.82, len: 0.40, ang: 0.40, w: 0.034 },
    { x0: 0.96, len: 0.36, ang: 0.34, w: 0.03 },
    { x0: 1.08, len: 0.28, ang: 0.28, w: 0.026 },
  ];
  for (const l of lashes) {
    const y0 = topOf(l.x0);
    const dx = Math.cos(l.ang) * l.len;
    const dy = Math.sin(l.ang) * l.len * 1.5;
    const tipX = l.x0 + dx;
    const tipY = y0 + dy;
    const midX = l.x0 + dx * 0.45 + 0.02;
    const midY = y0 + dy * 0.55;
    ctx.beginPath();
    ctx.moveTo(qx(l.x0 - l.w), qy(y0));
    ctx.quadraticCurveTo(qx(midX - l.w * 0.5), qy(midY), qx(tipX), qy(tipY));
    ctx.quadraticCurveTo(qx(midX + l.w * 1.3), qy(midY - 0.01), qx(l.x0 + l.w), qy(y0));
    ctx.closePath();
    ctx.fill();
  }

  /* 眼线内侧的冷光细边 */
  ctx.strokeStyle = 'rgba(120, 210, 255, 0.75)';
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(90, 150, 255, 0.9)';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  for (let i = 0; i < band.length; i++) {
    const p = band[i];
    const y = p.y - p.thick * 2.2;
    if (i === 0) ctx.moveTo(qx(p.x), qy(y));
    else ctx.lineTo(qx(p.x), qy(y));
  }
  ctx.stroke();

  /* 上睑褶 */
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(2, 6, 14, 0.9)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let i = 0; i < band.length; i++) {
    const p = band[i];
    const y = p.y + 0.10 + 0.04 * Math.sin(p.x * 2.0);
    if (i === 0) ctx.moveTo(qx(p.x), qy(y));
    else ctx.lineTo(qx(p.x), qy(y));
  }
  ctx.stroke();

  ctx.restore();
}

/* 下眼线 + 少量下睫毛 */
function drawLowerLid(ctx) {
  const W = CANVAS_W;
  const H = CANVAS_H;
  ctx.clearRect(0, 0, W, H);

  ctx.save();
  ctx.shadowColor = 'rgba(80, 140, 255, 0.8)';
  ctx.shadowBlur = 14;
  ctx.strokeStyle = 'rgba(120, 200, 255, 0.55)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const x = -1.12 + (2.2 * i) / 40;
    const y = botOf(x) + 0.015;
    if (i === 0) ctx.moveTo(qx(x), qy(y));
    else ctx.lineTo(qx(x), qy(y));
  }
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#02040a';
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const x = -1.12 + (2.2 * i) / 40;
    const y = botOf(x) + 0.012;
    if (i === 0) ctx.moveTo(qx(x), qy(y));
    else ctx.lineTo(qx(x), qy(y));
  }
  ctx.stroke();

  const lower = [
    { x0: 0.55, len: 0.07, ang: -0.75, w: 0.008 },
    { x0: 0.75, len: 0.09, ang: -0.7, w: 0.009 },
    { x0: 0.92, len: 0.08, ang: -0.65, w: 0.008 },
  ];
  ctx.fillStyle = '#02040a';
  for (const l of lower) {
    const y0 = botOf(l.x0);
    const dx = Math.cos(l.ang) * l.len;
    const dy = Math.sin(l.ang) * l.len;
    ctx.beginPath();
    ctx.moveTo(qx(l.x0 - l.w), qy(y0));
    ctx.lineTo(qx(l.x0 + dx), qy(y0 + dy));
    ctx.lineTo(qx(l.x0 + l.w), qy(y0));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/* 完全闭眼时的线稿：不再平移任何东西，和睁眼线稿交叉淡入淡出 */
function drawClosedLid(ctx) {
  const W = CANVAS_W;
  const H = CANVAS_H;
  ctx.clearRect(0, 0, W, H);

  const yAt = (x) => -0.02 + 0.018 * Math.sin(x * 2.2);
  const band = [];
  for (let i = 0; i <= 40; i++) {
    const x = -1.06 + (2.16 * i) / 40;
    const t = (x + 1.06) / 2.16;
    band.push({ x, y: yAt(x), thick: 0.018 + 0.05 * Math.pow(t, 1.3) });
  }

  ctx.save();
  ctx.shadowColor = 'rgba(90, 150, 255, 0.9)';
  ctx.shadowBlur = 18;
  ctx.fillStyle = 'rgba(90, 150, 255, 0.26)';
  ctx.beginPath();
  for (let i = 0; i < band.length; i++) {
    const p = band[i];
    const off = 0.02 * Math.sin((Math.PI * i) / (band.length - 1));
    if (i === 0) ctx.moveTo(qx(p.x), qy(p.y + off));
    else ctx.lineTo(qx(p.x), qy(p.y + off));
  }
  for (let i = band.length - 1; i >= 0; i--) {
    const p = band[i];
    ctx.lineTo(qx(p.x), qy(p.y - p.thick * 2.4));
  }
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#02040a';
  ctx.beginPath();
  for (let i = 0; i < band.length; i++) {
    const p = band[i];
    if (i === 0) ctx.moveTo(qx(p.x), qy(p.y));
    else ctx.lineTo(qx(p.x), qy(p.y));
  }
  for (let i = band.length - 1; i >= 0; i--) {
    const p = band[i];
    ctx.lineTo(qx(p.x), qy(p.y - p.thick * 2.0));
  }
  ctx.closePath();
  ctx.fill();

  /* 闭眼时向下垂的睫毛：先画发光边，再覆盖纯黑 */
  const lashes = [
    { x0: 0.34, len: 0.12, ang: -1.0, w: 0.011 },
    { x0: 0.56, len: 0.17, ang: -0.9, w: 0.014 },
    { x0: 0.78, len: 0.2, ang: -0.8, w: 0.016 },
    { x0: 0.98, len: 0.16, ang: -0.7, w: 0.013 },
  ];
  for (const pass of [0, 1]) {
    ctx.save();
    if (pass === 0) {
      ctx.shadowColor = 'rgba(90, 150, 255, 0.95)';
      ctx.shadowBlur = 12;
      ctx.fillStyle = 'rgba(90, 150, 255, 0.32)';
    } else {
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#02040a';
    }
    for (const l of lashes) {
      const y0 = yAt(l.x0);
      const dx = Math.cos(l.ang) * l.len;
      const dy = Math.sin(l.ang) * l.len;
      const tipX = l.x0 + dx;
      const tipY = y0 + dy;
      const midX = l.x0 + dx * 0.45 + 0.01;
      const midY = y0 + dy * 0.5;
      const ww = pass === 0 ? l.w * 1.3 : l.w;
      ctx.beginPath();
      ctx.moveTo(qx(l.x0 - ww), qy(y0));
      ctx.quadraticCurveTo(qx(midX - ww * 0.4), qy(midY), qx(tipX), qy(tipY));
      ctx.quadraticCurveTo(qx(midX + ww * 1.0), qy(midY - 0.008), qx(l.x0 + ww), qy(y0));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /* 冷光细边 */
  ctx.strokeStyle = 'rgba(120, 210, 255, 0.65)';
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(90, 150, 255, 0.9)';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  for (let i = 0; i < band.length; i++) {
    const p = band[i];
    const y = p.y - p.thick * 2.0;
    if (i === 0) ctx.moveTo(qx(p.x), qy(y));
    else ctx.lineTo(qx(p.x), qy(y));
  }
  ctx.stroke();
  ctx.restore();
}

/* 线稿材质：用透明通道过滤边缘残留 + uAlpha 交叉淡入淡出 */
const LASH_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const LASH_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  vec4 tex = texture2D(uMap, vUv);
  if (tex.a < 0.006) discard;
  gl_FragColor = vec4(tex.rgb, tex.a * uAlpha);
}
`;

function makeLashMaterial(texture, alpha) {
  return new THREE.ShaderMaterial({
    vertexShader: LASH_VERT,
    fragmentShader: LASH_FRAG,
    uniforms: {
      uMap: { value: texture },
      uAlpha: { value: alpha },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
}

function makeCanvasTexture(draw) {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/* ---------------- 背景 ---------------- */

const BG_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const BG_FRAG = /* glsl */ `
uniform vec3  uDeep;
uniform vec3  uAura;
uniform float uAspect;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  p.x *= uAspect;
  float d = length(p * vec2(0.85, 1.65));
  vec3 col = mix(uAura, uDeep, smoothstep(0.02, 0.65, d));
  col *= 1.0 - smoothstep(0.3, 0.85, d) * 0.7;
  col += vec3(0.01) * (0.5 + 0.5 * sin(vUv.y * 1400.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

/* ---------------- 色差后期 ---------------- */

const CA_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uAmount: { value: 0.0016 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uAmount;
    varying vec2 vUv;
    void main() {
      vec2 d = (vUv - 0.5) * uAmount;
      float r = texture2D(tDiffuse, vUv + d).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - d).b;
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `,
};

export function createEye(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x01030a, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 60);
  camera.position.set(0, 0, 7.2);
  camera.lookAt(0, 0, 0);

  /* 背景 */
  const bgUniforms = {
    uDeep: { value: new THREE.Color(0x01030a) },
    uAura: { value: new THREE.Color(MODES[0].aura) },
    uAspect: { value: 1.6 },
  };
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      vertexShader: BG_VERT,
      fragmentShader: BG_FRAG,
      uniforms: bgUniforms,
      depthWrite: false,
      depthTest: false,
    })
  );
  bg.position.z = -2.5;
  bg.renderOrder = -10;
  scene.add(bg);

  /* 眼睛主体 */
  const eyeUniforms = {
    uBlink: { value: 0 },
    uTime: { value: 0 },
    uGaze: { value: new THREE.Vector2(0, 0) },
    uIrisDeep: { value: new THREE.Color(MODES[0].irisDeep) },
    uIrisMid: { value: new THREE.Color(MODES[0].irisMid) },
    uIrisBright: { value: new THREE.Color(MODES[0].irisBright) },
    uPupil: { value: new THREE.Color(MODES[0].pupil) },
    uSclera: { value: new THREE.Color(MODES[0].sclera) },
    uScleraDark: { value: new THREE.Color(MODES[0].scleraDark) },
    uNeon: { value: new THREE.Color(MODES[0].neon) },
    uRim: { value: new THREE.Color(MODES[0].rim) },
  };
  const eyeMat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: EYE_FRAG,
    uniforms: eyeUniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const eye = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), eyeMat);
  eye.position.z = 0;
  eye.renderOrder = 0;
  scene.add(eye);

  /* Canvas 2D 线稿：睁眼 / 闭眼两套，交叉淡入淡出，不做位移 */
  const upperTex = makeCanvasTexture(drawUpperLid);
  const lowerTex = makeCanvasTexture(drawLowerLid);
  const closedTex = makeCanvasTexture(drawClosedLid);

  const lashMatUpper = makeLashMaterial(upperTex, 1);
  const lashMatLower = makeLashMaterial(lowerTex, 1);
  const lashMatClosed = makeLashMaterial(closedTex, 0);

  const upper = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), lashMatUpper);
  upper.position.z = 0.2;
  upper.renderOrder = 2;
  scene.add(upper);

  const lower = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), lashMatLower);
  lower.position.z = 0.15;
  lower.renderOrder = 1;
  scene.add(lower);

  const closedLid = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), lashMatClosed);
  closedLid.position.z = 0.18;
  closedLid.renderOrder = 2;
  scene.add(closedLid);

  /* 后期 */
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(window.innerWidth, window.innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    MODES[0].bloom,
    0.65,
    0.45
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  const caPass = new ShaderPass(CA_SHADER);
  composer.addPass(caPass);

  const state = { mode: 0, bloomBase: MODES[0].bloom, bloomOverride: null };

  function applyMode(i) {
    state.mode = i % MODES.length;
    const m = MODES[state.mode];
    eyeUniforms.uIrisDeep.value.setHex(m.irisDeep);
    eyeUniforms.uIrisMid.value.setHex(m.irisMid);
    eyeUniforms.uIrisBright.value.setHex(m.irisBright);
    eyeUniforms.uPupil.value.setHex(m.pupil);
    eyeUniforms.uSclera.value.setHex(m.sclera);
    eyeUniforms.uScleraDark.value.setHex(m.scleraDark);
    eyeUniforms.uNeon.value.setHex(m.neon);
    eyeUniforms.uRim.value.setHex(m.rim);
    bgUniforms.uAura.value.setHex(m.aura);
    state.bloomBase = m.bloom;
    if (state.bloomOverride === null) bloomPass.strength = m.bloom;
  }

  function setMode(i) {
    if (i === state.mode) return;
    applyMode(i);
  }

  function setBloom(v) {
    state.bloomOverride = v;
    bloomPass.strength = v;
  }

  function resize(w, h) {
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);

    const aspect = w / Math.max(1, h);
    const halfTan = Math.tan((camera.fov * Math.PI) / 360);
    const Hw = 7.2 * halfTan;

    const bgDist = 7.2 + 2.5;
    const bgH = bgDist * halfTan * 2 * 1.12;
    bg.scale.set(bgH * aspect, bgH, 1);
    bgUniforms.uAspect.value = aspect;

    const fill = aspect < 1 ? 0.9 : 0.68;
    const qToWorld = (fill * 2 * Hw * aspect) / (QW * 2);
    eye.scale.set(QW * 2 * qToWorld, QH * 2 * qToWorld, 1);
    upper.scale.copy(eye.scale);
    lower.scale.copy(eye.scale);
    closedLid.scale.copy(eye.scale);
    upper.userData.baseScale = qToWorld;
  }

  function update({ time, open, gaze, flash }) {
    const blink = 1 - open;
    eyeUniforms.uBlink.value = blink;
    eyeUniforms.uTime.value = time;
    eyeUniforms.uGaze.value.set(gaze.x, gaze.y);

    /* 线稿跟随眼睑平移，同时透明度交叉淡入淡出；
     眼白/虹膜已经在 shader 里被 SDF 裁掉，因此不会出现穿插 */
    const qToWorld = upper.userData.baseScale || 1;
    upper.position.y = -0.51 * (1 - open) * qToWorld;
    lower.position.y = 0.47 * (1 - open) * qToWorld;
    closedLid.position.y = 0;

    const openAlpha = 1 - Math.min(1, Math.max(0, (blink - 0.55) / 0.27));
    const lowerAlpha = 1 - Math.min(1, Math.max(0, (blink - 0.1) / 0.35));
    const closedAlpha = Math.min(1, Math.max(0, (blink - 0.4) / 0.4));
    lashMatUpper.uniforms.uAlpha.value = openAlpha;
    lashMatLower.uniforms.uAlpha.value = lowerAlpha;
    lashMatClosed.uniforms.uAlpha.value = closedAlpha;

    if (state.bloomOverride === null) {
      bloomPass.strength = state.bloomBase * (0.9 + 0.1 * open) + flash * 0.3;
    }
  }

  function render() {
    composer.render();
  }

  applyMode(0);
  resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', () => resize(window.innerWidth, window.innerHeight));

  return {
    update,
    render,
    resize,
    setMode,
    setBloom,
    modes: MODES,
    get mode() {
      return state.mode;
    },
    bloomPass,
    renderer,
    scene,
    camera,
  };
}