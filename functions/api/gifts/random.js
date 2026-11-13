// functions/api/gifts/random.js
// GET /api/gifts/random - 随机抽取一条有效的音乐礼物

export async function onRequestGet({ env }) {
  try {
    let gift;
    try {
      gift = await env.DB.prepare(
        `SELECT id, song_title, artist, message, song_url, nickname, created_at,
                COALESCE(album_cover, '') as album_cover,
                COALESCE(preview_url, '') as preview_url,
                COALESCE(platform_links, '{}') as platform_links,
                COALESCE(likes_count, 0) as likes_count,
                COALESCE(reply_message, '') as reply_message
         FROM gifts 
         WHERE status = 'active' 
         ORDER BY RANDOM() 
         LIMIT 1`
      ).first();
    } catch (e) {
      // 容错降级读取老表
      gift = await env.DB.prepare(
        `SELECT id, song_title, artist, message, song_url, nickname, created_at
         FROM gifts 
         WHERE status = 'active' 
         ORDER BY RANDOM() 
         LIMIT 1`
      ).first();
    }

    if (!gift) {
      return new Response(JSON.stringify({
        code: 404,
        message: "盲盒里暂时空空如也，来做第一个留下音乐礼物的人吧！"
      }), {
        status: 404,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }

    // 解析平台链接
    let platform_links = {};
    if (gift.platform_links) {
      try {
        platform_links = typeof gift.platform_links === 'string' ? JSON.parse(gift.platform_links) : gift.platform_links;
      } catch (e) {
        platform_links = {};
      }
    }

    // 如果没有预置平台链接，自动生成主要平台检索链接
    const query = encodeURIComponent(`${gift.song_title} ${gift.artist}`);
    if (!platform_links.spotify) platform_links.spotify = `https://open.spotify.com/search/${query}`;
    if (!platform_links.netease) platform_links.netease = `https://music.163.com/#/search/m/?s=${query}`;
    if (!platform_links.qq) platform_links.qq = `https://y.qq.com/n/ryqq/search?w=${query}`;
    if (!platform_links.kugou) platform_links.kugou = `https://www.kugou.com/yy/html/search.html#searchType=song&searchKeyWord=${query}`;
    if (!platform_links.apple) platform_links.apple = `https://music.apple.com/search?term=${query}`;
    if (!platform_links.tidal) platform_links.tidal = `https://listen.tidal.com/search?q=${query}`;

    return new Response(JSON.stringify({
      code: 200,
      data: {
        id: gift.id,
        song_title: gift.song_title,
        artist: gift.artist,
        message: gift.message,
        song_url: gift.song_url,
        nickname: gift.nickname,
        created_at: gift.created_at,
        album_cover: gift.album_cover || '',
        preview_url: gift.preview_url || '',
        platform_links: platform_links,
        likes_count: gift.likes_count || 0,
        reply_message: gift.reply_message || ''
      }
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      code: 500,
      message: "获取盲盒失败",
      error: err.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }
}
