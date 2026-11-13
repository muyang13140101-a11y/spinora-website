// functions/api/gifts/random.js
// GET /api/gifts/random - 随机抽取一条有效的音乐礼物

export async function onRequestGet({ env }) {
  try {
    const gift = await env.DB.prepare(
      `SELECT id, song_title, artist, message, song_url, nickname, created_at 
       FROM gifts 
       WHERE status = 'active' 
       ORDER BY RANDOM() 
       LIMIT 1`
    ).first();

    if (!gift) {
      return new Response(JSON.stringify({
        code: 404,
        message: "盲盒里暂时空空如也，来做第一个留下音乐礼物的人吧！"
      }), {
        status: 404,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }

    // 智能识别链接类型：是音频直链还是第三方平台
    let is_direct_audio = false;
    let platform_name = "外部链接";

    if (gift.song_url) {
      const lower = gift.song_url.toLowerCase().split('?')[0];
      if (lower.endsWith('.mp3') || lower.endsWith('.m4a') || lower.endsWith('.wav') || lower.endsWith('.ogg') || lower.endsWith('.flac')) {
        is_direct_audio = true;
      }

      if (lower.includes('spotify.com')) platform_name = "Spotify";
      else if (lower.includes('music.163.com')) platform_name = "网易云音乐";
      else if (lower.includes('qq.com')) platform_name = "QQ音乐";
      else if (lower.includes('apple.com')) platform_name = "Apple Music";
      else if (lower.includes('bilibili.com')) platform_name = "哔哩哔哩";
      else if (lower.includes('youtube.com') || lower.includes('youtu.be')) platform_name = "YouTube";
    }

    return new Response(JSON.stringify({
      code: 200,
      data: {
        ...gift,
        is_direct_audio,
        platform_name
      }
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ code: 500, message: "随机获取失败", error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }
}
