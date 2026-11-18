import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialPhysicsState,
  stepVehiclePhysics,
  computeDriftCameraShake,
  getDistrictAtS,
  updateCheckpointProgress,
  rankRacers,
} from './VehiclePhysics';
import { PLAYABLE_CARS, CIRCUIT_LENGTH } from './types';
import {
  detectCloseCallWithTraffic,
  generateProceduralCommentaryLine,
} from './RaceCommentarySystem';

test('Vehicle accelerates forward under throttle and shifts gears cleanly', () => {
  const car = PLAYABLE_CARS[0];
  let state = createInitialPhysicsState(100, 0);

  for (let i = 0; i < 60; i++) {
    state = stepVehiclePhysics(
      state,
      { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false },
      car,
      0,
      1 / 60
    );
  }

  assert.ok(state.speedMs > 15, `Expected speedMs > 15 after 1s throttle, got ${state.speedMs}`);
  assert.ok(state.s > 105, `Expected vehicle to advance along track s, got ${state.s}`);
  assert.ok(Number(state.gear) >= 1, `Expected forward gear >= 1, got ${state.gear}`);
});

test('Nitro boost increases speed and consumes nitro fuel', () => {
  const car = PLAYABLE_CARS[1];
  let withoutNitro = createInitialPhysicsState(200, 0);
  withoutNitro.speedMs = 45;

  let withNitro = createInitialPhysicsState(200, 0);
  withNitro.speedMs = 45;

  for (let i = 0; i < 30; i++) {
    withoutNitro = stepVehiclePhysics(
      withoutNitro,
      { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false },
      car,
      0,
      1 / 60
    );
    withNitro = stepVehiclePhysics(
      withNitro,
      { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: true },
      car,
      0,
      1 / 60
    );
  }

  assert.ok(withNitro.speedMs > withoutNitro.speedMs, 'Nitro should yield higher speed');
  assert.ok(withNitro.nitroAmount < 100, 'Nitro fuel should deplete while active');
  assert.equal(withNitro.nitroActive, true);
  assert.ok(
    withNitro.nitroBlurIntensity > 0.75,
    `Expected nitroBlurIntensity > 0.75 during nitro boost, got ${withNitro.nitroBlurIntensity}`
  );
  assert.equal(
    withoutNitro.nitroBlurIntensity,
    0,
    'Car without nitro should keep nitroBlurIntensity at 0'
  );

  // Release nitro and verify smooth decay of nitroBlurIntensity
  const peakBlur = withNitro.nitroBlurIntensity;
  for (let i = 0; i < 20; i++) {
    withNitro = stepVehiclePhysics(
      withNitro,
      { throttle: 1, brake: 0, steer: 0, handbrake: false, nitro: false },
      car,
      0,
      1 / 60
    );
  }
  assert.ok(
    withNitro.nitroBlurIntensity < peakBlur * 0.4,
    `Expected nitroBlurIntensity to decay smoothly after releasing nitro, got ${withNitro.nitroBlurIntensity}`
  );
});

test('Braking slows car and engages reverse gear when stopped', () => {
  const car = PLAYABLE_CARS[0];
  let state = createInitialPhysicsState(50, 0);
  state.speedMs = 10;

  for (let i = 0; i < 90; i++) {
    state = stepVehiclePhysics(
      state,
      { throttle: 0, brake: 1, steer: 0, handbrake: false, nitro: false },
      car,
      0,
      1 / 60
    );
  }

  assert.ok(state.speedMs < -1, `Expected vehicle to enter reverse, got ${state.speedMs}`);
  assert.equal(state.gear, 'R');
});

test('Road guardrail boundaries prevent car from leaving the road and reduce speed', () => {
  const car = PLAYABLE_CARS[0];
  let state = createInitialPhysicsState(300, 7.6);
  state.speedMs = 40;
  state.headingOffset = -0.35; // Aimed toward right guardrail

  let hitDetected = false;
  for (let i = 0; i < 20; i++) {
    state = stepVehiclePhysics(
      state,
      { throttle: 1, brake: 0, steer: -1, handbrake: false, nitro: false },
      car,
      0,
      1 / 60
    );
    if (state.hitBoundary) hitDetected = true;
  }

  assert.equal(hitDetected, true, 'Should detect guardrail boundary collision');
  assert.ok(state.lateralOffset <= 7.86, `Car must remain within road boundary, got ${state.lateralOffset}`);
});

test('Checkpoint progression, multi-lap position ranking, and final-lap race finish work accurately', () => {
  const checkpoints = [0, 900, 1800, 2700];
  let progress = {
    lap: 1,
    nextCheckpointIndex: 1,
    totalProgressMeters: 8,
    finished: false,
  };

  // Cross CP 1 (900m)
  let res = updateCheckpointProgress(progress, 890, 910, checkpoints, 2);
  assert.equal(res.crossedCheckpoint, true);
  assert.equal(res.state.nextCheckpointIndex, 2);

  // Cross CP 2 (1800m)
  res = updateCheckpointProgress(res.state, 1790, 1810, checkpoints, 2);
  assert.equal(res.state.nextCheckpointIndex, 3);

  // Cross CP 3 (2700m)
  res = updateCheckpointProgress(res.state, 2690, 2710, checkpoints, 2);
  assert.equal(res.state.nextCheckpointIndex, 0);

  // Cross Finish Line (wrap around 3590 -> 15) to start Lap 2
  res = updateCheckpointProgress(res.state, 3590, 15, checkpoints, 2);
  assert.equal(res.completedLap, true);
  assert.equal(res.state.lap, 2);
  assert.equal(res.state.finished, false);
  assert.equal(res.state.totalProgressMeters, CIRCUIT_LENGTH + 15);

  // Verify player on Lap 2 at s=15m (totalProgress = 3615m) ranks #1 ahead of AI cars on Lap 1 at s=3550m
  const rankedMidRace = rankRacers([
    { id: 'player', totalProgress: res.state.totalProgressMeters, finishTimeMs: null },
    { id: 'ai-1', totalProgress: 3550, finishTimeMs: null },
    { id: 'ai-2', totalProgress: 3480, finishTimeMs: null },
  ]);
  assert.equal(rankedMidRace[0].id, 'player');
  assert.equal(rankedMidRace[0].position, 1);

  // Complete Lap 2 checkpoints and cross Finish Line (3592 -> 12) to trigger race finish!
  res = updateCheckpointProgress(res.state, 895, 908, checkpoints, 2);
  res = updateCheckpointProgress(res.state, 1795, 1808, checkpoints, 2);
  res = updateCheckpointProgress(res.state, 2695, 2708, checkpoints, 2);
  res = updateCheckpointProgress(res.state, 3592, 12, checkpoints, 2);
  assert.equal(res.completedLap, true);
  assert.equal(res.justFinished, true);
  assert.equal(res.state.finished, true);
});

test('Racer ranking sorts finished racers by time and active racers by progress', () => {
  const ranked = rankRacers([
    { id: 'ai-1', totalProgress: 4200, finishTimeMs: null },
    { id: 'player', totalProgress: 7200, finishTimeMs: 92400 },
    { id: 'ai-2', totalProgress: 4500, finishTimeMs: null },
  ]);

  assert.equal(ranked[0].id, 'player');
  assert.equal(ranked[0].position, 1);
  assert.equal(ranked[1].id, 'ai-2');
  assert.equal(ranked[1].position, 2);
  assert.equal(ranked[2].id, 'ai-1');
  assert.equal(ranked[2].position, 3);
});

test('District lookup covers the entire 3600m circuit with Ocean Bridge leading directly into Mountain Tunnel', () => {
  assert.equal(CIRCUIT_LENGTH, 3600);
  assert.equal(getDistrictAtS(100).id, 'downtown');
  assert.equal(getDistrictAtS(650).id, 'riverside');
  assert.equal(getDistrictAtS(1500).id, 'bridge');
  assert.equal(getDistrictAtS(2159).id, 'bridge');
  assert.equal(getDistrictAtS(2160).id, 'tunnel');
  assert.equal(getDistrictAtS(2500).id, 'tunnel');
  assert.equal(getDistrictAtS(3000).id, 'elevated');
  assert.equal(getDistrictAtS(3250).id, 'industrial');
  assert.equal(getDistrictAtS(3500).id, 'boulevard');
  assert.equal(getDistrictAtS(CIRCUIT_LENGTH + 50).id, 'downtown');
});

test('Wet weather roadFrictionMultiplier reduces braking deceleration and increases cornering slip', () => {
  const car = PLAYABLE_CARS[0];
  let dryBraking = createInitialPhysicsState(100, 0);
  dryBraking.speedMs = 55;

  let wetBraking = createInitialPhysicsState(100, 0);
  wetBraking.speedMs = 55;

  for (let i = 0; i < 30; i++) {
    dryBraking = stepVehiclePhysics(
      dryBraking,
      { throttle: 0, brake: 1, steer: 0, handbrake: false, nitro: false },
      car,
      0,
      1 / 60,
      1.0 // Clear dry road
    );
    wetBraking = stepVehiclePhysics(
      wetBraking,
      { throttle: 0, brake: 1, steer: 0, handbrake: false, nitro: false },
      car,
      0,
      1 / 60,
      0.74 // Light rain wet asphalt
    );
  }

  assert.ok(
    wetBraking.speedMs > dryBraking.speedMs,
    `Expected wet road car to carry more speed under braking (${wetBraking.speedMs} vs ${dryBraking.speedMs})`
  );

  // Also verify wet cornering induces drift & wider lateral slip on fast turns
  let dryCorner = createInitialPhysicsState(400, 0);
  dryCorner.speedMs = 48;
  let wetCorner = createInitialPhysicsState(400, 0);
  wetCorner.speedMs = 48;

  for (let i = 0; i < 20; i++) {
    dryCorner = stepVehiclePhysics(
      dryCorner,
      { throttle: 1, brake: 0, steer: 0.85, handbrake: false, nitro: false },
      car,
      0.008,
      1 / 60,
      1.0
    );
    wetCorner = stepVehiclePhysics(
      wetCorner,
      { throttle: 1, brake: 0, steer: 0.85, handbrake: false, nitro: false },
      car,
      0.008,
      1 / 60,
      0.74
    );
  }

  assert.equal(wetCorner.drifting, true, 'High-speed hard steering in rain should trigger wet drift');
  assert.equal(dryCorner.drifting, false, 'Dry road without handbrake should maintain normal grip');
});

test('AI Race Commentary detects high-speed close calls with civilian traffic and generates telemetry announcements', () => {
  const recentIds = new Set<number>();
  const traffic = [
    { id: 10, s: 251.2, lateralOffset: 2.25 },
    { id: 11, s: 410.0, lateralOffset: -6.0 },
  ];

  // Player passing alongside traffic vehicle #10 at 215 km/h (s=250, lat=0.0 -> dLat=2.25m)
  const hit = detectCloseCallWithTraffic(250.0, 0.0, 215, traffic, recentIds);
  assert.equal(hit.detected, true, 'Should detect high-speed near miss alongside traffic');
  assert.equal(hit.vehicleId, 10);
  assert.ok(hit.clearanceMeters > 0 && hit.clearanceMeters < 1.5);

  // Adding vehicle #10 to recentIds prevents duplicate triggers
  recentIds.add(10);
  const duplicate = detectCloseCallWithTraffic(250.0, 0.0, 215, traffic, recentIds);
  assert.equal(duplicate.detected, false, 'Should not re-trigger for recently passed traffic');

  // Verify procedural voice-over announcements incorporate live telemetry data
  const overtakeLine = generateProceduralCommentaryLine({
    eventType: 'overtake',
    speedKmh: 268,
    position: 2,
    totalRacers: 7,
    lap: 1,
    totalLaps: 2,
    carName: 'VANTIS REVUELTO SVJ',
    raceNumber: '01',
    rivalName: 'KIRA VEX (#02)',
    districtName: 'NEO VANTIS DOWNTOWN',
    weatherName: 'CLEAR DAYLIGHT',
    variantIndex: 0,
  });
  assert.ok(overtakeLine.badgeLabel.includes('OVERTAKE'));
  assert.ok(overtakeLine.text.includes('#01'));
  assert.ok(overtakeLine.text.includes('KIRA VEX'));

  const finalLapLine = generateProceduralCommentaryLine({
    eventType: 'final_lap',
    speedKmh: 292,
    position: 1,
    totalRacers: 7,
    lap: 2,
    totalLaps: 2,
    carName: 'VANTIS REVUELTO SVJ',
    raceNumber: '01',
    districtName: 'CENTURY GRAND BOULEVARD',
    weatherName: 'LIGHT RAIN',
    variantIndex: 1,
  });
  assert.ok(finalLapLine.badgeLabel.includes('FINAL LAP'));
  assert.ok(finalLapLine.text.includes('#01'));
});

test('Drift camera shake triggers specifically when drifting telemetry flag is true and decays when false', () => {
  // 1. When drifting is false, camera shake stays completely inactive
  const noDrift = computeDriftCameraShake(0, false, 52, 0, 12.5, 1 / 60);
  assert.equal(noDrift.intensity, 0);
  assert.equal(noDrift.lateralOffset, 0);
  assert.equal(noDrift.verticalOffset, 0);
  assert.equal(noDrift.rollJitter, 0);
  assert.equal(noDrift.fovBoost, 0);

  // 2. When drifting is true, camera shake ramps up with subtle lateral/vertical/roll jitter and FOV boost
  let shake = noDrift;
  let clock = 1.0;
  for (let i = 0; i < 20; i++) {
    clock += 0.75;
    shake = computeDriftCameraShake(shake.intensity, true, 54, 9.5, clock, 1 / 60);
  }

  assert.ok(shake.intensity > 0.65, `Expected drift shake intensity > 0.65, got ${shake.intensity}`);
  assert.ok(
    Math.abs(shake.lateralOffset) > 0 && Math.abs(shake.lateralOffset) <= 0.068,
    `Expected subtle lateralOffset in (0, 0.068], got ${shake.lateralOffset}`
  );
  assert.ok(
    Math.abs(shake.verticalOffset) > 0 && Math.abs(shake.verticalOffset) <= 0.046,
    `Expected subtle verticalOffset in (0, 0.046], got ${shake.verticalOffset}`
  );
  assert.ok(
    Math.abs(shake.rollJitter) > 0 && Math.abs(shake.rollJitter) <= 0.012,
    `Expected subtle rollJitter in (0, 0.012], got ${shake.rollJitter}`
  );
  assert.ok(
    shake.fovBoost > 1.5 && shake.fovBoost <= 2.4,
    `Expected subtle speed-sense fovBoost during drift, got ${shake.fovBoost}`
  );

  // 3. When drifting becomes false, camera shake smoothly decays back toward 0
  const peakIntensity = shake.intensity;
  for (let i = 0; i < 30; i++) {
    clock += 0.75;
    shake = computeDriftCameraShake(shake.intensity, false, 54, 1.0, clock, 1 / 60);
  }
  assert.ok(
    shake.intensity < peakIntensity * 0.1,
    `Expected drift shake intensity to decay after drift ends, got ${shake.intensity}`
  );
});

