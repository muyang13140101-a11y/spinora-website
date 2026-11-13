// functions/api/gifts/react.js
// POST /api/gifts/react - 为礼物点赞共鸣或给送礼人发送回信互动

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

export async function onRequestPost({ request, env }) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return new Response(JSON.stringify({ code: 400, message: "格式错误" }), { status: 400 });
    }

    const body = await request.json();
    const { gift_id, action, reply_text, receiver_name } = body;

    if (!gift_id) {
      return new Response(JSON.stringify({ code: 422, message: "礼物 ID 不能为空" }), { status: 422 });
    }

    // 检查礼物是否存在
    const gift = await env.DB.prepare(
      "SELECT id, song_title, artist, nickname, sender_email, likes_count FROM gifts WHERE id = ?"
    ).bind(gift_id).first();

    if (!gift) {
      return new Response(JSON.stringify({ code: 404, message: "未找到该音乐礼物" }), { status: 404 });
    }

    if (action === 'heart') {
      // 点赞/共鸣数 +1
      await env.DB.prepare(
        "UPDATE gifts SET likes_count = COALESCE(likes_count, 0) + 1 WHERE id = ?"
      ).bind(gift_id).run();

      return new Response(JSON.stringify({
        code: 200,
        message: "❤️ 共鸣成功！送礼人已感受到你的心意。",
        likes_count: (gift.likes_count || 0) + 1
      }), {
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }

    if (action === 'reply') {
      const cleanReply = sanitize(reply_text || '').slice(0, 200);
      const cleanReceiver = sanitize(receiver_name || '知音听众').slice(0, 30);

      if (!cleanReply) {
        return new Response(JSON.stringify({ code: 422, message: "回信内容不能为空" }), { status: 422 });
      }

      // 将回信内容存入数据库
      const replyRecord = `${cleanReceiver}: ${cleanReply} [${new Date().toLocaleDateString('zh-CN')}]`;
      await env.DB.prepare(
        "UPDATE gifts SET reply_message = ? WHERE id = ?"
      ).bind(replyRecord, gift_id).run();

      // 如果送礼人留存了邮箱，尝试通过 MailChannels 免费发送通知邮件 (无成本免配置)
      let emailSent = false;
      if (gift.sender_email && gift.sender_email.includes('@')) {
        try {
          const emailPayload = {
            personalizations: [
              {
                to: [{ email: gift.sender_email, name: gift.nickname || 'Spinora 音乐好友' }]
              }
            ],
            from: {
              email: "notification@spinora.pages.dev",
              name: "Spinora 音乐礼物盒"
            },
            subject: `💌 你的音乐礼物《${gift.song_title}》收到了温暖回信！`,
            content: [
              {
                type: "text/html",
                value: `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #eee; border-radius: 12px; background: #0f141c; color: #f0f4fc;">
                    <h2 style="color: #38bdf8; margin-top: 0;">Spinora 礼物盒回响</h2>
                    <p>你好，<strong>${gift.nickname || '朋友'}</strong>：</p>
                    <p>你在 Spinora 音乐盒封存的礼物 <strong>《${gift.song_title} - ${gift.artist}》</strong> 刚刚被拆开了！</p>
                    <div style="background: rgba(255,255,255,0.06); padding: 16px; border-radius: 8px; border-left: 4px solid #38bdf8; margin: 20px 0;">
                      <p style="margin: 0 0 8px 0; color: #94a3b8; font-size: 13px;">来自 <strong>${cleanReceiver}</strong> 的拆盒感言：</p>
                      <p style="margin: 0; font-size: 15px; color: #fff; line-height: 1.6;">“${cleanReply}”</p>
                    </div>
                    <p style="font-size: 13px; color: #64748b; margin-top: 24px;">感谢你用旋律温暖了互联网角落里的一位听友。<br>—— Spinora 纯公益音乐团队</p>
                  </div>
                `
              }
            ]
          };

          const mailRes = await fetch("https://api.mailchannels.net/tx/v1/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(emailPayload)
          });
          if (mailRes.ok || mailRes.status === 202) {
            emailSent = true;
          }
        } catch (e) {
          // 邮件发送非致命，继续成功返回
        }
      }

      return new Response(JSON.stringify({
        code: 200,
        message: emailSent ? "💌 回信已投递！并已成功向送礼人邮箱发送提醒通知。" : "💌 回信已成功寄出！送礼人将能在礼物盒查看到你的心意。",
        reply: replyRecord
      }), {
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }

    return new Response(JSON.stringify({ code: 400, message: "未知的交互动作" }), { status: 400 });
  } catch (err) {
    return new Response(JSON.stringify({ code: 500, message: "处理互动失败", error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }
}

