// 高质量版着色器：单次散射大气 + 两层云 + 真实太阳方位
const VS = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2) * 2.0 - 1.0; gl_Position = vec4(p, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime, uRelief;
uniform vec3 uCam, uSun, uMoonDir, uFwd, uRight, uUp;
uniform sampler2D uDay, uClouds, uLights, uSpec, uNorm, uMoon, uBump;
uniform vec2 uTexel;   // 昼面贴图真实 texel 尺寸，由 JS 在加载后写入
out vec4 outColor;

const float PI = 3.14159265359;
const float SUN_R = 0.00465;
const float MOON_R = 0.00452;

/* ---------- 大气（单次散射） ---------- */
const float R_P = 1.0;        // 行星半径
const float R_A = 1.042;      // 大气顶
const float H_R = 0.00135;    // 瑞利标高（≈8.6 km）
const float H_M = 0.0011;     // 米氏标高
const vec3  B_R = vec3(36.9, 86.0, 211.0);   // 瑞利散射系数（1/地球半径）
const float B_M = 26.0;                       // 米氏散射系数
const int   NS = 14;          // 视线采样
const int   NL = 5;           // 太阳方向采样

vec2 sph(vec3 ro, vec3 rd, float r){
  float b = dot(ro, rd), c = dot(ro, ro) - r * r, d = b * b - c;
  if (d < 0.0) return vec2(-1.0);
  float s = sqrt(d);
  return vec2(-b - s, -b + s);
}

void atmosphere(vec3 ro, vec3 rd, vec3 sunDir, out vec3 inscatter, out vec3 transmittance){
  inscatter = vec3(0.0);
  transmittance = vec3(1.0);
  vec2 ta = sph(ro, rd, R_A);
  if (ta.y < 0.0) return;
  vec2 tp = sph(ro, rd, R_P);
  float tEnd = (tp.x > 0.0) ? tp.x : ta.y;
  float t0 = max(ta.x, 0.0);
  if (tEnd <= t0) return;

  float dt = (tEnd - t0) / float(NS);
  float odR = 0.0, odM = 0.0;
  vec3 sumR = vec3(0.0), sumM = vec3(0.0);
  float mu = dot(rd, sunDir);
  float pR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float g = 0.76;
  float pM = 3.0 / (8.0 * PI) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(max(1e-4, 1.0 + g * g - 2.0 * g * mu), 1.5));

  for (int i = 0; i < NS; i++) {
    vec3 p = ro + rd * (t0 + dt * (float(i) + 0.5));
    float h = max(length(p) - R_P, 0.0);
    float dR = exp(-h / H_R), dM = exp(-h / H_M);
    odR += dR * dt; odM += dM * dt;

    vec2 ts = sph(p, sunDir, R_A);
    float tSun = max(ts.y, 0.0);
    float ds = tSun / float(NL);
    float odRS = 0.0, odMS = 0.0;
    bool blocked = false;
    for (int j = 0; j < NL; j++) {
      vec3 q = p + sunDir * (ds * (float(j) + 0.5));
      float hq = length(q) - R_P;
      if (hq < 0.0) { blocked = true; break; }
      odRS += exp(-hq / H_R) * ds;
      odMS += exp(-hq / H_M) * ds;
    }
    if (blocked) continue;

    vec3 tau = B_R * (odR + odRS) + vec3(B_M) * 1.1 * (odM + odMS);
    vec3 att = exp(-tau);
    sumR += att * dR * dt;
    sumM += att * dM * dt;
  }
  inscatter = (sumR * B_R * pR + sumM * B_M * pM) * 3.4;
  transmittance = exp(-(B_R * odR + vec3(B_M) * 1.1 * odM));
}

/* ---------- 星空 ---------- */
float h31(vec3 p){ vec3 q = fract(p * vec3(.1031, .1030, .0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec3 h33(vec3 p){ vec3 q = fract(p * vec3(.1031, .1030, .0973)); q += dot(q, q.yxz + 33.33); return fract((q.xxy + q.yxx) * q.zyx); }

float vn(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
}

vec3 stars(vec3 rd, float scale, float thr, float size, float t, float gain){
  vec3 p = rd * scale, ip = floor(p), f = p - ip, sum = vec3(0.0);
  for (int x = -1; x <= 1; x++)
  for (int y = -1; y <= 1; y++)
  for (int z = -1; z <= 1; z++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 h = h33(ip + o);
    if (h.z > thr) continue;
    float d = length(o + h - f);
    float m = 0.18 + 3.0 * pow(h.x, 4.5);
    float r = min(size * (0.55 + 0.65 * h.x), 0.30);
    float q = d / r;
    float b = exp(-q * q * 7.0) + 0.30 * exp(-q * 2.4);
    float tw = 0.6 + 0.4 * sin(t * (0.7 + 2.6 * h.y) + h.z * 50.0);
    vec3 c = mix(vec3(.62, .76, 1.0), vec3(1.0, .84, .64), h.y);
    sum += c * (b * tw * gain * m);
  }
  return sum;
}

void main(){
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  float asp = uRes.x / uRes.y;
  float hk = 1.25 * clamp(1.0 / asp, 1.0, 1.6);
  vec3 rd = normalize(uFwd + uRight * uv.x * hk + uUp * uv.y * 1.25);
  vec3 ro = uCam;

  // 天空底色（星星已经大幅减少）
  vec3 sky = vec3(0.002, 0.003, 0.007);
  sky += stars(rd, 150.0, 0.024, 0.55, uTime, 0.55);
  sky += stars(rd,  64.0, 0.012, 0.45, uTime, 0.80);

  // 太阳
  float aS = acos(clamp(dot(rd, uSun), -1.0, 1.0));
  sky += vec3(1.0, 0.97, 0.92) * smoothstep(SUN_R, SUN_R * 0.92, aS) * 26.0;
  sky += vec3(1.0, 0.86, 0.62) * 1.1 * pow(max(0.0, 1.0 - aS / 0.09), 3.0);

  // 月亮
  {
    float aM = acos(clamp(dot(rd, uMoonDir), -1.0, 1.0));
    if (aM < MOON_R * 1.4) {
      vec3 t1 = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)) + vec3(1e-4));
      vec3 t2 = cross(uMoonDir, t1);
      vec2 q = vec2(dot(rd, t1) * 1.25 / hk, dot(rd, t2)) / MOON_R;
      float dq = length(q);
      if (dq < 1.02) {
        float z = sqrt(max(0.0, 1.0 - min(dq * dq, 1.0)));
        vec3 n = t1 * q.x + t2 * q.y - uMoonDir * z;
        vec2 mt = vec2(0.5 + atan(q.x, z) / PI * 0.5, 0.5 + q.y * 0.45);
        vec3 alb = pow(texture(uMoon, mt).rgb, vec3(2.2));
        float lit = smoothstep(-0.10, 0.18, dot(n, uSun));
        sky = mix(sky, alb * (0.01 + 1.7 * lit), smoothstep(1.02, 0.96, dq));
      }
    }
  }

  // 大气
  vec3 atmIn, atmTr;
  atmosphere(ro, rd, uSun, atmIn, atmTr);

  // 地球
  float b = dot(ro, rd), cc = dot(ro, ro) - 1.0, disc = b * b - cc;
  vec3 col = sky * atmTr + atmIn;

  if (disc > 0.0) {
    float t = -b - sqrt(disc);
    if (t > 0.0) {
      vec3 p = ro + rd * t;
      vec3 n = normalize(p);
      vec3 v = -rd;

      float lat = asin(clamp(n.y, -1.0, 1.0));
      float lon = atan(n.z, n.x);
      vec2 tuv = vec2(0.5 + lon / (2.0 * PI), 0.5 - lat / PI);

      // 轻微反锐化，让陆地的纹理边缘更立起来（源图 8K，偏移一个纹素）
      vec2 texel = uTexel;
      vec3 dayC = texture(uDay, tuv).rgb;
      vec3 dayB = (texture(uDay, tuv + vec2(texel.x, 0.0)).rgb + texture(uDay, tuv - vec2(texel.x, 0.0)).rgb
                 + texture(uDay, tuv + vec2(0.0, texel.y)).rgb + texture(uDay, tuv - vec2(0.0, texel.y)).rgb) * 0.25;
      dayC = max(dayC + (dayC - dayB) * 0.55, 0.0);
      vec3 dayLin = pow(dayC, vec3(2.2));
      dayLin = pow(dayLin, vec3(1.15));
      vec3 nightLin = pow(texture(uLights, tuv).rgb, vec3(2.2));
      float specMask = texture(uSpec, tuv).r;

      // 两层云：低频主云 + 高频细节
      vec2 drift = vec2(uTime * 0.00055, 0.0);
      float c1 = texture(uClouds, tuv + drift).r;
      float c2 = texture(uClouds, tuv * 2.7 + drift * 1.3 + 0.37).r;
      float cloud = clamp(c1 * 0.72 + c2 * 0.28, 0.0, 1.0);

      // 云影：4 个点平均，边缘更软
      vec2 so = vec2(0.0024, 0.0017);
      vec2 shOff = drift + uSun.xz * 0.006;
      float sh = texture(uClouds, tuv + shOff + so).r
               + texture(uClouds, tuv + shOff - so).r
               + texture(uClouds, tuv + shOff + vec2(so.y, -so.x)).r
               + texture(uClouds, tuv + shOff + vec2(-so.y, so.x)).r;

      vec3 T = normalize(vec3(-p.z, 0.0, p.x) + vec3(1e-6));
      vec3 Bv = cross(n, T);

      float land = 1.0 - smoothstep(0.30, 0.70, specMask);      // 1 = 陆地，0 = 海面

      // 大尺度起伏：设计好的 2K 法线图
      vec3 nt = texture(uNorm, tuv).rgb * 2.0 - 1.0;
      vec3 nb0 = normalize(n + (T * nt.x + Bv * nt.y) * uRelief);

      // 中小尺度细节：两个八度的程序化噪声梯度，只在陆地加，给"航拍颗粒感"
      vec3 dp = p * 85.0;      // ≈75 km
      vec3 dq2 = p * 260.0;    // ≈24 km
      float e = 0.030;
      float gT = (vn(dp + T * e) - vn(dp - T * e)) + 0.55 * (vn(dq2 + T * e) - vn(dq2 - T * e));
      float gB = (vn(dp + Bv * e) - vn(dp - Bv * e)) + 0.55 * (vn(dq2 + Bv * e) - vn(dq2 - Bv * e));
      vec3 nb = normalize(nb0 + (T * gT + Bv * gB) * 2.8 * land);

      float reliefShade = 1.0 + (vn(dp) - 0.5) * 0.16 * land;

      float ndl = dot(nb, uSun);
      float dayAmt = smoothstep(-0.06, 0.14, ndl);
      float cloudA = smoothstep(0.06, 0.72, cloud * 1.15);

      vec3 surf = dayLin * max(ndl, 0.0) * 0.90 * reliefShade * (1.0 - smoothstep(0.1, 0.9, sh * 0.25) * 0.6);
      surf += dayLin * 0.02;

      vec3 Hv = normalize(uSun + v);
      float nh = max(dot(nb, Hv), 0.0);
      float fres = 0.02 + 0.98 * pow(1.0 - max(dot(nb, v), 0.0), 5.0);
      float glint = pow(nh, 2600.0) * 16.0 + pow(nh, 240.0) * 0.05;
      surf += vec3(1.0, 0.95, 0.86) * glint * smoothstep(0.3, 0.75, specMask) * fres * dayAmt * 3.0;

      vec3 cloudLit = vec3(0.97, 0.98, 1.0) * (max(ndl, 0.0) * 0.82 + 0.03);
      vec3 body = mix(surf, cloudLit, cloudA * 0.86);
      body += nightLin * (1.0 - dayAmt) * (1.0 - cloudA * 0.85) * 2.4;

      col = body * atmTr + atmIn;
    }
  }

  col *= 1.0 - 0.20 * dot(uv, uv);
  col = col * (2.51 * col + 0.03) / (col * (2.43 * col + 0.59) + 0.14);
  col = pow(col, vec3(1.0 / 2.2));
  col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 0.93);
  col += (h31(vec3(gl_FragCoord.xy, floor(uTime * 24.0))) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}`;
