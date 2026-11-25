import { runFetch } from '../lib/fetch.mjs';

const result = await runFetch();
console.log(`来源 ${result.sources.ok}/${result.sources.total} 成功，新增 ${result.inserted} 条`);
if (result.errors.length) console.log(result.errors.join('\n'));
process.exit(0);