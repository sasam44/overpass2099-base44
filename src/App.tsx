import { useEffect, useRef, useState } from 'react';
import { GameManager } from './game/GameManager';
import { HUDManager } from './game/HUDManager';
import {
  CarSpec,
  HUDTelemetry,
  PLAYABLE_CARS,
  QualityPreset,
  WeatherMode,
} from './game/types';
import { TouchControlsState } from './game/InputManager';

const INITIAL_TELEMETRY: HUDTelemetry = {
  screenState: 'title',
  countdownValue: -1,
  speedKmh: 0,
  rpm: 1200,
  gear: '1',
  nitroAmount: 100,
  nitroActive: false,
  nitroBlurIntensity: 0,
  drifting: false,
  position: 1,
  totalRacers: 7,
  lap: 1,
  totalLaps: 2,
  raceTimeMs: 0,
  bestLapTimeMs: null,
  checkpointIndex: 1,
  totalCheckpoints: 8,
  districtName: 'NEO VANTIS DOWNTOWN',
  districtSubtitle: 'Central Skyscraper Expressway',
  collisionFlash: 0,
  wrongWay: false,
  odometerMeters: 0,
  minimapTrackPoints: [],
  minimapEntities: [],
  standings: [],
  topSpeedRecordedKmh: 0,
  collisionsCount: 0,
  weatherId: 'clear',
  weatherName: 'CLEAR DAYLIGHT',
  weatherMode: 'dynamic',
  roadFriction: 1.0,
  activeCommentary: null,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<GameManager | null>(null);

  const [telemetry, setTelemetry] = useState<HUDTelemetry>(INITIAL_TELEMETRY);
  const [selectedCar, setSelectedCar] = useState<CarSpec>(PLAYABLE_CARS[0]);
  const [selectedLaps, setSelectedLaps] = useState<number>(2);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [qualityPreset, setQualityPreset] = useState<QualityPreset>('high');
  const [showTouchControls, setShowTouchControls] = useState<boolean>(false);

  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const manager = new GameManager(mountEl, (snapshot) => {
      setTelemetry(snapshot);
    });
    gameRef.current = manager;

    return () => {
      manager.dispose();
      gameRef.current = null;
    };
  }, []);

  const handleSelectCar = (car: CarSpec) => {
    setSelectedCar(car);
    gameRef.current?.selectCar(car);
  };

  const handleSelectLaps = (laps: number) => {
    setSelectedLaps(laps);
    if (gameRef.current) {
      gameRef.current.race.totalLaps = laps;
      gameRef.current.emitTelemetry();
    }
  };

  const handleSelectWeather = (mode: WeatherMode) => {
    gameRef.current?.setWeatherMode(mode, true);
  };

  const handleCycleWeather = () => {
    gameRef.current?.cycleWeatherMode();
  };

  const handleStartRace = () => {
    gameRef.current?.startRace(selectedLaps);
  };

  const handleTogglePause = () => {
    gameRef.current?.togglePause();
  };

  const handleResetVehicle = () => {
    gameRef.current?.resetPlayerVehicle();
  };

  const handleReturnToMenu = () => {
    gameRef.current?.returnToMainMenu();
  };

  const handleToggleMute = () => {
    if (gameRef.current) {
      const muted = gameRef.current.audio.toggleMute();
      setIsMuted(muted);
    }
  };

  const handleChangeQuality = (preset: QualityPreset) => {
    setQualityPreset(preset);
    gameRef.current?.setQualityPreset(preset);
  };

  const handleTouchInput = (key: keyof TouchControlsState, active: boolean) => {
    gameRef.current?.setTouchControl(key, active);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#07090e]">
      {/* Dedicated isolated WebGL canvas container */}
      <div
        ref={canvasMountRef}
        data-testid="game-canvas-container"
        className="w-full h-full"
      />

      {/* World-Matched Low-Occlusion HUD & Game Shell Modals */}
      <HUDManager
        telemetry={telemetry}
        selectedCar={selectedCar}
        selectedLaps={selectedLaps}
        isMuted={isMuted}
        qualityPreset={qualityPreset}
        showTouchControls={showTouchControls}
        onSelectCar={handleSelectCar}
        onSelectLaps={handleSelectLaps}
        onSelectWeather={handleSelectWeather}
        onCycleWeather={handleCycleWeather}
        onStartRace={handleStartRace}
        onTogglePause={handleTogglePause}
        onResetVehicle={handleResetVehicle}
        onReturnToMenu={handleReturnToMenu}
        onToggleMute={handleToggleMute}
        onChangeQuality={handleChangeQuality}
        onToggleTouchControls={() => setShowTouchControls((prev) => !prev)}
        onTouchInput={handleTouchInput}
      />
    </div>
  );
}
