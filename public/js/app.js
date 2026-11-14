// public/js/app.js - Spinora 官方网站交互逻辑与 3D 物理光栅引擎

document.addEventListener("DOMContentLoaded", () => {
  initMotionAndInteractions();
  initThreeHero();
  initFormatIndex();
  initMusicSearch();
  initGiftBox();
  initDisclaimerModal();
  fetchGiftCount();
});

function initMotionAndInteractions() {
  // 1. 顶部阅读进度条
  const progressBar = document.getElementById("scroll-progress-bar");
  if (progressBar) {
    window.addEventListener("scroll", () => {
      const h = document.documentElement;
      const pct = (h.scrollTop / (h.scrollHeight - h.clientHeight || 1)) * 100;
      progressBar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    }, { passive: true });
  }

  // 2. 滚动渐显编排
  const revealEls = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    revealEls.forEach(el => io.observe(el));
  } else {
    revealEls.forEach(el => el.classList.add("revealed"));
  }

  // 3. 面板鼠标聚光灯追踪
  document.querySelectorAll(".spotlight-panel").forEach(panel => {
    panel.addEventListener("mousemove", (e) => {
      const rect = panel.getBoundingClientRect();
      panel.style.setProperty("--mx", `${e.clientX - rect.left}px`);
      panel.style.setProperty("--my", `${e.clientY - rect.top}px`);
    });
  });

  // 4. 实体封套 3D 视差倾斜与塑封膜反光
  const sleeveCard = document.getElementById("sealed-sleeve-card");
  if (sleeveCard) {
    sleeveCard.addEventListener("mousemove", (e) => {
      if (sleeveCard.classList.contains("is-tearing")) return;
      const rect = sleeveCard.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      const rx = (0.5 - y) * 10;
      const ry = (x - 0.5) * 12;
      sleeveCard.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(1.015)`;
      sleeveCard.style.setProperty("--sheen-x", `${(x * 100).toFixed(1)}%`);
      sleeveCard.style.setProperty("--sheen-y", `${(y * 100).toFixed(1)}%`);
    });
    sleeveCard.addEventListener("mouseleave", () => {
      if (!sleeveCard.classList.contains("is-tearing")) {
        sleeveCard.style.transform = "";
      }
    });
  }
}

function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ========================================================
// 1. 复用 Spinora 客户端核心 3D 物理光栅引擎 (源自 src/cdModel.js & cdIridescenceShader.js)
// ========================================================
const CDDiffractionShader = {
  uniforms: {
    uAlbumColor: { value: null },
    uRainbowMap: { value: null },
    uBassPulse: { value: 0.0 }
  },
  vertexShader: `
    varying vec3 vLocalPosition;
    void main() {
      vLocalPosition = position;
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `,
  fragmentShader: `
    uniform vec3 uAlbumColor;
    uniform sampler2D uRainbowMap;
    uniform float uBassPulse;
    varying vec3 vLocalPosition;
    void main() {
      vec2 centerOffset = vLocalPosition.xy / 3.6;
      float dist = length(centerOffset);
      vec2 pulsedOffset = centerOffset * (1.0 - uBassPulse * 0.04);
      vec2 diskUv = pulsedOffset + vec2(0.5);
      vec4 bakedSpectrum = texture2D(uRainbowMap, diskUv);
      vec3 silverBase = vec3(0.92, 0.94, 0.97);
      vec3 pastelRainbow = mix(silverBase, bakedSpectrum.rgb, 0.28);
      vec3 spectrum = mix(pastelRainbow, pastelRainbow * (uAlbumColor + vec3(0.3)), 0.12);
      spectrum += vec3(uBassPulse * 0.12 * (0.8 + 0.2 * sin(dist * 60.0)));
      gl_FragColor = vec4(spectrum, 1.0);
    }
  `
};

// 1024x1024 连续数学极坐标放射彩虹镜面贴图（完全复用软件算法）
function createRadialRainbowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  const cx = 512, cy = 512;
  const imgData = ctx.createImageData(1024, 1024);
  const data = imgData.data;

  const spectralRgb = (t) => {
    const pi2 = 6.2831853;
    return [
      Math.round(255 * (0.5 + 0.5 * Math.cos(pi2 * t))),
      Math.round(255 * (0.5 + 0.5 * Math.cos(pi2 * (t + 0.333)))),
      Math.round(255 * (0.5 + 0.5 * Math.cos(pi2 * (t + 0.667))))
    ];
  };

  for (let y = 0; y < 1024; y++) {
    const dy = y - cy;
    const dy2 = dy * dy;
    const rowOffset = y * 1024 * 4;
    for (let x = 0; x < 1024; x++) {
      const dx = x - cx;
      const dist = Math.sqrt(dx * dx + dy2);
      const idx = rowOffset + x * 4;
      if (dist < 72 || dist > 510) {
        data[idx + 3] = 0;
        continue;
      }
      const angle = Math.atan2(dy, dx);
      const normAngle = (angle + Math.PI) / (Math.PI * 2);
      const phase = (normAngle * 8.0 + dist * 0.0012) % 1.0;
      const [sr, sg, sb] = spectralRgb(phase);
      const track = 0.96 + 0.04 * Math.sin(dist * 2.8);
      const desatSr = sr * 0.38 + 242 * 0.62;
      const desatSg = sg * 0.38 + 245 * 0.62;
      const desatSb = sb * 0.38 + 250 * 0.62;
      data[idx] = Math.min(255, Math.floor((238 * 0.76 + desatSr * 0.24) * track));
      data[idx + 1] = Math.min(255, Math.floor((242 * 0.76 + desatSg * 0.24) * track));
      data[idx + 2] = Math.min(255, Math.floor((248 * 0.76 + desatSb * 0.24) * track));
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 16;
  texture.needsUpdate = true;
  return texture;
}

function createRingWithRadialUV(innerR, outerR, segs) {
  const geo = new THREE.RingGeometry(innerR, outerR, segs);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    uv.setXY(i, x / (outerR * 2) + 0.5, y / (outerR * 2) + 0.5);
  }
  uv.needsUpdate = true;
  return geo;
}

function createLaserEngravingTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 512);
  ctx.save();
  ctx.translate(256, 256);
  ctx.font = '600 17px "JetBrains Mono", monospace';
  ctx.fillStyle = 'rgba(235, 240, 248, 0.75)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const radius = 205;
  const chars = text.split('');
  const step = (Math.PI * 1.65) / Math.max(chars.length, 1);
  for (let i = 0; i < chars.length; i++) {
    const angle = -Math.PI * 0.825 + i * step;
    ctx.save();
    ctx.rotate(angle);
    ctx.translate(0, -radius);
    ctx.fillText(chars[i], 0, 0);
    ctx.restore();
  }
  ctx.restore();
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createDefaultSpinoraCoverTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0, '#141418');
  grad.addColorStop(0.55, '#1d1b18');
  grad.addColorStop(1, '#0c0c0f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // 同心细线装饰
  for (let r = 80; r < 230; r += 26) {
    ctx.beginPath();
    ctx.arc(256, 256, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(212, 163, 115, 0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.fillStyle = '#d4a373';
  ctx.font = '500 18px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('SPINORA · ARCHIVE DISC', 256, 130);

  ctx.fillStyle = '#f4f4f0';
  ctx.font = 'italic 44px "Instrument Serif", Georgia, serif';
  ctx.fillText('Pure Sound', 256, 395);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

// 构建与软件完全一致的 JewelCase + CDDisc 3D 装配体
function createSpinoraCDAssembly(rainbowTex, defaultCoverTex) {
  const stageGroup = new THREE.Group();
  const caseGroup = new THREE.Group();
  caseGroup.scale.set(0.84, 0.84, 0.84);
  stageGroup.add(caseGroup);

  const caseWidth = 3.8, caseHeight = 3.8, caseDepth = 0.30, wallThick = 0.055;

  const caseAcrylicMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: 0.96,
    opacity: 1.0,
    transparent: true,
    roughness: 0.05,
    ior: 1.491,
    metalness: 0.0,
    reflectivity: 0.85,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    depthWrite: false
  });

  const caseBackMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x222a38,
    transmission: 0.38,
    opacity: 0.92,
    transparent: true,
    roughness: 0.64,
    metalness: 0.05,
    ior: 1.52,
    reflectivity: 0.85,
    clearcoat: 0.70,
    clearcoatRoughness: 0.25,
    depthWrite: true
  });

  // 盒底托盘底座 & 四周侧壁
  const backTrayMesh = new THREE.Mesh(
    new THREE.BoxGeometry(caseWidth - 2 * wallThick, caseHeight - 2 * wallThick, wallThick),
    caseBackMaterial
  );
  backTrayMesh.position.set(0, 0, -caseDepth / 2 + wallThick / 2);
  caseGroup.add(backTrayMesh);

  const backDepth = caseDepth - wallThick;
  const sideZ = -caseDepth / 2 + backDepth / 2;
  const lrGeo = new THREE.BoxGeometry(wallThick, caseHeight, backDepth);
  const leftSide = new THREE.Mesh(lrGeo, caseBackMaterial);
  leftSide.position.set(-caseWidth / 2 + wallThick / 2, 0, sideZ);
  caseGroup.add(leftSide);

  const rightSide = new THREE.Mesh(lrGeo, caseBackMaterial);
  rightSide.position.set(caseWidth / 2 - wallThick / 2, 0, sideZ);
  caseGroup.add(rightSide);

  const tbGeo = new THREE.BoxGeometry(caseWidth - 2 * wallThick, wallThick, backDepth);
  const topSide = new THREE.Mesh(tbGeo, caseBackMaterial);
  topSide.position.set(0, caseHeight / 2 - wallThick / 2, sideZ);
  caseGroup.add(topSide);

  const btmSide = new THREE.Mesh(tbGeo, caseBackMaterial);
  btmSide.position.set(0, -caseHeight / 2 + wallThick / 2, sideZ);
  caseGroup.add(btmSide);

  // 盒底中心卡扣座
  const hubMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.105, 0.115, 0.075, 32),
    new THREE.MeshStandardMaterial({ color: 0x22252c, roughness: 0.28, metalness: 0.45 })
  );
  hubMesh.rotation.x = Math.PI / 2;
  hubMesh.position.set(0, 0, -caseDepth / 2 + wallThick + 0.038);
  caseGroup.add(hubMesh);

  const hubInnerPin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.048, 0.048, 0.095, 24),
    new THREE.MeshStandardMaterial({ color: 0xd8e0ea, roughness: 0.18, metalness: 0.90 })
  );
  hubInnerPin.rotation.x = Math.PI / 2;
  hubInnerPin.position.set(0, 0, -caseDepth / 2 + wallThick + 0.046);
  caseGroup.add(hubInnerPin);

  // 正面盒盖铰链机构 + 4个画册限位小卡扣
  const caseLidHinge = new THREE.Group();
  caseLidHinge.position.set(-caseWidth / 2, 0, caseDepth / 2);
  caseGroup.add(caseLidHinge);

  const lidMesh = new THREE.Mesh(
    new THREE.BoxGeometry(caseWidth, caseHeight, wallThick),
    caseAcrylicMaterial
  );
  lidMesh.position.set(caseWidth / 2, 0, -wallThick / 2);
  caseLidHinge.add(lidMesh);

  [-0.95, 0.95].forEach((tabXOffset) => {
    [-1, 1].forEach((ySign) => {
      const stopperTab = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.06, 0.035),
        caseAcrylicMaterial
      );
      stopperTab.position.set(caseWidth / 2 + tabXOffset, ySign * (caseHeight / 2 - 0.045), -wallThick - 0.012);
      caseLidHinge.add(stopperTab);
    });
  });

  // 盒盖封底专辑画册
  const bookletMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: defaultCoverTex,
    roughness: 0.16,
    metalness: 0.03,
    clearcoat: 0.88,
    clearcoatRoughness: 0.08,
    reflectivity: 0.9,
    side: THREE.FrontSide
  });
  const bookletMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(caseWidth * 0.968, caseHeight * 0.968),
    bookletMaterial
  );
  bookletMesh.position.set(caseWidth / 2, 0, -wallThick - 0.005);
  caseLidHinge.add(bookletMesh);

  // CD 光盘装配体
  const discPositioner = new THREE.Group();
  caseGroup.add(discPositioner);
  const discInsidePos = new THREE.Vector3(0, 0, -0.045);
  const discEjectedPos = new THREE.Vector3(1.35, 0, 0.190);
  discPositioner.position.copy(discEjectedPos);

  const discRotator = new THREE.Group();
  discPositioner.add(discRotator);

  const R0 = 0.115, R1 = 0.25, R2 = 1.745, R3 = 1.80, segs = 128, cdThickness = 0.075;

  // 金属铝质基底母盘
  const substrateMesh = new THREE.Mesh(
    new THREE.RingGeometry(R0, R3, segs),
    new THREE.MeshStandardMaterial({ color: 0x9099a6, roughness: 0.20, metalness: 0.94, side: THREE.DoubleSide })
  );
  discRotator.add(substrateMesh);

  // 透明中心环体
  const hubSubstrateMesh = new THREE.Mesh(
    new THREE.RingGeometry(R0, R1, segs),
    new THREE.MeshPhysicalMaterial({
      color: 0xfafcff,
      transmission: 0.94,
      opacity: 0.95,
      transparent: true,
      roughness: 0.05,
      ior: 1.58,
      reflectivity: 0.85,
      clearcoat: 1.0,
      side: THREE.DoubleSide
    })
  );
  hubSubstrateMesh.position.z = cdThickness / 2 + 0.001;
  discRotator.add(hubSubstrateMesh);

  // 盘心激光微雕文字环
  const engravingTex = createLaserEngravingTexture('SPINORA AUDIOPHILE · 96kHz/24bit');
  const engravingMesh = new THREE.Mesh(
    new THREE.RingGeometry(0.165, 0.235, segs),
    new THREE.MeshStandardMaterial({ map: engravingTex, transparent: true, roughness: 0.18, metalness: 0.88, side: THREE.DoubleSide })
  );
  engravingMesh.position.z = cdThickness / 2 + 0.0018;
  discRotator.add(engravingMesh);

  // 正面：大幅面专辑封面印刷面
  const labelMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: defaultCoverTex,
    roughness: 0.14,
    metalness: 0.06,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    reflectivity: 0.95,
    side: THREE.FrontSide
  });
  const labelMesh = new THREE.Mesh(createRingWithRadialUV(R1, R2, segs), labelMaterial);
  labelMesh.position.z = cdThickness / 2 + 0.002;
  discRotator.add(labelMesh);

  // 正面：磨砂玻璃透明外圈
  const frostedRimMesh = new THREE.Mesh(
    new THREE.RingGeometry(R2, R3, segs),
    new THREE.MeshPhysicalMaterial({
      color: 0xf5f8ff,
      transmission: 0.82,
      opacity: 0.88,
      transparent: true,
      roughness: 0.35,
      ior: 1.54,
      reflectivity: 0.65,
      clearcoat: 0.5,
      side: THREE.FrontSide
    })
  );
  frostedRimMesh.position.z = cdThickness / 2 + 0.0025;
  discRotator.add(frostedRimMesh);

  // 背面：CDDiffractionShader 极坐标高亮放射彩虹镜面
  const diffractionShaderMat = new THREE.ShaderMaterial({
    uniforms: {
      uAlbumColor: { value: new THREE.Color(0xd4a373) },
      uRainbowMap: { value: rainbowTex },
      uBassPulse: { value: 0.0 }
    },
    vertexShader: CDDiffractionShader.vertexShader,
    fragmentShader: CDDiffractionShader.fragmentShader,
    side: THREE.FrontSide
  });
  const backMesh = new THREE.Mesh(new THREE.RingGeometry(R1, R3, segs), diffractionShaderMat);
  backMesh.rotation.y = Math.PI;
  backMesh.position.z = -cdThickness / 2 - 0.002;
  discRotator.add(backMesh);

  // 加厚深银色外边缘倒角
  const rimMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(R3, R3, cdThickness, segs, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x828b98, roughness: 0.18, metalness: 0.95 })
  );
  rimMesh.rotation.x = Math.PI / 2;
  discRotator.add(rimMesh);

  return {
    stageGroup,
    caseLidHinge,
    discPositioner,
    discRotator,
    discInsidePos,
    discEjectedPos,
    labelMaterial,
    bookletMaterial,
    diffractionShaderMat
  };
}

let heroCDAssembly = null;
let heroDiscEjected = true;
let heroFlipped = false;
let heroAngularVel = (25.0 * 2.0 * Math.PI) / 60.0; // 软件默认 25 RPM

function updateHeroDiscCover(coverUrl) {
  if (!heroCDAssembly || !coverUrl || coverUrl.includes('logo.svg')) return;
  loadCoverTexture(coverUrl).then((tex) => {
    if (!tex) return;
    heroCDAssembly.labelMaterial.map = tex;
    heroCDAssembly.labelMaterial.needsUpdate = true;
    heroCDAssembly.bookletMaterial.map = tex;
    heroCDAssembly.bookletMaterial.needsUpdate = true;
  });
}

function initThreeHero() {
  const container = document.getElementById("three-container");
  if (!container || typeof THREE === "undefined") return;
  container.innerHTML = "";

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || 640;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
  camera.position.set(0, 0, 8.6);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.95));
  const keyLight = new THREE.DirectionalLight(0xfde6c4, 2.1);
  keyLight.position.set(5, 6, 5);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xcbd5e1, 1.5);
  rimLight.position.set(-6, -3, 3);
  scene.add(rimLight);

  const rainbowTex = createRadialRainbowTexture();
  const defaultCoverTex = createDefaultSpinoraCoverTexture();
  heroCDAssembly = createSpinoraCDAssembly(rainbowTex, defaultCoverTex);

  const cdGroup = heroCDAssembly.stageGroup;
  scene.add(cdGroup);
  cdGroup.position.set(width > 960 ? 2.15 : 0, width > 960 ? 0.02 : 0.55, 0);
  cdGroup.rotation.set(0.18, -0.38, 0);

  // 微尘粒子
  const dustCount = 100;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount * 3; i++) dustPos[i] = (Math.random() - 0.5) * 14;
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dustPoints = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: 0xd4a373, size: 0.025, transparent: true, opacity: 0.32 })
  );
  scene.add(dustPoints);

  let isDragging = false, prevX = 0, prevY = 0;
  let targetRotY = -0.38, targetRotX = 0.18;

  container.addEventListener("mousedown", (e) => { isDragging = true; prevX = e.clientX; prevY = e.clientY; });
  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    targetRotY += (e.clientX - prevX) * 0.007;
    targetRotX += (e.clientY - prevY) * 0.007;
    prevX = e.clientX;
    prevY = e.clientY;
  });
  window.addEventListener("mouseup", () => { isDragging = false; });

  container.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) { isDragging = true; prevX = e.touches[0].clientX; prevY = e.touches[0].clientY; }
  });
  window.addEventListener("touchmove", (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    targetRotY += (e.touches[0].clientX - prevX) * 0.008;
    targetRotX += (e.touches[0].clientY - prevY) * 0.008;
    prevX = e.touches[0].clientX;
    prevY = e.touches[0].clientY;
  });
  window.addEventListener("touchend", () => { isDragging = false; });

  const btnEject = document.getElementById("btn-eject-cd");
  const btnFlip = document.getElementById("btn-flip-cd");
  const btnSpeed = document.getElementById("btn-speed-cd");

  if (btnEject) {
    btnEject.addEventListener("click", () => {
      heroDiscEjected = !heroDiscEjected;
      btnEject.classList.toggle("active", heroDiscEjected);
      btnEject.textContent = heroDiscEjected ? "出舱 / EJECT" : "归位 / LOAD";
    });
  }

  if (btnFlip) {
    btnFlip.addEventListener("click", () => {
      heroFlipped = !heroFlipped;
      btnFlip.classList.toggle("active", heroFlipped);
      targetRotY = heroFlipped ? (Math.PI - 0.35) : -0.38;
      targetRotX = heroFlipped ? -0.15 : 0.18;
    });
  }

  if (btnSpeed) {
    const speeds = [
      { label: "转速 / 25 RPM", rpm: 25.0 },
      { label: "转速 / 60 RPM", rpm: 60.0 },
      { label: "转速 / PAUSE", rpm: 0.0 },
      { label: "转速 / 12 RPM", rpm: 12.0 }
    ];
    let sIdx = 0;
    btnSpeed.addEventListener("click", () => {
      sIdx = (sIdx + 1) % speeds.length;
      heroAngularVel = (speeds[sIdx].rpm * 2.0 * Math.PI) / 60.0;
      btnSpeed.textContent = speeds[sIdx].label;
    });
  }

  window.addEventListener("resize", () => {
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    cdGroup.position.set(w > 960 ? 2.15 : 0, w > 960 ? 0.02 : 0.55, 0);
  });

  let lastTime = performance.now();
  let ceremony = 1.0;

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    // 盒盖开合与 CD 出舱平滑插值
    const targetCeremony = heroDiscEjected ? 1.0 : 0.0;
    ceremony += (targetCeremony - ceremony) * 0.08;
    heroCDAssembly.caseLidHinge.rotation.y = -2.05 * ceremony;
    heroCDAssembly.discPositioner.position.lerpVectors(
      heroCDAssembly.discInsidePos,
      heroCDAssembly.discEjectedPos,
      ceremony
    );

    // 真实转速旋转
    heroCDAssembly.discRotator.rotation.z -= heroAngularVel * dt;
    heroCDAssembly.diffractionShaderMat.uniforms.uBassPulse.value = 0.25 + 0.15 * Math.sin(now * 0.0025);

    if (!isDragging) {
      cdGroup.rotation.y += (targetRotY - cdGroup.rotation.y) * 0.07;
      cdGroup.rotation.x += (targetRotX - cdGroup.rotation.x) * 0.07;
    } else {
      cdGroup.rotation.y = targetRotY;
      cdGroup.rotation.x = targetRotX;
    }

    dustPoints.rotation.y += 0.0003;
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);
}

// ========================================================
// 2. 桌面端五种物理载体真实 3D 预览舞台 (#format-three-canvas)
// ========================================================
const FORMAT_META = {
  cd: {
    meta: "FORMAT 01 — COMPACT DISC",
    title: "实体亚克力 CD 唱片盒与全息光盘",
    desc: "PMMA 高透亚克力盒盖、磨砂半透底托与四枚画册限位卡扣；光盘采用深银钛铝金属基底，背面搭载 1024px 解析连续极坐标彩虹衍射 Shader。"
  },
  gramophone: {
    meta: "FORMAT 02 — GRAMOPHONE",
    title: "象牙白烤漆木箱与八瓣铸铜号角留声机",
    desc: "古典罗马凹槽立柱木箱、描金阶梯线脚、一体成型八瓣晨光铜号角（Morning Glory Horn）与水平胶囊拾音头，搭配 78 转虫胶唱片。"
  },
  vinyl: {
    meta: "FORMAT 03 — HI-FI TURNTABLE",
    title: "香槟钛灰金属 Hi-Fi 黑胶唱盘",
    desc: "钛灰拉丝金属底座、精密车削铝合金转盘、各向异性微沟槽黑胶唱片与共线滚花配重唱臂（含 21° 镂空唱头架与 33/45 RPM 指示灯）。"
  },
  cassette: {
    meta: "FORMAT 04 — COMPACT CASSETTE",
    title: "八零年代炭黑工程塑壳卡带",
    desc: "中空镂空视窗腔体、氧化铁深褐磁带卷盘、象牙白六爪齿轮、五枚金属十字螺丝与 100-50-0 透明刻度玻璃，还原精密机械走带。"
  },
  lyrics: {
    meta: "FORMAT 05 — OPTICAL LYRICS",
    title: "极光光学景深动态歌词大屏",
    desc: "实时提取专辑主色调渲染流体高斯背光，逐句随节拍平滑缩放与景深虚化，双击任意歌词即可精准跳转播放进度。"
  }
};

function createVinylGrooveTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  const cx = 512, cy = 512;

  ctx.fillStyle = "#08090c";
  ctx.fillRect(0, 0, 1024, 1024);

  for (let arm = 0; arm < 4; arm++) {
    const baseAngle = (arm * Math.PI) / 2;
    ctx.save();
    ctx.beginPath();
    for (let theta = 0; theta < Math.PI * 3.8; theta += 0.04) {
      const r = 240 + theta * 22 + Math.sin(theta * 3.4 + arm * 1.5) * 13;
      if (r > 504) break;
      const x = cx + Math.cos(baseAngle + theta) * r;
      const y = cy + Math.sin(baseAngle + theta) * r;
      if (theta === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = arm % 2 === 0 ? "rgba(215, 175, 110, 0.14)" : "rgba(100, 150, 240, 0.10)";
    ctx.lineWidth = 14 + arm * 3;
    ctx.filter = "blur(9px)";
    ctx.stroke();
    ctx.restore();
  }
  ctx.filter = "none";

  for (let a = 0; a < 360; a += 0.6) {
    const rad = (a * Math.PI) / 180;
    const sheen1 = Math.pow(Math.max(0, Math.cos((rad - 0.72) * 2)), 16);
    const sheen2 = Math.pow(Math.max(0, Math.cos((rad - 2.29) * 2)), 18) * 0.48;
    const intensity = Math.min(255, Math.floor((sheen1 + sheen2) * 92));
    if (intensity > 2) {
      ctx.strokeStyle = `rgba(240, 246, 255, ${intensity / 255})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(rad) * 243, cy + Math.sin(rad) * 243);
      ctx.lineTo(cx + Math.cos(rad) * 506, cy + Math.sin(rad) * 506);
      ctx.stroke();
    }
  }

  for (let r = 244; r < 505; r += 1.5) {
    const isGap = (r >= 329 && r <= 340) || (r >= 419 && r <= 430);
    if (isGap) {
      ctx.strokeStyle = "rgba(3, 4, 6, 0.96)";
      ctx.lineWidth = 2.0;
    } else {
      const waveNoise = Math.sin(r * 0.9) * 0.5 + 0.5;
      ctx.strokeStyle = (Math.round(r) % 3 === 0)
        ? `rgba(255, 255, 255, ${0.04 + waveNoise * 0.045})`
        : `rgba(18, 21, 28, ${0.72 + waveNoise * 0.18})`;
      ctx.lineWidth = 0.85;
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  return tex;
}

function buildAuthenticTurntable(coverTex) {
  const group = new THREE.Group();
  group.scale.set(0.68, 0.68, 0.68);
  group.rotation.set(-0.48, 0.22, 0.08);

  const plinthW = 4.50, plinthH = 3.85, plinthD = 0.26;
  const plinthMat = new THREE.MeshStandardMaterial({ color: 0x9c9992, roughness: 0.34, metalness: 0.58 });
  const plinthMesh = new THREE.Mesh(new THREE.BoxGeometry(plinthW, plinthH, plinthD), plinthMat);
  plinthMesh.position.set(0, 0, -plinthD / 2);
  group.add(plinthMesh);

  const subChassis = new THREE.Mesh(
    new THREE.BoxGeometry(plinthW - 0.16, plinthH - 0.16, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.6, metalness: 0.3 })
  );
  subChassis.position.set(0, 0, -plinthD - 0.06);
  group.add(subChassis);

  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xedf2f7, roughness: 0.14, metalness: 0.95 });
  const brushedSilverMat = new THREE.MeshStandardMaterial({ color: 0xd0d5dc, roughness: 0.24, metalness: 0.88 });
  const matteBlackMat = new THREE.MeshStandardMaterial({ color: 0x181a1e, roughness: 0.45, metalness: 0.25 });

  const platterX = -0.38, platterY = 0.02;
  const platterBase = new THREE.Mesh(new THREE.CylinderGeometry(1.82, 1.86, 0.10, 72), chromeMat);
  platterBase.rotation.x = Math.PI / 2;
  platterBase.position.set(platterX, platterY, 0.05);
  group.add(platterBase);

  const vinylRotator = new THREE.Group();
  vinylRotator.position.set(platterX, platterY, 0.105);
  group.add(vinylRotator);

  const vinylDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(1.75, 1.75, 0.032, 72),
    new THREE.MeshPhysicalMaterial({
      map: createVinylGrooveTexture(),
      roughness: 0.22,
      metalness: 0.32,
      clearcoat: 0.88,
      clearcoatRoughness: 0.14
    })
  );
  vinylDisc.rotation.x = Math.PI / 2;
  vinylRotator.add(vinylDisc);

  const innerBlack = new THREE.Mesh(
    new THREE.CircleGeometry(0.85, 64),
    new THREE.MeshStandardMaterial({ color: 0x111216, roughness: 0.35 })
  );
  innerBlack.position.z = 0.017;
  vinylRotator.add(innerBlack);

  const labelMesh = new THREE.Mesh(
    new THREE.CircleGeometry(0.82, 64),
    new THREE.MeshStandardMaterial({ map: coverTex, roughness: 0.28, metalness: 0.03 })
  );
  labelMesh.position.z = 0.019;
  vinylRotator.add(labelMesh);

  const accentRing = new THREE.Mesh(
    new THREE.RingGeometry(0.82, 0.85, 64),
    new THREE.MeshStandardMaterial({ color: 0xe0e4ec, roughness: 0.2, metalness: 0.88 })
  );
  accentRing.position.z = 0.020;
  vinylRotator.add(accentRing);

  const spindleBase = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.03, 24), brushedSilverMat);
  spindleBase.rotation.x = Math.PI / 2;
  spindleBase.position.z = 0.025;
  vinylRotator.add(spindleBase);

  const spindlePin = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.11, 20), chromeMat);
  spindlePin.rotation.x = Math.PI / 2;
  spindlePin.position.z = 0.065;
  vinylRotator.add(spindlePin);

  const armPivotX = 1.48, armPivotY = 1.05;
  const mountPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.54, 1.38, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x8e8d88, roughness: 0.28, metalness: 0.75 })
  );
  mountPlate.position.set(armPivotX + 0.08, 0.65, 0.02);
  group.add(mountPlate);

  [
    [0.34, 0.36, 0.06, 0.03, brushedSilverMat],
    [0.27, 0.29, 0.08, 0.08, matteBlackMat],
    [0.21, 0.23, 0.10, 0.14, brushedSilverMat]
  ].forEach(([r1, r2, h, zPos, mat]) => {
    const tCyl = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 32), mat);
    tCyl.rotation.x = Math.PI / 2;
    tCyl.position.set(armPivotX, armPivotY, zPos);
    group.add(tCyl);
  });

  const antiSkateBase = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.07, 24), matteBlackMat);
  antiSkateBase.rotation.x = Math.PI / 2;
  antiSkateBase.position.set(1.66, 0.64, 0.06);
  group.add(antiSkateBase);

  const antiSkateCap = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.08, 20), chromeMat);
  antiSkateCap.rotation.x = Math.PI / 2;
  antiSkateCap.position.set(1.66, 0.64, 0.07);
  group.add(antiSkateCap);

  const cueBox = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.12), matteBlackMat);
  cueBox.position.set(1.56, 0.18, 0.08);
  group.add(cueBox);

  const cueLever = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.24, 12), chromeMat);
  cueLever.position.set(1.68, 0.06, 0.12);
  cueLever.rotation.z = -0.15;
  group.add(cueLever);

  const tonearmGroup = new THREE.Group();
  tonearmGroup.position.set(armPivotX, armPivotY, 0.22);
  tonearmGroup.rotation.z = -0.46;
  group.add(tonearmGroup);

  tonearmGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.18, 20), chromeMat));
  const rearShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.50, 16), chromeMat);
  rearShaft.position.y = 0.35;
  tonearmGroup.add(rearShaft);

  const cwCone = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.10, 0.16, 24), chromeMat);
  cwCone.position.y = 0.26;
  tonearmGroup.add(cwCone);

  const cwBody = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.24, 28), matteBlackMat);
  cwBody.position.y = 0.46;
  tonearmGroup.add(cwBody);

  for (let k = 0; k < 16; k++) {
    const ka = (k / 16) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.22, 0.016), brushedSilverMat);
    rib.position.set(Math.cos(ka) * 0.165, 0.46, Math.sin(ka) * 0.165);
    rib.rotation.y = -ka;
    tonearmGroup.add(rib);
  }

  const frontTaper = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.038, 0.28, 18), chromeMat);
  frontTaper.position.y = -0.14;
  tonearmGroup.add(frontTaper);

  const armWand = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.030, 1.68, 20), chromeMat);
  armWand.position.y = -1.12;
  tonearmGroup.add(armWand);

  const midCollarSilver = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.12, 16), chromeMat);
  midCollarSilver.position.y = -1.05;
  tonearmGroup.add(midCollarSilver);

  const midCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.05, 16), matteBlackMat);
  midCollar.position.y = -1.05;
  tonearmGroup.add(midCollar);

  const headshellGroup = new THREE.Group();
  headshellGroup.position.set(0, -1.96, 0);
  headshellGroup.rotation.z = -THREE.MathUtils.degToRad(21);
  tonearmGroup.add(headshellGroup);

  const hsBody = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.36, 0.065), chromeMat);
  hsBody.position.set(0, -0.24, 0);
  headshellGroup.add(hsBody);

  const liftBar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.22, 10), chromeMat);
  liftBar.position.set(0.15, -0.30, 0.01);
  liftBar.rotation.z = THREE.MathUtils.degToRad(58);
  headshellGroup.add(liftBar);

  // START/STOP + 33/45 RPM buttons + LEDs + Stylus lamp
  const startHousing = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.04), matteBlackMat);
  startHousing.position.set(-1.82, -1.52, 0.02);
  group.add(startHousing);

  const startCap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.125, 0.055, 24), chromeMat);
  startCap.rotation.x = Math.PI / 2;
  startCap.position.set(-1.82, -1.52, 0.045);
  group.add(startCap);

  const powerRing = new THREE.Mesh(new THREE.RingGeometry(0.125, 0.145, 24), new THREE.MeshBasicMaterial({ color: 0x1db954 }));
  powerRing.position.set(-1.82, -1.52, 0.042);
  group.add(powerRing);

  const btn33 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.045), brushedSilverMat);
  btn33.position.set(-1.32, -1.58, 0.028);
  group.add(btn33);

  const led33 = new THREE.Mesh(new THREE.CircleGeometry(0.025, 12), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
  led33.position.set(-1.32, -1.46, 0.022);
  group.add(led33);

  const btn45 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.045), brushedSilverMat);
  btn45.position.set(-1.02, -1.58, 0.036);
  group.add(btn45);

  const led45 = new THREE.Mesh(new THREE.CircleGeometry(0.025, 12), new THREE.MeshBasicMaterial({ color: 0x3a2020 }));
  led45.position.set(-1.02, -1.46, 0.022);
  group.add(led45);

  const stylusTower = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.16, 20), chromeMat);
  stylusTower.rotation.x = Math.PI / 2;
  stylusTower.position.set(0.92, -1.36, 0.09);
  group.add(stylusTower);

  const lampLens = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.05), new THREE.MeshBasicMaterial({ color: 0xffcf70 }));
  lampLens.position.set(0.87, -1.32, 0.12);
  group.add(lampLens);

  const pitchSlot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.68, 0.02), matteBlackMat);
  pitchSlot.position.set(1.22, -0.98, 0.015);
  group.add(pitchSlot);

  const pitchFader = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.055), chromeMat);
  pitchFader.position.set(1.22, -0.98, 0.038);
  group.add(pitchFader);

  return { group, vinylRotator };
}

function buildAuthenticCassette() {
  const group = new THREE.Group();
  group.scale.set(0.84, 0.84, 0.84);
  group.rotation.set(0.12, -0.25, 0);

  const cW = 4.20, cH = 2.68, cD = 0.34;
  const winW = 1.96, winH = 0.74;

  const absShellMat = new THREE.MeshStandardMaterial({ color: 0x262930, roughness: 0.42, metalness: 0.10 });
  const absDarkMat = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.65, metalness: 0.05 });
  const metalScrewMat = new THREE.MeshStandardMaterial({ color: 0xb8c0cc, roughness: 0.22, metalness: 0.90 });

  const backShell = new THREE.Mesh(new THREE.BoxGeometry(cW, cH, 0.12), absShellMat);
  backShell.position.set(0, 0, -cD / 2 + 0.06);
  group.add(backShell);

  const topBeamH = (cH - winH) / 2;
  const frontDepth = cD - 0.12;
  const frontZ = -cD / 2 + 0.12 + frontDepth / 2;

  const topBeam = new THREE.Mesh(new THREE.BoxGeometry(cW, topBeamH, frontDepth), absShellMat);
  topBeam.position.set(0, winH / 2 + topBeamH / 2, frontZ);
  group.add(topBeam);

  const botBeam = new THREE.Mesh(new THREE.BoxGeometry(cW, topBeamH, frontDepth), absShellMat);
  botBeam.position.set(0, -winH / 2 - topBeamH / 2, frontZ);
  group.add(botBeam);

  const sidePillarW = (cW - winW) / 2;
  const leftPillar = new THREE.Mesh(new THREE.BoxGeometry(sidePillarW, winH, frontDepth), absShellMat);
  leftPillar.position.set(-winW / 2 - sidePillarW / 2, 0, frontZ);
  group.add(leftPillar);

  const rightPillar = new THREE.Mesh(new THREE.BoxGeometry(sidePillarW, winH, frontDepth), absShellMat);
  rightPillar.position.set(winW / 2 + sidePillarW / 2, 0, frontZ);
  group.add(rightPillar);

  const headBlock = new THREE.Mesh(new THREE.BoxGeometry(2.48, 0.48, cD + 0.03), absShellMat);
  headBlock.position.set(0, -cH / 2 + 0.24, 0);
  group.add(headBlock);

  [-0.92, -0.44, 0.44, 0.92].forEach((hx, idx) => {
    const holeR = (idx === 0 || idx === 3) ? 0.085 : 0.065;
    const holeCyl = new THREE.Mesh(new THREE.CylinderGeometry(holeR, holeR, cD + 0.05, 16), absDarkMat);
    holeCyl.rotation.x = Math.PI / 2;
    holeCyl.position.set(hx, -cH / 2 + 0.22, 0);
    group.add(holeCyl);
  });

  // 侧面防滑凹槽与顶部防抹片
  for (let g = 0; g < 5; g++) {
    const gy = -0.95 + g * 0.14;
    [-1, 1].forEach((s) => {
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, cD + 0.01), absDarkMat);
      grip.position.set(s * (cW / 2 - 0.08), gy, 0);
      group.add(grip);
    });
  }
  [-1.42, 1.42].forEach((tx) => {
    const notch = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, cD - 0.04), absDarkMat);
    notch.position.set(tx, cH / 2 - 0.03, 0);
    group.add(notch);
  });

  [
    [-cW / 2 + 0.20, cH / 2 - 0.20, cD / 2 + 0.003],
    [cW / 2 - 0.20, cH / 2 - 0.20, cD / 2 + 0.003],
    [-cW / 2 + 0.20, -cH / 2 + 0.20, cD / 2 + 0.003],
    [cW / 2 - 0.20, -cH / 2 + 0.20, cD / 2 + 0.003],
    [0, -cH / 2 + 0.36, (cD + 0.07) / 2 + 0.003]
  ].forEach(([sx, sy, sz]) => {
    const screwHead = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.015, 14), metalScrewMat);
    screwHead.rotation.x = Math.PI / 2;
    screwHead.position.set(sx, sy, sz);
    group.add(screwHead);
  });

  const cavityBack = new THREE.Mesh(new THREE.PlaneGeometry(winW + 0.2, winH + 0.2), absDarkMat);
  cavityBack.position.set(0, 0, -0.04);
  group.add(cavityBack);

  const spoolMat = new THREE.MeshStandardMaterial({ color: 0xf4f6fa, roughness: 0.28, metalness: 0.08 });
  const tapePancakeMat = new THREE.MeshStandardMaterial({ color: 0x2b170e, roughness: 0.32, metalness: 0.35 });

  const createSpool = (tapeRadius) => {
    const sg = new THREE.Group();
    const pancake = new THREE.Mesh(new THREE.CylinderGeometry(tapeRadius, tapeRadius, 0.12, 36), tapePancakeMat);
    pancake.rotation.x = Math.PI / 2;
    pancake.position.z = -0.01;
    sg.add(pancake);

    const outerHub = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.16, 28, 1, true), spoolMat);
    outerHub.rotation.x = Math.PI / 2;
    outerHub.position.z = 0.02;
    sg.add(outerHub);

    const hubFace = new THREE.Mesh(new THREE.RingGeometry(0.21, 0.31, 28), spoolMat);
    hubFace.position.z = 0.10;
    sg.add(hubFace);

    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.19, 0.15), spoolMat);
      tooth.position.set(Math.cos(angle) * 0.12, Math.sin(angle) * 0.12, 0.025);
      tooth.rotation.z = angle;
      sg.add(tooth);
    }
    return sg;
  };

  const spoolL = createSpool(0.58);
  spoolL.position.set(-0.66, 0.02, 0.02);
  group.add(spoolL);

  const spoolR = createSpool(0.46);
  spoolR.position.set(0.66, 0.02, 0.02);
  group.add(spoolR);

  const tapeBridge = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.03, 0.11), tapePancakeMat);
  tapeBridge.position.set(0, -0.26, 0);
  tapeBridge.rotation.z = 0.08;
  group.add(tapeBridge);

  [-1.52, 1.52].forEach((gx) => {
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.14, 16), metalScrewMat);
    pin.rotation.x = Math.PI / 2;
    pin.position.set(gx, -cH / 2 + 0.32, 0);
    group.add(pin);
  });

  const runningRibbon = new THREE.Mesh(new THREE.BoxGeometry(2.80, 0.045, 0.10), tapePancakeMat);
  runningRibbon.position.set(0, -cH / 2 + 0.16, 0);
  group.add(runningRibbon);

  const bronzePad = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.035, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xd48b45, roughness: 0.25, metalness: 0.85 })
  );
  bronzePad.position.set(0, -cH / 2 + 0.11, 0.005);
  group.add(bronzePad);

  const feltPad = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.035, 0.09),
    new THREE.MeshStandardMaterial({ color: 0xc2412d, roughness: 0.9 })
  );
  feltPad.position.set(0, -cH / 2 + 0.13, 0.01);
  group.add(feltPad);

  // Retro cassette label strip
  const lblCanvas = document.createElement("canvas");
  lblCanvas.width = 512;
  lblCanvas.height = 256;
  const lctx = lblCanvas.getContext("2d");
  lctx.fillStyle = "#f2eadb";
  lctx.fillRect(0, 0, 512, 256);
  lctx.fillStyle = "#d4a373";
  lctx.fillRect(0, 0, 512, 42);
  lctx.fillStyle = "#111114";
  lctx.fillRect(102, 76, 308, 114);
  lctx.fillStyle = "#0a0a0c";
  lctx.font = "bold 20px monospace";
  lctx.fillText("SPINORA · TYPE II CHROME 90", 24, 28);
  lctx.fillStyle = "#52525b";
  lctx.font = "14px monospace";
  lctx.fillText("HIGH BIAS 70μs EQ", 24, 234);
  const lblTex = new THREE.CanvasTexture(lblCanvas);

  const labelMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3.68, 1.88),
    new THREE.MeshStandardMaterial({ map: lblTex, roughness: 0.42 })
  );
  labelMesh.position.set(0, 0.08, cD / 2 + 0.004);
  group.add(labelMesh);

  // Scale window glass (100  50  0)
  const winCanvas = document.createElement("canvas");
  winCanvas.width = 512;
  winCanvas.height = 180;
  const wctx = winCanvas.getContext("2d");
  wctx.strokeStyle = "rgba(255,255,255,0.75)";
  wctx.fillStyle = "rgba(255,255,255,0.85)";
  wctx.font = "bold 18px monospace";
  wctx.textAlign = "center";
  for (let i = 0; i <= 10; i++) {
    const x = 166 + i * 18;
    const isMaj = i % 5 === 0;
    wctx.lineWidth = isMaj ? 2.5 : 1.5;
    wctx.beginPath();
    wctx.moveTo(x, 142);
    wctx.lineTo(x, isMaj ? 124 : 132);
    wctx.stroke();
    if (i === 0) wctx.fillText("100", x, 165);
    if (i === 5) wctx.fillText("50", x, 165);
    if (i === 10) wctx.fillText("0", x, 165);
  }
  const winGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(winW, winH),
    new THREE.MeshPhysicalMaterial({ map: new THREE.CanvasTexture(winCanvas), transparent: true, opacity: 0.9, roughness: 0.1, clearcoat: 1.0 })
  );
  winGlass.position.set(0, 0.02, cD / 2 + 0.006);
  group.add(winGlass);

  return { group, spoolL, spoolR };
}

function createMorningGloryHornGeometry() {
  const spine = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.0, 0.0, 0.0),
    new THREE.Vector3(0.0, 0.46, 0.0),
    new THREE.Vector3(0.04, 0.96, 0.04),
    new THREE.Vector3(0.32, 1.44, 0.22),
    new THREE.Vector3(0.68, 1.68, 0.48),
    new THREE.Vector3(1.04, 1.92, 0.80),
    new THREE.Vector3(1.36, 2.12, 1.12)
  ]);

  const uSteps = 84;
  const vSteps = 128;
  const numPetals = 8;
  const wallThickness = 0.062;
  const frames = spine.computeFrenetFrames(uSteps, false);
  const positions = [];
  const indices = [];

  const computeLobe = (v) => {
    const theta = v * Math.PI * 2;
    const p = 0.5 + 0.5 * Math.cos(numPetals * theta);
    const smoothArch = p * p * (3.0 - 2.0 * p);
    return { smoothArch, cosT: Math.cos(theta), sinT: Math.sin(theta) };
  };

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i <= uSteps; i++) {
      const u = i / uSteps;
      const pt = spine.getPointAt(u);
      const T = frames.tangents[i];
      const N = frames.normals[i];
      const B = frames.binormals[i];
      let baseRadius, petalFactor = 0;
      if (u <= 0.46) {
        baseRadius = 0.138 - 0.030 * Math.sin((u / 0.46) * Math.PI * 0.5);
      } else {
        const tBell = (u - 0.46) / 0.54;
        baseRadius = 0.108 + Math.pow(tBell, 2.12) * 1.38;
        petalFactor = Math.pow(tBell, 1.35);
      }
      for (let j = 0; j <= vSteps; j++) {
        const { smoothArch, cosT, sinT } = computeLobe(j / vSteps);
        const radialLobe = 1.0 + petalFactor * (0.22 * smoothArch - 0.05 * (1.0 - smoothArch));
        const lipRoll = (u > 0.92) ? Math.pow((u - 0.92) / 0.08, 2.0) * 0.065 : 0.0;
        const rOut = baseRadius * radialLobe + lipRoll;
        const r = pass === 0 ? rOut : Math.max(0.018, rOut - wallThickness);
        const axial = petalFactor * 0.28 * smoothArch;
        positions.push(
          pt.x + (N.x * cosT + B.x * sinT) * r + T.x * axial,
          pt.y + (N.y * cosT + B.y * sinT) * r + T.y * axial,
          pt.z + (N.z * cosT + B.z * sinT) * r + T.z * axial
        );
      }
    }
  }

  const ringVerts = vSteps + 1;
  const innerOffset = (uSteps + 1) * ringVerts;
  for (let i = 0; i < uSteps; i++) {
    for (let j = 0; j < vSteps; j++) {
      const a = i * ringVerts + j, b = (i + 1) * ringVerts + j, c = b + 1, d = a + 1;
      indices.push(a, b, d, b, c, d);
      const ia = innerOffset + a, ib = innerOffset + b, ic = innerOffset + c, id = innerOffset + d;
      indices.push(ia, id, ib, ib, id, ic);
    }
  }
  const outRimBase = uSteps * ringVerts;
  const inRimBase = innerOffset + uSteps * ringVerts;
  for (let j = 0; j < vSteps; j++) {
    indices.push(outRimBase + j, inRimBase + j, outRimBase + j + 1);
    indices.push(outRimBase + j + 1, inRimBase + j, inRimBase + j + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return { geo, spine };
}

function buildAuthenticGramophone(coverTex) {
  const group = new THREE.Group();
  group.position.set(0, -0.78, 0);
  group.scale.set(0.56, 0.56, 0.56);
  group.rotation.set(0.14, 0.28, 0);

  const creamMat = new THREE.MeshPhysicalMaterial({ color: 0xf2e9d6, roughness: 0.30, metalness: 0.04, clearcoat: 0.35 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xe5bc5a, roughness: 0.22, metalness: 0.86, emissive: 0x332205, emissiveIntensity: 0.18 });
  const pewterMat = new THREE.MeshStandardMaterial({ color: 0xa8a094, roughness: 0.24, metalness: 0.84 });
  const darkPewterMat = new THREE.MeshStandardMaterial({ color: 0x45413c, roughness: 0.32, metalness: 0.82 });
  const brassMat = new THREE.MeshPhysicalMaterial({
    color: 0xf5c366, roughness: 0.26, metalness: 0.82, clearcoat: 0.35,
    emissive: 0x3d2806, emissiveIntensity: 0.12, side: THREE.DoubleSide
  });
  const blackDeckMat = new THREE.MeshPhysicalMaterial({ color: 0x151619, roughness: 0.32, metalness: 0.18, clearcoat: 0.45 });

  const boxW = 3.28, boxH = 1.12, boxD = 2.82;
  group.add(new THREE.Mesh(new THREE.BoxGeometry(boxW, boxH, boxD), creamMat));

  // 正面复古音箱网布格栅 + 铜调谐表盘与旋钮
  const frontCloth = new THREE.Mesh(
    new THREE.PlaneGeometry(1.74, 0.78),
    new THREE.MeshStandardMaterial({ color: 0x2a231c, roughness: 0.88 })
  );
  frontCloth.position.set(-0.62, 0.0, boxD / 2 + 0.008);
  group.add(frontCloth);

  [-1.24, -0.83, -0.41, 0.0].forEach((px) => {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.78, 0.03), creamMat);
    pillar.position.set(px, 0, boxD / 2 + 0.018);
    group.add(pillar);
  });

  const dialBezel = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.024, 12, 32), goldMat);
  dialBezel.position.set(0.86, 0.14, boxD / 2 + 0.02);
  group.add(dialBezel);

  const dialFace = new THREE.Mesh(
    new THREE.CircleGeometry(0.22, 32),
    new THREE.MeshStandardMaterial({ color: 0xf5ebd6, roughness: 0.4 })
  );
  dialFace.position.set(0.86, 0.14, boxD / 2 + 0.016);
  group.add(dialFace);

  const mainKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.10, 0.06, 20), pewterMat);
  mainKnob.rotation.x = Math.PI / 2;
  mainKnob.position.set(0.86, -0.24, boxD / 2 + 0.03);
  group.add(mainKnob);

  // 右侧手摇曲柄
  const crankGroup = new THREE.Group();
  crankGroup.position.set(boxW / 2 + 0.02, 0, 0.25);
  group.add(crankGroup);
  const crankShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.45, 14), goldMat);
  crankShaft.rotation.z = Math.PI / 2;
  crankShaft.position.x = 0.22;
  crankGroup.add(crankShaft);
  const crankArm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.48, 0.06), goldMat);
  crankArm.position.set(0.45, -0.22, 0);
  crankGroup.add(crankArm);
  const crankGrip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.28, 16), new THREE.MeshStandardMaterial({ color: 0x5c361c, roughness: 0.5 }));
  crankGrip.rotation.z = Math.PI / 2;
  crankGrip.position.set(0.58, -0.44, 0);
  crankGroup.add(crankGrip);

  const topM1 = new THREE.Mesh(new THREE.BoxGeometry(boxW + 0.22, 0.09, boxD + 0.22), creamMat);
  topM1.position.y = boxH / 2 + 0.045;
  group.add(topM1);

  const topGold = new THREE.Mesh(new THREE.BoxGeometry(boxW + 0.25, 0.026, boxD + 0.25), goldMat);
  topGold.position.y = boxH / 2 + 0.045;
  group.add(topGold);

  const botM1 = new THREE.Mesh(new THREE.BoxGeometry(boxW + 0.24, 0.10, boxD + 0.24), creamMat);
  botM1.position.y = -boxH / 2 - 0.05;
  group.add(botM1);

  const botM2 = new THREE.Mesh(new THREE.BoxGeometry(boxW + 0.40, 0.12, boxD + 0.40), creamMat);
  botM2.position.y = -boxH / 2 - 0.16;
  group.add(botM2);

  const colX = boxW / 2 - 0.06, colZ = boxD / 2 - 0.06;
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, boxH, 16), pewterMat);
    col.position.set(sx * colX, 0, sz * colZ);
    group.add(col);
  });

  const deckY = boxH / 2 + 0.16;
  const blackDeck = new THREE.Mesh(new THREE.BoxGeometry(2.96, 0.05, 2.50), blackDeckMat);
  blackDeck.position.set(0, deckY, 0.02);
  group.add(blackDeck);

  const discRotator = new THREE.Group();
  discRotator.position.set(-0.06, deckY + 0.085, 0.22);
  group.add(discRotator);

  const recordMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.98, 0.98, 0.026, 48),
    new THREE.MeshPhysicalMaterial({ color: 0x101012, roughness: 0.20, metalness: 0.35, clearcoat: 0.85 })
  );
  discRotator.add(recordMesh);

  const gLabel = new THREE.Mesh(
    new THREE.CircleGeometry(0.36, 36),
    new THREE.MeshStandardMaterial({ map: coverTex, roughness: 0.28, metalness: 0.12 })
  );
  gLabel.rotation.x = -Math.PI / 2;
  gLabel.position.y = 0.016;
  discRotator.add(gLabel);

  const centerPin = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.042, 16), goldMat);
  centerPin.position.y = 0.026;
  discRotator.add(centerPin);

  // S-curve pewter tonearm
  const armGroup = new THREE.Group();
  armGroup.position.set(1.16, deckY + 0.02, -0.28);
  group.add(armGroup);

  const armPed = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.21, 0.14, 20), pewterMat);
  armPed.position.y = 0.07;
  armGroup.add(armPed);

  const tonearmCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.0, 0.20, 0.0),
    new THREE.Vector3(-0.08, 0.23, 0.32),
    new THREE.Vector3(-0.24, 0.21, 0.62),
    new THREE.Vector3(-0.46, 0.17, 0.78)
  ]);
  armGroup.add(new THREE.Mesh(new THREE.TubeGeometry(tonearmCurve, 24, 0.036, 12, false), pewterMat));

  const reproducer = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 0.055, 20), pewterMat);
  reproducer.position.set(-0.52, 0.15, 0.82);
  armGroup.add(reproducer);

  // Morning Glory 8-petal brass horn
  const hornGroup = new THREE.Group();
  hornGroup.position.set(-1.18, deckY + 0.02, -0.94);
  group.add(hornGroup);

  const cornerPlate = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.46), goldMat);
  cornerPlate.position.y = 0.025;
  hornGroup.add(cornerPlate);

  const { geo: hornGeo, spine: hornSpine } = createMorningGloryHornGeometry();
  hornGroup.add(new THREE.Mesh(hornGeo, brassMat));

  const hornLight = new THREE.PointLight(0xffd57a, 2.4, 4.5);
  hornLight.position.copy(hornSpine.getPointAt(0.70));
  hornGroup.add(hornLight);

  for (let r = 0.40; r <= 0.93; r += 0.065) {
    const grv = new THREE.Mesh(
      new THREE.RingGeometry(r, r + 0.006, 48),
      new THREE.MeshStandardMaterial({ color: 0x282220, roughness: 0.14, metalness: 0.65, side: THREE.DoubleSide })
    );
    grv.rotation.x = -Math.PI / 2;
    grv.position.y = 0.015;
    discRotator.add(grv);
  }

  return { group, discRotator, crankGroup };
}

function initFormatIndex() {
  const items = document.querySelectorAll(".format-index-item");
  const canvasWrap = document.getElementById("format-three-canvas");
  const lyricsStage = document.getElementById("format-lyrics-stage");
  const metaEl = document.getElementById("fmt-copy-meta");
  const titleEl = document.getElementById("fmt-copy-title");
  const descEl = document.getElementById("fmt-copy-desc");

  if (!canvasWrap || typeof THREE === "undefined") return;

  const w = canvasWrap.clientWidth || 500;
  const h = canvasWrap.clientHeight || 280;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, w / h, 0.1, 50);
  camera.position.set(0, 0.25, 6.8);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  canvasWrap.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 1.05));
  const key = new THREE.DirectionalLight(0xfde6c4, 2.1);
  key.position.set(4, 5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xcbd5e1, 1.5);
  rim.position.set(-4, -2, 3);
  scene.add(rim);

  const rainbowTex = createRadialRainbowTexture();
  const coverTex = createDefaultSpinoraCoverTexture();

  // 1. CD 模型
  const cdModel = createSpinoraCDAssembly(rainbowTex, coverTex);
  cdModel.caseLidHinge.rotation.y = -1.85;
  cdModel.stageGroup.scale.set(0.75, 0.75, 0.75);
  scene.add(cdModel.stageGroup);

  // 2. 留声机模型 (100% 还原桌面版八瓣铜号角留声机)
  const gramModel = buildAuthenticGramophone(coverTex);
  gramModel.group.visible = false;
  scene.add(gramModel.group);

  // 3. Hi-Fi 黑胶唱盘 (100% 还原桌面版香槟钛灰底座与共线唱臂)
  const vinylModel = buildAuthenticTurntable(coverTex);
  vinylModel.group.visible = false;
  scene.add(vinylModel.group);

  // 4. 80 年代磁带 (100% 还原桌面版镂空视窗与双六爪齿轮)
  const cassModel = buildAuthenticCassette();
  cassModel.group.visible = false;
  scene.add(cassModel.group);

  let activeMode = "cd";
  let drag = false, px = 0, py = 0;
  const getActiveGroup = () =>
    activeMode === "cd" ? cdModel.stageGroup
      : activeMode === "gramophone" ? gramModel.group
      : activeMode === "vinyl" ? vinylModel.group
      : cassModel.group;

  canvasWrap.addEventListener("mousedown", (e) => { drag = true; px = e.clientX; py = e.clientY; });
  window.addEventListener("mousemove", (e) => {
    if (!drag) return;
    const grp = getActiveGroup();
    grp.rotation.y += (e.clientX - px) * 0.01;
    grp.rotation.x += (e.clientY - py) * 0.01;
    px = e.clientX; py = e.clientY;
  });
  window.addEventListener("mouseup", () => { drag = false; });

  items.forEach(item => {
    item.addEventListener("click", () => {
      const mode = item.getAttribute("data-target");
      activeMode = mode;
      items.forEach(i => i.classList.remove("active"));
      item.classList.add("active");

      const info = FORMAT_META[mode];
      if (info) {
        metaEl.textContent = info.meta;
        titleEl.textContent = info.title;
        descEl.textContent = info.desc;
      }

      if (mode === "lyrics") {
        canvasWrap.classList.add("hidden");
        lyricsStage.classList.remove("hidden");
      } else {
        lyricsStage.classList.add("hidden");
        canvasWrap.classList.remove("hidden");
        cdModel.stageGroup.visible = mode === "cd";
        gramModel.group.visible = mode === "gramophone";
        vinylModel.group.visible = mode === "vinyl";
        cassModel.group.visible = mode === "cassette";
      }
    });
  });

  // 05 / 极光光学景深歌词交互 (点击任一句或自动推进)
  const lyricLines = lyricsStage ? lyricsStage.querySelectorAll(".lyric-sample") : [];
  let activeLyricIdx = 2;
  function setActiveLyric(idx) {
    activeLyricIdx = idx;
    lyricLines.forEach((el, i) => {
      const dist = Math.abs(i - idx);
      el.classList.remove("focus", "near", "far");
      if (dist === 0) el.classList.add("focus");
      else if (dist === 1) el.classList.add("near");
      else el.classList.add("far");
    });
  }
  lyricLines.forEach((el, i) => {
    el.addEventListener("click", () => setActiveLyric(i));
  });
  setInterval(() => {
    if (activeMode === "lyrics" && lyricLines.length) {
      setActiveLyric((activeLyricIdx + 1) % lyricLines.length);
    }
  }, 3200);

  function renderLoop() {
    requestAnimationFrame(renderLoop);
    if (activeMode === "lyrics") return;
    if (activeMode === "cd") {
      cdModel.discRotator.rotation.z -= 0.015;
      if (!drag) cdModel.stageGroup.rotation.y += 0.004;
    } else if (activeMode === "gramophone") {
      gramModel.discRotator.rotation.y -= 0.025;
      if (gramModel.crankGroup) gramModel.crankGroup.rotation.x += 0.015;
      if (!drag) gramModel.group.rotation.y += 0.003;
    } else if (activeMode === "vinyl") {
      vinylModel.vinylRotator.rotation.z -= 0.018;
      if (!drag) vinylModel.group.rotation.y = 0.25 + Math.sin(performance.now() * 0.0008) * 0.14;
    } else if (activeMode === "cassette") {
      cassModel.spoolL.rotation.z -= 0.035;
      cassModel.spoolR.rotation.z -= 0.035;
      if (!drag) cassModel.group.rotation.y = -0.25 + Math.sin(performance.now() * 0.001) * 0.22;
    }
    renderer.render(scene, camera);
  }
  renderLoop();
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

    if (typeof updateHeroDiscCover === "function") {
      updateHeroDiscCover(track.cover);
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
// 4a. 封面跨域加载：优先走 /api/cover 同源代理，失败再直连
// ========================================================
function loadCoverTexture(url) {
  return new Promise((resolve) => {
    if (!url || url.includes("logo.svg") || typeof THREE === "undefined") return resolve(null);
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    let done = false;
    const finish = (tex) => {
      if (done) return;
      done = true;
      if (tex) tex.anisotropy = 8;
      resolve(tex || null);
    };
    setTimeout(() => finish(null), 8000);
    loader.load(`/api/cover?url=${encodeURIComponent(url)}`, finish, undefined, () => {
      loader.load(url.replace(/^http:/, "https:"), finish, undefined, () => finish(null));
    });
  });
}

function createPersonalizedGiftCover(gift) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");

  const grad = ctx.createRadialGradient(256, 180, 20, 256, 256, 360);
  grad.addColorStop(0, "#2b2117");
  grad.addColorStop(0.55, "#15151a");
  grad.addColorStop(1, "#09090c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  ctx.strokeStyle = "rgba(212, 163, 115, 0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, 464, 464);

  ctx.strokeStyle = "rgba(212, 163, 115, 0.16)";
  ctx.lineWidth = 1;
  for (let r = 84; r <= 190; r += 18) {
    ctx.beginPath();
    ctx.arc(256, 256, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = "#d4a373";
  ctx.font = '500 16px "JetBrains Mono", monospace';
  ctx.textAlign = "center";
  ctx.fillText(`SPINORA ARCHIVE · NO.${String(gift?.id || 1).padStart(3, "0")}`, 256, 72);

  const title = (gift?.song_title || "Untitled Track").slice(0, 22);
  ctx.fillStyle = "#f4f4f0";
  ctx.font = '600 34px "Noto Sans SC", sans-serif';
  ctx.fillText(title, 256, 248);

  const artist = (gift?.artist || "Unknown Artist").slice(0, 28);
  ctx.fillStyle = "#e6be94";
  ctx.font = '400 20px "Noto Sans SC", sans-serif';
  ctx.fillText(artist, 256, 290);

  ctx.fillStyle = "rgba(244, 244, 240, 0.55)";
  ctx.font = '400 15px "Noto Sans SC", sans-serif';
  ctx.fillText(`FROM ${gift?.nickname || "神秘知音"}`, 256, 446);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  return tex;
}

// ========================================================
// 4b. 立体实体礼物盒舞台：礼盒 → 缎带 → 盒盖 → CD 唱片盒 → CD → 聆听
// ========================================================
const giftEase = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  bounce: (x) => {
    const n1 = 7.5625, d1 = 2.75;
    if (x < 1 / d1) return n1 * x * x;
    if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
    if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
    return n1 * (x -= 2.625 / d1) * x + 0.984375;
  }
};
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function createGiftPaperTexture(base, noiseAmp, withFoil) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);

  const img = ctx.getImageData(0, 0, 512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * noiseAmp;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);

  // 纸张纤维
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  for (let i = 0; i < 260; i++) {
    const y = Math.random() * 512;
    ctx.lineWidth = Math.random() * 0.9;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y + (Math.random() - 0.5) * 8);
    ctx.stroke();
  }

  if (withFoil) {
    // 烫金火漆徽记（避开中央十字缎带，放在象限内）
    ctx.save();
    ctx.translate(128, 384);
    ctx.strokeStyle = "rgba(230,190,148,0.9)";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, 58, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(0, 0, 49, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(230,190,148,0.95)";
    ctx.font = 'italic 68px "Instrument Serif", Georgia, serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("S", 0, 5);
    ctx.restore();

    ctx.fillStyle = "rgba(230,190,148,0.78)";
    ctx.font = '500 15px "JetBrains Mono", monospace';
    ctx.textAlign = "left";
    ctx.fillText("SPINORA", 316, 420);
    ctx.fillText("GIFT ARCHIVE", 316, 442);
    ctx.fillStyle = "rgba(230,190,148,0.45)";
    ctx.fillText("HANDLE WITH LOVE", 316, 470);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  return tex;
}

function createGiftBoxStage(container, cb) {
  const W0 = container.clientWidth || 520;
  const H0 = container.clientHeight || 500;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, W0 / H0, 0.1, 80);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W0, H0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  // ---------- 灯光：暖调棚拍主光 + 冷边光 + 黄铜补光 ----------
  scene.add(new THREE.AmbientLight(0xffffff, 0.72));
  const keyLight = new THREE.DirectionalLight(0xffe2bd, 2.0);
  keyLight.position.set(4, 8, 6);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0xbfd2ff, 1.15);
  rimLight.position.set(-6, 3, -4);
  scene.add(rimLight);
  const brassFill = new THREE.PointLight(0xd4a373, 1.3, 16);
  brassFill.position.set(0, 4.5, 4);
  scene.add(brassFill);

  // ---------- 礼盒本体 ----------
  const giftGroup = new THREE.Group();
  scene.add(giftGroup);

  const BW = 4.6, BH = 2.2, BD = 4.6, T = 0.08, RW = 0.6;

  const paperMat = new THREE.MeshStandardMaterial({
    map: createGiftPaperTexture("#1b1b1f", 16, false),
    roughness: 0.8,
    metalness: 0.05
  });
  const liningMat = new THREE.MeshStandardMaterial({
    map: createGiftPaperTexture("#e6d9c2", 10, false),
    roughness: 0.92,
    metalness: 0.0,
    side: THREE.DoubleSide
  });
  const ribbonMat = new THREE.MeshPhysicalMaterial({
    color: 0xc99a62,
    roughness: 0.3,
    metalness: 0.6,
    clearcoat: 0.7,
    clearcoatRoughness: 0.2,
    side: THREE.DoubleSide
  });

  // 地面接触阴影
  const shCanvas = document.createElement("canvas");
  shCanvas.width = shCanvas.height = 256;
  const shCtx = shCanvas.getContext("2d");
  const shGrad = shCtx.createRadialGradient(128, 128, 20, 128, 128, 128);
  shGrad.addColorStop(0, "rgba(0,0,0,0.75)");
  shGrad.addColorStop(0.55, "rgba(0,0,0,0.35)");
  shGrad.addColorStop(1, "rgba(0,0,0,0)");
  shCtx.fillStyle = shGrad;
  shCtx.fillRect(0, 0, 256, 256);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(8.4, 8.4),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shCanvas), transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.004;
  shadow.userData.noPick = true;
  giftGroup.add(shadow);

  const addBox = (parent, w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };

  // 盒底 + 四壁
  addBox(giftGroup, BW, T, BD, paperMat, 0, T / 2, 0);
  addBox(giftGroup, BW, BH, T, paperMat, 0, BH / 2, BD / 2 - T / 2);
  addBox(giftGroup, BW, BH, T, paperMat, 0, BH / 2, -BD / 2 + T / 2);
  addBox(giftGroup, T, BH, BD - 2 * T, paperMat, -BW / 2 + T / 2, BH / 2, 0);
  addBox(giftGroup, T, BH, BD - 2 * T, paperMat, BW / 2 - T / 2, BH / 2, 0);

  // 象牙白内衬纸
  const IW = BW - 2 * T - 0.006;
  const wallH = BH - T - 0.01;
  const liningSpecs = [
    [0, T + wallH / 2, BD / 2 - T - 0.003, Math.PI],
    [0, T + wallH / 2, -BD / 2 + T + 0.003, 0],
    [-BW / 2 + T + 0.003, T + wallH / 2, 0, Math.PI / 2],
    [BW / 2 - T - 0.003, T + wallH / 2, 0, -Math.PI / 2]
  ];
  liningSpecs.forEach(([x, y, z, ry]) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(IW, wallH), liningMat);
    p.position.set(x, y, z);
    p.rotation.y = ry;
    giftGroup.add(p);
  });

  // 揉皱的拉菲草纸床（让唱片盒在盒中可见）
  const bedGeo = new THREE.PlaneGeometry(IW, IW, 36, 36);
  const bedPos = bedGeo.attributes.position;
  for (let i = 0; i < bedPos.count; i++) {
    const x = bedPos.getX(i), y = bedPos.getY(i);
    const crinkle = Math.sin(x * 4.1 + y * 2.3) * 0.035 + Math.cos(x * 7.3 - y * 5.1) * 0.025 + Math.random() * 0.045;
    bedPos.setZ(i, crinkle);
  }
  bedGeo.computeVertexNormals();
  const bedMat = new THREE.MeshStandardMaterial({ color: 0xe9ddc7, roughness: 0.95, flatShading: true, side: THREE.DoubleSide });
  const bed = new THREE.Mesh(bedGeo, bedMat);
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = 1.08;
  giftGroup.add(bed);

  const shredMats = [
    new THREE.MeshStandardMaterial({ color: 0xefe4cf, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0xd9c7a6, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0xc99a62, roughness: 0.45, metalness: 0.55 })
  ];
  const shredGeo = new THREE.BoxGeometry(0.035, 0.008, 0.42);
  for (let i = 0; i < 90; i++) {
    const s = new THREE.Mesh(shredGeo, shredMats[i % 7 === 0 ? 2 : i % 2]);
    const a = Math.random() * Math.PI * 2;
    const r = 0.6 + Math.random() * 1.45;
    s.position.set(Math.cos(a) * r, 1.12 + Math.random() * 0.1, Math.sin(a) * r);
    s.rotation.set((Math.random() - 0.5) * 0.6, Math.random() * Math.PI, (Math.random() - 0.5) * 0.6);
    giftGroup.add(s);
  }

  // 盒身竖向缎带（以底边为原点，便于“松开下落”）
  const baseRibbons = [];
  const baseRibbonGeo = new THREE.PlaneGeometry(RW, BH);
  baseRibbonGeo.translate(0, BH / 2, 0);
  [
    [0, 0, BD / 2 + 0.005, 0],
    [0, 0, -BD / 2 - 0.005, Math.PI],
    [-BW / 2 - 0.005, 0, 0, -Math.PI / 2],
    [BW / 2 + 0.005, 0, 0, Math.PI / 2]
  ].forEach(([x, y, z, ry]) => {
    const r = new THREE.Mesh(baseRibbonGeo, ribbonMat);
    r.position.set(x, y, z);
    r.rotation.y = ry;
    giftGroup.add(r);
    baseRibbons.push(r);
  });

  // ---------- 盒盖 ----------
  const LW = BW + 0.14, LH = 0.6;
  const lidBaseY = BH - LH + 0.1;
  const lidGroup = new THREE.Group();
  lidGroup.position.y = lidBaseY;
  giftGroup.add(lidGroup);

  const lidPaperMat = paperMat.clone();
  lidPaperMat.transparent = true;
  const lidTopMat = new THREE.MeshStandardMaterial({
    map: createGiftPaperTexture("#1b1b1f", 16, true),
    roughness: 0.78,
    metalness: 0.08,
    transparent: true
  });
  const lidRibbonMat = ribbonMat.clone();
  lidRibbonMat.transparent = true;
  const lidFadeMats = [lidPaperMat, lidTopMat, lidRibbonMat];

  const lidTop = new THREE.Mesh(
    new THREE.BoxGeometry(LW, T, LW),
    [lidPaperMat, lidPaperMat, lidTopMat, lidPaperMat, lidPaperMat, lidPaperMat]
  );
  lidTop.position.y = LH - T / 2;
  lidGroup.add(lidTop);
  addBox(lidGroup, LW, LH, T, lidPaperMat, 0, LH / 2, LW / 2 - T / 2);
  addBox(lidGroup, LW, LH, T, lidPaperMat, 0, LH / 2, -LW / 2 + T / 2);
  addBox(lidGroup, T, LH, LW - 2 * T, lidPaperMat, -LW / 2 + T / 2, LH / 2, 0);
  addBox(lidGroup, T, LH, LW - 2 * T, lidPaperMat, LW / 2 - T / 2, LH / 2, 0);

  // 盒盖十字缎带
  const ribA = new THREE.Mesh(new THREE.PlaneGeometry(RW, LW + 0.01), lidRibbonMat);
  ribA.rotation.x = -Math.PI / 2;
  ribA.position.y = LH + 0.004;
  lidGroup.add(ribA);
  const ribB = new THREE.Mesh(new THREE.PlaneGeometry(LW + 0.01, RW), lidRibbonMat);
  ribB.rotation.x = -Math.PI / 2;
  ribB.position.y = LH + 0.005;
  lidGroup.add(ribB);
  [
    [0, LW / 2 + 0.005, 0],
    [0, -LW / 2 - 0.005, Math.PI],
    [-LW / 2 - 0.005, 0, -Math.PI / 2],
    [LW / 2 + 0.005, 0, Math.PI / 2]
  ].forEach(([x, z, ry], idx) => {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(RW, LH), lidRibbonMat);
    r.position.set(idx < 2 ? 0 : x, LH / 2, idx < 2 ? z : 0);
    r.rotation.y = ry;
    lidGroup.add(r);
  });

  // 缎带蝴蝶结
  const bow = new THREE.Group();
  bow.position.y = LH + 0.01;
  lidGroup.add(bow);
  const loopGeo = new THREE.TorusGeometry(0.46, 0.09, 14, 48);
  [-1, 1].forEach((s) => {
    const loop = new THREE.Mesh(loopGeo, lidRibbonMat);
    loop.scale.set(1, 0.68, 0.32);
    loop.position.set(s * 0.44, 0.31, 0);
    loop.rotation.set(0, s * 0.32, s * -0.32);
    bow.add(loop);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.014, 1.15), lidRibbonMat);
    tail.position.set(s * 0.34, 0.012, 0.5);
    tail.rotation.y = s * 0.5;
    bow.add(tail);
  });
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 16), lidRibbonMat);
  knot.scale.set(1.15, 0.9, 0.8);
  knot.position.y = 0.13;
  bow.add(knot);

  // 礼物吊牌 (FOR YOU)
  const tagCanvas = document.createElement("canvas");
  tagCanvas.width = 256; tagCanvas.height = 128;
  const tctx = tagCanvas.getContext("2d");
  tctx.fillStyle = "#efe3cb";
  tctx.fillRect(0, 0, 256, 128);
  tctx.strokeStyle = "#b88750";
  tctx.lineWidth = 4;
  tctx.strokeRect(8, 8, 240, 112);
  tctx.fillStyle = "#2b1d0e";
  tctx.font = 'italic 34px "Instrument Serif", Georgia, serif';
  tctx.textAlign = "center";
  tctx.fillText("For You", 128, 66);
  tctx.font = '500 14px "JetBrains Mono", monospace';
  tctx.fillStyle = "#7a522c";
  tctx.fillText("SPINORA GIFT", 128, 98);
  const tagMat = new THREE.MeshStandardMaterial({
    map: new THREE.CanvasTexture(tagCanvas),
    roughness: 0.7,
    transparent: true,
    side: THREE.DoubleSide
  });
  const giftTag = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.38), tagMat);
  giftTag.position.set(0.65, 0.06, 0.72);
  giftTag.rotation.set(-Math.PI / 2 + 0.08, 0, -0.28);
  bow.add(giftTag);

  // 开盒金色星尘粒子
  const dustCount = 42;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustSeeds = [];
  for (let i = 0; i < dustCount; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 1.4;
    dustPositions[i * 3] = Math.cos(a) * r;
    dustPositions[i * 3 + 1] = 1.15 + Math.random() * 0.4;
    dustPositions[i * 3 + 2] = Math.sin(a) * r;
    dustSeeds.push({ vx: Math.cos(a) * (0.2 + Math.random() * 0.4), vy: 0.9 + Math.random() * 1.1, vz: Math.sin(a) * (0.2 + Math.random() * 0.4) });
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0xf0cca3,
    size: 0.09,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const stardust = new THREE.Points(dustGeo, dustMat);
  stardust.userData.noPick = true;
  scene.add(stardust);

  // ---------- 盒中的 Spinora 实体 CD 唱片盒（与软件同源建模） ----------
  const rainbowTex = createRadialRainbowTexture();
  const defaultCover = createDefaultSpinoraCoverTexture();
  const cd = createSpinoraCDAssembly(rainbowTex, defaultCover);
  const cdHolder = new THREE.Group();
  cdHolder.add(cd.stageGroup);

  const CD_IN_POS = new THREE.Vector3(0, 1.28, 0.05);
  const CD_IN_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0.14));
  const CD_RISE_POS = new THREE.Vector3(-0.25, 3.0, 1.3);

  const CAM_CLOSED = { pos: new THREE.Vector3(0, 5.4, 9.6), look: new THREE.Vector3(0, 1.3, 0) };
  const CAM_REVEAL = { pos: new THREE.Vector3(0.3, 4.4, 9.4), look: new THREE.Vector3(0.35, 2.85, 1.0) };

  const faceDummy = new THREE.Object3D();
  faceDummy.position.copy(CD_RISE_POS);
  faceDummy.lookAt(CAM_REVEAL.pos);
  const CD_FACE_QUAT = faceDummy.quaternion.clone();

  function placeCDInBox() {
    giftGroup.add(cdHolder);
    cdHolder.position.copy(CD_IN_POS);
    cdHolder.quaternion.copy(CD_IN_QUAT);
    cd.caseLidHinge.rotation.y = 0;
    cd.discPositioner.position.copy(cd.discInsidePos);
    cd.discPositioner.rotation.set(0, 0, 0);
    cd.stageGroup.rotation.set(0, 0, 0);
  }
  placeCDInBox();

  // ---------- 状态机 ----------
  let state = "closed";
  let t = 0;
  let giftReady = false;
  let isEmpty = false;
  let pendingAutoOpen = false;
  let pendingListen = false;
  let caseC = 0, caseTarget = 1;
  let hoverLift = 0, hoverTarget = 0;
  let spin = 0;
  let isAudioPlaying = false;
  let dragYaw = 0, dragPitch = 0;
  let flipX = 0, flipY = 0;
  let lastDiscTap = 0;
  let lastUserSpin = 0;
  const riseFromPos = new THREE.Vector3();
  const riseFromQuat = new THREE.Quaternion();
  let giftRotFrom = 0;

  const cam = { pos: CAM_CLOSED.pos.clone(), look: CAM_CLOSED.look.clone() };
  let camTween = null;
  function tweenCamera(toPos, toLook, dur) {
    camTween = { fromPos: cam.pos.clone(), fromLook: cam.look.clone(), toPos: toPos.clone(), toLook: toLook.clone(), t: 0, dur };
  }

  function setState(s) {
    state = s;
    t = 0;
    if (s === "rise") {
      scene.attach(cdHolder);
      riseFromPos.copy(cdHolder.position);
      riseFromQuat.copy(cdHolder.quaternion);
      giftRotFrom = Math.atan2(Math.sin(giftGroup.rotation.y), Math.cos(giftGroup.rotation.y));
      tweenCamera(CAM_REVEAL.pos, CAM_REVEAL.look, 1.5);
    }
    if (cb.onStateChange) cb.onStateChange(s);
  }

  function setLidOpacity(o) {
    lidFadeMats.forEach((m) => { m.opacity = o; });
  }

  function applyCase(c) {
    cd.caseLidHinge.rotation.y = -2.05 * giftEase.inOut(clamp01(c / 0.65));
    cd.discPositioner.position.lerpVectors(cd.discInsidePos, cd.discEjectedPos, giftEase.inOut(clamp01((c - 0.35) / 0.65)));
  }

  function zoomIn() {
    const discWorld = new THREE.Vector3();
    cd.discRotator.getWorldPosition(discWorld);
    const q = new THREE.Quaternion();
    cd.discRotator.getWorldQuaternion(q);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const camPos = discWorld.clone().add(normal.multiplyScalar(5.4));
    camPos.y += 0.25;
    tweenCamera(camPos, discWorld, 0.9);
    setState("zoomIn");
  }

  function zoomOut() {
    flipX = 0;
    flipY = 0;
    tweenCamera(CAM_REVEAL.pos, CAM_REVEAL.look, 0.85);
    setState("zoomOut");
  }

  function openListen() {
    pendingListen = false;
    setState("sheet");
    if (cb.onOpenListen) cb.onOpenListen();
  }

  function update(dt, now) {
    t += dt;
    const sec = now / 1000;

    switch (state) {
      case "closed": {
        if (now - lastUserSpin > 1800) giftGroup.rotation.y += dt * 0.16;
        giftGroup.position.y = Math.sin(sec * 1.4) * 0.035;
        hoverLift += (hoverTarget - hoverLift) * Math.min(1, dt * 8);
        lidGroup.position.y = lidBaseY + hoverLift * 0.16;
        bow.rotation.y = Math.sin(sec * 1.8) * 0.04;
        break;
      }
      case "drop": {
        const p = clamp01(t / 0.75);
        giftGroup.position.y = 3.2 * (1 - giftEase.bounce(p));
        if (p >= 1) {
          setState("closed");
          if (pendingAutoOpen) {
            pendingAutoOpen = false;
            setState("untie");
          }
        }
        break;
      }
      case "untie": {
        const p = clamp01(t / 0.8);
        const s = p < 0.3 ? 1 + 0.25 * giftEase.out(p / 0.3) : 1.25 * (1 - giftEase.inOut(clamp01((p - 0.3) / 0.7)));
        bow.scale.setScalar(Math.max(0.001, s));
        bow.rotation.y += dt * 6 * p;
        const fall = 1 - giftEase.inOut(clamp01((t - 0.25) / 0.55));
        baseRibbons.forEach((r) => { r.scale.y = Math.max(0.001, fall); });
        lidGroup.position.y = lidBaseY + hoverLift * 0.16;
        if (p >= 1) setState("lidOff");
        break;
      }
      case "lidOff": {
        const p = clamp01(t / 1.05);
        const e = giftEase.inOut(p);
        lidGroup.position.set(2.6 * e, lidBaseY + 3.6 * e, -1.9 * e);
        lidGroup.rotation.set(-0.5 * e, 0.45 * e, -0.65 * e);
        setLidOpacity(1 - clamp01((p - 0.45) / 0.55));
        if (p >= 1) {
          lidGroup.visible = false;
          if (giftReady) setState(isEmpty ? "empty" : "rise");
          else setState("waitData");
        }
        break;
      }
      case "waitData": {
        cdHolder.position.y = CD_IN_POS.y + Math.sin(sec * 3) * 0.03;
        if (giftReady) setState(isEmpty ? "empty" : "rise");
        break;
      }
      case "rise": {
        const p = clamp01(t / 1.4);
        const e = giftEase.inOut(p);
        cdHolder.position.lerpVectors(riseFromPos, CD_RISE_POS, e);
        cdHolder.position.y += Math.sin(p * Math.PI) * 0.45;
        cdHolder.quaternion.copy(riseFromQuat).slerp(CD_FACE_QUAT, giftEase.inOut(clamp01((t - 0.2) / 1.1)));
        giftGroup.position.y = -1.6 * e;
        giftGroup.position.z = -0.6 * e;
        giftGroup.rotation.y = giftRotFrom * (1 - e);
        if (p >= 1) setState("openCase");
        break;
      }
      case "openCase": {
        caseC = clamp01(t / 1.4);
        applyCase(caseC);
        if (caseC >= 1) {
          caseTarget = 1;
          setState("revealed");
        }
        break;
      }
      case "revealed": {
        caseC += (caseTarget - caseC) * Math.min(1, dt * 4);
        applyCase(caseC);
        cdHolder.position.y = CD_RISE_POS.y + Math.sin(sec * 1.2) * 0.05;
        cd.stageGroup.rotation.y += (dragYaw - cd.stageGroup.rotation.y) * Math.min(1, dt * 6);
        cd.stageGroup.rotation.x += (dragPitch - cd.stageGroup.rotation.x) * Math.min(1, dt * 6);
        break;
      }
      case "zoomIn": {
        cd.stageGroup.rotation.y += (0 - cd.stageGroup.rotation.y) * Math.min(1, dt * 6);
        cd.stageGroup.rotation.x += (0 - cd.stageGroup.rotation.x) * Math.min(1, dt * 6);
        if (!camTween) {
          setState("zoomed");
          if (pendingListen) openListen();
        }
        break;
      }
      case "zoomed":
      case "sheet":
      case "zoomOut": {
        cd.discPositioner.rotation.x += (flipX - cd.discPositioner.rotation.x) * Math.min(1, dt * 6);
        cd.discPositioner.rotation.y += (flipY - cd.discPositioner.rotation.y) * Math.min(1, dt * 6);
        if (state === "zoomOut" && !camTween) {
          dragYaw = 0;
          dragPitch = 0;
          setState("revealed");
        }
        break;
      }
      default:
        break;
    }

    // CD 转速：播放试听时更快，且随状态平滑过渡
    const targetSpin = isAudioPlaying ? 3.2
      : (state === "zoomed" || state === "sheet") ? 2.4
      : (state === "revealed" || state === "openCase" || state === "zoomIn" || state === "zoomOut") ? 0.9 : 0;
    spin += (targetSpin - spin) * Math.min(1, dt * 2.5);
    cd.discRotator.rotation.z -= spin * dt;
    cd.diffractionShaderMat.uniforms.uBassPulse.value = isAudioPlaying
      ? (0.45 + 0.35 * Math.sin(sec * 7.5))
      : (0.25 + 0.15 * Math.sin(sec * 2.5));

    // 开盒金色星尘粒子飘散
    if (state === "lidOff" || state === "rise" || state === "openCase") {
      dustMat.opacity = Math.min(0.85, dustMat.opacity + dt * 1.4);
      const posArr = dustGeo.attributes.position.array;
      for (let i = 0; i < dustCount; i++) {
        posArr[i * 3] += dustSeeds[i].vx * dt * 0.4;
        posArr[i * 3 + 1] += dustSeeds[i].vy * dt;
        posArr[i * 3 + 2] += dustSeeds[i].vz * dt * 0.4;
      }
      dustGeo.attributes.position.needsUpdate = true;
    } else if (dustMat.opacity > 0.01) {
      dustMat.opacity = Math.max(0, dustMat.opacity - dt * 0.8);
    }

    // 相机补间
    if (camTween) {
      camTween.t += dt;
      const e = giftEase.inOut(clamp01(camTween.t / camTween.dur));
      cam.pos.lerpVectors(camTween.fromPos, camTween.toPos, e);
      cam.look.lerpVectors(camTween.fromLook, camTween.toLook, e);
      if (camTween.t >= camTween.dur) camTween = null;
    }

    // 窄屏自动拉远，保证礼盒完整入画
    const aspect = camera.aspect || 1;
    const fit = Math.max(1, 1.08 / aspect);
    camera.position.copy(cam.look).add(cam.pos.clone().sub(cam.look).multiplyScalar(fit));
    camera.lookAt(cam.look);
  }

  // ---------- 交互：拾取 / 拖拽 / 单击 / 双击（含移动端双击） ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const isDesc = (obj, root) => {
    while (obj) {
      if (obj === root) return true;
      obj = obj.parent;
    }
    return false;
  };
  const chainVisible = (obj) => {
    while (obj) {
      if (!obj.visible) return false;
      obj = obj.parent;
    }
    return true;
  };
  function pick(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects([giftGroup, cdHolder], true)
      .filter((h) => !h.object.userData.noPick && chainVisible(h.object));
    return hits[0] || null;
  }

  function handleTap(e) {
    const hit = pick(e);
    const now = performance.now();
    const onDisc = !!hit && isDesc(hit.object, cd.discRotator);
    const onCD = !!hit && isDesc(hit.object, cdHolder);

    if (state === "closed" || state === "empty") {
      if (hit && cb.onRequestOpen) cb.onRequestOpen();
      return;
    }
    if (state === "revealed") {
      if (onDisc && caseC > 0.6) {
        lastDiscTap = now;
        zoomIn();
      } else if (onCD) {
        caseTarget = caseTarget > 0.5 ? 0 : 1;
      }
      return;
    }
    if (state === "zoomIn") {
      if (onDisc && now - lastDiscTap < 380) pendingListen = true;
      return;
    }
    if (state === "zoomed") {
      if (onDisc) {
        if (now - lastDiscTap < 380) {
          lastDiscTap = 0;
          openListen();
        } else {
          lastDiscTap = now;
        }
      } else {
        zoomOut();
      }
    }
  }

  const el = renderer.domElement;
  let down = null;
  el.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: 0 };
  });
  window.addEventListener("pointermove", (e) => {
    if (down) {
      const dx = e.clientX - down.lx;
      const dy = e.clientY - down.ly;
      down.lx = e.clientX;
      down.ly = e.clientY;
      down.moved += Math.abs(dx) + Math.abs(dy);
      if (down.moved > 6) {
        if (state === "closed") {
          giftGroup.rotation.y += dx * 0.01;
          lastUserSpin = performance.now();
        } else if (state === "revealed") {
          dragYaw = Math.max(-1.0, Math.min(1.0, dragYaw + dx * 0.008));
          dragPitch = Math.max(-0.6, Math.min(0.6, dragPitch + dy * 0.006));
        } else if (state === "zoomed") {
          flipY += dx * 0.012;
          flipX = Math.max(-1.2, Math.min(1.2, flipX + dy * 0.01));
        }
      }
      return;
    }
    if (e.target !== el) return;
    const hit = pick(e);
    let interactive = false;
    if (state === "closed" || state === "empty") interactive = !!hit;
    else if (state === "revealed") interactive = !!hit && isDesc(hit.object, cdHolder);
    else if (state === "zoomed") interactive = !!hit && isDesc(hit.object, cd.discRotator);
    hoverTarget = state === "closed" && hit ? 1 : 0;
    container.classList.toggle("is-pointer", interactive);
  });
  el.addEventListener("pointerleave", () => {
    hoverTarget = 0;
    container.classList.remove("is-pointer");
  });
  window.addEventListener("pointerup", (e) => {
    if (down && down.moved <= 6 && e.target === el) handleTap(e);
    down = null;
  });

  // ---------- 渲染循环（离开视口时暂停，节省 GPU） ----------
  let inView = true;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([en]) => { inView = en.isIntersecting; }).observe(container);
  }
  if ("ResizeObserver" in window) {
    new ResizeObserver(() => {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }).observe(container);
  }

  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!inView) return;
    update(dt, now);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);

  // ---------- 对外 API ----------
  return {
    get state() { return state; },
    beginUnbox() {
      if (state === "closed") setState("untie");
    },
    resetToClosed(autoOpen) {
      placeCDInBox();
      cd.labelMaterial.map = defaultCover;
      cd.labelMaterial.needsUpdate = true;
      cd.bookletMaterial.map = defaultCover;
      cd.bookletMaterial.needsUpdate = true;
      giftGroup.position.set(0, 0, 0);
      giftGroup.rotation.set(0, -0.5, 0);
      lidGroup.visible = true;
      lidGroup.position.set(0, lidBaseY, 0);
      lidGroup.rotation.set(0, 0, 0);
      setLidOpacity(1);
      bow.scale.setScalar(1);
      bow.rotation.set(0, 0, 0);
      baseRibbons.forEach((r) => { r.scale.y = 1; });
      giftReady = false;
      isEmpty = false;
      caseC = 0;
      caseTarget = 1;
      dragYaw = dragPitch = flipX = flipY = 0;
      pendingListen = false;
      isAudioPlaying = false;
      pendingAutoOpen = !!autoOpen;
      dustMat.opacity = 0;
      const posArr = dustGeo.attributes.position.array;
      for (let i = 0; i < dustCount; i++) {
        const a = (i / dustCount) * Math.PI * 2;
        const r = (i % 5) * 0.28;
        posArr[i * 3] = Math.cos(a) * r;
        posArr[i * 3 + 1] = 1.15 + (i % 3) * 0.12;
        posArr[i * 3 + 2] = Math.sin(a) * r;
      }
      dustGeo.attributes.position.needsUpdate = true;
      tweenCamera(CAM_CLOSED.pos, CAM_CLOSED.look, 0.8);
      setState("drop");
    },
    setGift(tex) {
      if (tex) {
        cd.labelMaterial.map = tex;
        cd.labelMaterial.needsUpdate = true;
        cd.bookletMaterial.map = tex;
        cd.bookletMaterial.needsUpdate = true;
      }
      isEmpty = false;
      giftReady = true;
    },
    setEmpty() {
      isEmpty = true;
      giftReady = true;
    },
    zoomIn,
    zoomOut,
    openListen,
    setPlaying(playing) {
      isAudioPlaying = !!playing;
    },
    closeSheet() {
      if (state === "sheet") setState("zoomed");
    }
  };
}

// ========================================================
// 4c. 音乐礼物盲盒 (立体礼盒拆封 + 30s 试听 + 邮箱回信)
// ========================================================
let activeUnpackAudio = null;

function initGiftBox() {
  const btnOpen = document.getElementById("btn-open-random");
  const slot = document.getElementById("gift-display-slot");
  const form = document.getElementById("gift-form");
  const feedback = document.getElementById("form-feedback");
  const btnSubmit = document.getElementById("btn-submit-gift");

  if (!btnOpen || !slot || !form) return;

  const canvasEl = document.getElementById("gift3d-canvas");
  const hintEl = document.getElementById("gift3d-hint");
  const stepEls = document.querySelectorAll(".g-step");
  const songTag = document.getElementById("gift3d-songtag");
  const sheet = document.getElementById("gift3d-sheet");
  const sheetBody = document.getElementById("gift3d-sheet-body");
  const sheetClose = document.getElementById("gift3d-sheet-close");
  const zoomActions = document.getElementById("gift3d-zoom-actions");
  const btnZoomListen = document.getElementById("btn-zoom-listen");
  const btnZoomBack = document.getElementById("btn-zoom-back");

  const urlParams = new URLSearchParams(window.location.search);
  let pendingSharedGiftId = parseInt(urlParams.get("gift") || "", 10);
  if (!Number.isInteger(pendingSharedGiftId) || pendingSharedGiftId <= 0) pendingSharedGiftId = null;

  let busy = false;
  let currentGift = null;
  let lastGiftId = null;
  let emptyMessage = "";

  const HINTS = {
    closed: pendingSharedGiftId ? "有人为你寄来一份专属音乐礼物 · 轻触礼盒拆开" : "轻触礼物盒，解开缎带",
    drop: "新的礼物正在送达",
    untie: "缎带正在松开",
    lidOff: "掀开盒盖",
    waitData: "正在从档案库取出唱片",
    rise: "一张唱片正从礼盒中升起",
    openCase: "打开唱片盒",
    revealed: "轻触 CD 放大端详 · 轻触唱片盒开合 · 拖动转动",
    zoomIn: "正在拉近端详",
    zoomed: "双击 CD 或点击下方按钮聆听 · 拖动翻转看背面光栅",
    zoomOut: "回到唱片盒"
  };
  const STEP_OF = {
    closed: 1, drop: 1, untie: 1, lidOff: 1, waitData: 1, empty: 1,
    rise: 2, openCase: 2,
    revealed: 3, zoomIn: 3, zoomed: 3, zoomOut: 3,
    sheet: 4
  };
  const SONGTAG_STATES = ["openCase", "revealed", "zoomIn", "zoomed", "zoomOut"];

  function onStageState(s) {
    if (hintEl) {
      hintEl.textContent = s === "empty" ? emptyMessage : (HINTS[s] || "");
      hintEl.classList.toggle("hidden", s === "sheet");
      hintEl.classList.remove("pulse");
      void hintEl.offsetWidth;
      hintEl.classList.add("pulse");
    }
    if (zoomActions) {
      zoomActions.classList.toggle("hidden", s !== "zoomed");
    }
    const step = STEP_OF[s] || 1;
    stepEls.forEach((el) => {
      const n = Number(el.dataset.step);
      el.classList.toggle("active", n === step);
      el.classList.toggle("done", n < step);
    });
    if (songTag) songTag.classList.toggle("hidden", !(currentGift && SONGTAG_STATES.includes(s)));
  }

  function openListenSheet() {
    if (!currentGift || !sheet || !sheetBody) return;
    renderUnpackedCard(currentGift, sheetBody);
    sheet.classList.remove("hidden");
    requestAnimationFrame(() => sheet.classList.add("open"));
  }

  function closeListenSheet(notifyStage) {
    if (!sheet) return;
    sheet.classList.remove("open");
    setTimeout(() => sheet.classList.add("hidden"), 420);
    if (activeUnpackAudio) {
      activeUnpackAudio.pause();
      activeUnpackAudio = null;
    }
    if (stage) stage.setPlaying(false);
    if (notifyStage && stage) stage.closeSheet();
  }
  if (sheetClose) sheetClose.addEventListener("click", () => closeListenSheet(true));

  let stage = null;
  try {
    if (canvasEl && typeof THREE !== "undefined") {
      stage = createGiftBoxStage(canvasEl, {
        onRequestOpen: () => openRandomGift(),
        onOpenListen: openListenSheet,
        onStateChange: onStageState
      });
      onStageState("closed");
    }
  } catch (e) {
    stage = null;
  }

  if (btnZoomListen) btnZoomListen.addEventListener("click", () => stage?.openListen());
  if (btnZoomBack) btnZoomBack.addEventListener("click", () => stage?.zoomOut());

  if (pendingSharedGiftId) {
    setTimeout(() => {
      document.getElementById("giftbox")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 350);
  }

  async function openRandomGift() {
    if (busy) return;
    busy = true;
    btnOpen.disabled = true;
    btnOpen.textContent = "启封中...";
    closeListenSheet(false);
    currentGift = null;
    if (songTag) songTag.classList.add("hidden");

    if (stage) {
      if (stage.state === "closed") stage.beginUnbox();
      else stage.resetToClosed(true);
    }

    try {
      let apiUrl = "/api/gifts/random";
      if (pendingSharedGiftId) {
        apiUrl += `?id=${pendingSharedGiftId}`;
        pendingSharedGiftId = null;
      } else if (lastGiftId) {
        apiUrl += `?exclude=${lastGiftId}`;
      }

      const res = await fetch(apiUrl, { cache: "no-store" });
      const result = await res.json();

      if (res.ok && result.code === 200 && result.data) {
        const gift = result.data;
        lastGiftId = gift.id;
        if (songTag) {
          songTag.innerHTML = `
            <div class="gs-from">A GIFT FROM ${escapeHtml(gift.nickname || "神秘知音")}</div>
            <div class="gs-title">${escapeHtml(gift.song_title)}</div>
            <div class="gs-artist">${escapeHtml(gift.artist || "未知艺术家")}</div>
          `;
        }
        if (stage) {
          const remoteTex = await loadCoverTexture(gift.album_cover);
          const tex = remoteTex || createPersonalizedGiftCover(gift);
          currentGift = gift;
          stage.setGift(tex);
          updateHeroDiscCover(gift.album_cover);
        } else {
          currentGift = gift;
          renderUnpackedCard(gift, slot);
        }
      } else {
        emptyMessage = result.message || "盲盒暂时空空如也，来右侧封存第一份音乐礼物吧。";
        if (stage) stage.setEmpty();
      }
    } catch (err) {
      emptyMessage = "网络连接不稳定，请稍后再拆一次。";
      if (stage) stage.setEmpty();
    } finally {
      busy = false;
      btnOpen.disabled = false;
      btnOpen.textContent = "换一份 / 再拆一个";
    }
  }

  btnOpen.addEventListener("click", openRandomGift);

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

    if (typeof updateHeroDiscCover === "function") {
      updateHeroDiscCover(cover);
    }

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
        <div class="unpacked-ambient-glow" style="background-image:url('${escapeHtml(cover)}')"></div>
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
        if (stage) stage.setPlaying(playing);
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

      const progressTrack = container.querySelector(".audio-progress-track");
      if (progressTrack) {
        progressTrack.addEventListener("click", (e) => {
          if (!activeUnpackAudio.duration) return;
          const rect = progressTrack.getBoundingClientRect();
          const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
          activeUnpackAudio.currentTime = ratio * activeUnpackAudio.duration;
          if (activeUnpackAudio.paused) {
            activeUnpackAudio.play();
            setPlayingUI(true);
          }
        });
      }
    }

    const heartBtn = document.getElementById("btn-heart-reaction");
    heartBtn.addEventListener("click", async () => {
      heartBtn.disabled = true;
      const plusEl = document.createElement("span");
      plusEl.className = "heart-float-plus";
      plusEl.textContent = "+1";
      heartBtn.appendChild(plusEl);
      setTimeout(() => plusEl.remove(), 820);

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

        const ceremonyOverlay = document.getElementById("seal-ceremony-overlay");
        if (ceremonyOverlay) {
          ceremonyOverlay.classList.remove("hidden");
          const btnCopyLink = document.getElementById("btn-copy-gift-link");
          const giftId = result.data?.id;
          if (btnCopyLink) {
            if (giftId) {
              btnCopyLink.classList.remove("hidden");
              btnCopyLink.textContent = "复制专属礼物链接";
              btnCopyLink.onclick = async () => {
                const shareUrl = `${window.location.origin}/?gift=${giftId}`;
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  btnCopyLink.textContent = "已复制链接 ✓";
                } catch {
                  btnCopyLink.textContent = shareUrl;
                }
              };
            } else {
              btnCopyLink.classList.add("hidden");
            }
          }
          const btnAnother = document.getElementById("btn-seal-another");
          if (btnAnother) {
            btnAnother.onclick = () => ceremonyOverlay.classList.add("hidden");
          }
        }
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
