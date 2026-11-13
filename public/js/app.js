// public/js/app.js - Spinora 官方网站 2.0 交互逻辑与 3D 引擎

document.addEventListener("DOMContentLoaded", () => {
  initThreeHero();
  initCarrierTabs();
  initMusicSearch();
  initGiftBox();
  initDisclaimerModal();
  fetchGiftCount();
});

// XSS 安全字符转义
function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ========================================================
// 1. WebGL 交互式 3D 拟真 CD 唱盘 (Three.js)
// ========================================================
let threeScene, threeCamera, threeRenderer, cdGroup, cdDisc, jewelCase;
let isDragging = false, prevMouseX = 0, prevMouseY = 0;
let discEjected = true;
let discSpeed = 0.015;
let isHoloEnhanced = false;

function initThreeHero() {
  const container = document.getElementById("three-container");
  if (!container || typeof THREE === "undefined") return;

  // 清除加载文案
  container.innerHTML = "";

  const width = container.clientWidth || 400;
  const height = container.clientHeight || 380;

  threeScene = new THREE.Scene();
  threeCamera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
  threeCamera.position.set(0, 0, 7.5);

  threeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  threeRenderer.setSize(width, height);
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  threeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  threeRenderer.toneMappingExposure = 1.2;
  container.appendChild(threeRenderer.domElement);

  // 环境光与物理高光
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
  threeScene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0x38bdf8, 2.2);
  keyLight.position.set(5, 5, 4);
  threeScene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xec4899, 1.8);
  rimLight.position.set(-5, -3, 3);
  threeScene.add(rimLight);

  // CD 总装配组
  cdGroup = new THREE.Group();
  threeScene.add(cdGroup);
  cdGroup.rotation.x = 0.25;
  cdGroup.rotation.y = -0.35;

  // 1. 亚克力 CD 唱片盒 (透光磨砂外壳)
  const caseGeo = new THREE.BoxGeometry(4.2, 4.2, 0.32);
  const caseMat = new THREE.MeshPhysicalMaterial({
    color: 0x1e293b,
    metalness: 0.1,
    roughness: 0.15,
    transmission: 0.75, // 高透明磨砂亚克力
    thickness: 0.5,
    transparent: true,
    opacity: 0.65,
    reflectivity: 0.9
  });
  jewelCase = new THREE.Mesh(caseGeo, caseMat);
  jewelCase.position.set(-0.6, 0, 0);
  cdGroup.add(jewelCase);

  // 内部歌词衬卡 (深黑底烫银工艺)
  const linerGeo = new THREE.PlaneGeometry(3.9, 3.9);
  const linerMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.8,
    metalness: 0.2
  });
  const liner = new THREE.Mesh(linerGeo, linerMat);
  liner.position.set(0, 0, -0.1);
  jewelCase.add(liner);

  // 2. 拟真实体 CD 光盘
  const discGeo = new THREE.CylinderGeometry(1.85, 1.85, 0.04, 64);
  
  // 生成彩虹光栅纹理
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createConicGradient(0, 256, 256);
  grad.addColorStop(0.00, "#ff3366");
  grad.addColorStop(0.18, "#ffaa00");
  grad.addColorStop(0.36, "#33ff77");
  grad.addColorStop(0.54, "#00ccff");
  grad.addColorStop(0.72, "#9933ff");
  grad.addColorStop(0.90, "#ff33aa");
  grad.addColorStop(1.00, "#ff3366");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // 绘制数据环带与中心扣环
  ctx.beginPath();
  ctx.arc(256, 256, 240, 0, Math.PI * 2);
  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.stroke();

  const rainbowTexture = new THREE.CanvasTexture(canvas);

  const discMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.95,
    roughness: 0.18,
    map: rainbowTexture,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    reflectivity: 1.0
  });

  cdDisc = new THREE.Mesh(discGeo, discMat);
  cdDisc.rotation.x = Math.PI / 2;
  cdDisc.position.set(1.4, 0, 0.08); // 默认滑出姿态
  cdGroup.add(cdDisc);

  // 光盘内孔与透明固定环
  const hubGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.05, 32);
  const hubMat = new THREE.MeshPhysicalMaterial({
    color: 0xcccccc,
    metalness: 0.2,
    roughness: 0.1,
    transmission: 0.85,
    transparent: true,
    opacity: 0.8
  });
  const hub = new THREE.Mesh(hubGeo, hubMat);
  cdDisc.add(hub);

  const holeGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.06, 32);
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x05070a });
  const hole = new THREE.Mesh(holeGeo, holeMat);
  cdDisc.add(hole);

  // 鼠标拖拽 3D 旋转视角交互
  container.addEventListener("mousedown", (e) => {
    isDragging = true;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - prevMouseX;
    const deltaY = e.clientY - prevMouseY;
    cdGroup.rotation.y += deltaX * 0.008;
    cdGroup.rotation.x += deltaY * 0.008;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
  });

  // 移动端 Touch 支持
  container.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
      isDragging = true;
      prevMouseX = e.touches[0].clientX;
      prevMouseY = e.touches[0].clientY;
    }
  });

  window.addEventListener("touchmove", (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    const deltaX = e.touches[0].clientX - prevMouseX;
    const deltaY = e.touches[0].clientY - prevMouseY;
    cdGroup.rotation.y += deltaX * 0.01;
    cdGroup.rotation.x += deltaY * 0.01;
    prevMouseX = e.touches[0].clientX;
    prevMouseY = e.touches[0].clientY;
  });

  window.addEventListener("touchend", () => { isDragging = false; });

  // 控制按钮交互
  const btnEject = document.getElementById("btn-eject-cd");
  const btnSpeed = document.getElementById("btn-speed-cd");
  const btnHolo = document.getElementById("btn-holo-cd");

  if (btnEject) {
    btnEject.addEventListener("click", () => {
      discEjected = !discEjected;
      btnEject.classList.toggle("active", discEjected);
      btnEject.textContent = discEjected ? "💿 唱片已抽出" : "💿 推入盒中";
    });
  }

  if (btnSpeed) {
    const speeds = [
      { label: "🔄 转速: 正常", val: 0.015 },
      { label: "⚡ 转速: 极速", val: 0.045 },
      { label: "⏸ 转速: 暂停", val: 0.000 },
      { label: "🐢 转速: 缓慢", val: 0.005 }
    ];
    let sIdx = 0;
    btnSpeed.addEventListener("click", () => {
      sIdx = (sIdx + 1) % speeds.length;
      discSpeed = speeds[sIdx].val;
      btnSpeed.textContent = speeds[sIdx].label;
    });
  }

  if (btnHolo) {
    btnHolo.addEventListener("click", () => {
      isHoloEnhanced = !isHoloEnhanced;
      btnHolo.classList.toggle("active", isHoloEnhanced);
      discMat.roughness = isHoloEnhanced ? 0.05 : 0.18;
      discMat.clearcoatRoughness = isHoloEnhanced ? 0.02 : 0.1;
      discMat.reflectivity = isHoloEnhanced ? 1.5 : 1.0;
    });
  }

  // 自适应窗口重绘
  window.addEventListener("resize", () => {
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    threeCamera.aspect = w / h;
    threeCamera.updateProjectionMatrix();
    threeRenderer.setSize(w, h);
  });

  // 动画主循环
  function animate() {
    requestAnimationFrame(animate);

    // 光盘自主自转
    if (cdDisc) {
      cdDisc.rotation.y += discSpeed;

      // 唱片平滑出舱/归位动画
      const targetX = discEjected ? 1.4 : -0.6;
      cdDisc.position.x += (targetX - cdDisc.position.x) * 0.08;
    }

    // 默认空闲微漂浮律动
    if (!isDragging && cdGroup) {
      cdGroup.rotation.y += 0.002;
    }

    threeRenderer.render(threeScene, threeCamera);
  }
  animate();
}

// ========================================================
// 2. 五大复古形态 Tab 切换器
// ========================================================
function initCarrierTabs() {
  const tabs = document.querySelectorAll(".carrier-tab");
  const panes = document.querySelectorAll(".carrier-content-pane");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const targetId = tab.getAttribute("data-target");

      tabs.forEach(t => t.classList.remove("active"));
      panes.forEach(p => p.classList.remove("active"));

      tab.classList.add("active");
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add("active");
    });
  });
}

// ========================================================
// 3. 歌曲智能搜索与元数据全自动补全 (涵盖各大流媒体)
// ========================================================
let searchDebounceTimer = null;
let currentPreviewAudio = null;

function initMusicSearch() {
  const searchInput = document.getElementById("music-search-input");
  const dropdown = document.getElementById("search-results-dropdown");
  const spinner = document.getElementById("search-spinner");
  const previewCard = document.getElementById("selected-song-preview");
  const btnAudioTest = document.getElementById("btn-preview-audio-test");

  if (!searchInput || !dropdown) return;

  searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounceTimer);
    const query = searchInput.value.trim();

    if (query.length === 0) {
      dropdown.classList.add("hidden");
      dropdown.innerHTML = "";
      return;
    }

    spinner.classList.remove("hidden");
    searchDebounceTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const result = await res.json();
        spinner.classList.add("hidden");

        if (res.ok && result.code === 200 && result.data && result.data.length > 0) {
          renderSearchResults(result.data, dropdown);
        } else {
          dropdown.innerHTML = `
            <div style="padding:14px; text-align:center; color:var(--text-dim); font-size:0.85rem;">
              未找到匹配的歌曲，可尝试输入更精准的歌名或歌手
            </div>
          `;
          dropdown.classList.remove("hidden");
        }
      } catch (e) {
        spinner.classList.add("hidden");
      }
    }, 320);
  });

  // 点击外部关闭搜索下拉
  document.addEventListener("click", (e) => {
    if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add("hidden");
    }
  });

  // 渲染搜索结果列表
  function renderSearchResults(tracks, container) {
    container.innerHTML = "";
    tracks.forEach(track => {
      const item = document.createElement("div");
      item.className = "search-dropdown-item";
      item.innerHTML = `
        <img src="${escapeHtml(track.cover || 'assets/logo.svg')}" alt="" class="search-thumb" loading="lazy">
        <div class="search-item-meta">
          <div class="search-item-title">${escapeHtml(track.title)}</div>
          <div class="search-item-artist">${escapeHtml(track.artist)} · ${escapeHtml(track.album || '')}</div>
        </div>
        <span class="search-preview-badge">30s 原声</span>
      `;

      item.addEventListener("click", () => {
        selectTrack(track);
        container.classList.add("hidden");
      });

      container.appendChild(item);
    });
    container.classList.remove("hidden");
  }

  // 选中某首歌曲：全自动补全表单数据
  function selectTrack(track) {
    document.getElementById("song_title").value = track.title;
    document.getElementById("artist").value = track.artist;
    document.getElementById("album_cover").value = track.cover;
    document.getElementById("preview_url").value = track.preview_url;
    document.getElementById("platform_links").value = JSON.stringify(track.platform_links || {});

    // 更新选中预览卡片
    document.getElementById("preview-cover-img").src = track.cover || 'assets/logo.svg';
    document.getElementById("preview-song-title").textContent = track.title;
    document.getElementById("preview-artist-name").textContent = track.artist;
    previewCard.classList.remove("hidden");

    // 音频试听测试
    if (btnAudioTest) {
      if (track.preview_url) {
        btnAudioTest.classList.remove("hidden");
        btnAudioTest.onclick = () => {
          togglePreviewAudio(track.preview_url, btnAudioTest);
        };
      } else {
        btnAudioTest.classList.add("hidden");
      }
    }
  }

  function togglePreviewAudio(url, buttonEl) {
    if (currentPreviewAudio && !currentPreviewAudio.paused) {
      currentPreviewAudio.pause();
      buttonEl.textContent = "▶ 试听";
      return;
    }
    if (!currentPreviewAudio || currentPreviewAudio.src !== url) {
      if (currentPreviewAudio) currentPreviewAudio.pause();
      currentPreviewAudio = new Audio(url);
      currentPreviewAudio.addEventListener("ended", () => {
        buttonEl.textContent = "▶ 试听";
      });
    }
    currentPreviewAudio.play();
    buttonEl.textContent = "⏸ 暂停";
  }
}

// ========================================================
// 4. 音乐礼物盒 2.0 (拆盲盒 + 30s试听 + 全平台跳链 + 邮箱回响)
// ========================================================
let activeUnpackAudio = null;

function initGiftBox() {
  const btnOpen = document.getElementById("btn-open-random");
  const slot = document.getElementById("gift-display-slot");
  const form = document.getElementById("gift-form");
  const feedback = document.getElementById("form-feedback");
  const btnSubmit = document.getElementById("btn-submit-gift");

  if (!btnOpen || !slot || !form) return;

  // 1. 拆盲盒
  btnOpen.addEventListener("click", async () => {
    btnOpen.disabled = true;
    btnOpen.innerHTML = "<span>正在破盒开启...</span>";

    if (activeUnpackAudio) {
      activeUnpackAudio.pause();
      activeUnpackAudio = null;
    }

    try {
      const res = await fetch("/api/gifts/random", { cache: "no-store" });
      const result = await res.json();

      if (res.ok && result.code === 200 && result.data) {
        renderUnpackedCard(result.data, slot);
      } else {
        slot.innerHTML = `
          <div class="gift-slot-idle">
            <div class="blind-box-graphic">🍃</div>
            <p class="idle-title">盲盒暂时空空如也</p>
            <p class="idle-desc">${escapeHtml(result.message || "来右侧做第一个封存音乐礼物的人吧！")}</p>
          </div>
        `;
      }
    } catch (err) {
      slot.innerHTML = `
        <div class="gift-slot-idle">
          <p style="color:var(--danger);">网络连接不稳定，请稍后刷新重试。</p>
        </div>
      `;
    } finally {
      btnOpen.disabled = false;
      btnOpen.innerHTML = "<span>🎲 再拆一个盲盒</span>";
    }
  });

  // 渲染拆开的礼物卡片 (包含专辑黑胶唱盘、30秒高保真试听、各大平台链接、共鸣与回信)
  function renderUnpackedCard(gift, container) {
    const title = escapeHtml(gift.song_title);
    const artist = escapeHtml(gift.artist || '未知艺术家');
    const msg = escapeHtml(gift.message);
    const nickname = escapeHtml(gift.nickname || '神秘知音');
    const cover = gift.album_cover || 'assets/logo.svg';
    const previewUrl = gift.preview_url || '';
    const links = gift.platform_links || {};
    const likes = gift.likes_count || 0;
    const dateStr = new Date(gift.created_at || Date.now()).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    let previewPlayerHtml = '';
    if (previewUrl) {
      previewPlayerHtml = `
        <div class="preview-audio-bar">
          <button type="button" class="btn-play-preview" id="btn-play-gift-audio">▶</button>
          <div class="audio-progress-wrap">
            <div class="audio-label">
              <span>30 秒官方原声片段</span>
              <span id="audio-time-label">0:00 / 0:30</span>
            </div>
            <div class="audio-progress-track">
              <div class="audio-progress-fill" id="audio-fill-bar"></div>
            </div>
          </div>
        </div>
      `;
    }

    // 各大流媒体平台跳链按钮
    const platformButtons = `
      <div class="listen-platforms-box">
        <div class="listen-title">拆礼人一键前往正版平台聆听全曲：</div>
        <div class="platform-chips-row">
          <a href="${escapeHtml(links.spotify || `https://open.spotify.com/search/${encodeURIComponent(title + ' ' + artist)}`)}" target="_blank" rel="noopener noreferrer" class="platform-chip chip-spotify">🟢 Spotify</a>
          <a href="${escapeHtml(links.netease || `https://music.163.com/#/search/m/?s=${encodeURIComponent(title + ' ' + artist)}`)}" target="_blank" rel="noopener noreferrer" class="platform-chip chip-netease">🔴 网易云音乐</a>
          <a href="${escapeHtml(links.qq || `https://y.qq.com/n/ryqq/search?w=${encodeURIComponent(title + ' ' + artist)}`)}" target="_blank" rel="noopener noreferrer" class="platform-chip chip-qq">🟢 QQ音乐</a>
          <a href="${escapeHtml(links.kugou || `https://www.kugou.com/yy/html/search.html#searchType=song&searchKeyWord=${encodeURIComponent(title + ' ' + artist)}`)}" target="_blank" rel="noopener noreferrer" class="platform-chip chip-kugou">🔵 酷狗音乐</a>
          <a href="${escapeHtml(links.apple || `https://music.apple.com/search?term=${encodeURIComponent(title + ' ' + artist)}`)}" target="_blank" rel="noopener noreferrer" class="platform-chip chip-apple">🍎 Apple Music</a>
        </div>
      </div>
    `;

    container.innerHTML = `
      <div class="unpacked-card">
        <div class="unpacked-top-row">
          <div class="unpacked-vinyl-wrapper">
            <img src="${escapeHtml(cover)}" alt="" class="unpacked-cover-img" id="unpacked-cover">
          </div>
          <div class="unpacked-song-meta">
            <div class="unpacked-song-title">《${title}》</div>
            <div class="unpacked-artist-name">${artist}</div>
          </div>
        </div>

        ${previewPlayerHtml}

        <div class="unpacked-quote-box">
          “ ${msg} ”
        </div>

        <div class="unpacked-sender-tag">
          <span>由 <strong>${nickname}</strong> 封存入盒</span>
          <span>${dateStr}</span>
        </div>

        ${platformButtons}

        <!-- 双向共鸣与回信区 -->
        <div class="resonance-wall">
          <div class="resonance-actions">
            <button type="button" class="btn-heart-resonate" id="btn-heart-reaction" data-id="${gift.id}">
              <span>❤️ 共鸣心意</span>
              <strong id="heart-count">${likes}</strong>
            </button>
            <span style="font-size:0.78rem; color:var(--text-dim);">觉得感动？点个赞或回一句话</span>
          </div>
          <div class="reply-input-row">
            <input type="text" id="receiver-reply-msg" placeholder="写一句拆盒感言给送礼人..." maxlength="150">
            <button type="button" id="btn-submit-reply" class="btn-send-reply" data-id="${gift.id}">💌 回信</button>
          </div>
          <div id="reply-feedback" style="font-size:0.78rem; color:var(--accent-cyan); display:none; margin-top:4px;"></div>
        </div>
      </div>
    `;

    // 绑定试听播放器逻辑
    if (previewUrl) {
      const playBtn = document.getElementById("btn-play-gift-audio");
      const coverImg = document.getElementById("unpacked-cover");
      const fillBar = document.getElementById("audio-fill-bar");
      const timeLabel = document.getElementById("audio-time-label");

      activeUnpackAudio = new Audio(previewUrl);

      playBtn.addEventListener("click", () => {
        if (activeUnpackAudio.paused) {
          activeUnpackAudio.play();
          playBtn.textContent = "⏸";
          coverImg.classList.remove("paused");
        } else {
          activeUnpackAudio.pause();
          playBtn.textContent = "▶";
          coverImg.classList.add("paused");
        }
      });

      activeUnpackAudio.addEventListener("timeupdate", () => {
        if (!activeUnpackAudio.duration) return;
        const pct = (activeUnpackAudio.currentTime / activeUnpackAudio.duration) * 100;
        fillBar.style.width = pct + "%";
        const curSec = Math.floor(activeUnpackAudio.currentTime);
        timeLabel.textContent = `0:${curSec < 10 ? '0' : ''}${curSec} / 0:30`;
      });

      activeUnpackAudio.addEventListener("ended", () => {
        playBtn.textContent = "▶";
        fillBar.style.width = "0%";
        timeLabel.textContent = "0:00 / 0:30";
        coverImg.classList.add("paused");
      });
    }

    // 绑定点赞共鸣逻辑
    const heartBtn = document.getElementById("btn-heart-reaction");
    heartBtn.addEventListener("click", async () => {
      heartBtn.disabled = true;
      try {
        const res = await fetch("/api/gifts/react", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gift_id: gift.id, action: "heart" })
        });
        const d = await res.json();
        if (res.ok && d.code === 200) {
          document.getElementById("heart-count").textContent = d.likes_count;
          heartBtn.style.background = "rgba(244, 63, 94, 0.4)";
        }
      } catch (e) {}
    });

    // 绑定回信逻辑 (触发邮件通知)
    const replyBtn = document.getElementById("btn-submit-reply");
    const replyInput = document.getElementById("receiver-reply-msg");
    const replyFeedback = document.getElementById("reply-feedback");

    replyBtn.addEventListener("click", async () => {
      const text = replyInput.value.trim();
      if (!text) return;
      replyBtn.disabled = true;
      replyBtn.textContent = "发送中...";

      try {
        const res = await fetch("/api/gifts/react", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gift_id: gift.id,
            action: "reply",
            reply_text: text,
            receiver_name: "知音听众"
          })
        });
        const d = await res.json();
        replyFeedback.style.display = "block";
        replyFeedback.textContent = d.message || "💌 回信已成功寄出！";
        replyInput.value = "";
      } catch (e) {
        replyFeedback.style.display = "block";
        replyFeedback.style.color = "var(--danger)";
        replyFeedback.textContent = "发送失败，请稍后重试";
      } finally {
        replyBtn.disabled = false;
        replyBtn.textContent = "已投递";
      }
    });
  }

  // 2. 封存礼物表单提交
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    feedback.textContent = "";

    const song_title = document.getElementById("song_title").value.trim();
    const artist = document.getElementById("artist").value.trim() || '未知艺术家';
    const message = document.getElementById("message").value.trim();
    const nickname = document.getElementById("nickname").value.trim() || '神秘访客';
    const sender_email = document.getElementById("sender_email").value.trim();
    const album_cover = document.getElementById("album_cover").value.trim();
    const preview_url = document.getElementById("preview_url").value.trim();
    const platform_links = document.getElementById("platform_links").value.trim();

    if (!song_title) {
      feedback.style.color = "var(--danger)";
      feedback.textContent = "请先在上方搜索框选择一首你想封存的歌曲。";
      return;
    }

    if (!message) {
      feedback.style.color = "var(--danger)";
      feedback.textContent = "请写下对拆礼人的祝福或听歌心情。";
      return;
    }

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = "<span>正在施法封存心意...</span>";

    try {
      const res = await fetch("/api/gifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          song_title,
          artist,
          message,
          nickname,
          sender_email,
          album_cover,
          preview_url,
          platform_links,
          song_url: preview_url
        })
      });

      const result = await res.json();

      if (res.ok && result.code === 200) {
        feedback.style.color = "var(--success)";
        feedback.textContent = "🎉 礼物已成功封存入盒！当有听友拆开并回信时将通知你。";
        form.reset();
        document.getElementById("selected-song-preview").classList.add("hidden");
        document.getElementById("music-search-input").value = "";
        fetchGiftCount();
      } else {
        feedback.style.color = "var(--danger)";
        feedback.textContent = result.message || "提交失败，请稍后重试。";
      }
    } catch (err) {
      feedback.style.color = "var(--danger)";
      feedback.textContent = "网络连接故障，请检查您的网络设置。";
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = "<span>🎁 封存并放入礼物盒</span>";
    }
  });
}

// 获取全站累计礼物数
async function fetchGiftCount() {
  const counter = document.getElementById("total-gifts-count");
  if (!counter) return;

  try {
    const res = await fetch("/api/gifts/count");
    if (res.ok) {
      const data = await res.json();
      if (typeof data.total === "number") {
        counter.textContent = data.total;
      }
    }
  } catch (e) {}
}

// ========================================================
// 5. 版权与免责声明 Modal 弹窗
// ========================================================
function initDisclaimerModal() {
  const modal = document.getElementById("disclaimer-modal");
  const btnOpenNav = document.getElementById("btn-open-disclaimer");
  const btnOpenFooter = document.getElementById("footer-disclaimer-link");
  const btnClose = document.getElementById("btn-close-modal");
  const btnConfirm = document.getElementById("btn-modal-confirm");

  function openModal() {
    if (modal) modal.classList.remove("hidden");
  }

  function closeModal() {
    if (modal) modal.classList.add("hidden");
  }

  if (btnOpenNav) btnOpenNav.addEventListener("click", openModal);
  if (btnOpenFooter) btnOpenFooter.addEventListener("click", openModal);
  if (btnClose) btnClose.addEventListener("click", closeModal);
  if (btnConfirm) btnConfirm.addEventListener("click", closeModal);

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  }
}
