import * as THREE from 'three';
import { CIRCUIT_LENGTH, ROAD_WIDTH, ROAD_HALF_WIDTH } from './types';

export interface RoadSample {
  s: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
  yaw: number;
  curvature: number;
  pitch: number;
}

export class RoadSystem {
  public readonly curve: THREE.CatmullRomCurve3;
  public readonly samples: RoadSample[] = [];
  public readonly roadGroup: THREE.Group;
  public readonly minimapPoints: Array<{ x: number; z: number }> = [];
  public roadMaterial!: THREE.MeshLambertMaterial;
  private readonly sampleCount = 1800;

  constructor(maxAnisotropy = 4) {
    this.roadGroup = new THREE.Group();
    this.roadGroup.name = 'RoadSystem';

    // 25-point uniform-chord closed Grand Prix loop (3.6 km total length, strictly monotonic counter-clockwise)
    // Sectors:
    //  0..3  (s = 0..480m):    Neo Vantis Downtown & Hillside Vista
    //  4..6  (s = 480..920m):  Vantis Coastal Bayfront Approach
    //  7..14 (s = 920..2160m): 1.24 km Vantis Ocean Suspension Bridge over open ocean water (x <= -460)
    // 15..20 (s = 2160..2880m): 720m Mount Vantis Light Tunnel directly after the Ocean Bridge
    // 21..24 (s = 2880..3600m): Skyline Elevated Viaduct, Industrial Sector & Century Grand Boulevard
    const finalControlPoints = [
      // 1. Neo Vantis Downtown Straight & Hillside Vista (s = 0..480m, heading -Z)
      new THREE.Vector3(0, 1.5, 0),
      new THREE.Vector3(0, 1.5, -130),
      new THREE.Vector3(-18, 1.6, -260),
      new THREE.Vector3(-62, 1.8, -385),

      // 2. Vantis Coastal Bayfront Approach (s = 480..920m, sweeping West toward the coast)
      new THREE.Vector3(-135, 2.0, -495),
      new THREE.Vector3(-238, 2.4, -580),
      new THREE.Vector3(-362, 3.6, -628),

      // 3. Vantis Ocean Suspension Bridge over Open Sea (s = 920..2160m, rising to y=17.2m over ocean x <= -460)
      new THREE.Vector3(-495, 8.2, -625),
      new THREE.Vector3(-622, 12.8, -572),
      new THREE.Vector3(-730, 15.5, -478),
      new THREE.Vector3(-810, 16.8, -355),
      new THREE.Vector3(-855, 17.2, -212),
      new THREE.Vector3(-855, 16.8, -62),
      new THREE.Vector3(-810, 15.0, 82),
      new THREE.Vector3(-728, 11.8, 212),
      new THREE.Vector3(-615, 7.2, 322),

      // 4. Mount Vantis Light Tunnel inside the Coastal Mountain Massif (s = 2160..2880m, level at y=3.2m)
      new THREE.Vector3(-475, 3.4, 408),
      new THREE.Vector3(-335, 3.2, 468),
      new THREE.Vector3(-185, 3.2, 498),
      new THREE.Vector3(-30, 3.2, 492),
      new THREE.Vector3(110, 3.4, 445),

      // 5. Skyline Elevated Viaduct, Industrial Sector & Century Grand Boulevard (s = 2880..3600m)
      new THREE.Vector3(205, 4.8, 355),
      new THREE.Vector3(232, 4.2, 232),
      new THREE.Vector3(162, 2.0, 145),
      new THREE.Vector3(48, 1.5, 88),
    ];

    this.curve = new THREE.CatmullRomCurve3(finalControlPoints, true, 'centripetal', 0.5);

    this.buildSamples();
    this.buildRoadMeshes(maxAnisotropy);
  }

  private buildSamples(): void {
    const upVec = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < this.sampleCount; i++) {
      const u = i / this.sampleCount;
      const s = u * CIRCUIT_LENGTH;
      const position = this.curve.getPointAt(u);
      const tangent = this.curve.getTangentAt(u).normalize();

      const flatTan = new THREE.Vector3(tangent.x, 0, tangent.z).normalize();
      const right = new THREE.Vector3().crossVectors(flatTan, upVec).normalize();
      const up = new THREE.Vector3().crossVectors(right, tangent).normalize();
      const yaw = Math.atan2(-flatTan.x, -flatTan.z);
      const pitch = Math.asin(Math.max(-0.5, Math.min(0.5, tangent.y)));

      this.samples.push({
        s,
        position,
        tangent,
        right,
        up,
        yaw,
        curvature: 0,
        pitch,
      });

      if (i % 8 === 0) {
        this.minimapPoints.push({ x: position.x, z: position.z });
      }
    }

    const ds = CIRCUIT_LENGTH / this.sampleCount;
    for (let i = 0; i < this.sampleCount; i++) {
      const prev = this.samples[(i - 1 + this.sampleCount) % this.sampleCount];
      const next = this.samples[(i + 1) % this.sampleCount];
      let dYaw = next.yaw - prev.yaw;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;
      this.samples[i].curvature = dYaw / (2 * ds);
    }
  }

  /**
   * Returns the minimum 2D horizontal distance from any world (x, z) point to the road centerline across the entire circuit.
   * Used to guarantee that buildings, villas, trees, and rocks never intersect or overlap any road segment.
   */
  public getMinDistanceToRoad(worldX: number, worldZ: number): {
    distance: number;
    closestS: number;
    closestY: number;
  } {
    let minDistSq = Infinity;
    let closestS = 0;
    let closestY = 1.5;

    // Check every 2nd sample (600 points = 4m resolution around the loop)
    for (let i = 0; i < this.sampleCount; i += 2) {
      const smp = this.samples[i];
      const dx = worldX - smp.position.x;
      const dz = worldZ - smp.position.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < minDistSq) {
        minDistSq = dSq;
        closestS = smp.s;
        closestY = smp.position.y;
      }
    }

    return {
      distance: Math.sqrt(minDistSq),
      closestS,
      closestY,
    };
  }

  public getSampleAtS(s: number): RoadSample {
    const normS = ((s % CIRCUIT_LENGTH) + CIRCUIT_LENGTH) % CIRCUIT_LENGTH;
    const exactIdx = (normS / CIRCUIT_LENGTH) * this.sampleCount;
    const idx0 = Math.floor(exactIdx) % this.sampleCount;
    const idx1 = (idx0 + 1) % this.sampleCount;
    const frac = exactIdx - Math.floor(exactIdx);

    const a = this.samples[idx0];
    const b = this.samples[idx1];

    const position = new THREE.Vector3().lerpVectors(a.position, b.position, frac);
    const tangent = new THREE.Vector3().lerpVectors(a.tangent, b.tangent, frac).normalize();
    const right = new THREE.Vector3().lerpVectors(a.right, b.right, frac).normalize();
    const up = new THREE.Vector3().lerpVectors(a.up, b.up, frac).normalize();

    let dYaw = b.yaw - a.yaw;
    while (dYaw > Math.PI) dYaw -= Math.PI * 2;
    while (dYaw < -Math.PI) dYaw += Math.PI * 2;
    const yaw = a.yaw + dYaw * frac;
    const curvature = a.curvature + (b.curvature - a.curvature) * frac;
    const pitch = a.pitch + (b.pitch - a.pitch) * frac;

    return { s: normS, position, tangent, right, up, yaw, curvature, pitch };
  }

  public trackToWorld(
    s: number,
    lateralOffset: number,
    heightOffset = 0,
    targetVec?: THREE.Vector3
  ): { position: THREE.Vector3; sample: RoadSample } {
    const sample = this.getSampleAtS(s);
    const out = targetVec ?? new THREE.Vector3();
    out.copy(sample.position)
      .addScaledVector(sample.right, lateralOffset)
      .addScaledVector(sample.up, heightOffset);
    return { position: out, sample };
  }

  private createAsphaltTexture(maxAnisotropy: number): {
    map: THREE.CanvasTexture;
    roughnessMap: THREE.CanvasTexture;
  } {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Rich, darker charcoal-slate asphalt base (requested: slightly darker road surface)
    ctx.fillStyle = '#23272e';
    ctx.fillRect(0, 0, 512, 512);

    // Natural sandy-grass/gravel shoulder verge on outer left & right edges
    const leftVerge = ctx.createLinearGradient(0, 0, 40, 0);
    leftVerge.addColorStop(0, '#686e46');
    leftVerge.addColorStop(0.55, '#827c58');
    leftVerge.addColorStop(1, '#23272e');
    ctx.fillStyle = leftVerge;
    ctx.fillRect(0, 0, 40, 512);

    const rightVerge = ctx.createLinearGradient(512 - 44, 0, 512, 0);
    rightVerge.addColorStop(0, '#23272e');
    rightVerge.addColorStop(0.45, '#88805c');
    rightVerge.addColorStop(1, '#6a7048');
    ctx.fillStyle = rightVerge;
    ctx.fillRect(512 - 44, 0, 44, 512);

    // Fine stone aggregate grain & asphalt micro-texture
    for (let i = 0; i < 10000; i++) {
      const x = (i * 73) % 512;
      const y = (i * 137) % 512;
      if (x < 34 || x > 512 - 38) continue;
      const delta = (i % 18) - 9;
      const r = Math.min(255, Math.max(15, 35 + delta));
      const g = Math.min(255, Math.max(15, 39 + delta));
      const b = Math.min(255, Math.max(15, 46 + delta));
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(x, y, 2, 2);
    }

    // Dappled tree canopy shadows across the left/center lanes
    for (let s = 0; s < 5; s++) {
      const sy = s * 105 + 20;
      const shGrad = ctx.createRadialGradient(120, sy, 15, 160, sy + 15, 160);
      shGrad.addColorStop(0, 'rgba(12, 16, 22, 0.34)');
      shGrad.addColorStop(0.65, 'rgba(12, 16, 22, 0.15)');
      shGrad.addColorStop(1, 'rgba(12, 16, 22, 0)');
      ctx.fillStyle = shGrad;
      ctx.fillRect(0, sy - 90, 360, 180);
    }

    // Darker rubberized racing line / tire wear tracks in the 4 lanes
    const laneCenters = [104, 204, 308, 408];
    for (const lc of laneCenters) {
      const grad = ctx.createLinearGradient(lc - 32, 0, lc + 32, 0);
      grad.addColorStop(0, 'rgba(15,18,22,0)');
      grad.addColorStop(0.5, 'rgba(15,18,22,0.34)');
      grad.addColorStop(1, 'rgba(15,18,22,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(lc - 32, 0, 64, 512);
    }

    // Outer road edge markings (solid left white edge line, dashed right shoulder line)
    ctx.fillStyle = 'rgba(241, 245, 249, 0.88)';
    ctx.fillRect(38, 0, 4, 512);
    for (let y = 12; y < 512; y += 64) {
      ctx.fillRect(512 - 44, y, 5, 36);
    }

    // Center white dashed highway line & lane dividers
    ctx.fillStyle = 'rgba(248, 250, 252, 0.85)';
    for (let y = 20; y < 512; y += 96) {
      ctx.fillRect(256 - 3, y, 5, 52);
      ctx.fillRect(152 - 2, y + 24, 4, 42);
      ctx.fillRect(360 - 2, y + 24, 4, 42);
    }

    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = maxAnisotropy;

    const rCanvas = document.createElement('canvas');
    rCanvas.width = 256;
    rCanvas.height = 256;
    const rCtx = rCanvas.getContext('2d')!;
    rCtx.fillStyle = '#c4c4c4';
    rCtx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2500; i++) {
      const v = 155 + (i % 65);
      rCtx.fillStyle = `rgb(${v},${v},${v})`;
      rCtx.fillRect((i * 53) % 256, (i * 97) % 256, 3, 3);
    }
    const roughnessMap = new THREE.CanvasTexture(rCanvas);
    roughnessMap.wrapS = THREE.RepeatWrapping;
    roughnessMap.wrapT = THREE.RepeatWrapping;

    return { map, roughnessMap };
  }

  private buildRoadMeshes(maxAnisotropy: number): void {
    const segs = 1080;
    const halfW = ROAD_HALF_WIDTH;
    const deckExtra = 1.4;

    const roadPositions = new Float32Array((segs + 1) * 2 * 3);
    const roadNormals = new Float32Array((segs + 1) * 2 * 3);
    const roadUvs = new Float32Array((segs + 1) * 2 * 2);
    const roadIndices: number[] = [];

    // Continuous Concrete Viaduct / Road Bed Deck Slab (4 vertices per cross-section: top-left, top-right, bottom-left, bottom-right)
    // Using a continuous BufferGeometry instead of flat InstancedMesh boxes prevents slabs from ever poking through sloped road ramps!
    const bedLeftPositions = new Float32Array((segs + 1) * 2 * 3);
    const bedRightPositions = new Float32Array((segs + 1) * 2 * 3);
    const bedBottomPositions = new Float32Array((segs + 1) * 2 * 3);

    // Guardrail beams
    const railLeftPositions = new Float32Array((segs + 1) * 2 * 3);
    const railRightPositions = new Float32Array((segs + 1) * 2 * 3);
    const railUvs = new Float32Array((segs + 1) * 2 * 2);
    const railIndices: number[] = [];

    for (let i = 0; i <= segs; i++) {
      const s = (i / segs) * CIRCUIT_LENGTH;
      const sample = this.getSampleAtS(s);
      const vCoord = (s / CIRCUIT_LENGTH) * 218;

      const leftPt = sample.position.clone().addScaledVector(sample.right, -halfW);
      const rightPt = sample.position.clone().addScaledVector(sample.right, halfW);

      const vIdx = i * 2;
      roadPositions.set([leftPt.x, leftPt.y, leftPt.z], vIdx * 3);
      roadPositions.set([rightPt.x, rightPt.y, rightPt.z], (vIdx + 1) * 3);

      roadNormals.set([sample.up.x, sample.up.y, sample.up.z], vIdx * 3);
      roadNormals.set([sample.up.x, sample.up.y, sample.up.z], (vIdx + 1) * 3);

      roadUvs.set([0, vCoord], vIdx * 2);
      roadUvs.set([1, vCoord], (vIdx + 1) * 2);

      // Continuous concrete side fascia & bottom deck (always strictly below sample.position along -sample.up)
      const bLTop = sample.position
        .clone()
        .addScaledVector(sample.right, -(halfW + deckExtra))
        .addScaledVector(sample.up, -0.06);
      const bLBot = sample.position
        .clone()
        .addScaledVector(sample.right, -(halfW + deckExtra))
        .addScaledVector(sample.up, -1.35);
      bedLeftPositions.set([bLBot.x, bLBot.y, bLBot.z], vIdx * 3);
      bedLeftPositions.set([bLTop.x, bLTop.y, bLTop.z], (vIdx + 1) * 3);

      const bRTop = sample.position
        .clone()
        .addScaledVector(sample.right, halfW + deckExtra)
        .addScaledVector(sample.up, -0.06);
      const bRBot = sample.position
        .clone()
        .addScaledVector(sample.right, halfW + deckExtra)
        .addScaledVector(sample.up, -1.35);
      bedRightPositions.set([bRTop.x, bRTop.y, bRTop.z], vIdx * 3);
      bedRightPositions.set([bRBot.x, bRBot.y, bRBot.z], (vIdx + 1) * 3);

      bedBottomPositions.set([bLBot.x, bLBot.y, bLBot.z], vIdx * 3);
      bedBottomPositions.set([bRBot.x, bRBot.y, bRBot.z], (vIdx + 1) * 3);

      // Left steel guardrail beam
      const gLBot = leftPt.clone().addScaledVector(sample.up, 0.42);
      const gLTop = leftPt.clone().addScaledVector(sample.up, 0.80);
      railLeftPositions.set([gLBot.x, gLBot.y, gLBot.z], vIdx * 3);
      railLeftPositions.set([gLTop.x, gLTop.y, gLTop.z], (vIdx + 1) * 3);

      // Right wooden/timber guardrail beam
      const gRBot = rightPt.clone().addScaledVector(sample.up, 0.42);
      const gRTop = rightPt.clone().addScaledVector(sample.up, 0.68);
      railRightPositions.set([gRBot.x, gRBot.y, gRBot.z], vIdx * 3);
      railRightPositions.set([gRTop.x, gRTop.y, gRTop.z], (vIdx + 1) * 3);

      railUvs.set([0, vCoord * 0.5], vIdx * 2);
      railUvs.set([1, vCoord * 0.5], (vIdx + 1) * 2);

      if (i < segs) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        roadIndices.push(a, b, c, b, d, c);
        railIndices.push(a, c, b, b, c, d);
      }
    }

    const { map } = this.createAsphaltTexture(maxAnisotropy);
    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.BufferAttribute(roadPositions, 3));
    roadGeo.setAttribute('normal', new THREE.BufferAttribute(roadNormals, 3));
    roadGeo.setAttribute('uv', new THREE.BufferAttribute(roadUvs, 2));
    roadGeo.setIndex(roadIndices);

    // Pure diffuse Lambert material prevents any white RoomEnvironment ceiling reflection or specular spotlight glare following the car on the road
    const roadMat = new THREE.MeshLambertMaterial({
      color: 0xd8dee9,
      map,
    });
    this.roadMaterial = roadMat;

    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    this.roadGroup.add(roadMesh);

    // Continuous concrete deck side-walls & underside
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0x6b6661,
      roughness: 0.88,
      metalness: 0.08,
      side: THREE.DoubleSide,
    });
    for (const posArr of [bedLeftPositions, bedRightPositions, bedBottomPositions]) {
      const bGeo = new THREE.BufferGeometry();
      bGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      bGeo.setIndex(railIndices);
      bGeo.computeVertexNormals();
      this.roadGroup.add(new THREE.Mesh(bGeo, slabMat));
    }

    // Left galvanized steel guardrail
    const leftRailMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.45,
      metalness: 0.65,
      side: THREE.DoubleSide,
    });
    const guardLeftGeo = new THREE.BufferGeometry();
    guardLeftGeo.setAttribute('position', new THREE.BufferAttribute(railLeftPositions, 3));
    guardLeftGeo.setAttribute('uv', new THREE.BufferAttribute(railUvs, 2));
    guardLeftGeo.setIndex(railIndices);
    guardLeftGeo.computeVertexNormals();
    this.roadGroup.add(new THREE.Mesh(guardLeftGeo, leftRailMat));

    // Right warm timber log guardrail
    const rightWoodMat = new THREE.MeshStandardMaterial({
      color: 0x8f653d,
      roughness: 0.78,
      metalness: 0.10,
      side: THREE.DoubleSide,
    });
    const guardRightGeo = new THREE.BufferGeometry();
    guardRightGeo.setAttribute('position', new THREE.BufferAttribute(railRightPositions, 3));
    guardRightGeo.setAttribute('uv', new THREE.BufferAttribute(railUvs, 2));
    guardRightGeo.setIndex(railIndices);
    guardRightGeo.computeVertexNormals();
    this.roadGroup.add(new THREE.Mesh(guardRightGeo, rightWoodMat));

    // Guardrail vertical posts every 5 meters on both sides, aligned with road pitch & yaw
    const postSpacing = 5;
    const postCountPerSide = Math.floor(CIRCUIT_LENGTH / postSpacing);
    const postGeo = new THREE.CylinderGeometry(0.10, 0.11, 0.82, 8);
    const postMat = new THREE.MeshStandardMaterial({
      color: 0x6e4d2c,
      roughness: 0.85,
      metalness: 0.1,
    });
    const postsInstanced = new THREE.InstancedMesh(postGeo, postMat, postCountPerSide * 2);
    const dummy = new THREE.Object3D();

    let postIdx = 0;
    for (let i = 0; i < postCountPerSide; i++) {
      const s = i * postSpacing;
      const sample = this.getSampleAtS(s);

      // Left post
      dummy.position
        .copy(sample.position)
        .addScaledVector(sample.right, -(halfW + 0.08))
        .addScaledVector(sample.up, 0.41);
      dummy.rotation.set(sample.pitch, sample.yaw, 0, 'YXZ');
      dummy.updateMatrix();
      postsInstanced.setMatrixAt(postIdx++, dummy.matrix);

      // Right post
      dummy.position
        .copy(sample.position)
        .addScaledVector(sample.right, halfW + 0.08)
        .addScaledVector(sample.up, 0.36);
      dummy.rotation.set(sample.pitch, sample.yaw, 0, 'YXZ');
      dummy.updateMatrix();
      postsInstanced.setMatrixAt(postIdx++, dummy.matrix);
    }
    postsInstanced.instanceMatrix.needsUpdate = true;
    postsInstanced.computeBoundingSphere();
    this.roadGroup.add(postsInstanced);
  }
}
