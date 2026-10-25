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

    return result;
  }
}
