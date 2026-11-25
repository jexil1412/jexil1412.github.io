import { SOURCES } from '../config/sources.mjs';

let bad = 0;
for (const source of SOURCES) {
  const started = Date.now();
  try {
    const res = await fetch(source.feed_url, {
      headers: { 'user-agent': 'Jexil1412Bot/1.0 (+http://localhost:3000)', accept: 'application/rss+xml, application/xml, text/xml, */*' },
      signal: AbortSignal.timeout(15000)
    });
    const text = await res.text();
    const looksXml = /<\?xml|<rss|<feed/.test(text.slice(0, 400));
    const ok = res.ok && looksXml;
    if (!ok) bad += 1;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${source.id.padEnd(12)} ${res.status} ${Date.now() - started}ms ${looksXml ? '' : '(not xml)'}`);
  } catch (error) {
    bad += 1;
    console.log(`FAIL ${source.id.padEnd(12)} ${error.name === 'TimeoutError' ? 'timeout' : error.message}`);
  }
}
console.log(bad ? `${bad} 个源不可用` : '全部可用');
process.exit(0);