// functions/api/gifts/index.js
// POST /api/gifts - 提交礼物到礼物盒子

function sanitize(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[m]).trim();
}

async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost({ request, env }) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return new Response(JSON.stringify({ code: 400, message: "请求格式必须为 application/json" }), {
        status: 400,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }

    const body = await request.json();
    let { 
      song_title, 
      artist, 
      message, 
      song_url, 
      nickname,
      sender_email,
      album_cover,
      preview_url,
      platform_links
    } = body;

    // 1. 必填与长度校验
    if (!song_title || typeof song_title !== 'string' || song_title.trim().length === 0) {
      return new Response(JSON.stringify({ code: 422, message: "歌曲名称不能为空" }), { status: 422 });
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return new Response(JSON.stringify({ code: 422, message: "推荐语与祝福不能为空" }), { status: 422 });
    }

    song_title = sanitize(song_title).slice(0, 100);
    artist = sanitize(artist || '未知艺术家').slice(0, 100);
    message = sanitize(message).slice(0, 500);
    nickname = sanitize(nickname || '神秘访客').slice(0, 30);
    song_url = (song_url || '').trim().slice(0, 500);
    sender_email = sanitize(sender_email || '').slice(0, 100);
    album_cover = (album_cover || '').trim().slice(0, 500);
    preview_url = (preview_url || '').trim().slice(0, 500);

    let linksJson = '{}';
    if (platform_links) {
      try {
        linksJson = typeof platform_links === 'string' ? platform_links : JSON.stringify(platform_links);
      } catch (e) {
        linksJson = '{}';
      }
    }

    // 2. 简单频控防刷 (同一 IP 1 分钟内最多提交 3 次)
    const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "127.0.0.1";
    const ipHash = await sha256(clientIp + "spinora_salt_public_good");

    const rateCheck = await env.DB.prepare(
      "SELECT count(*) as count FROM gifts WHERE ip_hash = ? AND created_at >= datetime('now', '-1 minute')"
    ).bind(ipHash).first();

    if (rateCheck && rateCheck.count >= 3) {
      return new Response(JSON.stringify({
        code: 429,
        message: "你分享得太快啦！请静候一分钟再来封存下一份礼物吧~"
      }), {
        status: 429,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }

    // 3. 写入 D1 (兼容模式：如果额外列存在则写入，降级处理确保健壮)
    try {
      const stmt = await env.DB.prepare(
        `INSERT INTO gifts (
          song_title, artist, message, song_url, nickname, ip_hash,
          sender_email, album_cover, preview_url, platform_links
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        song_title, artist, message, song_url, nickname, ipHash,
        sender_email, album_cover, preview_url, linksJson
      ).run();

      return new Response(JSON.stringify({
        code: 200,
        message: "🎁 音乐礼物已成功封存入盒！感谢你的温度分享。",
        data: { id: stmt.meta?.last_row_id }
      }), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    } catch (dbErr) {
      // 容错降级：如果用户尚未执行 ALTER TABLE，按基础字段写入
      const fallbackStmt = await env.DB.prepare(
        "INSERT INTO gifts (song_title, artist, message, song_url, nickname, ip_hash) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(song_title, artist, message, song_url, nickname, ipHash).run();

      return new Response(JSON.stringify({
        code: 200,
        message: "🎁 礼物已成功封存入盒！",
        data: { id: fallbackStmt.meta?.last_row_id }
      }), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ code: 500, message: "服务器异常，请稍后重试", error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }
}
