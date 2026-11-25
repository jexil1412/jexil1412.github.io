import { readFileSync, writeFileSync } from 'node:fs';
const p = 'D:/01/starry/earth/dist/js/main.js';
let s = readFileSync(p, 'utf8');
s = s.replaceAll('assets/day8k.jpg', 'assets/day.jpg')
     .replaceAll('assets/clouds8k.jpg', 'assets/clouds.png')
     .replaceAll('assets/night8k.jpg', 'assets/lights.png')
     .replaceAll('assets/moon8k.jpg', 'assets/moon.jpg');
// 部署版提示文案里的端口也改掉
s = s.replaceAll('http://127.0.0.1:8123/', 'http://127.0.0.1:8124/');
writeFileSync(p, s, 'utf8');
console.log('patched');
