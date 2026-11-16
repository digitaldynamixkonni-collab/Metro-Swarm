import * as THREE from 'three';

export interface BuildingCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  cx: number;
  cz: number;
  halfW: number;
  halfD: number;
}

export interface CityBuildResult {
  group: THREE.Group;
  colliders: BuildingCollider[];
  spawnPoints: { x: number; z: number }[];
  powerUpPoints: { x: number; z: number }[];
  waterMesh: THREE.Mesh;
  disposables: {
    geometries: THREE.BufferGeometry[];
    materials: THREE.Material[];
    textures: THREE.Texture[];
  };
}

export const ARENA_HALF_SIZE = 74;

function createRoadTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Sunlit slate asphalt base
  ctx.fillStyle = '#334155';
  ctx.fillRect(0, 0, size, size);

  // Subtle asphalt grain
  for (let i = 0; i < 4500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const v = 45 + Math.floor(Math.random() * 26);
    ctx.fillStyle = `rgb(${v},${v + 8},${v + 18})`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Avenue grid lines (4 major avenues across 152 units -> tileable)
  const step = size / 4;
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.55)';
  ctx.lineWidth = 4;
  ctx.setLineDash([22, 18]);

  for (let i = 0; i < 4; i++) {
    const pos = i * step + step * 0.5;
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, size);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(size, pos);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Crosswalk stripes near block corners
  ctx.fillStyle = 'rgba(241, 245, 249, 0.72)';
  for (let ix = 0; ix < 4; ix++) {
    for (let iz = 0; iz < 4; iz++) {
      const cx = ix * step + step * 0.5;
      const cz = iz * step + step * 0.5;
      for (let s = -2; s <= 2; s++) {
        ctx.fillRect(cx + s * 10 - 3, cz - 46, 6, 16);
        ctx.fillRect(cx + s * 10 - 3, cz + 30, 6, 16);
        ctx.fillRect(cx - 46, cz + s * 10 - 3, 16, 6);
        ctx.fillRect(cx + 30, cz + s * 10 - 3, 16, 6);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createFacadeTexture(
  baseHex: string,
  windowHex: string,
  warmHex: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, w, h);

  // Subtle horizontal floor bands
  ctx.fillStyle = 'rgba(15, 23, 42, 0.08)';
  for (let y = 0; y < h; y += 32) {
    ctx.fillRect(0, y, w, 4);
  }

  const cols = 6;
  const rows = 14;
  const padX = 14;
  const padY = 14;
  const cellW = (w - padX * 2) / cols;
  const cellH = (h - padY * 2) / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = padX + c * cellW + 5;
      const y = padY + r * cellH + 5;
      const ww = cellW - 10;
      const wh = cellH - 12;

      // Window recess
      ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
      ctx.fillRect(x - 1, y - 1, ww + 2, wh + 2);

      // Sunlit glass / occasional warm interior tint
      ctx.fillStyle = (r * 7 + c * 3) % 11 === 0 ? warmHex : windowHex;
      ctx.fillRect(x, y, ww, wh);

      // Specular diagonal glint
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillRect(x + 2, y + 2, ww * 0.35, wh * 0.45);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createSidewalkTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 2;
  const step = 32;
  for (let i = 0; i <= size; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function buildCityArena(
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean,
): CityBuildResult {
  const group = new THREE.Group();
  const colliders: BuildingCollider[] = [];
  const spawnPoints: { x: number; z: number }[] = [];
  const powerUpPoints: { x: number; z: number }[] = [];

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // 1. Coastal Harbor Water Plane surrounding the urban district
  const waterGeo = new THREE.PlaneGeometry(520, 520);
  geometries.push(waterGeo);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x7dd3fc,
    roughness: 0.18,
    metalness: 0.12,
  });
  materials.push(waterMat);
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.y = -0.75;
  waterMesh.receiveShadow = !isSoftwareGl;
  group.add(waterMesh);

  // 2. Outer Parkland / Promenade Deck (extends well beyond playable bounds)
  const deckGeo = new THREE.BoxGeometry(196, 0.8, 196);
  geometries.push(deckGeo);
  const deckMat = new THREE.MeshStandardMaterial({
    color: 0x86efac,
    roughness: 0.88,
    metalness: 0.0,
  });
  materials.push(deckMat);
  const deckMesh = new THREE.Mesh(deckGeo, deckMat);
  deckMesh.position.y = -0.45;
  deckMesh.receiveShadow = !isSoftwareGl;
  group.add(deckMesh);

  // Retaining seawall trim
  const seawallGeo = new THREE.BoxGeometry(198.5, 0.5, 198.5);
  geometries.push(seawallGeo);
  const seawallMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.82,
    metalness: 0.05,
  });
  materials.push(seawallMat);
  const seawallMesh = new THREE.Mesh(seawallGeo, seawallMat);
  seawallMesh.position.y = -0.62;
  group.add(seawallMesh);

  // 3. Playable Urban Road Grid (154 x 154)
  const roadTex = createRoadTexture(maxAniso);
  textures.push(roadTex);
  const roadGeo = new THREE.PlaneGeometry(156, 156);
  geometries.push(roadGeo);
  const roadMat = new THREE.MeshStandardMaterial({
    map: roadTex,
    roughness: 0.82,
    metalness: 0.04,
  });
  materials.push(roadMat);
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.rotation.x = -Math.PI / 2;
  roadMesh.position.y = 0.0;
  roadMesh.receiveShadow = !isSoftwareGl;
  group.add(roadMesh);

  // 4. Sidewalk & Building Block Layout (4x4 grid of city blocks around central avenues)
  const sidewalkTex = createSidewalkTexture(maxAniso);
  textures.push(sidewalkTex);
  const sidewalkMat = new THREE.MeshStandardMaterial({
    map: sidewalkTex,
    color: 0xf1f5f9,
    roughness: 0.86,
    metalness: 0.02,
  });
  materials.push(sidewalkMat);

  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.72,
    metalness: 0.15,
  });
  const rooftopMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.85,
    metalness: 0.05,
  });
  const roofAccentMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.5,
    metalness: 0.45,
  });
  const glassTopMat = new THREE.MeshStandardMaterial({
    color: 0x93c5fd,
    roughness: 0.18,
    metalness: 0.35,
  });
  const grassMat = new THREE.MeshStandardMaterial({
    color: 0x4ade80,
    roughness: 0.9,
    metalness: 0.0,
  });
  materials.push(trimMat, rooftopMat, roofAccentMat, glassTopMat, grassMat);

  // Facade variations
  const facadeConfigs = [
    { base: '#f8fafc', win: '#60a5fa', warm: '#fde68a' },
    { base: '#e2e8f0', win: '#38bdf8', warm: '#fcd34d' },
    { base: '#fef3c7', win: '#64748b', warm: '#fbbf24' },
    { base: '#e0f2fe', win: '#3b82f6', warm: '#fef08a' },
    { base: '#f1f5f9', win: '#0284c7', warm: '#fed7aa' },
  ];
  const facadeMaterials = facadeConfigs.map((cfg) => {
    const tex = createFacadeTexture(cfg.base, cfg.win, cfg.warm, maxAniso);
    textures.push(tex);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.52,
      metalness: 0.12,
    });
    materials.push(mat);
    return mat;
  });

  // 4x4 block centers inside [-74, +74] -> avenues at -58.5, -19.5, +19.5, +58.5?
  // Let's place blocks at: -48, -16, +16, +48? Wait: 4 blocks of width 22 with 14-wide avenues:
  // Centers: -49.5, -16.5, +16.5, +49.5 -> spacing = 33. Block sidewalk = 21x21, leaving 12-unit wide avenues!
  const blockCenters = [-49.5, -16.5, 16.5, 49.5];
  const sidewalkGeo = new THREE.BoxGeometry(21.5, 0.14, 21.5);
  geometries.push(sidewalkGeo);

  // Helper to build a composite 4-7 part building grounded at y = 0.14
  const addCompositeBuilding = (
    cx: number,
    cz: number,
    w: number,
    d: number,
    h: number,
    matIndex: number,
    hasHelipad: boolean,
  ) => {
    const bGroup = new THREE.Group();
    bGroup.position.set(cx, 0.14, cz);

    // Part 1: Podium Base
    const podiumH = Math.min(2.2, h * 0.2);
    const podiumGeo = new THREE.BoxGeometry(w + 0.8, podiumH, d + 0.8);
    geometries.push(podiumGeo);
    const podium = new THREE.Mesh(podiumGeo, trimMat);
    podium.position.y = podiumH / 2;
    podium.castShadow = !isSoftwareGl;
    podium.receiveShadow = !isSoftwareGl;
    bGroup.add(podium);

    // Part 2: Main Tower Shaft
    const shaftH = h - podiumH;
    const shaftGeo = new THREE.BoxGeometry(w, shaftH, d);
    geometries.push(shaftGeo);
    const shaft = new THREE.Mesh(shaftGeo, facadeMaterials[matIndex % facadeMaterials.length]);
    shaft.position.y = podiumH + shaftH / 2;
    shaft.castShadow = !isSoftwareGl;
    shaft.receiveShadow = !isSoftwareGl;
    bGroup.add(shaft);

    // Part 3: Stepped Crown / Parapet
    const crownH = 0.7;
    const crownGeo = new THREE.BoxGeometry(w + 0.45, crownH, d + 0.45);
    geometries.push(crownGeo);
    const crown = new THREE.Mesh(crownGeo, rooftopMat);
    crown.position.y = h + crownH / 2;
    crown.castShadow = !isSoftwareGl;
    crown.receiveShadow = !isSoftwareGl;
    bGroup.add(crown);

    // Part 4: Stepped Penthouse / Glass Atrium
    const pentW = w * 0.56;
    const pentD = d * 0.56;
    const pentH = Math.max(1.2, h * 0.14);
    const pentGeo = new THREE.BoxGeometry(pentW, pentH, pentD);
    geometries.push(pentGeo);
    const pent = new THREE.Mesh(pentGeo, hasHelipad ? rooftopMat : glassTopMat);
    pent.position.y = h + crownH + pentH / 2;
    pent.castShadow = !isSoftwareGl;
    bGroup.add(pent);

    // Part 5: Rooftop HVAC / Antenna / Helipad Accent
    if (hasHelipad) {
      const padGeo = new THREE.CylinderGeometry(pentW * 0.36, pentW * 0.38, 0.14, 18);
      geometries.push(padGeo);
      const pad = new THREE.Mesh(padGeo, roofAccentMat);
      pad.position.y = h + crownH + pentH + 0.08;
      bGroup.add(pad);
    } else {
      const hvacGeo = new THREE.BoxGeometry(w * 0.18, 0.65, d * 0.18);
      geometries.push(hvacGeo);
      const hvac = new THREE.Mesh(hvacGeo, roofAccentMat);
      hvac.position.set(w * 0.2, h + crownH + 0.32, -d * 0.2);
      bGroup.add(hvac);

      const spireGeo = new THREE.CylinderGeometry(0.08, 0.14, 2.2, 8);
      geometries.push(spireGeo);
      const spire = new THREE.Mesh(spireGeo, roofAccentMat);
      spire.position.set(0, h + crownH + pentH + 1.1, 0);
      bGroup.add(spire);
    }

    group.add(bGroup);

    colliders.push({
      minX: cx - w / 2 - 0.55,
      maxX: cx + w / 2 + 0.55,
      minZ: cz - d / 2 - 0.55,
      maxZ: cz + d / 2 + 0.55,
      cx,
      cz,
      halfW: w / 2 + 0.55,
      halfD: d / 2 + 0.55,
    });
  };

  // Build blocks
  let blockIdx = 0;
  for (let gx = 0; gx < 4; gx++) {
    for (let gz = 0; gz < 4; gz++) {
      const bx = blockCenters[gx];
      const bz = blockCenters[gz];
      blockIdx++;

      const isInnerPlazaBlock = (gx === 1 || gx === 2) && (gz === 1 || gz === 2);

      // Sidewalk base on every block
      const sw = new THREE.Mesh(sidewalkGeo, sidewalkMat);
      sw.position.set(bx, 0.07, bz);
      sw.receiveShadow = !isSoftwareGl;
      group.add(sw);

      if (isInnerPlazaBlock && gx === 1 && gz === 1) {
        // Civic Park & Fountain Block (open walkable park!)
        const lawnGeo = new THREE.BoxGeometry(17.5, 0.06, 17.5);
        geometries.push(lawnGeo);
        const lawn = new THREE.Mesh(lawnGeo, grassMat);
        lawn.position.set(bx, 0.16, bz);
        lawn.receiveShadow = !isSoftwareGl;
        group.add(lawn);

        // Composite 4-part Central Fountain
        const basinBaseGeo = new THREE.CylinderGeometry(4.0, 4.3, 0.45, 24);
        const basinWaterGeo = new THREE.CylinderGeometry(3.4, 3.4, 0.25, 24);
        const pillarGeo = new THREE.CylinderGeometry(0.65, 0.95, 2.2, 16);
        const bowlGeo = new THREE.CylinderGeometry(1.7, 0.7, 0.5, 16);
        geometries.push(basinBaseGeo, basinWaterGeo, pillarGeo, bowlGeo);

        const fGroup = new THREE.Group();
        fGroup.position.set(bx, 0.19, bz);
        const base = new THREE.Mesh(basinBaseGeo, rooftopMat);
        base.position.y = 0.22;
        const fWater = new THREE.Mesh(basinWaterGeo, waterMat);
        fWater.position.y = 0.38;
        const pillar = new THREE.Mesh(pillarGeo, rooftopMat);
        pillar.position.y = 1.2;
        const bowl = new THREE.Mesh(bowlGeo, trimMat);
        bowl.position.y = 2.25;
        fGroup.add(base, fWater, pillar, bowl);
        group.add(fGroup);

        colliders.push({
          minX: bx - 4.1,
          maxX: bx + 4.1,
          minZ: bz - 4.1,
          maxZ: bz + 4.1,
          cx: bx,
          cz: bz,
          halfW: 4.1,
          halfD: 4.1,
        });
      } else if (isInnerPlazaBlock && gx === 2 && gz === 2) {
        // Second inner block: twin boutique towers with a walkable central alley!
        addCompositeBuilding(bx - 5.2, bz - 4.5, 7.6, 8.2, 11.5, blockIdx, false);
        addCompositeBuilding(bx + 5.2, bz + 4.5, 7.6, 8.2, 14.5, blockIdx + 2, true);
      } else {
        // Standard architectural block: 1 main tower or 2 asymmetric mid-rises
        const style = (gx * 5 + gz * 3) % 3;
        if (style === 0) {
          const h = 11 + ((gx + gz) % 4) * 3.5;
          addCompositeBuilding(bx, bz, 13.8, 13.8, h, blockIdx, (gx + gz) % 2 === 0);
        } else if (style === 1) {
          addCompositeBuilding(bx - 4.8, bz, 7.4, 13.4, 9.5 + gx * 2, blockIdx, false);
          addCompositeBuilding(bx + 4.8, bz, 7.4, 13.4, 15.0 + gz * 2.5, blockIdx + 1, true);
        } else {
          addCompositeBuilding(bx, bz - 4.8, 13.4, 7.4, 13.5 + gz * 2, blockIdx + 3, true);
          addCompositeBuilding(bx, bz + 4.8, 13.4, 7.4, 8.5 + gx * 2, blockIdx + 4, false);
        }
      }
    }
  }

  // 5. Instanced Sculpted Park Trees along outer boulevard & park plaza
  const treeCoords: { x: number; z: number }[] = [];
  // Park corners
  treeCoords.push(
    { x: -16.5 - 7.5, z: -16.5 - 7.5 },
    { x: -16.5 + 7.5, z: -16.5 - 7.5 },
    { x: -16.5 - 7.5, z: -16.5 + 7.5 },
    { x: -16.5 + 7.5, z: -16.5 + 7.5 },
  );
  // Outer promenade boulevard trees (outside playable fence)
  for (let p = -84; p <= 84; p += 14) {
    treeCoords.push({ x: p, z: -84 }, { x: p, z: 84 });
    if (Math.abs(p) < 84) {
      treeCoords.push({ x: -84, z: p }, { x: 84, z: p });
    }
  }

  const trunkGeo = new THREE.CylinderGeometry(0.24, 0.36, 1.8, 8);
  const canopyGeo = new THREE.IcosahedronGeometry(1.45, 1);
  const canopyTopGeo = new THREE.IcosahedronGeometry(1.05, 1);
  geometries.push(trunkGeo, canopyGeo, canopyTopGeo);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.92 });
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78 });
  materials.push(trunkMat, canopyMat);

  const treeCount = treeCoords.length;
  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const canopyInst = new THREE.InstancedMesh(canopyGeo, canopyMat, treeCount);
  const canopyTopInst = new THREE.InstancedMesh(canopyTopGeo, canopyMat, treeCount);
  trunkInst.castShadow = !isSoftwareGl;
  canopyInst.castShadow = !isSoftwareGl;
  canopyTopInst.castShadow = !isSoftwareGl;

  const dummy = new THREE.Object3D();
  const cColor = new THREE.Color();
  const leafPalette = [0x22c55e, 0x16a34a, 0x4ade80, 0x15803d];

  treeCoords.forEach((tc, idx) => {
    const scale = 0.88 + ((idx * 17) % 10) * 0.025;
    const baseY = Math.abs(tc.x) > 78 || Math.abs(tc.z) > 78 ? -0.05 : 0.16;

    dummy.position.set(tc.x, baseY + 0.9 * scale, tc.z);
    dummy.rotation.set(0, idx * 0.7, 0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    trunkInst.setMatrixAt(idx, dummy.matrix);

    dummy.position.set(tc.x, baseY + 2.45 * scale, tc.z);
    dummy.updateMatrix();
    canopyInst.setMatrixAt(idx, dummy.matrix);

    dummy.position.set(tc.x + 0.18 * scale, baseY + 3.45 * scale, tc.z - 0.12 * scale);
    dummy.updateMatrix();
    canopyTopInst.setMatrixAt(idx, dummy.matrix);

    cColor.setHex(leafPalette[idx % leafPalette.length]);
    canopyInst.setColorAt(idx, cColor);
    cColor.offsetHSL(0.01, 0, 0.06);
    canopyTopInst.setColorAt(idx, cColor);
  });

  trunkInst.instanceMatrix.needsUpdate = true;
  canopyInst.instanceMatrix.needsUpdate = true;
  canopyTopInst.instanceMatrix.needsUpdate = true;
  if (canopyInst.instanceColor) canopyInst.instanceColor.needsUpdate = true;
  if (canopyTopInst.instanceColor) canopyTopInst.instanceColor.needsUpdate = true;
  trunkInst.computeBoundingSphere();
  canopyInst.computeBoundingSphere();
  canopyTopInst.computeBoundingSphere();
  group.add(trunkInst, canopyInst, canopyTopInst);

  // 6. Low-profile Perimeter Urban Curbs & Bollards (clear visual boundary at ±75.5)
  const bollardGeo = new THREE.CylinderGeometry(0.28, 0.34, 1.1, 10);
  const bollardCapGeo = new THREE.SphereGeometry(0.3, 10, 8);
  geometries.push(bollardGeo, bollardCapGeo);
  const bollardMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.5 });
  const bollardCapMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.25,
    roughness: 0.3,
  });
  materials.push(bollardMat, bollardCapMat);

  const bollardPts: { x: number; z: number }[] = [];
  for (let p = -75; p <= 75; p += 7.5) {
    bollardPts.push({ x: p, z: -76.2 }, { x: p, z: 76.2 });
    if (Math.abs(p) < 75) {
      bollardPts.push({ x: -76.2, z: p }, { x: 76.2, z: p });
    }
  }
  const bollardInst = new THREE.InstancedMesh(bollardGeo, bollardMat, bollardPts.length);
  const bollardCapInst = new THREE.InstancedMesh(bollardCapGeo, bollardCapMat, bollardPts.length);
  bollardPts.forEach((bp, i) => {
    dummy.position.set(bp.x, 0.55, bp.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    bollardInst.setMatrixAt(i, dummy.matrix);

    dummy.position.set(bp.x, 1.15, bp.z);
    dummy.updateMatrix();
    bollardCapInst.setMatrixAt(i, dummy.matrix);
  });
  bollardInst.instanceMatrix.needsUpdate = true;
  bollardCapInst.instanceMatrix.needsUpdate = true;
  bollardInst.computeBoundingSphere();
  bollardCapInst.computeBoundingSphere();
  group.add(bollardInst, bollardCapInst);

  // 7. Distant Silhouette Skyline Towers on Outer Deck for Horizon Depth
  const skylineMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.85,
    metalness: 0.05,
  });
  materials.push(skylineMat);
  const skylineCount = 24;
  const skylineGeo = new THREE.BoxGeometry(1, 1, 1);
  geometries.push(skylineGeo);
  const skylineInst = new THREE.InstancedMesh(skylineGeo, skylineMat, skylineCount);
  for (let i = 0; i < skylineCount; i++) {
    const angle = (i / skylineCount) * Math.PI * 2;
    const dist = 104 + (i % 3) * 14;
    const sx = Math.cos(angle) * dist;
    const sz = Math.sin(angle) * dist;
    const h = 14 + ((i * 7) % 18);
    const w = 9 + (i % 4) * 2.5;
    dummy.position.set(sx, h / 2 - 0.5, sz);
    dummy.rotation.set(0, angle * 0.5, 0);
    dummy.scale.set(w, h, w);
    dummy.updateMatrix();
    skylineInst.setMatrixAt(i, dummy.matrix);
  }
  skylineInst.instanceMatrix.needsUpdate = true;
  skylineInst.computeBoundingSphere();
  group.add(skylineInst);

  // 8. Avenue Spawn & Power-Up Intersection Grid Points (always clear of buildings!)
  const avenueCoords = [-66, -33, 0, 33, 66];
  for (const ax of avenueCoords) {
    for (const az of avenueCoords) {
      spawnPoints.push({ x: ax, z: az });
      if (Math.abs(ax) <= 33 && Math.abs(az) <= 33) {
        powerUpPoints.push({ x: ax, z: az });
      }
    }
  }
  // Additional avenue midpoints for lively power-up & neutral spread
  for (const ax of [-33, 0, 33]) {
    for (const az of [-49.5, -16.5, 16.5, 49.5]) {
      spawnPoints.push({ x: ax, z: az });
      spawnPoints.push({ x: az, z: ax });
    }
  }
  powerUpPoints.push(
    { x: -16.5, z: -16.5 + 8 },
    { x: -66, z: 0 },
    { x: 66, z: 0 },
    { x: 0, z: -66 },
    { x: 0, z: 66 },
  );

  return {
    group,
    colliders,
    spawnPoints,
    powerUpPoints,
    waterMesh,
    disposables: { geometries, materials, textures },
  };
}
