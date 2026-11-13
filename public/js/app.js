// public/js/app.js - Spinora 官方网站交互逻辑

document.addEventListener("DOMContentLoaded", () => {
  initGiftBox();
  fetchGiftCount();
});

// 字符串转义工具，杜绝 XSS 注入
function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// 初始化音乐礼物盒子
function initGiftBox() {
  const btnOpen = document.getElementById("btn-open-random");
  const slot = document.getElementById("gift-display-slot");
  const form = document.getElementById("gift-form");
  const feedback = document.getElementById("form-feedback");
  const btnSubmit = document.getElementById("btn-submit-gift");

  if (!btnOpen || !slot || !form) return;

  // 1. 随机开启盲盒
  btnOpen.addEventListener("click", async () => {
    btnOpen.disabled = true;
    btnOpen.textContent = "正在开启礼物盒...";

    try {
      const res = await fetch("/api/gifts/random", { cache: "no-store" });
      const result = await res.json();

      if (res.ok && result.code === 200) {
        renderGiftCard(result.data, slot);
      } else {
        slot.innerHTML = `
          <div class="gift-slot-idle">
            <div class="blind-box-graphic">🍃</div>
            <p>${escapeHtml(result.message || "盒子里暂时空空如也，来封存第一份礼物吧！")}</p>
          </div>
        `;
      }
    } catch (err) {
      slot.innerHTML = `
        <div class="gift-slot-idle">
          <p style="color:var(--danger);">网络连接不稳定，请稍后再试。</p>
        </div>
      `;
    } finally {
      btnOpen.disabled = false;
      btnOpen.textContent = "🎲 再拆一个礼物盒";
    }
  });

  // 渲染盲盒内容
  function renderGiftCard(item, container) {
    const title = escapeHtml(item.song_title);
    const artist = escapeHtml(item.artist || '未知艺术家');
    const msg = escapeHtml(item.message);
    const nick = escapeHtml(item.nickname || '神秘访客');
    const platform = escapeHtml(item.platform_name || '外部来源');
    const dateStr = new Date(item.created_at).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    let mediaHtml = '';
    if (item.song_url) {
      const safeUrl = encodeURI(item.song_url);
      if (item.is_direct_audio) {
        mediaHtml = `
          <div style="margin-top: 1rem;">
            <audio controls preload="metadata" class="audio-player-custom">
              <source src="${safeUrl}">
              您的浏览器不支持该音频格式播放。
            </audio>
          </div>
        `;
      } else {
        mediaHtml = `
          <div style="margin-top: 1rem;">
            <a href="${safeUrl}" target="_blank" rel="noopener noreferrer nofollow" class="btn btn-sm btn-glass">
              🎵 前往 ${platform} 聆听正版原声 ↗
            </a>
          </div>
        `;
      }
    }

    container.innerHTML = `
      <div class="gift-card-opened">
        <div class="song-name">《${title}》</div>
        <div class="song-artist">${artist}</div>
        <div class="gift-quote-box">
          “ ${msg} ”
        </div>
        <div class="gift-sender-info">
          由 <strong>${nick}</strong> 留存于 ${dateStr}
        </div>
        ${mediaHtml}
      </div>
    `;
  }

  // 2. 提交礼物
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    feedback.className = "toast-msg";
    feedback.textContent = "";

    const titleVal = document.getElementById("song_title").value.trim();
    const artistVal = document.getElementById("artist").value.trim();
    const nickVal = document.getElementById("nickname").value.trim();
    const msgVal = document.getElementById("message").value.trim();
    const urlVal = document.getElementById("song_url").value.trim();

    if (!titleVal || !msgVal) {
      feedback.className = "toast-msg toast-error";
      feedback.textContent = "歌曲名称与推荐语为必填项。";
      return;
    }

    btnSubmit.disabled = true;
    btnSubmit.textContent = "正在封存中...";

    try {
      const res = await fetch("/api/gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          song_title: titleVal,
          artist: artistVal,
          nickname: nickVal,
          message: msgVal,
          song_url: urlVal
        })
      });
      const result = await res.json();

      if (res.ok && result.code === 200) {
        feedback.className = "toast-msg toast-success";
        feedback.textContent = result.message || "🎁 礼物已成功封存入盒！感谢你的分享。";
        form.reset();
        fetchGiftCount(); // 刷新计数
      } else {
        feedback.className = "toast-msg toast-error";
        feedback.textContent = result.message || "提交失败，请检查输入格式。";
      }
    } catch (err) {
      feedback.className = "toast-msg toast-error";
      feedback.textContent = "请求发送失败，请稍后重试。";
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = "封存并放入礼物盒";
    }
  });
}

// 统计总数拉取
async function fetchGiftCount() {
  const el = document.getElementById("total-gifts-count");
  if (!el) return;
  try {
    const res = await fetch("/api/gifts/count");
    const json = await res.json();
    if (json.code === 200 && typeof json.total === 'number') {
      el.textContent = json.total;
    }
  } catch (e) {
    // 静默兜底
  }
}
