import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ProceduralTextures } from './modules/ProceduralTextures.js';
import { StomachLayersBuilder } from './modules/StomachLayersBuilder.js';
import { ExplosionManager } from './modules/ExplosionManager.js';
import { HoverCalloutView } from './modules/HoverCalloutView.js';

/**
 * SceneView.js
 * Modular Three.js 3D Viewport Controller for Human Digestive Anatomy.
 *
 * Coordinates:
 * - Fast binary GLB loading (DigestiveSystem.glb, ~6 MB welded indexed meshes)
 * - Lazy background loading of TorsoAbdominalWall.glb for Clinical Mode
 * - ProceduralTextures, StomachLayersBuilder, ExplosionManager, and HoverCalloutView
 * - Clip-aware 3D raycasting for instant hover callouts & layer highlighting
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
    this.controls.dampingFactor = 0.06;
    this.controls.target.set(0, -0.5, 0);
    this.controls.maxDistance = 40;
    this.controls.minDistance = 2;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.clickableMeshes = [];
    this.allVisceralMeshes = [];
    this.stomachWallMeshes = [];
    this.landmarkMarkers = new Map();
    this.hoveredMesh = null;

    // Torso model state (lazy loaded)
    this.torsoRoot = null;
    this.torsoLoaded = false;
    this.torsoLoading = false;
    this.torsoSkinMaterial = null;

    // Initialize specialized 3D & UI overlay modules
    this.proceduralTextures = new ProceduralTextures();
    this.stomachBuilder = new StomachLayersBuilder(this.proceduralTextures);
    this.hoverCallout = new HoverCalloutView(this.container);
    this.explosionManager = null;

    this._setupLoadingOverlay();
    this._setupLights();
    this._buildClinicalLandmarks();
    this._bindEvents();
    this._bindViewModel();

    // Stage 1: Fast boot via pre-cleaned binary GLB
    this._loadDigestiveGLB();

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
      transition: opacity 0.3s ease;
    `;
    this.loadingOverlay.innerHTML = `
      <div style="font-size: 36px; margin-bottom: 10px;">🩺</div>
      <div id="loading-status-text" style="font-size: 14px; font-weight: 700; color: #0284c7; margin-bottom: 8px;">
        Đang tải mô hình 3D Hệ Tiêu Hóa chuẩn Z-Anatomy...
      </div>
      <div style="width: 240px; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
        <div id="loading-progress-bar" style="width: 20%; height: 100%; background: #0284c7; transition: width 0.15s;"></div>
      </div>
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
      }, 300);
    }
  }

  updateBackgroundColor() {
    this.scene.background = new THREE.Color(
      this.currentTheme === 'light' ? 0xf1f5f9 : 0x0f172a
    );
  }

  _setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.92);
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

  _loadDigestiveGLB() {
    const loader = new GLTFLoader();
    this._updateLoadingProgress(20, 'Đang nạp mô hình giải phẫu 3D (Z-Anatomy)...');

    const loadModel = (url) => new Promise((resolve, reject) => {
      loader.load(url, resolve, undefined, reject);
    });

    Promise.all([
      loadModel('./assets/models/DigestiveSystem.glb'),
      loadModel('./assets/models/UpperDigestiveTract.glb'),
      loadModel('./assets/models/HepaticVessels.glb')
    ]).then(([digestiveGltf, upperGltf, hepaticGltf]) => {
      this._updateLoadingProgress(85, 'Đang khởi tạo các tầng mô học & mạch máu gan PBR...');
      this._processDigestiveScene(digestiveGltf.scene, upperGltf.scene, hepaticGltf.scene);
      this._hideLoadingOverlay();

      // Stage 2: Lazy-load TorsoAbdominalWall.glb during browser idle time
      const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
      schedule(() => this._ensureTorsoLoaded());
    }).catch((err) => {
      console.error('Lỗi nạp mô hình 3D:', err);
      this._updateLoadingProgress(100, 'Lỗi nạp mô hình 3D.');
    });
  }

  _processDigestiveScene(rootGroup, upperGroup, hepaticGroup) {
    this.masterRoot = new THREE.Group();
    this.masterRoot.name = 'ZAnatomy_Visceral_Master';
    this.scene.add(this.masterRoot);
    this.masterRoot.add(rootGroup);
    if (upperGroup) this.masterRoot.add(upperGroup);
    if (hepaticGroup) this.masterRoot.add(hepaticGroup);

    this.explosionManager = new ExplosionManager(this.scene, this.masterRoot, this.stomachBuilder);

    const materials = {
      liver: new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.38, metalness: 0.12, side: THREE.DoubleSide }),
      gallbladder_tree: new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x064e3b, roughness: 0.25, metalness: 0.2, side: THREE.DoubleSide }),
      stomach: new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide }),
      pancreas: new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide }),
      duodenum: new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide }),
      small_intestine: new THREE.MeshStandardMaterial({ color: 0xf87171, roughness: 0.5, metalness: 0.08, side: THREE.DoubleSide }),
      large_intestine: new THREE.MeshStandardMaterial({ color: 0x84cc16, roughness: 0.48, metalness: 0.1, side: THREE.DoubleSide }),
      esophagus: new THREE.MeshStandardMaterial({ color: 0xfbcfe8, roughness: 0.4, metalness: 0.05, side: THREE.DoubleSide }),
      peritoneum_omentum: new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.65, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),

      // Upper GI PBR Materials
      pharynx: new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.42, metalness: 0.08, side: THREE.DoubleSide }),
      tongue: new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.40, metalness: 0.08, side: THREE.DoubleSide }),
      palate: new THREE.MeshStandardMaterial({ color: 0xfb7185, roughness: 0.45, metalness: 0.05, side: THREE.DoubleSide }),
      epiglottis: new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.50, metalness: 0.05, side: THREE.DoubleSide }),
      salivary_gland: new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.52, metalness: 0.12, side: THREE.DoubleSide }),
      salivary_glands: new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.52, metalness: 0.12, side: THREE.DoubleSide }),
      gingiva: new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.35, metalness: 0.05, side: THREE.DoubleSide }),
      teeth: new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.18, metalness: 0.06, side: THREE.DoubleSide }),
      teeth_and_jaw: new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25, metalness: 0.05, side: THREE.DoubleSide }),
      mandible: new THREE.MeshStandardMaterial({ color: 0xcfd8dc, roughness: 0.55, metalness: 0.05, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
      maxilla: new THREE.MeshStandardMaterial({ color: 0xcfd8dc, roughness: 0.55, metalness: 0.05, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
      hyoid_bone: new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide }),

      // Hepatic & Circulatory PBR Materials
      portal_system: new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.35, metalness: 0.18, side: THREE.DoubleSide }),
      portal_vein: new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.35, metalness: 0.18, side: THREE.DoubleSide }),
      hepatic_artery: new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.30, metalness: 0.20, side: THREE.DoubleSide }),
      hepatic_veins: new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.32, metalness: 0.18, side: THREE.DoubleSide }),
      inferior_vena_cava: new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.32, metalness: 0.18, side: THREE.DoubleSide })
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

    const inferOrganId = (name, userData) => {
      let rawId = (userData && userData.organId) || '';
      const low = ((name || '') + ' ' + rawId).toLowerCase();

      if (rawId === 'portal_vein' || low.includes('portal') || low.includes('splenic_vein') || low.includes('mesenteric_vein')) return 'portal_system';
      if (rawId === 'inferior_vena_cava' || low.includes('hepatic_vein') || low.includes('cava')) return 'hepatic_veins';
      if (rawId === 'hepatic_artery' || low.includes('artery') || low.includes('coeliac') || low.includes('celiac')) return 'hepatic_artery';

      if (['teeth', 'mandible', 'maxilla', 'gingiva'].includes(rawId) ||
          low.includes('incisor') || low.includes('canine') || low.includes('premolar') || low.includes('molar') ||
          low.includes('tooth') || low.includes('teeth') || low.includes('mandib') || low.includes('maxill') || low.includes('gingiva')) {
        return 'teeth_and_jaw';
      }

      if (['salivary_gland', 'salivary_glands'].includes(rawId) || low.includes('gland')) return 'salivary_glands';

      if (['pharynx', 'palate', 'epiglottis', 'hyoid_bone'].includes(rawId) ||
          low.includes('pharynx') || low.includes('palate') || low.includes('uvula') || low.includes('epiglottis') || low.includes('hyoid')) {
        return 'pharynx';
      }

      if (low.includes('tongue')) return 'tongue';
      if (low.includes('omentum') || low.includes('peritoneum') || low.includes('meso')) return 'peritoneum_omentum';
      if (low.includes('liver')) return 'liver';
      if (low.includes('gallbladder') || low.includes('bile') || low.includes('cystic')) return 'gallbladder_tree';
      if (low.includes('stomach') || low.includes('gaster')) return 'stomach';
      if (low.includes('pancreas') || low.includes('pancreatic')) return 'pancreas';
      if (low.includes('duodenum')) return 'duodenum';
      if (low.includes('jejunum') || low.includes('ileum') || low.includes('small intestine') || low.includes('intestine')) return 'small_intestine';
      if (low.includes('colon') || low.includes('cecum') || low.includes('caecum') || low.includes('appendix') || low.includes('taenia')) return 'large_intestine';
      if (low.includes('oesophagus') || low.includes('esophagus')) return 'esophagus';
      return 'small_intestine';
    };

    this.clickableMeshes = [];
    this.allVisceralMeshes = [];
    const meshesToProcess = [];
    const colonBaseMeshes = [];
    const taeniaMeshes = [];

    const colonWallNames = new Set([
      'Ascending_colon',
      'Transverse_colon',
      'Descending_colon',
      'Sigmoid_colon',
      'Vermiform_appendix'
    ]);
    const taeniaNames = new Set([
      'Omental_taenia',
      'Free_taenia',
      'Mesocolic_taenia'
    ]);

    [rootGroup, upperGroup, hepaticGroup].forEach((grp) => {
      if (grp) {
        grp.traverse((child) => {
          if (child.isMesh) {
            meshesToProcess.push(child);
          }
        });
      }
    });

    meshesToProcess.forEach((child) => {
      const organId = inferOrganId(child.name, child.userData);
      const low = (child.name || '').toLowerCase();

      // Task 5: Hide unsegmented duplicate whole-liver shell (Node 0: 'Liver')
      // so only the 8 Couinaud segments (Nodes 1..8) represent the liver!
      if (child.name === 'Liver') {
        child.visible = false;
        return;
      }

      // Task 4: Collect all Large Intestine wall segments & Taeniae coli bands for composite 5-layer synthesis
      if (colonWallNames.has(child.name)) {
        colonBaseMeshes.push(child);
        return;
      }
      if (taeniaNames.has(child.name)) {
        taeniaMeshes.push(child);
        return;
      }

      // Synthesize Concentric Histological Layers for all 6 Hollow Visceral Organs
      if (child.name === 'Stomach' || organId === 'stomach') {
        const layers = this.stomachBuilder.createLayers('stomach', child, this.appVM.organsData);
        this.stomachWallMeshes = layers;
        layers.forEach((lMesh) => {
          this.clickableMeshes.push(lMesh);
          this.allVisceralMeshes.push(lMesh);
        });
        return;
      }

      if (child.name === 'Duodenum' || (organId === 'duodenum' && low === 'duodenum')) {
        const layers = this.stomachBuilder.createLayers('duodenum', child, this.appVM.organsData);
        this.duodenumWallMeshes = layers;
        layers.forEach((lMesh) => {
          this.clickableMeshes.push(lMesh);
          this.allVisceralMeshes.push(lMesh);
        });
        return;
      }

      if (child.name === 'Jejunum') {
        const layers = this.stomachBuilder.createLayers('small_intestine', child, this.appVM.organsData);
        this.smallIntestineWallMeshes = layers;
        layers.forEach((lMesh) => {
          this.clickableMeshes.push(lMesh);
          this.allVisceralMeshes.push(lMesh);
        });
        return;
      }

      // Task 3: Synthesize 4 Concentric Histological Layers for Gallbladder
      if (child.name === 'Gallbladder') {
        const layers = this.stomachBuilder.createLayers('gallbladder_tree', child, this.appVM.organsData);
        this.gallbladderWallMeshes = layers;
        layers.forEach((lMesh) => {
          this.clickableMeshes.push(lMesh);
          this.allVisceralMeshes.push(lMesh);
        });
        return;
      }

      // Task 3: Synthesize 5 Concentric Histological Layers for Esophagus
      if (child.name === 'Oesophagus' || organId === 'esophagus') {
        const layers = this.stomachBuilder.createLayers('esophagus', child, this.appVM.organsData);
        this.esophagusWallMeshes = layers;
        layers.forEach((lMesh) => {
          this.clickableMeshes.push(lMesh);
          this.allVisceralMeshes.push(lMesh);
        });
        return;
      }

      child.visible = true;
      const segMatch = child.name.match(/segment_([ivx]+)/i);
      const couinaudSeg = (child.userData && child.userData.couinaudSeg) || (segMatch ? 'segment_' + segMatch[1].toUpperCase() : null);

      child.userData = {
        ...child.userData,
        organId,
        couinaudSeg,
        rawName: child.name,
        initialPos: child.position.clone(),
        initialScale: child.scale.clone()
      };

      let baseMat = materials[organId] || materials.stomach;
      if (low.includes('tooth') || low.includes('teeth') || low.includes('incisor') || low.includes('canine') || low.includes('premolar') || low.includes('molar')) {
        baseMat = materials.teeth;
      } else if (low.includes('mandib') || low.includes('maxill')) {
        baseMat = materials.mandible;
      } else if (low.includes('gingiva')) {
        baseMat = materials.gingiva;
      } else if (low.includes('epiglottis')) {
        baseMat = materials.epiglottis;
      } else if (low.includes('palate') || low.includes('uvula')) {
        baseMat = materials.palate;
      } else if (low.includes('gland')) {
        baseMat = materials.salivary_glands;
      } else if (low.includes('portal') || low.includes('splenic_vein') || low.includes('mesenteric_vein') || low.includes('colic_vein') || low.includes('gastro-omental') || low.includes('gastro_omental')) {
        baseMat = materials.portal_vein;
      } else if (low.includes('hepatic_vein')) {
        baseMat = materials.hepatic_veins;
      } else if (low.includes('cava')) {
        baseMat = materials.inferior_vena_cava;
      } else if (low.includes('artery') || low.includes('coeliac') || low.includes('celiac')) {
        baseMat = materials.hepatic_artery;
      }

      const mat = baseMat.clone();
      for (const [k, hex] of Object.entries(couinaudColors)) {
        if (low.includes(k)) {
          mat.color.setHex(hex);
          break;
        }
      }

      child.material = mat;
      child.castShadow = true;
      child.receiveShadow = true;

      this.clickableMeshes.push(child);
      this.allVisceralMeshes.push(child);
    });

    // Task 4: Build 5 unified concentric layers across the ENTIRE Colon frame + Taeniae coli
    if (colonBaseMeshes.length > 0) {
      const colonLayers = this.stomachBuilder.createColonCompositeLayers(
        colonBaseMeshes,
        taeniaMeshes,
        this.appVM.organsData,
        rootGroup
      );
      this.colonWallMeshes = colonLayers;
      colonLayers.forEach((lMesh) => {
        this.clickableMeshes.push(lMesh);
        this.allVisceralMeshes.push(lMesh);
      });
    }

    // Normalize bounding box of digestive system to target height 9.8 centered at origin
    this.masterRoot.updateMatrixWorld(true);
    const digestiveBBox = new THREE.Box3();
    this.clickableMeshes.forEach((mesh) => {
      mesh.updateWorldMatrix(true, false);
      digestiveBBox.expandByObject(mesh);
    });

    const center = digestiveBBox.getCenter(new THREE.Vector3());
    const size = digestiveBBox.getSize(new THREE.Vector3());
    const targetHeight = 8.6;
    const scaleFactor = targetHeight / Math.max(size.y, 1);

    this.masterRoot.scale.setScalar(scaleFactor);
    this.masterRoot.position.set(
      -center.x * scaleFactor,
      -center.y * scaleFactor,
      -center.z * scaleFactor
    );
    this.masterRoot.updateMatrixWorld(true);

    // Record normalized world center of all hollow organs after masterRoot transform is finalized
    this.stomachBuilder.recordBaseCenterWorld();

    // Assign 3D explosion vectors for both Whole-System Knolling Grid and Isolated Organ explosion
    this.explosionManager.assignExplosionVectors(this.clickableMeshes, center);

    this.layerMap = {
      pharynx: 1, tongue: 1, teeth_and_jaw: 1, salivary_glands: 1,
      esophagus: 1, peritoneum_omentum: 1,
      liver: 2, stomach: 2, large_intestine: 2,
      gallbladder_tree: 3, pancreas: 3, duodenum: 3, small_intestine: 3,
      portal_system: 2, hepatic_artery: 2, hepatic_veins: 2
    };

    this._updateOrganVisuals(this.sceneVM.state.selectedOrganId);
    this._syncExplosion();
  }

  _ensureTorsoLoaded() {
    if (this.torsoLoaded || this.torsoLoading) return;
    this.torsoLoading = true;

    const gltfLoader = new GLTFLoader();
    this.torsoRoot = new THREE.Group();
    this.torsoRoot.name = 'Torso_Abdominal_Wall_Root';
    this.torsoRoot.visible = (this.appVM.state.activeMode === 'pathology');
    this.torsoMuscleMeshes = [];

    gltfLoader.load(
      './assets/models/TorsoAbdominalWall.glb',
      (gltf) => {
        const curOpacity = this.dissectionVM.state.torsoSkinOpacity !== undefined ? this.dissectionVM.state.torsoSkinOpacity : 0.50;
        gltf.scene.traverse((child) => {
          if (child.isMesh) {
            const info = this._getTorsoMuscleInfo(child.name);
            const mat = new THREE.MeshStandardMaterial({
              color: info.color,
              roughness: 0.44,
              metalness: 0.05,
              transparent: true,
              opacity: curOpacity,
              side: THREE.DoubleSide,
              depthWrite: false
            });
            child.material = mat;
            child.castShadow = true;
            child.receiveShadow = true;
            child.userData = {
              isTorsoMuscle: true,
              muscleName: child.name,
              info
            };
            this.torsoMuscleMeshes.push(child);
          }
        });
        this.torsoRoot.add(gltf.scene);
        this.torsoRoot.scale.set(10.0, 10.0, 10.0);
        if (this.masterRoot) {
          this.masterRoot.add(this.torsoRoot);
        }
        this.torsoLoaded = true;
        this.torsoLoading = false;
        this.torsoRoot.visible = (this.appVM.state.activeMode === 'pathology');
      },
      undefined,
      (err) => {
        this.torsoLoading = false;
        console.warn('Không thể nạp TorsoAbdominalWall.glb:', err);
      }
    );
  }

  /**
   * Anatomical PBR styling and clinical annotations for individual muscles
   * extracted directly from the official Z-Anatomy muscular system.
   * Rendered in natural human skin tone (màu da) at 50% opacity.
   */
  _getTorsoMuscleInfo(rawName) {
    const low = rawName.toLowerCase();

    // Natural skin tone palette (màu da tự nhiên)
    const skinToneBase = 0xd4a373;      // Màu da chuẩn
    const skinToneDeep = 0xcca17c;      // Màu da ấm sâu (khối cơ dựng gai, cơ thành sau)
    const skinToneMedium = 0xd29d71;    // Màu da cơ trung gian
    const skinToneFascia = 0xe6d1be;    // Màu cân gân xơ sáng nhẹ

    // 1. Erector spinae (Khối cơ dựng gai lưng - Mốc Mayo-Robson)
    if (low.includes('iliocostalis')) {
      return {
        color: skinToneDeep,
        tag: 'CƠ MẶT LƯNG SÂU • KHỐI DỰNG GAI LƯNG',
        badge: 'Mốc Mayo-Robson',
        title: low.includes('lumborum')
          ? 'Cơ Chậu Sườn Thắt Lưng (Iliocostalis Lumborum)'
          : 'Cơ Chậu Sườn Ngực (Iliocostalis Thoracis)',
        subtitle: 'Bờ ngoài khối cơ dựng gai lưng trái cắt bờ dưới xương sườn 12 tạo thành Điểm Mayo-Robson (đau trong Viêm tụy cấp).'
      };
    }
    if (low.includes('longissimus')) {
      return {
        color: skinToneDeep,
        tag: 'CƠ MẶT LƯNG SÂU • KHỐI DỰNG GAI LƯNG',
        badge: 'Erector Spinae',
        title: 'Cơ Dài Ngực (Longissimus Thoracis)',
        subtitle: 'Dải cơ trung tâm khỏe nhất của khối cơ dựng gai chạy dọc suốt cột sống ngực và thắt lưng.'
      };
    }
    if (low.includes('spinalis')) {
      return {
        color: skinToneDeep,
        tag: 'CƠ MẶT LƯNG SÂU • KHỐI DỰNG GAI LƯNG',
        badge: 'Cạnh Gai Sống',
        title: 'Cơ Gai Ngực (Spinalis Thoracis)',
        subtitle: 'Dải cơ trong cùng của khối dựng gai, bám sát các mỏm gai đốt sống ngực.'
      };
    }

    // 2. Thành bụng sau & sâu (Khoang sau phúc mạc)
    if (low.includes('quadratus_lumborum')) {
      return {
        color: skinToneDeep,
        tag: 'THÀNH BỤNG SAU • KHOANG SAU PHÚC MẠC',
        badge: 'Sàn Sau Tụy & Thận',
        title: 'Cơ Vuông Thắt Lưng (Quadratus Lumborum)',
        subtitle: 'Cơ dẹt hình tứ giác nối mào chậu lên sườn 12, tạo sàn thành sau ổ bụng ngay sau tụy và thận.'
      };
    }

    // 3. Cơ lưng rộng (Latissimus dorsi)
    if (low.includes('latissimus')) {
      return {
        color: skinToneBase,
        tag: 'CƠ MẶT LƯNG NÔNG',
        badge: 'Cơ Lưng Rộng',
        title: 'Cơ Lưng Rộng (Latissimus Dorsi)',
        subtitle: 'Cơ dẹt rộng nhất cơ thể, bao phủ toàn bộ vùng lưng dưới và mạn sườn thắt lưng.'
      };
    }

    // 4. Cơ thang (Trapezius)
    if (low.includes('trapezius')) {
      let part = 'Cơ Thang';
      if (low.includes('ascending')) part = 'Cơ Thang (Phần Lên)';
      else if (low.includes('transverse')) part = 'Cơ Thang (Phần Ngang)';
      else if (low.includes('descending')) part = 'Cơ Thang (Phần Xuống)';
      return {
        color: skinToneBase,
        tag: 'CƠ MẶT LƯNG NÔNG',
        badge: 'Vùng Cổ - Lưng',
        title: part + ' (Trapezius)',
        subtitle: 'Cơ nông hình thang phủ rộng từ xương chẩm, gáy xuống tận đốt sống ngực 12 (Th12).'
      };
    }

    // 5. Cơ răng sau (Serratus posterior)
    if (low.includes('serratus_posterior')) {
      return {
        color: skinToneMedium,
        tag: 'CƠ MẶT LƯNG TRUNG GIAN',
        badge: 'Sườn 9-12',
        title: low.includes('inferior')
          ? 'Cơ Răng Sau Dưới (Serratus Posterior Inferior)'
          : 'Cơ Răng Sau Trên (Serratus Posterior Superior)',
        subtitle: 'Cơ răng sau dưới bám vào 4 xương sườn cuối (9-12), nằm ngay trên diện chiếu của góc sườn cột sống.'
      };
    }

    // 6. Cơ trám & cơ nâng vai (Rhomboids & Levator scapulae)
    if (low.includes('rhomboid')) {
      return {
        color: skinToneMedium,
        tag: 'CƠ MẶT LƯNG TRUNG GIAN',
        badge: 'Liên Bả Vai',
        title: low.includes('minor') ? 'Cơ Trám Bé (Rhomboid Minor)' : 'Cơ Trám Lớn (Rhomboid Major)',
        subtitle: 'Kéo xương bả vai vào trong và lên trên về phía cột sống ngực.'
      };
    }
    if (low.includes('levator_scapulae')) {
      return {
        color: skinToneMedium,
        tag: 'CƠ VÙNG CỔ - VAI SAU',
        badge: 'Nâng Bả Vai',
        title: 'Cơ Nâng Vai (Levator Scapulae)',
        subtitle: 'Nối từ các mỏm ngang đốt sống cổ trên xuống góc trên xương bả vai.'
      };
    }

    // 7. Cơ bả vai sau (Infraspinatus & Teres major)
    if (low.includes('infraspinatus') || low.includes('teres')) {
      return {
        color: skinToneMedium,
        tag: 'CƠ VÙNG VAI SAU',
        badge: 'Đai Khớp Vai',
        title: low.includes('infraspinatus') ? 'Cơ Dưới Gai (Infraspinatus)' : 'Cơ Tròn Lớn (Teres Major)',
        subtitle: 'Cơ chóp xoay và đai vai bọc mặt sau xương bả vai.'
      };
    }

    // 8. Cân mạc & Gân xơ
    if (low.includes('fascia') || low.includes('linea_alba') || low.includes('ligament')) {
      return {
        color: skinToneFascia,
        tag: 'MÀNG CÂN & GÂN XƠ NÔNG',
        badge: 'Mô Xơ Trắng',
        title: low.includes('fascia')
          ? 'Cân Ngực Thắt Lưng (Thoracolumbar Fascia)'
          : (low.includes('linea_alba') ? 'Đường Trắng Giữa Bụng (Linea Alba)' : 'Dây Chằng Bẹn (Inguinal Ligament)'),
        subtitle: 'Lớp cân xơ dai chắc, cố định thành ngực bụng và bao bọc các khối cơ.'
      };
    }

    // 9. Thành bụng trước
    if (low.includes('rectus_abdominis')) {
      return {
        color: skinToneBase,
        tag: 'THÀNH BỤNG TRƯỚC',
        badge: 'Cơ Thẳng Bụng',
        title: 'Cơ Thẳng Bụng (Rectus Abdominis)',
        subtitle: 'Bờ ngoài cơ thẳng bụng là mốc xác định điểm túi mật Murphy và điểm ruột thừa McBurney.'
      };
    }
    if (low.includes('oblique') || low.includes('transversus')) {
      return {
        color: skinToneBase,
        tag: 'THÀNH BỤNG BÊN & TRƯỚC',
        badge: 'Cơ Thành Bụng',
        title: low.includes('transversus')
          ? 'Cơ Ngang Bụng (Transversus Abdominis)'
          : (low.includes('external') ? 'Cơ Chéo Bụng Ngoài (External Oblique)' : 'Cơ Chéo Bụng Trong (Internal Oblique)'),
        subtitle: 'Bao bọc thành bên ổ bụng, bảo vệ các tạng tiêu hóa bên trong.'
      };
    }
    if (low.includes('pectoralis')) {
      return {
        color: skinToneBase,
        tag: 'THÀNH NGỰC TRƯỚC',
        badge: 'Cơ Ngực Lớn',
        title: 'Cơ Ngực Lớn (Pectoralis Major)',
        subtitle: 'Cơ dày hình quạt phủ mặt trước lồng ngực.'
      };
    }
    if (low.includes('serratus_anterior')) {
      return {
        color: skinToneMedium,
        tag: 'THÀNH NGỰC BÊN',
        badge: 'Cơ Răng Trước',
        title: 'Cơ Răng Trước (Serratus Anterior)',
        subtitle: 'Các búp cơ hình răng cưa ôm lấy các xương sườn bên sườn.'
      };
    }

    // Default skin tone
    return {
      color: skinToneBase,
      tag: 'CƠ THÂN MÌNH (Z-ANATOMY)',
      badge: 'Cơ Bắp',
      title: rawName.replace(/_/g, ' '),
      subtitle: 'Mô cơ giải phẫu chuẩn Z-Anatomy.'
    };
  }

  _updateTorsoSkinOpacity(opacity) {
    const isTransp = opacity < 0.98;
    if (this.torsoMuscleMeshes) {
      this.torsoMuscleMeshes.forEach(mesh => {
        if (mesh.material) {
          mesh.material.opacity = opacity;
          mesh.material.transparent = isTransp;
          mesh.material.depthWrite = !isTransp;
          mesh.material.needsUpdate = true;
        }
      });
    }
    if (this.torsoRoot) {
      if (opacity <= 0.02) {
        this.torsoRoot.visible = false;
      } else if (this.appVM.state.activeMode === 'pathology') {
        this.torsoRoot.visible = true;
      }
    }
  }

  _buildClinicalLandmarks() {
    this.landmarksRoot = new THREE.Group();
    this.landmarksRoot.name = 'Clinical_Landmarks_Root';
    this.scene.add(this.landmarksRoot);

    const pinGeo = new THREE.SphereGeometry(0.12, 24, 24);
    this.appVM.landmarksData.forEach(lm => {
      const isBackLandmark = (lm.coordinates && lm.coordinates[2] < 0);
      const pinMat = new THREE.MeshStandardMaterial({
        color: isBackLandmark ? 0xf59e0b : 0x38bdf8,
        emissive: isBackLandmark ? 0xd97706 : 0x0284c7,
        emissiveIntensity: 0.6,
        roughness: 0.25,
        depthTest: true,
        depthWrite: true
      });
      const pinMesh = new THREE.Mesh(pinGeo, pinMat);
      pinMesh.position.set(...lm.coordinates);
      pinMesh.userData = {
        isLandmarkPin: true,
        landmarkId: lm.id,
        name: lm.name,
        category: lm.category,
        description: lm.description,
        isBack: isBackLandmark
      };

      this.landmarksRoot.add(pinMesh);
      this.landmarkMarkers.set(lm.id, pinMesh);
    });

    this.landmarksRoot.visible = (this.appVM.state.activeMode === 'pathology');
  }

  /**
   * Formats human-readable Vietnamese/Latin metadata for any hovered 3D mesh.
   */
  _buildHoverPayload(mesh, screenX, screenY) {
    if (mesh.userData.isWallLayer || mesh.userData.isStomachWallLayer) {
      const shortThickness = (mesh.userData.wallLayerThickness || '').split('(')[0].trim();
      const organTitle = mesh.userData.organTitle ? mesh.userData.organTitle.toUpperCase() : 'MÔ HỌC';
      const total = mesh.userData.totalLayers || (mesh.userData.organId === 'stomach' ? 6 : 5);
      const idx = mesh.userData.wallLayerIndex !== undefined ? mesh.userData.wallLayerIndex : 0;
      const insideOutOrder = total - idx;
      return {
        organId: mesh.userData.organId,
        wallLayerId: mesh.userData.wallLayerId,
        x: screenX,
        y: screenY,
        tag: `MÔ HỌC ${organTitle} • LỚP ${insideOutOrder}/${total} (TRONG → NGOÀI)`,
        badge: shortThickness,
        title: mesh.userData.wallLayerName,
        subtitle: mesh.userData.wallLayerDesc || '',
        color: mesh.userData.wallLayerColor || '#e11d48'
      };
    }

    const organId = mesh.userData.organId;
    const organ = this.appVM.organsData.find(o => o.id === organId);
    const raw = (mesh.userData.rawName || mesh.name || '').replace(/_/g, ' ');
    const low = raw.toLowerCase();

    const organColors = {
      liver: '#b45309',
      gallbladder_tree: '#10b981',
      stomach: '#e11d48',
      pancreas: '#f59e0b',
      duodenum: '#f97316',
      small_intestine: '#f87171',
      large_intestine: '#84cc16',
      esophagus: '#ec4899',
      peritoneum_omentum: '#eab308',
      pharynx: '#ec4899',
      tongue: '#e11d48',
      teeth_and_jaw: '#64748b',
      salivary_glands: '#f59e0b',
      portal_system: '#2563eb',
      hepatic_artery: '#ef4444',
      hepatic_veins: '#1d4ed8'
    };

    // Translate specific sub-mesh names into clear Vietnamese medical labels
    let subPartTitle = organ ? organ.vietnameseName : raw;
    if (organId === 'liver') {
      const segMatch = low.match(/\((i|ii|iii|iv|v|vi|vii|viii)\)/i);
      if (segMatch) {
        subPartTitle = `Hạ Phân Thùy Gan ${segMatch[1].toUpperCase()} (Couinaud)`;
      }
    } else if (organId === 'large_intestine') {
      if (low.includes('appendix')) subPartTitle = 'Ruột Thừa (Vermiform Appendix)';
      else if (low.includes('cecum') || low.includes('caecum')) subPartTitle = 'Manh Tràng (Cecum)';
      else if (low.includes('ascending')) subPartTitle = 'Đại Tràng Lên (Ascending Colon)';
      else if (low.includes('transverse')) subPartTitle = 'Đại Tràng Ngang (Transverse Colon)';
      else if (low.includes('descending')) subPartTitle = 'Đại Tràng Xuống (Descending Colon)';
      else if (low.includes('sigmoid')) subPartTitle = 'Đại Tràng Sigma (Sigmoid Colon)';
    } else if (organId === 'gallbladder_tree') {
      if (low.includes('gallbladder')) subPartTitle = 'Túi Mật (Gallbladder)';
      else if (low.includes('cystic')) subPartTitle = 'Ống Túi Mật (Cystic Duct)';
      else if (low.includes('common') || low.includes('bile')) subPartTitle = 'Ống Mật Chủ & Đường Mật (Bile Duct)';
    } else if (organId === 'small_intestine') {
      if (low.includes('jejunum')) subPartTitle = 'Hỗng Tràng (Jejunum)';
      else if (low.includes('ileum')) subPartTitle = 'Hồi Tràng (Ileum)';
    } else if (organId === 'pharynx') {
      if (low.includes('naso')) subPartTitle = 'Hầu Mũi (Nasopharynx - Tỵ hầu)';
      else if (low.includes('oro')) subPartTitle = 'Hầu Miệng (Oropharynx - Khẩu hầu)';
      else if (low.includes('laryngo')) subPartTitle = 'Hầu Thanh Quản (Laryngopharynx - Thanh hầu)';
      else if (low.includes('palate') || low.includes('uvula')) subPartTitle = 'Khẩu Cái Mềm & Lưỡi Gà (Soft Palate & Uvula)';
      else if (low.includes('epiglottis')) subPartTitle = 'Nắp Thanh Môn (Epiglottis)';
      else if (low.includes('hyoid')) subPartTitle = 'Xương Móng (Hyoid Bone)';
    } else if (organId === 'teeth_and_jaw') {
      if (low.includes('mandib')) subPartTitle = 'Xương Hàm Dưới (Mandible)';
      else if (low.includes('maxill')) subPartTitle = 'Xương Hàm Trên (Maxilla)';
      else if (low.includes('gingiva')) subPartTitle = 'Nướu Răng (Gingiva)';
      else if (low.includes('incisor')) subPartTitle = 'Răng Cửa (Incisor)';
      else if (low.includes('canine')) subPartTitle = 'Răng Nanh (Canine)';
      else if (low.includes('premolar')) subPartTitle = 'Răng Tiền Cối (Premolar)';
      else if (low.includes('molar')) subPartTitle = 'Răng Cối (Molar)';
      else subPartTitle = 'Cung Răng & Khung Hàm';
    } else if (organId === 'salivary_glands') {
      if (low.includes('parotid')) subPartTitle = 'Tuyến Mang Tai (Parotid Gland)';
      else if (low.includes('submandibular')) subPartTitle = 'Tuyến Dưới Hàm (Submandibular Gland)';
      else if (low.includes('sublingual')) subPartTitle = 'Tuyến Dưới Lưỡi (Sublingual Gland)';
      else subPartTitle = 'Tuyến Nước Bọt Lớn';
    } else if (organId === 'portal_system') {
      const seg = (mesh.userData.couinaudSeg || '').toUpperCase();
      if (low.includes('portal_vein_segment') || seg) {
        const roman = seg.replace('SEGMENT_', '') || (low.match(/segment_([ivx]+)/i) ? low.match(/segment_([ivx]+)/i)[1].toUpperCase() : '');
        subPartTitle = `Nhánh TM Cửa Hạ Phân Thùy ${roman} (Portal Branch ${roman})`;
      } else if (low.includes('right_portal_trunk')) {
        subPartTitle = 'Thân Phải Tĩnh Mạch Cửa (Right Portal Trunk)';
      } else if (low.includes('left_portal_trunk')) {
        subPartTitle = 'Thân Trái Tĩnh Mạch Cửa & Đoạn Rốn (Left Portal Trunk)';
      } else if (low.includes('superior_mesenteric')) {
        subPartTitle = 'Tĩnh Mạch Mạc Treo Tràng Trên (SMV - Dẫn máu dinh dưỡng ruột non)';
      } else if (low.includes('inferior_mesenteric')) {
        subPartTitle = 'Tĩnh Mạch Mạc Treo Tràng Dưới (IMV - Dẫn máu đại tràng trái)';
      } else if (low.includes('right_colic_vein')) {
        subPartTitle = 'Tĩnh Mạch Đại Tràng Phải (Right Colic Vein - Dẫn máu đại tràng lên)';
      } else if (low.includes('middle_colic_vein')) {
        subPartTitle = 'Tĩnh Mạch Đại Tràng Giữa (Middle Colic Vein - Dẫn máu đại tràng ngang)';
      } else if (low.includes('gastro-omental') || low.includes('gastro_omental')) {
        subPartTitle = 'Tĩnh Mạch Mạc Nối Dạ Dày (Gastro-omental Vein)';
      } else if (low.includes('splenic')) {
        subPartTitle = 'Tĩnh Mạch Lách & Nhánh Tụy Vị (Splenic Vein)';
      } else {
        subPartTitle = 'Thân Tĩnh Mạch Cửa Gan (Portal Vein - Cửa ngõ hấp thu dinh dưỡng)';
      }
    } else if (organId === 'hepatic_artery') {
      const seg = (mesh.userData.couinaudSeg || '').toUpperCase();
      if (low.includes('segment') || seg) {
        const roman = seg.replace('SEGMENT_', '') || (low.match(/segment_([ivx]+)/i) ? low.match(/segment_([ivx]+)/i)[1].toUpperCase() : '');
        subPartTitle = `Động Mạch Cấp Máu Hạ Phân Thùy ${roman} (Segmental Hepatic Artery ${roman})`;
      } else if (low.includes('right_hepatic_artery_trunk')) {
        subPartTitle = 'Thân Động Mạch Gan Phải (Right Hepatic Artery)';
      } else if (low.includes('left_hepatic_artery_trunk')) {
        subPartTitle = 'Thân Động Mạch Gan Trái (Left Hepatic Artery)';
      } else if (low.includes('gastroduodenal')) {
        subPartTitle = 'Động Mạch Vị Tá Tràng (GDA)';
      } else if (low.includes('ileocolic')) {
        subPartTitle = 'Động Mạch Hồi Đại Tràng (Ileocolic Artery - Cấp máu manh tràng & ruột thừa)';
      } else if (low.includes('right_colic')) {
        subPartTitle = 'Động Mạch Đại Tràng Phải (Right Colic Artery)';
      } else if (low.includes('middle_colic')) {
        subPartTitle = 'Động Mạch Đại Tràng Giữa (Middle Colic Artery)';
      } else if (low.includes('left_colic')) {
        subPartTitle = 'Động Mạch Đại Tràng Trái (Left Colic Artery)';
      } else if (low.includes('coeliac')) {
        subPartTitle = 'Động Mạch Thân Tạng (Coeliac Trunk)';
      } else if (low.includes('common_hepatic')) {
        subPartTitle = 'Động Mạch Gan Chung (CHA)';
      } else if (low.includes('proper_hepatic')) {
        subPartTitle = 'Động Mạch Gan Riêng (PHA)';
      } else if (low.includes('splenic_artery')) {
        subPartTitle = 'Động Mạch Lách (Splenic Artery)';
      } else if (low.includes('gastric_artery')) {
        subPartTitle = 'Động Mạch Vị Trái (LGA)';
      } else if (low.includes('superior_mesenteric')) {
        subPartTitle = 'Động Mạch Mạc Treo Tràng Trên (SMA - Cấp máu toàn bộ ruột non)';
      } else {
        subPartTitle = 'Cây Động Mạch Cấp Máu Gan & Ống Tiêu Hóa';
      }
    } else if (organId === 'hepatic_veins') {
      if (low.includes('right_hepatic_vein')) {
        subPartTitle = 'Tĩnh Mạch Gan Phải (Right Hepatic Vein - Khe liên phân thùy phải)';
      } else if (low.includes('middle_hepatic_vein')) {
        subPartTitle = 'Tĩnh Mạch Gan Giữa (Middle Hepatic Vein - Khe chính Cantlie)';
      } else if (low.includes('left_hepatic_vein')) {
        subPartTitle = 'Tĩnh Mạch Gan Trái (Left Hepatic Vein - Khe liên phân thùy trái)';
      } else if (low.includes('cava')) {
        subPartTitle = 'Tĩnh Mạch Chủ Dưới (IVC - Đoạn ổ bụng)';
      } else {
        subPartTitle = 'Các Tĩnh Mạch Gan (3 Thân dẫn lưu về TMC dưới)';
      }
    }

    const subtitle = organ
      ? `${organ.latinName} • ${organ.location.split('.')[0]}.`
      : raw;

    return {
      organId,
      wallLayerId: null,
      x: screenX,
      y: screenY,
      tag: organ ? organ.vietnameseName.toUpperCase() : 'HỆ TIÊU HÓA',
      badge: organ ? `Tầng ${organ.layer}` : '',
      title: subPartTitle,
      subtitle,
      color: organColors[organId] || '#0284c7'
    };
  }

  /**
   * Filters raycast hits so points clipped away by Three.js local clippingPlanes
   * or hidden/ghosted meshes are ignored.
   */
  _getFirstVisibleHit(hits) {
    const selectedId = this.sceneVM.state.selectedOrganId;
    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i];
      const obj = hit.object;
      if (!obj.visible) continue;
      // Ignore ghosted non-selected organs (opacity <= 0.15) when an organ is actively selected
      if (selectedId && obj.userData.organId !== selectedId && obj.material && obj.material.transparent && obj.material.opacity <= 0.15) {
        continue;
      }
      // Check shader-based 50% longitudinal tube cutaway attribute (aCutDist)
      if (obj.material && obj.material.userData && obj.material.userData.uCutawayActive && obj.material.userData.uCutawayActive.value > 0.5) {
        const cutAttr = obj.geometry && obj.geometry.attributes && obj.geometry.attributes.aCutDist;
        const thresh = obj.material.userData.uCutThreshold ? obj.material.userData.uCutThreshold.value : 0.0;
        if (cutAttr && hit.face) {
          const dA = cutAttr.getX(hit.face.a);
          const dB = cutAttr.getX(hit.face.b);
          const dC = cutAttr.getX(hit.face.c);
          if ((dA + dB + dC) / 3.0 > thresh) continue;
        }
      }
      const planes = obj.material && obj.material.clippingPlanes;
      if (planes && planes.length > 0) {
        const isKept = planes.every(p => p.distanceToPoint(hit.point) >= 0);
        if (!isKept) continue;
      }
      return hit;
    }
    return null;
  }

  _setHoverHighlight(mesh) {
    if (this.hoveredMesh === mesh) return;

    // Restore previous hovered mesh emissive state
    if (this.hoveredMesh && this.hoveredMesh.material && this.hoveredMesh.material.emissive) {
      const prev = this.hoveredMesh;
      const activeLayerId = this.dissectionVM.state.activeWallLayerId;
      const selectedId = this.sceneVM.state.selectedOrganId;

      const isWall = !!(prev.userData.isWallLayer || prev.userData.isStomachWallLayer);
      if (isWall && prev.userData.wallLayerId === activeLayerId) {
        prev.material.emissive.setHex(0x331111);
      } else if (!isWall && prev.userData.organId === selectedId) {
        prev.material.emissive.setHex(0x221508);
      } else if (prev.userData.organId === 'gallbladder_tree' && !selectedId) {
        prev.material.emissive.setHex(0x064e3b);
      } else {
        prev.material.emissive.setHex(0x000000);
      }
    }

    this.hoveredMesh = mesh;

    // Apply crisp hover highlight
    if (mesh && mesh.material && mesh.material.emissive) {
      mesh.material.emissive.setHex(0x4a1d28);
    }
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

    const getCoords = (e) => {
      const rect = this.renderer.domElement.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const x = (screenX / rect.width) * 2 - 1;
      const y = -(screenY / rect.height) * 2 + 1;
      return { x, y, screenX, screenY };
    };

    this.renderer.domElement.addEventListener('pointermove', (e) => {
      // If user is dragging OrbitControls with mouse button down, hide callout
      if (e.buttons !== 0) {
        this.hoverCallout.update(null);
        return;
      }

      const { x, y, screenX, screenY } = getCoords(e);
      this.mouse.set(x, y);
      this.raycaster.setFromCamera(this.mouse, this.camera);

      // In Pathology mode, check landmark pin intersections first
      if (this.appVM.state.activeMode === 'pathology' && this.landmarksRoot && this.landmarksRoot.visible) {
        const landmarkHits = this.raycaster.intersectObjects(this.landmarksRoot.children, false);
        if (landmarkHits.length > 0) {
          const hitPin = landmarkHits[0].object;
          this.renderer.domElement.style.cursor = 'pointer';
          this.hoverCallout.update({
            x: screenX,
            y: screenY,
            tag: hitPin.userData.category || 'ĐIỂM MỐC LÂM SÀNG',
            badge: hitPin.userData.isBack ? 'MẶT LƯNG' : 'THÀNH BỤNG',
            title: hitPin.userData.name,
            subtitle: hitPin.userData.description,
            color: hitPin.userData.isBack ? '#f59e0b' : '#0284c7'
          });
          return;
        }

        // Also check if any torso or back muscle is hovered
        if (this.torsoMuscleMeshes && this.torsoMuscleMeshes.length > 0) {
          const muscleHits = this.raycaster.intersectObjects(this.torsoMuscleMeshes, false);
          if (muscleHits.length > 0) {
            const hitMuscle = muscleHits[0].object;
            const info = hitMuscle.userData.info || this._getTorsoMuscleInfo(hitMuscle.name);
            this.renderer.domElement.style.cursor = 'pointer';
            this.hoverCallout.update({
              x: screenX,
              y: screenY,
              tag: info.tag,
              badge: info.badge,
              title: info.title,
              subtitle: info.subtitle,
              color: '#' + info.color.toString(16).padStart(6, '0')
            });
            return;
          }
        }
      }

      const rawHits = this.raycaster.intersectObjects(this.clickableMeshes, true);
      const validHit = this._getFirstVisibleHit(rawHits);

      if (validHit) {
        const hitMesh = validHit.object;
        this.renderer.domElement.style.cursor = 'pointer';
        this._setHoverHighlight(hitMesh);

        const payload = this._buildHoverPayload(hitMesh, screenX, screenY);
        this.hoverCallout.update(payload);
        this.sceneVM.setHoveredPart(payload);
      } else {
        this.renderer.domElement.style.cursor = 'default';
        this._setHoverHighlight(null);
        this.hoverCallout.update(null);
        this.sceneVM.setHoveredPart(null);
      }
    });

    this.renderer.domElement.addEventListener('pointerleave', () => {
      this._setHoverHighlight(null);
      this.hoverCallout.update(null);
      this.sceneVM.setHoveredPart(null);
    });

    // Distinguish clean click from orbit drag
    let downX = 0, downY = 0;
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
    });

    this.renderer.domElement.addEventListener('click', (e) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;

      const { x, y } = getCoords(e);
      this.mouse.set(x, y);
      this.raycaster.setFromCamera(this.mouse, this.camera);

      // In Pathology mode, clicking a landmark pin activates it
      if (this.appVM.state.activeMode === 'pathology' && this.landmarksRoot && this.landmarksRoot.visible) {
        const landmarkHits = this.raycaster.intersectObjects(this.landmarksRoot.children, false);
        if (landmarkHits.length > 0) {
          const hitPin = landmarkHits[0].object;
          if (hitPin.userData && hitPin.userData.landmarkId && this.appVM.landmarksVM) {
            this.appVM.landmarksVM.selectLandmark(hitPin.userData.landmarkId);
            return;
          }
        }
      }

      const rawHits = this.raycaster.intersectObjects(this.clickableMeshes, true);
      const validHit = this._getFirstVisibleHit(rawHits);

      if (validHit) {
        const topHit = validHit.object;
        if (topHit.userData.isWallLayer || topHit.userData.isStomachWallLayer) {
          this.sceneVM.selectOrgan(topHit.userData.organId);
          this.dissectionVM.setActiveWallLayer(topHit.userData.wallLayerId);
        } else {
          this.sceneVM.selectOrgan(topHit.userData.organId);
        }
      }
    });
  }

  _syncExplosion() {
    if (!this.explosionManager) return;
    this.explosionManager.updateExplosion({
      explodeFactor: this.dissectionVM.state.explodeFactor,
      selectedOrganId: this.sceneVM.state.selectedOrganId,
      isCutawayOpen: this.dissectionVM.state.isCutawayOpen,
      clickableMeshes: this.clickableMeshes,
      stomachWallMeshes: this.stomachWallMeshes,
      organLayersMap: this.stomachBuilder ? this.stomachBuilder.organLayersMap : null
    });
    this._updateOrganVisuals(this.sceneVM.state.selectedOrganId);
  }

  _bindViewModel() {
    this.sceneVM.subscribe('selectedOrganId', (selectedId) => {
      this._updateOrganVisuals(selectedId);
      this._syncExplosion();
      if (selectedId === 'stomach') {
        this.focusStomach();
      } else if (selectedId === 'duodenum') {
        this.focusDuodenum();
      } else if (selectedId === 'small_intestine') {
        this.focusSmallIntestine();
      } else if (selectedId === 'large_intestine') {
        this.focusColon();
      } else if (selectedId === 'gallbladder_tree') {
        this.focusGallbladder();
      } else if (selectedId === 'esophagus') {
        this.focusEsophagus();
      } else if (selectedId === 'liver') {
        this.focusLiver();
      } else if (selectedId) {
        this.focusOrgan(selectedId);
      }
    });

    this.dissectionVM.subscribe('explodeFactor', (factor) => {
      this._syncExplosion();
      // In Whole-System Knolling Grid mode, frame the 4 horizontal rows comfortably
      if (!this.sceneVM.state.selectedOrganId && factor >= 0.85) {
        this.controls.target.set(0.0, -0.35, 0.0);
        if (this.camera.position.z < 16.5) {
          this.camera.position.set(0.0, 0.0, 17.2);
        }
      }
    });

    this.dissectionVM.subscribe('visibleLayers', (layers) => {
      this._updateLayerVisibility(layers);
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

    this.dissectionVM.subscribe('isCutawayOpen', () => {
      this._syncExplosion();
    });

    this.dissectionVM.subscribe('torsoSkinOpacity', (opacity) => {
      this._updateTorsoSkinOpacity(opacity);
    });

    this.appVM.subscribe('activeMode', (mode) => {
      this.landmarksRoot.visible = (mode === 'pathology');
      if (mode === 'pathology') {
        if (this.explosionManager) {
          this.explosionManager.stopAnimation();
        }
        this.dissectionVM.setExplodeFactor(0.0);
        this.dissectionVM.setCutawayOpen(false);
        this.dissectionVM.setState({
          isIsolateMode: false,
          visibleLayers: [1, 2, 3],
          activeWallLayerId: null
        });
        this.sceneVM.selectOrgan(null);

        // Force synchronous explosion update to factor 0.0 IMMEDIATELY
        if (this.explosionManager) {
          this.explosionManager.updateExplosion({
            explodeFactor: 0.0,
            selectedOrganId: null,
            isCutawayOpen: false,
            clickableMeshes: this.clickableMeshes,
            stomachWallMeshes: this.stomachWallMeshes,
            organLayersMap: this.stomachBuilder ? this.stomachBuilder.organLayersMap : null
          });
        }
        this._updateOrganVisuals(null);
        this._ensureTorsoLoaded();
        this._smoothMoveCameraTarget([0.0, -0.15, 0.0], [0.0, 0.15, 9.8]);
      } else {
        if (this.torsoRoot) this.torsoRoot.visible = false;
      }
      if (this.torsoRoot) {
        this.torsoRoot.visible = (mode === 'pathology') && (this.dissectionVM.state.torsoSkinOpacity > 0.02);
      }
    });

    this.appVM.subscribe('theme', (theme) => {
      this.currentTheme = theme;
      this.updateBackgroundColor();
    });

    this.sceneVM.subscribe('cameraTarget', (target) => {
      if (target) {
        this._smoothMoveCameraTarget(target, this.sceneVM.state.cameraPosition);
      }
    });
  }

  _updateOrganVisuals(selectedId) {
    const isIsolate = this.dissectionVM.state.isIsolateMode;
    const isXRay = this.dissectionVM.state.isXRayMode;
    const isCutaway = this.dissectionVM.state.isCutawayOpen;
    const explodeFactor = this.dissectionVM.state.explodeFactor || 0;
    const visibleLayers = this.dissectionVM.state.visibleLayers;
    const isLiverOrVascular = (id) => ['liver', 'portal_system', 'hepatic_artery', 'hepatic_veins'].includes(id);
    const layerMap = this.layerMap || {
      pharynx: 1, tongue: 1, teeth_and_jaw: 1, salivary_glands: 1,
      esophagus: 1, peritoneum_omentum: 1,
      liver: 2, stomach: 2, large_intestine: 2,
      gallbladder_tree: 3, pancreas: 3, duodenum: 3, small_intestine: 3,
      portal_system: 2, hepatic_artery: 2, hepatic_veins: 2
    };
    const activeWallLayerId = this.dissectionVM.state.activeWallLayerId;

    this.clickableMeshes.forEach((mesh) => {
      const organId = mesh.userData.organId;
      const rawNameLow = (mesh.userData.rawName || mesh.name || '').toLowerCase();
      const isWallLayer = !!(mesh.userData.isWallLayer || mesh.userData.isStomachWallLayer);
      const layer = layerMap[organId] || 3;

      if (!visibleLayers.includes(layer)) {
        mesh.visible = false;
        return;
      }

      if (isWallLayer) {
        const layerIdx = mesh.userData.wallLayerIndex || 0;
        const isClosedUnexploded = (explodeFactor < 0.005) && !isCutaway && !isXRay;

        // When a hollow organ is completely closed (0% explode, no cutaway, no X-ray),
        // or when viewing another organ in non-exploded mode, inner layers (idx > 0)
        // are physically enclosed inside Serosa/Adventitia (idx === 0) and should not render on the exterior.
        if (layerIdx > 0 && (isClosedUnexploded || (selectedId && selectedId !== organId))) {
          mesh.visible = false;
          return;
        }

        if (!selectedId) {
          mesh.visible = true;
          mesh.material.transparent = isXRay;
          mesh.material.opacity = isXRay ? 0.35 : 1.0;
          if (mesh.material.emissive) mesh.material.emissive.setHex(0x000000);
        } else if (selectedId === organId) {
          mesh.visible = true;
          mesh.material.transparent = isXRay;
          mesh.material.opacity = isXRay ? 0.45 : 1.0;
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

      const isBone = rawNameLow.includes('mandib') || rawNameLow.includes('maxill');

      if (!selectedId) {
        mesh.visible = true;
        mesh.material.transparent = isXRay || organId === 'peritoneum_omentum' || isBone;
        mesh.material.opacity = isXRay ? 0.35 : (organId === 'peritoneum_omentum' ? 0.45 : (isBone ? 0.85 : 1.0));
        if (mesh.material.emissive) {
          mesh.material.emissive.setHex(organId === 'gallbladder_tree' ? 0x064e3b : 0x000000);
        }
      } else if (organId === selectedId) {
        mesh.visible = true;
        // In Liver selection, make liver segments semi-transparent (0.38) so internal vascular tree shines through
        mesh.material.transparent = isXRay || (selectedId === 'liver');
        mesh.material.opacity = isXRay ? 0.45 : (selectedId === 'liver' ? 0.38 : (isBone ? 0.85 : 1.0));
        if (mesh.material.emissive) mesh.material.emissive.setHex(0x221508);
      } else if (selectedId === 'liver' && isLiverOrVascular(organId)) {
        // When Liver is selected, keep portal system, hepatic arteries & veins solid and sharp inside the liver segments!
        mesh.visible = true;
        mesh.material.transparent = false;
        mesh.material.opacity = 1.0;
        if (mesh.material.emissive) mesh.material.emissive.setHex(0x000000);
      } else if (isLiverOrVascular(selectedId) && organId === 'liver') {
        // When viewing portal system or hepatic artery/vein, keep liver parenchyma ghosted (opacity 0.22)
        mesh.visible = true;
        mesh.material.transparent = true;
        mesh.material.opacity = 0.22;
        if (mesh.material.emissive) mesh.material.emissive.setHex(0x000000);
      } else if (isLiverOrVascular(selectedId) && isLiverOrVascular(organId)) {
        // Related vascular branches remain visible
        mesh.visible = true;
        mesh.material.transparent = false;
        mesh.material.opacity = 0.95;
        if (mesh.material.emissive) mesh.material.emissive.setHex(0x000000);
      } else if (selectedId === 'portal_system' && ['small_intestine', 'large_intestine', 'stomach', 'pancreas', 'duodenum'].includes(organId)) {
        // When viewing portal circulation, show digestive organs in ghosted semi-transparency so mesenteric veins can be traced directly from gut to liver!
        mesh.visible = true;
        mesh.material.transparent = true;
        mesh.material.opacity = isIsolate ? 0.18 : 0.25;
        if (mesh.material.emissive) mesh.material.emissive.setHex(0x000000);
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
    });
  }

  _highlightActiveWallLayer(layerId) {
    this.clickableMeshes.forEach(mesh => {
      if (!mesh.userData.isWallLayer && !mesh.userData.isStomachWallLayer) return;
      if (mesh.userData.wallLayerId === layerId) {
        if (mesh.material && mesh.material.emissive) mesh.material.emissive.setHex(0x331111);
      } else {
        if (mesh.material && mesh.material.emissive) mesh.material.emissive.setHex(0x000000);
      }
    });
  }

  focusStomach() {
    const center = this.stomachBuilder
      ? this.stomachBuilder.getBaseCenter('stomach')
      : new THREE.Vector3(0.688, 0.339, 0.206);

    this._smoothMoveCameraTarget(
      [center.x - 0.25, center.y + 0.10, center.z],
      [center.x - 0.25, center.y + 0.30, center.z + 8.6]
    );
  }

  focusDuodenum() {
    const center = this.stomachBuilder
      ? this.stomachBuilder.getBaseCenter('duodenum')
      : new THREE.Vector3(-0.3, 0.1, 0.0);

    this._smoothMoveCameraTarget(
      [center.x - 0.20, center.y + 0.05, center.z],
      [center.x - 0.20, center.y + 0.20, center.z + 6.4]
    );
  }

  focusSmallIntestine() {
    const center = this.stomachBuilder
      ? this.stomachBuilder.getBaseCenter('small_intestine')
      : new THREE.Vector3(0.0, -0.6, 0.0);

    this._smoothMoveCameraTarget(
      [center.x - 0.25, center.y + 0.05, center.z],
      [center.x - 0.25, center.y + 0.25, center.z + 8.4]
    );
  }

  focusColon() {
    const center = this.stomachBuilder
      ? this.stomachBuilder.getBaseCenter('large_intestine')
      : new THREE.Vector3(0.0, -0.3, 0.0);

    this._smoothMoveCameraTarget(
      [center.x - 0.20, center.y + 0.05, center.z],
      [center.x - 0.20, center.y + 0.25, center.z + 11.6]
    );
  }

  focusGallbladder() {
    const center = this.stomachBuilder
      ? this.stomachBuilder.getBaseCenter('gallbladder_tree')
      : new THREE.Vector3(-0.6, 0.3, 0.2);

    this._smoothMoveCameraTarget(
      [center.x - 0.15, center.y + 0.05, center.z],
      [center.x - 0.15, center.y + 0.18, center.z + 4.4]
    );
  }

  focusEsophagus() {
    const center = this.stomachBuilder
      ? this.stomachBuilder.getBaseCenter('esophagus')
      : new THREE.Vector3(0.1, 2.2, -0.2);

    this._smoothMoveCameraTarget(
      [center.x - 0.15, center.y, center.z],
      [center.x - 0.15, center.y + 0.15, center.z + 8.2]
    );
  }

  focusLiver() {
    const meshes = this.clickableMeshes.filter(m => m.userData.organId === 'liver');
    const bbox = new THREE.Box3();
    meshes.forEach(m => {
      m.updateWorldMatrix(true, false);
      bbox.expandByObject(m);
    });
    const center = meshes.length > 0 ? bbox.getCenter(new THREE.Vector3()) : new THREE.Vector3(-0.6, 0.8, 0.0);

    this._smoothMoveCameraTarget(
      [center.x - 0.25, center.y + 0.05, center.z],
      [center.x - 0.25, center.y + 0.25, center.z + 9.2]
    );
  }

  focusOrgan(organId) {
    const meshes = this.clickableMeshes.filter(m => m.userData.organId === organId);
    if (meshes.length === 0) return;

    const bbox = new THREE.Box3();
    meshes.forEach(m => {
      m.updateWorldMatrix(true, false);
      bbox.expandByObject(m);
    });
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    const dist = Math.max(4.8, Math.min(11.0, Math.max(size.x, size.y, size.z) * 2.2));

    this._smoothMoveCameraTarget(
      [center.x, center.y, center.z],
      [center.x, center.y + 0.3, center.z + dist]
    );
  }

  animateToggleExplode() {
    if (!this.explosionManager) return;
    const current = this.dissectionVM.state.explodeFactor || 0;
    const target = current > 0.3 ? 0.0 : 1.0;
    this.explosionManager.animateExplodeTo(this.dissectionVM, target, 650);
  }

  _updateLayerVisibility(visibleLayers) {
    this._updateOrganVisuals(this.sceneVM.state.selectedOrganId);
    this._syncExplosion();
  }

  _smoothMoveCameraTarget(targetCoords, posCoords) {
    const target = new THREE.Vector3(...targetCoords);
    const startTarget = this.controls.target.clone();
    const startPos = this.camera.position.clone();
    const endPos = posCoords ? new THREE.Vector3(...posCoords) : null;

    let progress = 0;
    const animateFocus = () => {
      progress += 0.06;
      const t = 1 - Math.pow(1 - Math.min(1, progress), 3);
      this.controls.target.lerpVectors(startTarget, target, t);
      if (endPos) {
        this.camera.position.lerpVectors(startPos, endPos, t);
      }
      if (progress < 1) {
        requestAnimationFrame(animateFocus);
      }
    };
    animateFocus();
  }

  _animate() {
    requestAnimationFrame(this._animate);
    this.controls.update();

    if (this.landmarksRoot && this.landmarksRoot.visible) {
      const time = Date.now() * 0.003;
      const activeId = this.appVM.landmarksVM ? this.appVM.landmarksVM.state.activeLandmarkId : null;
      this.landmarkMarkers.forEach((mesh, id) => {
        const isActive = (id === activeId);
        const pulseScale = isActive ? (1.35 + 0.25 * Math.sin(time * 2.0)) : (1.0 + 0.12 * Math.sin(time));
        mesh.scale.set(pulseScale, pulseScale, pulseScale);
        if (mesh.material && mesh.material.emissive) {
          if (isActive) {
            mesh.material.emissive.setHex(0xef4444); // Active selected landmark glows bright coral-red
          } else if (mesh.userData.isBack) {
            mesh.material.emissive.setHex(0xd97706); // Dorsal back landmarks glow warm amber
          } else {
            mesh.material.emissive.setHex(0x0284c7); // Anterior abdominal wall landmarks glow sky blue
          }
        }
      });
    }

    this.renderer.render(this.scene, this.camera);
  }
}
