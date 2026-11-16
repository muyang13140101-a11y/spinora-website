/**
 * Cloudflare Pages Function: /s
 * 为微信聊天、朋友圈与 QQ 提供标准 OpenGraph music.song 音乐卡片解析标签，
 * 并提供一键拉起酷狗音乐、QQ 音乐、网易云音乐、Apple Music 与 Spotify 的高定落地页。
 */

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const title = url.searchParams.get('t') || 'Spinora 音乐分享';
  const artist = url.searchParams.get('a') || 'Spinora';
  const cover = url.searchParams.get('c') || 'https://spinora.pages.dev/icon.png';
  const note = url.searchParams.get('n') || '';
  const desc = note ? `${artist} · “${note}”` : `${artist} · 来自 Spinora 音乐分享`;
  const q = encodeURIComponent(`${title} ${artist}`.trim());

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} - ${escapeHtml(artist)}</title>
  <meta name="description" content="${escapeHtml(desc)}" />
  <meta property="og:type" content="music.song" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(desc)}" />
  <meta property="og:image" content="${escapeHtml(cover)}" />
  <meta property="og:url" content="${escapeHtml(url.toString())}" />
  <meta itemprop="name" content="${escapeHtml(title)}" />
  <meta itemprop="description" content="${escapeHtml(desc)}" />
  <meta itemprop="image" content="${escapeHtml(cover)}" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0d0f17;
      color: #f4f5f8;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
      padding: 24px;
    }
    .card {
      width: min(420px, 100%);
      border-radius: 26px;
      padding: 28px 24px;
      background: rgba(255, 255, 255, 0.06);
      backdrop-filter: blur(32px);
      border: 1px solid rgba(255, 255, 255, 0.16);
      box-shadow: 0 28px 70px rgba(0, 0, 0, 0.6);
      text-align: center;
    }
    .cover {
      width: 210px;
      height: 210px;
      border-radius: 18px;
      object-fit: cover;
      box-shadow: 0 18px 42px rgba(0, 0, 0, 0.55);
      margin-bottom: 18px;
    }
    h1 { font-size: 1.35rem; font-weight: 700; margin-bottom: 6px; }
    .artist { font-size: 0.95rem; color: rgba(255,255,255,0.7); margin-bottom: 14px; }
    .note {
      font-size: 0.88rem;
      color: rgba(255,255,255,0.86);
      padding: 10px 14px;
      border-radius: 12px;
      background: rgba(0,0,0,0.28);
      margin-bottom: 18px;
    }
    .btns { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    a.btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 11px 14px;
      border-radius: 999px;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.18);
      color: #fff;
      text-decoration: none;
      font-size: 0.84rem;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <img src="${escapeHtml(cover)}" alt="" style="width:0;height:0;position:absolute;opacity:0;" />
  <div class="card">
    <img class="cover" src="${escapeHtml(cover)}" alt="${escapeHtml(title)}" />
    <h1>${escapeHtml(title)}</h1>
    <div class="artist">${escapeHtml(artist)}</div>
    ${note ? `<div class="note">“ ${escapeHtml(note)} ”</div>` : ''}
    <div class="btns">
      <a class="btn" href="https://www.kugou.com/yy/html/search.html#searchType=song&searchKeyWord=${q}">酷狗音乐播放</a>
      <a class="btn" href="https://y.qq.com/n/ryqq/search?w=${q}&t=song">QQ 音乐播放</a>
      <a class="btn" href="https://music.163.com/#/search/m/?s=${q}&type=1">网易云音乐</a>
      <a class="btn" href="https://music.apple.com/cn/search?term=${q}">Apple Music</a>
    </div>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300'
    }
  });
}
