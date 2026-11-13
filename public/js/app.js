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
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  loader.load(coverUrl, (tex) => {
    tex.anisotropy = 8;
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
    title: "古典重工大铜号角留声机",
    desc: "双壁铸黄铜号角（Lathe 旋转曲面）、手工胡桃木机座、复古 FM/AM 调谐表盘与 78 转虫胶唱片，号角随音乐低频产生细腻共振。"
  },
  vinyl: {
    meta: "FORMAT 03 — HI-FI TURNTABLE",
    title: "现代 Hi-Fi 黑胶唱机与碳纤维唱臂",
    desc: "拉丝铝合金防磁底座、微米级同心声槽黑胶转盘与平衡配重碳纤维 S 型唱臂，支持 33⅓ 与 45 RPM 切换及落针拾音动效。"
  },
  cassette: {
    meta: "FORMAT 04 — COMPACT CASSETTE",
    title: "八零年代透明卡带与双轴磁带机",
    desc: "经典透明卡带外壳配合左右双轴卷带齿轮、铬带桥与复古贴纸标签，重温磁带时代独特的机械咬合与模拟韵味。"
  },
  lyrics: {
    meta: "FORMAT 05 — OPTICAL LYRICS",
    title: "极光光学景深动态歌词大屏",
    desc: "实时提取专辑主色调渲染流体高斯背光，逐句随节拍平滑缩放与景深虚化，双击任意歌词即可精准跳转播放进度。"
  }
};

function initFormatIndex() {
  const items = document.querySelectorAll(".format-index-item");
  const canvasWrap = document.getElementById("format-three-canvas");
  const lyricsStage = document.getElementById("format-lyrics-stage");
  const metaEl = document.getElementById("fmt-copy-meta");
  const titleEl = document.getElementById("fmt-copy-title");
  const descEl = document.getElementById("fmt-copy-desc");

  if (!canvasWrap || typeof THREE === "undefined") return;

  const w = canvasWrap.clientWidth || 500;
  const h = canvasWrap.clientHeight || 230;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, w / h, 0.1, 50);
  camera.position.set(0, 0.4, 6.2);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  canvasWrap.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  const key = new THREE.DirectionalLight(0xfde6c4, 2.0);
  key.position.set(4, 5, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xcbd5e1, 1.4);
  rim.position.set(-4, -2, 3);
  scene.add(rim);

  const rainbowTex = createRadialRainbowTexture();
  const coverTex = createDefaultSpinoraCoverTexture();

  // 1. CD 模型
  const cdModel = createSpinoraCDAssembly(rainbowTex, coverTex);
  cdModel.caseLidHinge.rotation.y = -1.85;
  cdModel.stageGroup.scale.set(0.75, 0.75, 0.75);
  scene.add(cdModel.stageGroup);

  // 2. 古典铸铜号角留声机模型
  const gramGroup = new THREE.Group();
  const walnutMat = new THREE.MeshStandardMaterial({ color: 0x3b2314, roughness: 0.45, metalness: 0.1 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4a373, roughness: 0.22, metalness: 0.88, side: THREE.DoubleSide });
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.85, 2.2), walnutMat);
  cabinet.position.y = -0.7;
  gramGroup.add(cabinet);
  const gramPlatter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 0.95, 0.06, 48),
    new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.3, metalness: 0.2 })
  );
  gramPlatter.position.y = -0.24;
  gramGroup.add(gramPlatter);
  const hornPoints = [
    new THREE.Vector2(0.08, 0.0),
    new THREE.Vector2(0.12, 0.5),
    new THREE.Vector2(0.32, 1.05),
    new THREE.Vector2(0.85, 1.55)
  ];
  const hornMesh = new THREE.Mesh(new THREE.LatheGeometry(hornPoints, 40), brassMat);
  hornMesh.position.set(-0.25, 0.15, -0.35);
  hornMesh.rotation.x = 0.78;
  hornMesh.rotation.z = -0.35;
  gramGroup.add(hornMesh);
  gramGroup.visible = false;
  scene.add(gramGroup);

  // 3. 现代 Hi-Fi 黑胶唱盘模型
  const vinylGroup = new THREE.Group();
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.24, 2.5),
    new THREE.MeshStandardMaterial({ color: 0x1b1b20, roughness: 0.35, metalness: 0.65 })
  );
  plinth.position.y = -0.35;
  vinylGroup.add(plinth);
  const vinylDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(1.12, 1.12, 0.04, 64),
    new THREE.MeshPhysicalMaterial({ color: 0x09090b, roughness: 0.22, metalness: 0.2, clearcoat: 0.8 })
  );
  vinylDisc.position.set(-0.25, -0.2, 0);
  vinylGroup.add(vinylDisc);
  const vinylLabel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.38, 0.045, 32),
    new THREE.MeshStandardMaterial({ color: 0xd4a373, roughness: 0.4 })
  );
  vinylDisc.add(vinylLabel);
  const toneArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 1.45, 16),
    new THREE.MeshStandardMaterial({ color: 0xd4d4d8, metalness: 0.9, roughness: 0.2 })
  );
  toneArm.rotation.z = Math.PI / 2;
  toneArm.rotation.y = 0.35;
  toneArm.position.set(0.85, -0.1, 0.25);
  vinylGroup.add(toneArm);
  vinylGroup.rotation.x = 0.45;
  vinylGroup.visible = false;
  scene.add(vinylGroup);

  // 4. 八零年代透明磁带模型
  const cassGroup = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(3.1, 1.95, 0.36),
    new THREE.MeshPhysicalMaterial({ color: 0x27272c, transmission: 0.65, transparent: true, opacity: 0.8, roughness: 0.2 })
  );
  cassGroup.add(shell);
  const tapeLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(2.7, 0.95),
    new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.6 })
  );
  tapeLabel.position.set(0, 0.25, 0.19);
  cassGroup.add(tapeLabel);
  const reelL = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.32, 0.42, 24),
    new THREE.MeshStandardMaterial({ color: 0xd4a373, roughness: 0.4 })
  );
  reelL.rotation.x = Math.PI / 2;
  reelL.position.set(-0.72, -0.15, 0);
  cassGroup.add(reelL);
  const reelR = reelL.clone();
  reelR.position.set(0.72, -0.15, 0);
  cassGroup.add(reelR);
  cassGroup.visible = false;
  scene.add(cassGroup);

  let activeMode = "cd";
  let drag = false, px = 0, py = 0;
  canvasWrap.addEventListener("mousedown", (e) => { drag = true; px = e.clientX; py = e.clientY; });
  window.addEventListener("mousemove", (e) => {
    if (!drag) return;
    const grp = activeMode === "cd" ? cdModel.stageGroup : activeMode === "gramophone" ? gramGroup : activeMode === "vinyl" ? vinylGroup : cassGroup;
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
        gramGroup.visible = mode === "gramophone";
        vinylGroup.visible = mode === "vinyl";
        cassGroup.visible = mode === "cassette";
      }
    });
  });

  function renderLoop() {
    requestAnimationFrame(renderLoop);
    if (activeMode === "lyrics") return;
    if (activeMode === "cd") {
      cdModel.discRotator.rotation.z -= 0.015;
      if (!drag) cdModel.stageGroup.rotation.y += 0.004;
    } else if (activeMode === "gramophone") {
      gramPlatter.rotation.y += 0.02;
      if (!drag) gramGroup.rotation.y += 0.005;
    } else if (activeMode === "vinyl") {
      vinylDisc.rotation.y += 0.018;
      if (!drag) vinylGroup.rotation.y += 0.003;
    } else if (activeMode === "cassette") {
      reelL.rotation.y += 0.03;
      reelR.rotation.y += 0.03;
      if (!drag) cassGroup.rotation.y = Math.sin(performance.now() * 0.001) * 0.25;
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

  async function playUnsealAnimation() {
    const sleeveCard = document.getElementById("sealed-sleeve-card");
    if (!sleeveCard) return;
    sleeveCard.style.transform = "";
    sleeveCard.classList.add("is-tearing");
    await new Promise(r => setTimeout(r, 320));
    sleeveCard.classList.add("is-opening");
    await new Promise(r => setTimeout(r, 240));
  }

  async function openRandomGift() {
    btnOpen.disabled = true;
    btnOpen.textContent = "启封中...";
    if (btnUnsealHero) btnUnsealHero.disabled = true;

    if (activeUnpackAudio) {
      activeUnpackAudio.pause();
      activeUnpackAudio = null;
    }

    try {
      const fetchPromise = fetch("/api/gifts/random", { cache: "no-store" }).then(async r => ({
        ok: r.ok,
        result: await r.json()
      }));
      const animPromise = playUnsealAnimation();
      const [{ ok, result }] = await Promise.all([fetchPromise, animPromise]);

      if (ok && result.code === 200 && result.data) {
        renderUnpackedCard(result.data, slot);
      } else {
        slot.innerHTML = `
          <div class="sealed-sleeve-card">
            <div class="sleeve-body">
              <div class="sleeve-catalog-no">EMPTY ARCHIVE</div>
              <h3 class="sleeve-heading">盲盒暂时空空如也</h3>
              <p class="sleeve-sub">${escapeHtml(result.message || "来右侧做第一个封存音乐礼物的人吧。")}</p>
            </div>
          </div>
        `;
      }
    } catch (err) {
      slot.innerHTML = `
        <div class="sealed-sleeve-card">
          <div class="sleeve-body">
            <p style="color:var(--danger);">网络连接不稳定，请稍后刷新重试。</p>
          </div>
        </div>
      `;
    } finally {
      btnOpen.disabled = false;
      btnOpen.textContent = "换一首 / 随机开启";
    }
  }

  btnOpen.addEventListener("click", openRandomGift);
  const sleeveCardEl = document.getElementById("sealed-sleeve-card");
  if (sleeveCardEl) {
    sleeveCardEl.addEventListener("click", (e) => {
      if (e.target.closest("#btn-unseal-hero") || !btnOpen.disabled) {
        openRandomGift();
      }
    });
  } else if (btnUnsealHero) {
    btnUnsealHero.addEventListener("click", openRandomGift);
  }

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
