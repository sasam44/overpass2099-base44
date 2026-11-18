import * as THREE from 'three';
import {
  AI_OPPONENT_PROFILES,
  AIOpponentProfile,
  CIRCUIT_LENGTH,
  ROAD_HALF_WIDTH,
} from './types';
import { BuiltSportsCar, buildSportsCarModel } from './CarBuilder';
import { RoadSystem } from './RoadSystem';
import { CheckpointProgressState, updateCheckpointProgress } from './VehiclePhysics';
import { TrafficVehicle } from './TrafficManager';

export interface AIRacerInstance {
  profile: AIOpponentProfile;
  model: BuiltSportsCar;
  s: number;
  lateralOffset: number;
  targetLateralOffset: number;
  headingOffset: number;
  speedMs: number;
  lateralVelocity: number;
  wheelSpinAngle: number;
  laneDecisionTimer: number;
  mistakeTimer: number;
  worldPosition: THREE.Vector3;
  worldYaw: number;
  progress: CheckpointProgressState;
  finishTimeMs: number | null;
}

export class RacingAI {
  public readonly racers: AIRacerInstance[] = [];
  public readonly aiGroup: THREE.Group;

  constructor() {
    this.aiGroup = new THREE.Group();
    this.aiGroup.name = 'RacingAI';

    for (let i = 0; i < AI_OPPONENT_PROFILES.length; i++) {
      const profile = AI_OPPONENT_PROFILES[i];
      const shortDriverName = profile.driverName.split(' ')[0];
      const model = buildSportsCarModel({
        colorHex: profile.colorHex,
        accentHex: profile.accentHex,
        plateText: `NV.#${profile.raceNumber}`,
        raceNumber: profile.raceNumber,
        markerLabel: shortDriverName,
        isPlayer: false,
      });
      this.aiGroup.add(model.root);

      this.racers.push({
        profile,
        model,
        s: 0,
        lateralOffset: profile.preferredLaneOffset,
        targetLateralOffset: profile.preferredLaneOffset,
        headingOffset: 0,
        speedMs: 0,
        lateralVelocity: 0,
        wheelSpinAngle: 0,
        laneDecisionTimer: 0.4 + i * 0.15,
        mistakeTimer: 0,
        worldPosition: new THREE.Vector3(),
        worldYaw: 0,
        progress: {
          lap: 1,
          nextCheckpointIndex: 1,
          totalProgressMeters: 0,
          finished: false,
        },
        finishTimeMs: null,
      });
    }
  }

  public setOverheadMarkersVisible(visible: boolean): void {
    for (const r of this.racers) {
      r.model.overheadMarker.visible = visible;
    }
  }

  public resetStartingGrid(road: RoadSystem): void {
    // Place the 6 AI cars ahead of the player (at s=8m) so the white car (AI-1) is on the left flank and the blue car (AI-2) is ahead down the road
    const gridOffsets = [
      { s: 13.5, lat: -2.4 },  // AI-1: Crisp Pearl White right on the player's left-front
      { s: 36.0, lat: 0.4 },   // AI-2: Racing Blue ahead down the lane
      { s: 22.0, lat: 4.8 },   // AI-3: Crimson
      { s: 27.0, lat: -5.4 },  // AI-4: Volt Amber
      { s: 44.0, lat: -3.2 },  // AI-5: Emerald
      { s: 52.0, lat: 3.4 },   // AI-6: Obsidian
    ];

    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i];
      const slot = gridOffsets[i % gridOffsets.length];
      r.s = slot.s;
      r.lateralOffset = slot.lat;
      r.targetLateralOffset = r.profile.preferredLaneOffset;
      r.headingOffset = 0;
      r.speedMs = 0;
      r.lateralVelocity = 0;
      r.wheelSpinAngle = 0;
      r.mistakeTimer = 0;
      r.finishTimeMs = null;
      r.progress = {
        lap: 1,
        nextCheckpointIndex: 1,
        totalProgressMeters: slot.s,
        finished: false,
      };
      this.syncRacerTransform(r, road);
    }
  }

  public update(
    dt: number,
    road: RoadSystem,
    traffic: TrafficVehicle[],
    playerTotalProgress: number,
    checkpointPositionsS: number[],
    totalLaps: number,
    raceTimeMs: number,
    canMove = true,
    roadFrictionMultiplier = 1.0
  ): void {
    const clampedDt = Math.min(Math.max(dt, 0.0001), 0.05);
    const candidateLanes = [-6.2, -2.2, 2.2, 6.2];

    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i];

      if (!canMove) {
        this.syncRacerTransform(r, road);
        continue;
      }

      const prevS = r.s;
      const sample = road.getSampleAtS(r.s);
      const lookaheadSample = road.getSampleAtS(r.s + 42);

      // 1. Evaluate traffic & opponent avoidance + overtaking every ~0.25s
      r.laneDecisionTimer -= clampedDt;
      if (r.laneDecisionTimer <= 0) {
        r.laneDecisionTimer = 0.2 + Math.random() * 0.18;

        // Occasional natural mistake (more frequent on slick wet roads)
        const effectiveMistakeChance =
          r.profile.mistakeChance * (1 + (1 - roadFrictionMultiplier) * 0.8);
        if (Math.random() < effectiveMistakeChance) {
          r.mistakeTimer = 0.65;
        }

        // Score each candidate lane for safety & overtaking opportunity
        let bestLane = r.targetLateralOffset;
        let bestScore = -9999;

        for (const lane of candidateLanes) {
          let score = -Math.abs(lane - r.profile.preferredLaneOffset) * 1.2;
          score -= Math.abs(lane - r.lateralOffset) * 0.6;

          // Check civilian traffic ahead within 65m
          for (const tv of traffic) {
            let ds = tv.s - r.s;
            if (ds < -CIRCUIT_LENGTH * 0.5) ds += CIRCUIT_LENGTH;
            if (ds > 0 && ds < 68) {
              const latDist = Math.abs(tv.lateralOffset - lane);
              if (latDist < 2.5) {
                score -= (75 - ds) * 3.5;
              }
            }
          }

          // Check other AI racers ahead within 32m for overtaking
          for (let j = 0; j < this.racers.length; j++) {
            if (i === j) continue;
            const other = this.racers[j];
            let ds = other.s - r.s;
            if (ds < -CIRCUIT_LENGTH * 0.5) ds += CIRCUIT_LENGTH;
            if (ds > -3 && ds < 32) {
              const latDist = Math.abs(other.lateralOffset - lane);
              if (latDist < 2.4) {
                score -= (36 - ds) * 2.2;
              }
            }
          }

          if (score > bestScore) {
            bestScore = score;
            bestLane = lane;
          }
        }

        if (r.mistakeTimer > 0) {
          bestLane = Math.max(-7.2, Math.min(7.2, bestLane + (Math.random() > 0.5 ? 2.4 : -2.4)));
        }

        r.targetLateralOffset = bestLane;
      }

      if (r.mistakeTimer > 0) {
        r.mistakeTimer -= clampedDt;
      }

      // 2. Corner speed target & rubber-banding fairness relative to player
      const baseMaxMs = r.profile.baseTopSpeedKmh / 3.6;
      const upcomingCurvature = Math.max(
        Math.abs(sample.curvature),
        Math.abs(lookaheadSample.curvature)
      );

      // Slow down intelligently for sharp turns (and brake more cautiously on wet asphalt)
      const wetCaution = 1 + (1 - roadFrictionMultiplier) * 0.55;
      const cornerPenalty = Math.min(0.42, upcomingCurvature * 24 * wetCaution);
      let targetSpeedMs = baseMaxMs * (1 - cornerPenalty);

      // Mild competitive rubber-banding so pack stays exciting
      const progressDelta = playerTotalProgress - r.progress.totalProgressMeters;
      if (progressDelta > 85) {
        // AI is behind player -> slight catch-up boost
        targetSpeedMs *= 1.09;
      } else if (progressDelta < -120) {
        // AI is far ahead of player -> ease slightly so player can catch up
        targetSpeedMs *= 0.91;
      }

      if (r.mistakeTimer > 0) {
        targetSpeedMs *= 0.86;
      }

      // 3. Longitudinal acceleration / braking
      const isBraking = r.speedMs > targetSpeedMs + 2.5;
      if (r.speedMs < targetSpeedMs) {
        r.speedMs = Math.min(
          targetSpeedMs,
          r.speedMs + r.profile.acceleration * roadFrictionMultiplier * clampedDt
        );
      } else {
        r.speedMs = Math.max(
          targetSpeedMs,
          r.speedMs - 34 * roadFrictionMultiplier * clampedDt
        );
      }

      // 4. Smooth lane steering (scaled by road friction)
      const latError = r.targetLateralOffset - r.lateralOffset;
      const desiredLatVel = Math.max(-9.5, Math.min(9.5, latError * 2.8));
      r.lateralVelocity +=
        (desiredLatVel - r.lateralVelocity) *
        (1 - Math.exp(-8 * roadFrictionMultiplier * clampedDt));
      r.lateralOffset += r.lateralVelocity * clampedDt;

      const maxLat = ROAD_HALF_WIDTH - 1.25;
      r.lateralOffset = Math.max(-maxLat, Math.min(maxLat, r.lateralOffset));

      // Heading angle reflects lateral movement
      r.headingOffset = Math.atan2(-r.lateralVelocity, Math.max(8, r.speedMs)) * 0.85;

      // Advance along track
      const ds = r.speedMs * Math.cos(r.headingOffset) * clampedDt;
      r.s = (r.s + ds) % CIRCUIT_LENGTH;
      if (r.s < 0) r.s += CIRCUIT_LENGTH;

      r.wheelSpinAngle = (r.wheelSpinAngle + (r.speedMs * clampedDt) / 0.36) % (Math.PI * 200);
      r.model.brakeLightMaterial.emissiveIntensity = isBraking ? 3.5 : 1.1;

      // Update checkpoint & lap progress
      const cpRes = updateCheckpointProgress(
        r.progress,
        prevS,
        r.s,
        checkpointPositionsS,
        totalLaps
      );
      r.progress = cpRes.state;
      if (cpRes.justFinished && r.finishTimeMs === null) {
        r.finishTimeMs = raceTimeMs;
      }

      this.syncRacerTransform(r, road);
    }
  }

  private syncRacerTransform(r: AIRacerInstance, road: RoadSystem): void {
    const { position, sample } = road.trackToWorld(
      r.s,
      r.lateralOffset,
      0,
      r.worldPosition
    );
    r.worldYaw = sample.yaw + r.headingOffset;
    const slopePitch = Math.asin(Math.max(-0.5, Math.min(0.5, sample.tangent.y)));

    r.model.root.position.copy(position);
    r.model.root.rotation.set(slopePitch, r.worldYaw, 0, 'YXZ');

    // Subtle body roll on lane change
    r.model.bodyTiltGroup.rotation.z = -r.headingOffset * 0.35;

    for (const w of r.model.wheels) {
      w.rotation.x = -r.wheelSpinAngle;
    }
  }
}
