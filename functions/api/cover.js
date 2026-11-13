// functions/api/cover.js
// 同源专辑封面代理：解决 QQ / 网易云 / 酷狗等图床缺少 CORS 头，导致 WebGL 无法使用封面贴图的问题。
// 仅允许白名单图床域名 + image/* 响应，避免成为开放代理。

const ALLOWED_HOSTS = [
  /(^|\.)gtimg\.cn$/,
  /(^|\.)qq\.com$/,
  /(^|\.)126\.net$/,
  /(^|\.)kugou\.com$/,
  /(^|\.)kgimg\.com$/,
  /(^|\.)dzcdn\.net$/,
  /(^|\.)deezer\.com$/,
  /(^|\.)mzstatic\.com$/,
  /(^|\.)scdn\.co$/
];

export async function onRequestGet({ request }) {
  const raw = new URL(request.url).searchParams.get("url");
  let target;
  try {
    target = new URL(raw);
  } catch {
    return new Response("bad url", { status: 400 });
  }

  if (!/^https?:$/.test(target.protocol) || !ALLOWED_HOSTS.some((re) => re.test(target.hostname))) {
    return new Response("forbidden host", { status: 403 });
  }

  let upstream;
  try {
    upstream = await fetch(target.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Spinora/2.5" },
      cf: { cacheTtl: 86400, cacheEverything: true }
    });
  } catch {
    return new Response("upstream unreachable", { status: 502 });
  }

  if (!upstream.ok) return new Response("upstream error", { status: 502 });

  const contentType = upstream.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    return new Response("not an image", { status: 415 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=86400"
    }
  });
}

