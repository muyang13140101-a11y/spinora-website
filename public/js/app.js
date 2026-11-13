// public/js/app.js - Spinora 官方网站交互逻辑与 3D 物理光栅引擎

document.addEventListener("DOMContentLoaded", () => {
  initThreeHero();
  initFormatIndex();
  initMusicSearch();
  initGiftBox();
  initDisclaimerModal();
  fetchGiftCount();
});

function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ========================================================
// 1. 开放式 WebGL 3D 实体 CD 背景舞台 (Three.js)
// ========================================================
let threeScene, threeCamera, threeRenderer, cdGroup, cdDisc, jewelCase, dustPoints;
let isDragging = false, prevMouseX = 0, prevMouseY = 0;
let discEjected = true;
let discSpeed = 0.008;
let isHoloEnhanced = false;

function buildRealisticCDTexture() {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const cx = size / 2;
  const cy = size / 2;

  // 1. 拉丝银铝基底
  ctx.fillStyle = "#b8bcc4";
  ctx.fillRect(0, 0, size, size);

  // 2. 真实 CD 物理各向异性光栅反射（细腻金属光谱，非廉价纯色彩虹）
  const conic = ctx.createConicGradient(0.4, cx, cy);
  conic.addColorStop(0.00, "rgba(255, 255, 255, 0.40)");
  conic.addColorStop(0.08, "rgba(212, 163, 115, 0.32)");
  conic.addColorStop(0.18, "rgba(147, 197, 253, 0.35)");
  conic.addColorStop(0.28, "rgba(255, 255, 255, 0.15)");
  conic.addColorStop(0.42, "rgba(244, 180, 210, 0.25)");
  conic.addColorStop(0.55, "rgba(255, 255, 255, 0.45)");
  conic.addColorStop(0.68, "rgba(165, 243, 252, 0.30)");
  conic.addColorStop(0.80, "rgba(212, 163, 115, 0.28)");
  conic.addColorStop(0.92, "rgba(255, 255, 255, 0.20)");
  conic.addColorStop(1.00, "rgba(255, 255, 255, 0.40)");
  ctx.fillStyle = conic;
  ctx.fillRect(0, 0, size, size);

  // 3. 微米级数据轨同心圆细纹
  for (let r = 170; r < 495; r += 3) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = r % 9 === 0 ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  // 4. 刻录区外缘与内圈 Lead-in 边界环
  ctx.beginPath();
  ctx.arc(cx, cy, 162, 0, Math.PI * 2);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, 496, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  return tex;
}

function initThreeHero() {
  const container = document.getElementById("three-container");
  if (!container || typeof THREE === "undefined") return;

  container.innerHTML = "";

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || 680;

  threeScene = new THREE.Scene();
  threeCamera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
  threeCamera.position.set(0, 0, 8.8);

  threeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  threeRenderer.setSize(width, height);
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  threeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  threeRenderer.toneMappingExposure = 1.15;
  container.appendChild(threeRenderer.domElement);

  // 棚拍布光：暖琥珀主光 + 冷银轮廓光
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
  threeScene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xfde6c4, 2.0);
  keyLight.position.set(5, 6, 5);
  threeScene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xcbd5e1, 1.4);
  rimLight.position.set(-6, -3, 3);
  threeScene.add(rimLight);

  // 3D CD 总装配组（桌面端置右作为开放背景视觉焦点）
  cdGroup = new THREE.Group();
  threeScene.add(cdGroup);
  cdGroup.position.set(width > 960 ? 2.15 : 0, width > 960 ? 0.05 : 0.6, 0);
  cdGroup.rotation.x = 0.22;
  cdGroup.rotation.y = -0.42;

  // 1. 亚克力磨砂外盒
  const caseGeo = new THREE.BoxGeometry(4.3, 4.3, 0.28);
  const caseMat = new THREE.MeshPhysicalMaterial({
    color: 0x18181c,
    metalness: 0.08,
    roughness: 0.16,
    transmission: 0.72,
    thickness: 0.45,
    transparent: true,
    opacity: 0.68,
    reflectivity: 0.95
  });
  jewelCase = new THREE.Mesh(caseGeo, caseMat);
  jewelCase.position.set(-0.75, 0, 0);
  cdGroup.add(jewelCase);

  // 盒内印刷衬底（深黑哑光）
  const linerGeo = new THREE.PlaneGeometry(4.0, 4.0);
  const linerMat = new THREE.MeshStandardMaterial({
    color: 0x0b0b0e,
    roughness: 0.85,
    metalness: 0.1
  });
  const liner = new THREE.Mesh(linerGeo, linerMat);
  liner.position.set(0, 0, -0.09);
  jewelCase.add(liner);

  // 左侧脊柱纹理条
  const spineGeo = new THREE.BoxGeometry(0.28, 4.26, 0.26);
  const spineMat = new THREE.MeshStandardMaterial({
    color: 0x27272c,
    roughness: 0.4,
    metalness: 0.5
  });
  const spine = new THREE.Mesh(spineGeo, spineMat);
  spine.position.set(-2.0, 0, 0);
  jewelCase.add(spine);

  // 2. 实体 CD 光盘
  const discGeo = new THREE.CylinderGeometry(1.92, 1.92, 0.032, 96);
  const cdTexture = buildRealisticCDTexture();

  const discMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.92,
    roughness: 0.16,
    map: cdTexture,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    reflectivity: 1.0
  });

  cdDisc = new THREE.Mesh(discGeo, discMat);
  cdDisc.rotation.x = Math.PI / 2;
  cdDisc.position.set(1.45, 0, 0.06);
  cdGroup.add(cdDisc);

  // 透明聚碳酸酯内环与中心孔
  const hubGeo = new THREE.CylinderGeometry(0.56, 0.56, 0.038, 48);
  const hubMat = new THREE.MeshPhysicalMaterial({
    color: 0xe4e4e7,
    metalness: 0.1,
    roughness: 0.1,
    transmission: 0.88,
    transparent: true,
    opacity: 0.85
  });
  const hub = new THREE.Mesh(hubGeo, hubMat);
  cdDisc.add(hub);

  const holeGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.05, 32);
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0c });
  const hole = new THREE.Mesh(holeGeo, holeMat);
  cdDisc.add(hole);

  // 3. 空间微尘粒子（增强物理空气感）
  const dustCount = 120;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount * 3; i++) {
    dustPos[i] = (Math.random() - 0.5) * 14;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0xd4a373,
    size: 0.025,
    transparent: true,
    opacity: 0.35
  });
  dustPoints = new THREE.Points(dustGeo, dustMat);
  threeScene.add(dustPoints);

  // 鼠标拖拽 3D 视角交互
  container.addEventListener("mousedown", (e) => {
    isDragging = true;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - prevMouseX;
    const deltaY = e.clientY - prevMouseY;
    cdGroup.rotation.y += deltaX * 0.006;
    cdGroup.rotation.x += deltaY * 0.006;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;
  });

  window.addEventListener("mouseup", () => { isDragging = false; });

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
    cdGroup.rotation.y += deltaX * 0.008;
    cdGroup.rotation.x += deltaY * 0.008;
    prevMouseX = e.touches[0].clientX;
    prevMouseY = e.touches[0].clientY;
  });

  window.addEventListener("touchend", () => { isDragging = false; });

  // 硬件控制按钮
  const btnEject = document.getElementById("btn-eject-cd");
  const btnSpeed = document.getElementById("btn-speed-cd");
  const btnHolo = document.getElementById("btn-holo-cd");

  if (btnEject) {
    btnEject.addEventListener("click", () => {
      discEjected = !discEjected;
      btnEject.classList.toggle("active", discEjected);
      btnEject.textContent = discEjected ? "出舱 / EJECT" : "归位 / LOAD";
    });
  }

  if (btnSpeed) {
    const speeds = [
      { label: "转速 / 1X", val: 0.008 },
      { label: "转速 / 3X", val: 0.028 },
      { label: "转速 / PAUSE", val: 0.0 },
      { label: "转速 / 0.5X", val: 0.003 }
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
      discMat.roughness = isHoloEnhanced ? 0.06 : 0.16;
      discMat.clearcoatRoughness = isHoloEnhanced ? 0.02 : 0.08;
      discMat.reflectivity = isHoloEnhanced ? 1.4 : 1.0;
    });
  }

  window.addEventListener("resize", () => {
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    threeCamera.aspect = w / h;
    threeCamera.updateProjectionMatrix();
    threeRenderer.setSize(w, h);
    cdGroup.position.set(w > 960 ? 2.15 : 0, w > 960 ? 0.05 : 0.6, 0);
  });

  function animate() {
    requestAnimationFrame(animate);
    if (cdDisc) {
      cdDisc.rotation.y += discSpeed;
      const targetX = discEjected ? 1.45 : -0.75;
      cdDisc.position.x += (targetX - cdDisc.position.x) * 0.07;
    }
    if (!isDragging && cdGroup) {
      cdGroup.rotation.y += 0.0012;
    }
    if (dustPoints) {
      dustPoints.rotation.y += 0.0003;
    }
    threeRenderer.render(threeScene, threeCamera);
  }
  animate();
}

// ========================================================
// 2. 五种物理媒介形态索引切换器
// ========================================================
function initFormatIndex() {
  const items = document.querySelectorAll(".format-index-item");
  const panes = document.querySelectorAll(".format-pane");

  items.forEach(item => {
    item.addEventListener("click", () => {
      const targetId = item.getAttribute("data-target");
      items.forEach(i => i.classList.remove("active"));
      panes.forEach(p => p.classList.remove("active"));

      item.classList.add("active");
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add("active");
    });
  });
}

// ========================================================
// 3. 歌曲智能搜索与元数据全自动补全 (多源 + 浏览器 JSONP 双保险)
// ========================================================
let searchDebounceTimer = null;
let currentPreviewAudio = null;
let currentSearchSource = "all";
let isManualMode = false;

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
  const sourceTabs = document.querySelectorAll("#search-source-tabs .source-tab");
  const previewCard = document.getElementById("selected-song-preview");
  const btnAudioTest = document.getElementById("btn-preview-audio-test");
  const btnResetTrack = document.getElementById("btn-reset-selected");
  const btnToggleManual = document.getElementById("btn-toggle-manual");
  const manualBox = document.getElementById("manual-entry-box");

  if (!searchInput || !dropdown) return;

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

  if (btnClear) {
    btnClear.addEventListener("click", () => {
      searchInput.value = "";
      btnClear.classList.add("hidden");
      dropdown.classList.add("hidden");
      dropdown.innerHTML = "";
      searchInput.focus();
    });
  }

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
          <div style="padding:16px; text-align:center; color:var(--ink-muted); font-size:0.84rem;">
            未搜索到相关曲目，可切换上方曲库或点击「手动填写」。
          </div>
        `;
        dropdown.classList.remove("hidden");
      }
    } catch (e) {
      spinner.classList.add("hidden");
      dropdown.innerHTML = `
        <div style="padding:16px; text-align:center; color:var(--danger); font-size:0.84rem;">
          搜索请求暂不可用，请点击「手动填写」继续。
        </div>
      `;
      dropdown.classList.remove("hidden");
    }
  }

  document.addEventListener("click", (e) => {
    if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add("hidden");
    }
  });

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
          ${track.preview_url ? '<span class="search-preview-badge">30s</span>' : ''}
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

  function selectTrack(track) {
    isManualMode = false;
    if (manualBox) manualBox.classList.add("hidden");
    if (btnToggleManual) btnToggleManual.textContent = "没搜到？手动填写";

    document.getElementById("song_title").value = track.title;
    document.getElementById("artist").value = track.artist;
    document.getElementById("album_cover").value = track.cover || "";
    document.getElementById("preview_url").value = track.preview_url || "";
    document.getElementById("platform_links").value = JSON.stringify(track.platform_links || {});

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
        ? "已匹配封面、30s 原声试听与六大平台跳链"
        : "已自动生成六大平台收听直达链接";
    }

    previewCard.classList.remove("hidden");

    if (btnAudioTest) {
      if (track.preview_url) {
        btnAudioTest.classList.remove("hidden");
        btnAudioTest.textContent = "试听";
        btnAudioTest.onclick = () => togglePreviewAudio(track.preview_url, btnAudioTest);
      } else {
        btnAudioTest.classList.add("hidden");
      }
    }
  }

  function togglePreviewAudio(url, buttonEl) {
    if (currentPreviewAudio && !currentPreviewAudio.paused) {
      currentPreviewAudio.pause();
      buttonEl.textContent = "试听";
      return;
    }
    if (!currentPreviewAudio || currentPreviewAudio.src !== url) {
      if (currentPreviewAudio) currentPreviewAudio.pause();
      currentPreviewAudio = new Audio(url);
      currentPreviewAudio.addEventListener("ended", () => {
        buttonEl.textContent = "试听";
      });
    }
    currentPreviewAudio.play();
    buttonEl.textContent = "暂停";
  }

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
// 4. 音乐礼物盲盒 (纯文字极简按钮 + 30s 试听 + 邮箱回信)
// ========================================================
let activeUnpackAudio = null;

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
    btnOpen.textContent = "开启中...";
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
          <div class="sealed-sleeve-card">
            <div class="sleeve-catalog-no">EMPTY ARCHIVE</div>
            <h3 class="sleeve-heading">盲盒暂时空空如也</h3>
            <p class="sleeve-sub">${escapeHtml(result.message || "来右侧做第一个封存音乐礼物的人吧。")}</p>
          </div>
        `;
      }
    } catch (err) {
      slot.innerHTML = `
        <div class="sealed-sleeve-card">
          <p style="color:var(--danger);">网络连接不稳定，请稍后刷新重试。</p>
        </div>
      `;
    } finally {
      btnOpen.disabled = false;
      btnOpen.textContent = "换一首 / 随机开启";
    }
  }

  btnOpen.addEventListener("click", openRandomGift);
  if (btnUnsealHero) btnUnsealHero.addEventListener("click", openRandomGift);

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
            <svg id="icon-play-svg" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
          </button>
          <div class="audio-progress-wrap">
            <div class="audio-label">
              <span>
                <span class="eq-bars" id="audio-eq-bars"><span></span><span></span><span></span><span></span></span>
                30S PREVIEW
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
          当前曲目暂无 30s 试听片段，请点击下方平台前往聆听完整版
        </div>
      `;
    }

    const platformButtons = `
      <div class="listen-platforms-box">
        <div class="listen-title">选择你常用的平台收听全曲：</div>
        <div class="platform-chips-row">
          <a href="${escapeHtml(links.netease || `https://music.163.com/#/search/m/?s=${query}`)}" target="_blank" rel="noopener noreferrer" class="platform-chip">网易云音乐</a>
          <a href="${escapeHtml(links.qq || `https://y.qq.com/n/ryqq/search?w=${query}`)}" target="_blank" rel="noopener noreferrer" class="platform-chip">QQ音乐</a>
          <a href="${escapeHtml(links.kugou || `https://www.kugou.com/yy/html/search.html#searchType=song&searchKeyWord=${query}`)}" target="_blank" rel="noopener noreferrer" class="platform-chip">酷狗音乐</a>
          <a href="${escapeHtml(links.spotify || `https://open.spotify.com/search/${query}`)}" target="_blank" rel="noopener noreferrer" class="platform-chip">Spotify</a>
          <a href="${escapeHtml(links.apple || `https://music.apple.com/search?term=${query}`)}" target="_blank" rel="noopener noreferrer" class="platform-chip">Apple Music</a>
          <a href="${escapeHtml(links.tidal || `https://listen.tidal.com/search?q=${query}`)}" target="_blank" rel="noopener noreferrer" class="platform-chip">Tidal</a>
        </div>
      </div>
    `;

    const existingReplyHtml = replyMessage
      ? `<div class="reply-echo-box">上一位拆盒听友回响：${escapeHtml(replyMessage)}</div>`
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
            <div class="unpacked-meta-time">SEALED · ${dateStr}</div>
          </div>
        </div>

        ${previewPlayerHtml}

        <div class="unpacked-quote-box">
          “ ${msg} ”
          <div class="unpacked-quote-sender">—— ${nickname}</div>
        </div>

        ${existingReplyHtml}
        ${platformButtons}

        <div class="resonance-wall">
          <div class="resonance-actions">
            <button type="button" class="btn-heart-resonate" id="btn-heart-reaction" data-id="${gift.id}">
              <span>产生共鸣</span>
              <strong id="heart-count">${likes}</strong>
            </button>
            <span style="font-size:0.76rem; color:var(--ink-dim);">写句回信可邮件通知送礼人</span>
          </div>
          <div class="reply-input-row">
            <input type="text" id="receiver-reply-msg" placeholder="写一句拆盒感言给送礼人..." maxlength="150">
            <button type="button" id="btn-submit-reply" class="btn-send-reply" data-id="${gift.id}">寄出回信</button>
          </div>
          <div id="reply-feedback" style="font-size:0.78rem; color:var(--amber-bright); display:none; margin-top:2px;"></div>
        </div>
      </div>
    `;

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
          heartBtn.style.borderColor = "var(--amber)";
          heartBtn.style.color = "var(--amber-bright)";
        }
      } catch (e) {}
    });

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
        replyFeedback.style.color = res.ok ? "var(--amber-bright)" : "var(--danger)";
        replyFeedback.textContent = d.message || "回信已成功寄出。";
        if (res.ok) replyInput.value = "";
      } catch (e) {
        replyFeedback.style.display = "block";
        replyFeedback.style.color = "var(--danger)";
        replyFeedback.textContent = "发送失败，请稍后重试。";
      } finally {
        replyBtn.disabled = false;
        replyBtn.textContent = "寄出回信";
      }
    });
  }

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
    btnSubmit.textContent = "正在封存心意...";

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
        feedback.textContent = "礼物已成功封存入盒，感谢你的分享。";
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
      feedback.textContent = "网络连接故障，请检查网络设置。";
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = "封存并放入礼物盒";
    }
  });
}

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
// 5. 版权与免责声明弹窗
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
