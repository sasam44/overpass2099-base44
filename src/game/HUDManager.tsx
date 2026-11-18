import React, { useEffect, useRef } from 'react';
import {
  CarSpec,
  HUDTelemetry,
  PLAYABLE_CARS,
  QualityPreset,
  WeatherMode,
} from './types';
import { TouchControlsState } from './InputManager';

interface HUDManagerProps {
  telemetry: HUDTelemetry;
  selectedCar: CarSpec;
  selectedLaps: number;
  isMuted: boolean;
  qualityPreset: QualityPreset;
  showTouchControls: boolean;
  onSelectCar: (car: CarSpec) => void;
  onSelectLaps: (laps: number) => void;
  onSelectWeather: (mode: WeatherMode) => void;
  onCycleWeather: () => void;
  onStartRace: () => void;
  onTogglePause: () => void;
  onResetVehicle: () => void;
  onReturnToMenu: () => void;
  onToggleMute: () => void;
  onChangeQuality: (preset: QualityPreset) => void;
  onToggleTouchControls: () => void;
  onTouchInput: (key: keyof TouchControlsState, active: boolean) => void;
}

export function formatRaceTime(ms: number): string {
  const safeMs = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(safeMs / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const millis = safeMs % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(
    2,
    '0'
  )}.${String(millis).padStart(3, '0')}`;
}

export const HUDManager: React.FC<HUDManagerProps> = ({
  telemetry,
  selectedCar,
  selectedLaps,
  isMuted,
  qualityPreset,
  showTouchControls,
  onSelectCar,
  onSelectLaps,
  onSelectWeather,
  onCycleWeather,
  onStartRace,
  onTogglePause,
  onResetVehicle,
  onReturnToMenu,
  onToggleMute,
  onChangeQuality,
  onToggleTouchControls,
  onTouchInput,
}) => {
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Draw rotating circular route minimap in bottom-left
  useEffect(() => {
    const canvas = minimapCanvasRef.current;
    if (!canvas || telemetry.screenState !== 'playing') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const half = size / 2;
    ctx.clearRect(0, 0, size, size);

    // Circular clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half - 3, 0, Math.PI * 2);
    ctx.clip();

    // Subtle dark radar background
    const bgGrad = ctx.createRadialGradient(half, half, 10, half, half, half);
    bgGrad.addColorStop(0, 'rgba(12, 20, 34, 0.72)');
    bgGrad.addColorStop(1, 'rgba(7, 11, 20, 0.88)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, size, size);

    // Subtle radar grid rings
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(half, half, half * 0.45, 0, Math.PI * 2);
    ctx.stroke();

    const playerEnt = telemetry.minimapEntities.find((e) => e.type === 'player');
    const px = playerEnt ? playerEnt.x : 0;
    const pz = playerEnt ? playerEnt.z : 0;
    const pyaw = playerEnt ? playerEnt.yaw : 0;

    // Transform world coordinates so player is near bottom-center facing UP (like reference screenshot!)
    const scale = 0.24;
    const centerY = half + 22;
    ctx.save();
    ctx.translate(half, centerY);
    ctx.rotate(pyaw);

    // Draw connected road loop
    const pts = telemetry.minimapTrackPoints;
    if (pts.length > 2) {
      // Outer road casing
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const rx = (pts[i].x - px) * scale;
        const ry = (pts[i].z - pz) * scale;
        if (i === 0) ctx.moveTo(rx, ry);
        else ctx.lineTo(rx, ry);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.lineWidth = 12;
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Inner bright road track ribbon
      ctx.strokeStyle = 'rgba(203, 213, 225, 0.85)';
      ctx.lineWidth = 7;
      ctx.stroke();
    }

    // Draw entities (checkpoints, civilian traffic, AI racers)
    for (const ent of telemetry.minimapEntities) {
      if (ent.type === 'player') continue;
      const ex = (ent.x - px) * scale;
      const ey = (ent.z - pz) * scale;

      if (ent.type === 'checkpoint') {
        ctx.beginPath();
        ctx.arc(ex, ey, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#06b6d4';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      } else if (ent.type === 'traffic') {
        ctx.beginPath();
        ctx.arc(ex, ey, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = '#94a3b8';
        ctx.fill();
      } else if (ent.type === 'ai') {
        ctx.beginPath();
        ctx.arc(ex, ey, 5.2, 0, Math.PI * 2);
        ctx.fillStyle = ent.color || '#f8fafc';
        ctx.fill();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = '#0f172a';
        ctx.stroke();
      }
    }

    ctx.restore();

    // Draw Player Arrow at (half, centerY) pointing UP (matching reference screenshot)
    ctx.save();
    ctx.translate(half, centerY);
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(9, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-9, 8);
    ctx.closePath();
    ctx.fillStyle = '#facc15';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    // Crisp outer ring
    ctx.beginPath();
    ctx.arc(half, half, half - 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.85)';
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }, [telemetry]);

  // Calculate tachometer needle angle (-135 deg at 0 RPM to +135 deg at 10,000 RPM)
  const rpmRatio = Math.max(0, Math.min(1, telemetry.rpm / 10000));
  const needleAngleDeg = -135 + rpmRatio * 270;
  const speedFormatted = String(telemetry.speedKmh).padStart(3, '0');
  const odometerFormatted = String(telemetry.odometerMeters).padStart(6, '0');

  return (
    <div className="fixed inset-0 pointer-events-none z-10 overflow-hidden select-none">
      {/* Screen-Space Nitro Boost Radial Speed-Streak & Peripheral Warp Overlay */}
      {telemetry.screenState === 'playing' && telemetry.nitroBlurIntensity > 0.02 && (
        <div
          data-testid="nitro-motion-blur-overlay"
          className="fixed inset-0 pointer-events-none"
          style={{
            opacity: Math.min(1, telemetry.nitroBlurIntensity),
            boxShadow:
              'inset 0 0 110px 28px rgba(6, 182, 212, 0.42), inset 0 0 42px 8px rgba(56, 189, 248, 0.32)',
          }}
        >
          <svg
            viewBox="0 0 1280 720"
            preserveAspectRatio="none"
            className="w-full h-full"
          >
            {Array.from({ length: 36 }).map((_, i) => {
              const angle = (i / 36) * Math.PI * 2;
              const cx = 640;
              const cy = 382;
              const rInner = 250 + ((i * 37) % 95);
              const rOuter = 740;
              const x1 = cx + Math.cos(angle) * rInner;
              const y1 = cy + Math.sin(angle) * (rInner * 0.68);
              const x2 = cx + Math.cos(angle) * rOuter;
              const y2 = cy + Math.sin(angle) * (rOuter * 0.72);
              const isCyan = i % 2 === 0;
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={isCyan ? 'rgba(56, 189, 248, 0.42)' : 'rgba(224, 242, 254, 0.34)'}
                  strokeWidth={i % 3 === 0 ? '2.6' : '1.4'}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
        </div>
      )}

      {/* Multi-Layered Collision Impact Vignette, Corner Glass Fracture Lines & Chassis Warning */}
      {telemetry.collisionFlash > 0.02 && (
        <div
          data-testid="collision-impact-overlay"
          className="fixed inset-0 pointer-events-none transition-opacity duration-75"
          style={{
            opacity: Math.min(1, telemetry.collisionFlash * 0.92),
            boxShadow:
              'inset 0 0 115px 34px rgba(239, 68, 68, 0.85), inset 0 0 48px 12px rgba(249, 115, 22, 0.65)',
          }}
        >
          <svg
            viewBox="0 0 1280 720"
            preserveAspectRatio="none"
            className="w-full h-full"
          >
            {/* Top-Left & Bottom-Right Windshield Impact Fracture & Spark Lines */}
            <g stroke="rgba(254, 215, 170, 0.85)" strokeWidth="2.2" fill="none">
              <polyline points="0,0 115,68 195,52 260,105" />
              <polyline points="115,68 88,145 142,210" />
              <polyline points="0,120 96,132 165,178" />
              <polyline points="1280,0 1155,74 1075,58 1015,112" />
              <polyline points="1155,74 1185,152 1135,215" />
              <polyline points="0,720 128,635 215,652" />
              <polyline points="1280,720 1148,638 1068,655" />
            </g>
            {/* High-Energy Orange/Amber Impact Shock Streaks */}
            <g stroke="rgba(249, 115, 22, 0.72)" strokeWidth="3.2">
              <line x1="0" y1="0" x2="180" y2="115" />
              <line x1="1280" y1="0" x2="1100" y2="115" />
              <line x1="0" y1="720" x2="180" y2="605" />
              <line x1="1280" y1="720" x2="1100" y2="605" />
            </g>
          </svg>

          {telemetry.collisionFlash > 0.25 && (
            <div className="fixed inset-x-0 top-20 flex justify-center">
              <div className="px-4 py-1 bg-rose-600/95 border border-amber-300 rounded font-display italic font-bold text-sm tracking-widest uppercase text-white shadow-lg">
                IMPACT WARNING // CHASSIS COLLISION DETECTED
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          1. TITLE SCREEN & INTERACTIVE CAR SELECTION SHOWCASE
         ===================================================================== */}
      {telemetry.screenState === 'title' && (
        <main className="fixed inset-0 flex flex-col justify-between p-6 md:p-10 pointer-events-none">
          {/* Top Bar: Subtle World Identifier & Audio/Quality Quick Controls */}
          <div className="flex items-center justify-between w-full">
            <div className="text-xs font-mono-tabular tracking-widest text-slate-300 uppercase hud-text-shadow">
              NEO VANTIS METROPOLITAN CIRCUIT · 3.6 KM · 7 DISTRICTS
            </div>
            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onChangeQuality(qualityPreset === 'high' ? 'performance' : 'high');
                }}
                aria-label="Toggle Graphics Quality"
                className="px-3 py-1.5 text-xs font-semibold tracking-wider uppercase bg-[#0b111e]/90 hover:bg-[#162238] text-slate-200 border border-slate-700/80 rounded transition-colors cursor-pointer"
              >
                Quality: {qualityPreset === 'high' ? 'High' : 'Performance'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleMute();
                }}
                aria-label={isMuted ? 'Unmute Audio' : 'Mute Audio'}
                className="px-3 py-1.5 text-xs font-semibold tracking-wider uppercase bg-[#0b111e]/90 hover:bg-[#162238] text-slate-200 border border-slate-700/80 rounded transition-colors cursor-pointer"
              >
                Audio: {isMuted ? 'Muted' : 'On'}
              </button>
            </div>
          </div>

          {/* Left-Aligned Title Lockup & Car Selection Panel over 35% Negative Space */}
          <div className="w-full max-w-md my-auto pointer-events-auto bg-[#080d18]/92 border border-slate-700/75 rounded-lg p-6 shadow-2xl">
            {/* Bespoke Inline SVG Title Emblem */}
            <div className="mb-5">
              <svg
                viewBox="0 0 420 96"
                className="w-full h-auto overflow-visible"
                role="img"
                aria-label="Overpass 2099"
              >
                {/* Geometric Speed Wing Emblem */}
                <polygon points="0,16 52,16 38,32 0,32" fill="#f59e0b" />
                <polygon points="48,16 74,16 60,32 34,32" fill="#06b6d4" />
                <text
                  x="84"
                  y="29"
                  fill="#94a3b8"
                  fontFamily="Chakra Petch, sans-serif"
                  fontWeight="700"
                  fontSize="13"
                  letterSpacing="3"
                >
                  NEO VANTIS · STREET CIRCUIT
                </text>
                <text
                  x="2"
                  y="68"
                  fill="#f8fafc"
                  fontFamily="Chakra Petch, sans-serif"
                  fontStyle="italic"
                  fontWeight="700"
                  fontSize="44"
                  letterSpacing="1.5"
                >
                  <tspan>OVERPASS</tspan>
                  <tspan dx="14" fill="#f59e0b" fontSize="34" letterSpacing="1">2099</tspan>
                </text>
                <rect x="2" y="80" width="410" height="2" fill="#1e293b" />
                <rect x="2" y="80" width="128" height="2" fill="#f59e0b" />
              </svg>
            </div>

            {/* Car Selection Selector */}
            <div className="mb-5">
              <div className="flex items-center justify-between text-xs uppercase tracking-wider text-slate-400 mb-2">
                <span>Select Interceptor</span>
                <span className="font-mono-tabular text-amber-400">
                  {selectedCar.topSpeedKmh} KM/H MAX
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-4">
                {PLAYABLE_CARS.map((car) => {
                  const active = car.id === selectedCar.id;
                  return (
                    <button
                      key={car.id}
                      type="button"
                      onClick={() => onSelectCar(car)}
                      className={`px-2.5 py-2 rounded text-left border transition-colors cursor-pointer ${
                        active
                          ? 'bg-amber-500/15 border-amber-400 text-white'
                          : 'bg-[#0f172a]/90 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-display font-bold text-xs tracking-wide whitespace-nowrap">
                          {car.badgeText}
                        </span>
                        <span
                          className="w-3 h-3 rounded-sm border border-white/30"
                          style={{
                            backgroundColor:
                              '#' + car.colorHex.toString(16).padStart(6, '0'),
                          }}
                        />
                      </div>
                      <div className="text-[11px] font-medium truncate">
                        {car.name.split(' ')[0]}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selected Car Specs */}
              <div className="bg-[#0d1424] border border-slate-800/90 rounded p-3.5 space-y-2">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-display font-bold text-base text-white tracking-wide">
                    {selectedCar.name}
                  </h2>
                  <span className="text-xs text-slate-400">
                    {selectedCar.tagline}
                  </span>
                </div>

                {(
                  [
                    ['Top Speed', selectedCar.stats.speed, '#f59e0b'],
                    ['Acceleration', selectedCar.stats.accel, '#38bdf8'],
                    ['Handling', selectedCar.stats.handling, '#10b981'],
                    ['Nitro Boost', selectedCar.stats.nitro, '#a855f7'],
                  ] as const
                ).map(([label, val, color]) => (
                  <div key={label} className="flex items-center gap-3 text-xs">
                    <span className="w-24 text-slate-400">{label}</span>
                    <div className="flex-1 h-2 bg-slate-800 rounded-sm overflow-hidden">
                      <div
                        className="h-full transition-all duration-200"
                        style={{ width: `${val}%`, backgroundColor: color }}
                      />
                    </div>
                    <span className="w-8 text-right font-mono-tabular text-slate-200">
                      {val}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Race Laps & Weather Conditions Selector */}
            <div className="space-y-3 mb-5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 uppercase tracking-wider">
                  Circuit Distance
                </span>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3].map((laps) => (
                    <button
                      key={laps}
                      type="button"
                      onClick={() => onSelectLaps(laps)}
                      className={`px-3 py-1 rounded font-mono-tabular font-semibold transition-colors cursor-pointer ${
                        selectedLaps === laps
                          ? 'bg-cyan-500 text-slate-950'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {laps} {laps === 1 ? 'LAP' : 'LAPS'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400 uppercase tracking-wider">
                  Weather & Grip
                </span>
                <div className="flex items-center gap-1">
                  {(
                    [
                      ['dynamic', 'DYNAMIC'],
                      ['clear', 'CLEAR'],
                      ['rain', 'RAIN'],
                      ['neon_fog', 'NEON FOG'],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onSelectWeather(mode)}
                      className={`px-2 py-1 rounded font-mono-tabular font-semibold text-[11px] transition-colors cursor-pointer ${
                        telemetry.weatherMode === mode
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Primary Start Race Action */}
            <button
              type="button"
              data-start="true"
              onClick={(e) => {
                e.currentTarget.blur();
                onStartRace();
              }}
              className="w-full py-3.5 px-6 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-display font-bold italic text-xl tracking-wider uppercase rounded transition-colors shadow-lg cursor-pointer"
            >
              START STREET RACE
            </button>
          </div>

          {/* Single Flat Borderless Control-Hint Line in Bottom Safe Margin */}
          <div className="w-full text-center text-xs font-mono-tabular tracking-wider text-slate-300 hud-text-shadow">
            WASD / Arrows Drive · Shift Nitro · Space Handbrake · C Weather · R Reset Car · P / Esc Pause
          </div>
        </main>
      )}

      {/* =====================================================================
          2. ACTIVE RACING HUD (LOW-OCCLUSION PERIMETER CLUSTERS)
         ===================================================================== */}
      {telemetry.screenState === 'playing' && (
        <>
          {/* TOP-LEFT CLUSTER: POS 1/7 & District / Checkpoint */}
          <div className="fixed top-4 left-6 flex flex-col items-start pointer-events-none">
            <span className="text-xs font-display font-bold tracking-widest uppercase text-slate-200 hud-text-shadow">
              POS
            </span>
            <div className="flex items-baseline font-display italic font-bold hud-text-shadow -mt-1">
              <span className="text-5xl md:text-6xl text-white tabular-nums">
                {telemetry.position}
              </span>
              <span className="text-2xl md:text-3xl text-slate-300 tabular-nums ml-0.5">
                /{telemetry.totalRacers}
              </span>
            </div>
            <div className="mt-1 text-xs font-mono-tabular text-cyan-300 hud-text-shadow">
              {telemetry.districtName} · CP {telemetry.checkpointIndex}/{telemetry.totalCheckpoints}
            </div>
            <div className="mt-0.5 text-[11px] font-mono-tabular text-amber-300 hud-text-shadow">
              {telemetry.weatherName} · GRIP {Math.round(telemetry.roadFriction * 100)}%
            </div>
          </div>

          {/* TOP-RIGHT CLUSTER: LAP 1/2, Race Timer, and Utility Icon Buttons */}
          <div className="fixed top-4 right-6 flex flex-col items-end pointer-events-none">
            <div className="flex items-start gap-4">
              {/* Utility Buttons ([C] Weather, [PAD], [R] Reset, [M] Mute, [P] Pause) */}
              <div className="flex items-center gap-1.5 pointer-events-auto mt-1">
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onCycleWeather();
                  }}
                  aria-label="Cycle Weather Condition [C]"
                  title="Cycle Weather Condition [C]"
                  className="px-2.5 h-9 flex items-center justify-center rounded bg-[#0b111e]/85 hover:bg-[#162238] border border-slate-700/80 text-amber-300 text-[11px] font-mono-tabular font-bold transition-colors cursor-pointer"
                >
                  {telemetry.weatherMode === 'dynamic'
                    ? `DYN:${telemetry.weatherId === 'neon_fog' ? 'FOG' : telemetry.weatherId.toUpperCase()}`
                    : telemetry.weatherMode === 'neon_fog'
                    ? 'FOG'
                    : telemetry.weatherMode.toUpperCase()}
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onToggleTouchControls();
                  }}
                  aria-label="Toggle Touch Controls"
                  title="Toggle On-Screen Touch Controls"
                  className={`w-9 h-9 flex items-center justify-center rounded border text-xs font-mono-tabular font-bold transition-colors cursor-pointer ${
                    showTouchControls
                      ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
                      : 'bg-[#0b111e]/85 hover:bg-[#162238] border-slate-700/80 text-slate-200'
                  }`}
                >
                  PAD
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onResetVehicle();
                  }}
                  aria-label="Reset Vehicle [R]"
                  title="Reset Vehicle [R]"
                  className="w-9 h-9 flex items-center justify-center rounded bg-[#0b111e]/85 hover:bg-[#162238] border border-slate-700/80 text-slate-200 transition-colors cursor-pointer"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2.2">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onToggleMute();
                  }}
                  aria-label={isMuted ? 'Unmute Audio [M]' : 'Mute Audio [M]'}
                  title="Mute / Unmute Audio [M]"
                  className="w-9 h-9 flex items-center justify-center rounded bg-[#0b111e]/85 hover:bg-[#162238] border border-slate-700/80 text-slate-200 transition-colors cursor-pointer"
                >
                  {isMuted ? (
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2.2">
                      <path d="M11 5L6 9H2v6h4l5 4V5z" />
                      <line x1="23" y1="9" x2="17" y2="15" />
                      <line x1="17" y1="9" x2="23" y2="15" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-none stroke-current" strokeWidth="2.2">
                      <path d="M11 5L6 9H2v6h4l5 4V5z" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onTogglePause();
                  }}
                  aria-label="Pause Race [P]"
                  title="Pause Race [P]"
                  className="w-9 h-9 flex items-center justify-center rounded bg-[#0b111e]/85 hover:bg-[#162238] border border-slate-700/80 text-slate-200 transition-colors cursor-pointer"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                </button>
              </div>

              {/* LAP & TIMER */}
              <div className="flex flex-col items-end">
                <span className="text-xs font-display font-bold tracking-widest uppercase text-slate-200 hud-text-shadow">
                  LAP
                </span>
                <div className="flex items-baseline font-display italic font-bold hud-text-shadow -mt-1">
                  <span className="text-5xl md:text-6xl text-white tabular-nums">
                    {telemetry.lap}
                  </span>
                  <span className="text-2xl md:text-3xl text-slate-300 tabular-nums ml-0.5">
                    /{telemetry.totalLaps}
                  </span>
                </div>
                <div className="text-lg md:text-xl font-display italic font-bold text-slate-100 tabular-nums hud-text-shadow -mt-0.5">
                  {formatRaceTime(telemetry.raceTimeMs)}
                </div>
              </div>
            </div>
          </div>

          {/* SILENT RACE TELEMETRY TICKER (Top-Center Perimeter, No AI Voice) */}
          {telemetry.activeCommentary && (
            <div
              data-testid="ai-race-commentary-banner"
              className="fixed inset-x-0 top-3.5 flex justify-center pointer-events-none px-4"
            >
              <div
                className="max-w-sm w-full bg-[#070c18]/90 border rounded-md px-3 py-1.5 shadow-2xl"
                style={{
                  borderColor: telemetry.activeCommentary.accentColor,
                }}
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span
                    className="text-[10px] font-mono-tabular font-bold uppercase tracking-widest"
                    style={{ color: telemetry.activeCommentary.accentColor }}
                  >
                    RACE TELEMETRY // {telemetry.activeCommentary.badgeLabel}
                  </span>
                  <span className="text-[10px] font-mono-tabular text-slate-400">
                    #{selectedCar.raceNumber} · {telemetry.speedKmh} KM/H
                  </span>
                </div>
                <p className="text-[11px] font-display font-semibold text-slate-100 leading-tight">
                  “{telemetry.activeCommentary.text}”
                </p>
              </div>
            </div>
          )}

          {/* RACE COUNTDOWN BANNER (3, 2, 1, GO!) */}
          {telemetry.countdownValue >= 0 && (
            <div className="fixed inset-x-0 top-1/4 flex flex-col items-center justify-center pointer-events-none">
              <div
                className={`font-display italic font-bold text-7xl md:text-8xl tracking-wider hud-text-shadow ${
                  telemetry.countdownValue === 0 ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {telemetry.countdownValue === 0 ? 'GO!' : telemetry.countdownValue}
              </div>
              <div className="text-xs font-mono-tabular uppercase tracking-widest text-slate-200 hud-text-shadow mt-1">
                {telemetry.countdownValue === 0
                  ? 'FULL THROTTLE — CLEAR ALL CHECKPOINTS'
                  : 'HOLD W / UP TO REV ENGINE'}
              </div>
            </div>
          )}

          {/* WRONG WAY ALERT */}
          {telemetry.wrongWay && (
            <div className="fixed inset-x-0 top-24 flex justify-center pointer-events-none">
              <div className="px-5 py-2 bg-rose-600/90 border border-rose-300 rounded font-display font-bold text-lg tracking-widest uppercase text-white shadow-lg">
                WRONG DIRECTION — PRESS R TO RESET
              </div>
            </div>
          )}

          {/* BOTTOM-LEFT CLUSTER: Circular Route Minimap (Matches Reference Image) */}
          <div className="fixed bottom-5 left-6 pointer-events-none">
            <canvas
              ref={minimapCanvasRef}
              width={164}
              height={164}
              className="w-[140px] h-[140px] md:w-[164px] md:h-[164px] rounded-full shadow-2xl"
            />
          </div>

          {/* BOTTOM-RIGHT CLUSTER: Radial Tachometer, Gear, Digital Speedometer & Nitro Bar */}
          <div
            data-testid="tachometer-hud-cluster"
            data-drifting={telemetry.drifting ? 'true' : 'false'}
            className={`fixed bottom-4 right-6 flex flex-col items-end pointer-events-none ${
              telemetry.drifting ? 'drift-hud-shake' : ''
            }`}
          >
            <div className="relative w-[176px] h-[176px] md:w-[196px] md:h-[196px]">
              <svg viewBox="0 0 200 200" className="w-full h-full overflow-visible">
                {/* Dark Translucent Dial Backing */}
                <circle
                  cx="100"
                  cy="100"
                  r="88"
                  fill="rgba(8, 13, 24, 0.72)"
                  stroke={
                    telemetry.drifting
                      ? 'rgba(245, 158, 11, 0.65)'
                      : 'rgba(148, 163, 184, 0.25)'
                  }
                  strokeWidth="2"
                />

                {/* Outer Tachometer Arc (-135 deg to +81 deg normal, +81 to +135 deg redline) */}
                <path
                  d="M 37.8 162.2 A 88 88 0 1 1 186.9 86.2"
                  fill="none"
                  stroke="rgba(226, 232, 240, 0.85)"
                  strokeWidth="3"
                />
                <path
                  d="M 186.9 86.2 A 88 88 0 0 1 162.2 162.2"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="4"
                />

                {/* RPM Ticks 0..10 */}
                {Array.from({ length: 11 }).map((_, idx) => {
                  const angleDeg = -135 + (idx / 10) * 270;
                  const rad = ((angleDeg - 90) * Math.PI) / 180;
                  const x1 = 100 + Math.cos(rad) * 86;
                  const y1 = 100 + Math.sin(rad) * 86;
                  const x2 = 100 + Math.cos(rad) * 74;
                  const y2 = 100 + Math.sin(rad) * 74;
                  const tx = 100 + Math.cos(rad) * 62;
                  const ty = 100 + Math.sin(rad) * 62;
                  const isRed = idx >= 8;
                  return (
                    <g key={idx}>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={isRed ? '#ef4444' : '#e2e8f0'}
                        strokeWidth="2.2"
                      />
                      {idx <= 8 && (
                        <text
                          x={tx}
                          y={ty + 4}
                          textAnchor="middle"
                          fill={isRed ? '#ef4444' : '#cbd5e1'}
                          fontFamily="Chakra Petch, sans-serif"
                          fontWeight="700"
                          fontSize="11"
                        >
                          {idx}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Tachometer Needle */}
                <g transform={`rotate(${needleAngleDeg} 100 100)`}>
                  <polygon
                    points="97,100 103,100 101,24 99,24"
                    fill={
                      telemetry.nitroActive
                        ? '#38bdf8'
                        : telemetry.drifting
                        ? '#f59e0b'
                        : '#e2e8f0'
                    }
                  />
                </g>

                {/* Center Gear Circle */}
                <circle
                  cx="100"
                  cy="100"
                  r="19"
                  fill="rgba(15, 23, 42, 0.95)"
                  stroke={
                    telemetry.nitroActive
                      ? '#38bdf8'
                      : telemetry.drifting
                      ? '#f59e0b'
                      : '#cbd5e1'
                  }
                  strokeWidth="2.2"
                />
                <text
                  x="100"
                  y="107"
                  textAnchor="middle"
                  fill="#ffffff"
                  fontFamily="Chakra Petch, sans-serif"
                  fontWeight="700"
                  fontSize="21"
                >
                  {telemetry.gear}
                </text>
              </svg>

              {/* Digital Speed Readout (Bottom-Right of Dial like Reference Image) */}
              <div className="absolute bottom-2 right-1 flex flex-col items-end">
                <span className="text-[10px] font-display font-bold tracking-widest text-slate-300 uppercase hud-text-shadow">
                  KM/H
                </span>
                <div className="font-display italic font-bold text-4xl md:text-5xl leading-none text-white tabular-nums hud-text-shadow">
                  {speedFormatted}
                </div>
                <span className="text-[10px] font-mono-tabular text-slate-300 hud-text-shadow mt-0.5">
                  {odometerFormatted}
                </span>
              </div>
            </div>

            {/* Integrated Nitro Meter Bar directly beneath Speedometer */}
            <div className="w-[176px] md:w-[196px] mt-1 bg-[#080d18]/90 border border-slate-700/80 rounded p-1.5">
              <div className="flex items-center justify-between text-[10px] font-display font-bold tracking-wider uppercase mb-1">
                <span
                  className={
                    telemetry.nitroActive
                      ? 'text-cyan-300'
                      : telemetry.drifting
                      ? 'text-amber-400'
                      : 'text-slate-300'
                  }
                >
                  {telemetry.nitroActive
                    ? 'NITRO BOOST ACTIVE'
                    : telemetry.drifting
                    ? 'DRIFT // +2X NOS'
                    : 'NITRO [SHIFT]'}
                </span>
                <span className="font-mono-tabular text-cyan-300">
                  {telemetry.nitroAmount}%
                </span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-sm overflow-hidden">
                <div
                  className="h-full transition-all duration-75"
                  style={{
                    width: `${telemetry.nitroAmount}%`,
                    backgroundColor: telemetry.nitroActive
                      ? '#38bdf8'
                      : telemetry.drifting
                      ? '#f59e0b'
                      : '#06b6d4',
                  }}
                />
              </div>
            </div>
          </div>

          {/* =================================================================
              MOBILE / ON-SCREEN TOUCH CONTROLS (Responsive & Hold-Capable)
             ================================================================= */}
          <div
            className={`fixed inset-x-0 bottom-56 md:bottom-6 px-4 md:px-64 flex items-end justify-between pointer-events-none ${
              showTouchControls ? 'flex' : 'flex md:hidden'
            }`}
          >
            {/* Left & Right Steering Pad */}
            <div className="flex items-center gap-2.5 pointer-events-auto">
              <button
                type="button"
                aria-label="Steer Left"
                onPointerDown={() => onTouchInput('left', true)}
                onPointerUp={() => onTouchInput('left', false)}
                onPointerLeave={() => onTouchInput('left', false)}
                onPointerCancel={() => onTouchInput('left', false)}
                className="w-14 h-14 md:w-16 md:h-16 rounded-lg bg-[#0b111e]/90 active:bg-amber-500 active:text-slate-950 border border-slate-600/80 flex items-center justify-center text-white font-display font-bold text-lg shadow-lg cursor-pointer"
              >
                ◀
              </button>
              <button
                type="button"
                aria-label="Steer Right"
                onPointerDown={() => onTouchInput('right', true)}
                onPointerUp={() => onTouchInput('right', false)}
                onPointerLeave={() => onTouchInput('right', false)}
                onPointerCancel={() => onTouchInput('right', false)}
                className="w-14 h-14 md:w-16 md:h-16 rounded-lg bg-[#0b111e]/90 active:bg-amber-500 active:text-slate-950 border border-slate-600/80 flex items-center justify-center text-white font-display font-bold text-lg shadow-lg cursor-pointer"
              >
                ▶
              </button>
            </div>

            {/* Right Pedals: Nitro, Brake/Rev, Accelerate */}
            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                type="button"
                aria-label="Nitro Boost"
                onPointerDown={() => onTouchInput('nitro', true)}
                onPointerUp={() => onTouchInput('nitro', false)}
                onPointerLeave={() => onTouchInput('nitro', false)}
                onPointerCancel={() => onTouchInput('nitro', false)}
                className="w-12 h-14 md:w-14 md:h-16 rounded-lg bg-cyan-600/90 active:bg-cyan-400 text-slate-950 border border-cyan-300 flex flex-col items-center justify-center font-display font-bold text-xs tracking-wider uppercase shadow-lg cursor-pointer"
              >
                <span>NOS</span>
              </button>
              <button
                type="button"
                aria-label="Brake and Reverse"
                onPointerDown={() => onTouchInput('brake', true)}
                onPointerUp={() => onTouchInput('brake', false)}
                onPointerLeave={() => onTouchInput('brake', false)}
                onPointerCancel={() => onTouchInput('brake', false)}
                className="w-12 h-14 md:w-14 md:h-16 rounded-lg bg-rose-700/90 active:bg-rose-500 text-white border border-rose-400 flex flex-col items-center justify-center font-display font-bold text-xs tracking-wider uppercase shadow-lg cursor-pointer"
              >
                <span>BRK</span>
              </button>
              <button
                type="button"
                aria-label="Accelerate"
                onPointerDown={() => onTouchInput('accelerate', true)}
                onPointerUp={() => onTouchInput('accelerate', false)}
                onPointerLeave={() => onTouchInput('accelerate', false)}
                onPointerCancel={() => onTouchInput('accelerate', false)}
                className="w-14 h-16 md:w-16 md:h-20 rounded-lg bg-emerald-600/90 active:bg-emerald-400 text-slate-950 border border-emerald-300 flex flex-col items-center justify-center font-display font-bold text-xs md:text-sm tracking-wider uppercase shadow-lg cursor-pointer"
              >
                <span>GAS</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* =====================================================================
          3. PAUSE MODAL ('paused')
         ===================================================================== */}
      {telemetry.screenState === 'paused' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Race Paused"
          className="fixed inset-0 bg-[#050811]/80 flex items-center justify-center p-6 pointer-events-auto"
        >
          <div className="w-full max-w-md bg-[#0b1220] border border-slate-700 rounded-lg p-6 shadow-2xl">
            <div className="text-xs font-mono-tabular uppercase tracking-widest text-amber-400 mb-1">
              RACE SUSPENDED
            </div>
            <h2 className="font-display italic font-bold text-3xl text-white tracking-wide mb-4">
              SYSTEM PAUSED
            </h2>

            <div className="grid grid-cols-3 gap-2.5 mb-6">
              <div className="bg-[#070b14] border border-slate-800 rounded p-3">
                <div className="text-[11px] text-slate-400 uppercase">Position</div>
                <div className="font-display font-bold text-2xl text-white tabular-nums">
                  {telemetry.position}/{telemetry.totalRacers}
                </div>
              </div>
              <div className="bg-[#070b14] border border-slate-800 rounded p-3">
                <div className="text-[11px] text-slate-400 uppercase">Lap</div>
                <div className="font-display font-bold text-2xl text-white tabular-nums">
                  {telemetry.lap}/{telemetry.totalLaps}
                </div>
              </div>
              <div className="bg-[#070b14] border border-slate-800 rounded p-3">
                <div className="text-[11px] text-slate-400 uppercase">Elapsed</div>
                <div className="font-mono-tabular font-semibold text-sm text-cyan-300 mt-1.5">
                  {formatRaceTime(telemetry.raceTimeMs)}
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={onTogglePause}
                className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold italic text-lg tracking-wider uppercase rounded transition-colors cursor-pointer"
              >
                Resume Race
              </button>
              <button
                type="button"
                onClick={onStartRace}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white font-display font-semibold text-sm tracking-wider uppercase rounded border border-slate-600 transition-colors cursor-pointer"
              >
                Restart Race
              </button>
              <button
                type="button"
                onClick={onReturnToMenu}
                className="w-full py-2.5 px-4 bg-transparent hover:bg-slate-800/60 text-slate-300 font-display font-semibold text-sm tracking-wider uppercase rounded border border-slate-700 transition-colors cursor-pointer"
              >
                Return to Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          4. VICTORY / DEFEAT RACE RESULTS SCREEN ('gameover')
         ===================================================================== */}
      {telemetry.screenState === 'gameover' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Race Results"
          className="fixed inset-0 bg-[#050811]/85 flex items-center justify-center p-6 pointer-events-auto"
        >
          <div className="w-full max-w-lg bg-[#0b1220] border border-slate-700 rounded-lg p-6 shadow-2xl">
            <div className="flex items-baseline justify-between mb-1">
              <span
                className={`text-xs font-mono-tabular font-bold uppercase tracking-widest ${
                  telemetry.position <= 3 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {telemetry.position === 1
                  ? 'FIRST PLACE VICTORY'
                  : telemetry.position <= 3
                  ? 'PODIUM FINISH'
                  : 'RACE COMPLETE — DEFEAT'}
              </span>
              <span className="text-xs font-mono-tabular text-slate-400">
                NEO VANTIS CIRCUIT
              </span>
            </div>

            <h2 className="font-display italic font-bold text-3xl md:text-4xl text-white tracking-wide mb-4">
              {telemetry.position === 1
                ? 'CHAMPION OF NEO VANTIS'
                : telemetry.position <= 3
                ? `FINISHED P${telemetry.position} ON PODIUM`
                : `FINISHED POSITION #${telemetry.position}`}
            </h2>

            {/* Summary Mastery / Progress Stat Tiles */}
            <div className="grid grid-cols-3 gap-2.5 mb-5">
              <div className="bg-[#070b14] border border-slate-800 rounded p-3">
                <div className="text-[11px] text-slate-400 uppercase">Total Time</div>
                <div className="font-mono-tabular font-bold text-base text-white mt-0.5">
                  {formatRaceTime(telemetry.raceTimeMs)}
                </div>
              </div>
              <div className="bg-[#070b14] border border-slate-800 rounded p-3">
                <div className="text-[11px] text-slate-400 uppercase">Top Speed</div>
                <div className="font-display font-bold text-xl text-amber-400 tabular-nums">
                  {telemetry.topSpeedRecordedKmh} KM/H
                </div>
              </div>
              <div className="bg-[#070b14] border border-slate-800 rounded p-3">
                <div className="text-[11px] text-slate-400 uppercase">Best Lap</div>
                <div className="font-mono-tabular font-bold text-base text-cyan-300 mt-0.5">
                  {telemetry.bestLapTimeMs
                    ? formatRaceTime(telemetry.bestLapTimeMs)
                    : formatRaceTime(Math.round(telemetry.raceTimeMs / telemetry.totalLaps))}
                </div>
              </div>
            </div>

            {/* Standings Table */}
            <div className="bg-[#070b14] border border-slate-800 rounded mb-5 overflow-hidden">
              <div className="grid grid-cols-12 px-3 py-2 text-[11px] font-mono-tabular uppercase text-slate-400 border-b border-slate-800">
                <span className="col-span-2">POS</span>
                <span className="col-span-5">DRIVER</span>
                <span className="col-span-3">VEHICLE</span>
                <span className="col-span-2 text-right">GAP</span>
              </div>
              <div className="max-h-44 overflow-y-auto divide-y divide-slate-800/60">
                {telemetry.standings.map((row) => (
                  <div
                    key={row.id}
                    className={`grid grid-cols-12 px-3 py-2 text-xs items-center ${
                      row.isPlayer
                        ? 'bg-amber-500/15 text-amber-300 font-semibold'
                        : 'text-slate-300'
                    }`}
                  >
                    <span className="col-span-2 font-mono-tabular font-bold">
                      #{row.position}
                    </span>
                    <span className="col-span-5 truncate">{row.name}</span>
                    <span className="col-span-3 truncate text-slate-400">
                      {row.carName}
                    </span>
                    <span className="col-span-2 text-right font-mono-tabular">
                      {row.position === 1 ? 'LEADER' : `+${row.gapSeconds.toFixed(1)}s`}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Primary Actions */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                data-start="true"
                onClick={onStartRace}
                className="flex-1 py-3 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold italic text-lg tracking-wider uppercase rounded transition-colors cursor-pointer"
              >
                Race Again
              </button>
              <button
                type="button"
                onClick={onReturnToMenu}
                className="py-3 px-5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-display font-semibold text-sm tracking-wider uppercase rounded border border-slate-600 transition-colors cursor-pointer"
              >
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
