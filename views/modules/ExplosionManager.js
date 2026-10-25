import * as THREE from 'three';

/**
 * ExplosionManager.js
 * Module 3: Context-Aware 3D Explosion Controller & Smooth Animation Engine.
 *
 * Supports two seamless modes driven by a single unified `explodeFactor` (0..1):
 *   1. Whole-System Radial Explosion (when no specific organ is selected):
 *      Separates all digestive organs (Liver, Stomach, Gallbladder, Pancreas, Duodenum,
 *      Jejunum/Ileum, Colon segments, Esophagus, Omentum) radially outward in 3D space.
 *   2. Focused Organ Layer / Sub-assembly Explosion (when an organ is selected):
 *      - Stomach: Fans out the 5 outer Cutaway Shells in front of the Mucosa Rugae core
 *        with a 3D dashed axis guide line connecting the shells.
 *      - Liver / Colon / Biliary / Pancreas: Separates anatomical sub-segments (e.g., Couinaud I-VIII).
 */
export class ExplosionManager {
  constructor(scene, masterRoot, stomachBuilder) {
    this.scene = scene;
    this.masterRoot = masterRoot;
    this.stomachBuilder = stomachBuilder;
    this._animFrameId = null;

    // 3D Dashed guide line connecting exploded stomach shells to the core
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
   * Computes a natural 3D explosion vector (in centimeter space inside masterRoot)
   * for every digestive mesh based on its organId and sub-structure name.
   */
  assignExplosionVectors(clickableMeshes) {
    // Whole-organ radial offsets (in Z-Anatomy centimeter space; 10 cm ≈ 1.26 world units)
    const organSystemOffsets = {
      liver: new THREE.Vector3(-12.0, 9.0, 4.0),
      gallbladder_tree: new THREE.Vector3(-8.0, 2.0, 12.0),
      stomach: new THREE.Vector3(12.0, 7.0, 7.0),
      pancreas: new THREE.Vector3(3.0, 0.0, -10.0),
      duodenum: new THREE.Vector3(-4.0, -1.0, 8.0),
      small_intestine: new THREE.Vector3(0.0, -10.0, 11.0),
      large_intestine: new THREE.Vector3(0.0, -4.0, 3.0),
      esophagus: new THREE.Vector3(2.0, 15.0, -4.0),
      peritoneum_omentum: new THREE.Vector3(0.0, -2.0, 18.0)
    };

    clickableMeshes.forEach((mesh) => {
      const organId = mesh.userData.organId;
      const low = (mesh.userData.rawName || mesh.name || '').toLowerCase();

      // 1. Whole-system offset for this mesh
      const sysVec = (organSystemOffsets[organId] || new THREE.Vector3(0, 0, 5)).clone();

      // Add subtle sub-part dispersion during whole-system explosion
      const subVec = new THREE.Vector3(0, 0, 0);
      if (organId === 'liver') {
        if (low.includes('(i)')) subVec.set(0, 6, -9);
        else if (low.includes('(ii)')) subVec.set(9, 6, -3);
        else if (low.includes('(iii)')) subVec.set(9, -3, 6);
        else if (low.includes('(iv)')) subVec.set(2, -4, 9);
        else if (low.includes('(v)')) subVec.set(-7, -5, 8);
        else if (low.includes('(vi)')) subVec.set(-10, -5, -4);
        else if (low.includes('(vii)')) subVec.set(-10, 6, -6);
        else if (low.includes('(viii)')) subVec.set(-5, 8, 4);
        else subVec.set(-3, 2, 2);
      } else if (organId === 'gallbladder_tree') {
        if (low.includes('gallbladder')) subVec.set(-6, -4, 7);
        else subVec.set(-3, -2, 4);
      } else if (organId === 'large_intestine') {
        if (low.includes('appendix')) subVec.set(-10, -9, 7);
        else if (low.includes('ascending') || low.includes('cecum') || low.includes('caecum')) subVec.set(-9, -2, 2);
        else if (low.includes('transverse')) subVec.set(0, 7, 8);
        else if (low.includes('descending')) subVec.set(9, -2, 2);
        else if (low.includes('sigmoid')) subVec.set(6, -8, 4);
      } else if (organId === 'pancreas') {
        if (low.includes('duct')) subVec.set(4, 0, 6);
        else subVec.set(5, 0, -3);
      } else if (organId === 'duodenum') {
        subVec.set(-5, -2, 5);
      }

      mesh.userData.systemExplodeVec = sysVec.addScaledVector(subVec, 0.45);
      mesh.userData.subExplodeVec = subVec.lengthSq() > 0 ? subVec : sysVec.clone().multiplyScalar(0.5);
    });
  }

  /**
   * Applies the current explosion factor (0..1) based on context:
   * - If no organ is selected: explodes all digestive organs radially.
   * - If Stomach is selected: fans out the 6 stomach layers (Cutaway Shells) + updates clipping.
   * - If another organ is selected: explodes that organ's sub-parts.
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

    // 1. Non-wall visceral meshes
    clickableMeshes.forEach((mesh) => {
      if (mesh.userData.isWallLayer || mesh.userData.isStomachWallLayer) return;
      const initPos = mesh.userData.initialPos;
      if (!initPos) return;

      if (!selectedOrganId) {
        // Whole-system explosion
        const vec = mesh.userData.systemExplodeVec;
        if (vec && t > 0) {
          mesh.position.copy(initPos).addScaledVector(vec, t);
        } else {
          mesh.position.copy(initPos);
        }
      } else if (mesh.userData.organId === selectedOrganId) {
        // Selected organ sub-assembly explosion (e.g. Liver Couinaud segments, or colon frame)
        const vec = mesh.userData.subExplodeVec;
        if (vec && t > 0) {
          mesh.position.copy(initPos).addScaledVector(vec, t * 1.15);
        } else {
          mesh.position.copy(initPos);
        }
      } else {
        mesh.position.copy(initPos);
      }
    });

    // 2. Multi-Organ Concentric Histological Layers Explosion
    // Supported hollow organs: stomach (6 layers), duodenum (5 layers), small_intestine (5 layers), large_intestine (5 layers)
    const hollowOrgans = ['stomach', 'duodenum', 'small_intestine', 'large_intestine'];
    const organStepVectors = {
      stomach: new THREE.Vector3(-7.8, 1.4, 5.2),
      duodenum: new THREE.Vector3(-4.5, 0.9, 3.2),
      small_intestine: new THREE.Vector3(-6.2, 1.2, 4.2),
      large_intestine: new THREE.Vector3(-6.8, 1.3, 4.5)
    };
    const organColors = {
      stomach: 0xe11d48,
      duodenum: 0xf97316,
      small_intestine: 0xf87171,
      large_intestine: 0x84cc16
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
      const isWholeSystemExploding = (!selectedOrganId && t > 0);
      const N = layerMeshes.length;
      const stepVec = organStepVectors[organId] || new THREE.Vector3(-10, 2, 7);
      const guidePoints = [];

      layerMeshes.forEach((mesh, idx) => {
        const initPos = mesh.userData.initialPos || new THREE.Vector3();
        const pos = initPos.clone();

        if (isWholeSystemExploding) {
          // Move all layers of this organ together along its whole-system explosion vector
          const sysVec = mesh.userData.systemExplodeVec || new THREE.Vector3(0, 0, 5);
          pos.addScaledVector(sysVec, t);
        } else if (isThisOrganSelected && t > 0) {
          // Near-to-Far Orthogonal Depth Cascade (Zero Overlap):
          // idx = 0 (Serosa, outermost) -> centeredStep = +(N-1)/2 (+Z nearest viewer, -X left)
          // idx = N-1 (Mucosa, innermost) -> centeredStep = -(N-1)/2 (-Z deepest into screen, +X right)
          const centeredStep = ((N - 1) / 2.0) - idx;
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

      if (isThisOrganSelected) {
        if (guidePoints.length >= 2) {
          activeGuidePoints = guidePoints;
          activeGuideColor = organColors[organId] || 0xe11d48;
        }
      }
    });

    // Update clipping planes for the selected hollow organ (or reset if whole system)
    if (this.stomachBuilder) {
      const activeHollow = hollowOrgans.includes(selectedOrganId) ? selectedOrganId : 'stomach';
      const effectiveLayerExplode = hollowOrgans.includes(selectedOrganId) ? t : 0.0;
      this.stomachBuilder.updateClipping(activeHollow, isCutawayOpen, effectiveLayerExplode);
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
  animateExplodeTo(dissectionVM, targetFactor, durationMs = 600) {
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
