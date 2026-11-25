# 瞳渊 · 赛博异瞳

`finger-bloom` 的继任项目：把「手势控制粒子花」改成「面部控制的赛博异瞳」。

渲染层按最新要求重做：**用离屏 Canvas 2D 画锐利线稿（睫毛 / 眼眶）并转成 CanvasTexture 叠加，虹膜、异形瞳孔、宝石切面高光全部用 GLSL 重写，后期加弱色差和强泛光**。

| 青焰 | 绯月 | 琥珀 |
| --- | --- | --- |
| ![青焰](preview/cyan.png) | ![绯月](preview/crimson.png) | ![琥珀](preview/amber.png) |

| 眨眼（闭眼） | 指针模式 |
| --- | --- |
| ![闭眼](preview/closed.png) | ![指针](preview/pointer.png) |

完整界面 / 竖屏：

| 桌面 | 移动端 |
| --- | --- |
| ![桌面](preview/desktop.png) | ![移动端](preview/mobile.png) |

## 运行

Node 18+，没有 npm 依赖，所有库、WASM 和模型都在本地。

```bash
cd eye-bloom
node server.mjs            # → http://127.0.0.1:5182/
# 或 npm run dev
```

也可以换成任意静态服务器（`npx serve .`、`python -m http.server`）。

> 不要双击 `index.html`：ES Module、WASM、摄像头权限都需要 HTTP 来源。`localhost` 属于安全上下文。

## 交互

| 操作 | 效果 |
| --- | --- |
| 眨眼 | 着色器按 SDF 裁掉睑裂外的像素；睁眼 / 闭眼两套线稿交叉淡入淡出，上睑眼线跟随睑缘平移，下睑先淡出 |
| 转动视线 / 头部 | 虹膜、菱形瞳孔、宝石高光一起偏移 |
| 鼠标移动 | 指针模式：视线跟随指针 |
| 点击画面 / `空格` | 指针模式：眨眼一次 |
| `1` `2` `3` | 切换瞳色（青焰 / 绯月 / 琥珀） |
| `C` / `F` | 摄像头开关 / 全屏 |

无摄像头、拒绝授权或非安全上下文时，自动切到指针模式并在顶部提示；右上角相机按钮可以重试。

## 渲染架构

### 1. Canvas 2D 线稿 → CanvasTexture

`js/eye.js` 里 `drawUpperLid(ctx)` / `drawLowerLid(ctx)` 在离屏 canvas（2048×1092）上画：

- **上眼线**：沿眼睑曲线采样的填充带，内眼角收成尖，外眼角加粗并挑出楔形眼尾；
- **睫毛**：6 根用二次贝塞尔曲线围成的锐利尖梢，长短、角度错开；
- **蓝紫边缘光**：先用 `ctx.shadowColor = rgba(90,150,255,.9)`、`shadowBlur` 画一遍外扩形，再覆盖纯黑本体，最后在眼线内侧描一条冷光细边；
- **上睑褶**：一条更细的暗线；
- **下眼睑**：细下眼线 + 3 根短下睫毛。

Canvas 坐标和 shader 的 q 坐标严格对齐（q ∈ [-1.5,1.5]×[-0.8,0.8]）：

```js
const qx = (x) => ((x + 1.5) / 3.0) * W;
const qy = (y) => ((0.8 - y) / 1.6) * H;
```

两张纹理分别贴到上下两个 plane。眨眼时上睑 plane 下压 0.5 个 q、下睑 plane 上移 0.48 个 q，并淡出下睑线稿；眼白/虹膜在 shader 里同时被 `apertureMask` 裁掉。

### 2. GLSL：眼白 / 虹膜 / 异形瞳孔 / 碎片高光

`EYE_FRAG` 的关键实现：

- **眼白**：不是纯白，`uSclera → uScleraDark` 的蓝灰渐变 + 眼眶暗角，靠近上睑压暗，下睑与眼角叠加蓝紫环境反光；
- **放射星芒**：极坐标 `atan2` + `pow(abs(sin(ang * 96.0)), 12.0)` 生成笔直的细密放射线，再叠一层 `sin(ang * 220.0)` 的更细星芒；`exp(-((r-0.42)/0.035)^2)` 做领状环；
- **异形瞳孔**：菱形距离场 `pd = |x|*2.4 + |y|`，`pupilR = 0.19` 内部填深色，边缘用 `exp(-|pd-pupilR|*130)` 叠青色霓虹描边，外侧再加一层蓝紫外扩光；
- **宝石切面高光**：`inTri()` 用三个叉积判定三角形内部（两种绕向都接受），切出 3 块纯白碎片，右上主碎片 + 左下副碎片 + 下方细长切面，硬边、无圆形亮斑；
- **角膜缘**：暗环 + 霓虹外缘；
- **睑缘边缘光**：上下睑内侧各一条蓝紫 `exp` 光。

### 3. 后期：强泛光 + 色差

```js
new UnrealBloomPass(resolution, 1.0, 0.65, 0.45) // strength, radius, threshold
```

- 只有宝石切面、菱形瞳孔霓虹边、虹膜亮环和睫毛冷光会过阈值发光；眼白压暗，保证暗部深邃。
- 最后一道 `ShaderPass` 做极轻色差：R/B 通道沿径向各偏移 `0.0016`。
- ACES 色调映射，曝光 1.05。

### 4. 眨眼防穿模（本次修复）

之前闭眼时上下线稿分别平移，交叠处会出现眼白、睫毛、虹膜穿插和黑色阴影撕裂。现在改成：

1. **`uBlink` 单选**：0 完全睁眼、1 完全闭眼。眼白 / 虹膜 Shader 用上下睑曲线算出 SDF，睑裂外的像素直接 `discard`：

```glsl
float ap = smoothstep(-0.008, 0.008, top - q.y)
         * smoothstep(-0.008, 0.008, q.y - bot)
         * smoothstep(1.18, 1.12, abs(x))
         * smoothstep(0.02, 0.1, 1.0 - uBlink);
if (ap < 0.004) discard;
```

2. **线稿不再互相插进去**：新增一张闭眼 Canvas 线稿；睁眼线稿和闭眼线稿只做透明度交叉淡入淡出。上睑眼线跟随睑缘做小幅度平移（`-0.51 * (1-open)`），下睑线稿在眨眼开始后 0.1~0.45 之间先淡出，避免和上睑线稿交叠。
3. **线稿材质自己裁剪**：自定义 `ShaderMaterial` 对 `CanvasTexture` 的 alpha 做阈值丢弃，消除 canvas 边缘的半透明残留：

```glsl
vec4 tex = texture2D(uMap, vUv);
if (tex.a < 0.006) discard;
gl_FragColor = vec4(tex.rgb, tex.a * uAlpha);
```

4. 所有线稿材质保持 `transparent: true, depthWrite: false, depthTest: false`，渲染顺序为背景 → 眼白/虹膜 → 下睑 → 上睑 → 闭眼线稿。

这样闭眼时两侧像素直接消失，不可能再发生几何穿模；眼线也能贴着睑缘收拢，不会出现「眼线还在原处、眼白已经缩成一条缝」的错位。

### 5. 三套瞳色

`MODES` 只换 `irisDeep/irisMid/irisBright/pupil/sclera/scleraDark/neon/rim/aura/bloom`，线稿层保持一致（冷光边固定蓝紫）。

## 面部追踪

### 1. 睁眼度：EAR + blendshape

478 点里有两组标准 6 点眼形：

```js
EAR = (|p2 − p6| + |p3 − p5|) / (2 · |p1 − p4|)
// 右眼 [33,160,158,133,153,144]   左眼 [362,385,387,263,373,380]
```

`p2/p6`、`p3/p5` 必须是上下眼睑的垂直配对；写成对角线时「闭眼」仍会算出 0.2。左右眼平均后映射到 0..1。模型同时输出 52 个 blendshape，取 `eyeBlinkLeft/Right` 与 EAR 两者中更「闭眼」的那个：

```js
const openness = blendshapes ? min(earOpen, 1 - smoothstep(0.25, 0.8, blink)) : earOpen;
```

开发中这个公式被合成关键点单测卡过：张开 EAR 0.667 → openness 1.000，闭眼 0.000 → 0.000。

### 2. 视线：虹膜相对眼眶

虹膜中心（478 点版本的 468 / 473）相对内外眼角归一化，再取双眼平均、镜像、加增益：

```js
gx = (irisX - eyeCenterX) / eyeWidth;
gazeX = clamp(-gx * 2.4, -1, 1);
```

着色器里虹膜最多偏移约 0.10 个睑裂宽度，看起来是「眼球在转」，而不是线稿在滑。

### 3. 状态机（`main.js`）

输入源都只产出 `open`、`gaze`、`lean` 三个量。

- 睁眼度用硬弹簧（K=150、D=17），眨眼干脆；视线 11/s 平滑；
- 闭眼 / 睁眼边沿触发一次泛光变化；
- 摄像头模式下，短于 260 ms 的旧数据视为「人离开」，状态栏变为「寻找面部」；
- 没有面部也没有指针操作时，瞳孔缓慢漂移，每 4–7 秒自动眨一次；
- 瞳色写入 `localStorage`，刷新后保留。

### 4. 降级与隐私

- 摄像头不可用 → 指针模式（鼠标控制视线，点击眨眼）；
- 推理全部在浏览器本地完成，视频流不上传、不落盘；
- 模型优先 GPU delegate，失败自动回退 CPU；
- 只有一个眼睛 plane + 两个线稿 plane + 三道后期，桌面和手机都能跑。

## 目录

```
eye-bloom/
├─ index.html
├─ css/style.css          视觉系统（暗室观测仪 × 赛博异瞳）
├─ js/
│  ├─ main.js             状态机、输入仲裁、HUD、面部网格预览
│  ├─ eye.js              Canvas 2D 线稿 + GLSL 虹膜/瞳孔/高光 + 泛光/色差
│  └─ face.js             Face Landmarker 封装、EAR / 视线公式
├─ models/
│  └─ face_landmarker.task
├─ vendor/                three r169 + MediaPipe tasks-vision 0.10.14
├─ server.mjs             零依赖静态服务器（默认 5182）
└─ preview/
```

## 可调参数

- 眼型：`EYE_FRAG` 里的 `lidA / topY / botY`，以及 Canvas 里的 `topOf / botOf`（两处必须一致）；
- 眼睛大小：`resize()` 的 `fill`（默认 0.68）；
- 虹膜半径：`IRIS_R = 0.46`；菱形瞳孔：`pupilR = 0.19`；
- 星芒密度：`sin(ang * 96.0)` / `sin(ang * 220.0)`；
- 宝石碎片：`inTri()` 的三组顶点；
- 眼线粗细 / 眼尾：`drawUpperLid` 里的 `thick`、外眼角 `quadraticCurveTo`；
- 睫毛：`lashes` 数组的 `x0 / len / ang / w`；
- 泛光：`UnrealBloomPass(res, strength, radius, threshold)`；
- 色差：`CA_SHADER.uAmount`；
- 眨眼：`uBlink` 与 `topY / botY` 的曲线；线稿位移量在 `update()` 的 `-0.51 / 0.47`；交叉淡入淡出区间在 `openAlpha / lowerAlpha / closedAlpha`。

## 验收记录

无头 Edge（SwiftShader）+ 假摄像头实测：

- 青焰 / 绯月 / 琥珀、睁眼 / 闭眼、指针模式、移动端竖屏均正常渲染，控制台无 JS 异常；
- 假摄像头 → 进入「摄像头 · 寻找面部」，预览与面部网格画布正常；
- 合成 478 点单测：张开 1.000、闭眼 0.000、视线 `(-0.72, 0.57)`、blendshape 闭眼 0.000；
- 闭眼时眼白与虹膜完全隐去，上睑线稿下压、下睑线稿淡出，只剩眼线与睫毛；
- 摄像头 / 指针模式切换、`1/2/3` 换色、空格眨眼均正常。

## 依赖与许可

- [three.js r169](https://threejs.org/) — MIT
- [MediaPipe Tasks Vision 0.10.14](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker) — Apache-2.0
- 模型：`https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`

项目为原创实现，线稿由 Canvas 2D 实时绘制，虹膜与高光由 GLSL 实时生成。