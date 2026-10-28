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

    // Direction/side multiplier for cutaway: 1.0 (default, discards vCutDist > 0) or -1.0 (opposite half)
    // Esophagus defaults to 1.0 which hides the anatomical left half (+X) as requested by user.
    this.organCutSides = {
      esophagus: 1.0,
      stomach: 1.0,
      duodenum: 1.0
    };
  }

  setOrganCutSide(organId, side = 1.0) {
    this.organCutSides[organId] = side;
    const meshes = this.organLayersMap.get(organId);
    if (meshes) {
      meshes.forEach(m => {
        if (m.material && m.material.userData && m.material.userData.uCutSide) {
          m.material.userData.uCutSide.value = side;
        }
      });
    }
  }

  getOrganCutSide(organId) {
    return this.organCutSides[organId] !== undefined ? this.organCutSides[organId] : 1.0;
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
   * Subdivides low-poly geometries (e.g. Duodenum with 887 vertices) by 1 level
   * into 3,524 vertices and 7,000 triangles using midpoint edge splitting.
   * This reduces triangle edge length 2x, providing high polygon density so that
   * fragment-shader cutaway edges are silky-smooth and zero-jagged!
   */
  _subdivideGeometry(srcGeo) {
    if (!srcGeo || !srcGeo.attributes.position) return srcGeo;
    const posAttr = srcGeo.attributes.position;
    if (posAttr.count >= 2500) return srcGeo; // Already high poly (e.g. Stomach, Esophagus)

    const normAttr = srcGeo.attributes.normal;
    const uvAttr = srcGeo.attributes.uv;

    const indices = srcGeo.index ? Array.from(srcGeo.index.array) : [];
    if (indices.length === 0) {
      for (let i = 0; i < posAttr.count; i++) indices.push(i);
    }

    const newPositions = [];
    const newNormals = [];
    const newUVs = [];

    for (let i = 0; i < posAttr.count; i++) {
      newPositions.push(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
      if (normAttr) newNormals.push(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i));
      if (uvAttr) newUVs.push(uvAttr.getX(i), uvAttr.getY(i));
    }

    const midpointCache = new Map();
    const getMidpoint = (i1, i2) => {
      const key = (i1 < i2) ? `${i1}_${i2}` : `${i2}_${i1}`;
      if (midpointCache.has(key)) return midpointCache.get(key);

      const idx = newPositions.length / 3;
      const mx = 0.5 * (posAttr.getX(i1) + posAttr.getX(i2));
      const my = 0.5 * (posAttr.getY(i1) + posAttr.getY(i2));
      const mz = 0.5 * (posAttr.getZ(i1) + posAttr.getZ(i2));
      newPositions.push(mx, my, mz);

      if (normAttr) {
        let nx = 0.5 * (normAttr.getX(i1) + normAttr.getX(i2));
        let ny = 0.5 * (normAttr.getY(i1) + normAttr.getY(i2));
        let nz = 0.5 * (normAttr.getZ(i1) + normAttr.getZ(i2));
        const len = Math.hypot(nx, ny, nz) || 1.0;
        newNormals.push(nx / len, ny / len, nz / len);
      }

      if (uvAttr) {
        newUVs.push(
          0.5 * (uvAttr.getX(i1) + uvAttr.getX(i2)),
          0.5 * (uvAttr.getY(i1) + uvAttr.getY(i2))
        );
      }

      midpointCache.set(key, idx);
      return idx;
    };

    const newIndices = [];
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t];
      const b = indices[t + 1];
      const c = indices[t + 2];

      const mab = getMidpoint(a, b);
      const mbc = getMidpoint(b, c);
      const mca = getMidpoint(c, a);

      newIndices.push(a, mab, mca);
      newIndices.push(b, mbc, mab);
      newIndices.push(c, mca, mbc);
      newIndices.push(mab, mbc, mca);
    }

    const subGeo = new THREE.BufferGeometry();
    subGeo.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
    if (newNormals.length > 0) {
      subGeo.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
    } else {
      subGeo.computeVertexNormals();
    }
    if (newUVs.length > 0) {
      subGeo.setAttribute('uv', new THREE.Float32BufferAttribute(newUVs, 2));
    }
    subGeo.setIndex(newIndices);
    subGeo.computeBoundingBox();
    subGeo.computeBoundingSphere();
    return subGeo;
  }

  /**
   * Computes the longitudinal tube centerline X (`aCutMidX`) for the esophagus
   * using an O(N) 1D vertical bucket grid along Y with a 5-sample smoothing filter.
   * This splits the esophagus along the longitudinal vertical axis (as shown in user illustration 1).
   * By default, vertices with (x - midX) > 0 (anatomical left half) are cut/hidden,
   * cleanly exposing the internal esophageal lumen.
   */
  /**
   * Computes the longitudinal tube centerline X (`aCutMidX`) for the esophagus
   * using continuous 1D Gaussian weighting along Y.
   * This splits the esophagus along the longitudinal vertical axis (as shown in user illustration 1)
   * with 100% C^inf smoothness and zero jagged edges.
   */
  _computeEsophagusCutMidX(posAttr, stepY = 0.8) {
    const count = posAttr.count;
    const midX = new Float32Array(count);

    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < count; i++) {
      const y = posAttr.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    const anchors = [];
    const radius = stepY * 1.5;
    for (let yg = minY; yg <= maxY; yg += stepY) {
      let localMinX = Infinity, localMaxX = -Infinity;
      let localCount = 0;
      for (let i = 0; i < count; i++) {
        const dy = Math.abs(posAttr.getY(i) - yg);
        if (dy < radius) {
          const x = posAttr.getX(i);
          if (x < localMinX) localMinX = x;
          if (x > localMaxX) localMaxX = x;
          localCount++;
        }
      }
      if (localCount >= 2) {
        anchors.push({ y: yg, x: 0.5 * (localMinX + localMaxX) });
      }
    }

    const sigma = stepY * 1.35;
    const twoSigmaSq = 2.0 * sigma * sigma;
    const cutoffSq = 9.0 * sigma * sigma;

    for (let i = 0; i < count; i++) {
      const qy = posAttr.getY(i);
      let weightSum = 0;
      let sumX = 0;
      for (let j = 0; j < anchors.length; j++) {
        const a = anchors[j];
        const dy = a.y - qy;
        const distSq = dy * dy;
        if (distSq < cutoffSq) {
          const w = Math.exp(-distSq / twoSigmaSq);
          weightSum += w;
          sumX += w * a.x;
        }
      }
      midX[i] = (weightSum > 1e-6) ? (sumX / weightSum) : posAttr.getX(i);
    }

    return midX;
  }

  /**
   * Computes the local 50% anterior-posterior tube centerline Z (`aCutMidZ`) for each vertex
   * of a hollow segment using Continuous Gaussian Moving Least Squares (GMLS).
   * Unlike discrete voxel/bucket grids, continuous Gaussian kernel weighting guarantees
   * C^inf mathematical smoothness across every triangle, eliminating all jagged steps
   * and staircase quantization artifacts along the cutaway boundary!
   */
  _computeSubMeshCutMidZ(posAttr, cellSize = 0.9) {
    const count = posAttr.count;
    const midZ = new Float32Array(count);

    // 1. Collect dense landmark anchors on a fine 2D lattice
    const gridRes = cellSize;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    const anchors = [];
    const radiusSq = (gridRes * 1.5) * (gridRes * 1.5);
    for (let xg = minX; xg <= maxX; xg += gridRes) {
      for (let yg = minY; yg <= maxY; yg += gridRes) {
        let localMinZ = Infinity, localMaxZ = -Infinity;
        let localCount = 0;
        for (let i = 0; i < count; i++) {
          const dx = posAttr.getX(i) - xg;
          const dy = posAttr.getY(i) - yg;
          if (dx * dx + dy * dy < radiusSq) {
            const z = posAttr.getZ(i);
            if (z < localMinZ) localMinZ = z;
            if (z > localMaxZ) localMaxZ = z;
            localCount++;
          }
        }
        if (localCount >= 2) {
          anchors.push({ x: xg, y: yg, z: 0.5 * (localMinZ + localMaxZ) });
        }
      }
    }

    // 2. Continuous Gaussian Moving Least Squares evaluation
    const sigma = gridRes * 1.35;
    const twoSigmaSq = 2.0 * sigma * sigma;
    const cutoffSq = 9.0 * sigma * sigma; // 3-sigma cutoff

    for (let i = 0; i < count; i++) {
      const qx = posAttr.getX(i);
      const qy = posAttr.getY(i);
      let weightSum = 0;
      let sumZ = 0;

      for (let j = 0; j < anchors.length; j++) {
        const a = anchors[j];
        const distSq = (a.x - qx) * (a.x - qx) + (a.y - qy) * (a.y - qy);
        if (distSq < cutoffSq) {
          const w = Math.exp(-distSq / twoSigmaSq);
          weightSum += w;
          sumZ += w * a.z;
        }
      }

      midZ[i] = (weightSum > 1e-6) ? (sumZ / weightSum) : posAttr.getZ(i);
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
    let origGeo = this._extractOuterSurfaceGeometry(baseMesh);
    // Subdivide low-poly geometries (e.g. Duodenum with 887 verts -> 3,524 verts)
    // to provide high polygon density so the cutaway boundary is silky-smooth and zero-jagged
    if (origGeo && origGeo.attributes.position && origGeo.attributes.position.count < 2500) {
      origGeo = this._subdivideGeometry(origGeo);
    }
    origGeo.computeBoundingSphere();
    origGeo.computeBoundingBox();

    if (!origGeo.attributes.aCutMidZ) {
      const midZ = this._computeSubMeshCutMidZ(origGeo.attributes.position, (organId === 'duodenum') ? 0.8 : 1.2);
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

    // Precompute cut plane/line metrics for the base geometry based on organ morphology
    let precomputedMidValues = null;
    if (organId === 'esophagus') {
      // Longitudinal tube centerline X (median cut dividing left and right halves) with C^inf Gaussian weighting
      precomputedMidValues = this._computeEsophagusCutMidX(origGeo.attributes.position, 0.75);
    } else if (organId === 'stomach') {
      // Coronal bisection along Greater Curvature (bờ cong lớn) & Lesser Curvature (bờ cong nhỏ)
      // matching the 3 views in user illustration 2 (ảnh 2) with C^inf continuous Gaussian MLS
      precomputedMidValues = this._computeSubMeshCutMidZ(origGeo.attributes.position, 1.0);
    } else if (organId === 'duodenum') {
      // Continuous C-loop tube centerline cut tracing D1 -> D2 -> D3 -> D4
      // matching crest and longitudinal lines in user illustration 3 (ảnh 3) with C^inf continuous GMLS on 3,524 subdivided verts
      precomputedMidValues = this._computeSubMeshCutMidZ(origGeo.attributes.position, 0.75);
    } else if (organId === 'large_intestine') {
      precomputedMidValues = origGeo.attributes.aCutMidZ ? origGeo.attributes.aCutMidZ.array : this._computeSubMeshCutMidZ(origGeo.attributes.position, 1.5);
    } else {
      precomputedMidValues = this._computeSubMeshCutMidZ(origGeo.attributes.position, 1.0);
    }

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

        let cutDist = 0;
        if (organId === 'esophagus') {
          // Esophagus: X relative to longitudinal midline X(Y).
          // cutDist > 0 is anatomical left half (+X); cutDist <= 0 is right half (-X).
          cutDist = x0 - precomputedMidValues[i];
        } else {
          // Stomach, Duodenum, Colon, Gallbladder, Small Intestine: Z relative to anatomical tube/coronal midline Z(X, Y).
          cutDist = z0 - precomputedMidValues[i];
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
      mat.userData.uCutSide = { value: (this.organCutSides[organId] !== undefined) ? this.organCutSides[organId] : 1.0 };
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uCutawayActive = mat.userData.uCutawayActive;
        shader.uniforms.uCutThreshold = mat.userData.uCutThreshold;
        shader.uniforms.uCutSide = mat.userData.uCutSide;
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
          uniform float uCutSide;
          varying float vCutDist;
        ` + shader.fragmentShader.replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
           if (uCutawayActive > 0.5 && (vCutDist * uCutSide) > uCutThreshold) discard;`
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
        const uSide = mesh.material.userData && mesh.material.userData.uCutSide;

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
        if (uSide) {
          const sideVal = (this.organCutSides && this.organCutSides[organId] !== undefined) ? this.organCutSides[organId] : 1.0;
          uSide.value = sideVal;
        }
      });
    });
  }
}
