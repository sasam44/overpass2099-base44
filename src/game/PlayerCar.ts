import * as THREE from 'three';
import { CarSpec, PLAYABLE_CARS } from './types';
import {
  VehicleControlInput,
  VehiclePhysicsState,
  createInitialPhysicsState,
  stepVehiclePhysics,
} from './VehiclePhysics';
import { BuiltSportsCar, buildSportsCarModel } from './CarBuilder';
import { RoadSystem } from './RoadSystem';

type ParticleKind = 'spark' | 'debris' | 'smoke';

interface PooledParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  vrx: number;
  vry: number;
  vrz: number;
  age: number;
  maxAge: number;
  scale: number;
  kind: ParticleKind;
  colorHex: number;
}

export class PlayerCar {
  public spec: CarSpec;
  public state: VehiclePhysicsState;
  public model: BuiltSportsCar;
  public readonly worldPosition = new THREE.Vector3();
  public worldYaw = 0;
  public topSpeedRecordedKmh = 0;

  // Pooled zero-GC particle ring buffer for tire smoke, collision sparks & flying debris shards
  public readonly particleInstanced: THREE.InstancedMesh;
  private readonly particles: PooledParticle[] = [];
  private readonly maxParticles = 128;
  private particleCursor = 0;
  private smokeTimer = 0;
  private readonly _dummy = new THREE.Object3D();
  private readonly _color = new THREE.Color();

  // Chassis Hazard Strobe on Collisions
  private damageFlickerTimer = 0;

  constructor(initialSpec: CarSpec = PLAYABLE_CARS[0]) {
    this.spec = initialSpec;
    this.state = createInitialPhysicsState(8, 2.2);
    this.model = buildSportsCarModel({
      colorHex: initialSpec.colorHex,
      accentHex: initialSpec.accentHex,
      plateText: 'GEAR.CLUB',
      raceNumber: initialSpec.raceNumber,
      markerLabel: 'YOU',
      isPlayer: true,
    });

    const pGeo = new THREE.BoxGeometry(0.14, 0.08, 0.20);
    const pMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.90,
    });
    this.particleInstanced = new THREE.InstancedMesh(pGeo, pMat, this.maxParticles);
    this.particleInstanced.frustumCulled = false;

    for (let i = 0; i < this.maxParticles; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rx: 0,
        ry: 0,
        rz: 0,
        vrx: 0,
        vry: 0,
        vrz: 0,
        age: 0,
        maxAge: 0.5,
        scale: 1,
        kind: 'spark',
        colorHex: 0xfef08a,
      });
      this._dummy.position.set(0, -100, 0);
      this._dummy.scale.setScalar(0.001);
      this._dummy.updateMatrix();
      this.particleInstanced.setMatrixAt(i, this._dummy.matrix);
      this.particleInstanced.setColorAt(i, this._color.setHex(0xcbd5e1));
    }
    this.particleInstanced.instanceMatrix.needsUpdate = true;
    if (this.particleInstanced.instanceColor) {
      this.particleInstanced.instanceColor.needsUpdate = true;
    }
  }

  public setCarSpec(spec: CarSpec): void {
    this.spec = spec;
    this.model.bodyPaintMaterial.color.setHex(spec.colorHex);
    this.model.setRaceNumber(spec.raceNumber, spec.accentHex, 'YOU');
  }

  public resetToGrid(startS = 8, lateralOffset = 2.2): void {
    this.state = createInitialPhysicsState(startS, lateralOffset);
    this.topSpeedRecordedKmh = 0;
    this.damageFlickerTimer = 0;
  }

  public recoverToRoadCenter(): void {
    this.state.lateralOffset = 0;
    this.state.headingOffset = 0;
    this.state.lateralVelocity = 0;
    this.state.speedMs = Math.max(0, Math.min(18, this.state.speedMs));
  }

  public spawnSparkBurst(
    worldPos: THREE.Vector3,
    count = 18,
    intensity = 0.7,
    localOffsetX = 0,
    localOffsetZ = -1.2
  ): void {
    // 1. Trigger chassis hazard strobe & physical suspension pitch/roll jolt
    this.damageFlickerTimer = Math.max(this.damageFlickerTimer, 0.48 * intensity);

    this.state.pitchAngle = Math.max(
      -0.11,
      Math.min(0.11, this.state.pitchAngle + (localOffsetZ < 0 ? 0.065 : -0.055) * intensity)
    );
    this.state.rollAngle = Math.max(
      -0.14,
      Math.min(0.14, this.state.rollAngle + (localOffsetX >= 0 ? -0.09 : 0.09) * (0.6 + intensity))
    );

    // 2. Spawn high-velocity golden/orange/cyan welding sparks
    const sparkCount = Math.round(count * (1.0 + intensity * 0.8));
    for (let i = 0; i < sparkCount; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % this.maxParticles;
      p.active = true;
      p.kind = 'spark';
      p.x = worldPos.x + (Math.random() - 0.5) * 1.3;
      p.y = worldPos.y + 0.45 + Math.random() * 0.65;
      p.z = worldPos.z + (Math.random() - 0.5) * 1.3;
      p.vx = (Math.random() - 0.5) * (16 + intensity * 12);
      p.vy = 3.2 + Math.random() * (7.5 + intensity * 5);
      p.vz = (Math.random() - 0.5) * (16 + intensity * 12);
      p.rx = Math.random() * Math.PI;
      p.ry = Math.random() * Math.PI;
      p.rz = Math.random() * Math.PI;
      p.vrx = (Math.random() - 0.5) * 18;
      p.vry = (Math.random() - 0.5) * 18;
      p.vrz = (Math.random() - 0.5) * 18;
      p.age = 0;
      p.maxAge = 0.30 + Math.random() * 0.26;
      p.scale = 0.72 + Math.random() * 0.65;
      p.colorHex = i % 5 === 0 ? 0x38bdf8 : i % 2 === 0 ? 0xfef08a : 0xf97316;
    }

    // 3. Spawn tumbling carbon-fiber / metallic body shards & glass fragments
    const debrisCount = Math.max(8, Math.round(12 * intensity));
    const debrisPalette = [0x1e293b, 0x94a3b8, 0xef4444, 0x38bdf8, 0xfacc15];
    for (let i = 0; i < debrisCount; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % this.maxParticles;
      p.active = true;
      p.kind = 'debris';
      p.x = worldPos.x + (Math.random() - 0.5) * 1.4;
      p.y = worldPos.y + 0.55 + Math.random() * 0.6;
      p.z = worldPos.z + (Math.random() - 0.5) * 1.4;
      p.vx = (Math.random() - 0.5) * (12 + intensity * 9);
      p.vy = 4.2 + Math.random() * (6.5 + intensity * 4);
      p.vz = (Math.random() - 0.5) * (12 + intensity * 9);
      p.rx = Math.random() * Math.PI;
      p.ry = Math.random() * Math.PI;
      p.rz = Math.random() * Math.PI;
      p.vrx = (Math.random() - 0.5) * 26;
      p.vry = (Math.random() - 0.5) * 26;
      p.vrz = (Math.random() - 0.5) * 26;
      p.age = 0;
      p.maxAge = 0.48 + Math.random() * 0.32;
      p.scale = 0.75 + Math.random() * 0.55;
      p.colorHex = debrisPalette[i % debrisPalette.length];
    }

    // 4. Spawn compact impact smoke puffs
    const smokeCount = Math.max(4, Math.round(6 * intensity));
    for (let i = 0; i < smokeCount; i++) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % this.maxParticles;
      p.active = true;
      p.kind = 'smoke';
      p.x = worldPos.x + (Math.random() - 0.5) * 1.4;
      p.y = worldPos.y + 0.30 + Math.random() * 0.35;
      p.z = worldPos.z + (Math.random() - 0.5) * 1.4;
      p.vx = (Math.random() - 0.5) * 5.0;
      p.vy = 0.9 + Math.random() * 1.5;
      p.vz = (Math.random() - 0.5) * 5.0;
      p.rx = 0;
      p.ry = 0;
      p.rz = 0;
      p.vrx = 0;
      p.vry = 0;
      p.vrz = 0;
      p.age = 0;
      p.maxAge = 0.32 + Math.random() * 0.18;
      p.scale = 0.38 + Math.random() * 0.25;
      p.colorHex = 0x64748b;
    }
  }

  private spawnTireSmoke(): void {
    for (const side of [-0.88, 0.88]) {
      const p = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % this.maxParticles;
      const cos = Math.cos(this.worldYaw);
      const sin = Math.sin(this.worldYaw);
      const localX = side;
      const localZ = 1.45;
      p.active = true;
      p.kind = 'smoke';
      p.x = this.worldPosition.x + localX * cos + localZ * sin;
      p.y = this.worldPosition.y + 0.10;
      p.z = this.worldPosition.z - localX * sin + localZ * cos;
      p.vx = (Math.random() - 0.5) * 1.6;
      p.vy = 0.35 + Math.random() * 0.45;
      p.vz = (Math.random() - 0.5) * 1.6;
      p.rx = 0;
      p.ry = 0;
      p.rz = 0;
      p.vrx = 0;
      p.vry = 0;
      p.vrz = 0;
      p.age = 0;
      p.maxAge = 0.32 + Math.random() * 0.14;
      p.scale = 0.52;
      p.colorHex = 0x475569;
    }
  }

  public update(
    input: VehicleControlInput,
    road: RoadSystem,
    dt: number,
    canMove = true,
    roadFrictionMultiplier = 1.0
  ): void {
    const sampleBefore = road.getSampleAtS(this.state.s);

    if (canMove) {
      this.state = stepVehiclePhysics(
        this.state,
        input,
        this.spec,
        sampleBefore.curvature,
        dt,
        roadFrictionMultiplier
      );
    } else {
      // During 3-2-1 countdown, allow engine revving & wheel steering preview without advancing
      const revRpm = input.throttle > 0 ? 3500 + Math.round(input.throttle * 4800) : 1300;
      this.state.rpm = revRpm;
    }

    const speedKmh = Math.abs(this.state.speedMs * 3.6);
    if (speedKmh > this.topSpeedRecordedKmh) {
      this.topSpeedRecordedKmh = speedKmh;
    }

    const { position, sample } = road.trackToWorld(
      this.state.s,
      this.state.lateralOffset,
      0,
      this.worldPosition
    );
    this.worldYaw = sample.yaw + this.state.headingOffset;

    this.model.root.position.copy(position);
    // Align car pitch with road slope + heading yaw
    const slopePitch = Math.asin(Math.max(-0.5, Math.min(0.5, sample.tangent.y)));
    this.model.root.rotation.set(slopePitch, this.worldYaw, 0, 'YXZ');

    // Suspension body tilt
    this.model.bodyTiltGroup.rotation.set(
      this.state.pitchAngle,
      0,
      this.state.rollAngle
    );

    // Wheel spin & front wheel steering
    for (const w of this.model.wheels) {
      w.rotation.x = -this.state.wheelSpinAngle;
    }
    for (const fp of this.model.frontWheelPivots) {
      fp.rotation.y = this.state.steerAngle * 0.85;
    }

    // Brake lights brighten strongly when braking, handbraking, or hazard-strobing after collision
    const isBraking = input.brake > 0.1 || input.handbrake;
    if (this.damageFlickerTimer > 0) {
      this.damageFlickerTimer = Math.max(0, this.damageFlickerTimer - dt);
      const hazardStrobe = Math.floor(this.damageFlickerTimer * 28) % 2 === 0;
      this.model.brakeLightMaterial.emissiveIntensity = hazardStrobe ? 5.2 : 0.8;
    } else {
      this.model.brakeLightMaterial.emissiveIntensity = isBraking ? 3.8 : 1.15;
    }

    // Nitro exhaust flame
    this.model.nitroFlameGroup.visible = this.state.nitroActive;
    if (this.state.nitroActive) {
      const flicker = 0.85 + Math.random() * 0.35;
      this.model.nitroFlameGroup.scale.set(1, 1, flicker);
    }

    // Tire smoke only during intentional handbrake drifting
    this.smokeTimer += dt;
    if (canMove && this.smokeTimer > 0.06 && this.state.drifting && input.handbrake) {
      this.smokeTimer = 0;
      this.spawnTireSmoke();
    }

    if (this.state.hitBoundary) {
      const sideSign = this.state.lateralOffset >= 0 ? 1.0 : -1.0;
      this.spawnSparkBurst(
        this.worldPosition,
        16,
        Math.min(1, this.state.boundaryImpactSpeed / 22),
        sideSign * 0.95,
        -0.4
      );
    }

    this.updateParticles(dt);
  }

  public syncTransformOnly(road: RoadSystem): void {
    const { position, sample } = road.trackToWorld(
      this.state.s,
      this.state.lateralOffset,
      0,
      this.worldPosition
    );
    this.worldYaw = sample.yaw + this.state.headingOffset;
    const slopePitch = Math.asin(Math.max(-0.5, Math.min(0.5, sample.tangent.y)));
    this.model.root.position.copy(position);
    this.model.root.rotation.set(slopePitch, this.worldYaw, 0, 'YXZ');
  }

  private updateParticles(dt: number): void {
    let anyUpdated = false;
    const groundY = this.worldPosition.y + 0.08;

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyUpdated = true;
      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        this._dummy.position.set(0, -100, 0);
        this._dummy.scale.setScalar(0.001);
        this._dummy.updateMatrix();
        this.particleInstanced.setMatrixAt(i, this._dummy.matrix);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rx += p.vrx * dt;
      p.ry += p.vry * dt;
      p.rz += p.vrz * dt;

      if (p.kind === 'spark' || p.kind === 'debris') {
        p.vy -= 22 * dt;
        // Bounce off road surface
        if (p.y < groundY && p.vy < 0) {
          p.y = groundY;
          p.vy = -p.vy * 0.45;
          p.vx *= 0.78;
          p.vz *= 0.78;
        }
      } else {
        p.vx *= 0.92;
        p.vz *= 0.92;
      }

      const lifeRatio = 1 - p.age / p.maxAge;
      this._dummy.position.set(p.x, p.y, p.z);
      this._dummy.rotation.set(p.rx, p.ry, p.rz);

      if (p.kind === 'spark') {
        const s = Math.max(0.06, p.scale * lifeRatio);
        this._dummy.scale.set(s * 0.45, s * 0.45, s * 2.1);
        this._color.setHex(lifeRatio > 0.55 ? p.colorHex : 0xf97316);
      } else if (p.kind === 'debris') {
        const s = Math.max(0.08, p.scale * (0.35 + lifeRatio * 0.65));
        this._dummy.scale.set(s * 1.35, s * 0.35, s * 1.15);
        this._color.setHex(p.colorHex);
      } else {
        const s = Math.max(0.08, p.scale * (1 + (1 - lifeRatio) * 1.8));
        this._dummy.scale.setScalar(s);
        this._color.setHex(p.colorHex);
      }

      this._dummy.updateMatrix();
      this.particleInstanced.setMatrixAt(i, this._dummy.matrix);
      this.particleInstanced.setColorAt(i, this._color);
    }

    if (anyUpdated) {
      this.particleInstanced.instanceMatrix.needsUpdate = true;
      if (this.particleInstanced.instanceColor) {
        this.particleInstanced.instanceColor.needsUpdate = true;
      }
    }
  }
}
