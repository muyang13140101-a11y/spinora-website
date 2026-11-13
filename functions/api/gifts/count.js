// functions/api/gifts/count.js
// GET /api/gifts/count - 统计已累计分享的礼物数

export async function onRequestGet({ env }) {
  try {
    const res = await env.DB.prepare("SELECT count(*) as total FROM gifts WHERE status = 'active'").first();
    return new Response(JSON.stringify({
      code: 200,
      total: res ? res.total : 0
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=60"
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ code: 500, total: 0 }), { status: 500 });
  }
}
