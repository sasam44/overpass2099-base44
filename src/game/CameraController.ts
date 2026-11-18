import * as THREE from 'three';
import { PlayerCar } from './PlayerCar';
import { DriftCameraShakeState, computeDriftCameraShake } from './VehiclePhysics';

export class CameraController {
  public readonly camera: THREE.PerspectiveCamera;
  public driftShake: DriftCameraShakeState = {
    intensity: 0,
    lateralOffset: 0,
    verticalOffset: 0,
    rollJitter: 0,
    fovBoost: 0,
  };
  private readonly currentPos = new THREE.Vector3();
  private readonly currentLookAt = new THREE.Vector3();
  private readonly desiredPos = new THREE.Vector3();
  private readonly desiredLookAt = new THREE.Vector3();
  private readonly _lagOffset = new THREE.Vector3();
  private readonly _showcasePos = new THREE.Vector3();
  private readonly _showcaseLookAt = new THREE.Vector3();
  private currentBankAngle = 0;
  private trauma = 0;
  private impactRollKick = 0;
  private impactFovPunch = 0;
  private shakeClock = 0;
  private showcaseAngle = 0.55;
  private initialized = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.25, 4000);
  }

  public addTrauma(amount: number, lateralSign = 1): void {
    this.trauma = Math.min(1.0, this.trauma + amount);
    this.impactRollKick = Math.max(
      -0.14,
      Math.min(0.14, this.impactRollKick + lateralSign * amount * 0.11)
    );
    this.impactFovPunch = Math.min(6.5, this.impactFovPunch + amount * 5.2);
  }

  public snapBehindPlayer(player: PlayerCar): void {
    const yaw = player.worldYaw;
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);

    this.currentPos.set(
      player.worldPosition.x - forwardX * 6.4,
      player.worldPosition.y + 2.35,
      player.worldPosition.z - forwardZ * 6.4
    );
    this.currentLookAt.set(
      player.worldPosition.x + forwardX * 12,
      player.worldPosition.y + 1.15,
      player.worldPosition.z + forwardZ * 12
    );
    this.driftShake = {
      intensity: 0,
      lateralOffset: 0,
      verticalOffset: 0,
      rollJitter: 0,
      fovBoost: 0,
    };
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
    this.initialized = true;
  }

  public updateShowcase(player: PlayerCar, dt: number): void {
    this.showcaseAngle += dt * 0.25;
    const sway = Math.sin(this.showcaseAngle) * 0.75;
    const camX = player.worldPosition.x - 1.85 + sway;
    const camZ = player.worldPosition.z + 5.2;
    const camY = player.worldPosition.y + 1.88;

    const damp = 1 - Math.exp(-8 * dt);
    this._showcasePos.set(camX, camY, camZ);
    this.currentPos.lerp(this._showcasePos, damp);
    // Look to the left of the car so the car projects onto the right 60% of the screen, completely clear of the left menu card
    this._showcaseLookAt.set(
      player.worldPosition.x - 2.65,
      player.worldPosition.y + 0.92,
      player.worldPosition.z - 6.0
    );
    this.currentLookAt.lerp(this._showcaseLookAt, damp);

    if (Math.abs(this.camera.fov - 54) > 0.2) {
      this.camera.fov += (54 - this.camera.fov) * damp;
      this.camera.updateProjectionMatrix();
    }

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }

  public updateGameplay(player: PlayerCar, dt: number): void {
    if (!this.initialized) {
      this.snapBehindPlayer(player);
    }

    const clampedDt = Math.min(Math.max(dt, 0.0001), 0.25);
    const speedKmh = Math.abs(player.state.speedMs * 3.6);
    const speedRatio = Math.min(1.15, speedKmh / 290);
    const nitroFactor = player.state.nitroBlurIntensity;

    // Advance high-frequency camera vibration clock and evaluate drift shake state
    this.shakeClock += clampedDt * 45;
    this.driftShake = computeDriftCameraShake(
      this.driftShake.intensity,
      player.state.drifting,
      player.state.speedMs,
      player.state.lateralVelocity,
      this.shakeClock,
      clampedDt
    );

    // Camera distance & height adjust smoothly with speed so the car stays framed like the reference screenshot
    const followDistance = 5.45 + speedRatio * 0.75 + nitroFactor * 0.55;
    const followHeight = 2.02 + speedRatio * 0.14 - nitroFactor * 0.06;

    const yaw = player.worldYaw;
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    // Subtle lateral shift during turns so the player sees around the corner
    const turnShift = -player.state.steerAngle * 1.15;

    this.desiredPos.set(
      player.worldPosition.x - forwardX * followDistance + rightX * turnShift,
      player.worldPosition.y + followHeight,
      player.worldPosition.z - forwardZ * followDistance + rightZ * turnShift
    );

    this.desiredLookAt.set(
      player.worldPosition.x + forwardX * 14 + rightX * (turnShift * 0.5),
      player.worldPosition.y + 1.12,
      player.worldPosition.z + forwardZ * 14 + rightZ * (turnShift * 0.5)
    );

    const posDamp = 1 - Math.exp(-22 * clampedDt);
    const lookDamp = 1 - Math.exp(-26 * clampedDt);

    this.currentPos.lerp(this.desiredPos, posDamp);
    this.currentLookAt.lerp(this.desiredLookAt, lookDamp);

    // Hard tether so the camera never lags behind the car at high speed or during software GL frame steps
    this._lagOffset.copy(this.currentPos).sub(this.desiredPos);
    if (this._lagOffset.length() > 0.85) {
      this._lagOffset.setLength(0.85);
      this.currentPos.copy(this.desiredPos).add(this._lagOffset);
    }

    // Prevent camera from ever dipping below road deck
    if (this.currentPos.y < player.worldPosition.y + 1.25) {
      this.currentPos.y = player.worldPosition.y + 1.25;
    }

    // Dynamic FOV widening at high speed, nitro boost warp, drift speed-sense boost & collision FOV punch
    this.impactFovPunch = Math.max(0, this.impactFovPunch - clampedDt * 18);
    const targetFov =
      60 +
      speedRatio * 11 +
      nitroFactor * 10.5 +
      this.driftShake.fovBoost -
      this.impactFovPunch;
    if (Math.abs(targetFov - this.camera.fov) > 0.08) {
      this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-12 * clampedDt));
      this.camera.updateProjectionMatrix();
    }

    // Apply decaying trauma^2 shake on collisions + nitro vibration + subtle tire-scrub shake when drifting is true
    const shakeMag = this.trauma * this.trauma;
    this.trauma = Math.max(0, this.trauma - clampedDt * 2.1);
    const nitroBuzz = nitroFactor * 0.022;

    const lateralShake =
      Math.sin(this.shakeClock * 1.9) * shakeMag * 0.42 +
      Math.sin(this.shakeClock * 3.8) * nitroBuzz +
      this.driftShake.lateralOffset;
    const verticalShake =
      Math.cos(this.shakeClock * 2.5) * shakeMag * 0.32 +
      Math.cos(this.shakeClock * 4.5) * nitroBuzz * 0.8 +
      this.driftShake.verticalOffset;

    this.camera.position.set(
      this.currentPos.x + rightX * lateralShake,
      this.currentPos.y + verticalShake,
      this.currentPos.z + rightZ * lateralShake
    );
    this.camera.lookAt(this.currentLookAt);

    // Subtle camera horizon banking into turns + decaying collision roll kick + drift roll micro-shudder
    this.impactRollKick *= Math.exp(-11 * clampedDt);
    const targetBank = -player.state.steerAngle * Math.min(1, speedKmh / 140) * 0.065;
    this.currentBankAngle += (targetBank - this.currentBankAngle) * (1 - Math.exp(-10 * clampedDt));
    this.camera.rotation.z +=
      this.currentBankAngle + this.impactRollKick + this.driftShake.rollJitter;
  }
}
