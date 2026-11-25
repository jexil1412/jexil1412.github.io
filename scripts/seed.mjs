import { ensureSeed } from '../lib/seed.mjs';

const force = process.argv.includes('--force');
const done = ensureSeed({ force });
console.log(done ? 'seed 完成：4 件作品 + 3 个爱好' : '库里已有数据，跳过（加 --force 可清空重灌）');