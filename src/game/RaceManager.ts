import {
  CheckpointProgressState,
  getDistrictAtS,
  rankRacers,
  updateCheckpointProgress,
} from './VehiclePhysics';
import {
  CIRCUIT_LENGTH,
  GameScreenState,
  HUDTelemetry,
  MinimapEntity,
  RaceCommentaryAnnouncement,
  RacerStanding,
  WeatherConditionId,
  WeatherMode,
} from './types';
import { PlayerCar } from './PlayerCar';
import { RacingAI } from './RacingAI';
import { TrafficManager } from './TrafficManager';
import { CheckpointSystem } from './CheckpointSystem';
import { RoadSystem } from './RoadSystem';
import { AudioManager } from './AudioManager';
import { CollisionSystem } from './CollisionSystem';

export class RaceManager {
  public screenState: GameScreenState = 'title';
  public totalLaps = 2;
  public countdownTimer = 0; // seconds remaining before GO
  public lastBeepSecond = -1;
  public raceTimeMs = 0;
  public currentLapStartTimeMs = 0;
  public bestLapTimeMs: number | null = null;
  public playerProgress: CheckpointProgressState = {
    lap: 1,
    nextCheckpointIndex: 1,
    totalProgressMeters: 0,
    finished: false,
  };
  public playerFinishTimeMs: number | null = null;
  public collisionFlash = 0;

  public resetRace(totalLaps = 2, startS = 8): void {
    this.totalLaps = totalLaps;
    this.countdownTimer = 1.6;
    this.lastBeepSecond = 4;
    this.raceTimeMs = 0;
    this.currentLapStartTimeMs = 0;
    this.bestLapTimeMs = null;
    this.playerProgress = {
      lap: 1,
      nextCheckpointIndex: 1,
      totalProgressMeters: startS,
      finished: false,
    };
    this.playerFinishTimeMs = null;
    this.collisionFlash = 0;
  }

  public stepTimersAndCheckCanMove(
    dt: number,
    audio: AudioManager
  ): boolean {
    if (this.collisionFlash > 0) {
      this.collisionFlash = Math.max(0, this.collisionFlash - dt * 2.5);
    }

    if (this.screenState !== 'playing') {
      return false;
    }

    // Countdown sequence (3..2..1..GO!)
    if (this.countdownTimer > 0) {
      this.countdownTimer -= dt;
      const beatVal = Math.ceil((this.countdownTimer / 1.6) * 3);
      if (beatVal < this.lastBeepSecond && beatVal >= 1) {
        this.lastBeepSecond = beatVal;
        audio.playCountdownTone(false);
      } else if (this.countdownTimer <= 0 && this.lastBeepSecond !== 0) {
        this.lastBeepSecond = 0;
        audio.playCountdownTone(true);
      }
      return this.countdownTimer <= 0;
    }

    // Active racing timer
    this.raceTimeMs += dt * 1000;
    return true;
  }

  public updateProgressAfterMovement(
    prevPlayerS: number,
    player: PlayerCar,
    ai: RacingAI,
    checkpoints: CheckpointSystem,
    audio: AudioManager
  ): { raceJustEnded: boolean } {
    if (this.screenState !== 'playing' || this.countdownTimer > 0) {
      this.playerProgress.totalProgressMeters =
        (this.playerProgress.lap - 1) * CIRCUIT_LENGTH + player.state.s;
      return { raceJustEnded: false };
    }

    // Check player checkpoint / lap crossing using true prevPlayerS -> new player.state.s
    const cpResult = updateCheckpointProgress(
      this.playerProgress,
      prevPlayerS,
      player.state.s,
      checkpoints.checkpointPositionsS,
      this.totalLaps
    );
    this.playerProgress = cpResult.state;

    if (cpResult.crossedCheckpoint) {
      audio.playCheckpointChime(cpResult.completedLap);
      checkpoints.highlightNextCheckpoint(this.playerProgress.nextCheckpointIndex);
    }

    if (cpResult.completedLap) {
      const lapDuration = this.raceTimeMs - this.currentLapStartTimeMs;
      this.currentLapStartTimeMs = this.raceTimeMs;
      if (this.bestLapTimeMs === null || lapDuration < this.bestLapTimeMs) {
        this.bestLapTimeMs = lapDuration;
      }
    }

    if (cpResult.justFinished) {
      this.playerFinishTimeMs = this.raceTimeMs;
      // Compute if player finished in top 3
      const standings = this.computeStandings(player, ai);
      const playerRank = standings.find((s) => s.isPlayer)?.position ?? 1;
      audio.playRaceFinish(playerRank <= 3);
      return { raceJustEnded: true };
    }

    return { raceJustEnded: false };
  }

  public computeStandings(player: PlayerCar, ai: RacingAI): RacerStanding[] {
    const rawList = [
      {
        id: 'player',
        name: `YOU (#${player.spec.raceNumber})`,
        carName: player.spec.name,
        isPlayer: true,
        lap: this.playerProgress.lap,
        totalProgress: this.playerProgress.totalProgressMeters,
        finishTimeMs: this.playerFinishTimeMs,
      },
      ...ai.racers.map((r) => ({
        id: r.profile.id,
        name: `${r.profile.driverName} (#${r.profile.raceNumber})`,
        carName: r.profile.carName,
        isPlayer: false,
        lap: r.progress.lap,
        totalProgress: r.progress.totalProgressMeters,
        finishTimeMs: r.finishTimeMs,
      })),
    ];

    const ranked = rankRacers(rawList);
    const leaderProgress = ranked[0]?.totalProgress ?? 0;

    return ranked.map((r) => {
      const distBehind = Math.max(0, leaderProgress - r.totalProgress);
      const gapSeconds = Number((distBehind / 52).toFixed(2));
      return {
        ...r,
        gapSeconds,
      };
    });
  }

  public buildHUDTelemetry(
    road: RoadSystem,
    player: PlayerCar,
    ai: RacingAI,
    traffic: TrafficManager,
    checkpoints: CheckpointSystem,
    collisions: CollisionSystem,
    weatherInfo: {
      weatherId: WeatherConditionId;
      weatherName: string;
      weatherMode: WeatherMode;
      roadFriction: number;
    },
    activeCommentary: RaceCommentaryAnnouncement | null = null
  ): HUDTelemetry {
    const standings = this.computeStandings(player, ai);
    const playerStanding = standings.find((s) => s.isPlayer) ?? standings[0];
    const district = getDistrictAtS(player.state.s);

    let countdownVal = -1;
    if (this.screenState === 'playing') {
      if (this.countdownTimer > 0) {
        countdownVal = Math.max(1, Math.ceil((this.countdownTimer / 1.6) * 3));
      } else if (this.raceTimeMs < 950) {
        countdownVal = 0; // "GO!"
      }
    }

    const minimapEntities: MinimapEntity[] = [];

    // Checkpoints
    const nextCp = checkpoints.checkpointWorldPositions[this.playerProgress.nextCheckpointIndex];
    if (nextCp) {
      minimapEntities.push({
        x: nextCp.x,
        z: nextCp.z,
        yaw: 0,
        type: 'checkpoint',
        color: '#06b6d4',
      });
    }

    // Civilian traffic (nearby within 260m for clean minimap)
    for (const tv of traffic.vehicles) {
      const dx = tv.worldPosition.x - player.worldPosition.x;
      const dz = tv.worldPosition.z - player.worldPosition.z;
      if (dx * dx + dz * dz < 260 * 260) {
        minimapEntities.push({
          x: tv.worldPosition.x,
          z: tv.worldPosition.z,
          yaw: tv.worldYaw,
          type: 'traffic',
          color: '#64748b',
        });
      }
    }

    // AI opponents
    for (const r of ai.racers) {
      minimapEntities.push({
        x: r.worldPosition.x,
        z: r.worldPosition.z,
        yaw: r.worldYaw,
        type: 'ai',
        color: '#' + r.profile.colorHex.toString(16).padStart(6, '0'),
      });
    }

    // Player (always last so rendered on top)
    minimapEntities.push({
      x: player.worldPosition.x,
      z: player.worldPosition.z,
      yaw: player.worldYaw,
      type: 'player',
      color: '#facc15',
    });

    return {
      screenState: this.screenState,
      countdownValue: countdownVal,
      speedKmh: Math.round(Math.abs(player.state.speedMs * 3.6)),
      rpm: player.state.rpm,
      gear: player.state.gear,
      nitroAmount: Math.round(player.state.nitroAmount),
      nitroActive: player.state.nitroActive,
      nitroBlurIntensity: Number(player.state.nitroBlurIntensity.toFixed(3)),
      drifting: player.state.drifting,
      position: playerStanding.position,
      totalRacers: standings.length,
      lap: Math.min(this.totalLaps, this.playerProgress.lap),
      totalLaps: this.totalLaps,
      raceTimeMs: Math.round(this.raceTimeMs),
      bestLapTimeMs: this.bestLapTimeMs !== null ? Math.round(this.bestLapTimeMs) : null,
      checkpointIndex:
        this.playerProgress.nextCheckpointIndex === 0
          ? checkpoints.checkpointPositionsS.length
          : this.playerProgress.nextCheckpointIndex,
      totalCheckpoints: checkpoints.checkpointPositionsS.length,
      districtName: district.name,
      districtSubtitle: district.subtitle,
      collisionFlash: this.collisionFlash,
      wrongWay: Math.abs(player.state.headingOffset) > 1.65,
      odometerMeters: Math.round(player.state.odometerMeters),
      minimapTrackPoints: road.minimapPoints,
      minimapEntities,
      standings,
      topSpeedRecordedKmh: Math.round(player.topSpeedRecordedKmh),
      collisionsCount: collisions.collisionsCount,
      weatherId: weatherInfo.weatherId,
      weatherName: weatherInfo.weatherName,
      weatherMode: weatherInfo.weatherMode,
      roadFriction: Number(weatherInfo.roadFriction.toFixed(2)),
      activeCommentary,
    };
  }
}
