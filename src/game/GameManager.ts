import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  CarSpec,
  CIRCUIT_LENGTH,
  GameScreenState,
  HUDTelemetry,
  PLAYABLE_CARS,
  QualityPreset,
  WEATHER_ORDER,
  WEATHER_PRESETS,
  WeatherConditionId,
  WeatherConfig,
  WeatherMode,
} from './types';
import { RoadSystem } from './RoadSystem';
import { CityEnvironment } from './CityEnvironment';
import { PlayerCar } from './PlayerCar';
import { RacingAI } from './RacingAI';
import { TrafficManager } from './TrafficManager';
import { CollisionSystem } from './CollisionSystem';
import { CheckpointSystem } from './CheckpointSystem';
import { CameraController } from './CameraController';
import { AudioManager } from './AudioManager';
import { InputManager, TouchControlsState } from './InputManager';
import { RaceManager } from './RaceManager';
import { NitroMotionBlurPass } from './NitroMotionBlurPass';
import { RaceCommentarySystem } from './RaceCommentarySystem';
import { getDistrictAtS } from './VehiclePhysics';

export class GameManager {
  public readonly scene: THREE.Scene;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly isSoftwareGl: boolean;
  public readonly road: RoadSystem;
  public readonly city: CityEnvironment;
  public readonly player: PlayerCar;
  public readonly ai: RacingAI;
  public readonly traffic: TrafficManager;
  public readonly collisions: CollisionSystem;
  public readonly checkpoints: CheckpointSystem;
  public readonly cameraController: CameraController;
  public readonly nitroPostProcessor: NitroMotionBlurPass;
  public readonly audio: AudioManager;
  public readonly input: InputManager;
  public readonly race: RaceManager;
  public readonly commentary: RaceCommentarySystem;

  private readonly container: HTMLElement;
  private readonly onTelemetryUpdate: (telemetry: HUDTelemetry) => void;
  private readonly keyLight: THREE.DirectionalLight;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly sceneFog: THREE.FogExp2;

  // Dynamic Weather State & 3D Rain/Mist Particle System
  public weatherMode: WeatherMode = 'dynamic';
  public fromWeatherId: WeatherConditionId = 'clear';
  public targetWeatherId: WeatherConditionId = 'clear';
  public weatherBlend = 1.0;
  public currentRoadFriction = 1.0;
  private dynamicWeatherTimer = 0;

  private readonly rainCount = 650;
  private readonly rainDrops: Float32Array; // [offsetX, offsetY, offsetZ, speedScale] per drop
  private readonly rainLinePositions: Float32Array;
  private readonly rainMaterial: THREE.LineBasicMaterial;
  private readonly rainLines: THREE.LineSegments;

  // Reusable colors for zero-GC weather interpolation
  private readonly _colA = new THREE.Color();
  private readonly _colB = new THREE.Color();

  private frameId = 0;
  private isDisposed = false;
  private lastTimestamp = 0;
  private hudAccumulator = 0;
  private hitstopTimer = 0;
  public qualityPreset: QualityPreset = 'high';

  private readonly onResizeBound: () => void;

  constructor(
    container: HTMLElement,
    onTelemetryUpdate: (telemetry: HUDTelemetry) => void
  ) {
    this.container = container;
    this.onTelemetryUpdate = onTelemetryUpdate;

    // 1. Detect software WebGL (SwiftShader, llvmpipe, etc.) per threejs skill
    this.isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = Math.max(320, container.clientWidth || window.innerWidth);
    const height = Math.max(240, container.clientHeight || window.innerHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(this.renderer.domElement);

    // 2. Scene, Sunlit Daytime Sky Background, Horizon Fog & Studio RoomEnvironment
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9bd2f2);
    this.sceneFog = new THREE.FogExp2(0xa7d8f5, 0.0011);
    this.scene.fog = this.sceneFog;

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    pmremGenerator.dispose();

    // 3. Warm Sunlit Daylight Rig (Golden-White Sun Key Light + Sky/Earth Hemisphere Fill)
    this.hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x989068, 1.35);
    this.hemiLight.position.set(0, 140, 0);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfff9e6, 2.65);
    this.keyLight.position.set(65, 115, 45);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.width = 1024;
    this.keyLight.shadow.mapSize.height = 1024;
    const d = 48;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.camera.near = 10;
    this.keyLight.shadow.camera.far = 240;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    // 4. Initialize Subsystems
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.road = new RoadSystem(maxAniso);
    this.scene.add(this.road.roadGroup);

    this.city = new CityEnvironment(this.road, maxAniso);
    this.scene.add(this.city.envGroup);

    this.checkpoints = new CheckpointSystem(this.road);
    this.scene.add(this.checkpoints.checkpointGroup);

    this.player = new PlayerCar(PLAYABLE_CARS[0]);
    this.scene.add(this.player.model.root);
    this.scene.add(this.player.particleInstanced);

    this.ai = new RacingAI();
    this.scene.add(this.ai.aiGroup);

    this.traffic = new TrafficManager();
    this.scene.add(this.traffic.trafficGroup);

    this.collisions = new CollisionSystem();
    this.cameraController = new CameraController(width / height);
    this.nitroPostProcessor = new NitroMotionBlurPass(
      this.renderer,
      this.scene,
      this.cameraController.camera,
      width,
      height
    );
    this.audio = new AudioManager();
    this.input = new InputManager();
    this.race = new RaceManager();
    this.commentary = new RaceCommentarySystem();

    // 5. Initialize 3D Rain & Neon Mist Particle System
    this.rainDrops = new Float32Array(this.rainCount * 4);
    this.rainLinePositions = new Float32Array(this.rainCount * 2 * 3);
    for (let i = 0; i < this.rainCount; i++) {
      this.rainDrops[i * 4 + 0] = (Math.random() - 0.5) * 68;
      this.rainDrops[i * 4 + 1] = Math.random() * 26;
      this.rainDrops[i * 4 + 2] = (Math.random() - 0.5) * 68;
      this.rainDrops[i * 4 + 3] = 0.82 + Math.random() * 0.36;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.rainLinePositions, 3)
    );
    this.rainMaterial = new THREE.LineBasicMaterial({
      color: 0xcbd5e1,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    this.rainLines = new THREE.LineSegments(rainGeo, this.rainMaterial);
    this.rainLines.frustumCulled = false;
    this.rainLines.visible = false;
    this.scene.add(this.rainLines);

    // Position all vehicles on starting grid
    this.setupGridPositions();

    // Check URL query params (?weather=rain | neon_fog | clear | dynamic, ?autostart=1)
    const params = new URLSearchParams(window.location.search);
    const weatherParam = params.get('weather');
    if (
      weatherParam === 'rain' ||
      weatherParam === 'neon_fog' ||
      weatherParam === 'clear' ||
      weatherParam === 'dynamic'
    ) {
      this.setWeatherMode(weatherParam, true);
    } else {
      this.applyWeatherConfigImmediate(WEATHER_PRESETS.clear);
    }

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.cameraController.camera);
    }

    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__gameManager = this;
    }

    this.onResizeBound = this.onResize.bind(this);
    window.addEventListener('resize', this.onResizeBound);

    if (params.get('autostart') === '1') {
      this.startRace();
    } else {
      this.setScreenState('title');
    }

    this.emitTelemetry();
    this.lastTimestamp = performance.now();
    this.startLoop();
  }

  public setWeatherMode(mode: WeatherMode, immediate = false): void {
    this.weatherMode = mode;
    this.dynamicWeatherTimer = 0;

    if (mode !== 'dynamic') {
      this.fromWeatherId = immediate ? mode : this.targetWeatherId;
      this.targetWeatherId = mode;
      this.weatherBlend = immediate ? 1.0 : 0.0;
      if (immediate) {
        this.applyWeatherConfigImmediate(WEATHER_PRESETS[mode]);
      }
    } else if (immediate) {
      this.fromWeatherId = 'clear';
      this.targetWeatherId = 'clear';
      this.weatherBlend = 1.0;
      this.applyWeatherConfigImmediate(WEATHER_PRESETS.clear);
    }
    this.emitTelemetry();
  }

  public cycleWeatherMode(): WeatherMode {
    const sequence: WeatherMode[] = ['dynamic', 'rain', 'neon_fog', 'clear'];
    const idx = sequence.indexOf(this.weatherMode);
    const nextMode = sequence[(idx + 1) % sequence.length];
    this.setWeatherMode(nextMode, false);
    return nextMode;
  }

  private applyWeatherConfigImmediate(cfg: WeatherConfig): void {
    this.currentRoadFriction = cfg.frictionMultiplier;
    const targetSkyTex = this.city.skyTextures[cfg.id];
    if (this.city.skyMaterial.map !== targetSkyTex) {
      this.city.skyMaterial.map = targetSkyTex;
      this.city.skyMaterial.needsUpdate = true;
    }
    this.city.skyMaterial.color.setHex(0xffffff);
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.setHex(cfg.fogColorHex);
    }
    this.sceneFog.color.setHex(cfg.fogColorHex);
    this.sceneFog.density = cfg.fogDensity;
    this.keyLight.color.setHex(cfg.sunColorHex);
    this.keyLight.intensity = cfg.sunIntensity;
    this.hemiLight.color.setHex(cfg.hemiSkyHex);
    this.hemiLight.groundColor.setHex(cfg.hemiGroundHex);
    this.hemiLight.intensity = cfg.hemiIntensity;
    this.renderer.toneMappingExposure = cfg.exposure;

    // Tint diffuse road color slightly for dry vs wet vs neon fog without creating any white environment spotlight reflection
    this.road.roadMaterial.color.setHex(
      cfg.id === 'rain' ? 0xb8c4d4 : cfg.id === 'neon_fog' ? 0xc4b5fd : 0xd8dee9
    );
    this.city.streetLightMaterial.emissiveIntensity = cfg.streetLightEmissive;

    this.updateRainParticles(0.016, cfg.rainIntensity, cfg.id === 'neon_fog');
  }

  private updateWeather(dt: number): void {
    // In dynamic weather mode, automatically transition weather conditions every 18 seconds
    if (this.weatherMode === 'dynamic') {
      this.dynamicWeatherTimer += dt;
      if (this.dynamicWeatherTimer >= 18.0) {
        this.dynamicWeatherTimer = 0;
        const currIdx = WEATHER_ORDER.indexOf(this.targetWeatherId);
        const nextWeather = WEATHER_ORDER[(currIdx + 1) % WEATHER_ORDER.length];
        this.fromWeatherId = this.targetWeatherId;
        this.targetWeatherId = nextWeather;
        this.weatherBlend = 0.0;
      }
    }

    if (this.weatherBlend < 1.0) {
      // Smooth 3.5-second transition between weather states
      this.weatherBlend = Math.min(1.0, this.weatherBlend + dt / 3.5);
    }

    const fromCfg = WEATHER_PRESETS[this.fromWeatherId];
    const toCfg = WEATHER_PRESETS[this.targetWeatherId];
    const t = this.weatherBlend;

    // Smoothly interpolate physical road friction multiplier
    this.currentRoadFriction =
      fromCfg.frictionMultiplier +
      (toCfg.frictionMultiplier - fromCfg.frictionMultiplier) * t;

    // Smoothly interpolate visual atmosphere (sky dome texture & tint, fog color & density, lights, road wetness)
    const activeSkyId = t >= 0.5 ? this.targetWeatherId : this.fromWeatherId;
    const desiredSkyTex = this.city.skyTextures[activeSkyId];
    if (this.city.skyMaterial.map !== desiredSkyTex) {
      this.city.skyMaterial.map = desiredSkyTex;
      this.city.skyMaterial.needsUpdate = true;
    }
    this.city.skyMaterial.color.setHex(0xffffff);

    this._colA.setHex(fromCfg.fogColorHex);
    this._colB.setHex(toCfg.fogColorHex);
    this.sceneFog.color.copy(this._colA).lerp(this._colB, t);
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.copy(this.sceneFog.color);
    }
    this.sceneFog.density =
      fromCfg.fogDensity + (toCfg.fogDensity - fromCfg.fogDensity) * t;

    this._colA.setHex(fromCfg.sunColorHex);
    this._colB.setHex(toCfg.sunColorHex);
    this.keyLight.color.copy(this._colA).lerp(this._colB, t);
    this.keyLight.intensity =
      fromCfg.sunIntensity + (toCfg.sunIntensity - fromCfg.sunIntensity) * t;

    this._colA.setHex(fromCfg.hemiSkyHex);
    this._colB.setHex(toCfg.hemiSkyHex);
    this.hemiLight.color.copy(this._colA).lerp(this._colB, t);

    this._colA.setHex(fromCfg.hemiGroundHex);
    this._colB.setHex(toCfg.hemiGroundHex);
    this.hemiLight.groundColor.copy(this._colA).lerp(this._colB, t);
    this.hemiLight.intensity =
      fromCfg.hemiIntensity + (toCfg.hemiIntensity - fromCfg.hemiIntensity) * t;

    this.renderer.toneMappingExposure =
      fromCfg.exposure + (toCfg.exposure - fromCfg.exposure) * t;

    // Smoothly tint road surface color for weather without any white spotlight reflection
    const fromRoadHex =
      this.fromWeatherId === 'rain'
        ? 0xb8c4d4
        : this.fromWeatherId === 'neon_fog'
        ? 0xc4b5fd
        : 0xd8dee9;
    const toRoadHex =
      this.targetWeatherId === 'rain'
        ? 0xb8c4d4
        : this.targetWeatherId === 'neon_fog'
        ? 0xc4b5fd
        : 0xd8dee9;
    this._colA.setHex(fromRoadHex);
    this._colB.setHex(toRoadHex);
    this.road.roadMaterial.color.copy(this._colA).lerp(this._colB, t);

    this.city.streetLightMaterial.emissiveIntensity =
      fromCfg.streetLightEmissive +
      (toCfg.streetLightEmissive - fromCfg.streetLightEmissive) * t;

    const rainIntensity =
      fromCfg.rainIntensity + (toCfg.rainIntensity - fromCfg.rainIntensity) * t;
    const isNeonFog =
      (t >= 0.5 ? this.targetWeatherId : this.fromWeatherId) === 'neon_fog';

    this.updateRainParticles(dt, rainIntensity, isNeonFog);
  }

  private updateRainParticles(
    dt: number,
    rainIntensity: number,
    isNeonFog: boolean
  ): void {
    if (rainIntensity < 0.02) {
      this.rainLines.visible = false;
      return;
    }

    this.rainLines.visible = true;
    this.rainMaterial.color.setHex(isNeonFog ? 0xe879f9 : 0xcbd5e1);
    this.rainMaterial.opacity = isNeonFog
      ? Math.min(0.38, rainIntensity * 1.1)
      : Math.min(0.62, rainIntensity * 0.62);

    const anchor = this.player.worldPosition;
    const fallSpeed = isNeonFog ? 6.5 : 28.0;
    const streakLen = isNeonFog ? 0.55 : 1.85;
    const slantX = isNeonFog ? 0.15 : 0.22;
    const slantZ = isNeonFog ? 0.12 : 0.32;

    for (let i = 0; i < this.rainCount; i++) {
      const base = i * 4;
      let ox = this.rainDrops[base + 0];
      let oy = this.rainDrops[base + 1];
      let oz = this.rainDrops[base + 2];
      const spd = this.rainDrops[base + 3];

      oy -= fallSpeed * spd * dt;
      ox -= slantX * fallSpeed * dt * 0.25;
      oz -= slantZ * fallSpeed * dt * 0.25;

      if (oy < -2.0) {
        oy += 26.0;
        ox = (Math.random() - 0.5) * 68;
        oz = (Math.random() - 0.5) * 68;
      }

      this.rainDrops[base + 0] = ox;
      this.rainDrops[base + 1] = oy;
      this.rainDrops[base + 2] = oz;

      const wx = anchor.x + ox;
      const wy = anchor.y + oy;
      const wz = anchor.z + oz;

      const vIdx = i * 6;
      this.rainLinePositions[vIdx + 0] = wx;
      this.rainLinePositions[vIdx + 1] = wy;
      this.rainLinePositions[vIdx + 2] = wz;

      this.rainLinePositions[vIdx + 3] = wx + slantX;
      this.rainLinePositions[vIdx + 4] = wy + streakLen;
      this.rainLinePositions[vIdx + 5] = wz + slantZ;
    }

    const posAttr = this.rainLines.geometry.getAttribute(
      'position'
    ) as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
  }

  private setupGridPositions(): void {
    this.player.resetToGrid(8, 2.2);
    this.player.syncTransformOnly(this.road);
    this.ai.resetStartingGrid(this.road);
    this.traffic.resetTraffic(this.road);
    this.collisions.reset();
    this.checkpoints.highlightNextCheckpoint(1);
    this.cameraController.snapBehindPlayer(this.player);
  }

  public selectCar(spec: CarSpec): void {
    this.player.setCarSpec(spec);
    this.emitTelemetry();
  }

  public setQualityPreset(preset: QualityPreset): void {
    this.qualityPreset = preset;
    if (!this.isSoftwareGl) {
      this.renderer.setPixelRatio(
        preset === 'high' ? Math.min(window.devicePixelRatio, 2) : 1
      );
      this.renderer.shadowMap.enabled = preset === 'high';
    }
  }

  public setScreenState(state: GameScreenState): void {
    this.race.screenState = state;
    if (typeof document !== 'undefined') {
      document.body.dataset.state = state;
    }
    this.input.clearAll();

    // Show overhead floating car markers when race starts on the road!
    const showOverheadMarkers = state === 'playing' || state === 'paused';
    this.player.model.overheadMarker.visible = showOverheadMarkers;
    this.ai.setOverheadMarkersVisible(showOverheadMarkers);

    if (state === 'playing') {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      this.audio.startEngineLoop();
    } else {
      this.audio.stopEngineLoop();
    }

    this.emitTelemetry();
  }

  public startRace(laps = 2): void {
    this.setupGridPositions();
    this.race.resetRace(laps, 8);
    const activeWeatherId =
      this.weatherBlend >= 0.5 ? this.targetWeatherId : this.fromWeatherId;
    this.commentary.reset(activeWeatherId);
    this.setScreenState('playing');
  }

  public togglePause(): void {
    if (this.race.screenState === 'playing') {
      this.setScreenState('paused');
    } else if (this.race.screenState === 'paused') {
      this.setScreenState('playing');
    }
  }

  public returnToMainMenu(): void {
    this.setupGridPositions();
    this.race.resetRace(2, 8);
    this.commentary.reset();
    this.setScreenState('title');
  }

  public resetPlayerVehicle(): void {
    if (this.race.screenState === 'playing') {
      this.player.recoverToRoadCenter();
      this.player.syncTransformOnly(this.road);
      this.cameraController.snapBehindPlayer(this.player);
    }
  }

  public completeLapOrFinishForTest(): void {
    // Helper to allow completing the race cleanly when triggered
    if (this.race.screenState === 'playing') {
      this.race.playerFinishTimeMs = Math.max(45200, this.race.raceTimeMs);
      this.race.playerProgress.lap = this.race.totalLaps;
      this.race.playerProgress.finished = true;
      this.race.playerProgress.totalProgressMeters = this.race.totalLaps * CIRCUIT_LENGTH + 25;
      this.audio.playRaceFinish(true);
      this.setScreenState('gameover');
    }
  }

  public setTouchControl(key: keyof TouchControlsState, active: boolean): void {
    this.input.setTouchControl(key, active);
  }

  private onResize(): void {
    if (this.isDisposed) return;
    const width = Math.max(320, this.container.clientWidth || window.innerWidth);
    const height = Math.max(240, this.container.clientHeight || window.innerHeight);
    this.cameraController.camera.aspect = width / height;
    this.cameraController.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.nitroPostProcessor.setSize(width, height);
  }

  private handleGlobalShortcuts(): void {
    if (this.input.consumeJustPressed('KeyM')) {
      this.audio.toggleMute();
    }
    if (this.input.consumeJustPressed('KeyC')) {
      this.cycleWeatherMode();
    }

    if (this.race.screenState === 'title') {
      if (
        this.input.consumeJustPressed('Enter') ||
        this.input.consumeJustPressed('Space')
      ) {
        this.startRace(this.race.totalLaps);
      }
    } else if (this.race.screenState === 'playing') {
      if (
        this.input.consumeJustPressed('Escape') ||
        this.input.consumeJustPressed('KeyP')
      ) {
        this.togglePause();
      }
      if (this.input.consumeJustPressed('KeyR')) {
        this.resetPlayerVehicle();
      }
    } else if (this.race.screenState === 'paused') {
      if (
        this.input.consumeJustPressed('Escape') ||
        this.input.consumeJustPressed('KeyP')
      ) {
        this.togglePause();
      }
    } else if (this.race.screenState === 'gameover') {
      if (this.input.consumeJustPressed('Enter')) {
        this.startRace(this.race.totalLaps);
      }
    }

    this.input.clearFrameEdges();
  }

  public stepSimulation(rawDt: number): void {
    const totalDt = Math.min(Math.max(rawDt, 0.001), 0.25);
    this.handleGlobalShortcuts();

    this.city.update(totalDt);
    this.updateWeather(totalDt);

    if (this.race.screenState === 'title') {
      // Showcase camera orbiting the player's selected car while civilian traffic flows in background
      this.traffic.update(totalDt, this.road);
      this.player.syncTransformOnly(this.road);
      this.cameraController.updateShowcase(this.player, totalDt);
      this.nitroPostProcessor.update(totalDt, 0, 0);
      return;
    }

    if (this.race.screenState === 'paused' || this.race.screenState === 'gameover') {
      this.nitroPostProcessor.update(totalDt, 0, 0);
      return;
    }

    // Sub-step simulation in <= 0.04s increments so physics stay stable even when afterDraw pauses 80ms
    let remaining = totalDt;
    const maxStep = 0.04;
    const controlInput = this.input.getVehicleControlInput();

    while (remaining > 0.0001) {
      const dt = Math.min(remaining, maxStep);
      remaining -= dt;

      if (this.hitstopTimer > 0) {
        this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
        continue;
      }

      const canVehiclesMove = this.race.stepTimersAndCheckCanMove(
        dt,
        this.audio
      );
      const prevPlayerS = this.player.state.s;

      this.player.update(
        controlInput,
        this.road,
        dt,
        canVehiclesMove,
        this.currentRoadFriction
      );
      this.traffic.update(dt, this.road);

      this.ai.update(
        dt,
        this.road,
        this.traffic.vehicles,
        this.race.playerProgress.totalProgressMeters,
        this.checkpoints.checkpointPositionsS,
        this.race.totalLaps,
        this.race.raceTimeMs,
        canVehiclesMove,
        this.currentRoadFriction
      );

      let collisionJustOccurred = false;
      if (canVehiclesMove) {
        const colEvents = this.collisions.resolveCollisions(
          dt,
          this.player,
          this.ai.racers,
          this.traffic.vehicles
        );

        if (colEvents.playerHitVehicle || colEvents.playerHitBarrier) {
          collisionJustOccurred = true;
          const intensity = colEvents.impactIntensity;
          this.cameraController.addTrauma(
            0.42 + intensity * 0.58,
            colEvents.lateralImpactSign
          );
          this.race.collisionFlash = Math.min(1, 0.55 + intensity * 0.45);
          this.audio.playCollisionImpact(intensity);
          this.emitTelemetry();
          if (colEvents.playerHitVehicle && intensity > 0.50) {
            this.hitstopTimer = 0.04;
          }
        }
      }

      const { raceJustEnded } = this.race.updateProgressAfterMovement(
        prevPlayerS,
        this.player,
        this.ai,
        this.checkpoints,
        this.audio
      );

      // Update AI Race Commentary System using live telemetry
      const standings = this.race.computeStandings(this.player, this.ai);
      const playerStanding = standings.find((s) => s.isPlayer) ?? standings[0];
      const district = getDistrictAtS(this.player.state.s);
      const activeWeatherId =
        this.weatherBlend >= 0.5 ? this.targetWeatherId : this.fromWeatherId;
      const activeWeatherName = WEATHER_PRESETS[activeWeatherId].name;

      this.commentary.update(dt, {
        isPlaying: this.race.screenState === 'playing',
        countdownTimer: this.race.countdownTimer,
        speedKmh: Math.round(Math.abs(this.player.state.speedMs * 3.6)),
        playerS: this.player.state.s,
        playerLat: this.player.state.lateralOffset,
        position: playerStanding.position,
        totalRacers: standings.length,
        lap: Math.min(this.race.totalLaps, this.race.playerProgress.lap),
        totalLaps: this.race.totalLaps,
        carName: this.player.spec.name,
        raceNumber: this.player.spec.raceNumber,
        districtName: district.name,
        weatherId: activeWeatherId,
        weatherName: activeWeatherName,
        nitroActive: this.player.state.nitroActive,
        collisionJustOccurred,
        raceJustEnded,
        standings,
        trafficVehicles: this.traffic.vehicles,
        audio: this.audio,
      });

      if (raceJustEnded) {
        this.setScreenState('gameover');
        return;
      }
    }

    this.audio.updateEngine(
      this.player.state.rpm,
      controlInput.throttle,
      this.player.state.nitroActive,
      this.race.screenState === 'playing'
    );

    // Move keyLight shadow frustum along with the player car
    this.keyLight.position.set(
      this.player.worldPosition.x + 45,
      this.player.worldPosition.y + 95,
      this.player.worldPosition.z + 40
    );
    this.keyLight.target.position.copy(this.player.worldPosition);

    this.cameraController.updateGameplay(this.player, totalDt);
    this.nitroPostProcessor.update(
      totalDt,
      this.player.state.nitroBlurIntensity,
      this.player.state.steerAngle,
      this.race.collisionFlash
    );

    // Throttle HUD React updates to ~12Hz
    this.hudAccumulator += totalDt;
    if (this.hudAccumulator >= 0.08) {
      this.hudAccumulator = 0;
      this.emitTelemetry();
    }
  }

  public emitTelemetry(): void {
    const activeWeatherId =
      this.weatherBlend >= 0.5 ? this.targetWeatherId : this.fromWeatherId;
    const activeCfg = WEATHER_PRESETS[activeWeatherId];

    const snapshot = this.race.buildHUDTelemetry(
      this.road,
      this.player,
      this.ai,
      this.traffic,
      this.checkpoints,
      this.collisions,
      {
        weatherId: activeWeatherId,
        weatherName: activeCfg.name,
        weatherMode: this.weatherMode,
        roadFriction: this.currentRoadFriction,
      },
      this.commentary.activeAnnouncement
    );
    this.onTelemetryUpdate(snapshot);
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
    gl.flush();
    const poll = () => {
      if (this.isDisposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private startLoop(): void {
    const tick = () => {
      if (this.isDisposed) return;
      const now = performance.now();
      const rawDt = (now - this.lastTimestamp) / 1000;
      this.lastTimestamp = now;

      this.stepSimulation(rawDt);

      if (this.nitroPostProcessor.isActive) {
        this.nitroPostProcessor.render();
      } else {
        this.renderer.render(this.scene, this.cameraController.camera);
      }

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    this.frameId = requestAnimationFrame(tick);
  }

  public dispose(): void {
    this.isDisposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.onResizeBound);
    this.input.dispose();
    this.audio.stopEngineLoop();
    this.nitroPostProcessor.dispose();
    this.renderer.dispose();
  }
}
