// 用 Edge 的 CDP 做整页截图与样式查询（仅本地 QA 用）
// 用法：node scripts/cdp-shot.mjs <url> <out.png> [width] [height] [jsExpression]
import fs from 'node:fs';
import path from 'node:path';

const [url, out, widthArg, heightArg, expression] = process.argv.slice(2);
const width = Number(widthArg || 1440);
const height = Number(heightArg || 900);

async function targets() {
  const res = await fetch('http://127.0.0.1:9222/json/list');
  return res.json();
}

const list = await targets();
const page = list.find((t) => t.type === 'page');
if (!page) throw new Error('no page target');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const events = new Map();

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
  } else if (msg.method && events.has(msg.method)) {
    events.get(msg.method).forEach((fn) => fn(msg.params));
    events.delete(msg.method);
  }
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const msgId = ++id;
  pending.set(msgId, { resolve, reject });
  ws.send(JSON.stringify({ id: msgId, method, params }));
});

const once = (method) => new Promise((resolve) => {
  const fn = (params) => resolve(params);
  events.set(method, [...(events.get(method) || []), fn]);
});

await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await send('Page.navigate', { url });
await Promise.race([once('Page.loadEventFired'), new Promise((r) => setTimeout(r, 8000))]);
await new Promise((r) => setTimeout(r, 1200));

if (expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  console.log(JSON.stringify(result.result?.value ?? result.result, null, 2));
}

const metrics = await send('Page.getLayoutMetrics');
const size = metrics.cssContentSize || metrics.contentSize;
const shot = await send('Page.captureScreenshot', {
  format: 'png',
  captureBeyondViewport: true,
  clip: { x: 0, y: 0, width: size.width, height: Math.min(size.height, 6000), scale: 1 }
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log(`saved ${out} ${size.width}x${Math.min(size.height, 6000)}`);
ws.close();