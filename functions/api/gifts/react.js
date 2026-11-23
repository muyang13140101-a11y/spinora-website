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
    const { gift_id, action, reply_text, receiver_name, receiver_email } = body;

    if (!gift_id) {
      return new Response(JSON.stringify({ code: 422, message: "礼物 ID 不能为空" }), { status: 422 });
    }

    // 检查礼物是否存在（若老表缺少扩展列，自动执行 ALTER TABLE 补齐并重试）
    const selectGift = () => env.DB.prepare(
      "SELECT id, song_title, artist, nickname, sender_email, likes_count FROM gifts WHERE id = ?"
    ).bind(gift_id).first();

    let gift;
    try {
      gift = await selectGift();
    } catch (colErr) {
      if (String(colErr && colErr.message).includes('no such column')) {
        const alters = [
          "ALTER TABLE gifts ADD COLUMN sender_email TEXT DEFAULT ''",
          "ALTER TABLE gifts ADD COLUMN album_cover TEXT DEFAULT ''",
          "ALTER TABLE gifts ADD COLUMN preview_url TEXT DEFAULT ''",
          "ALTER TABLE gifts ADD COLUMN platform_links TEXT DEFAULT '{}'",
          "ALTER TABLE gifts ADD COLUMN likes_count INTEGER DEFAULT 0",
          "ALTER TABLE gifts ADD COLUMN reply_message TEXT DEFAULT ''"
        ];
        for (const sql of alters) {
          try { await env.DB.prepare(sql).run(); } catch (_) {}
        }
        gift = await selectGift();
      } else {
        throw colErr;
      }
    }

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
      const cleanReceiverEmail = sanitize(receiver_email || '').slice(0, 100);
      const validReceiverEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanReceiverEmail) ? cleanReceiverEmail : '';

      if (!cleanReply) {
        return new Response(JSON.stringify({ code: 422, message: "回信内容不能为空" }), { status: 422 });
      }

      // 将回信内容存入数据库（若对方留了邮箱一并附注）
      const replyRecord = validReceiverEmail
        ? `${cleanReceiver} (${validReceiverEmail}): ${cleanReply} [${new Date().toLocaleDateString('zh-CN')}]`
        : `${cleanReceiver}: ${cleanReply} [${new Date().toLocaleDateString('zh-CN')}]`;
      await env.DB.prepare(
        "UPDATE gifts SET reply_message = ? WHERE id = ?"
      ).bind(replyRecord, gift_id).run();

      // 优先使用 Resend API（env.RESEND_API_KEY），其次支持带 Key 的 MailChannels（env.MAILCHANNELS_API_KEY）
      let emailSent = false;
      let emailProvider = 'none';
      const hasValidSenderEmail = gift.sender_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gift.sender_email);
      if (hasValidSenderEmail) {
        const emailSubject = `💌 你的音乐礼物《${gift.song_title}》收到了温暖回信！`;
        const receiverContactHtml = validReceiverEmail
          ? `<p style="margin: 10px 0 0 0; color: #38bdf8; font-size: 13px;">对方留下的回信邮箱：<strong>${validReceiverEmail}</strong></p>`
          : '';
        const emailHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #1e293b; border-radius: 14px; background: #0f141c; color: #f0f4fc;">
            <h2 style="color: #38bdf8; margin-top: 0;">Spinora 礼物盒回响</h2>
            <p>你好，<strong>${gift.nickname || '朋友'}</strong>：</p>
            <p>你在 Spinora 音乐盒封存的礼物 <strong>《${gift.song_title} - ${gift.artist}》</strong> 刚刚被拆开了！</p>
            <div style="background: rgba(255,255,255,0.06); padding: 16px; border-radius: 10px; border-left: 4px solid #38bdf8; margin: 20px 0;">
              <p style="margin: 0 0 8px 0; color: #94a3b8; font-size: 13px;">来自 <strong>${cleanReceiver}</strong> 的拆盒感言：</p>
              <p style="margin: 0; font-size: 15px; color: #fff; line-height: 1.6;">“${cleanReply}”</p>
              ${receiverContactHtml}
            </div>
            <p style="font-size: 13px; color: #64748b; margin-top: 24px;">感谢你用旋律温暖了互联网角落里的一位听友。<br>—— Spinora 纯公益音乐团队</p>
          </div>
        `;

        if (env.RESEND_API_KEY) {
          try {
            const fromAddr = env.RESEND_FROM || "Spinora 音乐礼物盒 <onboarding@resend.dev>";
            const resendRes = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${env.RESEND_API_KEY}`
              },
              body: JSON.stringify({
                from: fromAddr,
                to: [gift.sender_email],
                reply_to: validReceiverEmail || undefined,
                subject: emailSubject,
                html: emailHtml
              })
            });
            if (resendRes.ok) {
              emailSent = true;
              emailProvider = 'resend';
            }
          } catch (e) {}
        }

        if (!emailSent && env.MAILCHANNELS_API_KEY) {
          try {
            const mailRes = await fetch("https://api.mailchannels.net/tx/v1/send", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Api-Key": env.MAILCHANNELS_API_KEY
              },
              body: JSON.stringify({
                personalizations: [{ to: [{ email: gift.sender_email, name: gift.nickname || 'Spinora 音乐好友' }] }],
                from: { email: env.MAIL_FROM || "notification@spinora.pages.dev", name: "Spinora 音乐礼物盒" },
                subject: emailSubject,
                content: [{ type: "text/html", value: emailHtml }]
              })
            });
            if (mailRes.ok || mailRes.status === 202) {
              emailSent = true;
              emailProvider = 'mailchannels';
            }
          } catch (e) {}
        }
      }

      return new Response(JSON.stringify({
        code: 200,
        email_sent: emailSent,
        email_provider: emailProvider,
        message: emailSent ? "💌 回信已投递！并已通过邮件通知送礼人。" : "💌 回信已保存在礼物盒中！送礼人可在礼物盒内查看。",
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

