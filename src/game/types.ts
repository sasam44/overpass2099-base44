export type GameScreenState = 'title' | 'playing' | 'paused' | 'gameover';

export type QualityPreset = 'high' | 'performance';

export type WeatherConditionId = 'clear' | 'rain' | 'neon_fog';
export type WeatherMode = 'dynamic' | WeatherConditionId;

export interface WeatherConfig {
  id: WeatherConditionId;
  name: string;
  shortLabel: string;
  subtitle: string;
  frictionMultiplier: number; // 1.0 = Dry Grip, 0.74 = Light Rain, 0.85 = Neon Fog
  roadRoughness: number;
  roadMetalness: number;
  roadEnvIntensity: number;
  skyTintHex: number;
  fogColorHex: number;
  fogDensity: number;
  sunColorHex: number;
  sunIntensity: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  hemiIntensity: number;
  exposure: number;
  rainIntensity: number;      // 0..1
  streetLightEmissive: number;
}

export const WEATHER_ORDER: WeatherConditionId[] = ['clear', 'rain', 'neon_fog'];

export const WEATHER_PRESETS: Record<WeatherConditionId, WeatherConfig> = {
  clear: {
    id: 'clear',
    name: 'CLEAR DAYLIGHT',
    shortLabel: 'CLEAR',
    subtitle: 'Optimal Dry Tarmac Grip',
    frictionMultiplier: 1.0,
    roadRoughness: 0.86,
    roadMetalness: 0.04,
    roadEnvIntensity: 0.28,
    skyTintHex: 0xffffff,
    fogColorHex: 0xa7d8f5,
    fogDensity: 0.0011,
    sunColorHex: 0xfff9e6,
    sunIntensity: 2.65,
    hemiSkyHex: 0x87ceeb,
    hemiGroundHex: 0x989068,
    hemiIntensity: 1.35,
    exposure: 1.12,
    rainIntensity: 0.0,
    streetLightEmissive: 0.25,
  },
  rain: {
    id: 'rain',
    name: 'LIGHT RAIN',
    shortLabel: 'RAIN',
    subtitle: 'Wet Asphalt · Reduced Tire Grip',
    frictionMultiplier: 0.74,
    roadRoughness: 0.18,
    roadMetalness: 0.44,
    roadEnvIntensity: 1.25,
    skyTintHex: 0x627792,
    fogColorHex: 0x4b5e78,
    fogDensity: 0.0029,
    sunColorHex: 0x9bb8dc,
    sunIntensity: 1.25,
    hemiSkyHex: 0x64748b,
    hemiGroundHex: 0x334155,
    hemiIntensity: 1.05,
    exposure: 0.98,
    rainIntensity: 1.0,
    streetLightEmissive: 2.8,
  },
  neon_fog: {
    id: 'neon_fog',
    name: 'NEON FOG',
    shortLabel: 'NEON FOG',
    subtitle: 'Cybernetic Mist · Damp Tarmac',
    frictionMultiplier: 0.85,
    roadRoughness: 0.30,
    roadMetalness: 0.32,
    roadEnvIntensity: 0.98,
    skyTintHex: 0x4c2a70,
    fogColorHex: 0x281845,
    fogDensity: 0.0038,
    sunColorHex: 0x38bdf8,
    sunIntensity: 1.45,
    hemiSkyHex: 0xc026d3,
    hemiGroundHex: 0x1e1b4b,
    hemiIntensity: 1.22,
    exposure: 1.04,
    rainIntensity: 0.22,
    streetLightEmissive: 3.8,
  },
};

export interface CarSpec {
  id: string;
  name: string;
  tagline: string;
  colorHex: number;
  accentHex: number;
  badgeText: string;
  raceNumber: string;
  topSpeedKmh: number;      // e.g. 285 - 320 km/h
  nitroBoostKmh: number;    // extra km/h on nitro
  acceleration: number;     // m/s^2 base
  handling: number;         // steering responsiveness
  nitroCapacity: number;    // seconds of continuous boost
  stats: {
    speed: number;          // 1-100 for UI bar
    accel: number;          // 1-100
    handling: number;       // 1-100
    nitro: number;          // 1-100
  };
}

export const PLAYABLE_CARS: CarSpec[] = [
  {
    id: 'vantis-gtr',
    name: 'VANTIS REVUELTO SVJ',
    tagline: 'V12 Wedge Supercar · Active Aero',
    colorHex: 0x22262e,
    accentHex: 0xf59e0b,
    badgeText: 'SVJ #01',
    raceNumber: '01',
    topSpeedKmh: 295,
    nitroBoostKmh: 65,
    acceleration: 26,
    handling: 2.65,
    nitroCapacity: 4.5,
    stats: {
      speed: 86,
      accel: 88,
      handling: 92,
      nitro: 85,
    },
  },
  {
    id: 'apex-v12',
    name: 'SOLARIS AVENTADOR V12',
    tagline: 'Mid-Engine Carbon Wedge Hypercar',
    colorHex: 0xdc2626,
    accentHex: 0x38bdf8,
    badgeText: 'V12 #07',
    raceNumber: '07',
    topSpeedKmh: 315,
    nitroBoostKmh: 72,
    acceleration: 29,
    handling: 2.45,
    nitroCapacity: 4.2,
    stats: {
      speed: 96,
      accel: 94,
      handling: 84,
      nitro: 82,
    },
  },
  {
    id: 'spectre-evo',
    name: 'VALKYRIE HURACÁN EVO',
    tagline: 'Track GT3 Wedge & Extended Nitro',
    colorHex: 0x0284c7,
    accentHex: 0x10b981,
    badgeText: 'EVO #88',
    raceNumber: '88',
    topSpeedKmh: 288,
    nitroBoostKmh: 78,
    acceleration: 27.5,
    handling: 2.95,
    nitroCapacity: 5.5,
    stats: {
      speed: 84,
      accel: 90,
      handling: 98,
      nitro: 96,
    },
  },
];

export interface AIOpponentProfile {
  id: string;
  driverName: string;
  carName: string;
  raceNumber: string;
  colorHex: number;
  accentHex: number;
  baseTopSpeedKmh: number;
  acceleration: number;
  preferredLaneOffset: number; // -6 to +6 meters
  aggression: number;          // 0.3 to 0.95
  mistakeChance: number;       // 0.01 to 0.05
}

export const AI_OPPONENT_PROFILES: AIOpponentProfile[] = [
  {
    id: 'ai-1',
    driverName: 'KIRA VEX',
    carName: 'Huracán Trofeo',
    raceNumber: '02',
    colorHex: 0xf8fafc, // Crisp pearl white like the left car in the reference image
    accentHex: 0xef4444,
    baseTopSpeedKmh: 286,
    acceleration: 24.5,
    preferredLaneOffset: -3.2,
    aggression: 0.85,
    mistakeChance: 0.015,
  },
  {
    id: 'ai-2',
    driverName: 'MARCUS VANE',
    carName: 'Revuelto Corsa',
    raceNumber: '04',
    colorHex: 0x2563eb, // Deep racing blue like the ahead car in the reference image
    accentHex: 0x38bdf8,
    baseTopSpeedKmh: 282,
    acceleration: 24.0,
    preferredLaneOffset: 2.8,
    aggression: 0.78,
    mistakeChance: 0.02,
  },
  {
    id: 'ai-3',
    driverName: 'ELENA NYX',
    carName: 'Diablo SV-R',
    raceNumber: '09',
    colorHex: 0xe11d48,
    accentHex: 0xfbbf24,
    baseTopSpeedKmh: 278,
    acceleration: 23.5,
    preferredLaneOffset: -5.5,
    aggression: 0.82,
    mistakeChance: 0.022,
  },
  {
    id: 'ai-4',
    driverName: 'DRAKE KOVACS',
    carName: 'Murciélago GT',
    raceNumber: '11',
    colorHex: 0xf59e0b,
    accentHex: 0xfef08a,
    baseTopSpeedKmh: 274,
    acceleration: 23.0,
    preferredLaneOffset: 5.5,
    aggression: 0.72,
    mistakeChance: 0.025,
  },
  {
    id: 'ai-5',
    driverName: 'SORA TAKAHASHI',
    carName: 'Sesto Elemento',
    raceNumber: '23',
    colorHex: 0x10b981,
    accentHex: 0x6ee7b7,
    baseTopSpeedKmh: 268,
    acceleration: 22.5,
    preferredLaneOffset: -2.2,
    aggression: 0.65,
    mistakeChance: 0.03,
  },
  {
    id: 'ai-6',
    driverName: 'AXEL CHEN',
    carName: 'Centenario LP',
    raceNumber: '77',
    colorHex: 0x9333ea,
    accentHex: 0xe879f9,
    baseTopSpeedKmh: 262,
    acceleration: 22.0,
    preferredLaneOffset: 2.2,
    aggression: 0.6,
    mistakeChance: 0.035,
  },
];

export type DistrictId =
  | 'downtown'
  | 'riverside'
  | 'bridge'
  | 'elevated'
  | 'tunnel'
  | 'industrial'
  | 'boulevard';

export interface DistrictZone {
  id: DistrictId;
  name: string;
  subtitle: string;
  startS: number; // meters from 0 to CIRCUIT_LENGTH
  endS: number;
}

export const CIRCUIT_LENGTH = 3600; // 3.6 km continuous closed circuit
export const ROAD_WIDTH = 18;       // 4-lane highway width (meters)
export const ROAD_HALF_WIDTH = 9;   // +/- 9m from centerline

export const DISTRICT_ZONES: DistrictZone[] = [
  {
    id: 'downtown',
    name: 'NEO VANTIS DOWNTOWN',
    subtitle: 'Central Skyscraper Expressway',
    startS: 0,
    endS: 480,
  },
  {
    id: 'riverside',
    name: 'VANTIS COASTAL BAYFRONT',
    subtitle: 'Scenic Oceanfront Approach',
    startS: 480,
    endS: 920,
  },
  {
    id: 'bridge',
    name: 'VANTIS OCEAN SUSPENSION BRIDGE',
    subtitle: 'Cross-Sea High-Speed Span',
    startS: 920,
    endS: 2160,
  },
  {
    id: 'tunnel',
    name: 'MOUNT VANTIS LIGHT TUNNEL',
    subtitle: 'Illuminated Mountain Bore',
    startS: 2160,
    endS: 2880,
  },
  {
    id: 'elevated',
    name: 'SKYLINE ELEVATED VIADUCT',
    subtitle: 'Mountain Exit Overpass',
    startS: 2880,
    endS: 3150,
  },
  {
    id: 'industrial',
    name: 'REACTOR INDUSTRIAL SECTOR',
    subtitle: 'Heavy Cargo & Refinery Dock',
    startS: 3150,
    endS: 3380,
  },
  {
    id: 'boulevard',
    name: 'CENTURY GRAND BOULEVARD',
    subtitle: 'Main Finish Straight',
    startS: 3380,
    endS: 3600,
  },
];

export interface MinimapEntity {
  x: number;
  z: number;
  yaw: number;
  type: 'player' | 'ai' | 'traffic' | 'checkpoint';
  color?: string;
}

export interface RacerStanding {
  id: string;
  name: string;
  carName: string;
  isPlayer: boolean;
  position: number;
  lap: number;
  totalProgress: number;
  finishTimeMs: number | null;
  gapSeconds: number;
}

export type RaceCommentaryEventType =
  | 'race_start'
  | 'overtake'
  | 'overtaken'
  | 'close_call'
  | 'final_lap'
  | 'nitro_surge'
  | 'collision'
  | 'weather_shift'
  | 'race_finish';

export interface RaceCommentaryAnnouncement {
  id: number;
  eventType: RaceCommentaryEventType;
  badgeLabel: string;
  text: string;
  accentColor: string;
  spoken: boolean;
  timestampMs: number;
}

export interface HUDTelemetry {
  screenState: GameScreenState;
  countdownValue: number; // 3, 2, 1, 0 (0 = GO!), -1 = hidden
  speedKmh: number;
  rpm: number;            // 1000 - 10000
  gear: string;           // 'R', 'N', '1'..'6'
  nitroAmount: number;    // 0 to 100
  nitroActive: boolean;
  nitroBlurIntensity: number; // 0..1 screen-space motion blur intensity
  drifting: boolean;
  position: number;       // 1..7
  totalRacers: number;    // 7
  lap: number;            // 1..totalLaps
  totalLaps: number;      // e.g. 2
  raceTimeMs: number;
  bestLapTimeMs: number | null;
  checkpointIndex: number;
  totalCheckpoints: number;
  districtName: string;
  districtSubtitle: string;
  collisionFlash: number; // 0..1 impact warning
  wrongWay: boolean;
  odometerMeters: number;
  minimapTrackPoints: Array<{ x: number; z: number }>;
  minimapEntities: MinimapEntity[];
  standings: RacerStanding[];
  topSpeedRecordedKmh: number;
  collisionsCount: number;
  weatherId: WeatherConditionId;
  weatherName: string;
  weatherMode: WeatherMode;
  roadFriction: number;
  activeCommentary: RaceCommentaryAnnouncement | null;
}
