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
        if (mesh.userData.isLigament) {
          const ligName = (mesh.name || mesh.userData.subPartId || '').toLowerCase();
          if (ligName.includes('falciform')) {
            // Lifts forward (+Z) away from the anterior groove for unobstructed inspection
            subVec.set(0.8, 1.2, 7.5);
          } else if (ligName.includes('round')) {
            // Lifts forward (+Z) and downward toward anterior abdominal wall/umbilicus
            subVec.set(1.0, -2.5, 8.5);
          } else if (ligName.includes('coronary_ligament_superior')) {
            // Lifts upward (+Y) above the liver dome, freeing Segments VIII & II
            subVec.set(-1.0, 8.2, 0.5);
          } else if (ligName.includes('coronary_ligament_inferior')) {
            // Lifts downward and backward behind the right lobe
            subVec.set(-6.5, -4.5, -7.0);
          } else if (ligName.includes('left_triangular')) {
            // Expands outward to the left away from the left lobe
            subVec.set(10.5, 4.5, 0.5);
          } else if (ligName.includes('right_triangular')) {
            // Expands outward to the right away from the right lobe
            subVec.set(-11.5, 4.5, -1.0);
          } else if (ligName.includes('venosum')) {
            // Lifts backward into posterior plane away from caudate lobe
            subVec.set(0.0, 3.8, -5.5);
          } else {
            subVec.set(0.0, 4.0, 4.0);
          }
        } else if (low.includes('(i)')) subVec.set(0.5, 4.5, -2.5);
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
      } else if (mesh.userData.couinaudSeg) {
        // Segmental vascular pedicles (Portal vein branch & Hepatic artery branch)
        // follow the exact explosion vector of their corresponding Couinaud segment!
        const cSeg = (mesh.userData.couinaudSeg || '').toLowerCase();
        if (cSeg.includes('_i') && !cSeg.includes('_ii') && !cSeg.includes('_iii') && !cSeg.includes('_iv')) subVec.set(0.5, 4.5, -2.5);
        else if (cSeg.includes('_ii') && !cSeg.includes('_iii')) subVec.set(6.5, 3.8, -1.0);
        else if (cSeg.includes('_iii')) subVec.set(6.8, -3.2, 1.8);
        else if (cSeg.includes('_iv')) subVec.set(1.5, -2.8, 2.2);
        else if (cSeg.includes('_v') && !cSeg.includes('_vi') && !cSeg.includes('_vii') && !cSeg.includes('_viii')) subVec.set(-3.2, -4.2, 2.0);
        else if (cSeg.includes('_vi') && !cSeg.includes('_vii')) subVec.set(-8.2, -3.8, -1.5);
        else if (cSeg.includes('_vii')) subVec.set(-8.0, 4.2, -1.5);
        else if (cSeg.includes('_viii')) subVec.set(-3.0, 4.8, 1.5);
      } else if (organId === 'portal_system') {
        if (low.includes('superior_mesenteric')) subVec.set(0.0, -3.5, 2.5);
        else if (low.includes('splenic')) subVec.set(4.0, 1.0, 1.5);
        else if (low.includes('inferior_mesenteric')) subVec.set(-2.5, -4.0, 2.0);
        else if (low.includes('right_colic')) subVec.set(-3.5, -2.5, 2.0);
        else if (low.includes('middle_colic')) subVec.set(-2.0, -1.5, 2.5);
        else subVec.set(0.0, 2.0, 3.0);
      } else if (organId === 'hepatic_artery') {
        if (low.includes('coeliac')) subVec.set(0.0, 1.0, -2.0);
        else if (low.includes('common')) subVec.set(2.0, 1.5, 0.5);
        else if (low.includes('proper')) subVec.set(1.5, 3.5, 2.0);
        else subVec.set(1.0, 2.0, 1.0);
      } else if (organId === 'hepatic_veins') {
        if (low.includes('right_hepatic')) subVec.set(-4.0, 2.5, 0.0);
        else if (low.includes('middle_hepatic')) subVec.set(-1.0, 2.0, 1.5);
        else if (low.includes('left_hepatic')) subVec.set(2.0, 2.5, 1.0);
        else subVec.set(0.0, 4.0, -2.0);
      } else if (organId === 'oral_cavity') {
        const isUpper = low.includes('maxill') || (low.includes('upper') && (low.includes('tooth') || low.includes('teeth') || low.includes('incisor') || low.includes('canine') || low.includes('premolar') || low.includes('molar')));
        const isLower = low.includes('mandib') || (!isUpper && (low.includes('tooth') || low.includes('teeth') || low.includes('incisor') || low.includes('canine') || low.includes('premolar') || low.includes('molar')));
        if (isLower) {
          subVec.set(0.0, -2.5, 2.5);
        } else if (isUpper) {
          subVec.set(0.0, 2.5, 2.5);
        } else if (low.includes('gingiva')) {
          subVec.set(0.0, -1.8, 2.5);
        } else if (low.includes('tongue')) {
          subVec.set(0.0, -0.5, 3.8);
        } else if (low.includes('naso')) {
          subVec.set(0.0, 3.5, -2.0);
        } else if (low.includes('oro')) {
          subVec.set(0.0, 1.2, -2.5);
        } else if (low.includes('laryngo')) {
          subVec.set(0.0, -1.8, -2.0);
        } else if (low.includes('palate') || low.includes('uvula')) {
          subVec.set(0.0, 1.2, -1.5);
        } else if (low.includes('epiglottis') || low.includes('hyoid')) {
          subVec.set(0.0, -1.5, 0.5);
        } else if (low.includes('gland')) {
          subVec.set(low.includes('r') ? -4.5 : 4.5, 0.5, 0.0);
        } else {
          subVec.set(0.0, 0.0, 2.0);
        }
      } else if (organId === 'pharynx') {
        if (low.includes('naso')) subVec.set(0.0, 4.0, 0.0);
        else if (low.includes('oro')) subVec.set(0.0, 1.5, 1.0);
        else if (low.includes('laryngo')) subVec.set(0.0, -2.0, 1.0);
        else if (low.includes('palate') || low.includes('uvula')) subVec.set(0.0, 1.0, -2.0);
        else if (low.includes('epiglottis')) subVec.set(0.0, -1.0, 2.0);
        else subVec.set(0.0, 1.0, 0.0);
      } else if (organId === 'teeth_and_jaw') {
        const isUpper = low.includes('maxill') || (low.includes('upper') && (low.includes('tooth') || low.includes('teeth') || low.includes('incisor') || low.includes('canine') || low.includes('premolar') || low.includes('molar')));
        if (isUpper) subVec.set(0.0, 2.5, 2.5);
        else subVec.set(0.0, -2.5, 2.5);
      } else if (organId === 'salivary_glands') {
        if (low.includes('parotid')) subVec.set(low.includes('r') ? -4.5 : 4.5, 2.0, -1.0);
        else if (low.includes('submandibular')) subVec.set(low.includes('r') ? -3.5 : 3.5, -2.0, 1.0);
        else subVec.set(0.0, -3.0, 3.0);
      } else if (organId === 'tongue') {
        subVec.set(0.0, -1.0, 2.5);
      }

      mesh.userData.subExplodeVec = subVec;
    });

    // =========================================================================
    // BUILD 4-ROW KNOLLING CATALOG GRID (Human Atlas 2D Row Layout)
    // =========================================================================
    // Identify compound anatomical structures that move as a unified exhibit in knolling:
    // 1. Mandible anchors the entire dental & jaw apparatus: all upper/lower teeth, gingiva, maxillae, tongue
    const mandibleMesh = clickableMeshes.find(m => (m.userData.rawName || m.name || '') === 'Mandible')
      || clickableMeshes.find(m => (m.userData.rawName || m.name || '').toLowerCase() === 'mandible');
    
    // 2. Pharynx complex anchors pharynx, soft palate, uvula, epiglottis, hyoid bone
    const pharynxAnchor = clickableMeshes.find(m => (m.userData.rawName || m.name || '') === 'Oropharynx')
      || clickableMeshes.find(m => (m.userData.rawName || m.name || '').toLowerCase().includes('pharynx'));

    // 3. Salivary glands complex anchors bilateral parotid, submandibular, and sublingual glands
    const salivaryAnchor = clickableMeshes.find(m => (m.userData.rawName || m.name || '').toLowerCase().includes('parotid_glandl'))
      || clickableMeshes.find(m => (m.userData.rawName || m.name || '').toLowerCase().includes('parotid'));

    // 4. Portal venous branches follow Hepatic_portal_vein
    const portalAnchor = clickableMeshes.find(m => {
      const n = (m.userData.rawName || m.name || '').toLowerCase();
      return n === 'hepatic_portal_vein' || n === 'portal_vein' || n.includes('hepatic_portal');
    }) || clickableMeshes.find(m => (m.userData.rawName || m.name || '').toLowerCase().includes('portal'));
    
    // 5. Hepatic arterial branches follow Coeliac_trunk
    const celiacAnchor = clickableMeshes.find(m => {
      const n = (m.userData.rawName || m.name || '').toLowerCase();
      return n.includes('coeliac') || n.includes('celiac');
    });
    
    // 6. Hepatic veins follow Inferior_vena_cava
    const ivcAnchor = clickableMeshes.find(m => (m.userData.rawName || m.name || '').toLowerCase().includes('cava'));

    clickableMeshes.forEach((mesh) => {
      const organId = mesh.userData.organId;
      const low = (mesh.userData.rawName || mesh.name || '').toLowerCase();

      // Clear any prior knolling anchor
      mesh.userData.knollingAnchor = null;

      if (organId === 'oral_cavity' || organId === 'teeth_and_jaw') {
        const isTeethOrJawOrTongue = low.includes('tooth') || low.includes('teeth') || low.includes('incisor') ||
          low.includes('canine') || low.includes('premolar') || low.includes('molar') ||
          low.includes('mandib') || low.includes('maxill') || low.includes('gingiva') || low.includes('tongue');
        const isPharynxOrPalate = low.includes('pharynx') || low.includes('palate') || low.includes('uvula') || low.includes('epiglottis') || low.includes('hyoid');
        const isGland = low.includes('gland');

        if (isTeethOrJawOrTongue && mandibleMesh && mesh !== mandibleMesh) {
          mesh.userData.knollingAnchor = mandibleMesh;
        } else if (isPharynxOrPalate && pharynxAnchor && mesh !== pharynxAnchor) {
          mesh.userData.knollingAnchor = pharynxAnchor;
        } else if (isGland && salivaryAnchor && mesh !== salivaryAnchor) {
          mesh.userData.knollingAnchor = salivaryAnchor;
        }
      } else if (organId === 'tongue') {
        if (mandibleMesh && mesh !== mandibleMesh) {
          mesh.userData.knollingAnchor = mandibleMesh;
        }
      } else if (organId === 'pharynx') {
        if (pharynxAnchor && mesh !== pharynxAnchor) {
          mesh.userData.knollingAnchor = pharynxAnchor;
        }
      } else if (organId === 'salivary_glands') {
        if (salivaryAnchor && mesh !== salivaryAnchor) {
          mesh.userData.knollingAnchor = salivaryAnchor;
        }
      } else if (organId === 'portal_system') {
        if (portalAnchor && mesh !== portalAnchor) {
          mesh.userData.knollingAnchor = portalAnchor;
        }
      } else if (organId === 'hepatic_artery') {
        if (celiacAnchor && mesh !== celiacAnchor) {
          mesh.userData.knollingAnchor = celiacAnchor;
        }
      } else if (organId === 'hepatic_veins') {
        if (ivcAnchor && mesh !== ivcAnchor) {
          mesh.userData.knollingAnchor = ivcAnchor;
        }
      } else if (organId === 'large_intestine') {
        if (mesh.name === 'colon_epiploic_appendages' || mesh.userData.isEpiploicAppendage) {
          const colonSerosa = clickableMeshes.find(m => m.name === 'colon_serosa');
          if (colonSerosa) {
            mesh.userData.knollingAnchor = colonSerosa;
          }
        }
      } else if (organId === 'gallbladder_tree' || (mesh.userData.wallLayerId && mesh.userData.wallLayerId.startsWith('bile_'))) {
        const wallIdx = mesh.userData.wallLayerIndex;
        if (wallIdx !== undefined && mesh.userData.wallLayerId && mesh.userData.wallLayerId.startsWith('bile_')) {
          const gbMeshes = clickableMeshes.filter(m => m.userData.wallLayerId && m.userData.wallLayerId.startsWith('gb_'));
          if (gbMeshes[wallIdx]) {
            mesh.userData.knollingAnchor = gbMeshes[wallIdx];
          }
        }
      } else if (mesh.userData.isLigament) {
        const anchorTag = (mesh.userData.couinaudAnchor || '').toLowerCase();
        const cRoman = anchorTag.replace('segment_', '');
        const anchorMesh = clickableMeshes.find(m => {
          if (m.userData.organId !== 'liver' || m.userData.isLigament) return false;
          const mName = (m.userData.rawName || m.name || '').toLowerCase();
          return mName.includes(`(${cRoman})`) || mName.includes(`_${cRoman}`) || (m.userData.couinaudSeg && m.userData.couinaudSeg.toLowerCase().includes(cRoman));
        });
        if (anchorMesh) {
          mesh.userData.knollingAnchor = anchorMesh;
        }
      }
    });

    const row1 = []; // Upper GI: Oral Cavity / Teeth / Jaws / Pharynx -> Esophagus (5) -> Stomach (6) -> Duodenum (5)
    const row2 = []; // Hepatobiliary, Pancreas & Hepatic Vascular System: Liver (8) -> Gallbladder (4 + duct) -> Pancreas (3) -> Portal Tree -> Hepatic Artery Tree -> Hepatic Vein Tree
    const row3 = []; // Small Intestine (5) + Peritoneum/Omentum (4)
    const row4 = []; // Large Intestine / Whole Colon Frame (5)

    const sortByLayerOrName = (a, b) => {
      const oa = a.userData.wallLayerOrder || 99;
      const ob = b.userData.wallLayerOrder || 99;
      if (oa !== ob) return oa - ob;
      return (a.name || '').localeCompare(b.name || '');
    };

    // Filter out anchored dependent meshes so only primary knolling anchors hold a grid slot
    const byOrganPrimary = (id) => clickableMeshes
      .filter(m => m.userData.organId === id && !m.userData.knollingAnchor)
      .sort(sortByLayerOrName);

    row1.push(
      ...byOrganPrimary('oral_cavity'),
      ...byOrganPrimary('teeth_and_jaw'),
      ...byOrganPrimary('salivary_glands'),
      ...byOrganPrimary('tongue'),
      ...byOrganPrimary('pharynx'),
      ...byOrganPrimary('esophagus'),
      ...byOrganPrimary('stomach'),
      ...byOrganPrimary('duodenum')
    );

    row2.push(
      ...byOrganPrimary('liver'),
      ...byOrganPrimary('gallbladder_tree'),
      ...byOrganPrimary('pancreas'),
      ...byOrganPrimary('portal_system'),
      ...byOrganPrimary('hepatic_artery'),
      ...byOrganPrimary('hepatic_veins')
    );

    row3.push(...byOrganPrimary('small_intestine'), ...byOrganPrimary('peritoneum_omentum'));
    row4.push(...byOrganPrimary('large_intestine'));

    const rowsConfig = [
      { items: row1, yOffset: 44.0, xShift: 0.0, gapX: 5.0, minSlotW: 8.5 },
      { items: row2, yOffset: 12.0, xShift: 0.0, gapX: 5.0, minSlotW: 8.5 },
      { items: row3, yOffset: -24.0, xShift: 0.0, gapX: 7.0, minSlotW: 18.0 },
      { items: row4, yOffset: -66.0, xShift: 0.0, gapX: 9.0, minSlotW: 30.0 }
    ];

    rowsConfig.forEach((rowCfg) => {
      const items = rowCfg.items;
      if (!items || items.length === 0) return;

      const slotWidths = items.map((mesh) => {
        let w = (mesh.userData.localSize ? mesh.userData.localSize.x : 6);
        const orgId = mesh.userData.organId;
        if (orgId === 'portal_system' || orgId === 'hepatic_artery' || orgId === 'hepatic_veins') {
          w = Math.max(w, 12.0);
        } else if (orgId === 'peritoneum_omentum') {
          w = Math.max(w, 18.0);
        } else if (orgId === 'large_intestine') {
          w = Math.max(w, 28.0);
        }
        // Strictly 100% 1:1 Anatomical Scale: preserve authentic organ proportions without shrinking
        mesh.userData.knollingScale = 1.0;
        return Math.max(rowCfg.minSlotW, w);
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

    // Mark 1:1 true scale for all anchored dependent structures
    clickableMeshes.forEach((mesh) => {
      if (mesh.userData.knollingAnchor) {
        mesh.userData.knollingScale = 1.0;
      }
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
      // Step 1: Position all primary (unanchored) knolling slot holders at true 1:1 scale
      clickableMeshes.forEach((mesh) => {
        if (mesh.userData.knollingAnchor) return; // Processed in Step 2

        const initPos = mesh.userData.initialPos || new THREE.Vector3();
        const initScale = mesh.userData.initialScale || new THREE.Vector3(1, 1, 1);
        const localCenter = mesh.userData.localCenter || new THREE.Vector3();
        const targetCenter = mesh.userData.knollingTargetCenter;

        mesh.scale.copy(initScale); // Strictly 100% 1:1 true scale

        if (t > 0.001 && targetCenter) {
          const startCenterX = initPos.x + localCenter.x * initScale.x;
          const startCenterY = initPos.y + localCenter.y * initScale.y;
          const startCenterZ = initPos.z + localCenter.z * initScale.z;

          const curCenterX = startCenterX + (targetCenter.x - startCenterX) * t;
          const curCenterY = startCenterY + (targetCenter.y - startCenterY) * t;
          const curCenterZ = startCenterZ + (targetCenter.z - startCenterZ) * t;

          mesh.position.set(
            curCenterX - localCenter.x * initScale.x,
            curCenterY - localCenter.y * initScale.y,
            curCenterZ - localCenter.z * initScale.z
          );
        } else {
          mesh.position.copy(initPos);
        }
        mesh.updateWorldMatrix(true, false);
      });

      // Step 2: Strictly rigid translation for all anchored dependent meshes (teeth, jaw, vessels)
      clickableMeshes.forEach((mesh) => {
        const anchor = mesh.userData.knollingAnchor;
        if (!anchor) return;
        if (mesh.parent === anchor) return; // Meshes parented directly to anchor inherit transform automatically

        const initPos = mesh.userData.initialPos || new THREE.Vector3();
        const initScale = mesh.userData.initialScale || new THREE.Vector3(1, 1, 1);
        mesh.scale.copy(initScale); // Strictly 100% 1:1 true scale

        if (t > 0.001) {
          const anchorInitPos = anchor.userData.initialPos || anchor.position;
          const anchorDelta = anchor.position.clone().sub(anchorInitPos);
          mesh.position.copy(initPos).add(anchorDelta);
        } else {
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

      const isLiverSegmentalVessel = (selectedOrganId === 'liver' && !!mesh.userData.couinaudSeg);
      const isPortalSegmental = (selectedOrganId === 'portal_system' && !!mesh.userData.couinaudSeg);

      if ((mesh.userData.organId === selectedOrganId || isLiverSegmentalVessel || isPortalSegmental) && t > 0) {
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
      'bile_duct',
      'esophagus'
    ];

    // Step vectors: when multiplied by `centeredStep = idx - (N - 1) / 2`:
    //   - idx = 0 (Outermost Serosa/Adventitia, centeredStep < 0) moves to Back-Right (+X, -Y, -Z) as the outer cradle
    //   - idx = N-1 (Innermost Mucosa, centeredStep > 0) moves to Front-Left (-X, +Y, +Z) closest to the viewer,
    //     nested cleanly inside the concave cavity of the outer layers without cutting across outer walls!
    // Step vectors strictly aligned along the outward normal vector (n_cut)
    // at the center of each cutaway plane, guaranteeing zero lateral shearing and zero layer overlap:
    //   - Stomach: n_cut = (-0.28, 0.12, 0.95) along anterior curved crest
    //   - Duodenum: n_cut = (-0.55, 0.08, 0.83) along C-loop outer convexity
    //   - Small Intestine: n_cut = (0.0, 0.0, 1.0) along anterior apex loops
    //   - Large Intestine: n_cut = (0.0, 0.0, 1.0) along anterior Taenia coli (zero X/Y shearing)
    //   - Gallbladder: n_cut = (-0.35, -0.38, 0.85) along fundus/body oblique cut
    //   - Bile Duct: n_cut = (-0.25, -0.28, 0.90) along tubular midline
    //   - Esophagus: n_cut = (0.7, 0.0, 0.7) along left-anterior longitudinal midline
    const organStepVectors = {
      stomach: new THREE.Vector3(-2.8, 1.2, 9.8),
      duodenum: new THREE.Vector3(-5.2, 0.8, 8.5),
      small_intestine: new THREE.Vector3(0.0, 0.0, 10.2),
      large_intestine: new THREE.Vector3(0.0, 0.0, 12.0),
      gallbladder_tree: new THREE.Vector3(6.8, 0.0, 0.0),
      bile_duct: new THREE.Vector3(6.8, 0.0, 0.0),
      esophagus: new THREE.Vector3(4.5, 0.0, 5.5)
    };

    const organColors = {
      stomach: 0xe11d48,
      duodenum: 0xf97316,
      small_intestine: 0xf87171,
      large_intestine: 0x84cc16,
      gallbladder_tree: 0x10b981,
      bile_duct: 0x10b981,
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

      const isThisOrganSelected = (selectedOrganId === organId) || (selectedOrganId === 'gallbladder_tree' && organId === 'bile_duct');
      const N = layerMeshes.length;
      const stepVec = organStepVectors[organId] || new THREE.Vector3(-6.0, 1.0, 4.5);
      const guidePoints = [];

      layerMeshes.forEach((mesh, idx) => {
        const initPos = mesh.userData.initialPos || new THREE.Vector3();
        const initScale = mesh.userData.initialScale || new THREE.Vector3(1, 1, 1);
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

          // Strictly preserve 100% authentic 1:1 anatomical scale without artificial compression
          mesh.scale.copy(initScale);
        } else {
          mesh.scale.copy(initScale);
        }

        mesh.position.copy(pos);
        mesh.updateWorldMatrix(true, false);

        if (selectedOrganId === organId && t > 0.02 && mesh.visible) {
          tempBox.setFromObject(mesh);
          guidePoints.push(tempBox.getCenter(new THREE.Vector3()));
        }
      });

      if (selectedOrganId === organId && guidePoints.length >= 2) {
        activeGuidePoints = guidePoints;
        activeGuideColor = organColors[organId] || 0xe11d48;
      }
    });

    // Update per-layer local 50% longitudinal cutaway planes
    if (this.stomachBuilder) {
      this.stomachBuilder.updateClipping(selectedOrganId, isCutawayOpen, t);
    }

    // Update 3D dashed leader line connecting the exploded layers
    if (activeGuidePoints && activeGuidePoints.length >= 2 && activeGuidePoints.every(p => p && typeof p.x === 'number' && !isNaN(p.x)) && t > 0.02) {
      try {
        this.stomachGuideLine.geometry.setFromPoints(activeGuidePoints);
        this.stomachGuideLine.material.color.setHex(activeGuideColor);
        this.stomachGuideLine.computeLineDistances();
        this.stomachGuideLine.visible = true;
      } catch (err) {
        this.stomachGuideLine.visible = false;
      }
    } else {
      this.stomachGuideLine.visible = false;
    }
  }

  stopAnimation() {
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
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
