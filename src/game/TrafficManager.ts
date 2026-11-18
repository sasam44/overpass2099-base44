import * as THREE from 'three';
import { CIRCUIT_LENGTH } from './types';
import { CivilianVehicleType, buildCivilianVehicleModel } from './CarBuilder';
import { RoadSystem } from './RoadSystem';

export interface TrafficVehicle {
  id: string;
  type: CivilianVehicleType;
  root: THREE.Group;
  wheels: THREE.Object3D[];
  s: number;
  laneIndex: number;        // 0..3
  lateralOffset: number;
  baseSpeedMs: number;
  currentSpeedMs: number;
  wheelSpinAngle: number;
  worldPosition: THREE.Vector3;
  worldYaw: number;
  halfLength: number;
  halfWidth: number;
}

const LANE_OFFSETS = [-6.3, -2.1, 2.1, 6.3];
const TRAFFIC_COLORS = [
  0x64748b,
  0x94a3b8,
  0x0ea5e9,
  0xf59e0b,
  0x10b981,
  0xe2e8f0,
  0x475569,
  0x3b82f6,
];

export class TrafficManager {
  public readonly vehicles: TrafficVehicle[] = [];
  public readonly trafficGroup: THREE.Group;

  constructor() {
    this.trafficGroup = new THREE.Group();
    this.trafficGroup.name = 'TrafficManager';

    const totalTraffic = 26;
    const types: CivilianVehicleType[] = ['sedan', 'van', 'sedan', 'shuttle'];

    for (let i = 0; i < totalTraffic; i++) {
      const type = types[i % types.length];
      const color = TRAFFIC_COLORS[i % TRAFFIC_COLORS.length];
      const { root, wheels } = buildCivilianVehicleModel(type, color);
      this.trafficGroup.add(root);

      const laneIndex = i % 4;
      // Start civilian traffic safely ahead of the starting grid (s >= 68m up to 2330m)
      const s = 68 + (i / totalTraffic) * (CIRCUIT_LENGTH - 140);
      const baseSpeedKmh =
        type === 'shuttle' ? 78 + (i % 3) * 8 : type === 'van' ? 92 + (i % 4) * 9 : 108 + (i % 5) * 10;

      this.vehicles.push({
        id: `traffic-${i}`,
        type,
        root,
        wheels,
        s,
        laneIndex,
        lateralOffset: LANE_OFFSETS[laneIndex],
        baseSpeedMs: baseSpeedKmh / 3.6,
        currentSpeedMs: baseSpeedKmh / 3.6,
        wheelSpinAngle: 0,
        worldPosition: new THREE.Vector3(),
        worldYaw: 0,
        halfLength: type === 'shuttle' ? 3.0 : type === 'van' ? 2.4 : 2.15,
        halfWidth: type === 'shuttle' ? 1.1 : 0.98,
      });
    }
  }

  public resetTraffic(road: RoadSystem): void {
    const total = this.vehicles.length;
    for (let i = 0; i < total; i++) {
      const v = this.vehicles[i];
      v.laneIndex = i % 4;
      v.lateralOffset = LANE_OFFSETS[v.laneIndex];
      // Guarantee traffic never spawns on top of the starting grid (s = 0..60m)
      v.s = 68 + (i / total) * (CIRCUIT_LENGTH - 140);
      v.currentSpeedMs = v.baseSpeedMs;
      this.syncTransform(v, road);
    }
  }

  public update(dt: number, road: RoadSystem): void {
    const clampedDt = Math.min(Math.max(dt, 0.0001), 0.05);

    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      let targetSpeed = v.baseSpeedMs;

      // Maintain spacing with any traffic vehicle directly ahead in the same lane
      for (let j = 0; j < this.vehicles.length; j++) {
        if (i === j) continue;
        const ahead = this.vehicles[j];
        if (Math.abs(ahead.lateralOffset - v.lateralOffset) < 1.8) {
          let ds = ahead.s - v.s;
          if (ds < 0) ds += CIRCUIT_LENGTH;
          if (ds > 0 && ds < 26) {
            targetSpeed = Math.min(targetSpeed, ahead.currentSpeedMs * 0.85);
          }
        }
      }

      v.currentSpeedMs += (targetSpeed - v.currentSpeedMs) * (1 - Math.exp(-5 * clampedDt));
      v.s = (v.s + v.currentSpeedMs * clampedDt) % CIRCUIT_LENGTH;
      v.wheelSpinAngle = (v.wheelSpinAngle + (v.currentSpeedMs * clampedDt) / 0.34) % (Math.PI * 200);

      // Smoothly return to assigned lane center if nudged by collision
      const targetLat = LANE_OFFSETS[v.laneIndex];
      v.lateralOffset += (targetLat - v.lateralOffset) * (1 - Math.exp(-4 * clampedDt));

      this.syncTransform(v, road);
    }
  }

  private syncTransform(v: TrafficVehicle, road: RoadSystem): void {
    const { position, sample } = road.trackToWorld(
      v.s,
      v.lateralOffset,
      0,
      v.worldPosition
    );
    v.worldYaw = sample.yaw;
    const slopePitch = Math.asin(Math.max(-0.5, Math.min(0.5, sample.tangent.y)));

    v.root.position.copy(position);
    v.root.rotation.set(slopePitch, v.worldYaw, 0, 'YXZ');

    for (const w of v.wheels) {
      w.rotation.x = -v.wheelSpinAngle;
    }
  }
}
