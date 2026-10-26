import * as THREE from 'three';

/**
 * ExplosionManager.js
 * Module 3: Context-Aware 3D Explosion Controller & Smooth Animation Engine.
 *
 * Supports two dedicated modes driven by `explodeFactor` (0..1):
 *   1. Tab 1 — Whole-System 2D Knolling Catalog Grid (when `!selectedOrganId`):
 *      Arranges all digestive organs, Couinaud liver segments (I-VIII), and all concentric
 *      histological layers into 4 horizontal catalog rows in the Z=0 coronal plane
 *      (Human Atlas Knolling style).
 *   2. Tab 2 — Isolated Organ Layer / Sub-assembly Explosion (when `selectedOrganId` is set):
 *      - Hollow Organs (Stomach, Duodenum, Small Intestine, Colon, Gallbladder, Esophagus):
 *        Telescoping Inner-to-User Depth Cascade (`centeredStep = idx - (N - 1) / 2`) so
 *        outer layers stay at the back as a cradle and inner layers move forward toward
 *        the user (+Z) nested cleanly inside the outer layers without cutting across walls.
 *      - Solid/Segmented Organs (Liver Couinaud I-VIII, Pancreas + Ducts):
 *        Separates anatomical sub-segments radially for inspection.
 */
export class ExplosionManager {
  constructor(scene, masterRoot, stomachBuilder) {
    this.scene = scene;
    this.masterRoot = masterRoot;
    this.stomachBuilder = stomachBuilder;
    this._animFrameId = null;

    this.guideLineGroup = new THREE.Group();
    this.guideLineGroup.name = 'Explosion_Guide_Lines';
    this.scene.add(this.guideLineGroup);
    this._initStomachGuideLine();
  }

  _initStomachGuideLine() {
    const geo = new THREE.BufferGeometry();
    const mat = new THREE.LineDashedMaterial({
      color: 0xe11d48,
      dashSize: 0.14,
      gapSize: 0.09,
      transparent: true,
      opacity: 0.85,
      depthTest: false
    });
    this.stomachGuideLine = new THREE.Line(geo, mat);
    this.stomachGuideLine.renderOrder = 999;
    this.stomachGuideLine.visible = false;
    this.guideLineGroup.add(this.stomachGuideLine);
  }

  /**
   * Computes both:
   *   1. Whole-System 4-Row Knolling Grid target positions & scales (`knollingTargetCenter`, `knollingScale`)
   *   2. Isolated Organ sub-part explosion vectors (`subExplodeVec`)
   */
  assignExplosionVectors(clickableMeshes, systemLocalCenter) {
    const refCenter = systemLocalCenter ? systemLocalCenter.clone() : new THREE.Vector3(0, 0, 0);

    // Ensure every mesh has accurate geometry-space localCenter, localSize, initialPos, initialScale
    clickableMeshes.forEach((mesh) => {
      if (!mesh.userData.initialPos) {
        mesh.userData.initialPos = mesh.position.clone();
      }
      if (!mesh.userData.initialScale) {
        mesh.userData.initialScale = mesh.scale.clone();
      }
      if (!mesh.userData.localCenter || !mesh.userData.localSize) {
        const g = mesh.geometry;
        if (g) {
          if (!g.boundingBox) g.computeBoundingBox();
          const lc = new THREE.Vector3();
          const ls = new THREE.Vector3(6, 6, 6);
          if (g.boundingBox) {
            g.boundingBox.getCenter(lc);
            g.boundingBox.getSize(ls);
          }
          mesh.userData.localCenter = lc;
          mesh.userData.localSize = ls;
        } else {
          mesh.userData.localCenter = new THREE.Vector3();
          mesh.userData.localSize = new THREE.Vector3(6, 6, 6);
        }
      }

      // Compute sub-part explosion vector for isolated solid/segmented organs (Liver, Pancreas, Biliary)
      const organId = mesh.userData.organId;
      const low = (mesh.userData.rawName || mesh.name || '').toLowerCase();
      const subVec = new THREE.Vector3(0, 0, 0);

      if (organId === 'liver') {
        if (low.includes('(i)')) subVec.set(0.5, 4.5, -2.5);
        else if (low.includes('(ii)')) subVec.set(6.5, 3.8, -1.0);
        else if (low.includes('(iii)')) subVec.set(6.8, -3.2, 1.8);
        else if (low.includes('(iv)')) subVec.set(1.5, -2.8, 2.2);
        else if (low.includes('(v)')) subVec.set(-3.2, -4.2, 2.0);
        else if (low.includes('(vi)')) subVec.set(-8.2, -3.8, -1.5);
        else if (low.includes('(vii)')) subVec.set(-8.0, 4.2, -1.5);
        else if (low.includes('(viii)')) subVec.set(-3.0, 4.8, 1.5);
        else subVec.set(-1.5, 1.0, 1.0);
      } else if (organId === 'gallbladder_tree') {
        // Non-wall-layer bile duct moves slightly to the back-right when gallbladder layers telescope forward-left
        subVec.set(6.5, -1.2, -4.5);
      } else if (organId === 'pancreas') {
        if (low.includes('accessory')) subVec.set(-4.5, 2.5, 5.5);
        else if (low.includes('duct')) subVec.set(0.0, 0.0, 6.5);
        else subVec.set(0.0, 0.0, -2.5);
      } else if (organId === 'peritoneum_omentum') {
        if (low.includes('lesser')) subVec.set(4.0, 6.0, 5.0);
        else if (low.includes('greater')) subVec.set(0.0, -4.0, 8.0);
        else if (low.includes('mesocolon')) subVec.set(0.0, 2.0, -5.0);
        else subVec.set(-6.0, -6.0, 4.0);
      }

      mesh.userData.subExplodeVec = subVec;
    });

    // =========================================================================
    // BUILD 4-ROW KNOLLING CATALOG GRID (Human Atlas 2D Row Layout)
    // =========================================================================
    const row1 = []; // Upper GI: Esophagus (5) -> Stomach (6) -> Duodenum (5)
    const row2 = []; // Hepatobiliary & Pancreas: Liver (8) -> Gallbladder (4 + duct) -> Pancreas (3)
    const row3 = []; // Small Intestine (5) + Peritoneum/Omentum (4)
    const row4 = []; // Large Intestine / Whole Colon Frame (5)

    const sortByLayerOrName = (a, b) => {
      const oa = a.userData.wallLayerOrder || 99;
      const ob = b.userData.wallLayerOrder || 99;
      if (oa !== ob) return oa - ob;
      return (a.name || '').localeCompare(b.name || '');
    };

    const byOrgan = (id) => clickableMeshes.filter(m => m.userData.organId === id).sort(sortByLayerOrName);

    row1.push(...byOrgan('esophagus'), ...byOrgan('stomach'), ...byOrgan('duodenum'));
    row2.push(...byOrgan('liver'), ...byOrgan('gallbladder_tree'), ...byOrgan('pancreas'));
    row3.push(...byOrgan('small_intestine'), ...byOrgan('peritoneum_omentum'));
    row4.push(...byOrgan('large_intestine'));

    const rowsConfig = [
      { items: row1, yOffset: 22.5, xShift: 2.0,  maxCellDim: 8.2, gapX: 2.0, minSlotW: 5.4 },
      { items: row2, yOffset: 8.0,  xShift: 4.0,  maxCellDim: 8.2, gapX: 2.0, minSlotW: 5.4 },
      { items: row3, yOffset: -7.5, xShift: 15.0, maxCellDim: 10.2, gapX: 2.6, minSlotW: 8.2 },
      { items: row4, yOffset: -23.5, xShift: 16.0, maxCellDim: 13.0, gapX: 4.5, minSlotW: 13.8 }
    ];

    rowsConfig.forEach((rowCfg) => {
      const items = rowCfg.items;
      if (!items || items.length === 0) return;

      const slotWidths = items.map((mesh) => {
        const ls = mesh.userData.localSize || new THREE.Vector3(6, 6, 6);
        const maxAxis = Math.max(0.1, ls.x, ls.y, ls.z);
        const knollScale = Math.min(1.0, rowCfg.maxCellDim / maxAxis);
        mesh.userData.knollingScale = knollScale;
        const scaledW = ls.x * knollScale;
        return Math.max(rowCfg.minSlotW, scaledW);
      });

      const totalWidth = slotWidths.reduce((acc, w) => acc + w, 0) + Math.max(0, items.length - 1) * rowCfg.gapX;
      let cursorX = -totalWidth / 2.0 + (rowCfg.xShift || 0);

      items.forEach((mesh, idx) => {
        const w = slotWidths[idx];
        const centerX = cursorX + w / 2.0;
        cursorX += w + rowCfg.gapX;

        mesh.userData.knollingTargetCenter = new THREE.Vector3(
          refCenter.x + centerX,
          refCenter.y + rowCfg.yOffset,
          refCenter.z
        );
      });
    });
  }

  /**
   * Applies the current explosion factor (0..1) based on active mode:
   * - Tab 1 (`!selectedOrganId`): Interpolates every mesh into the 4-Row Knolling Catalog Grid.
   * - Tab 2 (`selectedOrganId`): Telescopes inner histological layers toward the user (+Z)
   *   so inner layers sit neatly inside outer layers without cutting through outer shell walls.
   */
  updateExplosion({
    explodeFactor,
    selectedOrganId,
    isCutawayOpen,
    clickableMeshes,
    stomachWallMeshes,
    organLayersMap
  }) {
    const t = Math.max(0, Math.min(1, explodeFactor || 0));
    const layersMap = organLayersMap || (this.stomachBuilder ? this.stomachBuilder.organLayersMap : null);

    // 1. Handle Whole-System Knolling Grid Mode (Tab 1: `!selectedOrganId`)
    if (!selectedOrganId) {
      clickableMeshes.forEach((mesh) => {
        const initPos = mesh.userData.initialPos || new THREE.Vector3();
        const initScale = mesh.userData.initialScale || new THREE.Vector3(1, 1, 1);
        const localCenter = mesh.userData.localCenter || new THREE.Vector3();
        const targetCenter = mesh.userData.knollingTargetCenter;
        const knollScale = mesh.userData.knollingScale !== undefined ? mesh.userData.knollingScale : 1.0;

        if (t > 0.001 && targetCenter) {
          const s = 1.0 + (knollScale - 1.0) * t;
          mesh.scale.set(initScale.x * s, initScale.y * s, initScale.z * s);

          // Visual center at t=0 is (initPos + localCenter)
          const startCenterX = initPos.x + localCenter.x * initScale.x;
          const startCenterY = initPos.y + localCenter.y * initScale.y;
          const startCenterZ = initPos.z + localCenter.z * initScale.z;

          const curCenterX = startCenterX + (targetCenter.x - startCenterX) * t;
          const curCenterY = startCenterY + (targetCenter.y - startCenterY) * t;
          const curCenterZ = startCenterZ + (targetCenter.z - startCenterZ) * t;

          mesh.position.set(
            curCenterX - localCenter.x * mesh.scale.x,
            curCenterY - localCenter.y * mesh.scale.y,
            curCenterZ - localCenter.z * mesh.scale.z
          );
        } else {
          mesh.scale.copy(initScale);
          mesh.position.copy(initPos);
        }
        mesh.updateWorldMatrix(true, false);
      });

      if (this.stomachBuilder) {
        this.stomachBuilder.updateClipping(null, isCutawayOpen, t);
      }
      this.stomachGuideLine.visible = false;
      return;
    }

    // =========================================================================
    // 2. Tab 2 — Isolated Organ Mode (`selectedOrganId` is active)
    // =========================================================================
    // Reset scales to 100% true anatomical scale and handle non-wall visceral meshes
    clickableMeshes.forEach((mesh) => {
      if (mesh.userData.initialScale) {
        mesh.scale.copy(mesh.userData.initialScale);
      }
      if (mesh.userData.isWallLayer || mesh.userData.isStomachWallLayer) return;

      const initPos = mesh.userData.initialPos;
      if (!initPos) return;

      if (mesh.userData.organId === selectedOrganId && t > 0) {
        const vec = mesh.userData.subExplodeVec;
        if (vec) {
          mesh.position.copy(initPos).addScaledVector(vec, t * 1.15);
        } else {
          mesh.position.copy(initPos);
        }
      } else {
        mesh.position.copy(initPos);
      }
      mesh.updateWorldMatrix(true, false);
    });

    // 3. Task 6: Telescoping Inner-to-User Layer Explosion for all 6 Hollow Organs
    const hollowOrgans = [
      'stomach',
      'duodenum',
      'small_intestine',
      'large_intestine',
      'gallbladder_tree',
      'esophagus'
    ];

    // Step vectors: when multiplied by `centeredStep = idx - (N - 1) / 2`:
    //   - idx = 0 (Outermost Serosa/Adventitia, centeredStep < 0) moves to Back-Right (+X, -Y, -Z) as the outer cradle
    //   - idx = N-1 (Innermost Mucosa, centeredStep > 0) moves to Front-Left (-X, +Y, +Z) closest to the viewer,
    //     nested cleanly inside the concave cavity of the outer layers without cutting across outer walls!
    const organStepVectors = {
      stomach: new THREE.Vector3(-7.6, 1.2, 5.4),
      duodenum: new THREE.Vector3(-4.6, 0.8, 3.4),
      small_intestine: new THREE.Vector3(-6.8, 1.0, 4.8),
      large_intestine: new THREE.Vector3(-8.2, 1.1, 5.6),
      gallbladder_tree: new THREE.Vector3(-6.8, 1.1, 4.2),
      esophagus: new THREE.Vector3(-4.5, 0.5, 3.5)
    };

    const organColors = {
      stomach: 0xe11d48,
      duodenum: 0xf97316,
      small_intestine: 0xf87171,
      large_intestine: 0x84cc16,
      gallbladder_tree: 0x10b981,
      esophagus: 0xec4899
    };

    let activeGuidePoints = null;
    let activeGuideColor = 0xe11d48;
    const tempBox = new THREE.Box3();

    hollowOrgans.forEach((organId) => {
      let layerMeshes = null;
      if (layersMap && layersMap.has(organId)) {
        layerMeshes = layersMap.get(organId);
      } else if (organId === 'stomach' && stomachWallMeshes && stomachWallMeshes.length > 0) {
        layerMeshes = stomachWallMeshes;
      }

      if (!layerMeshes || layerMeshes.length === 0) return;

      const isThisOrganSelected = (selectedOrganId === organId);
      const N = layerMeshes.length;
      const stepVec = organStepVectors[organId] || new THREE.Vector3(-6.0, 1.0, 4.5);
      const guidePoints = [];

      layerMeshes.forEach((mesh, idx) => {
        const initPos = mesh.userData.initialPos || new THREE.Vector3();
        const pos = initPos.clone();

        if (isThisOrganSelected && t > 0) {
          // Task 6 Reversed Telescoping Order:
          // idx = 0 (Serosa, outermost) -> -(N-1)/2 (furthest back, cradles inner layers)
          // idx = N-1 (Mucosa, innermost) -> +(N-1)/2 (nearest to user +Z, nested inside outer layers)
          const centeredStep = idx - ((N - 1) / 2.0);
          const offset = new THREE.Vector3(
            stepVec.x * centeredStep,
            stepVec.y * centeredStep,
            stepVec.z * centeredStep
          );
          pos.addScaledVector(offset, t);
        }

        mesh.position.copy(pos);
        mesh.updateWorldMatrix(true, false);

        if (isThisOrganSelected && t > 0.02 && mesh.visible) {
          tempBox.setFromObject(mesh);
          guidePoints.push(tempBox.getCenter(new THREE.Vector3()));
        }
      });

      if (isThisOrganSelected && guidePoints.length >= 2) {
        activeGuidePoints = guidePoints;
        activeGuideColor = organColors[organId] || 0xe11d48;
      }
    });

    // Update per-layer local 50% longitudinal cutaway planes
    if (this.stomachBuilder) {
      this.stomachBuilder.updateClipping(selectedOrganId, isCutawayOpen, t);
    }

    // Update 3D dashed leader line connecting the exploded layers
    if (activeGuidePoints && t > 0.02) {
      this.stomachGuideLine.geometry.setFromPoints(activeGuidePoints);
      this.stomachGuideLine.material.color.setHex(activeGuideColor);
      this.stomachGuideLine.computeLineDistances();
      this.stomachGuideLine.visible = true;
    } else {
      this.stomachGuideLine.visible = false;
    }
  }

  /**
   * Smoothly animates explosion factor from current value to target (0 or 1).
   */
  animateExplodeTo(dissectionVM, targetFactor, durationMs = 650) {
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }

    const startFactor = dissectionVM.state.explodeFactor || 0;
    const delta = targetFactor - startFactor;
    if (Math.abs(delta) < 0.005) {
      dissectionVM.setExplodeFactor(targetFactor);
      return;
    }

    const startTime = performance.now();
    const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = easeOutCubic(progress);
      dissectionVM.setExplodeFactor(startFactor + delta * eased);

      if (progress < 1) {
        this._animFrameId = requestAnimationFrame(step);
      } else {
        this._animFrameId = null;
      }
    };

    this._animFrameId = requestAnimationFrame(step);
  }
}
