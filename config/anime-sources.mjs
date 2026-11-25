// 四个平台的动漫入口。
// mode=api 的适配器会抓公开接口；mode=link 只展示平台入口（平台无公开目录 API）。
export const ANIME_SOURCES = [
  {
    platform: 'bilibili',
    name: 'B 站',
    url: 'https://www.bilibili.com/anime/',
    mode: 'api',
    sort_order: 1
  },
  {
    platform: 'tencent',
    name: '腾讯视频',
    url: 'https://v.qq.com/channel/anime',
    mode: 'link',
    sort_order: 2
  },
  {
    platform: 'iqiyi',
    name: '爱奇艺',
    url: 'https://www.iqiyi.com/dongman/',
    mode: 'link',
    sort_order: 3
  },
  {
    platform: 'youku',
    name: '优酷',
    url: 'https://www.youku.com/channel/webcomic',
    mode: 'link',
    sort_order: 4
  }
];