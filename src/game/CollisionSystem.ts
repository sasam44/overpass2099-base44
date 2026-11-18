import * as THREE from 'three';
import { CIRCUIT_LENGTH, ROAD_HALF_WIDTH } from './types';
import { PlayerCar } from './PlayerCar';
import { AIRacerInstance } from './RacingAI';
import { TrafficVehicle } from './TrafficManager';

export interface CollisionEvents {
  playerHitVehicle: boolean;
  playerHitBarrier: boolean;
  impactIntensity: number; // 0..1
  lateralImpactSign: number; // -1 left, +1 right
}

function signedTrackDistance(sA: number, sB: number): number {
  let d = sA - sB;
  if (d > CIRCUIT_LENGTH * 0.5) d -= CIRCUIT_LENGTH;
  if (d < -CIRCUIT_LENGTH * 0.5) d += CIRCUIT_LENGTH;
  return d;
}

export class CollisionSystem {
  public collisionsCount = 0;
  private cooldownTimer = 0;
  private readonly _impactWorldPos = new THREE.Vector3();

  public reset(): void {
    this.collisionsCount = 0;
    this.cooldownTimer = 0;
  }

  public resolveCollisions(
    dt: number,
    player: PlayerCar,
    aiRacers: AIRacerInstance[],
    traffic: TrafficVehicle[]
  ): CollisionEvents {
    if (this.cooldownTimer > 0) {
      this.cooldownTimer = Math.max(0, this.cooldownTimer - dt);
    }

    const events: CollisionEvents = {
      playerHitVehicle: false,
      playerHitBarrier: player.state.hitBoundary,
      impactIntensity: player.state.hitBoundary
        ? Math.min(1, Math.max(0.35, player.state.boundaryImpactSpeed / 22))
        : 0,
      lateralImpactSign: player.state.lateralOffset >= 0 ? 1 : -1,
    };

    const playerHalfLen = 2.2;
    const playerHalfWid = 1.02;

    // 1. Player vs Civilian Traffic
    for (const tv of traffic) {
      const ds = signedTrackDistance(player.state.s, tv.s);
      const dLat = player.state.lateralOffset - tv.lateralOffset;
      const minS = playerHalfLen + tv.halfLength;
      const minLat = playerHalfWid + tv.halfWidth;

      if (Math.abs(ds) < minS && Math.abs(dLat) < minLat) {
        const overlapS = minS - Math.abs(ds);
        const overlapLat = minLat - Math.abs(dLat);

        const relSpeed = Math.abs(player.state.speedMs - tv.currentSpeedMs);
        const intensity = Math.min(1, Math.max(0.38, relSpeed / 28));
        const pushSign = dLat >= 0 ? 1 : -1;

        if (overlapS < overlapLat) {
          // Longitudinal rear-end or front bump
          if (ds < 0) {
            // Player hit rear of traffic vehicle ahead
            player.state.s = (tv.s - minS - 0.15 + CIRCUIT_LENGTH) % CIRCUIT_LENGTH;
            player.state.speedMs = Math.min(player.state.speedMs * 0.55, tv.currentSpeedMs * 0.90);
            tv.currentSpeedMs = Math.min(44, tv.currentSpeedMs + 7);
          } else {
            // Traffic behind bumped player
            player.state.s = (tv.s + minS + 0.15) % CIRCUIT_LENGTH;
            player.state.speedMs = Math.max(player.state.speedMs, tv.currentSpeedMs + 4);
          }
          // Nudge player laterally & apply angular yaw jolt
          player.state.lateralVelocity += pushSign * 5.2;
          player.state.headingOffset += -pushSign * 0.11 * intensity;
        } else {
          // Side-by-side impact
          player.state.lateralOffset += pushSign * (overlapLat * 0.78 + 0.10);
          tv.lateralOffset -= pushSign * (overlapLat * 0.28);
          player.state.lateralVelocity = pushSign * 5.4;
          player.state.headingOffset += -pushSign * 0.08 * intensity;
          player.state.speedMs *= 0.84;
        }

        const maxLat = ROAD_HALF_WIDTH - 1.15;
        player.state.lateralOffset = Math.max(-maxLat, Math.min(maxLat, player.state.lateralOffset));

        events.playerHitVehicle = true;
        events.impactIntensity = Math.max(events.impactIntensity, intensity);
        events.lateralImpactSign = -pushSign;

        this._impactWorldPos
          .copy(player.worldPosition)
          .lerp(tv.worldPosition, 0.45);
        player.spawnSparkBurst(
          this._impactWorldPos,
          24,
          intensity,
          -pushSign * 0.85,
          ds < 0 ? -1.4 : 1.2
        );

        if (this.cooldownTimer <= 0) {
          this.collisionsCount += 1;
          this.cooldownTimer = 0.40;
        }
      }
    }

    // 2. Player vs AI Racing Opponents
    for (const ai of aiRacers) {
      const ds = signedTrackDistance(player.state.s, ai.s);
      const dLat = player.state.lateralOffset - ai.lateralOffset;
      const minS = 4.35;
      const minLat = 2.02;

      if (Math.abs(ds) < minS && Math.abs(dLat) < minLat) {
        const overlapS = minS - Math.abs(ds);
        const overlapLat = minLat - Math.abs(dLat);
        const relSpeed = Math.abs(player.state.speedMs - ai.speedMs) + 8;
        const intensity = Math.min(1, Math.max(0.32, relSpeed / 32));
        const pushSign = dLat >= 0 ? 1 : -1;

        if (overlapS < overlapLat) {
          if (ds < 0) {
            player.state.s = (ai.s - minS - 0.1 + CIRCUIT_LENGTH) % CIRCUIT_LENGTH;
            const avg = (player.state.speedMs + ai.speedMs) * 0.5;
            player.state.speedMs = avg * 0.86;
            ai.speedMs = avg * 1.08;
          } else {
            ai.s = (player.state.s - minS - 0.1 + CIRCUIT_LENGTH) % CIRCUIT_LENGTH;
            const avg = (player.state.speedMs + ai.speedMs) * 0.5;
            player.state.speedMs = avg * 1.06;
            ai.speedMs = avg * 0.86;
          }
          player.state.headingOffset += -pushSign * 0.08 * intensity;
        } else {
          player.state.lateralOffset += pushSign * overlapLat * 0.58;
          ai.lateralOffset -= pushSign * overlapLat * 0.58;
          player.state.lateralVelocity = pushSign * 4.4;
          ai.lateralVelocity = -pushSign * 4.4;
          player.state.headingOffset += -pushSign * 0.07 * intensity;
          player.state.speedMs *= 0.91;
        }

        const maxLat = ROAD_HALF_WIDTH - 1.15;
        player.state.lateralOffset = Math.max(-maxLat, Math.min(maxLat, player.state.lateralOffset));
        ai.lateralOffset = Math.max(-maxLat, Math.min(maxLat, ai.lateralOffset));

        events.playerHitVehicle = true;
        events.impactIntensity = Math.max(events.impactIntensity, intensity);
        events.lateralImpactSign = -pushSign;

        this._impactWorldPos
          .copy(player.worldPosition)
          .lerp(ai.worldPosition, 0.45);
        player.spawnSparkBurst(
          this._impactWorldPos,
          20,
          intensity,
          -pushSign * 0.85,
          ds < 0 ? -1.3 : 1.1
        );

        if (this.cooldownTimer <= 0) {
          this.collisionsCount += 1;
          this.cooldownTimer = 0.40;
        }
      }
    }

    // 3. AI Opponents vs Civilian Traffic (keep AI from driving through traffic)
    for (const ai of aiRacers) {
      for (const tv of traffic) {
        const ds = signedTrackDistance(ai.s, tv.s);
        const dLat = ai.lateralOffset - tv.lateralOffset;
        const minS = 2.2 + tv.halfLength;
        const minLat = 1.0 + tv.halfWidth;

        if (Math.abs(ds) < minS && Math.abs(dLat) < minLat) {
          const pushSign = dLat >= 0 ? 1 : -1;
          ai.lateralOffset += pushSign * 1.2;
          ai.speedMs = Math.min(ai.speedMs, tv.currentSpeedMs * 0.95);
        }
      }
    }

    return events;
  }
}
