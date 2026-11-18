import { CarSpec, CIRCUIT_LENGTH, DISTRICT_ZONES, DistrictZone, ROAD_HALF_WIDTH } from './types';

export interface VehicleControlInput {
  throttle: number;   // 0..1
  brake: number;      // 0..1 (also reverse when stopped)
  steer: number;      // -1 (right) .. +1 (left)
  handbrake: boolean;
  nitro: boolean;
}

export interface VehiclePhysicsState {
  s: number;               // Distance along track centerline [0, CIRCUIT_LENGTH)
  lateralOffset: number;   // Offset from centerline in meters (-left, +right)
  headingOffset: number;   // Angle relative to track forward direction (radians)
  speedMs: number;         // Forward speed in m/s (negative = reverse)
  lateralVelocity: number; // Drift/slip velocity in m/s
  steerAngle: number;      // Smoothed front-wheel steering angle (radians)
  nitroAmount: number;     // 0..100
  nitroActive: boolean;
  nitroBlurIntensity: number; // 0..1 smoothed screen-space motion blur intensity
  drifting: boolean;
  gear: string;            // 'R', 'N', '1'..'6'
  rpm: number;             // 1000..10000
  pitchAngle: number;      // Suspension pitch (accel/brake)
  rollAngle: number;       // Suspension body roll (steering)
  wheelSpinAngle: number;  // Cumulative wheel rotation in radians
  hitBoundary: boolean;    // True if scraped/bounced off guardrail this step
  boundaryImpactSpeed: number;
  odometerMeters: number;
}

export function createInitialPhysicsState(
  startS = 0,
  lateralOffset = 0
): VehiclePhysicsState {
  return {
    s: ((startS % CIRCUIT_LENGTH) + CIRCUIT_LENGTH) % CIRCUIT_LENGTH,
    lateralOffset,
    headingOffset: 0,
    speedMs: 0,
    lateralVelocity: 0,
    steerAngle: 0,
    nitroAmount: 100,
    nitroActive: false,
    nitroBlurIntensity: 0,
    drifting: false,
    gear: '1',
    rpm: 1200,
    pitchAngle: 0,
    rollAngle: 0,
    wheelSpinAngle: 0,
    hitBoundary: false,
    boundaryImpactSpeed: 0,
    odometerMeters: 0,
  };
}

export function computeNitroMotionBlurIntensity(
  currentIntensity: number,
  nitroActive: boolean,
  speedMs: number,
  topSpeedKmh: number,
  dt: number
): number {
  const clampedDt = Math.min(Math.max(dt, 0.0001), 0.1);
  const speedKmh = Math.max(0, speedMs * 3.6);
  const speedRatio = Math.min(1.25, speedKmh / Math.max(150, topSpeedKmh));
  const target = nitroActive ? Math.min(1.0, 0.68 + speedRatio * 0.32) : 0.0;
  // Fast attack when nitro engages, smooth decay when released
  const rate = nitroActive ? 10.5 : 5.5;
  const nextVal = currentIntensity + (target - currentIntensity) * (1 - Math.exp(-rate * clampedDt));
  return nextVal < 0.001 && !nitroActive ? 0 : Math.max(0, Math.min(1, nextVal));
}

export interface DriftCameraShakeState {
  intensity: number;       // 0..1 smoothed envelope triggered when drifting is true
  lateralOffset: number;   // Subtle camera-right shake offset in meters
  verticalOffset: number;  // Subtle camera-up road-scrub vibration in meters
  rollJitter: number;      // Subtle horizon roll shudder in radians
  fovBoost: number;        // Subtle FOV widening in degrees to heighten sense of speed
}

export function computeDriftCameraShake(
  currentIntensity: number,
  drifting: boolean,
  speedMs: number,
  lateralVelocity: number,
  shakeClock: number,
  dt: number
): DriftCameraShakeState {
  const clampedDt = Math.min(Math.max(dt, 0.0001), 0.1);
  const speedKmh = Math.abs(speedMs * 3.6);
  const slipRatio = Math.min(1.0, Math.abs(lateralVelocity) / 14.0);
  const speedScale = Math.min(1.15, Math.max(0.35, speedKmh / 210));
  const target = drifting
    ? Math.min(1.0, 0.55 * speedScale + 0.45 * slipRatio)
    : 0.0;

  // Responsive attack when drifting starts, smooth decay when tires regain grip
  const rate = drifting ? 14.0 : 9.5;
  const rawNext =
    currentIntensity + (target - currentIntensity) * (1 - Math.exp(-rate * clampedDt));
  const intensity = rawNext < 0.001 && !drifting ? 0 : Math.max(0, Math.min(1, rawNext));

  if (intensity === 0) {
    return {
      intensity: 0,
      lateralOffset: 0,
      verticalOffset: 0,
      rollJitter: 0,
      fovBoost: 0,
    };
  }

  // Multi-harmonic tire-scrub vibration (incommensurate frequencies for tactile road feel)
  const waveLat =
    Math.sin(shakeClock * 2.7) * 0.65 + Math.cos(shakeClock * 5.3) * 0.35;
  const waveVert =
    Math.cos(shakeClock * 3.9) * 0.6 + Math.sin(shakeClock * 7.1) * 0.4;
  const waveRoll =
    Math.sin(shakeClock * 3.1 + 0.8) * 0.7 + Math.cos(shakeClock * 6.4) * 0.3;

  return {
    intensity,
    lateralOffset: waveLat * intensity * 0.068,
    verticalOffset: waveVert * intensity * 0.046,
    rollJitter: waveRoll * intensity * 0.012,
    fovBoost: intensity * 2.4,
  };
}

export function computeGearAndRpm(speedMs: number, topSpeedKmh: number): { gear: string; rpm: number } {
  const speedKmh = speedMs * 3.6;
  if (speedKmh < -1.5) {
    const revRpm = Math.min(8500, 1800 + Math.abs(speedKmh) * 110);
    return { gear: 'R', rpm: Math.round(revRpm) };
  }
  if (Math.abs(speedKmh) < 1.5) {
    return { gear: '1', rpm: 1200 };
  }

  const normalized = Math.max(0, Math.min(1.15, speedKmh / topSpeedKmh));
  const gearThresholds = [0, 0.16, 0.32, 0.50, 0.68, 0.85, 1.2];
  let gearNum = 1;
  for (let g = 1; g <= 6; g++) {
    if (normalized >= gearThresholds[g - 1] && normalized < gearThresholds[g]) {
      gearNum = g;
      break;
    }
  }
  const low = gearThresholds[gearNum - 1];
  const high = gearThresholds[gearNum];
  const gearFrac = Math.max(0, Math.min(1, (normalized - low) / Math.max(0.05, high - low)));
  const rpm = Math.round(3200 + gearFrac * 6300);
  return {
    gear: String(gearNum),
    rpm: Math.min(9800, Math.max(1200, rpm)),
  };
}

export function stepVehiclePhysics(
  state: VehiclePhysicsState,
  input: VehicleControlInput,
  carSpec: CarSpec,
  trackCurvature: number,
  rawDt: number,
  roadFrictionMultiplier = 1.0
): VehiclePhysicsState {
  const dt = Math.min(Math.max(rawDt, 0.0001), 0.05);
  const friction = Math.max(0.45, Math.min(1.2, roadFrictionMultiplier));
  const next: VehiclePhysicsState = { ...state, hitBoundary: false, boundaryImpactSpeed: 0 };

  const baseMaxSpeedMs = carSpec.topSpeedKmh / 3.6;
  const nitroExtraMs = carSpec.nitroBoostKmh / 3.6;
  const maxReverseSpeedMs = -18; // ~65 km/h reverse

  // Nitro logic: requires forward throttle, forward speed > 6 m/s, and nitro fuel > 1
  const wantsNitro = input.nitro && input.throttle > 0.1 && next.speedMs > 6 && next.nitroAmount > 1;
  next.nitroActive = wantsNitro;

  if (next.nitroActive) {
    const drainRate = 100 / Math.max(1.5, carSpec.nitroCapacity);
    next.nitroAmount = Math.max(0, next.nitroAmount - drainRate * dt);
    if (next.nitroAmount <= 0.5) {
      next.nitroActive = false;
    }
  } else {
    // Passive recharge + bonus recharge when drifting
    const rechargeRate = next.drifting ? 14 : 6.5;
    next.nitroAmount = Math.min(100, next.nitroAmount + rechargeRate * dt);
  }

  const effectiveMaxSpeedMs = next.nitroActive ? baseMaxSpeedMs + nitroExtraMs : baseMaxSpeedMs;

  // Longitudinal acceleration / braking / reverse (scaled by road surface traction)
  const tractionFactor = 0.72 + 0.28 * friction;
  const brakingGripFactor = 0.55 + 0.45 * friction;
  let accelMs2 = 0;

  if (input.throttle > 0 && next.speedMs >= -0.5) {
    // Forward acceleration tapers gently as we approach top speed
    const speedRatio = Math.max(0, next.speedMs / effectiveMaxSpeedMs);
    const powerCurve = Math.max(0.18, 1 - Math.pow(speedRatio, 1.8) * 0.72);
    const nitroMult = next.nitroActive ? 1.55 : 1.0;
    accelMs2 += input.throttle * carSpec.acceleration * powerCurve * nitroMult * tractionFactor;
  }

  if (input.brake > 0) {
    if (next.speedMs > 1.2) {
      // Disc braking scaled by road friction (wet roads lengthen stopping distance)
      accelMs2 -= input.brake * 44 * brakingGripFactor;
    } else {
      // Engage reverse
      accelMs2 -= input.brake * 16 * tractionFactor;
    }
  } else if (input.throttle > 0 && next.speedMs < -0.5) {
    // Braking while reversing
    accelMs2 += input.throttle * 38 * brakingGripFactor;
  }

  // Handbrake drag
  if (input.handbrake) {
    if (Math.abs(next.speedMs) > 0.8) {
      accelMs2 -= Math.sign(next.speedMs) * 24 * brakingGripFactor;
    } else {
      next.speedMs = 0;
    }
  }

  // Aerodynamic drag & rolling resistance
  const rollingDrag = 3.2;
  const aeroDrag = 0.0022 * next.speedMs * Math.abs(next.speedMs);
  if (Math.abs(input.throttle) < 0.05 && Math.abs(input.brake) < 0.05) {
    if (Math.abs(next.speedMs) > 0.4) {
      accelMs2 -= Math.sign(next.speedMs) * rollingDrag;
    } else {
      next.speedMs = 0;
    }
  }
  accelMs2 -= aeroDrag;

  // Integrate forward speed
  next.speedMs += accelMs2 * dt;
  next.speedMs = Math.max(maxReverseSpeedMs, Math.min(effectiveMaxSpeedMs, next.speedMs));

  // Smooth screen-space motion blur intensity driven by Nitro Boost & velocity
  next.nitroBlurIntensity = computeNitroMotionBlurIntensity(
    state.nitroBlurIntensity,
    next.nitroActive,
    next.speedMs,
    carSpec.topSpeedKmh,
    dt
  );

  // Speed-dependent steering with arcade cornering precision
  const absSpeed = Math.abs(next.speedMs);
  const speedFactor = Math.min(1, absSpeed / 6.5); // Needs movement to turn
  const highSpeedDamping = 1 / (1 + (absSpeed / 78) * 0.38); // Preserves crisp steering authority at high speed
  const targetSteer = input.steer * 0.52 * highSpeedDamping;
  const steerLerp = 1 - Math.exp(-15 * dt);
  next.steerAngle += (targetSteer - next.steerAngle) * steerLerp;

  const reverseSign = next.speedMs >= -0.1 ? 1 : -1;
  const turnRate = next.steerAngle * carSpec.handling * speedFactor * reverseSign;

  // Handbrake & wet-surface high-speed cornering drift
  const wetDriftInduced =
    friction < 0.88 && absSpeed > 26 && Math.abs(input.steer) > 0.68;
  next.drifting =
    (input.handbrake && absSpeed > 14 && Math.abs(input.steer) > 0.15) ||
    wetDriftInduced;
  const driftYawBoost = next.drifting ? 1.38 : 1.0;

  // Update heading relative to road tangent (arcade corner-assist scales curvature so turns feel smooth and natural)
  const forwardAdvance = next.speedMs * Math.cos(next.headingOffset) * dt;
  const effectiveCurvature = trackCurvature * 0.68;
  next.headingOffset += (turnRate * driftYawBoost) * dt - effectiveCurvature * forwardAdvance;

  // Self-aligning torque so the car naturally straightens along the lane when not steering
  if (Math.abs(input.steer) < 0.05 && absSpeed > 2) {
    next.headingOffset *= Math.exp(-3.2 * friction * dt);
  }
  // Clamp heading offset to [-1.25, 1.25] rad (~71 deg) to prevent full spin-outs locking the player backwards
  next.headingOffset = Math.max(-1.25, Math.min(1.25, next.headingOffset));

  // Lateral movement across the road width
  // Note: In track coordinates, +steer is left (negative lateralOffset), -steer is right (positive lateralOffset)
  // On wet/low-friction roads, centrifugal slip pushes the car slightly wider on fast curves
  const centrifugalWetSlip =
    (1 - friction) * trackCurvature * next.speedMs * Math.abs(next.speedMs) * 0.22;
  const desiredLateralVel = -next.speedMs * Math.sin(next.headingOffset) + centrifugalWetSlip;
  const baseGripFactor = next.drifting ? 3.6 : 12.0;
  const gripFactor = baseGripFactor * Math.pow(friction, 1.45);
  next.lateralVelocity += (desiredLateralVel - next.lateralVelocity) * (1 - Math.exp(-gripFactor * dt));

  next.lateralOffset += next.lateralVelocity * dt;

  // Advance distance along road spline
  next.s = (next.s + forwardAdvance) % CIRCUIT_LENGTH;
  if (next.s < 0) next.s += CIRCUIT_LENGTH;
  if (forwardAdvance > 0) {
    next.odometerMeters += forwardAdvance;
  }

  // Road guardrail boundaries (car half-width ~ 1.05m -> max lateral offset = ROAD_HALF_WIDTH - 1.15m)
  const maxLateral = ROAD_HALF_WIDTH - 1.15;
  if (next.lateralOffset > maxLateral) {
    const excess = next.lateralOffset - maxLateral;
    next.lateralOffset = maxLateral;
    if (next.lateralVelocity > 0) {
      next.boundaryImpactSpeed = Math.abs(next.lateralVelocity) + Math.abs(next.speedMs) * 0.18;
      next.lateralVelocity = -next.lateralVelocity * 0.35 - 1.8;
      next.speedMs *= Math.max(0.76, 1 - Math.min(0.24, excess * 0.12));
      next.headingOffset *= 0.45;
      next.hitBoundary = true;
    }
  } else if (next.lateralOffset < -maxLateral) {
    const excess = -maxLateral - next.lateralOffset;
    next.lateralOffset = -maxLateral;
    if (next.lateralVelocity < 0) {
      next.boundaryImpactSpeed = Math.abs(next.lateralVelocity) + Math.abs(next.speedMs) * 0.18;
      next.lateralVelocity = -next.lateralVelocity * 0.35 + 1.8;
      next.speedMs *= Math.max(0.76, 1 - Math.min(0.24, excess * 0.12));
      next.headingOffset *= 0.45;
      next.hitBoundary = true;
    }
  }

  // Suspension body movement (pitch from longitudinal accel, roll from steering)
  const targetPitch = Math.max(-0.045, Math.min(0.055, -accelMs2 * 0.0014));
  const targetRoll = Math.max(-0.075, Math.min(0.075, next.steerAngle * (absSpeed / 45) * 0.16));
  const suspLerp = 1 - Math.exp(-10 * dt);
  next.pitchAngle += (targetPitch - next.pitchAngle) * suspLerp;
  next.rollAngle += (targetRoll - next.rollAngle) * suspLerp;

  // Wheel rotation
  const wheelRadius = 0.36;
  next.wheelSpinAngle = (next.wheelSpinAngle + (next.speedMs * dt) / wheelRadius) % (Math.PI * 200);

  // Gear and RPM
  const { gear, rpm } = computeGearAndRpm(next.speedMs, carSpec.topSpeedKmh);
  next.gear = gear;
  next.rpm = rpm;

  return next;
}

export function getDistrictAtS(s: number): DistrictZone {
  const normS = ((s % CIRCUIT_LENGTH) + CIRCUIT_LENGTH) % CIRCUIT_LENGTH;
  for (const zone of DISTRICT_ZONES) {
    if (normS >= zone.startS && normS < zone.endS) {
      return zone;
    }
  }
  return DISTRICT_ZONES[0];
}

export interface CheckpointProgressState {
  lap: number;                // 1..totalLaps
  nextCheckpointIndex: number;// 0..(totalCheckpoints - 1)
  totalProgressMeters: number;
  finished: boolean;
}

export function updateCheckpointProgress(
  prev: CheckpointProgressState,
  prevS: number,
  currentS: number,
  checkpointPositionsS: number[],
  totalLaps: number
): { state: CheckpointProgressState; crossedCheckpoint: boolean; completedLap: boolean; justFinished: boolean } {
  if (prev.finished) {
    return { state: prev, crossedCheckpoint: false, completedLap: false, justFinished: false };
  }

  const next: CheckpointProgressState = { ...prev };
  let crossedCheckpoint = false;
  let completedLap = false;
  let justFinished = false;

  const totalCheckpoints = checkpointPositionsS.length;
  const targetCpS = checkpointPositionsS[next.nextCheckpointIndex];

  // 1. Check if car crossed or passed intermediate checkpoints (1 .. totalCheckpoints - 1)
  if (next.nextCheckpointIndex > 0) {
    const crossedStep =
      prevS < targetCpS &&
      currentS >= targetCpS &&
      currentS - prevS < CIRCUIT_LENGTH * 0.45;
    // Also catch-up if currentS is already past targetCpS in the forward sector (prevents ever getting stuck on a checkpoint)
    const passedInSector =
      currentS >= targetCpS &&
      currentS - targetCpS < CIRCUIT_LENGTH * 0.35 &&
      prevS >= targetCpS - 120;

    if (crossedStep || passedInSector) {
      crossedCheckpoint = true;
      next.nextCheckpointIndex = (next.nextCheckpointIndex + 1) % totalCheckpoints;
    }
  }

  // 2. Check if car crossed the Finish Line (wrapping around from end of circuit > 70% to start < 30%)
  const wrappedForwardAcrossZero =
    prevS > CIRCUIT_LENGTH * 0.65 && currentS < CIRCUIT_LENGTH * 0.35;

  if (wrappedForwardAcrossZero && (next.nextCheckpointIndex === 0 || next.nextCheckpointIndex >= Math.floor(totalCheckpoints * 0.5))) {
    crossedCheckpoint = true;
    completedLap = true;
    if (next.lap >= totalLaps) {
      next.finished = true;
      justFinished = true;
    } else {
      next.lap += 1;
      next.nextCheckpointIndex = 1;
    }
  }

  // 3. Compute continuous totalProgressMeters for accurate 1st..7th position ranking
  // Guard against a car near the start line (nextCheckpointIndex === 1) wrapping slightly behind s=0 to s~2399
  let effectiveLapS = currentS;
  if (next.nextCheckpointIndex === 1 && currentS > CIRCUIT_LENGTH * 0.75) {
    effectiveLapS = currentS - CIRCUIT_LENGTH;
  }

  next.totalProgressMeters = (next.lap - 1) * CIRCUIT_LENGTH + effectiveLapS;
  if (next.finished) {
    next.totalProgressMeters = totalLaps * CIRCUIT_LENGTH + currentS;
  }

  return { state: next, crossedCheckpoint, completedLap, justFinished };
}

export function rankRacers<T extends { id: string; totalProgress: number; finishTimeMs: number | null }>(
  racers: T[]
): Array<T & { position: number }> {
  const sorted = [...racers].sort((a, b) => {
    if (a.finishTimeMs !== null && b.finishTimeMs !== null) {
      return a.finishTimeMs - b.finishTimeMs;
    }
    if (a.finishTimeMs !== null) return -1;
    if (b.finishTimeMs !== null) return 1;
    return b.totalProgress - a.totalProgress;
  });

  return sorted.map((r, idx) => ({
    ...r,
    position: idx + 1,
  }));
}
