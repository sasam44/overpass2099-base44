import * as THREE from 'three';
import { RoadSystem } from './RoadSystem';
import { CIRCUIT_LENGTH, ROAD_HALF_WIDTH } from './types';

export class CheckpointSystem {
  public readonly checkpointPositionsS: number[] = [];
  public readonly checkpointWorldPositions: Array<{ x: number; z: number; s: number }> = [];
  public readonly checkpointGroup: THREE.Group;
  private readonly archMaterials: THREE.MeshStandardMaterial[] = [];

  constructor(road: RoadSystem) {
    this.checkpointGroup = new THREE.Group();
    this.checkpointGroup.name = 'CheckpointSystem';

    // 8 evenly spaced checkpoints around the 2400m circuit (0 = Start/Finish line)
    const count = 8;
    for (let i = 0; i < count; i++) {
      const s = (i / count) * CIRCUIT_LENGTH;
      this.checkpointPositionsS.push(s);
      const sample = road.getSampleAtS(s);
      this.checkpointWorldPositions.push({
        x: sample.position.x,
        z: sample.position.z,
        s,
      });

      this.buildCheckpointGate(sample.position, sample.yaw, i === 0);
    }
  }

  private createFinishBannerTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 512, 96);

    // Checkered flag pattern on left & right ends
    const sq = 16;
    for (let y = 0; y < 96; y += sq) {
      for (let x = 0; x < 96; x += sq) {
        const isWhite = ((x / sq + y / sq) % 2) === 0;
        ctx.fillStyle = isWhite ? '#f8fafc' : '#0f172a';
        ctx.fillRect(x, y, sq, sq);
        ctx.fillRect(512 - 96 + x, y, sq, sq);
      }
    }

    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(96, 0, 320, 6);
    ctx.fillRect(96, 90, 320, 6);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 34px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NEO VANTIS CIRCUIT', 256, 48);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private buildCheckpointGate(
    position: THREE.Vector3,
    yaw: number,
    isStartFinish: boolean
  ): void {
    const gate = new THREE.Group();
    gate.position.copy(position);
    gate.rotation.set(0, yaw, 0);

    const spanHalf = ROAD_HALF_WIDTH + 0.9;
    const height = isStartFinish ? 9.2 : 7.8;

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.75,
    });

    const glowHex = isStartFinish ? 0xf59e0b : 0x06b6d4;
    const glowMat = new THREE.MeshStandardMaterial({
      color: glowHex,
      emissive: glowHex,
      emissiveIntensity: isStartFinish ? 2.2 : 1.6,
      roughness: 0.2,
    });
    this.archMaterials.push(glowMat);

    // Left and right support pylons
    const pylonGeo = new THREE.BoxGeometry(0.75, height, 0.95);
    const leftPylon = new THREE.Mesh(pylonGeo, frameMat);
    leftPylon.position.set(-spanHalf, height / 2, 0);
    gate.add(leftPylon);

    const rightPylon = new THREE.Mesh(pylonGeo, frameMat);
    rightPylon.position.set(spanHalf, height / 2, 0);
    gate.add(rightPylon);

    // Glowing vertical chevron strips on pylons
    const stripGeo = new THREE.BoxGeometry(0.22, height - 1.2, 1.02);
    const leftStrip = new THREE.Mesh(stripGeo, glowMat);
    leftStrip.position.set(-spanHalf + 0.28, height / 2, 0);
    gate.add(leftStrip);

    const rightStrip = new THREE.Mesh(stripGeo, glowMat);
    rightStrip.position.set(spanHalf - 0.28, height / 2, 0);
    gate.add(rightStrip);

    // Overhead gantry beam
    const beamGeo = new THREE.BoxGeometry(spanHalf * 2 + 1.2, isStartFinish ? 1.8 : 0.85, 1.1);
    const beam = new THREE.Mesh(beamGeo, frameMat);
    beam.position.set(0, height, 0);
    gate.add(beam);

    const topGlow = new THREE.Mesh(
      new THREE.BoxGeometry(spanHalf * 2 - 0.5, 0.25, 1.18),
      glowMat
    );
    topGlow.position.set(0, height - (isStartFinish ? 0.95 : 0.45), 0);
    gate.add(topGlow);

    if (isStartFinish) {
      const bannerTex = this.createFinishBannerTexture();
      const bannerMat = new THREE.MeshBasicMaterial({
        map: bannerTex,
        side: THREE.DoubleSide,
      });
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(spanHalf * 1.85, 1.55), bannerMat);
      banner.position.set(0, height, 0.58);
      gate.add(banner);

      const bannerBack = banner.clone();
      bannerBack.position.set(0, height, -0.58);
      bannerBack.rotation.y = Math.PI;
      gate.add(bannerBack);

      // Painted Checkered Start/Finish Line across the road surface at s=0
      const stripCanvas = document.createElement('canvas');
      stripCanvas.width = 256;
      stripCanvas.height = 32;
      const sCtx = stripCanvas.getContext('2d')!;
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 16; c++) {
          sCtx.fillStyle = (r + c) % 2 === 0 ? '#f8fafc' : '#0f172a';
          sCtx.fillRect(c * 16, r * 16, 16, 16);
        }
      }
      const stripTex = new THREE.CanvasTexture(stripCanvas);
      stripTex.colorSpace = THREE.SRGBColorSpace;
      const roadLineMat = new THREE.MeshBasicMaterial({
        map: stripTex,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      });
      const roadLine = new THREE.Mesh(
        new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 1.95, 2.2),
        roadLineMat
      );
      roadLine.rotation.x = -Math.PI / 2;
      roadLine.position.set(0, 0.04, 0);
      gate.add(roadLine);
    }

    this.checkpointGroup.add(gate);
  }

  public highlightNextCheckpoint(nextIndex: number): void {
    for (let i = 0; i < this.archMaterials.length; i++) {
      const mat = this.archMaterials[i];
      if (i === nextIndex) {
        mat.emissiveIntensity = 2.8;
      } else {
        mat.emissiveIntensity = i === 0 ? 1.6 : 0.85;
      }
    }
  }
}
