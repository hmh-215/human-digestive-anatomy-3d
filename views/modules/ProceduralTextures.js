import * as THREE from 'three';

/**
 * ProceduralTextures.js
 * Module 1: Lazy-initialized & cached PBR Procedural Textures and Bump Maps
 * for the 6 Histological Layers of the Stomach Wall.
 *
 * Avoids main-thread blocking during initial scene boot by generating textures
 * on demand or during idle frames.
 */
export class ProceduralTextures {
  constructor() {
    this._cache = null;
  }

  /**
   * Returns cached textures or generates them on first request.
   */
  getTextures() {
    if (this._cache) {
      return this._cache;
    }
    this._cache = this._buildAllTextures();
    return this._cache;
  }

  /**
   * Pre-warms the texture cache during browser idle time so initial page load is instant.
   */
  warmupAsync(onReady) {
    if (this._cache) {
      if (onReady) onReady(this._cache);
      return;
    }
    const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 60));
    schedule(() => {
      const tex = this.getTextures();
      if (onReady) onReady(tex);
    });
  }

  _buildAllTextures() {
    const createCanvas = (size = 512) => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      return canvas;
    };

    const result = {};

    // 1. LỚP 1: THANH MẠC (TUNICA SEROSA)
    {
      const canvas = createCanvas(256);
      const ctx = canvas.getContext('2d');

      const grad = ctx.createLinearGradient(0, 0, 256, 256);
      grad.addColorStop(0, '#e11d48');
      grad.addColorStop(0.5, '#f43f5e');
      grad.addColorStop(1, '#db2777');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);

      ctx.strokeStyle = 'rgba(159, 18, 57, 0.25)';
      ctx.lineWidth = 1.0;
      for (let i = 0; i < 28; i++) {
        ctx.beginPath();
        let x = Math.random() * 256;
        let y = Math.random() * 256;
        ctx.moveTo(x, y);
        for (let j = 0; j < 3; j++) {
          x += (Math.random() - 0.5) * 35;
          y += (Math.random() - 0.5) * 35;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      for (let i = 0; i < 35; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        const r = Math.random() * 4 + 1.5;
        const dotGrad = ctx.createRadialGradient(x, y, 0, x, y, r);
        dotGrad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
        dotGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = dotGrad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      result.serosaTexture = new THREE.CanvasTexture(canvas);
      result.serosaTexture.wrapS = THREE.RepeatWrapping;
      result.serosaTexture.wrapT = THREE.RepeatWrapping;
    }

    // 2A. LỚP 2A: THỚ CƠ DỌC (STRATUM LONGITUDINALE)
    {
      const canvas = createCanvas(512);
      const ctx = canvas.getContext('2d');

      const bgGrad = ctx.createLinearGradient(0, 0, 512, 0);
      bgGrad.addColorStop(0, '#701a24');
      bgGrad.addColorStop(0.5, '#881337');
      bgGrad.addColorStop(1, '#5c0916');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 512, 512);

      for (let x = 0; x < 512; x += 14) {
        ctx.fillStyle = (x % 28 === 0) ? 'rgba(159, 18, 57, 0.38)' : 'rgba(76, 5, 25, 0.48)';
        ctx.fillRect(x, 0, 10, 512);
      }

      ctx.lineWidth = 1.6;
      for (let x = 0; x < 512; x += 4) {
        ctx.strokeStyle = Math.random() > 0.45 ? 'rgba(244, 63, 94, 0.55)' : 'rgba(76, 5, 25, 0.65)';
        ctx.beginPath();
        ctx.moveTo(x + (Math.random() - 0.5) * 1.5, 0);
        ctx.lineTo(x + (Math.random() - 0.5) * 2.5, 512);
        ctx.stroke();
      }

      result.longitudinalMuscleTexture = new THREE.CanvasTexture(canvas);
      result.longitudinalMuscleTexture.wrapS = THREE.RepeatWrapping;
      result.longitudinalMuscleTexture.wrapT = THREE.RepeatWrapping;

      const bumpCanvas = createCanvas(256);
      const bCtx = bumpCanvas.getContext('2d');
      bCtx.fillStyle = '#808080';
      bCtx.fillRect(0, 0, 256, 256);
      bCtx.lineWidth = 2.0;
      for (let x = 0; x < 256; x += 4) {
        bCtx.strokeStyle = (x % 8 === 0) ? '#e2e8f0' : '#1e293b';
        bCtx.beginPath();
        bCtx.moveTo(x, 0);
        bCtx.lineTo(x, 256);
        bCtx.stroke();
      }
      result.longitudinalMuscleBump = new THREE.CanvasTexture(bumpCanvas);
      result.longitudinalMuscleBump.wrapS = THREE.RepeatWrapping;
      result.longitudinalMuscleBump.wrapT = THREE.RepeatWrapping;
    }

    // 2B. LỚP 2B: THỚ CƠ VÒNG (STRATUM CIRCULARE)
    {
      const canvas = createCanvas(512);
      const ctx = canvas.getContext('2d');

      const bgGrad = ctx.createLinearGradient(0, 0, 0, 512);
      bgGrad.addColorStop(0, '#66101f');
      bgGrad.addColorStop(0.5, '#7f1d1d');
      bgGrad.addColorStop(1, '#4c0519');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 512, 512);

      for (let y = 0; y < 512; y += 16) {
        ctx.fillStyle = (y % 32 === 0) ? 'rgba(185, 28, 28, 0.42)' : 'rgba(69, 10, 10, 0.52)';
        ctx.fillRect(0, y, 512, 12);
      }

      ctx.lineWidth = 1.8;
      for (let y = 0; y < 512; y += 4) {
        ctx.strokeStyle = Math.random() > 0.4 ? 'rgba(248, 113, 113, 0.52)' : 'rgba(69, 10, 10, 0.72)';
        ctx.beginPath();
        ctx.moveTo(0, y + (Math.random() - 0.5) * 1.2);
        ctx.lineTo(512, y + (Math.random() - 0.5) * 1.8);
        ctx.stroke();
      }

      result.circularMuscleTexture = new THREE.CanvasTexture(canvas);
      result.circularMuscleTexture.wrapS = THREE.RepeatWrapping;
      result.circularMuscleTexture.wrapT = THREE.RepeatWrapping;

      const bumpCanvas = createCanvas(256);
      const bCtx = bumpCanvas.getContext('2d');
      bCtx.fillStyle = '#808080';
      bCtx.fillRect(0, 0, 256, 256);
      bCtx.lineWidth = 2.2;
      for (let y = 0; y < 256; y += 4) {
        bCtx.strokeStyle = (y % 8 === 0) ? '#f1f5f9' : '#0f172a';
        bCtx.beginPath();
        bCtx.moveTo(0, y);
        bCtx.lineTo(256, y);
        bCtx.stroke();
      }
      result.circularMuscleBump = new THREE.CanvasTexture(bumpCanvas);
      result.circularMuscleBump.wrapS = THREE.RepeatWrapping;
      result.circularMuscleBump.wrapT = THREE.RepeatWrapping;
    }

    // 2C. LỚP 2C: THỚ CƠ CHÉO (FIBRAE OBLIQUAE)
    {
      const canvas = createCanvas(512);
      const ctx = canvas.getContext('2d');

      const bgGrad = ctx.createLinearGradient(0, 0, 512, 512);
      bgGrad.addColorStop(0, '#581c87');
      bgGrad.addColorStop(0.5, '#6b1111');
      bgGrad.addColorStop(1, '#450a0a');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 512, 512);

      for (let i = -512; i < 512; i += 18) {
        ctx.fillStyle = 'rgba(159, 18, 57, 0.35)';
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 12, 0);
        ctx.lineTo(i + 524, 512);
        ctx.lineTo(i + 512, 512);
        ctx.fill();
      }

      ctx.lineWidth = 1.6;
      for (let i = -512; i < 512; i += 5) {
        ctx.strokeStyle = Math.random() > 0.45 ? 'rgba(239, 68, 68, 0.5)' : 'rgba(88, 28, 135, 0.55)';
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 512, 512);
        ctx.stroke();
      }

      result.obliqueMuscleTexture = new THREE.CanvasTexture(canvas);
      result.obliqueMuscleTexture.wrapS = THREE.RepeatWrapping;
      result.obliqueMuscleTexture.wrapT = THREE.RepeatWrapping;

      const bumpCanvas = createCanvas(256);
      const bCtx = bumpCanvas.getContext('2d');
      bCtx.fillStyle = '#808080';
      bCtx.fillRect(0, 0, 256, 256);
      bCtx.lineWidth = 2.0;
      for (let i = -256; i < 256; i += 5) {
        bCtx.strokeStyle = (i % 10 === 0) ? '#f8fafc' : '#18181b';
        bCtx.beginPath();
        bCtx.moveTo(i, 0);
        bCtx.lineTo(i + 256, 256);
        bCtx.stroke();
      }
      result.obliqueMuscleBump = new THREE.CanvasTexture(bumpCanvas);
      result.obliqueMuscleBump.wrapS = THREE.RepeatWrapping;
      result.obliqueMuscleBump.wrapT = THREE.RepeatWrapping;
    }

    // 3. LỚP 3: TẦNG DƯỚI NIÊM MẠC (TELA SUBMUCOSA)
    {
      const canvas = createCanvas(512);
      const ctx = canvas.getContext('2d');

      const grad = ctx.createLinearGradient(0, 0, 512, 512);
      grad.addColorStop(0, '#fdf2f8');
      grad.addColorStop(0.5, '#fce7f3');
      grad.addColorStop(1, '#fed7aa');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);

      const drawVascularBranch = (x0, y0, length, angle, depth, strokeColor, width) => {
        if (depth <= 0) return;
        const x1 = x0 + Math.cos(angle) * length;
        const y1 = y0 + Math.sin(angle) * length;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(
          (x0 + x1) / 2 + (Math.random() - 0.5) * 12,
          (y0 + y1) / 2 + (Math.random() - 0.5) * 12,
          x1, y1
        );
        ctx.stroke();

        const spread = 0.5 + Math.random() * 0.3;
        drawVascularBranch(x1, y1, length * 0.72, angle + spread, depth - 1, strokeColor, width * 0.7);
        drawVascularBranch(x1, y1, length * 0.72, angle - spread, depth - 1, strokeColor, width * 0.7);
      };

      for (let i = 0; i < 12; i++) {
        drawVascularBranch(Math.random() * 450 + 30, Math.random() * 450 + 30, 34, Math.random() * Math.PI * 2, 4, '#dc2626', 2.6);
      }
      for (let i = 0; i < 9; i++) {
        drawVascularBranch(Math.random() * 450 + 30, Math.random() * 450 + 30, 28, Math.random() * Math.PI * 2, 3, '#2563eb', 2.0);
      }

      ctx.fillStyle = '#d97706';
      for (let i = 0; i < 45; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * 512, Math.random() * 512, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      result.submucosaTexture = new THREE.CanvasTexture(canvas);
      result.submucosaTexture.wrapS = THREE.RepeatWrapping;
      result.submucosaTexture.wrapT = THREE.RepeatWrapping;

      result.submucosaBump = result.submucosaTexture;
    }

    // 4. LỚP 4: NIÊM MẠC TUYẾN & NẾP GẤP VỊ RUGAE (TUNICA MUCOSA)
    {
      const canvas = createCanvas(512);
      const ctx = canvas.getContext('2d');

      const bgGrad = ctx.createLinearGradient(0, 0, 512, 512);
      bgGrad.addColorStop(0, '#c2410c');
      bgGrad.addColorStop(0.5, '#ea580c');
      bgGrad.addColorStop(1, '#9a3412');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, 512, 512);

      for (let y = 25; y < 512; y += 40) {
        ctx.strokeStyle = 'rgba(67, 20, 7, 0.85)';
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

        ctx.strokeStyle = 'rgba(217, 119, 6, 0.9)';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= 512; x += 25) {
          const offset = Math.sin((x / 512) * Math.PI * 4 + (y / 35)) * 16 +
                         Math.cos((x / 512) * Math.PI * 2) * 8;
          ctx.lineTo(x, y + offset);
        }
        ctx.stroke();

        ctx.strokeStyle = 'rgba(254, 215, 170, 0.75)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(0, y - 3);
        for (let x = 0; x <= 512; x += 25) {
          const offset = Math.sin((x / 512) * Math.PI * 4 + (y / 35)) * 16 +
                         Math.cos((x / 512) * Math.PI * 2) * 8;
          ctx.lineTo(x, y - 3 + offset);
        }
        ctx.stroke();
      }

      result.mucosaTexture = new THREE.CanvasTexture(canvas);
      result.mucosaTexture.wrapS = THREE.RepeatWrapping;
      result.mucosaTexture.wrapT = THREE.RepeatWrapping;

      const bumpCanvas = createCanvas(256);
      const bCtx = bumpCanvas.getContext('2d');
      bCtx.fillStyle = '#808080';
      bCtx.fillRect(0, 0, 256, 256);

      for (let y = 12; y < 256; y += 20) {
        bCtx.strokeStyle = '#101010';
        bCtx.lineWidth = 9;
        bCtx.beginPath();
        bCtx.moveTo(0, y + 4);
        for (let x = 0; x <= 256; x += 14) {
          const offset = Math.sin((x / 256) * Math.PI * 4 + (y / 18)) * 8;
          bCtx.lineTo(x, y + 4 + offset);
        }
        bCtx.stroke();

        bCtx.strokeStyle = '#ffffff';
        bCtx.lineWidth = 4;
        bCtx.beginPath();
        bCtx.moveTo(0, y - 1);
        for (let x = 0; x <= 256; x += 14) {
          const offset = Math.sin((x / 256) * Math.PI * 4 + (y / 18)) * 8;
          bCtx.lineTo(x, y - 1 + offset);
        }
        bCtx.stroke();
      }

      result.mucosaBump = new THREE.CanvasTexture(bumpCanvas);
      result.mucosaBump.wrapS = THREE.RepeatWrapping;
      result.mucosaBump.wrapT = THREE.RepeatWrapping;
    }

    // ========================================================
    // 5. TÁ TRÀNG (DUODENUM) — REFERENCE FIGURE 1
    // ========================================================
    {
      // 5A. Duodenum Serosa
      const canvas = createCanvas(256);
      const ctx = canvas.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 256, 256);
      grad.addColorStop(0, '#ea580c');
      grad.addColorStop(0.5, '#f97316');
      grad.addColorStop(1, '#fdba74');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);
      // Fine capillary net
      ctx.strokeStyle = 'rgba(154, 52, 18, 0.3)';
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 20; i++) {
        ctx.beginPath();
        let x = Math.random() * 256, y = Math.random() * 256;
        ctx.moveTo(x, y);
        for (let j = 0; j < 3; j++) {
          x += (Math.random() - 0.5) * 40;
          y += (Math.random() - 0.5) * 40;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      result.duodenumSerosaTexture = new THREE.CanvasTexture(canvas);
      result.duodenumSerosaTexture.wrapS = THREE.RepeatWrapping;
      result.duodenumSerosaTexture.wrapT = THREE.RepeatWrapping;

      // 5B. Duodenum Outer Longitudinal Muscle
      const canvasLM = createCanvas(512);
      const ctxLM = canvasLM.getContext('2d');
      const gradLM = ctxLM.createLinearGradient(0, 0, 512, 0);
      gradLM.addColorStop(0, '#9a3412');
      gradLM.addColorStop(0.5, '#c2410c');
      gradLM.addColorStop(1, '#7c2d12');
      ctxLM.fillStyle = gradLM;
      ctxLM.fillRect(0, 0, 512, 512);
      ctxLM.lineWidth = 1.4;
      for (let x = 0; x < 512; x += 4) {
        ctxLM.strokeStyle = Math.random() > 0.4 ? 'rgba(251, 146, 60, 0.55)' : 'rgba(124, 45, 18, 0.65)';
        ctxLM.beginPath();
        ctxLM.moveTo(x, 0);
        ctxLM.lineTo(x + (Math.random() - 0.5) * 2, 512);
        ctxLM.stroke();
      }
      result.duodenumLongitudinalMuscleTexture = new THREE.CanvasTexture(canvasLM);
      result.duodenumLongitudinalMuscleTexture.wrapS = THREE.RepeatWrapping;
      result.duodenumLongitudinalMuscleTexture.wrapT = THREE.RepeatWrapping;

      const bumpLM = createCanvas(256);
      const bCtxLM = bumpLM.getContext('2d');
      bCtxLM.fillStyle = '#808080';
      bCtxLM.fillRect(0, 0, 256, 256);
      bCtxLM.lineWidth = 2.0;
      for (let x = 0; x < 256; x += 4) {
        bCtxLM.strokeStyle = (x % 8 === 0) ? '#e2e8f0' : '#1e293b';
        bCtxLM.beginPath();
        bCtxLM.moveTo(x, 0);
        bCtxLM.lineTo(x, 256);
        bCtxLM.stroke();
      }
      result.duodenumLongitudinalMuscleBump = new THREE.CanvasTexture(bumpLM);
      result.duodenumLongitudinalMuscleBump.wrapS = THREE.RepeatWrapping;
      result.duodenumLongitudinalMuscleBump.wrapT = THREE.RepeatWrapping;

      // 5C. Duodenum Inner Circular Muscle
      const canvasCM = createCanvas(512);
      const ctxCM = canvasCM.getContext('2d');
      const gradCM = ctxCM.createLinearGradient(0, 0, 0, 512);
      gradCM.addColorStop(0, '#7c2d12');
      gradCM.addColorStop(0.5, '#9a3412');
      gradCM.addColorStop(1, '#431407');
      ctxCM.fillStyle = gradCM;
      ctxCM.fillRect(0, 0, 512, 512);
      ctxCM.lineWidth = 1.6;
      for (let y = 0; y < 512; y += 4) {
        ctxCM.strokeStyle = Math.random() > 0.4 ? 'rgba(251, 146, 60, 0.5)' : 'rgba(67, 20, 7, 0.7)';
        ctxCM.beginPath();
        ctxCM.moveTo(0, y);
        ctxCM.lineTo(512, y + (Math.random() - 0.5) * 2);
        ctxCM.stroke();
      }
      result.duodenumCircularMuscleTexture = new THREE.CanvasTexture(canvasCM);
      result.duodenumCircularMuscleTexture.wrapS = THREE.RepeatWrapping;
      result.duodenumCircularMuscleTexture.wrapT = THREE.RepeatWrapping;

      const bumpCM = createCanvas(256);
      const bCtxCM = bumpCM.getContext('2d');
      bCtxCM.fillStyle = '#808080';
      bCtxCM.fillRect(0, 0, 256, 256);
      bCtxCM.lineWidth = 2.2;
      for (let y = 0; y < 256; y += 4) {
        bCtxCM.strokeStyle = (y % 8 === 0) ? '#f8fafc' : '#0f172a';
        bCtxCM.beginPath();
        bCtxCM.moveTo(0, y);
        bCtxCM.lineTo(256, y);
        bCtxCM.stroke();
      }
      result.duodenumCircularMuscleBump = new THREE.CanvasTexture(bumpCM);
      result.duodenumCircularMuscleBump.wrapS = THREE.RepeatWrapping;
      result.duodenumCircularMuscleBump.wrapT = THREE.RepeatWrapping;

      // 5D. Duodenum Submucosa with Brunner's Glands (Figure 1: studded granular nodules)
      const canvasSub = createCanvas(512);
      const ctxSub = canvasSub.getContext('2d');
      const gradSub = ctxSub.createLinearGradient(0, 0, 512, 512);
      gradSub.addColorStop(0, '#ffedd5');
      gradSub.addColorStop(0.5, '#fed7aa');
      gradSub.addColorStop(1, '#fde68a');
      ctxSub.fillStyle = gradSub;
      ctxSub.fillRect(0, 0, 512, 512);

      // Brunner's Gland Nodules (Chùm tuyến Brunner dạng hạt lấm tấm màu nâu cam như hình 1)
      for (let i = 0; i < 280; i++) {
        const gx = Math.random() * 512;
        const gy = Math.random() * 512;
        const gr = Math.random() * 4 + 2;
        const bGrad = ctxSub.createRadialGradient(gx, gy, 0, gx, gy, gr);
        bGrad.addColorStop(0, '#b45309');
        bGrad.addColorStop(0.7, '#d97706');
        bGrad.addColorStop(1, 'rgba(217, 119, 6, 0)');
        ctxSub.fillStyle = bGrad;
        ctxSub.beginPath();
        ctxSub.arc(gx, gy, gr, 0, Math.PI * 2);
        ctxSub.fill();
      }
      // Micro-vessels
      ctxSub.strokeStyle = 'rgba(220, 38, 38, 0.45)';
      ctxSub.lineWidth = 1.2;
      for (let i = 0; i < 15; i++) {
        ctxSub.beginPath();
        let vx = Math.random() * 512, vy = Math.random() * 512;
        ctxSub.moveTo(vx, vy);
        for (let k = 0; k < 3; k++) {
          vx += (Math.random() - 0.5) * 50;
          vy += (Math.random() - 0.5) * 50;
          ctxSub.lineTo(vx, vy);
        }
        ctxSub.stroke();
      }
      result.duodenumSubmucosaTexture = new THREE.CanvasTexture(canvasSub);
      result.duodenumSubmucosaTexture.wrapS = THREE.RepeatWrapping;
      result.duodenumSubmucosaTexture.wrapT = THREE.RepeatWrapping;

      // Brunner's Bump map (Cobblestone granular relief)
      const bumpSub = createCanvas(256);
      const bCtxSub = bumpSub.getContext('2d');
      bCtxSub.fillStyle = '#808080';
      bCtxSub.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 200; i++) {
        const gx = Math.random() * 256;
        const gy = Math.random() * 256;
        const gr = Math.random() * 3 + 1.5;
        const rad = bCtxSub.createRadialGradient(gx, gy, 0, gx, gy, gr);
        rad.addColorStop(0, '#ffffff');
        rad.addColorStop(1, '#808080');
        bCtxSub.fillStyle = rad;
        bCtxSub.beginPath();
        bCtxSub.arc(gx, gy, gr, 0, Math.PI * 2);
        bCtxSub.fill();
      }
      result.duodenumSubmucosaBump = new THREE.CanvasTexture(bumpSub);
      result.duodenumSubmucosaBump.wrapS = THREE.RepeatWrapping;
      result.duodenumSubmucosaBump.wrapT = THREE.RepeatWrapping;

      // 5E. Duodenum Mucosa with Circular Kerckring Folds
      const canvasMuc = createCanvas(512);
      const ctxMuc = canvasMuc.getContext('2d');
      ctxMuc.fillStyle = '#c2410c';
      ctxMuc.fillRect(0, 0, 512, 512);
      for (let y = 16; y < 512; y += 32) {
        ctxMuc.strokeStyle = '#ea580c';
        ctxMuc.lineWidth = 14;
        ctxMuc.beginPath();
        ctxMuc.moveTo(0, y);
        for (let x = 0; x <= 512; x += 32) {
          ctxMuc.lineTo(x, y + Math.sin((x / 512) * Math.PI * 6) * 6);
        }
        ctxMuc.stroke();

        ctxMuc.strokeStyle = '#ffedd5';
        ctxMuc.lineWidth = 3.5;
        ctxMuc.beginPath();
        ctxMuc.moveTo(0, y - 2);
        for (let x = 0; x <= 512; x += 32) {
          ctxMuc.lineTo(x, y - 2 + Math.sin((x / 512) * Math.PI * 6) * 6);
        }
        ctxMuc.stroke();
      }
      result.duodenumMucosaTexture = new THREE.CanvasTexture(canvasMuc);
      result.duodenumMucosaTexture.wrapS = THREE.RepeatWrapping;
      result.duodenumMucosaTexture.wrapT = THREE.RepeatWrapping;

      const bumpMuc = createCanvas(256);
      const bCtxMuc = bumpMuc.getContext('2d');
      bCtxMuc.fillStyle = '#808080';
      bCtxMuc.fillRect(0, 0, 256, 256);
      for (let y = 8; y < 256; y += 16) {
        bCtxMuc.strokeStyle = '#ffffff';
        bCtxMuc.lineWidth = 5;
        bCtxMuc.beginPath();
        bCtxMuc.moveTo(0, y);
        for (let x = 0; x <= 256; x += 16) {
          bCtxMuc.lineTo(x, y + Math.sin((x / 256) * Math.PI * 6) * 3);
        }
        bCtxMuc.stroke();
        bCtxMuc.strokeStyle = '#101010';
        bCtxMuc.lineWidth = 5;
        bCtxMuc.beginPath();
        bCtxMuc.moveTo(0, y + 6);
        for (let x = 0; x <= 256; x += 16) {
          bCtxMuc.lineTo(x, y + 6 + Math.sin((x / 256) * Math.PI * 6) * 3);
        }
        bCtxMuc.stroke();
      }
      result.duodenumMucosaBump = new THREE.CanvasTexture(bumpMuc);
      result.duodenumMucosaBump.wrapS = THREE.RepeatWrapping;
      result.duodenumMucosaBump.wrapT = THREE.RepeatWrapping;
    }

    // ========================================================
    // 6. RUỘT NON (SMALL INTESTINE) — REFERENCE FIGURE 2
    // ========================================================
    {
      // 6A. Small Intestine Serosa
      const canvas = createCanvas(256);
      const ctx = canvas.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 256, 256);
      grad.addColorStop(0, '#fb7185');
      grad.addColorStop(0.5, '#fda4af');
      grad.addColorStop(1, '#f43f5e');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);
      result.siSerosaTexture = new THREE.CanvasTexture(canvas);
      result.siSerosaTexture.wrapS = THREE.RepeatWrapping;
      result.siSerosaTexture.wrapT = THREE.RepeatWrapping;

      // 6B. Small Intestine Longitudinal Muscle (Figure 2: orange-red longitudinal stripes)
      const canvasLM = createCanvas(512);
      const ctxLM = canvasLM.getContext('2d');
      ctxLM.fillStyle = '#b91c1c';
      ctxLM.fillRect(0, 0, 512, 512);
      ctxLM.lineWidth = 1.6;
      for (let x = 0; x < 512; x += 4) {
        ctxLM.strokeStyle = (x % 8 === 0) ? '#f87171' : '#7f1d1d';
        ctxLM.beginPath();
        ctxLM.moveTo(x, 0);
        ctxLM.lineTo(x, 512);
        ctxLM.stroke();
      }
      result.siLongitudinalMuscleTexture = new THREE.CanvasTexture(canvasLM);
      result.siLongitudinalMuscleTexture.wrapS = THREE.RepeatWrapping;
      result.siLongitudinalMuscleTexture.wrapT = THREE.RepeatWrapping;
      result.siLongitudinalMuscleBump = result.duodenumLongitudinalMuscleBump;

      // 6C. Small Intestine Circular Muscle with Myenteric Auerbach Plexus (Figure 2: white nerve plexus & red ganglia)
      const canvasCM = createCanvas(512);
      const ctxCM = canvasCM.getContext('2d');
      ctxCM.fillStyle = '#991b1b';
      ctxCM.fillRect(0, 0, 512, 512);
      // Circular muscle ribs
      ctxCM.lineWidth = 1.8;
      for (let y = 0; y < 512; y += 5) {
        ctxCM.strokeStyle = (y % 10 === 0) ? '#ef4444' : '#5c0d0d';
        ctxCM.beginPath();
        ctxCM.moveTo(0, y);
        ctxCM.lineTo(512, y);
        ctxCM.stroke();
      }
      // Myenteric Auerbach Nerve Plexus (Lưới thần kinh trắng ngà & hạch đỏ như Figure 2)
      ctxCM.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctxCM.lineWidth = 1.8;
      for (let i = 0; i < 18; i++) {
        let nx = Math.random() * 512, ny = Math.random() * 512;
        ctxCM.beginPath();
        ctxCM.moveTo(nx, ny);
        for (let j = 0; j < 4; j++) {
          nx += (Math.random() - 0.5) * 60;
          ny += (Math.random() - 0.5) * 60;
          ctxCM.lineTo(nx, ny);
        }
        ctxCM.stroke();
        // Red ganglion knot
        ctxCM.fillStyle = '#dc2626';
        ctxCM.beginPath();
        ctxCM.arc(nx, ny, 3.5, 0, Math.PI * 2);
        ctxCM.fill();
      }
      result.siCircularMuscleTexture = new THREE.CanvasTexture(canvasCM);
      result.siCircularMuscleTexture.wrapS = THREE.RepeatWrapping;
      result.siCircularMuscleTexture.wrapT = THREE.RepeatWrapping;
      result.siCircularMuscleBump = result.duodenumCircularMuscleBump;

      // 6D. Small Intestine Submucosa (Figure 2: white/silver fibrous grid)
      const canvasSub = createCanvas(512);
      const ctxSub = canvasSub.getContext('2d');
      ctxSub.fillStyle = '#f8fafc';
      ctxSub.fillRect(0, 0, 512, 512);
      // Fibrous collagen lattice grid
      ctxSub.strokeStyle = '#cbd5e1';
      ctxSub.lineWidth = 1.2;
      for (let x = 0; x < 512; x += 32) {
        ctxSub.beginPath(); ctxSub.moveTo(x, 0); ctxSub.lineTo(x + 20, 512); ctxSub.stroke();
      }
      for (let y = 0; y < 512; y += 32) {
        ctxSub.beginPath(); ctxSub.moveTo(0, y); ctxSub.lineTo(512, y + 20); ctxSub.stroke();
      }
      result.siSubmucosaTexture = new THREE.CanvasTexture(canvasSub);
      result.siSubmucosaTexture.wrapS = THREE.RepeatWrapping;
      result.siSubmucosaTexture.wrapT = THREE.RepeatWrapping;
      result.siSubmucosaBump = result.duodenumSubmucosaBump;

      // 6E. Small Intestine Mucosa & Villi (Figure 2: yellow velvety villi surface)
      const canvasMuc = createCanvas(512);
      const ctxMuc = canvasMuc.getContext('2d');
      ctxMuc.fillStyle = '#eab308';
      ctxMuc.fillRect(0, 0, 512, 512);
      // Micro-villi stippling (nhung mao ruột phủ mịn)
      for (let i = 0; i < 450; i++) {
        const vx = Math.random() * 512, vy = Math.random() * 512;
        ctxMuc.fillStyle = Math.random() > 0.5 ? '#fde047' : '#ca8a04';
        ctxMuc.beginPath();
        ctxMuc.arc(vx, vy, Math.random() * 2.5 + 1, 0, Math.PI * 2);
        ctxMuc.fill();
      }
      result.siMucosaTexture = new THREE.CanvasTexture(canvasMuc);
      result.siMucosaTexture.wrapS = THREE.RepeatWrapping;
      result.siMucosaTexture.wrapT = THREE.RepeatWrapping;

      const bumpMuc = createCanvas(256);
      const bCtxMuc = bumpMuc.getContext('2d');
      bCtxMuc.fillStyle = '#808080';
      bCtxMuc.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 350; i++) {
        const vx = Math.random() * 256, vy = Math.random() * 256;
        bCtxMuc.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#202020';
        bCtxMuc.beginPath();
        bCtxMuc.arc(vx, vy, 1.8, 0, Math.PI * 2);
        bCtxMuc.fill();
      }
      result.siMucosaBump = new THREE.CanvasTexture(bumpMuc);
      result.siMucosaBump.wrapS = THREE.RepeatWrapping;
      result.siMucosaBump.wrapT = THREE.RepeatWrapping;
    }

    // ========================================================
    // 7. RUỘT GIÀ / ĐẠI TRÀNG (COLON) — REFERENCE FIGURE 3
    // ========================================================
    {
      // 7A. Colon Serosa (with epiploic fat tags / bọng mỡ mạc nối)
      const canvas = createCanvas(512);
      const ctx = canvas.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 512, 512);
      grad.addColorStop(0, '#84cc16');
      grad.addColorStop(0.5, '#a3e635');
      grad.addColorStop(1, '#65a30d');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);
      // Soft fat appendages (túi mỡ mạc nối màu vàng nhạt)
      for (let i = 0; i < 18; i++) {
        const fx = Math.random() * 512, fy = Math.random() * 512;
        const fGrad = ctx.createRadialGradient(fx, fy, 0, fx, fy, 22);
        fGrad.addColorStop(0, 'rgba(254, 240, 138, 0.75)');
        fGrad.addColorStop(0.7, 'rgba(234, 179, 8, 0.35)');
        fGrad.addColorStop(1, 'rgba(234, 179, 8, 0)');
        ctx.fillStyle = fGrad;
        ctx.beginPath();
        ctx.arc(fx, fy, 22, 0, Math.PI * 2);
        ctx.fill();
      }
      result.colonSerosaTexture = new THREE.CanvasTexture(canvas);
      result.colonSerosaTexture.wrapS = THREE.RepeatWrapping;
      result.colonSerosaTexture.wrapT = THREE.RepeatWrapping;

      // 7B. Colon Longitudinal Muscle with Taeniae Coli (Figure 3: warm muscular terracotta with 3 longitudinal bands)
      const canvasLM = createCanvas(512);
      const ctxLM = canvasLM.getContext('2d');
      ctxLM.fillStyle = '#b91c1c';
      ctxLM.fillRect(0, 0, 512, 512);
      // Background longitudinal muscle fibers
      ctxLM.lineWidth = 1.4;
      for (let x = 0; x < 512; x += 4) {
        ctxLM.strokeStyle = x % 8 === 0 ? 'rgba(252, 165, 165, 0.42)' : 'rgba(127, 29, 29, 0.45)';
        ctxLM.beginPath(); ctxLM.moveTo(x, 0); ctxLM.lineTo(x, 512); ctxLM.stroke();
      }
      // TAENIAE COLI (3 Dải cơ dọc nổi gờ màu vàng kem sáng rõ trên nền cơ dọc)
      for (const tx of [128, 256, 384]) {
        const tGrad = ctxLM.createLinearGradient(tx - 32, 0, tx + 32, 0);
        tGrad.addColorStop(0, 'rgba(253, 224, 71, 0)');
        tGrad.addColorStop(0.2, 'rgba(253, 224, 71, 0.75)');
        tGrad.addColorStop(0.5, '#fef08a');
        tGrad.addColorStop(0.8, 'rgba(253, 224, 71, 0.75)');
        tGrad.addColorStop(1, 'rgba(253, 224, 71, 0)');
        ctxLM.fillStyle = tGrad;
        ctxLM.fillRect(tx - 32, 0, 64, 512);
        // Dense longitudinal muscle bundle striations inside taenia
        ctxLM.strokeStyle = 'rgba(180, 83, 9, 0.65)';
        ctxLM.lineWidth = 1.4;
        for (let ix = tx - 22; ix <= tx + 22; ix += 5) {
          ctxLM.beginPath(); ctxLM.moveTo(ix, 0); ctxLM.lineTo(ix, 512); ctxLM.stroke();
        }
      }
      result.colonLongitudinalMuscleTexture = new THREE.CanvasTexture(canvasLM);
      result.colonLongitudinalMuscleTexture.wrapS = THREE.RepeatWrapping;
      result.colonLongitudinalMuscleTexture.wrapT = THREE.RepeatWrapping;

      const bumpLM = createCanvas(256);
      const bCtxLM = bumpLM.getContext('2d');
      bCtxLM.fillStyle = '#808080';
      bCtxLM.fillRect(0, 0, 256, 256);
      for (const tx of [64, 128, 192]) {
        const rGrad = bCtxLM.createLinearGradient(tx - 15, 0, tx + 15, 0);
        rGrad.addColorStop(0, '#808080');
        rGrad.addColorStop(0.5, '#ffffff');
        rGrad.addColorStop(1, '#808080');
        bCtxLM.fillStyle = rGrad;
        bCtxLM.fillRect(tx - 15, 0, 30, 256);
      }
      result.colonLongitudinalMuscleBump = new THREE.CanvasTexture(bumpLM);
      result.colonLongitudinalMuscleBump.wrapS = THREE.RepeatWrapping;
      result.colonLongitudinalMuscleBump.wrapT = THREE.RepeatWrapping;

      // 7C. Colon Circular Muscle & Haustra Folds (Figure 3: warm salmon-terracotta circumferential muscle rings)
      const canvasCM = createCanvas(512);
      const ctxCM = canvasCM.getContext('2d');
      ctxCM.fillStyle = '#9a3412';
      ctxCM.fillRect(0, 0, 512, 512);
      // Fine circumferential smooth muscle fibers
      for (let y = 0; y < 512; y += 4) {
        ctxCM.strokeStyle = y % 8 === 0 ? 'rgba(253, 186, 116, 0.48)' : 'rgba(67, 20, 7, 0.45)';
        ctxCM.lineWidth = 1.6;
        ctxCM.beginPath(); ctxCM.moveTo(0, y); ctxCM.lineTo(512, y); ctxCM.stroke();
      }
      // Haustral groove rings every 64px
      for (let y = 0; y < 512; y += 64) {
        ctxCM.fillStyle = 'rgba(67, 20, 7, 0.45)';
        ctxCM.fillRect(0, y + 24, 512, 14);
        ctxCM.fillStyle = 'rgba(251, 146, 60, 0.40)';
        ctxCM.fillRect(0, y, 512, 16);
      }
      result.colonCircularMuscleTexture = new THREE.CanvasTexture(canvasCM);
      result.colonCircularMuscleTexture.wrapS = THREE.RepeatWrapping;
      result.colonCircularMuscleTexture.wrapT = THREE.RepeatWrapping;

      const bumpCM = createCanvas(256);
      const bCtxCM = bumpCM.getContext('2d');
      bCtxCM.fillStyle = '#808080';
      bCtxCM.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 32) {
        bCtxCM.strokeStyle = '#ffffff';
        bCtxCM.lineWidth = 10;
        bCtxCM.beginPath(); bCtxCM.moveTo(0, y); bCtxCM.lineTo(256, y); bCtxCM.stroke();
        bCtxCM.strokeStyle = '#101010';
        bCtxCM.lineWidth = 10;
        bCtxCM.beginPath(); bCtxCM.moveTo(0, y + 16); bCtxCM.lineTo(256, y + 16); bCtxCM.stroke();
      }
      result.colonCircularMuscleBump = new THREE.CanvasTexture(bumpCM);
      result.colonCircularMuscleBump.wrapS = THREE.RepeatWrapping;
      result.colonCircularMuscleBump.wrapT = THREE.RepeatWrapping;

      // 7D. Colon Submucosa (Silvery-pearl connective tissue with submucosal vascular plexus)
      const canvasSub = createCanvas(512);
      const ctxSub = canvasSub.getContext('2d');
      ctxSub.fillStyle = '#f1f5f9';
      ctxSub.fillRect(0, 0, 512, 512);
      // Submucosal arterioles and venules
      for (let i = 0; i < 40; i++) {
        ctxSub.strokeStyle = i % 2 === 0 ? 'rgba(225, 29, 72, 0.35)' : 'rgba(37, 99, 235, 0.30)';
        ctxSub.lineWidth = 1.5;
        ctxSub.beginPath();
        let vx = Math.random() * 512, vy = Math.random() * 512;
        ctxSub.moveTo(vx, vy);
        for (let s = 0; s < 4; s++) {
          vx += (Math.random() - 0.5) * 50;
          vy += (Math.random() - 0.5) * 50;
          ctxSub.lineTo(vx, vy);
        }
        ctxSub.stroke();
      }
      // Lymphoid solitary nodules
      for (let i = 0; i < 45; i++) {
        ctxSub.fillStyle = 'rgba(192, 132, 252, 0.45)';
        ctxSub.beginPath();
        ctxSub.arc(Math.random() * 512, Math.random() * 512, 4, 0, Math.PI * 2);
        ctxSub.fill();
      }
      result.colonSubmucosaTexture = new THREE.CanvasTexture(canvasSub);
      result.colonSubmucosaTexture.wrapS = THREE.RepeatWrapping;
      result.colonSubmucosaTexture.wrapT = THREE.RepeatWrapping;
      result.colonSubmucosaBump = result.duodenumSubmucosaBump;

      // 7E. Colon Mucosa with Plicae Semilunares (Figure 3: velvety rose-pink mucosa with subtle crescent folds)
      const canvasMuc = createCanvas(512);
      const ctxMuc = canvasMuc.getContext('2d');
      const gradMuc = ctxMuc.createLinearGradient(0, 0, 0, 512);
      gradMuc.addColorStop(0, '#e11d48');
      gradMuc.addColorStop(0.5, '#f43f5e');
      gradMuc.addColorStop(1, '#be123c');
      ctxMuc.fillStyle = gradMuc;
      ctxMuc.fillRect(0, 0, 512, 512);
      // Soft Plicae semilunares crescent folds (nếp gấp bán nguyệt mềm mại)
      for (let y = 30; y < 512; y += 64) {
        ctxMuc.strokeStyle = 'rgba(254, 205, 211, 0.55)';
        ctxMuc.lineWidth = 9;
        ctxMuc.beginPath();
        ctxMuc.moveTo(0, y);
        for (let x = 0; x <= 512; x += 32) {
          ctxMuc.lineTo(x, y + Math.sin((x / 512) * Math.PI * 4) * 8);
        }
        ctxMuc.stroke();

        ctxMuc.strokeStyle = 'rgba(136, 19, 55, 0.45)';
        ctxMuc.lineWidth = 6;
        ctxMuc.beginPath();
        ctxMuc.moveTo(0, y + 10);
        for (let x = 0; x <= 512; x += 32) {
          ctxMuc.lineTo(x, y + 10 + Math.sin((x / 512) * Math.PI * 4) * 8);
        }
        ctxMuc.stroke();
      }
      result.colonMucosaTexture = new THREE.CanvasTexture(canvasMuc);
      result.colonMucosaTexture.wrapS = THREE.RepeatWrapping;
      result.colonMucosaTexture.wrapT = THREE.RepeatWrapping;

      const bumpMuc = createCanvas(256);
      const bCtxMuc = bumpMuc.getContext('2d');
      bCtxMuc.fillStyle = '#808080';
      bCtxMuc.fillRect(0, 0, 256, 256);
      for (let y = 15; y < 256; y += 32) {
        bCtxMuc.strokeStyle = '#ffffff';
        bCtxMuc.lineWidth = 8;
        bCtxMuc.beginPath();
        bCtxMuc.moveTo(0, y);
        for (let x = 0; x <= 256; x += 16) {
          bCtxMuc.lineTo(x, y + Math.sin((x / 256) * Math.PI * 4) * 7);
        }
        bCtxMuc.stroke();
        bCtxMuc.strokeStyle = '#101010';
        bCtxMuc.lineWidth = 8;
        bCtxMuc.beginPath();
        bCtxMuc.moveTo(0, y + 8);
        for (let x = 0; x <= 256; x += 16) {
          bCtxMuc.lineTo(x, y + 8 + Math.sin((x / 256) * Math.PI * 4) * 7);
        }
        bCtxMuc.stroke();
      }
      result.colonMucosaBump = new THREE.CanvasTexture(bumpMuc);
      result.colonMucosaBump.wrapS = THREE.RepeatWrapping;
      result.colonMucosaBump.wrapT = THREE.RepeatWrapping;
    }

    // =========================================================================
    // 8. TÚI MẬT (GALLBLADDER - 4 HISTOLOGICAL LAYERS MATCHING REFERENCE IMG 3)
    // =========================================================================
    {
      // 8A. Gallbladder Serosa & Perimuscular Fibrous Tissue (Outer green-olive sheen + fibrous mesh)
      const canvasSer = createCanvas(256);
      const ctxSer = canvasSer.getContext('2d');
      const gradSer = ctxSer.createLinearGradient(0, 0, 256, 256);
      gradSer.addColorStop(0, '#65a30d');
      gradSer.addColorStop(0.5, '#84cc16');
      gradSer.addColorStop(1, '#4d7c0f');
      ctxSer.fillStyle = gradSer;
      ctxSer.fillRect(0, 0, 256, 256);

      // Perimuscular fibrous connective strands
      ctxSer.strokeStyle = 'rgba(236, 252, 203, 0.35)';
      ctxSer.lineWidth = 1.2;
      for (let i = 0; i < 45; i++) {
        ctxSer.beginPath();
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        ctxSer.moveTo(x, y);
        ctxSer.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 60);
        ctxSer.stroke();
      }
      result.gbSerosaTexture = new THREE.CanvasTexture(canvasSer);
      result.gbSerosaTexture.wrapS = THREE.RepeatWrapping;
      result.gbSerosaTexture.wrapT = THREE.RepeatWrapping;

      // 8B. Gallbladder Muscular Layer (Crisscrossing longitudinal, circular, oblique smooth muscle bundles)
      const canvasMus = createCanvas(512);
      const ctxMus = canvasMus.getContext('2d');
      ctxMus.fillStyle = '#be123c';
      ctxMus.fillRect(0, 0, 512, 512);
      for (let i = -512; i < 512; i += 8) {
        ctxMus.strokeStyle = 'rgba(251, 113, 133, 0.45)';
        ctxMus.lineWidth = 2.0;
        ctxMus.beginPath();
        ctxMus.moveTo(i, 0);
        ctxMus.lineTo(i + 512, 512);
        ctxMus.stroke();

        ctxMus.strokeStyle = 'rgba(136, 19, 55, 0.55)';
        ctxMus.beginPath();
        ctxMus.moveTo(i + 512, 0);
        ctxMus.lineTo(i, 512);
        ctxMus.stroke();
      }
      result.gbMuscleTexture = new THREE.CanvasTexture(canvasMus);
      result.gbMuscleTexture.wrapS = THREE.RepeatWrapping;
      result.gbMuscleTexture.wrapT = THREE.RepeatWrapping;
      result.gbMuscleBump = result.obliqueMuscleBump;

      // 8C. Gallbladder Lamina Propria / Submucosa (Light pink connective tissue + rich capillaries)
      const canvasLP = createCanvas(512);
      const ctxLP = canvasLP.getContext('2d');
      ctxLP.fillStyle = '#ffe4e6';
      ctxLP.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 60; i++) {
        ctxLP.strokeStyle = i % 2 === 0 ? 'rgba(225, 29, 72, 0.45)' : 'rgba(37, 99, 235, 0.35)';
        ctxLP.lineWidth = 1.5;
        ctxLP.beginPath();
        let x = Math.random() * 512;
        let y = Math.random() * 512;
        ctxLP.moveTo(x, y);
        for (let s = 0; s < 4; s++) {
          x += (Math.random() - 0.5) * 45;
          y += (Math.random() - 0.5) * 45;
          ctxLP.lineTo(x, y);
        }
        ctxLP.stroke();
      }
      result.gbSubmucosaTexture = new THREE.CanvasTexture(canvasLP);
      result.gbSubmucosaTexture.wrapS = THREE.RepeatWrapping;
      result.gbSubmucosaTexture.wrapT = THREE.RepeatWrapping;
      result.gbSubmucosaBump = result.submucosaBump;

      // 8D. Gallbladder Epithelium / Mucosa (Honeycomb polygonal rugae folds matching Image 3)
      const canvasGbMuc = createCanvas(512);
      const ctxGbMuc = canvasGbMuc.getContext('2d');
      ctxGbMuc.fillStyle = '#881337';
      ctxGbMuc.fillRect(0, 0, 512, 512);

      const bumpGbMuc = createCanvas(256);
      const bCtxGbMuc = bumpGbMuc.getContext('2d');
      bCtxGbMuc.fillStyle = '#202020';
      bCtxGbMuc.fillRect(0, 0, 256, 256);

      // Draw honeycomb mucosal ridges
      const hexR = 28;
      for (let row = 0; row < 22; row++) {
        for (let col = 0; col < 22; col++) {
          const cx = col * hexR * 1.65 + (row % 2) * hexR * 0.82;
          const cy = row * hexR * 1.45;
          ctxGbMuc.strokeStyle = '#fda4af';
          ctxGbMuc.lineWidth = 5.5;
          ctxGbMuc.beginPath();
          for (let k = 0; k < 6; k++) {
            const ang = (k * Math.PI) / 3;
            const vx = cx + Math.cos(ang) * hexR * 0.85;
            const vy = cy + Math.sin(ang) * hexR * 0.85;
            if (k === 0) ctxGbMuc.moveTo(vx, vy);
            else ctxGbMuc.lineTo(vx, vy);
          }
          ctxGbMuc.closePath();
          ctxGbMuc.stroke();

          bCtxGbMuc.strokeStyle = '#ffffff';
          bCtxGbMuc.lineWidth = 3.5;
          bCtxGbMuc.beginPath();
          for (let k = 0; k < 6; k++) {
            const ang = (k * Math.PI) / 3;
            const vx = (cx * 0.5) + Math.cos(ang) * (hexR * 0.42);
            const vy = (cy * 0.5) + Math.sin(ang) * (hexR * 0.42);
            if (k === 0) bCtxGbMuc.moveTo(vx, vy);
            else bCtxGbMuc.lineTo(vx, vy);
          }
          bCtxGbMuc.closePath();
          bCtxGbMuc.stroke();
        }
      }
      result.gbMucosaTexture = new THREE.CanvasTexture(canvasGbMuc);
      result.gbMucosaTexture.wrapS = THREE.RepeatWrapping;
      result.gbMucosaTexture.wrapT = THREE.RepeatWrapping;
      result.gbMucosaBump = new THREE.CanvasTexture(bumpGbMuc);
      result.gbMucosaBump.wrapS = THREE.RepeatWrapping;
      result.gbMucosaBump.wrapT = THREE.RepeatWrapping;
    }

    // =========================================================================
    // 9. THỰC QUẢN (ESOPHAGUS - 5 HISTOLOGICAL LAYERS)
    // =========================================================================
    {
      // 9A. Esophagus Adventitia (Loose fibrous outer coat)
      const canvasAdv = createCanvas(256);
      const ctxAdv = canvasAdv.getContext('2d');
      const gradAdv = ctxAdv.createLinearGradient(0, 0, 256, 256);
      gradAdv.addColorStop(0, '#fbcfe8');
      gradAdv.addColorStop(0.5, '#f9a8d4');
      gradAdv.addColorStop(1, '#f472b6');
      ctxAdv.fillStyle = gradAdv;
      ctxAdv.fillRect(0, 0, 256, 256);
      ctxAdv.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctxAdv.lineWidth = 1.2;
      for (let i = 0; i < 40; i++) {
        ctxAdv.beginPath();
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        ctxAdv.moveTo(x, y);
        ctxAdv.lineTo(x + (Math.random() - 0.5) * 45, y + (Math.random() - 0.5) * 45);
        ctxAdv.stroke();
      }
      result.esoAdventitiaTexture = new THREE.CanvasTexture(canvasAdv);
      result.esoAdventitiaTexture.wrapS = THREE.RepeatWrapping;
      result.esoAdventitiaTexture.wrapT = THREE.RepeatWrapping;

      // 9B & 9C. Esophagus Longitudinal & Circular Muscle (Reuse high-contrast muscle fibers)
      result.esoLongitudinalMuscleTexture = result.longitudinalMuscleTexture;
      result.esoLongitudinalMuscleBump = result.longitudinalMuscleBump;
      result.esoCircularMuscleTexture = result.circularMuscleTexture;
      result.esoCircularMuscleBump = result.circularMuscleBump;

      // 9D. Esophagus Submucosa with Esophageal Glands & Venous Plexus
      result.esoSubmucosaTexture = result.submucosaTexture;
      result.esoSubmucosaBump = result.submucosaBump;

      // 9E. Esophagus Mucosa (Non-keratinized Stratified Squamous pale pink longitudinal folds)
      const canvasEsoMuc = createCanvas(512);
      const ctxEsoMuc = canvasEsoMuc.getContext('2d');
      ctxEsoMuc.fillStyle = '#fda4af';
      ctxEsoMuc.fillRect(0, 0, 512, 512);
      for (let x = 16; x < 512; x += 32) {
        ctxEsoMuc.strokeStyle = '#ffe4e6';
        ctxEsoMuc.lineWidth = 10;
        ctxEsoMuc.beginPath();
        ctxEsoMuc.moveTo(x, 0);
        for (let y = 0; y <= 512; y += 32) {
          ctxEsoMuc.lineTo(x + Math.sin((y / 512) * Math.PI * 4) * 5, y);
        }
        ctxEsoMuc.stroke();

        ctxEsoMuc.strokeStyle = '#e11d48';
        ctxEsoMuc.lineWidth = 4;
        ctxEsoMuc.beginPath();
        ctxEsoMuc.moveTo(x + 10, 0);
        for (let y = 0; y <= 512; y += 32) {
          ctxEsoMuc.lineTo(x + 10 + Math.sin((y / 512) * Math.PI * 4) * 5, y);
        }
        ctxEsoMuc.stroke();
      }
      result.esoMucosaTexture = new THREE.CanvasTexture(canvasEsoMuc);
      result.esoMucosaTexture.wrapS = THREE.RepeatWrapping;
      result.esoMucosaTexture.wrapT = THREE.RepeatWrapping;
      result.esoMucosaBump = result.longitudinalMuscleBump;
    }

    return result;
  }
}
