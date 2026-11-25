// 可选：每天刷新爱好数据。失败不影响站点，退出码始终 0。
import { refreshAnime } from '../lib/anime.mjs';
import { syncSteam, steamConfig } from '../lib/steam.mjs';

try {
  const results = await refreshAnime();
  console.log('anime:', JSON.stringify(results));
} catch (error) {
  console.error('anime failed:', error.message);
}

if (steamConfig().configured) {
  try {
    const result = await syncSteam();
    console.log('steam:', JSON.stringify(result));
  } catch (error) {
    console.error('steam failed:', error.message);
  }
} else {
  console.log('steam: skipped (STEAM_API_KEY / STEAM_ID not set)');
}

process.exit(0);