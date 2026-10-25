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
    const points = [];
    for (let i = 0; i < 6; i++) {
      points.push(new THREE.Vector3());
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineDashedMaterial({
      color: 0xe11d48,
      dashSize: 0.12,
      gapSize: 0.08,
      transparent: true,
      opacity: 0.65,
      depthTest: false
    });
    this.stomachGuideLine = new THREE.Line(geo, mat);
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
    stomachWallMeshes
  }) {
    const t = Math.max(0, Math.min(1, explodeFactor || 0));

    // 1. Non-stomach-layer visceral meshes
    clickableMeshes.forEach((mesh) => {
      if (mesh.userData.isStomachWallLayer) return;
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
        // Selected organ sub-assembly explosion (e.g. Liver Couinaud segments)
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

    // 2. Stomach 6-Layer meshes
    if (stomachWallMeshes && stomachWallMeshes.length > 0) {
      const isStomachSelected = (selectedOrganId === 'stomach');
      const isWholeSystemExploding = (!selectedOrganId && t > 0);

      // Symmetric 3D fan-out in masterRoot centimeter space when Stomach is exploded:
      // Layers 1..6 fan out from screen-left (Serosa, idx=0) to screen-right (Mucosa Rugae, idx=5)
      // centered around the stomach's natural position so all 6 layers remain 100% inside the viewport.
      const shellBaseStep = new THREE.Vector3(-5.8, 0.55, 1.6);
      const guidePoints = [];
      const tempBox = new THREE.Box3();

      stomachWallMeshes.forEach((mesh, idx) => {
        const initPos = mesh.userData.initialPos || new THREE.Vector3();
        const pos = initPos.clone();

        if (isWholeSystemExploding) {
          // Move all 6 layers together as a single stomach unit during whole-system explosion
          const sysVec = mesh.userData.systemExplodeVec || new THREE.Vector3(12, 7, 7);
          pos.addScaledVector(sysVec, t);
        } else if (isStomachSelected && t > 0) {
          // Symmetric fan-out:
          // idx = 0 (Serosa) -> centeredStep = +2.5 (leftmost, slightly anterior)
          // idx = 5 (Mucosa) -> centeredStep = -2.5 (rightmost, open lumen window)
          const centeredStep = 2.5 - idx;
          const offset = new THREE.Vector3(
            shellBaseStep.x * centeredStep,
            shellBaseStep.y * centeredStep,
            shellBaseStep.z * centeredStep
          );
          pos.addScaledVector(offset, t);
        }

        mesh.position.copy(pos);
        mesh.updateWorldMatrix(true, false);

        if (isStomachSelected && t > 0.02 && mesh.visible) {
          tempBox.setFromObject(mesh);
          guidePoints.push(tempBox.getCenter(new THREE.Vector3()));
        }
      });

      // Update clipping planes for Cutaway Shells or Cutaway Window
      const effectiveLayerExplode = isStomachSelected ? t : 0.0;
      this.stomachBuilder.updateClipping(isCutawayOpen, effectiveLayerExplode);

      // Update 3D dashed leader line connecting the 6 exploded stomach layers
      if (isStomachSelected && t > 0.02 && guidePoints.length >= 2) {
        this.stomachGuideLine.geometry.setFromPoints(guidePoints);
        this.stomachGuideLine.computeLineDistances();
        this.stomachGuideLine.visible = true;
      } else {
        this.stomachGuideLine.visible = false;
      }
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
