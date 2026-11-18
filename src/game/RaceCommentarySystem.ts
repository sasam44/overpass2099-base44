import {
  CIRCUIT_LENGTH,
  RaceCommentaryAnnouncement,
  RaceCommentaryEventType,
  RacerStanding,
  WeatherConditionId,
} from './types';
import { AudioManager } from './AudioManager';

export interface TelemetryCommentaryContext {
  eventType: RaceCommentaryEventType;
  speedKmh: number;
  position: number;
  totalRacers: number;
  lap: number;
  totalLaps: number;
  carName: string;
  raceNumber: string;
  rivalName?: string;
  districtName: string;
  weatherName: string;
  clearanceMeters?: number;
  variantIndex?: number;
}

export interface CloseCallCandidate {
  id: string | number;
  s: number;
  lateralOffset: number;
}

export interface CloseCallDetectionResult {
  detected: boolean;
  vehicleId: string | number;
  clearanceMeters: number;
}

/**
 * Pure telemetry detector for high-speed near misses / close calls with civilian highway traffic.
 */
export function detectCloseCallWithTraffic(
  playerS: number,
  playerLat: number,
  playerSpeedKmh: number,
  trafficVehicles: CloseCallCandidate[],
  recentlyTriggeredIds: Set<string | number>,
  circuitLength = CIRCUIT_LENGTH
): CloseCallDetectionResult {
  if (playerSpeedKmh < 105) {
    return { detected: false, vehicleId: -1, clearanceMeters: 99 };
  }

  for (const tv of trafficVehicles) {
    if (recentlyTriggeredIds.has(tv.id)) continue;

    let ds = tv.s - playerS;
    if (ds > circuitLength * 0.5) ds -= circuitLength;
    if (ds < -circuitLength * 0.5) ds += circuitLength;

    const absLongitudinal = Math.abs(ds);
    const absLateral = Math.abs(tv.lateralOffset - playerLat);

    // Passing alongside a traffic vehicle within a razor-thin lateral corridor without colliding
    if (absLongitudinal < 3.8 && absLateral >= 1.72 && absLateral <= 2.95) {
      const clearance = Math.max(0.15, Number((absLateral - 1.55).toFixed(2)));
      return {
        detected: true,
        vehicleId: tv.id,
        clearanceMeters: clearance,
      };
    }
  }

  return { detected: false, vehicleId: -1, clearanceMeters: 99 };
}

/**
 * Pure procedural AI commentary generator that produces broadcast-grade voice-over lines
 * tailored to live telemetry data (speed, position, overtakes, close calls, final lap, weather).
 */
export function generateProceduralCommentaryLine(
  ctx: TelemetryCommentaryContext
): { badgeLabel: string; accentColor: string; text: string } {
  const v = (ctx.variantIndex ?? 0) % 3;
  const numTag = `#${ctx.raceNumber}`;
  const rival = ctx.rivalName || 'the rival supercar';

  switch (ctx.eventType) {
    case 'race_start': {
      const lines = [
        `Lights out in ${ctx.districtName}! Car ${numTag} ${ctx.carName} launches off the grid into the Neo Vantis pack!`,
        `Green flag! Seven V12 supercars roar through ${ctx.districtName}—car ${numTag} is hunting for the lead!`,
        `We are live on the Neo Vantis circuit! Car ${numTag} fires up the twin-turbo V12 and charges toward Turn One!`,
      ];
      return {
        badgeLabel: 'RACE BROADCAST · LIVE',
        accentColor: '#10b981',
        text: lines[v],
      };
    }

    case 'overtake': {
      const lines = [
        `Brilliant overtake at ${ctx.speedKmh} km/h! Car ${numTag} slices past ${rival} to claim P${ctx.position} in ${ctx.districtName}!`,
        `What a move! ${ctx.carName} ${numTag} dives down the inside of ${rival} and seizes position ${ctx.position}!`,
        `Clinical pass through ${ctx.districtName}! Car ${numTag} leaves ${rival} in the rearview mirror for P${ctx.position}!`,
      ];
      return {
        badgeLabel: `OVERTAKE · P${ctx.position}`,
        accentColor: '#38bdf8',
        text: lines[v],
      };
    }

    case 'overtaken': {
      const lines = [
        `${rival} muscles past car ${numTag} into ${ctx.districtName}! You drop to P${ctx.position}—punch that nitro to fight back!`,
        `Position lost! ${rival} drafts past ${numTag} at ${ctx.speedKmh} km/h—reclaim P${Math.max(1, ctx.position - 1)} before the next sector!`,
        `Under pressure in ${ctx.districtName}! ${rival} slips ahead of car ${numTag}, pushing you back to P${ctx.position}!`,
      ];
      return {
        badgeLabel: `POSITION ALERT · P${ctx.position}`,
        accentColor: '#f59e0b',
        text: lines[v],
      };
    }

    case 'close_call': {
      const cm = ctx.clearanceMeters !== undefined ? `${Math.round(ctx.clearanceMeters * 100)}cm` : 'inches';
      const lines = [
        `Razor-sharp close call! Car ${numTag} threads civilian traffic with ${cm} to spare at ${ctx.speedKmh} km/h!`,
        `Heart-stopping near miss in ${ctx.districtName}! ${ctx.carName} ${numTag} grazes commuter traffic at ${ctx.speedKmh} km/h!`,
        `Needle-threading precision! Car ${numTag} dodges highway traffic by ${cm} without lifting off the throttle!`,
      ];
      return {
        badgeLabel: 'CLOSE CALL · NEAR MISS',
        accentColor: '#a855f7',
        text: lines[v],
      };
    }

    case 'final_lap': {
      const leadNote =
        ctx.position === 1
          ? `Defend P1 all the way to the checkered flag!`
          : `Currently P${ctx.position}—empty the nitro tank to hunt down the leaders!`;
      const lines = [
        `White flag—Final Lap! Car ${numTag} storms across the line at ${ctx.speedKmh} km/h. ${leadNote}`,
        `Final lap on the Neo Vantis circuit! Everything is on the line for car ${numTag} in P${ctx.position}!`,
        `Last lap bell rings! ${ctx.carName} ${numTag} enters the final 3.6 kilometers at ${ctx.speedKmh} km/h—${leadNote}`,
      ];
      return {
        badgeLabel: `FINAL LAP · ${ctx.lap}/${ctx.totalLaps}`,
        accentColor: '#facc15',
        text: lines[v],
      };
    }

    case 'nitro_surge': {
      const lines = [
        `Plasma nitro engaged! Car ${numTag} rockets to ${ctx.speedKmh} km/h down ${ctx.districtName}!`,
        `Full afterburner! ${ctx.carName} ${numTag} unleashes maximum boost at ${ctx.speedKmh} km/h!`,
        `Blistering velocity in ${ctx.districtName}! Car ${numTag} hits ${ctx.speedKmh} km/h on active nitro boost!`,
      ];
      return {
        badgeLabel: 'NITRO SURGE · MAX BOOST',
        accentColor: '#06b6d4',
        text: lines[v],
      };
    }

    case 'collision': {
      const lines = [
        `Heavy chassis impact in ${ctx.districtName}! Sparks fly off car ${numTag}—stabilize the steering and recover speed!`,
        `Crunch on the expressway! Car ${numTag} trades carbon fiber in ${ctx.districtName}, holding P${ctx.position}!`,
        `Hard contact at ${ctx.speedKmh} km/h! Car ${numTag} shakes off the collision and stays in the fight!`,
      ];
      return {
        badgeLabel: 'IMPACT DETECTED',
        accentColor: '#ef4444',
        text: lines[v],
      };
    }

    case 'weather_shift': {
      const lines = [
        `Weather alert across Neo Vantis: ${ctx.weatherName} rolling in! Watch your braking zones, car ${numTag}!`,
        `Track conditions shifting to ${ctx.weatherName} in ${ctx.districtName}—adjust your cornering grip!`,
        `Meteorological update: ${ctx.weatherName} now blanketing the circuit as car ${numTag} holds P${ctx.position}!`,
      ];
      return {
        badgeLabel: `WEATHER · ${ctx.weatherName}`,
        accentColor: '#38bdf8',
        text: lines[v],
      };
    }

    case 'race_finish': {
      const won = ctx.position === 1;
      const podium = ctx.position <= 3;
      const text = won
        ? `Checkered flag! Victory for car ${numTag} ${ctx.carName}—Champion of the Neo Vantis Street Circuit!`
        : podium
        ? `Across the finish line in P${ctx.position}! A fiercely fought podium finish for car ${numTag}!`
        : `Checkered flag waves! Car ${numTag} crosses the line in P${ctx.position} after a high-speed battle!`;
      return {
        badgeLabel: won ? 'VICTORY BROADCAST' : `FINISH · P${ctx.position}`,
        accentColor: won ? '#10b981' : '#f59e0b',
        text,
      };
    }
  }
}

export class RaceCommentarySystem {
  public activeAnnouncement: RaceCommentaryAnnouncement | null = null;
  public totalAnnouncements = 0;

  private announcementTimeRemaining = 0;
  private globalCooldown = 0;
  private categoryCooldowns: Partial<Record<RaceCommentaryEventType, number>> = {};

  private prevPosition = -1;
  private prevLap = 1;
  private wasCountdownPositive = true;
  private prevWeatherId: WeatherConditionId = 'clear';
  private recentCloseCallTrafficIds = new Set<string | number>();
  private closeCallResetTimer = 0;
  private variantCounter = 0;

  public reset(initialWeatherId: WeatherConditionId = 'clear'): void {
    this.activeAnnouncement = null;
    this.announcementTimeRemaining = 0;
    this.globalCooldown = 0;
    this.categoryCooldowns = {};
    this.prevPosition = -1;
    this.prevLap = 1;
    this.wasCountdownPositive = true;
    this.prevWeatherId = initialWeatherId;
    this.recentCloseCallTrafficIds.clear();
    this.closeCallResetTimer = 0;
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore speechSynthesis errors
      }
    }
  }

  public update(
    dt: number,
    params: {
      isPlaying: boolean;
      countdownTimer: number;
      speedKmh: number;
      playerS: number;
      playerLat: number;
      position: number;
      totalRacers: number;
      lap: number;
      totalLaps: number;
      carName: string;
      raceNumber: string;
      districtName: string;
      weatherId: WeatherConditionId;
      weatherName: string;
      nitroActive: boolean;
      collisionJustOccurred: boolean;
      raceJustEnded: boolean;
      standings: RacerStanding[];
      trafficVehicles: CloseCallCandidate[];
      audio: AudioManager;
    }
  ): void {
    if (this.announcementTimeRemaining > 0) {
      this.announcementTimeRemaining = Math.max(0, this.announcementTimeRemaining - dt);
      if (this.announcementTimeRemaining <= 0) {
        this.activeAnnouncement = null;
      }
    }

    if (this.globalCooldown > 0) {
      this.globalCooldown = Math.max(0, this.globalCooldown - dt);
    }

    for (const key of Object.keys(this.categoryCooldowns) as RaceCommentaryEventType[]) {
      const rem = this.categoryCooldowns[key] ?? 0;
      if (rem > 0) {
        this.categoryCooldowns[key] = Math.max(0, rem - dt);
      }
    }

    this.closeCallResetTimer += dt;
    if (this.closeCallResetTimer >= 8.0) {
      this.closeCallResetTimer = 0;
      this.recentCloseCallTrafficIds.clear();
    }

    if (!params.isPlaying && !params.raceJustEnded) {
      return;
    }

    // 1. Race Finish (Highest priority)
    if (params.raceJustEnded) {
      this.triggerAnnouncement(
        {
          eventType: 'race_finish',
          speedKmh: params.speedKmh,
          position: params.position,
          totalRacers: params.totalRacers,
          lap: params.lap,
          totalLaps: params.totalLaps,
          carName: params.carName,
          raceNumber: params.raceNumber,
          districtName: params.districtName,
          weatherName: params.weatherName,
        },
        params.audio,
        true
      );
      return;
    }

    // 2. Race Start ("GO!" transition when countdownTimer crosses 0)
    if (this.wasCountdownPositive && params.countdownTimer <= 0) {
      this.wasCountdownPositive = false;
      this.prevPosition = params.position;
      this.prevLap = params.lap;
      this.triggerAnnouncement(
        {
          eventType: 'race_start',
          speedKmh: params.speedKmh,
          position: params.position,
          totalRacers: params.totalRacers,
          lap: params.lap,
          totalLaps: params.totalLaps,
          carName: params.carName,
          raceNumber: params.raceNumber,
          districtName: params.districtName,
          weatherName: params.weatherName,
        },
        params.audio,
        true
      );
      return;
    }

    if (params.countdownTimer > 0) {
      this.wasCountdownPositive = true;
      this.prevPosition = params.position;
      return;
    }

    // 3. Final Lap Crossing
    if (params.lap > this.prevLap) {
      this.prevLap = params.lap;
      if (params.lap === params.totalLaps) {
        this.triggerAnnouncement(
          {
            eventType: 'final_lap',
            speedKmh: params.speedKmh,
            position: params.position,
            totalRacers: params.totalRacers,
            lap: params.lap,
            totalLaps: params.totalLaps,
            carName: params.carName,
            raceNumber: params.raceNumber,
            districtName: params.districtName,
            weatherName: params.weatherName,
          },
          params.audio,
          true
        );
        return;
      }
    }

    // 4. Overtake / Overtaken telemetry detection
    if (this.prevPosition > 0 && params.position !== this.prevPosition) {
      const improved = params.position < this.prevPosition;
      const oldPos = this.prevPosition;
      this.prevPosition = params.position;

      // Identify the rival right behind (if overtake) or right ahead (if overtaken)
      const targetRank = improved ? params.position + 1 : Math.max(1, oldPos);
      const rivalStanding = params.standings.find(
        (s) => !s.isPlayer && s.position === targetRank
      );
      const rivalName = rivalStanding ? rivalStanding.name : 'a rival supercar';

      const eventType: RaceCommentaryEventType = improved ? 'overtake' : 'overtaken';
      if (this.canTrigger(eventType, improved ? 2.6 : 4.5)) {
        this.triggerAnnouncement(
          {
            eventType,
            speedKmh: params.speedKmh,
            position: params.position,
            totalRacers: params.totalRacers,
            lap: params.lap,
            totalLaps: params.totalLaps,
            carName: params.carName,
            raceNumber: params.raceNumber,
            rivalName,
            districtName: params.districtName,
            weatherName: params.weatherName,
          },
          params.audio,
          false
        );
        return;
      }
    } else {
      this.prevPosition = params.position;
    }

    // 5. Heavy Collision Commentary
    if (params.collisionJustOccurred && this.canTrigger('collision', 5.5)) {
      this.triggerAnnouncement(
        {
          eventType: 'collision',
          speedKmh: params.speedKmh,
          position: params.position,
          totalRacers: params.totalRacers,
          lap: params.lap,
          totalLaps: params.totalLaps,
          carName: params.carName,
          raceNumber: params.raceNumber,
          districtName: params.districtName,
          weatherName: params.weatherName,
        },
        params.audio,
        false
      );
      return;
    }

    // 6. High-Speed Close Call with Civilian Traffic
    if (this.canTrigger('close_call', 4.2)) {
      const closeCall = detectCloseCallWithTraffic(
        params.playerS,
        params.playerLat,
        params.speedKmh,
        params.trafficVehicles,
        this.recentCloseCallTrafficIds
      );
      if (closeCall.detected) {
        this.recentCloseCallTrafficIds.add(closeCall.vehicleId);
        this.triggerAnnouncement(
          {
            eventType: 'close_call',
            speedKmh: params.speedKmh,
            position: params.position,
            totalRacers: params.totalRacers,
            lap: params.lap,
            totalLaps: params.totalLaps,
            carName: params.carName,
            raceNumber: params.raceNumber,
            districtName: params.districtName,
            weatherName: params.weatherName,
            clearanceMeters: closeCall.clearanceMeters,
          },
          params.audio,
          false
        );
        return;
      }
    }

    // 7. Weather Shift Announcement
    if (params.weatherId !== this.prevWeatherId) {
      this.prevWeatherId = params.weatherId;
      if (this.canTrigger('weather_shift', 6.0)) {
        this.triggerAnnouncement(
          {
            eventType: 'weather_shift',
            speedKmh: params.speedKmh,
            position: params.position,
            totalRacers: params.totalRacers,
            lap: params.lap,
            totalLaps: params.totalLaps,
            carName: params.carName,
            raceNumber: params.raceNumber,
            districtName: params.districtName,
            weatherName: params.weatherName,
          },
          params.audio,
          false
        );
        return;
      }
    }

    // 8. High-Speed Nitro Surge
    if (
      params.nitroActive &&
      params.speedKmh >= 210 &&
      this.canTrigger('nitro_surge', 8.5)
    ) {
      this.triggerAnnouncement(
        {
          eventType: 'nitro_surge',
          speedKmh: params.speedKmh,
          position: params.position,
          totalRacers: params.totalRacers,
          lap: params.lap,
          totalLaps: params.totalLaps,
          carName: params.carName,
          raceNumber: params.raceNumber,
          districtName: params.districtName,
          weatherName: params.weatherName,
        },
        params.audio,
        false
      );
    }
  }

  private canTrigger(
    eventType: RaceCommentaryEventType,
    categoryCooldownSec: number
  ): boolean {
    if (this.globalCooldown > 0) return false;
    if ((this.categoryCooldowns[eventType] ?? 0) > 0) return false;
    this.categoryCooldowns[eventType] = categoryCooldownSec;
    return true;
  }

  public triggerAnnouncement(
    ctx: TelemetryCommentaryContext,
    audio: AudioManager,
    bypassCooldown = false
  ): RaceCommentaryAnnouncement {
    if (!bypassCooldown && this.globalCooldown > 0 && this.activeAnnouncement) {
      return this.activeAnnouncement;
    }

    this.variantCounter += 1;
    this.totalAnnouncements += 1;
    const announcementId = this.totalAnnouncements;

    const generated = generateProceduralCommentaryLine({
      ...ctx,
      variantIndex: this.variantCounter,
    });

    const announcement: RaceCommentaryAnnouncement = {
      id: announcementId,
      eventType: ctx.eventType,
      badgeLabel: generated.badgeLabel,
      text: generated.text,
      accentColor: generated.accentColor,
      spoken: false,
      timestampMs: Date.now(),
    };

    this.activeAnnouncement = announcement;
    this.announcementTimeRemaining = 5.4;
    this.globalCooldown = bypassCooldown ? 1.4 : 2.6;
    this.categoryCooldowns[ctx.eventType] = bypassCooldown ? 2.0 : 4.5;

    // Silent visual HUD telemetry ticker only (AI voice audio disabled per user request)
    void audio;

    return announcement;
  }
}
