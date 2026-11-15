import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ProceduralTextures } from './modules/ProceduralTextures.js?v=20261115_v29';
import { StomachLayersBuilder } from './modules/StomachLayersBuilder.js?v=20261115_v29';
import { ExplosionManager } from './modules/ExplosionManager.js?v=20261115_v29';
import { HoverCalloutView } from './modules/HoverCalloutView.js?v=20261115_v29';
import { LiverLigamentsBuilder } from './modules/LiverLigamentsBuilder.js?v=20261115_v30';
import { HEATMAP_CATALOG, getThermalPalette, sampleContinuousThermalColor } from '../data/heatmapCatalog.js?v=20261115_v29';

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
    this.liverLigamentsBuilder = new LiverLigamentsBuilder();
    this.liverLigaments = [];
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
      <div style="width: 32px; height: 32px; border: 3px solid #F1F5F9; border-top-color: #C92A2A; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 14px;"></div>
      <div id="loading-status-text" style="font-size: 14px; font-weight: 600; color: #1B1B24; margin-bottom: 10px; font-family: 'Plus Jakarta Sans', sans-serif;">
        Đang tải mô hình 3D Hệ Tiêu Hóa ĐHYHN...
      </div>
      <div style="width: 240px; height: 4px; background: #E2E8F0; border-radius: 2px; overflow: hidden;">
        <div id="loading-progress-bar" style="width: 20%; height: 100%; background: #C92A2A; transition: width 0.15s;"></div>
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
      this.currentTheme === 'light' ? 0xffffff : 0x0f172a
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
      loadModel('./assets/models/DigestiveSystem.glb?v=20261115_v30'),
      loadModel('./assets/models/UpperDigestiveTract.glb'),
      loadModel('./assets/models/HepaticVessels.glb?v=20261115_v30'),
      fetch('./data/si_tube_progress.bin?v=20261103_v22').then(r => r.arrayBuffer()).catch(() => null)
    ]).then(([digestiveGltf, upperGltf, hepaticGltf, siBuffer]) => {
      if (siBuffer) {
        this.siTubeProgress = new Float32Array(siBuffer);
      }
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

    const tex = this.proceduralTextures.getTextures();

    const materials = {
      liver: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: tex.liverTexture,
        roughness: 0.32,
        metalness: 0.10,
        side: THREE.DoubleSide
      }),
      gallbladder_tree: new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x064e3b, roughness: 0.25, metalness: 0.2, side: THREE.DoubleSide }),
      stomach: new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide }),
      pancreas: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: tex.pancreasTexture,
        roughness: 0.58,
        metalness: 0.08,
        side: THREE.DoubleSide
      }),
      duodenum: new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide }),
      small_intestine: new THREE.MeshStandardMaterial({ color: 0xf87171, roughness: 0.5, metalness: 0.08, side: THREE.DoubleSide }),
      large_intestine: new THREE.MeshStandardMaterial({ color: 0x84cc16, roughness: 0.48, metalness: 0.1, side: THREE.DoubleSide }),
      esophagus: new THREE.MeshStandardMaterial({ color: 0xfbcfe8, roughness: 0.4, metalness: 0.05, side: THREE.DoubleSide }),
      peritoneum_omentum: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: tex.greaterOmentumTexture,
        roughness: 0.60,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide
      }),

      // Upper GI PBR Materials
      pharynx: new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex.pharynxTexture, roughness: 0.38, metalness: 0.05, side: THREE.DoubleSide }),
      tongue: new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex.tongueTexture, roughness: 0.36, metalness: 0.05, side: THREE.DoubleSide }),
      palate: new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex.palateTexture, roughness: 0.40, metalness: 0.04, side: THREE.DoubleSide }),
      epiglottis: new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex.palateTexture, roughness: 0.42, metalness: 0.04, side: THREE.DoubleSide }),
      salivary_gland: new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex.salivaryGlandTexture, roughness: 0.48, metalness: 0.06, side: THREE.DoubleSide }),
      salivary_glands: new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex.salivaryGlandTexture, roughness: 0.48, metalness: 0.06, side: THREE.DoubleSide }),
      gingiva: new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex.gingivaTexture, roughness: 0.32, metalness: 0.04, side: THREE.DoubleSide }),
      teeth: new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex.teethTexture, roughness: 0.16, metalness: 0.04, side: THREE.DoubleSide }),
      teeth_and_jaw: new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex.teethTexture, roughness: 0.20, metalness: 0.04, side: THREE.DoubleSide }),
      mandible: new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex.boneTexture, roughness: 0.52, metalness: 0.05, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
      maxilla: new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex.boneTexture, roughness: 0.52, metalness: 0.05, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
      hyoid_bone: new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex.boneTexture, roughness: 0.50, metalness: 0.05, side: THREE.DoubleSide }),
      tongue_cap: new THREE.MeshStandardMaterial({ color: 0xe0536c, map: tex.tongueTexture, roughness: 0.38, metalness: 0.04, side: THREE.DoubleSide }),
      mandible_cap: new THREE.MeshStandardMaterial({ color: 0xf5eedf, map: tex.boneTexture, roughness: 0.48, metalness: 0.05, side: THREE.DoubleSide }),
      palate_cap: new THREE.MeshStandardMaterial({ color: 0xe87a90, map: tex.palateTexture, roughness: 0.40, metalness: 0.04, side: THREE.DoubleSide }),
      epiglottis_cap: new THREE.MeshStandardMaterial({ color: 0xe5989b, map: tex.palateTexture, roughness: 0.42, metalness: 0.04, side: THREE.DoubleSide }),
      hyoid_cap: new THREE.MeshStandardMaterial({ color: 0xf5eedf, map: tex.boneTexture, roughness: 0.48, metalness: 0.05, side: THREE.DoubleSide }),

      // Hepatic & Circulatory PBR Materials
      portal_system: new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.35, metalness: 0.18, side: THREE.DoubleSide }),
      portal_vein: new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.35, metalness: 0.18, side: THREE.DoubleSide }),
      hepatic_artery: new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.30, metalness: 0.20, side: THREE.DoubleSide }),
      hepatic_veins: new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.32, metalness: 0.18, side: THREE.DoubleSide }),
      inferior_vena_cava: new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.32, metalness: 0.18, side: THREE.DoubleSide }),
      pancreatic_duct: new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, roughness: 0.20, metalness: 0.15, side: THREE.DoubleSide })
    };
    this.materials = materials;

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

      // Unified Upper Digestive Tract: Oral Cavity, Teeth, Jaws, Tongue, Pharynx & Salivary Glands
      if (['teeth', 'mandible', 'maxilla', 'gingiva', 'pharynx', 'palate', 'epiglottis', 'hyoid_bone', 'tongue', 'salivary_gland', 'salivary_glands', 'oral_cavity'].includes(rawId) ||
          low.includes('incisor') || low.includes('canine') || low.includes('premolar') || low.includes('molar') ||
          low.includes('tooth') || low.includes('teeth') || low.includes('mandib') || low.includes('maxill') || low.includes('gingiva') ||
          low.includes('pharynx') || low.includes('palate') || low.includes('uvula') || low.includes('epiglottis') || low.includes('hyoid') ||
          low.includes('tongue') || low.includes('gland')) {
        return 'oral_cavity';
      }
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

      // Synthesize 4 Concentric Histological Layers for Bile Duct
      if (child.name === 'Bile_duct') {
        const layers = this.stomachBuilder.createLayers('bile_duct', child, this.appVM.organsData);
        this.bileDuctWallMeshes = layers;
        layers.forEach((lMesh) => {
          lMesh.userData.organId = 'gallbladder_tree';
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

      // Partition Gingiva into Upper_Gingiva and Lower_Gingiva to prevent inter-dental clipping during explosion
      if (child.name === 'Gingiva' || low === 'gingiva') {
        const geom = child.geometry;
        const posAttr = geom && geom.attributes && geom.attributes.position;
        const indexAttr = geom && geom.index;

        if (indexAttr && posAttr) {
          const upperIndices = [];
          const lowerIndices = [];
          const count = indexAttr.count;

          for (let i = 0; i < count; i += 3) {
            const a = indexAttr.getX(i);
            const b = indexAttr.getX(i + 1);
            const c = indexAttr.getX(i + 2);
            const avgY = (posAttr.getY(a) + posAttr.getY(b) + posAttr.getY(c)) / 3.0;
            if (avgY > 153.5) {
              upperIndices.push(a, b, c);
            } else {
              lowerIndices.push(a, b, c);
            }
          }

          const baseGingivaMat = materials.gingiva || new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex.gingivaTexture, roughness: 0.32, metalness: 0.04, side: THREE.DoubleSide });

          const upperGeom = geom.clone();
          upperGeom.setIndex(upperIndices);
          const upperGingiva = new THREE.Mesh(upperGeom, baseGingivaMat.clone());
          upperGingiva.name = 'Upper_Gingiva';
          upperGingiva.castShadow = true;
          upperGingiva.receiveShadow = true;
          upperGingiva.userData = {
            organId: 'oral_cavity',
            oralSubPart: 'gingiva',
            rawName: 'Upper_Gingiva',
            initialPos: child.position.clone(),
            initialScale: child.scale.clone()
          };

          const lowerGeom = geom.clone();
          lowerGeom.setIndex(lowerIndices);
          const lowerGingiva = new THREE.Mesh(lowerGeom, baseGingivaMat.clone());
          lowerGingiva.name = 'Lower_Gingiva';
          lowerGingiva.castShadow = true;
          lowerGingiva.receiveShadow = true;
          lowerGingiva.userData = {
            organId: 'oral_cavity',
            oralSubPart: 'gingiva',
            rawName: 'Lower_Gingiva',
            initialPos: child.position.clone(),
            initialScale: child.scale.clone()
          };

          // Support 50% midsagittal cutaway shader
          [upperGingiva, lowerGingiva].forEach((gMesh) => {
            const mat = gMesh.material;
            mat.side = THREE.DoubleSide;
            mat.userData.uCutawayActive = { value: 0.0 };
            mat.onBeforeCompile = (shader) => {
              shader.uniforms.uCutawayActive = mat.userData.uCutawayActive;
              shader.vertexShader = `
                varying vec3 vLocalPos;
              ` + shader.vertexShader.replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
                 vLocalPos = position;`
              );
              shader.fragmentShader = `
                uniform float uCutawayActive;
                varying vec3 vLocalPos;
              ` + shader.fragmentShader.replace(
                '#include <clipping_planes_fragment>',
                `#include <clipping_planes_fragment>
                 if (uCutawayActive > 0.5 && vLocalPos.x > 0.001) discard;`
              );
            };
          });

          if (child.parent) {
            child.parent.add(upperGingiva);
            child.parent.add(lowerGingiva);
          }
          child.visible = false;

          this.clickableMeshes.push(upperGingiva, lowerGingiva);
          this.allVisceralMeshes.push(upperGingiva, lowerGingiva);
          return;
        }
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

      let baseMat;
      if (child.name === 'Tongue_Cap') {
        child.userData.oralSubPart = 'tongue';
        child.userData.isOralCap = true;
        child.visible = false;
        baseMat = materials.tongue_cap;
      } else if (child.name === 'Mandible_Cap') {
        child.userData.oralSubPart = 'mandible';
        child.userData.isOralCap = true;
        child.visible = false;
        baseMat = materials.mandible_cap;
      } else if (child.name === 'Palate_Cap' || child.name === 'Soft_Palate_Cap') {
        child.userData.oralSubPart = 'palate';
        child.userData.isOralCap = true;
        child.visible = false;
        baseMat = materials.palate_cap;
      } else if (child.name === 'Epiglottis_Cap') {
        child.userData.oralSubPart = 'epiglottis';
        child.userData.isOralCap = true;
        child.visible = false;
        baseMat = materials.epiglottis_cap;
      } else if (child.name === 'Hyoid_Bone_Cap' || child.name === 'Hyoid_Cap') {
        child.userData.oralSubPart = 'hyoid';
        child.userData.isOralCap = true;
        child.visible = false;
        baseMat = materials.hyoid_cap;
      } else if (organId === 'oral_cavity') {
        let subPart = 'teeth';
        if (low.includes('mandib')) subPart = 'mandible';
        else if (low.includes('maxill')) subPart = 'maxilla';
        else if (low.includes('gingiva')) subPart = 'gingiva';
        else if (low.includes('tongue')) subPart = 'tongue';
        else if (low.includes('pharynx')) subPart = 'pharynx';
        else if (low.includes('palate') || low.includes('uvula')) subPart = 'palate';
        else if (low.includes('epiglottis')) subPart = 'epiglottis';
        else if (low.includes('hyoid')) subPart = 'hyoid';
        else if (low.includes('gland')) subPart = 'salivary_glands';
        child.userData.oralSubPart = subPart;
        if (['mandible', 'maxilla', 'hyoid', 'teeth'].includes(subPart)) {
          child.userData.isBone = true;
        }
      }

      if (!baseMat) {
        baseMat = materials[organId] || materials.teeth_and_jaw || materials.stomach;
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
        } else if (low.includes('tongue')) {
          baseMat = materials.tongue;
        } else if (low.includes('pharynx')) {
          baseMat = materials.pharynx;
        } else if (low.includes('portal') || low.includes('splenic_vein') || low.includes('mesenteric_vein') || low.includes('colic_vein') || low.includes('gastro-omental') || low.includes('gastro_omental')) {
          baseMat = materials.portal_vein;
        } else if (low.includes('hepatic_vein')) {
          baseMat = materials.hepatic_veins;
        } else if (low.includes('cava')) {
          baseMat = materials.inferior_vena_cava;
        } else if (low.includes('artery') || low.includes('coeliac') || low.includes('celiac')) {
          baseMat = materials.hepatic_artery;
        } else if (low.includes('pancreatic_duct') || low.includes('pancreatic duct') || (organId === 'pancreas' && (low.includes('wirsung') || low.includes('santorini') || low.includes('duct')))) {
          baseMat = materials.pancreatic_duct;
          child.userData.isPancreaticDuct = true;
        }
      }

      // Ensure mesh has UV coordinates for diffuse textures
      if (child.isMesh && child.geometry && !child.geometry.attributes.uv) {
        this.stomachBuilder._assignAnatomicalUVs(child.geometry);
      }

      const mat = baseMat.clone();
      for (const [k, hex] of Object.entries(couinaudColors)) {
        if (low.includes(k)) {
          child.userData.couinaudColor = hex;
          // In standard histology mode, preserve authentic liver texture without dark tinting;
          // discrete step heatmaps are dynamically applied in _applyFunctionalHeatmaps
          if (organId !== 'liver') {
            mat.color.setHex(hex);
          }
          break;
        }
      }

      // 50% Midsagittal Cutaway Shader for Oral Cavity (soft tissues, jawbones, teeth, and glands)
      if (organId === 'oral_cavity') {
        const rawNameLow = child.name.toLowerCase();
        const isLeftStructure = rawNameLow.endsWith('l') || rawNameLow.includes('maxillal') || rawNameLow.includes('_l');
        const isRightStructure = rawNameLow.endsWith('r') || rawNameLow.includes('maxillar') || rawNameLow.includes('_r');
        const isMidline = ['mandib', 'gingiva', 'tongue', 'pharynx', 'palat', 'uvula', 'epiglottis', 'hyoid'].some(k => rawNameLow.includes(k));

        if (!child.userData.isOralCap && (isMidline || isLeftStructure)) {
          mat.side = THREE.DoubleSide;
          mat.userData.uCutawayActive = { value: 0.0 };
          mat.onBeforeCompile = (shader) => {
            shader.uniforms.uCutawayActive = mat.userData.uCutawayActive;
            shader.vertexShader = `
              varying vec3 vLocalPos;
            ` + shader.vertexShader.replace(
              '#include <begin_vertex>',
              `#include <begin_vertex>
               vLocalPos = position;`
            );

            const discardRule = isLeftStructure
              ? `if (uCutawayActive > 0.5) discard;`
              : `if (uCutawayActive > 0.5 && vLocalPos.x > 0.001) discard;`;

            shader.fragmentShader = `
              uniform float uCutawayActive;
              varying vec3 vLocalPos;
            ` + shader.fragmentShader.replace(
              '#include <clipping_planes_fragment>',
              `#include <clipping_planes_fragment>
               ${discardRule}`
            );
          };
        }
      }

      // 50% Coronal Cutaway Discard Shader for Circulatory Vessels (Stomach anterior region)
      if (['portal_system', 'hepatic_artery', 'hepatic_veins'].includes(organId)) {
        mat.side = THREE.DoubleSide;
        mat.userData.uVesselCutActive = { value: 0.0 };
        mat.userData.uVesselCutZ = { value: 7.2 };
        mat.onBeforeCompile = (shader) => {
          shader.uniforms.uVesselCutActive = mat.userData.uVesselCutActive;
          shader.uniforms.uVesselCutZ = mat.userData.uVesselCutZ;
          shader.vertexShader = `
            varying vec3 vVesselWorldPos;
          ` + shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
             vVesselWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;`
          );
          shader.fragmentShader = `
            uniform float uVesselCutActive;
            uniform float uVesselCutZ;
            varying vec3 vVesselWorldPos;
          ` + shader.fragmentShader.replace(
            '#include <clipping_planes_fragment>',
            `#include <clipping_planes_fragment>
             if (uVesselCutActive > 0.5 && vVesselWorldPos.z > uVesselCutZ && vVesselWorldPos.x > -2.5 && vVesselWorldPos.x < 7.5 && vVesselWorldPos.y > 109.5 && vVesselWorldPos.y < 122.5) discard;`
          );
        };
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
      // Register dedicated Epiploic Appendages (Bọng Mỡ Mạc Nối) ribbon grouped with Serosa
      if (colonLayers[0] && colonLayers[0].userData && colonLayers[0].userData.epiploicMesh) {
        const epiMesh = colonLayers[0].userData.epiploicMesh;
        this.clickableMeshes.push(epiMesh);
        this.allVisceralMeshes.push(epiMesh);
      }
    }

    // Synthesize 7 Peritoneal Ligaments of the Human Liver
    this.liverLigaments = this.liverLigamentsBuilder.buildLigaments(
      rootGroup,
      this.clickableMeshes,
      this.allVisceralMeshes
    );

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
      oral_cavity: 1, pharynx: 1, tongue: 1, teeth_and_jaw: 1, salivary_glands: 1,
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
      './assets/models/TorsoAbdominalWall.glb?v=20261115_v33',
      (gltf) => {
        const curOpacity = this.dissectionVM.state.torsoSkinOpacity !== undefined ? this.dissectionVM.state.torsoSkinOpacity : 0.50;
        gltf.scene.traverse((child) => {
          if (child.isMesh) {
            const hasVCols = Boolean(child.geometry?.attributes?.color);
            const mat = new THREE.MeshStandardMaterial({
              color: hasVCols ? 0xffffff : 0xdcb08a,
              vertexColors: hasVCols,
              roughness: 0.46,
              metalness: 0.04,
              transparent: true,
              opacity: curOpacity,
              side: THREE.FrontSide,
              depthWrite: false
            });
            child.material = mat;
            child.renderOrder = 10;
            child.castShadow = false;
            child.receiveShadow = false;
            child.userData = { isTorsoSkin: true };
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
   * Natural skin tone shader color for the translucent torso reference silhouette.
   * Deliberately omits musculoskeletal hover labels so the app stays focused on the digestive system.
   */
  _getTorsoSkinColor(rawName = '') {
    const low = rawName.toLowerCase();
    if (low.includes('iliocostalis') || low.includes('longissimus') || low.includes('spinalis') || low.includes('quadratus_lumborum')) {
      return 0xcca17c;
    }
    if (low.includes('fascia') || low.includes('linea_alba') || low.includes('ligament')) {
      return 0xe6d1be;
    }
    if (low.includes('serratus') || low.includes('rhomboid') || low.includes('levator') || low.includes('infraspinatus') || low.includes('teres')) {
      return 0xd29d71;
    }
    return 0xd4a373;
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

    const pinGeo = new THREE.SphereGeometry(0.11, 20, 20);
    const ringGeo = new THREE.RingGeometry(0.15, 0.21, 24);

    this.appVM.landmarksData.forEach(lm => {
      const isBackLandmark = (lm.coordinates && lm.coordinates[2] < 0);

      // 1. Hình tròn / cầu đỏ rực (tương tự huyệt vị chuẩn Châm Cứu 3D)
      const pinMat = new THREE.MeshBasicMaterial({
        color: 0xef4444,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -4,
        transparent: true,
        opacity: 0.95
      });
      const pinMesh = new THREE.Mesh(pinGeo, pinMat);
      pinMesh.position.set(...lm.coordinates);
      pinMesh.renderOrder = 15;
      pinMesh.userData = {
        isLandmarkPin: true,
        landmarkId: lm.id,
        name: lm.name,
        category: lm.category,
        description: lm.description,
        isBack: isBackLandmark
      };

      // 2. Vòng hào quang màu vàng xung quanh (Pulsing Yellow Halo Ring)
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -4
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.renderOrder = 15;
      ringMesh.userData = pinMesh.userData;
      ringMesh.lookAt(this.camera.position);
      pinMesh.add(ringMesh);

      this.landmarksRoot.add(pinMesh);
      this.landmarkMarkers.set(lm.id, pinMesh);
    });

    this.landmarksRoot.visible = (this.appVM.state.activeMode === 'pathology');
  }

  /**
   * Universal Hot-to-Cold Thermal Palette Generator.
   * Samples n colors smoothly along the scientific thermal gradient:
   * Hot (Red/Orange) -> Warm (Gold/Amber) -> Neutral (Green) -> Cool (Cyan) -> Cold (Blue/Violet).
   * Selected dynamically based on the exact number of functional regions in each organ.
   */
  /**
   * Initializes 3D curved centerlines along anatomical organ trajectories
   * for silky-smooth, continuous gradient parameterization (Zero Jagged Zigzags).
   */
  _initHeatmapCenterlines() {
    if (this._stomachPts) return;

    // Stomach C-curved trajectory: Fundus -> Cardia -> Upper Corpus -> Lower Corpus -> Antrum -> Pylorus
    const stomachCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(2.5, 121.8, 3.2),  // 0.00: Fundus (Hot Coral Rose - Nóng nhất)
      new THREE.Vector3(1.6, 119.5, 3.8),  // 0.20: Cardia (Warm Peach)
      new THREE.Vector3(2.7, 117.2, 3.2),  // 0.40: Upper Corpus (Sunny Butter)
      new THREE.Vector3(2.2, 114.8, 2.9),  // 0.60: Lower Corpus (Pastel Mint)
      new THREE.Vector3(0.5, 113.4, 2.8),  // 0.80: Antrum (Sky Aqua)
      new THREE.Vector3(-1.5, 114.0, 2.8)  // 1.00: Pylorus (Pastel Lavender - Lạnh nhất)
    ]);
    this._stomachPts = stomachCurve.getPoints(50);

    // Duodenum C-loop trajectory: D1 Bulb -> Sup Flexure L1 -> D2 Descending -> Inf Flexure L3 -> D3 -> D4 Treitz
    const duodCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.8, 113.2, 2.5), // 0.00: D1 Hành tá tràng (Hot Coral Rose - Nóng nhất)
      new THREE.Vector3(-4.4, 111.5, 2.2), // 0.20: Góc tá trên L1 (Warm Peach)
      new THREE.Vector3(-5.3, 108.0, 1.8), // 0.40: D2 Đoạn xuống & Nhú Vater (Sunny Butter)
      new THREE.Vector3(-4.6, 104.8, 1.6), // 0.60: Góc tá dưới L3 (Pastel Mint)
      new THREE.Vector3(-2.2, 105.2, 1.5), // 0.80: D3 Đoạn ngang (Sky Aqua)
      new THREE.Vector3(0.2, 108.2, 1.5)   // 1.00: D4 Đoạn lên & Góc Treitz (Pastel Lavender - Lạnh nhất)
    ]);
    this._duodPts = duodCurve.getPoints(50);

    // Large Intestine U-shaped frame trajectory: Cecum/Appendix -> Ascending -> Transverse -> Descending -> Sigmoid
    const colonCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-4.8, 92.0, 2.0),  // 0.00: Manh tràng & Ruột thừa (Hot Coral Rose - Nóng nhất)
      new THREE.Vector3(-4.6, 102.0, 2.0), // 0.22: Đại tràng lên (Warm Peach)
      new THREE.Vector3(-3.8, 107.0, 2.0), // 0.35: Góc gan
      new THREE.Vector3(0.0, 108.5, 2.5),  // 0.50: Đại tràng ngang (Sunny Butter)
      new THREE.Vector3(3.8, 107.0, 2.0),  // 0.65: Góc lách
      new THREE.Vector3(4.5, 100.0, 1.8),  // 0.78: Đại tràng xuống (Sky Aqua)
      new THREE.Vector3(2.5, 91.0, 1.5)    // 1.00: Đại tràng sigma (Pastel Lavender - Lạnh nhất)
    ]);
    this._colonPts = colonCurve.getPoints(60);
  }

  /**
   * Projects any 3D coordinate (px, py, pz) onto a centerline point array,
   * returning normalized parameter s in [0.0, 1.0].
   */
  _projectToCenterline(px, py, pz, pts) {
    if (!pts || pts.length === 0) return 0.5;
    let minDistSq = Infinity;
    let bestIdx = 0;
    for (let j = 0; j < pts.length; j++) {
      const dx = px - pts[j].x;
      const dy = py - pts[j].y;
      const dz = pz - pts[j].z;
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq < minDistSq) {
        minDistSq = dSq;
        bestIdx = j;
      }
    }
    let s = bestIdx / (pts.length - 1);
    if (bestIdx > 0 && bestIdx < pts.length - 1) {
      const pPrev = pts[bestIdx - 1];
      const pNext = pts[bestIdx + 1];
      const segX = pNext.x - pPrev.x;
      const segY = pNext.y - pPrev.y;
      const segZ = pNext.z - pPrev.z;
      const segLenSq = segX * segX + segY * segY + segZ * segZ;
      if (segLenSq > 1e-6) {
        const vx = px - pPrev.x;
        const vy = py - pPrev.y;
        const vz = pz - pPrev.z;
        const dot = (vx * segX + vy * segY + vz * segZ) / segLenSq;
        const localT = Math.max(0, Math.min(1, dot));
        s = (bestIdx - 1 + localT * 2) / (pts.length - 1);
      }
    }
    return Math.max(0, Math.min(1, s));
  }

  /**
   * Samples a continuous, high-luminosity pastel-vibrant thermal color for parameter s in [0.0, 1.0].
   * Hot (Luminous Coral Rose) -> Warm Peach -> Sunny Butter -> Pastel Lime -> Fresh Mint Emerald
   * -> Luminous Sky Aqua -> Soft Cornflower -> Pastel Lavender -> Radiant Orchid Pink (Cold).
   * High lightness (L >= 62%-75%) ensures vivid, clean, museum-quality medical rendering.
   */
  _sampleContinuousThermalColor(s) {
    return sampleContinuousThermalColor(s);
  }

  /**
   * Generates n discrete colors sampled evenly along the continuous pastel thermal spectrum.
   */
  _getThermalPalette(n) {
    return getThermalPalette(n);
  }

  /**
   * Formats human-readable Vietnamese/Latin metadata for any hovered 3D mesh.
   */
  _buildHoverPayload(mesh, screenX, screenY) {
    if (mesh.userData && mesh.userData.isLigament) {
      return {
        organId: 'liver',
        wallLayerId: null,
        x: screenX,
        y: screenY,
        tag: 'DÂY CHẰNG GAN',
        badge: mesh.userData.latinName || 'Dây Chằng',
        title: mesh.userData.vietnameseName || mesh.name,
        subtitle: `${mesh.userData.description || ''} ${mesh.userData.clinicalNotes || ''}`.trim(),
        color: '#0284c7'
      };
    }

    const isRegions = (this.dissectionVM && this.dissectionVM.state.organDisplayMode === 'regions');
    const organId = mesh.userData.organId;

    // 1. Functional Heatmap Regions (reads single source of truth from HEATMAP_CATALOG)
    if (isRegions) {
      let catalogOrganId = organId;
      let regionKey = null;
      const low = (mesh.userData.rawName || mesh.name || '').toLowerCase();
      const hitPt = this._lastIntersectionPoint ? this._lastIntersectionPoint.clone() : new THREE.Vector3();
      const localPt = mesh.worldToLocal(hitPt.clone());

      if (organId === 'stomach' || mesh.userData.isStomachWallLayer) {
        catalogOrganId = 'stomach';
        this._initHeatmapCenterlines();
        const s = this._projectToCenterline(localPt.x, localPt.y, localPt.z, this._stomachPts);
        if (s < 0.18) regionKey = 'fundus';
        else if (s < 0.32) regionKey = 'cardia';
        else if (s < 0.65) regionKey = 'corpus';
        else if (s < 0.88) regionKey = 'antrum';
        else regionKey = 'pylorus';
      } else if (organId === 'pancreas' && !low.includes('duct')) {
        const s = THREE.MathUtils.clamp((localPt.x - (-3.8)) / (4.8 - (-3.8)), 0, 1);
        if (s < 0.25) regionKey = 'head';
        else if (s < 0.45) regionKey = 'neck';
        else if (s < 0.80) regionKey = 'body';
        else regionKey = 'tail';
      } else if (organId === 'duodenum') {
        this._initHeatmapCenterlines();
        const s = this._projectToCenterline(localPt.x, localPt.y, localPt.z, this._duodPts);
        if (s < 0.18) regionKey = 'd1';
        else if (s < 0.32) regionKey = 'flex_sup';
        else if (s < 0.58) regionKey = 'd2';
        else if (s < 0.72) regionKey = 'flex_inf';
        else if (s < 0.86) regionKey = 'd3';
        else regionKey = 'd4';
      } else if (organId === 'large_intestine') {
        this._initHeatmapCenterlines();
        const s = this._projectToCenterline(localPt.x, localPt.y, localPt.z, this._colonPts);
        if (s < 0.18) regionKey = 'cecum';
        else if (s < 0.38) regionKey = 'ascending';
        else if (s < 0.65) regionKey = 'transverse';
        else if (s < 0.85) regionKey = 'descending';
        else regionKey = 'sigmoid';
      } else if (organId === 'esophagus') {
        const s = THREE.MathUtils.clamp((145.0 - localPt.y) / (145.0 - 122.0), 0, 1);
        if (s < 0.28) regionKey = 'cervical';
        else if (s >= 0.80) regionKey = 'abdominal';
        else regionKey = 'thoracic';
      } else if (organId === 'gallbladder_tree') {
        if (low.includes('bile') || low.includes('duct')) regionKey = 'bile_duct';
        else if (localPt.z > 6.0) regionKey = 'fundus';
        else if (localPt.z <= 4.5) regionKey = 'neck';
        else regionKey = 'corpus';
      } else if (organId === 'small_intestine') {
        let progress = 0.5;
        if (this.siTubeProgress && this._lastHitIntersection && this._lastHitIntersection.face) {
          const vIdx = this._lastHitIntersection.face.a;
          if (this.siTubeProgress[vIdx] !== undefined) {
            progress = this.siTubeProgress[vIdx];
          }
        } else {
          progress = (localPt.x > 0 || localPt.y > 98.0) ? 0.2 : 0.8;
        }
        regionKey = (progress <= 0.40) ? 'jejunum' : 'ileum';
      } else if (organId === 'liver') {
        const segMatch = low.match(/\((i|ii|iii|iv|v|vi|vii|viii)\)/i);
        const roman = segMatch ? segMatch[1].toUpperCase() : 'I';
        const romanMap = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 };
        regionKey = `seg_${romanMap[roman] || 1}`;
      } else if (organId === 'peritoneum_omentum') {
        if (low.includes('lesser') || low.includes('minor') || low.includes('minus')) regionKey = 'lesser_omentum';
        else if (low.includes('mesocolon')) regionKey = 'mesocolon';
        else if (low.includes('appendix') || low.includes('meso')) regionKey = 'meso_appendix';
        else regionKey = 'greater_omentum';
      }

      if (regionKey && HEATMAP_CATALOG[catalogOrganId]) {
        const c = HEATMAP_CATALOG[catalogOrganId].find(r => r.key === regionKey);
        if (c) {
          return {
            organId: catalogOrganId,
            regionKey: c.key,
            wallLayerId: null,
            x: screenX,
            y: screenY,
            tag: c.tag,
            badge: c.badge,
            title: c.title,
            subtitle: c.subtitle,
            color: c.color
          };
        }
      }
    }

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
      oral_cavity: '#ec4899',
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
    } else if (organId === 'oral_cavity') {
      if (mesh.userData.isOralCap) {
        if (mesh.userData.oralSubPart === 'tongue') {
          subPartTitle = 'Mặt Cắt Midsagittal Lưỡi (Lingual Cross-Section)';
        } else if (mesh.userData.oralSubPart === 'mandible') {
          subPartTitle = 'Mặt Cắt Midsagittal Xương Hàm Dưới (Mandibular Cross-Section)';
        } else if (mesh.userData.oralSubPart === 'palate') {
          subPartTitle = 'Mặt Cắt Midsagittal Khẩu Cái Mềm & Lưỡi Gà (Velum Palatinum & Uvula)';
        } else if (mesh.userData.oralSubPart === 'epiglottis') {
          subPartTitle = 'Mặt Cắt Midsagittal Nắp Thanh Môn (Epiglottic Cross-Section)';
        } else if (mesh.userData.oralSubPart === 'hyoid') {
          subPartTitle = 'Mặt Cắt Midsagittal Xương Móng (Hyoid Cross-Section)';
        } else {
          subPartTitle = 'Mặt Cắt Midsagittal Giải Phẫu';
        }
      } else {
        const sub = mesh.userData.oralSubPart || '';
        if (sub === 'mandible') subPartTitle = 'Xương Hàm Dưới (Mandible)';
        else if (sub === 'maxilla') subPartTitle = 'Xương Hàm Trên (Maxilla)';
        else if (sub === 'gingiva') subPartTitle = 'Nướu Răng (Gingiva)';
        else if (sub === 'teeth') {
          if (low.includes('incisor')) subPartTitle = 'Răng Cửa (Incisor Tooth)';
          else if (low.includes('canine')) subPartTitle = 'Răng Nanh (Canine Tooth)';
          else if (low.includes('premolar')) subPartTitle = 'Răng Tiền Cối (Premolar Tooth)';
          else if (low.includes('molar')) subPartTitle = 'Răng Cối Lớn (Molar Tooth)';
          else subPartTitle = 'Răng & Khung Cung Răng (Tooth & Dental Arch)';
        } else if (sub === 'tongue') {
          subPartTitle = 'Lưỡi & Sàn Miệng (Tongue & Floor of Mouth)';
        } else if (sub === 'pharynx') {
          if (low.includes('naso')) subPartTitle = 'Hầu Mũi (Nasopharynx - Tỵ hầu)';
          else if (low.includes('oro')) subPartTitle = 'Hầu Miệng (Oropharynx - Khẩu hầu)';
          else if (low.includes('laryngo')) subPartTitle = 'Hầu Thanh Quản (Laryngopharynx - Thanh hầu)';
          else subPartTitle = 'Thành Hầu & Họng (Pharynx Wall)';
        } else if (sub === 'palate') {
          subPartTitle = 'Khẩu Cái Mềm & Lưỡi Gà (Soft Palate & Uvula)';
        } else if (sub === 'epiglottis') {
          subPartTitle = 'Nắp Thanh Môn (Epiglottis)';
        } else if (sub === 'hyoid') {
          subPartTitle = 'Xương Móng (Hyoid Bone)';
        } else if (sub === 'salivary_glands') {
          if (low.includes('parotid')) subPartTitle = 'Tuyến Mang Tai (Parotid Gland)';
          else if (low.includes('submandibular')) subPartTitle = 'Tuyến Dưới Hàm (Submandibular Gland)';
          else if (low.includes('sublingual')) subPartTitle = 'Tuyến Dưới Lưỡi (Sublingual Gland)';
          else subPartTitle = 'Tuyến Nước Bọt (Salivary Gland)';
        } else {
          subPartTitle = 'Vùng Miệng & Hầu (Oral Cavity & Pharynx)';
        }
      }
    } else if (organId === 'peritoneum_omentum') {
      if (low.includes('lesser')) subPartTitle = 'Mạc Nối Nhỏ (Lesser Omentum)';
      else if (low.includes('greater')) subPartTitle = 'Mạc Nối Lớn (Greater Omentum)';
      else if (low.includes('mesocolon')) subPartTitle = 'Mạc Treo Đại Tràng Ngang (Transverse Mesocolon)';
      else if (low.includes('appendix')) subPartTitle = 'Mạc Treo Ruột Thừa (Meso-appendix)';
      else subPartTitle = 'Hệ Thống Phúc Mạc & Mạc Nối';
    } else if (organId === 'salivary_glands') {
      if (low.includes('parotid')) subPartTitle = 'Tuyến Mang Tai (Parotid Gland)';
      else if (low.includes('submandibular')) subPartTitle = 'Tuyến Dưới Hàm (Submandibular Gland)';
      else if (low.includes('sublingual')) subPartTitle = 'Tuyến Dưới Lưỡi (Sublingual Gland)';
      else subPartTitle = 'Tuyến Nước Bọt Lớn';
    } else if (organId === 'pancreas') {
      if (low.includes('accessory')) {
        return {
          organId,
          wallLayerId: null,
          x: screenX,
          y: screenY,
          tag: 'HỆ THỐNG ỐNG TỤY NGOẠI TIẾT',
          badge: 'Đổ Vào Nhú Tá Bé',
          title: 'Ống Tụy Phụ (Santorini Duct)',
          subtitle: 'Tách từ ống tụy chính ở đầu tụy, dẫn lưu dịch tụy đổ vào Nhú tá bé (nằm trên Nhú tá lớn 2 cm).',
          color: '#38bdf8'
        };
      } else if (low.includes('duct')) {
        return {
          organId,
          wallLayerId: null,
          x: screenX,
          y: screenY,
          tag: 'HỆ THỐNG ỐNG TỤY NGOẠI TIẾT',
          badge: 'Đổ Vào Nhú Tá Lớn (Oddi)',
          title: 'Ống Tụy Chính (Main Pancreatic Duct of Wirsung)',
          subtitle: 'Chạy dọc suốt chiều dài tụy từ đuôi đến đầu, hợp lưu cùng Ống mật chủ tại Bóng Vater đổ vào Nhú tá lớn.',
          color: '#38bdf8'
        };
      } else {
        subPartTitle = 'Nhu Mô Tuyến Tụy (Pancreatic Parenchyma — Tuyến Pha)';
      }
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
        if (obj.userData.organId === 'oral_cavity') {
          const localPt = obj.worldToLocal(hit.point.clone());
          if (localPt.x > 0.001) continue;
        } else {
          const cutAttr = obj.geometry && obj.geometry.attributes && obj.geometry.attributes.aCutDist;
          const thresh = obj.material.userData.uCutThreshold ? obj.material.userData.uCutThreshold.value : 0.0;
          if (cutAttr && hit.face) {
            const dA = cutAttr.getX(hit.face.a);
            const dB = cutAttr.getX(hit.face.b);
            const dC = cutAttr.getX(hit.face.c);
            if ((dA + dB + dC) / 3.0 > thresh) continue;
          }
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
      // Touch interactions rely on tap/click pinning rather than hover-move
      if (e.pointerType && e.pointerType !== 'mouse') return;

      // If user is dragging OrbitControls with mouse button down, hide callout
      if (e.buttons !== 0) {
        this.hoverCallout.update(null);
        return;
      }

      const { x, y, screenX, screenY } = getCoords(e);
      this.mouse.set(x, y);
      this.raycaster.setFromCamera(this.mouse, this.camera);

      // In Pathology mode, check landmark pin intersections only (no musculoskeletal hover labels)
      if (this.appVM.state.activeMode === 'pathology' && this.landmarksRoot && this.landmarksRoot.visible) {
        const landmarkHits = this.raycaster.intersectObjects(this.landmarksRoot.children, true);
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
            color: hitPin.userData.isBack ? '#ef4444' : '#c8102e'
          });
          return;
        }
      }

      const rawHits = this.raycaster.intersectObjects(this.clickableMeshes, true);
      const validHit = this._getFirstVisibleHit(rawHits);

      if (validHit) {
        const hitMesh = validHit.object;
        this._lastIntersectionPoint = validHit.point.clone();
        this._lastHitMesh = hitMesh;
        this._lastHitIntersection = validHit;
        this.renderer.domElement.style.cursor = 'pointer';
        this._setHoverHighlight(hitMesh);

        const payload = this._buildHoverPayload(hitMesh, screenX, screenY);
        this.hoverCallout.update(payload);
        this.sceneVM.setHoveredPart(payload);
      } else {
        this.renderer.domElement.style.cursor = 'default';
        this._setHoverHighlight(null);
        if (!this._pinnedCallout) {
          this.hoverCallout.update(null);
        }
        this.sceneVM.setHoveredPart(null);
      }
    });

    this.renderer.domElement.addEventListener('pointerleave', () => {
      this._setHoverHighlight(null);
      if (!this._pinnedCallout) {
        this.hoverCallout.update(null);
      }
      this.sceneVM.setHoveredPart(null);
    });

    // Distinguish clean click/tap from orbit drag
    let downX = 0, downY = 0, downPointerType = 'mouse';
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
      downPointerType = e.pointerType || 'mouse';
    });

    this.renderer.domElement.addEventListener('click', (e) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;

      const { x, y, screenX, screenY } = getCoords(e);
      this.mouse.set(x, y);
      this.raycaster.setFromCamera(this.mouse, this.camera);

      // In Pathology mode, clicking a landmark pin activates it
      if (this.appVM.state.activeMode === 'pathology' && this.landmarksRoot && this.landmarksRoot.visible) {
        const landmarkHits = this.raycaster.intersectObjects(this.landmarksRoot.children, true);
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
        this._lastIntersectionPoint = validHit.point.clone();
        this._lastHitMesh = topHit;
        this._lastHitIntersection = validHit;

        const payload = this._buildHoverPayload(topHit, screenX, screenY);
        const isRegions = (this.dissectionVM && this.dissectionVM.state.organDisplayMode === 'regions');

        if (topHit.userData.isWallLayer || topHit.userData.isStomachWallLayer) {
          this.sceneVM.selectOrgan(topHit.userData.organId);
          this.dissectionVM.setActiveWallLayer(topHit.userData.wallLayerId);
        } else {
          this.sceneVM.selectOrgan(topHit.userData.organId);
        }

        this.sceneVM.setHoveredPart(payload);

        // Pin circular marker + callout on touch taps or in Functional Heatmap mode
        if (downPointerType !== 'mouse' || isRegions) {
          this._pinnedCallout = {
            worldPoint: validHit.point.clone(),
            payload,
            organId: topHit.userData.organId
          };
          this.hoverCallout.update(payload);
        } else {
          this._pinnedCallout = null;
        }
      } else {
        // Clicking empty space clears any pinned pin and dismisses the right drawer
        this._pinnedCallout = null;
        this.hoverCallout.update(null);
        this.sceneVM.setHoveredPart(null);
        this.container.dispatchEvent(new CustomEvent('canvas:empty-click'));
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

    // Update Midsagittal 50% Cutaway for Oral Cavity & Coronal Cutaway for Vessels (Isolated organ mode only)
    const isCutaway = this.dissectionVM.state.isCutawayOpen;
    const selectedId = this.sceneVM.state.selectedOrganId;
    const shouldCutOral = isCutaway && (selectedId === 'oral_cavity');
    const shouldCutStomachVessels = isCutaway && (selectedId === 'stomach');
    this.clickableMeshes.forEach((mesh) => {
      if (mesh.userData.organId === 'oral_cavity' && mesh.material && mesh.material.userData && mesh.material.userData.uCutawayActive) {
        mesh.material.userData.uCutawayActive.value = shouldCutOral ? 1.0 : 0.0;
      }
      if (mesh.userData.isOralCap) {
        mesh.visible = shouldCutOral;
      }
      if (['portal_system', 'hepatic_artery', 'hepatic_veins'].includes(mesh.userData.organId) && mesh.material && mesh.material.userData && mesh.material.userData.uVesselCutActive) {
        mesh.material.userData.uVesselCutActive.value = shouldCutStomachVessels ? 1.0 : 0.0;
      }
    });

    this._updateOrganVisuals(this.sceneVM.state.selectedOrganId);
  }

  _bindViewModel() {
    this.sceneVM.subscribe('selectedOrganId', (selectedId) => {
      if (this._pinnedCallout && (!selectedId || this._pinnedCallout.organId !== selectedId)) {
        this._pinnedCallout = null;
        if (this.hoverCallout) this.hoverCallout.update(null);
      }
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
      } else if (selectedId === 'oral_cavity') {
        this.focusOralCavity();
      } else if (selectedId) {
        this.focusOrgan(selectedId);
      }
    });

    this.dissectionVM.subscribe('explodeFactor', (factor) => {
      this._syncExplosion();
      // In Whole-System Knolling Grid mode, frame the 4 horizontal rows comfortably at 1:1 true scale
      if (!this.sceneVM.state.selectedOrganId && factor >= 0.85) {
        this.controls.target.set(0.0, -1.0, 0.0);
        if (this.camera.position.z < 38.0) {
          this.camera.position.set(0.0, -1.0, 42.0);
        }
      } else if (this.sceneVM.state.selectedOrganId === 'gallbladder_tree') {
        const t = Math.max(0, Math.min(1, factor || 0));
        const center = this._getGallbladderCombinedCenter();
        const dist = 6.2 + t * 6.6;
        this.controls.target.set(center.x, center.y, center.z);
        this.camera.position.set(center.x, center.y + 0.15, center.z + dist);
      } else if (this.sceneVM.state.selectedOrganId === 'oral_cavity') {
        const t = Math.max(0, Math.min(1, factor || 0));
        this.controls.target.set(0.0, 3.50, 0.35);
        this.camera.position.set(0.6 + t * 0.3, 3.65, 3.8 + t * 1.3);
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

    this.dissectionVM.subscribe('isCutawayOpen', () => {
      this._syncExplosion();
    });

    this.dissectionVM.subscribe('organDisplayMode', () => {
      this._pinnedCallout = null;
      if (this.hoverCallout) this.hoverCallout.update(null);
      this._applyFunctionalHeatmaps();
      this._updateOrganVisuals(this.sceneVM.state.selectedOrganId);
    });

    this.dissectionVM.subscribe('torsoSkinOpacity', (opacity) => {
      this._updateTorsoSkinOpacity(opacity);
    });

    this.appVM.subscribe('activeMode', (mode) => {
      this._pinnedCallout = null;
      if (this.hoverCallout) this.hoverCallout.update(null);
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

      if (mesh.userData.isLigament) {
        if (!selectedId || selectedId === 'liver') {
          mesh.visible = true;
          if (mesh.name === 'falciform_ligament' || mesh.name.startsWith('coronary_') || mesh.name.includes('triangular')) {
            mesh.material.transparent = true;
            mesh.material.opacity = 0.70;
            mesh.material.depthWrite = true;
          } else {
            mesh.material.transparent = false;
            mesh.material.opacity = 1.0;
            mesh.material.depthWrite = true;
          }
          if (mesh.material.emissive) mesh.material.emissive.setHex(0x000000);
        } else {
          if (isIsolate) {
            mesh.visible = false;
          } else {
            mesh.visible = true;
            mesh.material.transparent = true;
            mesh.material.opacity = 0.08;
            mesh.material.depthWrite = false;
          }
        }
        return;
      }

      if (isWallLayer) {
        const layerIdx = mesh.userData.wallLayerIndex || 0;
        const isClosedUnexploded = (explodeFactor < 0.005) && !isCutaway;

        const isGBTreeSelected = (selectedId === 'gallbladder_tree') &&
          (organId === 'gallbladder_tree' || organId === 'bile_duct' || (mesh.userData.wallLayerId && mesh.userData.wallLayerId.startsWith('bile_')));
        const isSelectedOrChild = (selectedId === organId) || isGBTreeSelected;

        // When a hollow organ is completely closed (0% explode, no cutaway),
        // or when viewing another organ in non-exploded mode, inner layers (idx > 0)
        // are physically enclosed inside Serosa/Adventitia (idx === 0) and should not render on the exterior.
        if (layerIdx > 0 && (isClosedUnexploded || (selectedId && !isSelectedOrChild))) {
          mesh.visible = false;
          return;
        }

        if (!selectedId) {
          mesh.visible = true;
          mesh.material.transparent = false;
          mesh.material.opacity = 1.0;
          mesh.material.depthWrite = true;
          if (mesh.material.emissive) mesh.material.emissive.setHex(0x000000);
        } else if (isSelectedOrChild) {
          mesh.visible = true;
          mesh.material.transparent = false;
          mesh.material.opacity = 1.0;
          mesh.material.depthWrite = true;
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
            mesh.material.depthWrite = false;
            if (mesh.material.emissive) mesh.material.emissive.setHex(0x000000);
          }
        }
        return;
      }

      if (mesh.userData.isOralCap) {
        const shouldCutOral = isCutaway && (selectedId === 'oral_cavity');
        mesh.visible = shouldCutOral;
        if (shouldCutOral) {
          mesh.material.transparent = false;
          mesh.material.opacity = 1.0;
          mesh.material.depthWrite = true;
          if (mesh.material.emissive) mesh.material.emissive.setHex(0x000000);
        }
        return;
      }

      const isBone = rawNameLow.includes('mandib') || rawNameLow.includes('maxill');

      if (!selectedId) {
        mesh.visible = true;
        const isOmentum = (organId === 'peritoneum_omentum');
        mesh.material.transparent = isOmentum;
        mesh.material.opacity = isOmentum ? 0.45 : 1.0;
        mesh.material.depthWrite = true;
        if (mesh.material.emissive) {
          mesh.material.emissive.setHex(organId === 'gallbladder_tree' ? 0x064e3b : 0x000000);
        }
      } else if (selectedId === 'pancreas') {
        const isDuct = rawNameLow.includes('pancreatic_duct') || rawNameLow.includes('pancreatic duct') || rawNameLow.includes('accessory') || (organId === 'pancreas' && rawNameLow.includes('duct'));
        const isBile = organId === 'gallbladder_tree' && rawNameLow.includes('bile');
        const isPancreaticVessel = (organId === 'portal_system' || organId === 'hepatic_artery') &&
          (rawNameLow.includes('splenic') || rawNameLow.includes('mesenteric') || rawNameLow.includes('gastroduodenal') || rawNameLow.includes('coeliac'));
        const isDuodenum = organId === 'duodenum';
        const isRegions = (this.dissectionVM && this.dissectionVM.state.organDisplayMode === 'regions');

        if (organId === 'pancreas') {
          mesh.visible = true;
          if (isDuct) {
            if (this.materials && this.materials.pancreatic_duct) {
              mesh.material = this.materials.pancreatic_duct;
            }
            mesh.material.transparent = false;
            mesh.material.opacity = 1.0;
            mesh.material.depthWrite = true;
          } else {
            // Opaque solid organ with lobular acinar texture visible
            mesh.material.transparent = false;
            mesh.material.opacity = 1.0;
            mesh.material.depthWrite = true;
          }
        } else if (isBile || isPancreaticVessel || isDuodenum) {
          if (isIsolate) {
            // When isolating Pancreas, separate and hide vascular vessels, bile ducts, and duodenum
            mesh.visible = false;
          } else {
            mesh.visible = true;
            mesh.material.transparent = isDuodenum || isRegions;
            mesh.material.opacity = isRegions ? 0.12 : (isDuodenum ? 0.38 : 1.0);
            if (mesh.material.emissive) mesh.material.emissive.setHex(0x000000);
          }
        } else {
          mesh.visible = !isIsolate;
          if (mesh.visible) {
            mesh.material.transparent = true;
            mesh.material.opacity = 0.10;
            if (mesh.material.emissive) mesh.material.emissive.setHex(0x000000);
          }
        }
      } else if (organId === selectedId) {
        mesh.visible = true;
        // Opaque solid organ (Liver, etc.) with authentic texture visible
        mesh.material.transparent = false;
        mesh.material.opacity = 1.0;
        mesh.material.depthWrite = true;
        if (mesh.material.emissive) mesh.material.emissive.setHex(selectedId === 'liver' ? 0x110800 : 0x000000);
      } else if (selectedId === 'liver' && isLiverOrVascular(organId)) {
        if (isIsolate) {
          // When isolating Liver in isolate mode, separate and hide vascular trees so Liver is purely isolated
          mesh.visible = false;
        } else {
          // When Liver is selected in overview mode, keep portal system, hepatic arteries & veins solid and sharp inside the liver segments!
          mesh.visible = true;
          mesh.material.transparent = false;
          mesh.material.opacity = 1.0;
          if (mesh.material.emissive) mesh.material.emissive.setHex(0x000000);
        }
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
        mesh.material.opacity = 1.0;
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
          mesh.material.depthWrite = false;
          if (mesh.material.emissive) mesh.material.emissive.setHex(0x000000);
        }
      }
    });

    this._applyFunctionalHeatmaps();
  }

  /**
   * Applies vertex-colored Regional Functional Heatmaps for all digestive organs:
   * - Stomach (Cardia, Fundus, Corpus, Antrum, Pylorus)
   * - Pancreas (Head/Uncinate, Neck, Body, Tail)
   * - Duodenum (D1, Sup Flexure L1, D2, Inf Flexure L3, D3, D4 & Treitz)
   * - Large Intestine (Cecum/Appendix, Ascending, Transverse, Descending, Sigmoid)
   * - Esophagus (Cervical, Thoracic, Abdominal)
   * - Small Intestine (Jejunum, Ileum)
   * - Gallbladder & Biliary Tree (Fundus, Body, Neck/Hartmann, Common Bile Duct)
   * - Liver (8 Couinaud Segments)
   *
   * Requirement 2: In Isolated mode (or when selecting an organ in Cô Lập),
   * other non-selected organs are hidden (if isIsolate === true) or ghosted transparent (if isIsolate === false).
   *
   * Requirement 3: In Heatmap mode (regions), by default all organs are neutral light gray.
   * Only the isolated / selected organ receives vibrant functional heatmap colors.
   */
  _applyFunctionalHeatmaps() {
    this._initHeatmapCenterlines();
    const isRegions = (this.dissectionVM.state.organDisplayMode === 'regions');
    const selectedId = this.sceneVM.state.selectedOrganId;
    const isIsolate = this.dissectionVM.state.isIsolateMode;
    const isCutaway = this.dissectionVM.state.isCutawayOpen;

    // Neutral anatomical light gray palette (Tailwind slate-200 / clean elegant medical light gray)
    const cNeutralGray = new THREE.Color(0xe2e8f0);

    // Helper to safely strip procedural textures/bump maps in Heatmap Mode
    // and restore original histological textures/bump maps in Layers Mode
    const updateMaterialHeatmapState = (mesh, isHeatmapActive) => {
      if (!mesh || !mesh.material) return;
      const mat = mesh.material;
      if (isHeatmapActive) {
        if (!mesh.userData._origMatProps) {
          mesh.userData._origMatProps = {
            map: mat.map,
            bumpMap: mat.bumpMap,
            bumpScale: mat.bumpScale,
            roughnessMap: mat.roughnessMap,
            normalMap: mat.normalMap,
            color: mat.color ? mat.color.clone() : new THREE.Color(0xffffff),
            roughness: mat.roughness !== undefined ? mat.roughness : 0.5,
            metalness: mat.metalness !== undefined ? mat.metalness : 0.0
          };
        }
        // Strip textures & bump maps so colors shine at 100% full luminosity without darkening
        mat.map = null;
        mat.bumpMap = null;
        mat.roughnessMap = null;
        mat.normalMap = null;
        if (mat.color) mat.color.setHex(0xffffff);
        mat.roughness = 0.35;
        mat.metalness = 0.02;
        mat.needsUpdate = true;
      } else {
        // Restore original histological texture and shading
        if (mesh.userData._origMatProps) {
          const p = mesh.userData._origMatProps;
          mat.map = p.map;
          mat.bumpMap = p.bumpMap;
          if (p.bumpScale !== undefined) mat.bumpScale = p.bumpScale;
          mat.roughnessMap = p.roughnessMap;
          mat.normalMap = p.normalMap;
          if (p.color && mat.color) mat.color.copy(p.color);
          if (p.roughness !== undefined) mat.roughness = p.roughness;
          if (p.metalness !== undefined) mat.metalness = p.metalness;
          mat.vertexColors = false;
          mat.needsUpdate = true;
        }
      }
    };

    // 0. Toggle concentric layer visibility:
    // In heatmap mode (regions): inner concentric layers (idx > 0) are ALWAYS hidden.
    // Outermost layer (idx === 0) visibility strictly respects whether another organ is isolated.
    if (this.stomachBuilder && this.stomachBuilder.organLayersMap) {
      this.stomachBuilder.organLayersMap.forEach((layers, organId) => {
        if (!layers || layers.length === 0) return;
        const isThisSelected = (selectedId === organId) ||
          (selectedId === 'gallbladder_tree' && organId === 'bile_duct');

        if (isRegions) {
          // Hide all inner concentric layers in heatmap mode
          for (let i = 1; i < layers.length; i++) {
            layers[i].visible = false;
          }
          const l0 = layers[0];
          updateMaterialHeatmapState(l0, true);

          if (!selectedId) {
            // Whole system mode: All organs visible in uniform light gray
            l0.visible = true;
            l0.material.transparent = false;
            l0.material.opacity = 1.0;
            l0.material.depthWrite = true;
          } else if (isThisSelected) {
            // Isolated / Selected organ: Solid, sharp, full heatmap
            l0.visible = true;
            l0.material.transparent = false;
            l0.material.opacity = 1.0;
            l0.material.depthWrite = true;
          } else {
            // Non-selected organs when one organ is isolated
            l0.visible = !isIsolate;
            if (!isIsolate) {
              l0.material.transparent = true;
              l0.material.opacity = 0.12;
              l0.material.depthWrite = false;
            }
          }
        } else {
          // In Layers mode (Mô Học): restore materials and visibility
          layers.forEach((lMesh) => updateMaterialHeatmapState(lMesh, false));

          if (selectedId && !isThisSelected) {
            // Another organ is selected: hide inner layers, ghost or hide outer layer
            for (let i = 0; i < layers.length; i++) {
              if (i === 0) {
                layers[0].visible = !isIsolate;
                if (!isIsolate) {
                  layers[0].material.transparent = true;
                  layers[0].material.opacity = 0.12;
                  layers[0].material.depthWrite = false;
                }
              } else {
                layers[i].visible = false;
              }
            }
          } else {
            // Selected organ or Whole System: restore layers
            const isClosedUnexploded = ((this.dissectionVM.state.explodeFactor || 0) < 0.005) &&
                                       !this.dissectionVM.state.isCutawayOpen;
            layers.forEach((lMesh, idx) => {
              if (idx > 0 && isClosedUnexploded) {
                lMesh.visible = false;
              } else {
                lMesh.visible = true;
                lMesh.material.transparent = false;
                lMesh.material.opacity = 1.0;
                lMesh.material.depthWrite = true;
              }
            });
          }
        }
      });
    }

    const applyColorsToMesh = (mesh, colorFn, targetOrganId) => {
      if (!mesh) return;
      const geo = mesh.geometry;
      if (!geo || !geo.attributes.position) return;

      if (isRegions) {
        updateMaterialHeatmapState(mesh, true);
        // Requirement 3: "mặc định tất cả các cơ quan màu xám nhạt --> chỉ khi cô lập thì hãy tô màu heatmap của mỗi cơ quan được chọn"
        const isThisOrganIsolated = (selectedId === targetOrganId);

        const count = geo.attributes.position.count;
        let colorAttr = geo.attributes.color;
        if (!colorAttr || colorAttr.count !== count) {
          const colors = new Float32Array(count * 3);
          colorAttr = new THREE.BufferAttribute(colors, 3);
          geo.setAttribute('color', colorAttr);
        }

        const pos = geo.attributes.position;
        const colors = colorAttr.array;

        for (let i = 0; i < count; i++) {
          const c = isThisOrganIsolated
            ? colorFn(pos.getX(i), pos.getY(i), pos.getZ(i), i)
            : cNeutralGray; // Light gray default when not isolated!
          colors[i * 3]     = c.r;
          colors[i * 3 + 1] = c.g;
          colors[i * 3 + 2] = c.b;
        }
        colorAttr.needsUpdate = true;

        if (mesh.material) {
          mesh.material.vertexColors = true;
          mesh.material.needsUpdate = true;
          if (isThisOrganIsolated) {
            mesh.material.transparent = false;
            mesh.material.opacity = 1.0;
            mesh.material.depthWrite = true;
          } else if (selectedId) {
            // Another organ is isolated: keep this non-isolated organ transparent light gray or hidden
            mesh.visible = !isIsolate;
            if (!isIsolate) {
              mesh.material.transparent = true;
              mesh.material.opacity = 0.12;
              mesh.material.depthWrite = false;
            }
          } else {
            // Whole system: uniform light gray
            mesh.visible = true;
            const isOmentum = (targetOrganId === 'peritoneum_omentum');
            mesh.material.transparent = isOmentum;
            mesh.material.opacity = isOmentum ? 0.25 : 1.0;
            mesh.material.depthWrite = !isOmentum;
          }
        }
      } else {
        updateMaterialHeatmapState(mesh, false);
      }
    };

    // 1. Stomach Functional Heatmap (5 Discrete Steps: Fundus -> Cardia -> Corpus -> Antrum -> Pylorus)
    const palStom = this._getThermalPalette(5);
    const stomachTarget = (this.stomachWallMeshes && this.stomachWallMeshes.length > 0)
      ? this.stomachWallMeshes[0]
      : this.clickableMeshes.find(m => m.userData.organId === 'stomach');
    applyColorsToMesh(stomachTarget, (x, y, z) => {
      const s = this._projectToCenterline(x, y, z, this._stomachPts);
      if (s < 0.18) return palStom[0];
      else if (s < 0.32) return palStom[1];
      else if (s < 0.65) return palStom[2];
      else if (s < 0.88) return palStom[3];
      else return palStom[4];
    }, 'stomach');

    // 2. Pancreas Functional Heatmap (4 Discrete Steps: Head -> Neck -> Body -> Tail)
    const palP = this._getThermalPalette(4);
    this.clickableMeshes.forEach(mesh => {
      if (mesh.userData.organId !== 'pancreas') return;
      const low = (mesh.userData.rawName || mesh.name || '').toLowerCase();
      if (low.includes('duct')) return; // Ducts stay solid porcelain sky blue
      applyColorsToMesh(mesh, (x) => {
        const s = THREE.MathUtils.clamp((x - (-3.8)) / (4.8 - (-3.8)), 0, 1);
        if (s < 0.25) return palP[0];
        else if (s < 0.45) return palP[1];
        else if (s < 0.80) return palP[2];
        else return palP[3];
      }, 'pancreas');
    });

    // 3. Duodenum Functional Heatmap (6 Discrete Steps: D1 -> Flex Sup -> D2 -> Flex Inf -> D3 -> D4)
    const palD = this._getThermalPalette(6);
    const duodTarget = (this.duodenumWallMeshes && this.duodenumWallMeshes.length > 0)
      ? this.duodenumWallMeshes[0]
      : this.clickableMeshes.find(m => m.userData.organId === 'duodenum');
    applyColorsToMesh(duodTarget, (x, y, z) => {
      const s = this._projectToCenterline(x, y, z, this._duodPts);
      if (s < 0.18) return palD[0];
      else if (s < 0.32) return palD[1];
      else if (s < 0.58) return palD[2];
      else if (s < 0.72) return palD[3];
      else if (s < 0.86) return palD[4];
      else return palD[5];
    }, 'duodenum');

    // 4. Large Intestine / Colon Functional Heatmap (5 Discrete Steps: Cecum -> Ascending -> Transverse -> Descending -> Sigmoid)
    // Colon Descendens is strictly 1 single solid pastel color (palC[3]) with sharp anatomical borders
    const palC = this._getThermalPalette(5);
    const colonTarget = (this.colonWallMeshes && this.colonWallMeshes.length > 0)
      ? this.colonWallMeshes[0]
      : this.clickableMeshes.find(m => m.userData.organId === 'large_intestine');
    applyColorsToMesh(colonTarget, (x, y, z) => {
      const s = this._projectToCenterline(x, y, z, this._colonPts);
      if (s < 0.18) return palC[0];      // Manh tràng & Ruột thừa
      else if (s < 0.38) return palC[1]; // ĐT lên & Góc gan
      else if (s < 0.65) return palC[2]; // ĐT ngang & Góc lách
      else if (s < 0.85) return palC[3]; // ĐT xuống (1 màu duy nhất!)
      else return palC[4];               // ĐT sigma
    }, 'large_intestine');

    // 5. Esophagus Functional Heatmap (3 Discrete Steps: Cervical -> Thoracic -> Abdominal)
    const palE = this._getThermalPalette(3);
    const esophTarget = (this.esophagusWallMeshes && this.esophagusWallMeshes.length > 0)
      ? this.esophagusWallMeshes[0]
      : this.clickableMeshes.find(m => m.userData.organId === 'esophagus');
    applyColorsToMesh(esophTarget, (x, y) => {
      const s = THREE.MathUtils.clamp((145.0 - y) / (145.0 - 122.0), 0, 1);
      if (s < 0.28) return palE[0];
      else if (s >= 0.80) return palE[2];
      else return palE[1];
    }, 'esophagus');

    // 6. Gallbladder & Bile Duct Functional Heatmap (4 Discrete Steps: Fundus -> Body -> Neck -> Common Bile Duct)
    const palG = this._getThermalPalette(4);
    const gbTarget = (this.gallbladderWallMeshes && this.gallbladderWallMeshes.length > 0)
      ? this.gallbladderWallMeshes[0]
      : this.clickableMeshes.find(m => m.userData.organId === 'gallbladder_tree' && m.name === 'Gallbladder');
    applyColorsToMesh(gbTarget, (x, y, z) => {
      if (z > 6.0) return palG[0];
      else if (z <= 4.5) return palG[2];
      else return palG[1];
    }, 'gallbladder_tree');

    const bileDuctTarget = (this.bileDuctWallMeshes && this.bileDuctWallMeshes.length > 0)
      ? this.bileDuctWallMeshes[0]
      : this.clickableMeshes.find(m => m.name === 'Bile_duct' || (m.userData.organId === 'gallbladder_tree' && m.name.includes('Bile')));
    applyColorsToMesh(bileDuctTarget, () => palG[3], 'gallbladder_tree');

    // 7. Small Intestine Functional Heatmap (2 Discrete Steps: Jejunum -> Ileum)
    // Topological Arc-Length / Geodesic Division: Proximal 40% = Jejunum (Hot Coral), Distal 60% = Ileum (Soft Cornflower Blue)
    const palS = this._getThermalPalette(2);
    const siMeshes = (this.smallIntestineWallMeshes && this.smallIntestineWallMeshes.length > 0)
      ? this.smallIntestineWallMeshes
      : this.clickableMeshes.filter(m => m.userData.organId === 'small_intestine');

    siMeshes.forEach(mesh => {
      applyColorsToMesh(mesh, (x, y, z, vertexIndex) => {
        let progress = 0.5;
        if (this.siTubeProgress && vertexIndex !== undefined) {
          progress = this.siTubeProgress[vertexIndex];
        } else {
          progress = (x > 0 || y > 98.0) ? 0.2 : 0.8;
        }
        return (progress <= 0.40) ? palS[0] : palS[1];
      }, 'small_intestine');
    });

    // 8. Couinaud Liver Functional Heatmap (8 segments: Hot -> Cold)
    const palLiver = this._getThermalPalette(8);
    this.clickableMeshes.forEach(mesh => {
      if (mesh.userData.organId !== 'liver') return;
      if (mesh.userData.isLigament) return; // Ligaments retain their pristine glistening peritoneal texture
      const low = (mesh.userData.rawName || mesh.name || '').toLowerCase();
      const segMatch = low.match(/\((i|ii|iii|iv|v|vi|vii|viii)\)/i);
      const roman = segMatch ? segMatch[1].toUpperCase() : null;
      const romanMap = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 };
      const segNum = roman ? romanMap[roman] : 1;
      const segColor = palLiver[segNum - 1] || palLiver[0];
      applyColorsToMesh(mesh, () => segColor, 'liver');
    });

    // 9. Peritoneum & Omentum Functional Heatmap (4 anatomical regions: Hot -> Cold)
    // Lesser Omentum (hot rose) -> Mesocolon (warm peach) -> Greater Omentum (fresh mint) -> Meso-appendix (lavender)
    const palPerit = this._getThermalPalette(4);
    this.clickableMeshes.forEach(mesh => {
      if (mesh.userData.organId !== 'peritoneum_omentum') return;
      const low = (mesh.userData.rawName || mesh.name || '').toLowerCase();
      if (low.includes('lesser') || low.includes('minor') || low.includes('minus')) {
        // Lesser Omentum: Top hot coral
        applyColorsToMesh(mesh, () => palPerit[0], 'peritoneum_omentum');
      } else if (low.includes('mesocolon')) {
        // Transverse Mesocolon: Warm peach
        applyColorsToMesh(mesh, () => palPerit[1], 'peritoneum_omentum');
      } else if (low.includes('greater') || low.includes('majus')) {
        // Greater Omentum: Solid fresh mint
        applyColorsToMesh(mesh, () => palPerit[2], 'peritoneum_omentum');
      } else if (low.includes('appendix') || low.includes('meso')) {
        // Meso-appendix & Pelvic Douglas fold: Coolest pastel violet
        applyColorsToMesh(mesh, () => palPerit[3], 'peritoneum_omentum');
      }
    });

    // 10. Update any remaining clickable meshes (oral cavity, teeth, jaws, vessels, etc.)
    this.clickableMeshes.forEach(mesh => {
      const orgId = mesh.userData.organId;
      if (['stomach', 'duodenum', 'pancreas', 'large_intestine', 'esophagus', 'gallbladder_tree', 'small_intestine', 'liver', 'peritoneum_omentum'].includes(orgId)) {
        return; // Already handled above
      }
      if (mesh.userData.isOralCap) {
        mesh.visible = (isCutaway && selectedId === 'oral_cavity');
        return;
      }
      if (isRegions) {
        updateMaterialHeatmapState(mesh, true);
        if (selectedId && orgId !== selectedId) {
          mesh.visible = !isIsolate;
          if (!isIsolate) {
            mesh.material.transparent = true;
            mesh.material.opacity = 0.12;
            mesh.material.depthWrite = false;
          }
        } else {
          mesh.visible = true;
          mesh.material.transparent = false;
          mesh.material.opacity = 1.0;
          mesh.material.depthWrite = true;
          mesh.material.vertexColors = false;
          if (mesh.material.color) mesh.material.color.copy(cNeutralGray);
          mesh.material.needsUpdate = true;
        }
      } else {
        updateMaterialHeatmapState(mesh, false);
      }
    });

    // 11. Ensure liver ligaments remain visible when Liver or Whole System is active
    if (this.liverLigaments) {
      this.liverLigaments.forEach(mesh => {
        if (!selectedId || selectedId === 'liver') {
          mesh.visible = true;
        } else {
          mesh.visible = !isIsolate;
          if (mesh.visible) {
            mesh.material.transparent = true;
            mesh.material.opacity = 0.08;
          }
        }
      });
    }
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

  _getGallbladderCombinedCenter() {
    const bbox = new THREE.Box3();
    const meshes = [
      ...(this.gallbladderWallMeshes || []),
      ...(this.bileDuctWallMeshes || [])
    ];
    if (meshes.length > 0) {
      meshes.forEach(m => {
        m.updateWorldMatrix(true, false);
        bbox.expandByObject(m);
      });
      return bbox.getCenter(new THREE.Vector3());
    }
    return new THREE.Vector3(-0.4, 0.1, 0.1);
  }

  focusGallbladder() {
    const center = this._getGallbladderCombinedCenter();
    const t = Math.max(0, Math.min(1, this.dissectionVM?.state?.explodeFactor || 0));
    const dist = 6.2 + t * 6.6;
    this._smoothMoveCameraTarget(
      [center.x, center.y, center.z],
      [center.x, center.y + 0.15, center.z + dist]
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

  focusOralCavity() {
    // Focus on oral cavity with optimal antero-lateral angle looking into midsagittal interior
    this._smoothMoveCameraTarget(
      [0.0, 3.50, 0.35],
      [0.6, 3.65, 3.8]
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

  setOrganCutSide(organId, side) {
    if (this.stomachBuilder) {
      this.stomachBuilder.setOrganCutSide(organId, side);
    }
  }

  getOrganCutSide(organId) {
    return this.stomachBuilder ? this.stomachBuilder.getOrganCutSide(organId) : 1.0;
  }

  /**
   * Drops a circular pin & callout onto a specific heatmap region of an organ
   * (used both on mobile tap and when selecting a region card from the right drawer).
   */
  pinHeatmapRegion(organId, regionKey) {
    const regions = HEATMAP_CATALOG[organId];
    if (!regions) return;
    const region = regions.find(r => r.key === regionKey);
    if (!region) return;

    let worldPoint = null;
    if (organId === 'liver' && region.couinaudRoman) {
      const targetMesh = this.clickableMeshes.find(m => {
        if (m.userData.organId !== 'liver' || m.userData.isLigament) return false;
        const low = (m.userData.rawName || m.name || '').toLowerCase();
        const match = low.match(/\((i|ii|iii|iv|v|vi|vii|viii)\)/i);
        return match && match[1].toUpperCase() === region.couinaudRoman;
      });
      if (targetMesh) {
        worldPoint = new THREE.Box3().setFromObject(targetMesh).getCenter(new THREE.Vector3());
      }
    } else if (region.centerLocal) {
      const refMesh = this.clickableMeshes.find(m => m.visible && m.userData.organId === organId)
        || this.clickableMeshes.find(m => m.userData.organId === organId);
      if (refMesh) {
        refMesh.updateWorldMatrix(true, false);
        worldPoint = new THREE.Vector3(...region.centerLocal).applyMatrix4(refMesh.matrixWorld);
      }
    }

    if (!worldPoint) return;

    const screenPos = this._projectWorldToScreen(worldPoint);
    const payload = {
      organId,
      regionKey: region.key,
      wallLayerId: null,
      x: screenPos.x,
      y: screenPos.y,
      tag: region.tag,
      badge: region.badge,
      title: region.title,
      subtitle: region.subtitle,
      color: region.color
    };
    this._pinnedCallout = { worldPoint, payload, organId };
    this.hoverCallout.update(payload);
    this.sceneVM.setHoveredPart(payload);
  }

  _projectWorldToScreen(worldVec) {
    const projected = worldVec.clone().project(this.camera);
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    return {
      x: (projected.x * 0.5 + 0.5) * w,
      y: (-projected.y * 0.5 + 0.5) * h,
      visible: projected.z < 1
    };
  }

  _animate() {
    requestAnimationFrame(this._animate);
    this.controls.update();

    if (this._pinnedCallout && this.hoverCallout) {
      const pos = this._projectWorldToScreen(this._pinnedCallout.worldPoint);
      if (pos.visible) {
        const prev = this._pinnedCallout.payload;
        if (Math.abs(pos.x - prev.x) > 0.5 || Math.abs(pos.y - prev.y) > 0.5) {
          this._pinnedCallout.payload = { ...prev, x: pos.x, y: pos.y };
          this.hoverCallout.update(this._pinnedCallout.payload);
        }
      }
    }

    if (this.landmarksRoot && this.landmarksRoot.visible) {
      const time = Date.now() * 0.005;
      const pulse = 1.0 + Math.sin(time) * 0.18;
      const activeId = this.appVM.landmarksVM ? this.appVM.landmarksVM.state.activeLandmarkId : null;

      this.landmarkMarkers.forEach((mesh, id) => {
        if (!mesh.visible) return;
        const isActive = (id === activeId);

        // Bù trừ khoảng cách camera (Screen-Space Distance Compensation)
        const dist = this.camera.position.distanceTo(mesh.position);
        const distScale = Math.min(1.25, Math.max(0.18, dist / 10.0));
        const focusMult = isActive ? 1.35 : 1.0;
        const finalScale = distScale * focusMult;
        mesh.scale.set(finalScale, finalScale, finalScale);

        // Animation vòng hào quang màu vàng xung quanh & billboarding hướng về camera
        const ring = mesh.children[0];
        if (ring) {
          const ringPulse = isActive ? (1.12 + Math.sin(time * 1.6) * 0.25) : pulse;
          ring.scale.set(ringPulse, ringPulse, 1.0);
          ring.lookAt(this.camera.position);
          if (ring.material) {
            ring.material.opacity = isActive ? 1.0 : 0.85;
          }
        }
      });
    }

    this.renderer.render(this.scene, this.camera);
  }
}
