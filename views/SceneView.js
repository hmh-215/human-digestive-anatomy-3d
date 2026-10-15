import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * SceneView.js
 * High-performance Three.js 3D viewport for Human Digestive Anatomy
 * using genuine Z-Anatomy (BodyParts3D) VisceralSystem.fbx models.
 *
 * Features:
 * - 100% authentic medical meshes from Z-Anatomy (VisceralSystem.fbx, 17.5 MB)
 * - Automatic noise filter for Blender helper pins (.j, .t, line)
 * - 5-level surgical depth peeling & selective layer visibility
 * - Localized sub-assembly explosion on real meshes (Couinaud segments I-VIII, Duodeno-Pancreatic complex)
 * - Smart contextual ghosting (12% X-Ray for non-selected organs)
 * - 6-layer stomach wall architecture with 3 separate directional muscle layers
 * - Cutaway cross-section windowing exposing inner rugae folds
 * - Authentic torso abdominal wall model with skin tone for clinical surface palpation
 * - Clinical landmark pins with depth testing
 */
export class SceneView {
  constructor(container, sceneVM, dissectionVM, landmarksVM, appVM) {
    this.container = container;
    this.sceneVM = sceneVM;
    this.dissectionVM = dissectionVM;
    this.landmarksVM = landmarksVM;
    this.appVM = appVM;

    this.scene = new THREE.Scene();
    this.currentTheme = appVM.state.theme || 'light';
    this.updateBackgroundColor();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const aspect = width / height || 16 / 9;
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 150);
    this.camera.position.set(0, 0, 14);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.localClippingEnabled = true;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(0, -0.5, 0);
    this.controls.maxDistance = 40;
    this.controls.minDistance = 2;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.organGroups = new Map(); // organId -> THREE.Group
    this.subMeshMap = new Map();   // meshName -> { mesh, initialPos, explodeVector }
    this.landmarkMarkers = new Map();
    this.clickableMeshes = [];
    this.allVisceralMeshes = [];
    this.stomachWallMeshes = [];

    // Torso abdominal wall model for clinical landmarks (Mode 2)
    this.torsoRoot = null;
    this.torsoSkinMaterial = null;

    // Procedural PBR Textures for 6 Stomach Wall Layers
    this.serosaTexture = null;
    this.longitudinalMuscleTexture = null;
    this.longitudinalMuscleBump = null;
    this.circularMuscleTexture = null;
    this.circularMuscleBump = null;
    this.obliqueMuscleTexture = null;
    this.obliqueMuscleBump = null;
    this.submucosaTexture = null;
    this.submucosaBump = null;
    this.mucosaTexture = null;
    this.mucosaBump = null;

    this._setupLoadingOverlay();
    this._setupLights();
    this._buildClinicalLandmarks();
    this._loadTorsoModel();
    this._bindEvents();
    this._bindViewModel();

    // Nạp mô hình thật từ Z-Anatomy
    this._loadZAnatomyVisceralFBX();

    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);
  }

  _setupLoadingOverlay() {
    this.loadingOverlay = document.createElement('div');
    this.loadingOverlay.id = 'loading-overlay';
    this.loadingOverlay.style.cssText = `
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(248, 250, 252, 0.88);
      backdrop-filter: blur(8px);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 100;
      transition: opacity 0.4s ease;
    `;
    this.loadingOverlay.innerHTML = `
      <div style="font-size: 36px; margin-bottom: 12px; animation: pulse 1.5s infinite;">🩺</div>
      <div id="loading-status-text" style="font-size: 14px; font-weight: 700; color: #0284c7; margin-bottom: 8px;">
        Đang nạp mô hình giải phẫu thật Z-Anatomy (VisceralSystem.fbx)...
      </div>
      <div style="width: 240px; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
        <div id="loading-progress-bar" style="width: 15%; height: 100%; background: #0284c7; transition: width 0.2s;"></div>
      </div>
      <small style="font-size: 11px; color: #64748b; margin-top: 8px;">Nội tạng chuẩn BodyParts3D & TA2</small>
    `;
    this.container.appendChild(this.loadingOverlay);
  }

  _updateLoadingProgress(percent, text) {
    const bar = document.getElementById('loading-progress-bar');
    const label = document.getElementById('loading-status-text');
    if (bar) bar.style.width = `${percent}%`;
    if (label && text) label.textContent = text;
  }

  _hideLoadingOverlay() {
    if (this.loadingOverlay) {
      this.loadingOverlay.style.opacity = '0';
      setTimeout(() => {
        if (this.loadingOverlay && this.loadingOverlay.parentNode) {
          this.loadingOverlay.parentNode.removeChild(this.loadingOverlay);
        }
      }, 400);
    }
  }

  updateBackgroundColor() {
    this.scene.background = new THREE.Color(
      this.currentTheme === 'light' ? 0xf1f5f9 : 0x0f172a
    );
  }

  _setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.25);
    keyLight.position.set(12, 18, 14);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xbfdbfe, 0.75);
    fillLight.position.set(-12, -6, -10);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffedd5, 0.7);
    rimLight.position.set(0, -12, 12);
    this.scene.add(rimLight);
  }

  _generateProceduralTextures() {
    const createCanvas = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      return canvas;
    };

    // 1. LỚP 1: THANH MẠC (TUNICA SEROSA)
    // Mặt màng bụng óng ánh (peritoneal sheen) với vi mạch thanh mạc mỏng
    {
      const canvas = createCanvas();
      const ctx = canvas.getContext('2d');

      const grad = ctx.createLinearGradient(0, 0, 512, 512);
      grad.addColorStop(0, '#e11d48');
      grad.addColorStop(0.5, '#f43f5e');
      grad.addColorStop(1, '#db2777');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);

      // Mạng vi mạch thanh mạc nhẹ nhàng
      ctx.strokeStyle = 'rgba(159, 18, 57, 0.25)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        let x = Math.random() * 512;
        let y = Math.random() * 512;
        ctx.moveTo(x, y);
        for (let j = 0; j < 4; j++) {
          x += (Math.random() - 0.5) * 60;
          y += (Math.random() - 0.5) * 60;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // Đốm phản chiếu thanh dịch óng ánh (peritoneal fluid glistening)
      for (let i = 0; i < 60; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const r = Math.random() * 6 + 2;
        const dotGrad = ctx.createRadialGradient(x, y, 0, x, y, r);
        dotGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
        dotGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = dotGrad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      this.serosaTexture = new THREE.CanvasTexture(canvas);
      this.serosaTexture.wrapS = THREE.RepeatWrapping;
      this.serosaTexture.wrapT = THREE.RepeatWrapping;
    }

    // 2A. LỚP 2A: THỚ CƠ DỌC (STRATUM LONGITUDINALE)
    // Đường thớ cơ chạy DỌC rõ rệt (hướng Y song song), màu đỏ myoglobin đậm
    {
      const canvas = createCanvas();
      const ctx = canvas.getContext('2d');

      const bgGrad = ctx.createLinearGradient(0, 0, 512, 0);
      bgGrad.addColorStop(0, '#701a24');
      bgGrad.addColorStop(0.5, '#881337');
      bgGrad.addColorStop(1, '#5c0916');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 512, 512);

      // Các dải bó cơ dọc chính (longitudinal fascicles)
      for (let x = 0; x < 512; x += 14) {
        ctx.fillStyle = (x % 28 === 0) ? 'rgba(159, 18, 57, 0.35)' : 'rgba(76, 5, 25, 0.45)';
        ctx.fillRect(x, 0, 10, 512);
      }

      // Các sợi cơ trơn mảnh chạy DỌC liên tục từ trên xuống dưới
      ctx.lineWidth = 1.6;
      for (let x = 0; x < 512; x += 3) {
        ctx.strokeStyle = Math.random() > 0.45 ? 'rgba(244, 63, 94, 0.55)' : 'rgba(76, 5, 25, 0.65)';
        ctx.beginPath();
        ctx.moveTo(x + (Math.random() - 0.5) * 1.5, 0);
        ctx.lineTo(x + (Math.random() - 0.5) * 2.5, 512);
        ctx.stroke();
      }

      // Hạch đám rối Auerbach chạy dọc giữa các bó cơ
      ctx.fillStyle = 'rgba(251, 191, 36, 0.6)';
      for (let i = 0; i < 90; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * 512, Math.random() * 512, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }

      this.longitudinalMuscleTexture = new THREE.CanvasTexture(canvas);
      this.longitudinalMuscleTexture.wrapS = THREE.RepeatWrapping;
      this.longitudinalMuscleTexture.wrapT = THREE.RepeatWrapping;

      // Bump map cho thớ cơ dọc (vân gờ nổi theo chiều dọc)
      const bumpCanvas = createCanvas();
      const bCtx = bumpCanvas.getContext('2d');
      bCtx.fillStyle = '#808080';
      bCtx.fillRect(0, 0, 512, 512);
      bCtx.lineWidth = 2.2;
      for (let x = 0; x < 512; x += 4) {
        bCtx.strokeStyle = Math.random() > 0.5 ? '#e2e8f0' : '#1e293b';
        bCtx.beginPath();
        bCtx.moveTo(x, 0);
        bCtx.lineTo(x, 512);
        bCtx.stroke();
      }
      this.longitudinalMuscleBump = new THREE.CanvasTexture(bumpCanvas);
      this.longitudinalMuscleBump.wrapS = THREE.RepeatWrapping;
      this.longitudinalMuscleBump.wrapT = THREE.RepeatWrapping;
    }

    // 2B. LỚP 2B: THỚ CƠ VÒNG (STRATUM CIRCULARE)
    // Đường thớ cơ chạy NGANG / VÒNG quanh chu vi (hướng X song song), dày chắc
    {
      const canvas = createCanvas();
      const ctx = canvas.getContext('2d');

      const bgGrad = ctx.createLinearGradient(0, 0, 0, 512);
      bgGrad.addColorStop(0, '#66101f');
      bgGrad.addColorStop(0.5, '#7f1d1d');
      bgGrad.addColorStop(1, '#4c0519');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 512, 512);

      // Các đai cơ vòng lớn (circular muscular rings)
      for (let y = 0; y < 512; y += 16) {
        ctx.fillStyle = (y % 32 === 0) ? 'rgba(185, 28, 28, 0.4)' : 'rgba(69, 10, 10, 0.5)';
        ctx.fillRect(0, y, 512, 12);
      }

      // Các sợi cơ trơn chạy NGANG liên tục
      ctx.lineWidth = 1.8;
      for (let y = 0; y < 512; y += 3.5) {
        ctx.strokeStyle = Math.random() > 0.4 ? 'rgba(248, 113, 113, 0.5)' : 'rgba(69, 10, 10, 0.7)';
        ctx.beginPath();
        ctx.moveTo(0, y + (Math.random() - 0.5) * 1.2);
        ctx.lineTo(512, y + (Math.random() - 0.5) * 1.8);
        ctx.stroke();
      }

      this.circularMuscleTexture = new THREE.CanvasTexture(canvas);
      this.circularMuscleTexture.wrapS = THREE.RepeatWrapping;
      this.circularMuscleTexture.wrapT = THREE.RepeatWrapping;

      // Bump map cho thớ cơ vòng (vân gờ nổi theo chiều ngang)
      const bumpCanvas = createCanvas();
      const bCtx = bumpCanvas.getContext('2d');
      bCtx.fillStyle = '#808080';
      bCtx.fillRect(0, 0, 512, 512);
      bCtx.lineWidth = 2.4;
      for (let y = 0; y < 512; y += 4.5) {
        bCtx.strokeStyle = Math.random() > 0.5 ? '#f1f5f9' : '#0f172a';
        bCtx.beginPath();
        bCtx.moveTo(0, y);
        bCtx.lineTo(512, y);
        bCtx.stroke();
      }
      this.circularMuscleBump = new THREE.CanvasTexture(bumpCanvas);
      this.circularMuscleBump.wrapS = THREE.RepeatWrapping;
      this.circularMuscleBump.wrapT = THREE.RepeatWrapping;
    }

    // 2C. LỚP 2C: THỚ CƠ CHÉO (FIBRAE OBLIQUAE)
    // Đường thớ cơ chạy CHÉO 45 ĐỘ uốn lượn hình quai móng ngựa
    {
      const canvas = createCanvas();
      const ctx = canvas.getContext('2d');

      const bgGrad = ctx.createLinearGradient(0, 0, 512, 512);
      bgGrad.addColorStop(0, '#581c87');
      bgGrad.addColorStop(0.5, '#6b1111');
      bgGrad.addColorStop(1, '#450a0a');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 512, 512);

      // Các dải cơ chéo 45 độ
      for (let i = -512; i < 512; i += 18) {
        ctx.fillStyle = 'rgba(159, 18, 57, 0.35)';
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 12, 0);
        ctx.lineTo(i + 524, 512);
        ctx.lineTo(i + 512, 512);
        ctx.fill();
      }

      // Các sợi cơ trơn chạy CHÉO góc 45 độ
      ctx.lineWidth = 1.6;
      for (let i = -512; i < 512; i += 4) {
        ctx.strokeStyle = Math.random() > 0.45 ? 'rgba(239, 68, 68, 0.5)' : 'rgba(88, 28, 135, 0.55)';
        ctx.beginPath();
        ctx.moveTo(i + (Math.random() - 0.5) * 2, 0);
        ctx.lineTo(i + 512 + (Math.random() - 0.5) * 3, 512);
        ctx.stroke();
      }

      this.obliqueMuscleTexture = new THREE.CanvasTexture(canvas);
      this.obliqueMuscleTexture.wrapS = THREE.RepeatWrapping;
      this.obliqueMuscleTexture.wrapT = THREE.RepeatWrapping;

      // Bump map cho thớ cơ chéo
      const bumpCanvas = createCanvas();
      const bCtx = bumpCanvas.getContext('2d');
      bCtx.fillStyle = '#808080';
      bCtx.fillRect(0, 0, 512, 512);
      bCtx.lineWidth = 2.2;
      for (let i = -512; i < 512; i += 5) {
        bCtx.strokeStyle = Math.random() > 0.5 ? '#f8fafc' : '#18181b';
        bCtx.beginPath();
        bCtx.moveTo(i, 0);
        bCtx.lineTo(i + 512, 512);
        bCtx.stroke();
      }
      this.obliqueMuscleBump = new THREE.CanvasTexture(bumpCanvas);
      this.obliqueMuscleBump.wrapS = THREE.RepeatWrapping;
      this.obliqueMuscleBump.wrapT = THREE.RepeatWrapping;
    }

    // 3. LỚP 3: TẦNG DƯỚI NIÊM MẠC (TELA SUBMUCOSA)
    // Màu trắng ngà / hồng phấn nhạt collagen + Đám rối vi mạch Meissner
    {
      const canvas = createCanvas();
      const ctx = canvas.getContext('2d');

      const grad = ctx.createLinearGradient(0, 0, 512, 512);
      grad.addColorStop(0, '#fdf2f8');
      grad.addColorStop(0.5, '#fce7f3');
      grad.addColorStop(1, '#fed7aa');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);

      // Lưới sợi chun liên kết lỏng lẻo
      ctx.strokeStyle = 'rgba(219, 39, 119, 0.12)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 80; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 40 + 10, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Đám rối vi mạch phân nhánh
      const drawVascularBranch = (x0, y0, length, angle, depth, strokeColor, width) => {
        if (depth <= 0) return;
        const x1 = x0 + Math.cos(angle) * length;
        const y1 = y0 + Math.sin(angle) * length;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(
          (x0 + x1) / 2 + (Math.random() - 0.5) * 15,
          (y0 + y1) / 2 + (Math.random() - 0.5) * 15,
          x1, y1
        );
        ctx.stroke();

        const spread = 0.5 + Math.random() * 0.3;
        drawVascularBranch(x1, y1, length * 0.72, angle + spread, depth - 1, strokeColor, width * 0.7);
        drawVascularBranch(x1, y1, length * 0.72, angle - spread, depth - 1, strokeColor, width * 0.7);
      };

      for (let i = 0; i < 14; i++) {
        const rx = Math.random() * 450 + 30;
        const ry = Math.random() * 450 + 30;
        drawVascularBranch(rx, ry, 35, Math.random() * Math.PI * 2, 4, '#dc2626', 2.8);
      }
      for (let i = 0; i < 10; i++) {
        const rx = Math.random() * 450 + 30;
        const ry = Math.random() * 450 + 30;
        drawVascularBranch(rx, ry, 30, Math.random() * Math.PI * 2, 3, '#2563eb', 2.2);
      }

      // Hạch thần kinh Meissner
      ctx.fillStyle = '#d97706';
      for (let i = 0; i < 60; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * 512, Math.random() * 512, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      this.submucosaTexture = new THREE.CanvasTexture(canvas);
      this.submucosaTexture.wrapS = THREE.RepeatWrapping;
      this.submucosaTexture.wrapT = THREE.RepeatWrapping;

      const bumpCanvas = createCanvas();
      const bCtx = bumpCanvas.getContext('2d');
      bCtx.fillStyle = '#808080';
      bCtx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 300; i++) {
        bCtx.fillStyle = Math.random() > 0.5 ? '#a0a0a0' : '#606060';
        bCtx.beginPath();
        bCtx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 3 + 1, 0, Math.PI * 2);
        bCtx.fill();
      }
      this.submucosaBump = new THREE.CanvasTexture(bumpCanvas);
      this.submucosaBump.wrapS = THREE.RepeatWrapping;
      this.submucosaBump.wrapT = THREE.RepeatWrapping;
    }

    // 4. LỚP 4: LỚP NIÊM MẠC TUYẾN (TUNICA MUCOSA & RUGAE)
    // Chuẩn theo ảnh tư liệu y khoa: Các nếp gấp vị Rugae màu hổ phách / cam san hô ấm (warm caramel/coral)
    // uốn lượn sâu sắc, rãnh bóng đổ tối màu, đỉnh nếp gấp sáng bóng óng ánh
    {
      const canvas = createCanvas();
      const ctx = canvas.getContext('2d');

      // Nền ấm áp màu cam san hô / caramel đậm
      const grad = ctx.createLinearGradient(0, 0, 512, 512);
      grad.addColorStop(0, '#7c2d12');
      grad.addColorStop(0.3, '#c2410c');
      grad.addColorStop(0.7, '#ea580c');
      grad.addColorStop(1, '#9a3412');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);

      // Các Nếp Gấp Vị Rugae dày đặc uốn lượn mềm mại
      // Lớp 1: Rãnh sâu bóng đổ tối sẫm (valleys)
      for (let y = 25; y < 512; y += 40) {
        ctx.strokeStyle = '#380a04';
        ctx.lineWidth = 18;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, y + 8);
        for (let x = 0; x <= 512; x += 25) {
          const offset = Math.sin((x / 512) * Math.PI * 4 + (y / 35)) * 16 +
                         Math.cos((x / 512) * Math.PI * 2) * 8;
          ctx.lineTo(x, y + 8 + offset);
        }
        ctx.stroke();
      }

      // Lớp 2: Thân gờ nếp gấp nhô cao màu cam đỏ san hô
      for (let y = 25; y < 512; y += 40) {
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 11;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= 512; x += 25) {
          const offset = Math.sin((x / 512) * Math.PI * 4 + (y / 35)) * 16 +
                         Math.cos((x / 512) * Math.PI * 2) * 8;
          ctx.lineTo(x, y + offset);
        }
        ctx.stroke();
      }

      // Lớp 3: Đỉnh nếp gấp bắt sáng óng ánh vàng mật ong (bright ridge crests)
      for (let y = 25; y < 512; y += 40) {
        ctx.strokeStyle = 'rgba(254, 215, 170, 0.9)';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, y - 2);
        for (let x = 0; x <= 512; x += 25) {
          const offset = Math.sin((x / 512) * Math.PI * 4 + (y / 35)) * 16 +
                         Math.cos((x / 512) * Math.PI * 2) * 8;
          ctx.lineTo(x, y - 2 + offset);
        }
        ctx.stroke();
      }

      // Các nhánh nối phụ (anastomosing bridges giữa các nếp gấp)
      for (let i = 0; i < 35; i++) {
        const x = Math.random() * 460 + 20;
        const y = Math.random() * 460 + 20;
        ctx.strokeStyle = '#ea580c';
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 15, y + 20, x + (Math.random() - 0.5) * 30, y + 35);
        ctx.stroke();
      }

      // Lỗ hố tuyến vị vi thể (Gastric Pits)
      ctx.fillStyle = 'rgba(56, 10, 4, 0.55)';
      for (let i = 0; i < 500; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 1.6 + 0.6, 0, Math.PI * 2);
        ctx.fill();
      }

      this.mucosaTexture = new THREE.CanvasTexture(canvas);
      this.mucosaTexture.wrapS = THREE.RepeatWrapping;
      this.mucosaTexture.wrapT = THREE.RepeatWrapping;

      // Bump Map chiều sâu cao (Deep Relief Normal Bump)
      const bumpCanvas = createCanvas();
      const bCtx = bumpCanvas.getContext('2d');
      bCtx.fillStyle = '#808080';
      bCtx.fillRect(0, 0, 512, 512);

      for (let y = 25; y < 512; y += 40) {
        // Rãnh sâu đen
        bCtx.strokeStyle = '#101010';
        bCtx.lineWidth = 18;
        bCtx.beginPath();
        bCtx.moveTo(0, y + 8);
        for (let x = 0; x <= 512; x += 25) {
          const offset = Math.sin((x / 512) * Math.PI * 4 + (y / 35)) * 16 +
                         Math.cos((x / 512) * Math.PI * 2) * 8;
          bCtx.lineTo(x, y + 8 + offset);
        }
        bCtx.stroke();

        // Đỉnh cao trắng
        bCtx.strokeStyle = '#ffffff';
        bCtx.lineWidth = 8;
        bCtx.beginPath();
        bCtx.moveTo(0, y - 2);
        for (let x = 0; x <= 512; x += 25) {
          const offset = Math.sin((x / 512) * Math.PI * 4 + (y / 35)) * 16 +
                         Math.cos((x / 512) * Math.PI * 2) * 8;
          bCtx.lineTo(x, y - 2 + offset);
        }
        bCtx.stroke();
      }

      this.mucosaBump = new THREE.CanvasTexture(bumpCanvas);
      this.mucosaBump.wrapS = THREE.RepeatWrapping;
      this.mucosaBump.wrapT = THREE.RepeatWrapping;
    }
  }

  _loadZAnatomyVisceralFBX() {
    const loader = new FBXLoader();
    this._updateLoadingProgress(20, 'Đang tải tệp VisceralSystem.fbx (17.5 MB)...');

    // Khởi tạo các bộ texture PBR cho các tầng mô học
    this._generateProceduralTextures();

    loader.load(
      './assets/models/VisceralSystem.fbx',
      (fbx) => {
        this._updateLoadingProgress(70, 'Đang phân tích cấu trúc giải phẫu & gán vật liệu PBR...');
        this._processZAnatomyFBX(fbx);
        this._hideLoadingOverlay();
      },
      (xhr) => {
        if (xhr.lengthComputable) {
          const percent = Math.min(65, Math.round((xhr.loaded / xhr.total) * 65));
          this._updateLoadingProgress(percent, `Đang nạp mô hình Z-Anatomy (${percent}%)...`);
        }
      },
      (err) => {
        console.error('Lỗi nạp VisceralSystem.fbx:', err);
        this._updateLoadingProgress(100, 'Lỗi nạp mô hình FBX. Đang kiểm tra đường dẫn...');
      }
    );
  }

  _processZAnatomyFBX(fbx) {
    this.masterRoot = new THREE.Group();
    this.masterRoot.name = 'ZAnatomy_Visceral_Master';
    this.scene.add(this.masterRoot);

    // Giữ nguyên cấu trúc FBX trong masterRoot - KHÔNG tách rời mesh khỏi parent hierarchy
    this.masterRoot.add(fbx);
    if (this.torsoRoot) {
      this.masterRoot.add(this.torsoRoot);
    }

    // 1. Chuẩn bị bảng phân loại vật liệu PBR y khoa chuẩn
    const materials = {
      liver: new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.38, metalness: 0.12, side: THREE.DoubleSide }),
      gallbladder_tree: new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x064e3b, roughness: 0.25, metalness: 0.2, side: THREE.DoubleSide }),
      stomach: new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide }),
      pancreas: new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide }),
      duodenum: new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide }),
      small_intestine: new THREE.MeshStandardMaterial({ color: 0xf87171, roughness: 0.5, metalness: 0.08, side: THREE.DoubleSide }),
      large_intestine: new THREE.MeshStandardMaterial({ color: 0x84cc16, roughness: 0.48, metalness: 0.1, side: THREE.DoubleSide }),
      esophagus: new THREE.MeshStandardMaterial({ color: 0xfbcfe8, roughness: 0.4, metalness: 0.05, side: THREE.DoubleSide }),
      peritoneum_omentum: new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.65, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
    };

    const couinaudColors = {
      'segment of liver (i)': 0x854d0e,
      'segment of liver (ii)': 0x9a3412,
      'segment of liver (iii)': 0xb45309,
      'segment of liver (iv)': 0xc2410c,
      'segment of liver (v)': 0x7c2d12,
      'segment of liver (vi)': 0x881337,
      'segment of liver (vii)': 0x9f1239,
      'segment of liver (viii)': 0xa16207
    };

    // Helper kiểm tra tạng thuộc hệ tiêu hóa
    const getDigestiveInfo = (name) => {
      const low = (name || '').toLowerCase().trim();

      // Bỏ qua các helper pins, markers, wireframe text trong Blender (.j, .t, line)
      if (
        low.endsWith('j') ||
        low.endsWith('.j') ||
        low.endsWith('.t') ||
        low.includes('_line') || low.includes('-line') ||
        low.includes('axis') || low.includes('pointer') ||
        low.includes('profile') || low.includes('origin') ||
        low.includes('null') || low.includes('dummy') ||
        low === 'j' || low === 't'
      ) return null;

      // GAN & ĐƯỜNG MẬT (Chuẩn Couinaud 8 hạ phân thùy I - VIII & Khối Nhu Mô Gan)
      if (low.includes('liver')) {
        let couinaudKey = null;
        let explodeVec = new THREE.Vector3(0.035, 0.02, 0.02);

        if (low.includes('(i)')) {
          couinaudKey = 'segment of liver (i)';
          explodeVec = new THREE.Vector3(0, 0.08, -0.10);
        } else if (low.includes('(ii)')) {
          couinaudKey = 'segment of liver (ii)';
          explodeVec = new THREE.Vector3(-0.10, 0.07, -0.04);
        } else if (low.includes('(iii)')) {
          couinaudKey = 'segment of liver (iii)';
          explodeVec = new THREE.Vector3(-0.10, 0.03, 0.06);
        } else if (low.includes('(iv)')) {
          couinaudKey = 'segment of liver (iv)';
          explodeVec = new THREE.Vector3(-0.03, -0.03, 0.09);
        } else if (low.includes('(v)')) {
          couinaudKey = 'segment of liver (v)';
          explodeVec = new THREE.Vector3(0.08, -0.05, 0.08);
        } else if (low.includes('(vi)')) {
          couinaudKey = 'segment of liver (vi)';
          explodeVec = new THREE.Vector3(0.11, -0.05, -0.04);
        } else if (low.includes('(vii)')) {
          couinaudKey = 'segment of liver (vii)';
          explodeVec = new THREE.Vector3(0.11, 0.07, -0.06);
        } else if (low.includes('(viii)')) {
          couinaudKey = 'segment of liver (viii)';
          explodeVec = new THREE.Vector3(0.05, 0.08, 0.04);
        }

        return { organId: 'liver', couinaudKey, explodeVector: explodeVec };
      }

      // TÚI MẬT & ĐƯỜNG MẬT
      if (low.includes('gallbladder') || low.includes('bile') || low.includes('cystic')) {
        const isGb = low.includes('gallbladder');
        return {
          organId: 'gallbladder_tree',
          explodeVector: isGb ? new THREE.Vector3(0.09, -0.07, 0.08) : new THREE.Vector3(0.06, -0.05, 0.05)
        };
      }

      // DẠ DÀY
      if (low.includes('stomach') || low.includes('gaster') || low.includes('gastric') || low === 'ch') {
        return { organId: 'stomach', explodeVector: new THREE.Vector3(-0.06, 0.03, 0.05) };
      }

      // TỤY TẠNG & ỐNG TỤY
      if (low.includes('pancreas') || low.includes('pancreatic')) {
        const isDuct = low.includes('duct');
        return {
          organId: 'pancreas',
          explodeVector: isDuct ? new THREE.Vector3(-0.06, 0, 0.04) : new THREE.Vector3(-0.08, 0, -0.03)
        };
      }

      // TÁ TRÀNG
      if (low.includes('duodenum')) {
        return { organId: 'duodenum', explodeVector: new THREE.Vector3(0.08, -0.03, 0.03) };
      }

      // RUỘT NON (HỖNG TRÀNG & HỒI TRÀNG)
      if (low.includes('jejunum') || low.includes('ileum') || low.includes('small intestine') || low === 'intestine.g') {
        return { organId: 'small_intestine', explodeVector: new THREE.Vector3(0, -0.06, 0.04) };
      }

      // RUỘT GIÀ & RUỘT THỪA (Đại tràng lên, ngang, xuống, xích ma & ruột thừa)
      if (
        low.includes('colon') || low.includes('cecum') || low.includes('caecum') ||
        low.includes('appendix') || low.includes('taenia') || low.includes('large intestine')
      ) {
        let expVec = new THREE.Vector3(0, 0, 0);
        if (low.includes('appendix')) {
          expVec = new THREE.Vector3(0.14, -0.10, 0.07);
        } else if (low.includes('meso-appendix') || low.includes('meso_appendix')) {
          expVec = new THREE.Vector3(0.12, -0.08, 0.06);
        } else if (low.includes('transverse')) {
          expVec = new THREE.Vector3(0, 0.10, 0.06);
        } else if (low.includes('ascending')) {
          expVec = new THREE.Vector3(0.08, 0, 0.01);
        } else if (low.includes('descending')) {
          expVec = new THREE.Vector3(-0.08, 0, 0.01);
        } else if (low.includes('sigmoid') || low === 'id colon') {
          expVec = new THREE.Vector3(-0.06, -0.08, 0.03);
        }
        return { organId: 'large_intestine', explodeVector: expVec };
      }

      // THỰC QUẢN
      if (low.includes('oesophagus') || low.includes('esophagus')) {
        return { organId: 'esophagus', explodeVector: null };
      }

      // MẠC NỐI & PHÚC MẠC
      if (low.includes('omentum') || low.includes('peritoneum') || low.includes('meso')) {
        return { organId: 'peritoneum_omentum', explodeVector: new THREE.Vector3(0, -0.03, 0.08) };
      }

      // Không thuộc hệ tiêu hóa (phổi, tim, thận, tinh hoàn, ổ bụng thô, v.v.) -> ẩn đi
      return null;
    };

    // 2. Phân loại và gán thuộc tính cho từng Mesh trong FBX
    this.clickableMeshes = [];
    this.allVisceralMeshes = [];
    this.subMeshMap.clear();

    fbx.traverse((child) => {
      if (!child.isMesh || child.isLine || child.isLineSegments) return;
      if (child.geometry && child.geometry.attributes && child.geometry.attributes.position) {
        if (child.geometry.attributes.position.count <= 50) {
          child.visible = false;
          return;
        }
      }

      const info = getDigestiveInfo(child.name);
      if (!info) {
        // Tạng ngoài hệ tiêu hóa hoặc helper pin -> ẩn
        child.visible = false;
        return;
      }

      // ĐẶC BIỆT: Đối với Dạ Dày (Stomach), tạo 4 tầng mô học đồng tâm chuẩn ĐHYHN
      if (child.name === 'Stomach') {
        this._createStomachWallLayers(child);
        return;
      }

      // Là cơ quan tiêu hóa thật!
      child.visible = true;
      child.userData = {
        organId: info.organId,
        rawName: child.name,
        initialPos: child.position.clone(),
        explodeVector: info.explodeVector
      };

      // Gán vật liệu PBR
      const baseMat = materials[info.organId] || materials.stomach;
      const mat = baseMat.clone();
      if (info.couinaudKey && couinaudColors[info.couinaudKey]) {
        mat.color.setHex(couinaudColors[info.couinaudKey]);
      }
      child.material = mat;
      child.castShadow = true;
      child.receiveShadow = true;

      this.clickableMeshes.push(child);
      this.allVisceralMeshes.push(child);

      if (info.explodeVector) {
        this.subMeshMap.set(child.name, {
          mesh: child,
          initialPos: child.position.clone(),
          explodeVector: info.explodeVector
        });
      }
    });

    console.info(`[Z-Anatomy] Đã nhận diện và kích hoạt ${this.clickableMeshes.length} mesh hệ tiêu hóa thật!`);

    // 3. Tính toán Bounding Box CHỈ cho các cơ quan tiêu hóa thực sự
    this.masterRoot.updateMatrixWorld(true);
    const digestiveBBox = new THREE.Box3();
    this.clickableMeshes.forEach((mesh) => {
      mesh.updateWorldMatrix(true, false);
      digestiveBBox.expandByObject(mesh);
    });

    const center = digestiveBBox.getCenter(new THREE.Vector3());
    const size = digestiveBBox.getSize(new THREE.Vector3());
    console.info(`[Z-Anatomy True Digestive Box] Center: x=${center.x.toFixed(2)}, y=${center.y.toFixed(2)}, z=${center.z.toFixed(2)} | Size: x=${size.x.toFixed(2)}, y=${size.y.toFixed(2)}, z=${size.z.toFixed(2)}`);

    // 4. Chuẩn hóa tỷ lệ & căn giữa toàn bộ hệ tiêu hóa vào gốc tọa độ (0, 0, 0)
    // Chiều cao mục tiêu là 8.5 đơn vị (vừa vặn tuyệt đối trong góc nhìn camera FOV 40, distance 14)
    const targetHeight = 8.5;
    const scaleFactor = targetHeight / Math.max(size.y, 1);
    this.masterRoot.scale.setScalar(scaleFactor);
    this.masterRoot.position.set(
      -center.x * scaleFactor,
      -center.y * scaleFactor,
      -center.z * scaleFactor
    );

    // Cấu hình bản đồ tầng sâu giải phẫu (Depth Layers 1 - 5)
    this.layerMap = {
      esophagus: 1, peritoneum_omentum: 1,
      liver: 2, stomach: 2, large_intestine: 2,
      gallbladder_tree: 3, pancreas: 3, duodenum: 3, small_intestine: 3
    };

    this._updateLayerVisibility(this.dissectionVM.state.visibleLayers);
    this._updateOrganVisuals(this.sceneVM.state.selectedOrganId);
    console.info(`[Z-Anatomy] Hoàn tất nạp mô hình thật 100% vào Scene!`);
  }

  _createStomachWallLayers(stomachMesh) {
    this.stomachWallMeshes = [];
    const origGeo = stomachMesh.geometry;
    if (!origGeo.attributes.normal) {
      origGeo.computeVertexNormals();
    }
    origGeo.computeBoundingSphere();
    const radius = (origGeo.boundingSphere && origGeo.boundingSphere.radius) ? origGeo.boundingSphere.radius : 0.081;

    const organData = this.appVM.organsData.find(o => o.id === 'stomach');
    const wallLayersDef = (organData && organData.wallLayers) || [
      { id: 'stomach_serosa', name: 'Lớp 1: Thanh Mạc (Tunica Serosa)', layerOrder: 1 },
      { id: 'stomach_muscle_longitudinal', name: 'Lớp 2A: Thớ Cơ Dọc (Stratum Longitudinale)', layerOrder: 2 },
      { id: 'stomach_muscle_circular', name: 'Lớp 2B: Thớ Cơ Vòng (Stratum Circulare)', layerOrder: 3 },
      { id: 'stomach_muscle_oblique', name: 'Lớp 2C: Thớ Cơ Chéo (Fibrae Obliquae)', layerOrder: 4 },
      { id: 'stomach_submucosa', name: 'Lớp 3: Tầng Dưới Niêm Mạc (Tela Submucosa)', layerOrder: 5 },
      { id: 'stomach_mucosa', name: 'Lớp 4: Lớp Niêm Mạc Tuyến (Tunica Mucosa & Rugae)', layerOrder: 6 }
    ];

    // Inset distances cho 6 tầng đồng tâm:
    // Serosa: d = 0.0
    // Cơ dọc: d = 0.012 * radius
    // Cơ vòng: d = 0.024 * radius
    // Cơ chéo: d = 0.036 * radius
    // Dưới niêm mạc: d = 0.048 * radius
    // Niêm mạc Rugae: d = 0.060 * radius
    const insets = [
      0.0,
      0.012 * radius,
      0.024 * radius,
      0.036 * radius,
      0.048 * radius,
      0.060 * radius
    ];

    const materials = [
      new THREE.MeshStandardMaterial({
        map: this.serosaTexture,
        roughness: 0.22,
        metalness: 0.08,
        side: THREE.DoubleSide
      }),
      new THREE.MeshStandardMaterial({
        map: this.longitudinalMuscleTexture,
        bumpMap: this.longitudinalMuscleBump,
        bumpScale: 0.003,
        roughness: 0.52,
        metalness: 0.05,
        side: THREE.DoubleSide
      }),
      new THREE.MeshStandardMaterial({
        map: this.circularMuscleTexture,
        bumpMap: this.circularMuscleBump,
        bumpScale: 0.003,
        roughness: 0.54,
        metalness: 0.05,
        side: THREE.DoubleSide
      }),
      new THREE.MeshStandardMaterial({
        map: this.obliqueMuscleTexture,
        bumpMap: this.obliqueMuscleBump,
        bumpScale: 0.003,
        roughness: 0.55,
        metalness: 0.05,
        side: THREE.DoubleSide
      }),
      new THREE.MeshStandardMaterial({
        map: this.submucosaTexture,
        bumpMap: this.submucosaBump,
        bumpScale: 0.002,
        roughness: 0.45,
        metalness: 0.05,
        side: THREE.DoubleSide
      }),
      new THREE.MeshStandardMaterial({
        map: this.mucosaTexture,
        bumpMap: this.mucosaBump,
        bumpScale: 0.007,
        roughness: 0.35,
        metalness: 0.05,
        side: THREE.DoubleSide
      })
    ];

    // Hướng bóc tách mở rộng ra trước-bên (anterior-lateral)
    const baseExplodeDir = new THREE.Vector3(-0.09, 0.02, 0.07);

    wallLayersDef.forEach((layerDef, idx) => {
      const d = insets[idx] || 0;
      const geo = origGeo.clone();
      if (d > 0) {
        const posAttr = geo.attributes.position;
        const normAttr = geo.attributes.normal;
        for (let i = 0; i < posAttr.count; i++) {
          const px = posAttr.getX(i) - normAttr.getX(i) * d;
          const py = posAttr.getY(i) - normAttr.getY(i) * d;
          const pz = posAttr.getZ(i) - normAttr.getZ(i) * d;
          posAttr.setXYZ(i, px, py, pz);
        }
        posAttr.needsUpdate = true;
        geo.computeVertexNormals();
      }

      const mesh = new THREE.Mesh(geo, materials[idx]);
      mesh.name = layerDef.id;
      mesh.position.copy(stomachMesh.position);
      mesh.rotation.copy(stomachMesh.rotation);
      mesh.scale.copy(stomachMesh.scale);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      // Serosa (idx=0) di chuyển xa nhất (factor 1.0), niêm mạc (idx=5) factor 0.0
      const offsetFactor = (5 - idx) / 5;
      const wallExplodeOffset = baseExplodeDir.clone().multiplyScalar(offsetFactor);

      mesh.userData = {
        organId: 'stomach',
        isStomachWallLayer: true,
        wallLayerId: layerDef.id,
        wallLayerOrder: layerDef.layerOrder,
        wallLayerName: layerDef.name,
        rawName: layerDef.name,
        initialPos: stomachMesh.position.clone(),
        wallExplodeOffset: wallExplodeOffset,
        explodeVector: new THREE.Vector3(-0.06, 0.03, 0.05)
      };

      stomachMesh.parent.add(mesh);
      this.stomachWallMeshes.push(mesh);
      this.clickableMeshes.push(mesh);
      this.allVisceralMeshes.push(mesh);
    });

    stomachMesh.visible = false;
    if (this.dissectionVM.state.isCutawayOpen) {
      this._updateStomachCutaway(true);
    }
    console.info(`[Stomach 6-Layers] Đã tạo thành công 6 tầng mô học đồng tâm (Serosa, Cơ dọc, Cơ vòng, Cơ chéo, Dưới niêm mạc, Niêm mạc Rugae)`);
  }

  _updateStomachCutaway(isOpen) {
    if (!this.stomachWallMeshes || this.stomachWallMeshes.length === 0) return;

    if (!isOpen) {
      this.stomachWallMeshes.forEach(mesh => {
        mesh.material.clippingPlanes = [];
        mesh.material.clipShadows = true;
        mesh.material.needsUpdate = true;
      });
      return;
    }

    // Cắt mở bậc thang (Stepped Cutaway Window) ở thành trước dạ dày
    // Normal hướng vào trong / ra sau (véc-tơ Z âm) để xén bỏ thành trước hướng ra camera
    const clipNormal = new THREE.Vector3(0.3, 0.1, -0.95).normalize();
    // Offset càng nhỏ thì cắt càng sâu (mở cửa sổ càng rộng)
    // Tầng 0 (Serosa): mở rộng nhất -> offset 0.008
    // Tầng 1 (Cơ dọc): lùi lại -> offset 0.015
    // Tầng 2 (Cơ vòng): lùi lại -> offset 0.022
    // Tầng 3 (Cơ chéo): lùi lại -> offset 0.029
    // Tầng 4 (Dưới niêm mạc): lùi lại -> offset 0.036
    // Tầng 5 (Niêm mạc): mở cửa sổ giữa -> offset 0.043 (bộc lộ thành sau với Rugae folds)
    const offsets = [0.008, 0.015, 0.022, 0.029, 0.036, 0.043];

    this.stomachWallMeshes.forEach(mesh => {
      const order = mesh.userData.wallLayerOrder || 1;
      const idx = Math.min(Math.max(order - 1, 0), 5);
      const plane = new THREE.Plane(clipNormal, offsets[idx]);
      mesh.material.clippingPlanes = [plane];
      mesh.material.clipShadows = true;
      mesh.material.needsUpdate = true;
    });
  }

  _loadTorsoModel() {
    const gltfLoader = new GLTFLoader();
    this.torsoRoot = new THREE.Group();
    this.torsoRoot.name = 'Torso_Abdominal_Wall_Root';
    this.torsoRoot.visible = (this.appVM.state.activeMode === 'pathology');

    this.torsoSkinMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4a373, // Màu da người ấm áp tự nhiên (Natural warm skin tone)
      roughness: 0.42,
      metalness: 0.06,
      transparent: true,
      opacity: this.dissectionVM.state.torsoSkinOpacity !== undefined ? this.dissectionVM.state.torsoSkinOpacity : 0.65,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    gltfLoader.load(
      './assets/models/TorsoAbdominalWall.glb',
      (gltf) => {
        gltf.scene.traverse((child) => {
          if (child.isMesh) {
            child.material = this.torsoSkinMaterial;
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        this.torsoRoot.add(gltf.scene);
        // Tỷ lệ chuẩn hóa: GLB decimeters (10cm) -> FBX centimeters (1cm) = 10.0x
        this.torsoRoot.scale.set(10.0, 10.0, 10.0);
        if (this.masterRoot) {
          this.masterRoot.add(this.torsoRoot);
        }
        console.info('[Z-Anatomy Torso] Nạp thành công mô hình hệ cơ thành bụng Torso với màu da khám bệnh (scale 10.0x)!');
      },
      undefined,
      (err) => {
        console.warn('Không thể nạp TorsoAbdominalWall.glb:', err);
      }
    );
  }

  _updateTorsoSkinOpacity(opacity) {
    if (!this.torsoSkinMaterial) return;
    this.torsoSkinMaterial.opacity = opacity;
    if (opacity <= 0.02) {
      if (this.torsoRoot) this.torsoRoot.visible = false;
    } else {
      if (this.torsoRoot && this.appVM.state.activeMode === 'pathology') {
        this.torsoRoot.visible = true;
      }
      if (opacity >= 0.98) {
        this.torsoSkinMaterial.transparent = false;
        this.torsoSkinMaterial.depthWrite = true;
      } else {
        this.torsoSkinMaterial.transparent = true;
        this.torsoSkinMaterial.depthWrite = false;
      }
    }
    this.torsoSkinMaterial.needsUpdate = true;
  }

  _buildClinicalLandmarks() {
    this.landmarksRoot = new THREE.Group();
    this.scene.add(this.landmarksRoot);

    const pinGeo = new THREE.SphereGeometry(0.11, 24, 24);
    this.appVM.landmarksData.forEach(lm => {
      const pinMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        roughness: 0.2,
        depthTest: true,
        depthWrite: true
      });
      const pinMesh = new THREE.Mesh(pinGeo, pinMat);
      pinMesh.position.set(...lm.coordinates);
      pinMesh.userData = { landmarkId: lm.id, name: lm.name };

      this.landmarksRoot.add(pinMesh);
      this.landmarkMarkers.set(lm.id, pinMesh);
    });

    // Chỉ hiện các điểm mốc lâm sàng khi vào tab 'Điểm Mốc Lâm Sàng'
    this.landmarksRoot.visible = (this.appVM.state.activeMode === 'pathology');
    this.appVM.subscribe('activeMode', (mode) => {
      this.landmarksRoot.visible = (mode === 'pathology');
    });
  }

  _bindEvents() {
    window.addEventListener('resize', () => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      if (w > 0 && h > 0) {
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
      }
    });

    const getNormalizedCoords = (e) => {
      const rect = this.renderer.domElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      return { x, y };
    };

    this.renderer.domElement.addEventListener('pointermove', (e) => {
      const { x, y } = getNormalizedCoords(e);
      this.mouse.set(x, y);
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const hits = this.raycaster.intersectObjects(this.clickableMeshes, true);
      if (hits.length > 0) {
        const topHit = hits[0].object;
        this.renderer.domElement.style.cursor = 'pointer';
        this.sceneVM.setHoveredOrgan(topHit.userData.organId);
      } else {
        this.renderer.domElement.style.cursor = 'default';
        this.sceneVM.setHoveredOrgan(null);
      }
    });

    this.renderer.domElement.addEventListener('click', (e) => {
      const { x, y } = getNormalizedCoords(e);
      this.mouse.set(x, y);
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const hits = this.raycaster.intersectObjects(this.clickableMeshes, true);
      if (hits.length > 0) {
        const topHit = hits[0].object;
        if (topHit.userData.isStomachWallLayer) {
          this.sceneVM.selectOrgan('stomach');
          this.dissectionVM.setActiveWallLayer(topHit.userData.wallLayerId);
        } else {
          this.sceneVM.selectOrgan(topHit.userData.organId);
        }
      }
    });
  }

  _bindViewModel() {
    this.sceneVM.subscribe('selectedOrganId', (selectedId) => {
      this._updateOrganVisuals(selectedId);
    });

    this.dissectionVM.subscribe('visibleLayers', (layers) => {
      this._updateLayerVisibility(layers);
    });

    this.dissectionVM.subscribe('localExplodeFactor', (factor) => {
      this._updateLocalizedExplosion(factor);
    });

    this.dissectionVM.subscribe('stomachWallLayers', () => {
      this._updateStomachWallDissection();
      this._updateOrganVisuals(this.sceneVM.state.selectedOrganId);
    });

    this.dissectionVM.subscribe('stomachWallExplodeFactor', () => {
      this._updateStomachWallDissection();
    });

    this.dissectionVM.subscribe('activeWallLayerId', (layerId) => {
      this._highlightActiveWallLayer(layerId);
    });

    this.dissectionVM.subscribe('isIsolateMode', () => {
      this._updateOrganVisuals(this.sceneVM.state.selectedOrganId);
    });

    this.dissectionVM.subscribe('isXRayMode', () => {
      this._updateOrganVisuals(this.sceneVM.state.selectedOrganId);
    });

    this.dissectionVM.subscribe('isCutawayOpen', (isOpen) => {
      this._updateStomachCutaway(isOpen);
    });

    this.dissectionVM.subscribe('torsoSkinOpacity', (opacity) => {
      this._updateTorsoSkinOpacity(opacity);
    });

    this.appVM.subscribe('activeMode', (mode) => {
      this.landmarksRoot.visible = (mode === 'pathology');
      if (this.torsoRoot) {
        this.torsoRoot.visible = (mode === 'pathology');
      }
    });

    this.appVM.subscribe('theme', (theme) => {
      this.currentTheme = theme;
      this.updateBackgroundColor();
    });

    this.sceneVM.subscribe('cameraTarget', (target) => {
      if (target) {
        this._smoothMoveCameraTarget(target);
      }
    });
  }

  _updateOrganVisuals(selectedId) {
    const isIsolate = this.dissectionVM.state.isIsolateMode;
    const isXRay = this.dissectionVM.state.isXRayMode;
    const visibleLayers = this.dissectionVM.state.visibleLayers;
    const layerMap = this.layerMap || {
      esophagus: 1, peritoneum_omentum: 1,
      liver: 2, stomach: 2, large_intestine: 2,
      gallbladder_tree: 3, pancreas: 3, duodenum: 3, small_intestine: 3
    };

    const wallLayersState = this.dissectionVM.state.stomachWallLayers || {};
    const activeWallLayerId = this.dissectionVM.state.activeWallLayerId;

    this.clickableMeshes.forEach((mesh) => {
      const organId = mesh.userData.organId;
      const isWallLayer = !!mesh.userData.isStomachWallLayer;
      const layer = layerMap[organId] || 3;

      if (!visibleLayers.includes(layer)) {
        mesh.visible = false;
        return;
      }

      if (isWallLayer) {
        const isLayerOn = wallLayersState[mesh.userData.wallLayerId] !== false;
        if (!isLayerOn) {
          mesh.visible = false;
          return;
        }

        if (!selectedId) {
          mesh.visible = true;
          mesh.material.transparent = isXRay;
          mesh.material.opacity = isXRay ? 0.35 : 1.0;
          if (mesh.material.emissive) mesh.material.emissive.setHex(0x000000);
        } else if (selectedId === 'stomach') {
          mesh.visible = true;
          mesh.material.transparent = false;
          mesh.material.opacity = 1.0;
          if (mesh.material.emissive) {
            if (activeWallLayerId && mesh.userData.wallLayerId === activeWallLayerId) {
              mesh.material.emissive.setHex(0x331111);
            } else {
              mesh.material.emissive.setHex(0x000000);
            }
          }
        } else {
          if (isIsolate) {
            mesh.visible = false;
          } else {
            mesh.visible = true;
            mesh.material.transparent = true;
            mesh.material.opacity = 0.12;
            if (mesh.material.emissive) mesh.material.emissive.setHex(0x000000);
          }
        }
        return;
      }

      if (!selectedId) {
        // Trạng thái bình thường
        mesh.visible = true;
        mesh.material.transparent = isXRay || organId === 'peritoneum_omentum';
        mesh.material.opacity = isXRay ? 0.35 : (organId === 'peritoneum_omentum' ? 0.45 : 1.0);
        if (mesh.material.emissive) {
          mesh.material.emissive.setHex(organId === 'gallbladder_tree' ? 0x064e3b : 0x000000);
        }
      } else if (organId === selectedId) {
        // Tạng được người dùng chọn
        mesh.visible = true;
        mesh.material.transparent = false;
        mesh.material.opacity = 1.0;
        if (mesh.material.emissive) mesh.material.emissive.setHex(0x332211);
      } else {
        // Các tạng xung quanh
        if (isIsolate) {
          mesh.visible = false;
        } else {
          mesh.visible = true;
          mesh.material.transparent = true;
          mesh.material.opacity = 0.12; // Contextual smart ghosting
          if (mesh.material.emissive) mesh.material.emissive.setHex(0x000000);
        }
      }
    });

    this._updateStomachWallDissection();
  }

  _updateStomachWallDissection() {
    if (!this.stomachWallMeshes || this.stomachWallMeshes.length === 0) return;
    const layersState = this.dissectionVM.state.stomachWallLayers || {};
    const explodeFactor = this.dissectionVM.state.stomachWallExplodeFactor || 0.0;
    const localExplodeFactor = this.dissectionVM.state.localExplodeFactor || 0.0;
    const selectedOrganId = this.sceneVM.state.selectedOrganId;
    const visibleLayers = this.dissectionVM.state.visibleLayers;
    const isStomachVisible = visibleLayers.includes(2);

    // Hướng bóc tách trong WORLD space: Sang trái (hướng ô mở giữa màn hình) và ra trước (về phía camera)
    const worldExplodeDir = new THREE.Vector3(-1.1, 0.25, 0.9);

    this.stomachWallMeshes.forEach(mesh => {
      const layerId = mesh.userData.wallLayerId;
      const isLayerOn = layersState[layerId] !== false;

      if (!isStomachVisible || !isLayerOn) {
        mesh.visible = false;
        return;
      }

      mesh.visible = true;

      const pos = mesh.userData.initialPos.clone();
      if (selectedOrganId === 'stomach' && localExplodeFactor > 0) {
        pos.addScaledVector(mesh.userData.explodeVector, localExplodeFactor * 0.8);
      }
      if (explodeFactor > 0 && mesh.parent) {
        const parentQuat = mesh.parent.getWorldQuaternion(new THREE.Quaternion());
        const parentScale = mesh.parent.getWorldScale(new THREE.Vector3());
        const localDir = worldExplodeDir.clone().applyQuaternion(parentQuat.invert()).divide(parentScale);

        const layerOrder = mesh.userData.wallLayerOrder || 1;
        const layerFactor = (6 - layerOrder) / 5;
        pos.addScaledVector(localDir, explodeFactor * layerFactor * 1.5);
      }
      mesh.position.copy(pos);
    });
  }

  _highlightActiveWallLayer(layerId) {
    if (!this.stomachWallMeshes) return;
    this.stomachWallMeshes.forEach(mesh => {
      if (mesh.userData.wallLayerId === layerId) {
        if (mesh.material.emissive) mesh.material.emissive.setHex(0x331111);
      } else {
        if (mesh.material.emissive) mesh.material.emissive.setHex(0x000000);
      }
    });
  }

  focusStomach() {
    if (this.stomachWallMeshes && this.stomachWallMeshes.length > 0) {
      const mesh = this.stomachWallMeshes[0];
      mesh.updateWorldMatrix(true, false);
      const bbox = new THREE.Box3().setFromObject(mesh);
      const center = bbox.getCenter(new THREE.Vector3());

      this.controls.target.set(center.x, center.y, center.z);
      this.camera.position.set(center.x - 0.4, center.y + 0.1, center.z + 5.2);
      this.controls.update();
    }
  }

  _updateLayerVisibility(visibleLayers) {
    const layerMap = this.layerMap || {
      esophagus: 1, peritoneum_omentum: 1,
      liver: 2, stomach: 2, large_intestine: 2,
      gallbladder_tree: 3, pancreas: 3, duodenum: 3, small_intestine: 3
    };

    this.clickableMeshes.forEach((mesh) => {
      const organId = mesh.userData.organId;
      const layer = layerMap[organId] || 3;
      mesh.visible = visibleLayers.includes(layer);
    });
    this._updateStomachWallDissection();
  }

  _updateLocalizedExplosion(factor) {
    const organId = this.dissectionVM.state.localExplodeOrganId;
    this.clickableMeshes.forEach((mesh) => {
      if (mesh.userData.explodeVector && !mesh.userData.isStomachWallLayer) {
        if (organId && mesh.userData.organId === organId) {
          mesh.position.copy(mesh.userData.initialPos).addScaledVector(mesh.userData.explodeVector, factor * 0.8);
        } else {
          mesh.position.copy(mesh.userData.initialPos);
        }
      }
    });
    this._updateStomachWallDissection();
  }

  _smoothMoveCameraTarget(targetCoords) {
    const target = new THREE.Vector3(...targetCoords);
    const startTarget = this.controls.target.clone();
    let progress = 0;

    const animateFocus = () => {
      progress += 0.05;
      this.controls.target.lerpVectors(startTarget, target, progress);
      if (progress < 1) {
        requestAnimationFrame(animateFocus);
      }
    };
    animateFocus();
  }

  _animate() {
    requestAnimationFrame(this._animate);
    this.controls.update();

    const time = Date.now() * 0.003;
    const pulseScale = 1.0 + 0.15 * Math.sin(time);
    this.landmarkMarkers.forEach((mesh) => {
      mesh.scale.set(pulseScale, pulseScale, pulseScale);
    });

    this.renderer.render(this.scene, this.camera);
  }
}
