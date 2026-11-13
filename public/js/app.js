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
// 3. 歌曲智能搜索与元数据全自动补全 (后端多源 + 浏览器iTunes JSONP双保险)
// ========================================================
let searchDebounceTimer = null;
let currentPreviewAudio = null;
let currentSearchSource = "all";
let isManualMode = false;

// 浏览器端 iTunes JSONP 兜底搜索（不经过 Cloudflare IP，永不被苹果限流）
function searchItunesJSONP(query) {
  return new Promise((resolve) => {
    const cbName = "spinoraItunesCb_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      cleanup();
      resolve([]);
    }, 3500);

    function cleanup() {
      clearTimeout(timer);
      if (script.parentNode) script.parentNode.removeChild(script);
      try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
    }

    window[cbName] = (data) => {
      cleanup();
      const tracks = (data?.results || []).map(item => {
        const title = item.trackName || "";
        const artist = item.artistName || "未知歌手";
        const q = encodeURIComponent(`${title} ${artist}`);
        return {
          id: `apple_${item.trackId}`,
          source: "apple",
          source_label: "Apple",
          title,
          artist,
          album: item.collectionName || "",
          cover: (item.artworkUrl100 || "").replace("100x100bb", "600x600bb"),
          preview_url: item.previewUrl || "",
          platform_links: {
            spotify: `https://open.spotify.com/search/${q}`,
            netease: `https://music.163.com/#/search/m/?s=${q}`,
            qq: `https://y.qq.com/n/ryqq/search?w=${q}`,
            kugou: `https://www.kugou.com/yy/html/search.html#searchType=song&searchKeyWord=${q}`,
            apple: item.trackViewUrl || `https://music.apple.com/search?term=${q}`,
            tidal: `https://listen.tidal.com/search?q=${q}`
          }
        };
      });
      resolve(tracks);
    };

    script.src = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=5&callback=${cbName}`;
    script.onerror = () => { cleanup(); resolve([]); };
    document.body.appendChild(script);
  });
}

function initMusicSearch() {
  const searchInput = document.getElementById("music-search-input");
  const dropdown = document.getElementById("search-results-dropdown");
  const spinner = document.getElementById("search-spinner");
  const btnClear = document.getElementById("btn-clear-search");
  const sourceTabs = document.querySelectorAll("#search-source-tabs .source-chip");
  const previewCard = document.getElementById("selected-song-preview");
  const btnAudioTest = document.getElementById("btn-preview-audio-test");
  const btnResetTrack = document.getElementById("btn-reset-selected");
  const btnToggleManual = document.getElementById("btn-toggle-manual");
  const manualBox = document.getElementById("manual-entry-box");

  if (!searchInput || !dropdown) return;

  // 曲库源切换
  sourceTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      sourceTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentSearchSource = tab.getAttribute("data-source") || "all";
      if (searchInput.value.trim().length > 0) {
        triggerSearch(searchInput.value.trim());
      }
    });
  });

  // 清空搜索框
  if (btnClear) {
    btnClear.addEventListener("click", () => {
      searchInput.value = "";
      btnClear.classList.add("hidden");
      dropdown.classList.add("hidden");
      dropdown.innerHTML = "";
      searchInput.focus();
    });
  }

  // 手动填写切换
  if (btnToggleManual && manualBox) {
    btnToggleManual.addEventListener("click", () => {
      isManualMode = !isManualMode;
      manualBox.classList.toggle("hidden", !isManualMode);
      btnToggleManual.textContent = isManualMode ? "返回搜索选歌" : "没搜到？手动填写";
      if (isManualMode) {
        previewCard.classList.add("hidden");
        document.getElementById("manual_song_title")?.focus();
      }
    });
  }

  // 重选歌曲
  if (btnResetTrack) {
    btnResetTrack.addEventListener("click", () => {
      previewCard.classList.add("hidden");
      document.getElementById("song_title").value = "";
      document.getElementById("artist").value = "";
      document.getElementById("album_cover").value = "";
      document.getElementById("preview_url").value = "";
      document.getElementById("platform_links").value = "";
      if (currentPreviewAudio) currentPreviewAudio.pause();
      searchInput.focus();
    });
  }

  // 搜索输入防抖
  searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounceTimer);
    const query = searchInput.value.trim();

    if (btnClear) btnClear.classList.toggle("hidden", query.length === 0);

    if (query.length === 0) {
      dropdown.classList.add("hidden");
      dropdown.innerHTML = "";
      return;
    }

    searchDebounceTimer = setTimeout(() => triggerSearch(query), 320);
  });

  async function triggerSearch(query) {
    spinner.classList.remove("hidden");
    try {
      const apiPromise = fetch(`/api/search?q=${encodeURIComponent(query)}&source=${encodeURIComponent(currentSearchSource)}`)
        .then(r => r.ok ? r.json() : { code: r.status, data: [] })
        .catch(() => ({ code: 500, data: [] }));

      const itunesPromise = (currentSearchSource === "all" || currentSearchSource === "deezer")
        ? searchItunesJSONP(query)
        : Promise.resolve([]);

      const [apiRes, itunesTracks] = await Promise.all([apiPromise, itunesPromise]);
      spinner.classList.add("hidden");

      const serverTracks = Array.isArray(apiRes?.data) ? apiRes.data : [];
      const merged = [...serverTracks];
      const seen = new Set(merged.map(t => `${t.title.toLowerCase()}__${t.artist.toLowerCase()}`));

      for (const t of itunesTracks) {
        const key = `${t.title.toLowerCase()}__${t.artist.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(t);
        } else {
          // 补充 Apple 的 30s 试听与高清封面
          const idx = merged.findIndex(m => `${m.title.toLowerCase()}__${m.artist.toLowerCase()}` === key);
          if (idx >= 0) {
            if (!merged[idx].preview_url && t.preview_url) merged[idx].preview_url = t.preview_url;
            if (!merged[idx].cover && t.cover) merged[idx].cover = t.cover;
          }
        }
      }

      if (merged.length > 0) {
        renderSearchResults(merged.slice(0, 12), dropdown);
      } else {
        dropdown.innerHTML = `
          <div style="padding:16px; text-align:center; color:var(--text-muted); font-size:0.84rem;">
            未搜索到相关曲目，可以尝试切换上方曲库标签，或点击下方 <strong style="color:var(--accent-cyan);">手动填写</strong>。
          </div>
        `;
        dropdown.classList.remove("hidden");
      }
    } catch (e) {
      spinner.classList.add("hidden");
      dropdown.innerHTML = `
        <div style="padding:16px; text-align:center; color:var(--danger); font-size:0.84rem;">
          搜索请求暂不可用，请点击下方「手动填写」继续封存礼物。
        </div>
      `;
      dropdown.classList.remove("hidden");
    }
  }

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
        <img src="${escapeHtml(track.cover || 'assets/logo.svg')}" alt="" class="search-thumb" loading="lazy" onerror="this.src='assets/logo.svg'">
        <div class="search-item-meta">
          <div class="search-item-title">${escapeHtml(track.title)}</div>
          <div class="search-item-artist">${escapeHtml(track.artist)}${track.album ? ' · ' + escapeHtml(track.album) : ''}</div>
        </div>
        <div class="search-item-badges">
          <span class="search-source-pill">${escapeHtml(track.source_label || '曲库')}</span>
          ${track.preview_url ? '<span class="search-preview-badge">可试听</span>' : ''}
        </div>
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
    isManualMode = false;
    if (manualBox) manualBox.classList.add("hidden");
    if (btnToggleManual) btnToggleManual.textContent = "没搜到？手动填写";

    document.getElementById("song_title").value = track.title;
    document.getElementById("artist").value = track.artist;
    document.getElementById("album_cover").value = track.cover || "";
    document.getElementById("preview_url").value = track.preview_url || "";
    document.getElementById("platform_links").value = JSON.stringify(track.platform_links || {});

    // 更新选中预览卡片
    const coverEl = document.getElementById("preview-cover-img");
    coverEl.src = track.cover || "assets/logo.svg";
    coverEl.onerror = () => { coverEl.src = "assets/logo.svg"; };
    document.getElementById("preview-song-title").textContent = track.title;
    document.getElementById("preview-artist-name").textContent = track.artist;
    const srcTag = document.getElementById("preview-source-tag");
    if (srcTag) srcTag.textContent = track.source_label || "聚合曲库";

    const statusTag = document.getElementById("preview-status-tag");
    if (statusTag) {
      statusTag.textContent = track.preview_url
        ? "✓ 已匹配高清封面、30s 原声试听与六大平台跳链"
        : "✓ 已自动生成六大音乐平台收听直达链接";
    }

    previewCard.classList.remove("hidden");

    // 音频试听测试
    if (btnAudioTest) {
      if (track.preview_url) {
        btnAudioTest.classList.remove("hidden");
        btnAudioTest.textContent = "▶ 试听";
        btnAudioTest.onclick = () => togglePreviewAudio(track.preview_url, btnAudioTest);
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

  // 一键灵感祝福词 & 字数统计
  const msgTextarea = document.getElementById("message");
  const charCountEl = document.getElementById("msg-char-count");
  const moodChips = document.querySelectorAll(".mood-chip");

  if (msgTextarea && charCountEl) {
    msgTextarea.addEventListener("input", () => {
      charCountEl.textContent = `${msgTextarea.value.length} / 300`;
    });
  }

  moodChips.forEach(chip => {
    chip.addEventListener("click", () => {
      if (!msgTextarea) return;
      msgTextarea.value = chip.getAttribute("data-text") || "";
      if (charCountEl) charCountEl.textContent = `${msgTextarea.value.length} / 300`;
      msgTextarea.focus();
    });
  });
}

// ========================================================
// 4. 音乐礼物盒 2.0 (拆盲盒 + 30s试听 + 全平台矢量图标 + 邮箱回响)
// ========================================================
let activeUnpackAudio = null;

const PLATFORM_SVGS = {
  spotify: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>',
  netease: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.2 13.85c-.62.92-1.68 1.4-2.88 1.4-1.95 0-3.53-1.46-3.53-3.42 0-1.92 1.54-3.43 3.47-3.43.4 0 .77.07 1.11.2l-.38-2.6c-.06-.42.22-.82.64-.89.42-.06.82.22.89.64l.83 5.56c.14.94-.06 1.83-.15 2.54zm-2.88-3.8c-.99 0-1.8.82-1.8 1.83 0 1.02.81 1.84 1.8 1.84.97 0 1.73-.76 1.79-1.74l-.16-1.07c-.38-.53-.98-.86-1.63-.86z"/></svg>',
  qq: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm3.8 13.4c-.7 1.1-2 1.8-3.5 1.8a4.2 4.2 0 0 1-4.3-4.2 4.2 4.2 0 0 1 4.3-4.2c1.2 0 2.3.5 3 1.3V7.2a.8.8 0 0 1 1.6 0v5.9a3.5 3.5 0 0 1-1.1 2.3zm-3.5-4.9a2.5 2.5 0 1 0 2.5 2.5 2.5 2.5 0 0 0-2.5-2.5z"/></svg>',
  kugou: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6.5 4.5-6.5 4.5z"/></svg>',
  apple: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.96 6.33c.67-.81 1.12-1.94.99-3.07-.96.04-2.13.64-2.82 1.45-.61.71-1.15 1.86-1 2.97 1.07.08 2.16-.54 2.83-1.35z"/></svg>',
  tidal: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5l3.5 3.5L12 11.5 8.5 8 12 4.5zm-7 7L8.5 8 12 11.5 8.5 15 5 11.5zm14 0L15.5 8 12 11.5 15.5 15 19 11.5zm-7 3.5L15.5 18.5 12 22l-3.5-3.5L12 15z"/></svg>'
};

function initGiftBox() {
  const btnOpen = document.getElementById("btn-open-random");
  const btnUnsealHero = document.getElementById("btn-unseal-hero");
  const slot = document.getElementById("gift-display-slot");
  const form = document.getElementById("gift-form");
  const feedback = document.getElementById("form-feedback");
  const btnSubmit = document.getElementById("btn-submit-gift");

  if (!btnOpen || !slot || !form) return;

  async function openRandomGift() {
    btnOpen.disabled = true;
    btnOpen.innerHTML = "<span>正在开启盲盒...</span>";
    if (btnUnsealHero) btnUnsealHero.disabled = true;

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
          <div class="sealed-box-card">
            <div class="sealed-ribbon">EMPTY BOX</div>
            <h3 class="sealed-title">盲盒暂时空空如也</h3>
            <p class="sealed-desc">${escapeHtml(result.message || "来右侧做第一个封存音乐礼物的人吧！")}</p>
          </div>
        `;
      }
    } catch (err) {
      slot.innerHTML = `
        <div class="sealed-box-card">
          <p style="color:var(--danger);">网络连接不稳定，请稍后刷新重试。</p>
        </div>
      `;
    } finally {
      btnOpen.disabled = false;
      btnOpen.innerHTML = "<span>🎲 换一首 / 拆盲盒</span>";
    }
  }

  btnOpen.addEventListener("click", openRandomGift);
  if (btnUnsealHero) btnUnsealHero.addEventListener("click", openRandomGift);

  // 渲染拆开的礼物卡片
  function renderUnpackedCard(gift, container) {
    const title = escapeHtml(gift.song_title);
    const artist = escapeHtml(gift.artist || '未知艺术家');
    const msg = escapeHtml(gift.message);
    const nickname = escapeHtml(gift.nickname || '神秘知音');
    const cover = gift.album_cover || 'assets/logo.svg';
    const previewUrl = gift.preview_url || '';
    const links = gift.platform_links || {};
    const likes = gift.likes_count || 0;
    const replyMessage = gift.reply_message || '';
    const dateStr = new Date(gift.created_at || Date.now()).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const query = encodeURIComponent(`${gift.song_title} ${gift.artist || ''}`.trim());

    let previewPlayerHtml = '';
    if (previewUrl) {
      previewPlayerHtml = `
        <div class="preview-audio-bar">
          <button type="button" class="btn-play-preview" id="btn-play-gift-audio" aria-label="播放试听">
            <svg id="icon-play-svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
          </button>
          <div class="audio-progress-wrap">
            <div class="audio-label">
              <span>
                <span class="eq-bars" id="audio-eq-bars"><span></span><span></span><span></span><span></span></span>
                30 秒官方高保真试听
              </span>
              <span id="audio-time-label">0:00 / 0:30</span>
            </div>
            <div class="audio-progress-track">
              <div class="audio-progress-fill" id="audio-fill-bar"></div>
            </div>
          </div>
        </div>
      `;
    } else {
      previewPlayerHtml = `
        <div class="preview-audio-unavailable">
          🎵 该曲目暂无 30s 试听片段，请点击下方你常用的音乐平台收听完整版
        </div>
      `;
    }

    const platformButtons = `
      <div class="listen-platforms-box">
        <div class="listen-title">选择你常用的平台收听整首歌曲：</div>
        <div class="platform-chips-row">
          <a href="${escapeHtml(links.netease || `https://music.163.com/#/search/m/?s=${query}`)}" target="_blank" rel="noopener noreferrer" class="platform-chip chip-netease">${PLATFORM_SVGS.netease} 网易云</a>
          <a href="${escapeHtml(links.qq || `https://y.qq.com/n/ryqq/search?w=${query}`)}" target="_blank" rel="noopener noreferrer" class="platform-chip chip-qq">${PLATFORM_SVGS.qq} QQ音乐</a>
          <a href="${escapeHtml(links.kugou || `https://www.kugou.com/yy/html/search.html#searchType=song&searchKeyWord=${query}`)}" target="_blank" rel="noopener noreferrer" class="platform-chip chip-kugou">${PLATFORM_SVGS.kugou} 酷狗</a>
          <a href="${escapeHtml(links.spotify || `https://open.spotify.com/search/${query}`)}" target="_blank" rel="noopener noreferrer" class="platform-chip chip-spotify">${PLATFORM_SVGS.spotify} Spotify</a>
          <a href="${escapeHtml(links.apple || `https://music.apple.com/search?term=${query}`)}" target="_blank" rel="noopener noreferrer" class="platform-chip chip-apple">${PLATFORM_SVGS.apple} Apple</a>
          <a href="${escapeHtml(links.tidal || `https://listen.tidal.com/search?q=${query}`)}" target="_blank" rel="noopener noreferrer" class="platform-chip chip-tidal">${PLATFORM_SVGS.tidal} Tidal</a>
        </div>
      </div>
    `;

    const existingReplyHtml = replyMessage
      ? `<div class="reply-echo-box">💬 上一位拆盒听友回响：${escapeHtml(replyMessage)}</div>`
      : '';

    container.innerHTML = `
      <div class="unpacked-card">
        <div class="unpacked-hero-row">
          <div class="unpacked-sleeve-box">
            <div class="unpacked-vinyl-disc paused" id="unpacked-vinyl"></div>
            <img src="${escapeHtml(cover)}" alt="" class="unpacked-cover-img" id="unpacked-cover" onerror="this.src='assets/logo.svg'">
          </div>
          <div class="unpacked-song-meta">
            <div class="unpacked-song-title" title="《${title}》">《${title}》</div>
            <div class="unpacked-artist-name">${artist}</div>
            <div class="unpacked-meta-time">封存于 ${dateStr}</div>
          </div>
        </div>

        ${previewPlayerHtml}

        <div class="unpacked-quote-box">
          “ ${msg} ”
          <div class="unpacked-quote-sender">
            <span>—— 来自 <strong>${nickname}</strong> 的分享</span>
          </div>
        </div>

        ${existingReplyHtml}
        ${platformButtons}

        <div class="resonance-wall">
          <div class="resonance-actions">
            <button type="button" class="btn-heart-resonate" id="btn-heart-reaction" data-id="${gift.id}">
              <span>❤️ 产生共鸣</span>
              <strong id="heart-count">${likes}</strong>
            </button>
            <span style="font-size:0.76rem; color:var(--text-dim);">写句回信可邮件通知送礼人</span>
          </div>
          <div class="reply-input-row">
            <input type="text" id="receiver-reply-msg" placeholder="写一句拆盒感言给送礼人..." maxlength="150">
            <button type="button" id="btn-submit-reply" class="btn-send-reply" data-id="${gift.id}">💌 寄出回信</button>
          </div>
          <div id="reply-feedback" style="font-size:0.78rem; color:var(--accent-cyan); display:none; margin-top:2px;"></div>
        </div>
      </div>
    `;

    // 绑定试听播放器逻辑
    if (previewUrl) {
      const playBtn = document.getElementById("btn-play-gift-audio");
      const playSvg = document.getElementById("icon-play-svg");
      const vinylDisc = document.getElementById("unpacked-vinyl");
      const eqBars = document.getElementById("audio-eq-bars");
      const fillBar = document.getElementById("audio-fill-bar");
      const timeLabel = document.getElementById("audio-time-label");

      activeUnpackAudio = new Audio(previewUrl);

      const setPlayingUI = (playing) => {
        if (playing) {
          playSvg.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
          vinylDisc.classList.remove("paused");
          eqBars.classList.add("playing");
        } else {
          playSvg.innerHTML = '<polygon points="6 4 20 12 6 20 6 4"/>';
          vinylDisc.classList.add("paused");
          eqBars.classList.remove("playing");
        }
      };

      playBtn.addEventListener("click", () => {
        if (activeUnpackAudio.paused) {
          activeUnpackAudio.play();
          setPlayingUI(true);
        } else {
          activeUnpackAudio.pause();
          setPlayingUI(false);
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
        setPlayingUI(false);
        fillBar.style.width = "0%";
        timeLabel.textContent = "0:00 / 0:30";
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
          heartBtn.style.background = "rgba(244, 63, 94, 0.35)";
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
      replyBtn.textContent = "寄出中...";

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
        replyFeedback.style.color = res.ok ? "var(--accent-cyan)" : "var(--danger)";
        replyFeedback.textContent = d.message || "💌 回信已成功寄出！";
        if (res.ok) replyInput.value = "";
      } catch (e) {
        replyFeedback.style.display = "block";
        replyFeedback.style.color = "var(--danger)";
        replyFeedback.textContent = "发送失败，请稍后重试";
      } finally {
        replyBtn.disabled = false;
        replyBtn.textContent = "💌 寄出回信";
      }
    });
  }

  // 2. 封存礼物表单提交 (支持搜索选中 + 手动兜底)
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    feedback.textContent = "";

    let song_title = document.getElementById("song_title").value.trim();
    let artist = document.getElementById("artist").value.trim() || '未知艺术家';
    let album_cover = document.getElementById("album_cover").value.trim();
    let preview_url = document.getElementById("preview_url").value.trim();
    let platform_links = document.getElementById("platform_links").value.trim();

    if (isManualMode || !song_title) {
      const manualTitle = document.getElementById("manual_song_title")?.value.trim();
      const manualArtist = document.getElementById("manual_artist")?.value.trim();
      if (manualTitle) {
        song_title = manualTitle;
        artist = manualArtist || '未知艺术家';
        const q = encodeURIComponent(`${song_title} ${artist}`);
        platform_links = JSON.stringify({
          spotify: `https://open.spotify.com/search/${q}`,
          netease: `https://music.163.com/#/search/m/?s=${q}`,
          qq: `https://y.qq.com/n/ryqq/search?w=${q}`,
          kugou: `https://www.kugou.com/yy/html/search.html#searchType=song&searchKeyWord=${q}`,
          apple: `https://music.apple.com/search?term=${q}`,
          tidal: `https://listen.tidal.com/search?q=${q}`
        });
      }
    }

    const message = document.getElementById("message").value.trim();
    const nickname = document.getElementById("nickname").value.trim() || '神秘访客';
    const sender_email = document.getElementById("sender_email").value.trim();

    if (!song_title) {
      feedback.style.color = "var(--danger)";
      feedback.textContent = "请先在上方搜索选一首歌，或点击「手动填写」输入歌名。";
      return;
    }

    if (!message) {
      feedback.style.color = "var(--danger)";
      feedback.textContent = "请写下对拆礼人的祝福或听歌心情。";
      return;
    }

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = "<span>正在封存心意...</span>";

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
        document.getElementById("song_title").value = "";
        document.getElementById("artist").value = "";
        document.getElementById("album_cover").value = "";
        document.getElementById("preview_url").value = "";
        document.getElementById("platform_links").value = "";
        document.getElementById("selected-song-preview").classList.add("hidden");
        document.getElementById("music-search-input").value = "";
        document.getElementById("btn-clear-search")?.classList.add("hidden");
        const charCountEl = document.getElementById("msg-char-count");
        if (charCountEl) charCountEl.textContent = "0 / 300";
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
