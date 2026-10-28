import * as THREE from 'three';

/**
 * StomachLayersBuilder.js (HollowOrganLayersBuilder)
 * Module 2: Builds concentric histological layers for all 6 hollow visceral organs:
 *   1. Stomach (Dạ dày - 6 layers)
 *   2. Duodenum (Tá tràng - 5 layers with Brunner's glands & Kerckring folds)
 *   3. Small Intestine (Ruột non - 5 layers with Auerbach plexus & Villi, tube-safe inset)
 *   4. Large Intestine / Colon (Đại tràng toàn khung - 5 layers merging Ascending, Transverse,
 *      Descending, Sigmoid, Appendix with Solidify inner-shell stripping for 100% outward normals)
 *   5. Gallbladder (Túi mật - 4 layers: Serosa/Fibrous, Muscularis, Lamina Propria, Honeycomb Mucosa)
 *   6. Esophagus (Thực quản - 5 layers: Adventitia, Longitudinal, Circular, Submucosa, Squamous Mucosa)
 *
 * Guarantees strict histological ordering from INSIDE to OUTSIDE:
 *   Mucosa (innermost, smallest radius) -> Submucosa -> Stratum Circulare -> Stratum Longitudinale -> Serosa (outermost, largest radius)
 */
export class StomachLayersBuilder {
  constructor(proceduralTextures) {
    this.proceduralTextures = proceduralTextures;
    this.organLayersMap = new Map();
    this.baseCenterMap = new Map();
    this.stomachWallMeshes = [];
    this.duodenumWallMeshes = [];
    this.smallIntestineWallMeshes = [];
    this.colonWallMeshes = [];
    this.gallbladderWallMeshes = [];
    this.esophagusWallMeshes = [];
    this.baseCenterWorld = new THREE.Vector3(0.688, 0.339, 0.206);

    // Meshes in DigestiveSystem.glb that have a Blender Solidify inner duplicate shell (second half of vertices)
    this.solidifyMeshNames = new Set([
      'Ascending_colon',
      'Transverse_colon',
      'Descending_colon',
      'Sigmoid_colon',
      'Oesophagus'
    ]);
  }

  /**
   * Strips the Blender Solidify inner duplicate shell (vertices >= total/2) from meshes
   * like Ascending_colon, Transverse_colon, Descending_colon, Sigmoid_colon, and Oesophagus.
   * This ensures 100% of remaining vertices belong to the single-walled outer surface
   * with strictly OUTWARD-pointing normals, so subtracting `normal * d` always shrinks
   * inner layers (Mucosa < Submucosa < Stratum < Serosa) inward toward the lumen!
   */
  _extractOuterSurfaceGeometry(mesh) {
    const srcGeo = mesh.geometry;
    if (!srcGeo) return null;

    const posAttr = srcGeo.attributes.position;
    const normAttr = srcGeo.attributes.normal;
    const totalVerts = posAttr.count;
    const isSolidified = this.solidifyMeshNames.has(mesh.name) && (totalVerts % 2 === 0);

    if (!isSolidified) {
      const cloned = srcGeo.clone();
      if (!cloned.attributes.normal) {
        cloned.computeVertexNormals();
      }
      return cloned;
    }

    const half = totalVerts / 2;
    const newPositions = new Float32Array(half * 3);
    const newNormals = new Float32Array(half * 3);
    for (let i = 0; i < half; i++) {
      newPositions[i * 3]     = posAttr.getX(i);
      newPositions[i * 3 + 1] = posAttr.getY(i);
      newPositions[i * 3 + 2] = posAttr.getZ(i);
      if (normAttr) {
        newNormals[i * 3]     = normAttr.getX(i);
        newNormals[i * 3 + 1] = normAttr.getY(i);
        newNormals[i * 3 + 2] = normAttr.getZ(i);
      }
    }

    const newIndices = [];
    if (srcGeo.index) {
      const idxArr = srcGeo.index.array;
      for (let t = 0; t < idxArr.length; t += 3) {
        const a = idxArr[t];
        const b = idxArr[t + 1];
        const c = idxArr[t + 2];
        if (a < half && b < half && c < half) {
          newIndices.push(a, b, c);
        }
      }
    } else {
      for (let t = 0; t < half; t += 3) {
        newIndices.push(t, t + 1, t + 2);
      }
    }

    const cleanGeo = new THREE.BufferGeometry();
    cleanGeo.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
    if (normAttr) {
      cleanGeo.setAttribute('normal', new THREE.BufferAttribute(newNormals, 3));
    } else {
      cleanGeo.computeVertexNormals();
    }
    cleanGeo.setIndex(newIndices);
    cleanGeo.computeBoundingBox();
    cleanGeo.computeBoundingSphere();
    return cleanGeo;
  }

  /**
   * Computes the local 50% anterior-posterior tube centerline Z (`aCutMidZ`) for each vertex
   * of a single hollow segment using an O(N) 3x3 spatial bucket grid in (X, Y).
   * This ensures that curved segments at different Z depths (e.g. Transverse Colon vs.
   * Descending/Sigmoid Colon, or Duodenum D1-D4) are each cut at their own exact 50%
   * longitudinal tube midline so no segment ever disappears when cutaway is active.
   */
  _computeSubMeshCutMidZ(posAttr) {
    const count = posAttr.count;
    const midZ = new Float32Array(count);
    const cell = 2.5;
    const buckets = new Map();

    for (let i = 0; i < count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      const gx = Math.floor(x / cell);
      const gy = Math.floor(y / cell);
      const key = `${gx},${gy}`;
      const b = buckets.get(key);
      if (!b) {
        buckets.set(key, { minZ: z, maxZ: z });
      } else {
        if (z < b.minZ) b.minZ = z;
        if (z > b.maxZ) b.maxZ = z;
      }
    }

    // Smooth the tube centerline Z across a 5x5 neighborhood so Haustral pouches
    // never create notches along the 50% longitudinal cut edge.
    for (let i = 0; i < count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const gx = Math.floor(x / cell);
      const gy = Math.floor(y / cell);
      let sumMid = 0;
      let weightSum = 0;
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          const b = buckets.get(`${gx + dx},${gy + dy}`);
          if (b) {
            const w = 1.0 / (1.0 + Math.hypot(dx, dy));
            sumMid += 0.5 * (b.minZ + b.maxZ) * w;
            weightSum += w;
          }
        }
      }
      midZ[i] = (weightSum > 0) ? (sumMid / weightSum) : posAttr.getZ(i);
    }

    return midZ;
  }

  /**
   * Merges an array of Three.js Meshes into a single unified BufferGeometry
   * in their parent's local coordinate space, stripping any Solidify inner shells first
   * and computing each sub-mesh's exact 50% tube centerline Z (`aCutMidZ`).
   */
  _mergeMeshesToGeometry(meshes) {
    const positions = [];
    const normals = [];
    const cutMidZs = [];
    const indices = [];
    let vertexOffset = 0;

    meshes.forEach((m) => {
      if (!m || !m.geometry) return;
      m.updateMatrix();
      const g = this._extractOuterSurfaceGeometry(m);
      if (!g) return;
      g.applyMatrix4(m.matrix);
      if (!g.attributes.normal) {
        g.computeVertexNormals();
      }

      const posAttr = g.attributes.position;
      const normAttr = g.attributes.normal;
      const subMidZ = this._computeSubMeshCutMidZ(posAttr);
      const isAppendix = (m.name || '').toLowerCase().includes('appendix');
      const insetScale = isAppendix ? 0.22 : 1.0;

      for (let i = 0; i < posAttr.count; i++) {
        positions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
        normals.push(
          normAttr.getX(i) * insetScale,
          normAttr.getY(i) * insetScale,
          normAttr.getZ(i) * insetScale
        );
        cutMidZs.push(subMidZ[i]);
      }

      if (g.index) {
        const idxArr = g.index.array;
        for (let i = 0; i < idxArr.length; i++) {
          indices.push(idxArr[i] + vertexOffset);
        }
      } else {
        for (let i = 0; i < posAttr.count; i++) {
          indices.push(i + vertexOffset);
        }
      }
      vertexOffset += posAttr.count;
    });

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    merged.setAttribute('aCutMidZ', new THREE.Float32BufferAttribute(cutMidZs, 1));
    merged.setIndex(indices);
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    return merged;
  }

  /**
   * Computes clean anatomical UV coordinates on any BufferGeometry based on its bounding box.
   */
  _assignAnatomicalUVs(geo) {
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bbox = geo.boundingBox;
    if (!bbox) return;

    const sizeX = Math.max(0.001, bbox.max.x - bbox.min.x);
    const sizeY = Math.max(0.001, bbox.max.y - bbox.min.y);
    const sizeZ = Math.max(0.001, bbox.max.z - bbox.min.z);
    const posAttr = geo.attributes.position;
    const uvArray = new Float32Array(posAttr.count * 2);

    for (let i = 0; i < posAttr.count; i++) {
      const nx = (posAttr.getX(i) - bbox.min.x) / sizeX;
      const ny = (posAttr.getY(i) - bbox.min.y) / sizeY;
      const nz = (posAttr.getZ(i) - bbox.min.z) / sizeZ;
      uvArray[i * 2]     = nx * 2.2 + nz * 0.85;
      uvArray[i * 2 + 1] = ny * 2.6;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
  }

  /**
   * Builds 5 concentric histological layers for the ENTIRE Large Intestine (Colon) frame
   * by merging the pure single-walled outer surfaces of Ascending, Transverse, Descending,
   * Sigmoid colon & Vermiform appendix.
   *
   * Strict concentric order from outside to inside:
   *   idx = 0: Serosa (outermost, d = 0.00 cm)
   *   idx = 1: Stratum Longitudinale & Taeniae Coli (d = 0.045 cm inward)
   *   idx = 2: Stratum Circulare (d = 0.090 cm inward)
   *   idx = 3: Submucosa (d = 0.135 cm inward)
   *   idx = 4: Mucosa (innermost, d = 0.180 cm inward)
   */
  createColonCompositeLayers(colonWallMeshes, taeniaMeshes, organsData, parentGroup) {
    if (!colonWallMeshes || colonWallMeshes.length === 0) return [];

    const baseWallGeo = this._mergeMeshesToGeometry(colonWallMeshes);
    this._assignAnatomicalUVs(baseWallGeo);

    // Hide original separate colon & taenia meshes so only the 5 concentric layers render without Z-fighting
    colonWallMeshes.forEach(m => { m.visible = false; });
    if (taeniaMeshes) {
      taeniaMeshes.forEach(m => { m.visible = false; });
    }

    const dummyMesh = new THREE.Mesh(baseWallGeo);
    dummyMesh.position.set(0, 0, 0);
    dummyMesh.rotation.set(0, 0, 0);
    dummyMesh.scale.set(1, 1, 1);
    parentGroup.add(dummyMesh);

    const layers = this.createLayers('large_intestine', dummyMesh, organsData);
    parentGroup.remove(dummyMesh);
    return layers;
  }

  /**
   * Builds concentric layer meshes from a base hollow organ mesh.
   * Signature: createLayers(organId, baseMesh, organsData)
   */
  createLayers(arg1, arg2, arg3) {
    let organId = 'stomach';
    let baseMesh = null;
    let organsData = null;

    if (typeof arg1 === 'string') {
      organId = arg1;
      baseMesh = arg2;
      organsData = arg3;
    } else {
      organId = 'stomach';
      baseMesh = arg1;
      organsData = arg2;
    }

    if (!baseMesh) return [];

    // Strip any Blender Solidify inner shell (e.g. Oesophagus) so all normals point strictly outward
    const origGeo = this._extractOuterSurfaceGeometry(baseMesh);
    origGeo.computeBoundingSphere();
    origGeo.computeBoundingBox();

    if (!origGeo.attributes.aCutMidZ) {
      const midZ = this._computeSubMeshCutMidZ(origGeo.attributes.position);
      origGeo.setAttribute('aCutMidZ', new THREE.Float32BufferAttribute(midZ, 1));
    }

    const localCenter = new THREE.Vector3();
    const localSize = new THREE.Vector3(8, 8, 8);
    if (origGeo.boundingBox) {
      origGeo.boundingBox.getCenter(localCenter);
      origGeo.boundingBox.getSize(localSize);
      this._assignAnatomicalUVs(origGeo);
    }

    const organData = (organsData || []).find(o => o.id === organId);
    const wallLayersDef = (organData && organData.wallLayers) || [];
    const count = wallLayersDef.length || (organId === 'stomach' ? 6 : 5);

    // Tube-safe maximum normal inset (in Z-Anatomy local centimeter units).
    // Because all meshes now have strictly OUTWARD normals:
    //   idx = 0 (Serosa/Adventitia) has inset = 0 (OUTERMOST, largest radius)
    //   ...
    //   idx = count - 1 (Mucosa) has inset = maxInset (INNERMOST, smallest radius)
    const safeMaxInsetMap = {
      stomach: 0.28,
      duodenum: 0.14,
      small_intestine: 0.035,
      large_intestine: 0.44,
      gallbladder_tree: 0.08,
      esophagus: 0.12
    };
    const maxInset = safeMaxInsetMap[organId] !== undefined ? safeMaxInsetMap[organId] : 0.08;

    const insets = [];
    for (let i = 0; i < count; i++) {
      insets.push(i * (maxInset / Math.max(1, count - 1)));
    }

    const tex = this.proceduralTextures.getTextures();
    const materials = this._getMaterialsForOrgan(organId, tex);

    const organSysVecs = {
      stomach: new THREE.Vector3(12.0, 7.0, 7.0),
      duodenum: new THREE.Vector3(-4.0, -1.0, 8.0),
      small_intestine: new THREE.Vector3(0.0, -10.0, 11.0),
      large_intestine: new THREE.Vector3(0.0, -4.0, 3.0),
      gallbladder_tree: new THREE.Vector3(-8.0, 2.0, 12.0),
      esophagus: new THREE.Vector3(2.0, 15.0, -4.0)
    };
    const sysVec = organSysVecs[organId] || new THREE.Vector3(0, 0, 5);

    // Anatomical Surface Landmarks defining the 50% Longitudinal Cut Boundary
    // directly matching the clinical red lines in the user's illustration:
    // 1. Stomach: Cardia/Upper body -> Mid anterior crest -> Lower antrum -> Pylorus
    // 2. Duodenum: D1 -> Superior flexure -> D2 outer convexity -> Inferior flexure -> D3 horizontal
    // 3. Colon: Cecum & Appendix -> Ascending -> Hepatic flexure -> Transverse -> Splenic flexure -> Descending -> Sigmoid (Anterior Taenia Libera)
    // 4. Esophagus: Cervical -> Thoracic -> Abdominal anterior midline
    // 5. Gallbladder: Fundus dome arc -> Anterior body
    // 6. Small Intestine: Longitudinal mesenteric loop pathway
    const organCutPolylines = {
      stomach: [
        new THREE.Vector3(1.8, 120.0, 4.0),
        new THREE.Vector3(5.5, 117.0, 5.0),
        new THREE.Vector3(8.0, 115.5, 4.2),
        new THREE.Vector3(2.0, 112.5, 5.2),
        new THREE.Vector3(-2.5, 113.0, 5.5)
      ],
      duodenum: [
        new THREE.Vector3(-1.8, 113.5, 4.0),
        new THREE.Vector3(-5.5, 113.0, 3.8),
        new THREE.Vector3(-6.2, 109.0, 3.5),
        new THREE.Vector3(-5.5, 105.5, 3.2),
        new THREE.Vector3(-2.5, 105.0, 2.8)
      ],
      large_intestine: [
        new THREE.Vector3(-8.2, 95.0, 1.5),
        new THREE.Vector3(-8.6, 102.0, 3.2),
        new THREE.Vector3(-8.8, 110.5, 4.0),
        new THREE.Vector3(0.5, 111.5, 6.5),
        new THREE.Vector3(8.2, 111.0, 4.0),
        new THREE.Vector3(8.5, 101.0, 1.5),
        new THREE.Vector3(1.5, 87.0, -3.5)
      ],
      esophagus: [
        new THREE.Vector3(0.2, 146.0, 0.2),
        new THREE.Vector3(0.4, 133.0, 0.5),
        new THREE.Vector3(0.8, 120.0, 1.2)
      ],
      gallbladder_tree: [
        new THREE.Vector3(-5.8, 112.5, 6.2),
        new THREE.Vector3(-4.5, 113.8, 7.5),
        new THREE.Vector3(-3.2, 114.5, 5.8)
      ],
      small_intestine: [
        new THREE.Vector3(-2.0, 108.0, 5.5),
        new THREE.Vector3(-3.5, 101.0, 6.2),
        new THREE.Vector3(0.0, 96.0, 6.5),
        new THREE.Vector3(4.0, 93.0, 5.8),
        new THREE.Vector3(6.5, 96.0, 4.8)
      ]
    };

    const polyline = organCutPolylines[organId];

    const layerMeshes = [];

    wallLayersDef.forEach((layerDef, idx) => {
      const d = insets[idx] || 0;
      const geo = origGeo.clone();
      const posAttr = geo.attributes.position;
      const normAttr = geo.attributes.normal;
      const cutDistArr = new Float32Array(posAttr.count);

      for (let i = 0; i < posAttr.count; i++) {
        const x0 = posAttr.getX(i);
        const y0 = posAttr.getY(i);
        const z0 = posAttr.getZ(i);

        // Project vertex (x0, y0) onto the landmark polyline to find the exact cut threshold Z.
        // Pure piecewise linear interpolation guarantees 100% smooth cut edges passing exactly
        // through the red line markings from the user illustration!
        let cutDist = 0;
        if (polyline && polyline.length >= 2) {
          let minDistSq = Infinity;
          let bestZ = polyline[0].z;
          for (let j = 0; j < polyline.length - 1; j++) {
            const p1 = polyline[j];
            const p2 = polyline[j + 1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const segLenSq = dx * dx + dy * dy;
            let t = 0.0;
            if (segLenSq > 1e-6) {
              t = Math.max(0.0, Math.min(1.0, ((x0 - p1.x) * dx + (y0 - p1.y) * dy) / segLenSq));
            }
            const projX = p1.x + t * dx;
            const projY = p1.y + t * dy;
            const distSq = (x0 - projX) * (x0 - projX) + (y0 - projY) * (y0 - projY);
            if (distSq < minDistSq) {
              minDistSq = distSq;
              bestZ = p1.z + t * (p2.z - p1.z);
            }
          }
          cutDist = z0 - bestZ;
        } else {
          cutDist = z0 - localCenter.z;
        }

        cutDistArr[i] = cutDist;

        if (d > 0) {
          posAttr.setXYZ(
            i,
            x0 - normAttr.getX(i) * d,
            y0 - normAttr.getY(i) * d,
            z0 - normAttr.getZ(i) * d
          );
        }
      }
      if (d > 0) {
        posAttr.needsUpdate = true;
      }
      geo.setAttribute('aCutDist', new THREE.BufferAttribute(cutDistArr, 1));

      const mat = (materials[idx] || materials[0]).clone();
      // Do NOT use artificial polygonOffset, so the 24-bit hardware depth buffer uses true 3D vertex depths:
      // - On the exterior, Serosa (d = 0) is physically outermost and wins naturally.
      // - Inside the open cutaway lumen, Mucosa (d = maxInset) is physically innermost (closest to camera on the posterior wall) and wins naturally!
      mat.polygonOffset = false;

      mat.userData.uCutawayActive = { value: 0.0 };
      mat.userData.uCutThreshold = { value: 0.0 };
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uCutawayActive = mat.userData.uCutawayActive;
        shader.uniforms.uCutThreshold = mat.userData.uCutThreshold;
        shader.vertexShader = `
          attribute float aCutDist;
          varying float vCutDist;
        ` + shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vCutDist = aCutDist;`
        );
        shader.fragmentShader = `
          uniform float uCutawayActive;
          uniform float uCutThreshold;
          varying float vCutDist;
        ` + shader.fragmentShader.replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
           if (uCutawayActive > 0.5 && vCutDist > uCutThreshold) discard;`
        );
      };

      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = layerDef.id;
      mesh.position.copy(baseMesh.position);
      mesh.rotation.copy(baseMesh.rotation);
      mesh.scale.copy(baseMesh.scale);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      mesh.userData = {
        organId: organId,
        organTitle: organData ? organData.vietnameseName : organId,
        isWallLayer: true,
        isStomachWallLayer: (organId === 'stomach'),
        wallLayerId: layerDef.id,
        wallLayerOrder: layerDef.layerOrder || (idx + 1),
        wallLayerIndex: idx,
        totalLayers: count,
        wallLayerName: layerDef.name,
        wallLayerColor: layerDef.color || '#e11d48',
        wallLayerThickness: layerDef.thickness || '',
        wallLayerDesc: layerDef.description || '',
        rawName: layerDef.name,
        localCenter: localCenter.clone(),
        localSize: localSize.clone(),
        initialPos: baseMesh.position.clone(),
        initialScale: baseMesh.scale.clone(),
        systemExplodeVec: sysVec.clone()
      };

      baseMesh.parent.add(mesh);
      layerMeshes.push(mesh);
    });

    baseMesh.visible = false;
    this.organLayersMap.set(organId, layerMeshes);

    if (organId === 'stomach') {
      this.stomachWallMeshes = layerMeshes;
    } else if (organId === 'duodenum') {
      this.duodenumWallMeshes = layerMeshes;
    } else if (organId === 'small_intestine') {
      this.smallIntestineWallMeshes = layerMeshes;
    } else if (organId === 'large_intestine') {
      this.colonWallMeshes = layerMeshes;
    } else if (organId === 'gallbladder_tree') {
      this.gallbladderWallMeshes = layerMeshes;
    } else if (organId === 'esophagus') {
      this.esophagusWallMeshes = layerMeshes;
    }

    return layerMeshes;
  }

  _getMaterialsForOrgan(organId, tex) {
    if (organId === 'gallbladder_tree') {
      return [
        new THREE.MeshStandardMaterial({
          map: tex.gbSerosaTexture,
          roughness: 0.26,
          metalness: 0.08,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.gbMuscleTexture,
          bumpMap: tex.gbMuscleBump,
          bumpScale: 0.025,
          roughness: 0.48,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.gbSubmucosaTexture,
          bumpMap: tex.gbSubmucosaBump,
          bumpScale: 0.015,
          roughness: 0.42,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.gbMucosaTexture,
          bumpMap: tex.gbMucosaBump,
          bumpScale: 0.045,
          roughness: 0.34,
          metalness: 0.05,
          side: THREE.DoubleSide
        })
      ];
    }

    if (organId === 'esophagus') {
      return [
        new THREE.MeshStandardMaterial({
          map: tex.esoAdventitiaTexture,
          roughness: 0.32,
          metalness: 0.06,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.esoLongitudinalMuscleTexture,
          bumpMap: tex.esoLongitudinalMuscleBump,
          bumpScale: 0.025,
          roughness: 0.48,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.esoCircularMuscleTexture,
          bumpMap: tex.esoCircularMuscleBump,
          bumpScale: 0.025,
          roughness: 0.50,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.esoSubmucosaTexture,
          bumpMap: tex.esoSubmucosaBump,
          bumpScale: 0.015,
          roughness: 0.42,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.esoMucosaTexture,
          bumpMap: tex.esoMucosaBump,
          bumpScale: 0.042,
          roughness: 0.32,
          metalness: 0.05,
          side: THREE.DoubleSide
        })
      ];
    }

    if (organId === 'duodenum') {
      return [
        new THREE.MeshStandardMaterial({
          map: tex.duodenumSerosaTexture,
          roughness: 0.24,
          metalness: 0.08,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.duodenumLongitudinalMuscleTexture,
          bumpMap: tex.duodenumLongitudinalMuscleBump,
          bumpScale: 0.025,
          roughness: 0.48,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.duodenumCircularMuscleTexture,
          bumpMap: tex.duodenumCircularMuscleBump,
          bumpScale: 0.025,
          roughness: 0.50,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.duodenumSubmucosaTexture,
          bumpMap: tex.duodenumSubmucosaBump,
          bumpScale: 0.015,
          roughness: 0.44,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.duodenumMucosaTexture,
          bumpMap: tex.duodenumMucosaBump,
          bumpScale: 0.045,
          roughness: 0.36,
          metalness: 0.05,
          side: THREE.DoubleSide
        })
      ];
    }

    if (organId === 'small_intestine') {
      return [
        new THREE.MeshStandardMaterial({
          map: tex.siSerosaTexture,
          roughness: 0.22,
          metalness: 0.06,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.siLongitudinalMuscleTexture,
          bumpMap: tex.siLongitudinalMuscleBump,
          bumpScale: 0.022,
          roughness: 0.48,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.siCircularMuscleTexture,
          bumpMap: tex.siCircularMuscleBump,
          bumpScale: 0.022,
          roughness: 0.50,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.siSubmucosaTexture,
          bumpMap: tex.siSubmucosaBump,
          bumpScale: 0.012,
          roughness: 0.42,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.siMucosaTexture,
          bumpMap: tex.siMucosaBump,
          bumpScale: 0.040,
          roughness: 0.38,
          metalness: 0.05,
          side: THREE.DoubleSide
        })
      ];
    }

    if (organId === 'large_intestine') {
      return [
        new THREE.MeshStandardMaterial({
          map: tex.colonSerosaTexture,
          roughness: 0.28,
          metalness: 0.08,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.colonLongitudinalMuscleTexture,
          bumpMap: tex.colonLongitudinalMuscleBump,
          bumpScale: 0.035,
          roughness: 0.48,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.colonCircularMuscleTexture,
          bumpMap: tex.colonCircularMuscleBump,
          bumpScale: 0.030,
          roughness: 0.52,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.colonSubmucosaTexture,
          bumpMap: tex.colonSubmucosaBump,
          bumpScale: 0.015,
          roughness: 0.44,
          metalness: 0.05,
          side: THREE.DoubleSide
        }),
        new THREE.MeshStandardMaterial({
          map: tex.colonMucosaTexture,
          bumpMap: tex.colonMucosaBump,
          bumpScale: 0.045,
          roughness: 0.35,
          metalness: 0.05,
          side: THREE.DoubleSide
        })
      ];
    }

    // Default: Stomach (6 materials)
    return [
      new THREE.MeshStandardMaterial({
        map: tex.serosaTexture,
        roughness: 0.24,
        metalness: 0.08,
        side: THREE.DoubleSide
      }),
      new THREE.MeshStandardMaterial({
        map: tex.longitudinalMuscleTexture,
        bumpMap: tex.longitudinalMuscleBump,
        bumpScale: 0.025,
        roughness: 0.48,
        metalness: 0.05,
        side: THREE.DoubleSide
      }),
      new THREE.MeshStandardMaterial({
        map: tex.circularMuscleTexture,
        bumpMap: tex.circularMuscleBump,
        bumpScale: 0.025,
        roughness: 0.50,
        metalness: 0.05,
        side: THREE.DoubleSide
      }),
      new THREE.MeshStandardMaterial({
        map: tex.obliqueMuscleTexture,
        bumpMap: tex.obliqueMuscleBump,
        bumpScale: 0.025,
        roughness: 0.52,
        metalness: 0.05,
        side: THREE.DoubleSide
      }),
      new THREE.MeshStandardMaterial({
        map: tex.submucosaTexture,
        bumpMap: tex.submucosaBump,
        bumpScale: 0.012,
        roughness: 0.42,
        metalness: 0.05,
        side: THREE.DoubleSide
      }),
      new THREE.MeshStandardMaterial({
        map: tex.mucosaTexture,
        bumpMap: tex.mucosaBump,
        bumpScale: 0.045,
        roughness: 0.34,
        metalness: 0.05,
        side: THREE.DoubleSide
      })
    ];
  }

  /**
   * Records the normalized world-space center of all hollow organs after masterRoot is scaled/positioned.
   */
  recordBaseCenterWorld(specificOrganId) {
    const organsToRecord = specificOrganId ? [specificOrganId] : Array.from(this.organLayersMap.keys());
    organsToRecord.forEach(organId => {
      const meshes = this.organLayersMap.get(organId);
      if (meshes && meshes.length > 0) {
        const m0 = meshes[0];
        m0.updateWorldMatrix(true, false);
        const box0 = new THREE.Box3().setFromObject(m0);
        const center = new THREE.Vector3();
        box0.getCenter(center);
        this.baseCenterMap.set(organId, center);
        if (organId === 'stomach') {
          this.baseCenterWorld.copy(center);
        }
      }
    });
  }

  getBaseCenter(organId) {
    return this.baseCenterMap.get(organId) || this.baseCenterWorld;
  }

  /**
   * Task 2: Updates per-organ and per-layer local 50% longitudinal cutaway clipping planes.
   * Each hollow organ layer is cut at its own exact 50% Z midpoint (worldCenter.z),
   * with a stepped histological rim when assembled so the order from inside to outside:
   *   Mucosa (innermost) -> Submucosa -> Stratum -> Serosa (outermost)
   * is clearly visible without any layer clipping.
   */
  updateClipping(selectedOrganId, isCutawayOpen, wallExplodeFactor) {
    if (typeof selectedOrganId === 'boolean') {
      wallExplodeFactor = isCutawayOpen;
      isCutawayOpen = selectedOrganId;
      selectedOrganId = null;
    }

    const t = Math.max(0, Math.min(1, wallExplodeFactor || 0));

    this.organLayersMap.forEach((meshes, organId) => {
      const shouldClipThisOrgan = isCutawayOpen && ((!selectedOrganId) || (selectedOrganId === organId));
      const N = meshes.length;

      meshes.forEach((mesh, idx) => {
        if (!mesh.material) return;
        mesh.material.clippingPlanes = null;

        const uActive = mesh.material.userData && mesh.material.userData.uCutawayActive;
        const uThresh = mesh.material.userData && mesh.material.userData.uCutThreshold;

        if (!shouldClipThisOrgan) {
          if (uActive) uActive.value = 0.0;
          if (uThresh) uThresh.value = 0.0;
          return;
        }

        // When assembled (t < 0.15), terrace the cut edge from Serosa (outermost, idx=0, threshold > 0)
        // down to Mucosa (innermost, idx=N-1, threshold < 0) so each outer layer wraps cleanly around
        // the inner layers (inside -> outside: Mucosa > Submucosa > Stratum > Serosa, matching Figure 3).
        // When exploded (t >= 0.15), cut every layer at its exact 50.0% tube midline (threshold = 0)!
        const assembleBlend = Math.max(0, 1 - (t / 0.15));
        const centeredIdx = ((N - 1) / 2.0) - idx;
        const rimStep = (organId === 'small_intestine') ? 0.02 : 0.06;

        if (uActive) uActive.value = 1.0;
        if (uThresh) uThresh.value = assembleBlend * centeredIdx * rimStep;
      });
    });
  }
}
