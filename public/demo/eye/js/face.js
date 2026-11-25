/* ============================================================
   MediaPipe Face Landmarker 封装
   ------------------------------------------------------------
   478 个面部关键点 + 52 个 blendshape。
   · 睁眼度：EAR（眼宽高比）+ blendshape 的 eyeBlinkLeft/Right 融合
   · 视线：虹膜中心相对眼眶的位置（归一化后 -1..1）
   所有计算都做了尺度归一化，不同脸型 / 镜头距离都能用。
   ============================================================ */

const MODEL_URL = new URL('../models/face_landmarker.task', import.meta.url).href;
const WASM_PATH = new URL('../vendor/mediapipe/wasm', import.meta.url).href;

/* MediaPipe Face Mesh 的 6 点 EAR 标准取点 */
const EYES = {
  right: { p: [33, 160, 158, 133, 153, 144], iris: 468, outer: 33, inner: 133 },
  left: { p: [362, 385, 387, 263, 373, 380], iris: 473, outer: 263, inner: 362 },
};

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z - b.z) * 0.4;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function eyeMetrics(lm, cfg) {
  const [p1, p2, p3, p4, p5, p6] = cfg.p;
  const ear =
    (dist(lm[p2], lm[p6]) + dist(lm[p3], lm[p5])) /
    Math.max(1e-5, 2 * dist(lm[p1], lm[p4]));

  const outer = lm[cfg.outer];
  const inner = lm[cfg.inner];
  const cx = (outer.x + inner.x) / 2;
  const cy = (outer.y + inner.y) / 2;
  const width = Math.max(1e-5, dist(outer, inner));
  const height = Math.max(1e-5, (dist(lm[p2], lm[p6]) + dist(lm[p3], lm[p5])) / 2);

  const iris = lm[cfg.iris];
  return {
    ear,
    cx,
    cy,
    width,
    height,
    irisX: iris ? iris.x : cx,
    irisY: iris ? iris.y : cy,
    iris,
  };
}

/**
 * 由 478 点 + blendshapes 推出睁眼度与视线。
 * 图像坐标 x 向右、y 向下；gaze 已翻转成屏幕坐标（y 向上）。
 */
export function measureFace(landmarks, blendshapes) {
  const right = eyeMetrics(landmarks, EYES.right);
  const left = eyeMetrics(landmarks, EYES.left);

  const ear = (right.ear + left.ear) / 2;
  const earOpen = smoothstep(0.1, 0.27, ear);

  let blink = 0;
  if (blendshapes) {
    const find = (name) => {
      const c = blendshapes.find((x) => x.categoryName === name);
      return c ? c.score : 0;
    };
    blink = Math.max(find('eyeBlinkLeft'), find('eyeBlinkRight'));
  }
  const blendOpen = 1 - smoothstep(0.25, 0.8, blink);
  // 两个信号任一判定闭眼就收拢，避免单眼眨动时漏判
  const openness = blendshapes
    ? Math.min(earOpen, blendOpen)
    : earOpen;

  /* 虹膜相对眼眶的偏移：两只眼取平均，尺度各自归一化 */
  const gx =
    ((right.irisX - right.cx) / right.width + (left.irisX - left.cx) / left.width) / 2;
  const gy =
    ((right.irisY - right.cy) / right.height + (left.irisY - left.cy) / left.height) / 2;

  const gaze = {
    x: Math.max(-1, Math.min(1, -gx * 2.4)), // 镜像 + 增益
    y: Math.max(-1, Math.min(1, -gy * 1.9)),
  };

  /* 脸部整体位置：用来做极轻微的镜头位移 */
  const midX = (right.cx + left.cx) / 2;
  const midY = (right.cy + left.cy) / 2;

  return {
    openness,
    ear,
    blink,
    gaze,
    facePos: { x: (0.5 - midX) * 2, y: (0.5 - midY) * 2 },
  };
}

export class FaceTracker {
  constructor(video, { onStage } = {}) {
    this.video = video;
    this.onStage = onStage || (() => {});
    this.landmarker = null;
    this.stream = null;
    this.active = false;
    this.face = null;
    this.lastVideoTime = -1;
    this.modelPromise = null;
  }

  async ensureModel() {
    if (this.modelPromise) return this.modelPromise;

    this.modelPromise = (async () => {
      this.onStage('model');
      const { FilesetResolver, FaceLandmarker } = await import(
        '../vendor/mediapipe/vision_bundle.mjs'
      );
      const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
      const base = { modelAssetPath: MODEL_URL, delegate: 'GPU' };
      const config = {
        baseOptions: base,
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      };

      try {
        this.landmarker = await FaceLandmarker.createFromOptions(fileset, config);
      } catch (err) {
        console.warn('[face] GPU delegate failed, falling back to CPU', err);
        this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
          ...config,
          baseOptions: { ...base, delegate: 'CPU' },
        });
      }
      this.onStage('model-ready');
    })().catch((err) => {
      this.modelPromise = null;
      throw err;
    });

    return this.modelPromise;
  }

  async start() {
    await this.ensureModel();

    if (!navigator.mediaDevices?.getUserMedia) {
      const err = new Error('浏览器不支持摄像头访问');
      err.code = 'unsupported';
      throw err;
    }

    this.onStage('camera');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 960 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
    });

    this.stream = stream;
    const video = this.video;
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    try {
      await video.play();
    } catch (err) {
      await new Promise((r) => setTimeout(r, 60));
      await video.play();
    }

    this.active = true;
    this.face = null;
    this.lastVideoTime = -1;
    this.onStage('ready');
  }

  stop() {
    this.active = false;
    this.face = null;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.video) this.video.srcObject = null;
  }

  /** 每帧调用；只有新视频帧才推理 */
  update(now = performance.now()) {
    if (!this.active || !this.landmarker) return this.face;
    const v = this.video;
    if (!v || v.readyState < 2 || !v.videoWidth) return this.face;
    if (v.currentTime === this.lastVideoTime) return this.face;
    this.lastVideoTime = v.currentTime;

    let result = null;
    try {
      result = this.landmarker.detectForVideo(v, now);
    } catch (err) {
      console.warn('[face] detect failed', err);
      return this.face;
    }

    const lm = result?.faceLandmarks?.[0];
    if (lm && lm.length >= 468) {
      const bs = result?.faceBlendshapes?.[0]?.categories;
      const m = measureFace(lm, bs);
      this.face = { ...m, landmarks: lm, time: now };
    }
    return this.face;
  }
}