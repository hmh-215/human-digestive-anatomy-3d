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
    this._updateLoadingProgress(25, 'Đang nạp mô hình DigestiveSystem.glb...');

    loader.load(
      './assets/models/DigestiveSystem.glb',
      (gltf) => {
        this._updateLoadingProgress(85, 'Đang khởi tạo các lớp giải phẫu & vật liệu PBR...');
        this._processDigestiveScene(gltf.scene);
        this._hideLoadingOverlay();

        // Stage 2: Lazy-load TorsoAbdominalWall.glb during browser idle time
        const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 200));
        schedule(() => this._ensureTorsoLoaded());
      },
      (xhr) => {
        if (xhr.lengthComputable) {
          const percent = Math.min(80, Math.round((xhr.loaded / xhr.total) * 80));
          this._updateLoadingProgress(percent, `Đang tải mô hình 3D (${percent}%)...`);
        }
      },
      (err) => {
        console.error('Lỗi nạp DigestiveSystem.glb:', err);
        this._updateLoadingProgress(100, 'Lỗi nạp mô hình 3D.');
      }
    );
  }

  _processDigestiveScene(rootGroup) {
    this.masterRoot = new THREE.Group();
    this.masterRoot.name = 'ZAnatomy_Visceral_Master';
    this.scene.add(this.masterRoot);
    this.masterRoot.add(rootGroup);

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

    const inferOrganId = (name, userData) => {
      if (userData && userData.organId) return userData.organId;
      const low = (name || '').toLowerCase();
      if (low.includes('liver')) return 'liver';
      if (low.includes('gallbladder') || low.includes('bile') || low.includes('cystic')) return 'gallbladder_tree';
      if (low.includes('stomach') || low.includes('gaster')) return 'stomach';
      if (low.includes('pancreas') || low.includes('pancreatic')) return 'pancreas';
      if (low.includes('duodenum')) return 'duodenum';
      if (low.includes('jejunum') || low.includes('ileum') || low.includes('small intestine') || low.includes('intestine')) return 'small_intestine';
      if (low.includes('colon') || low.includes('cecum') || low.includes('caecum') || low.includes('appendix') || low.includes('taenia')) return 'large_intestine';
      if (low.includes('oesophagus') || low.includes('esophagus')) return 'esophagus';
      if (low.includes('omentum') || low.includes('peritoneum') || low.includes('meso')) return 'peritoneum_omentum';
      return 'small_intestine';
    };

    this.clickableMeshes = [];
    this.allVisceralMeshes = [];
    const meshesToProcess = [];

    rootGroup.traverse((child) => {
      if (child.isMesh) {
        meshesToProcess.push(child);
      }
    });

    meshesToProcess.forEach((child) => {
      const organId = inferOrganId(child.name, child.userData);
      const low = (child.name || '').toLowerCase();

      if (child.name === 'Stomach' || organId === 'stomach') {
        const layers = this.stomachBuilder.createLayers(child, this.appVM.organsData);
        this.stomachWallMeshes = layers;
        layers.forEach((lMesh) => {
          this.clickableMeshes.push(lMesh);
          this.allVisceralMeshes.push(lMesh);
        });
        return;
      }

      child.visible = true;
      child.userData = {
        organId,
        rawName: child.name,
        initialPos: child.position.clone()
      };

      const baseMat = materials[organId] || materials.stomach;
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

    // Normalize bounding box of digestive system to target height 8.5 centered at origin
    this.masterRoot.updateMatrixWorld(true);
    const digestiveBBox = new THREE.Box3();
    this.clickableMeshes.forEach((mesh) => {
      mesh.updateWorldMatrix(true, false);
      digestiveBBox.expandByObject(mesh);
    });

    const center = digestiveBBox.getCenter(new THREE.Vector3());
    const size = digestiveBBox.getSize(new THREE.Vector3());
    const targetHeight = 8.5;
    const scaleFactor = targetHeight / Math.max(size.y, 1);

    this.masterRoot.scale.setScalar(scaleFactor);
    this.masterRoot.position.set(
      -center.x * scaleFactor,
      -center.y * scaleFactor,
      -center.z * scaleFactor
    );
    this.masterRoot.updateMatrixWorld(true);

    // Record normalized world center of stomach after masterRoot transform is finalized
    this.stomachBuilder.recordBaseCenterWorld();

    // Assign 3D explosion vectors for both whole-system and sub-assembly explosion
    this.explosionManager.assignExplosionVectors(this.clickableMeshes);

    this.layerMap = {
      esophagus: 1, peritoneum_omentum: 1,
      liver: 2, stomach: 2, large_intestine: 2,
      gallbladder_tree: 3, pancreas: 3, duodenum: 3, small_intestine: 3
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

    this.torsoSkinMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4a373,
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

    this.landmarksRoot.visible = (this.appVM.state.activeMode === 'pathology');
  }

  /**
   * Formats human-readable Vietnamese/Latin metadata for any hovered 3D mesh.
   */
  _buildHoverPayload(mesh, screenX, screenY) {
    if (mesh.userData.isStomachWallLayer) {
      const shortThickness = (mesh.userData.wallLayerThickness || '').split('(')[0].trim();
      return {
        organId: 'stomach',
        wallLayerId: mesh.userData.wallLayerId,
        x: screenX,
        y: screenY,
        tag: `MÔ HỌC DẠ DÀY • LỚP ${mesh.userData.wallLayerOrder}/6`,
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
      peritoneum_omentum: '#eab308'
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

      if (prev.userData.isStomachWallLayer && prev.userData.wallLayerId === activeLayerId) {
        prev.material.emissive.setHex(0x331111);
      } else if (!prev.userData.isStomachWallLayer && prev.userData.organId === selectedId) {
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
      const rawHits = this.raycaster.intersectObjects(this.clickableMeshes, true);
      const validHit = this._getFirstVisibleHit(rawHits);

      if (validHit) {
        const topHit = validHit.object;
        if (topHit.userData.isStomachWallLayer) {
          this.sceneVM.selectOrgan('stomach');
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
      stomachWallMeshes: this.stomachWallMeshes
    });
  }

  _bindViewModel() {
    this.sceneVM.subscribe('selectedOrganId', (selectedId) => {
      this._updateOrganVisuals(selectedId);
      this._syncExplosion();
      if (selectedId === 'stomach') {
        this.focusStomach();
      } else if (selectedId) {
        this.focusOrgan(selectedId);
      }
    });

    this.dissectionVM.subscribe('explodeFactor', () => {
      this._syncExplosion();
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
        this._ensureTorsoLoaded();
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
    const visibleLayers = this.dissectionVM.state.visibleLayers;
    const layerMap = this.layerMap || {
      esophagus: 1, peritoneum_omentum: 1,
      liver: 2, stomach: 2, large_intestine: 2,
      gallbladder_tree: 3, pancreas: 3, duodenum: 3, small_intestine: 3
    };
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
        if (!selectedId) {
          mesh.visible = true;
          mesh.material.transparent = isXRay;
          mesh.material.opacity = isXRay ? 0.35 : 1.0;
          if (mesh.material.emissive) mesh.material.emissive.setHex(0x000000);
        } else if (selectedId === 'stomach') {
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

      if (!selectedId) {
        mesh.visible = true;
        mesh.material.transparent = isXRay || organId === 'peritoneum_omentum';
        mesh.material.opacity = isXRay ? 0.35 : (organId === 'peritoneum_omentum' ? 0.45 : 1.0);
        if (mesh.material.emissive) {
          mesh.material.emissive.setHex(organId === 'gallbladder_tree' ? 0x064e3b : 0x000000);
        }
      } else if (organId === selectedId) {
        mesh.visible = true;
        mesh.material.transparent = isXRay;
        mesh.material.opacity = isXRay ? 0.45 : 1.0;
        if (mesh.material.emissive) mesh.material.emissive.setHex(0x221508);
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
      const center = this.stomachBuilder
        ? this.stomachBuilder.baseCenterWorld.clone()
        : new THREE.Vector3(0.688, 0.339, 0.206);

      // Frame the stomach center with generous viewport width & depth so all 6 exploded layers fit cleanly without overlap
      this._smoothMoveCameraTarget(
        [center.x - 0.35, center.y + 0.15, center.z],
        [center.x - 0.35, center.y + 0.35, center.z + 8.6]
      );
    }
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
      const pulseScale = 1.0 + 0.15 * Math.sin(time);
      this.landmarkMarkers.forEach((mesh) => {
        mesh.scale.set(pulseScale, pulseScale, pulseScale);
      });
    }

    this.renderer.render(this.scene, this.camera);
  }
}
