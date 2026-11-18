import * as THREE from 'three';
import { CIRCUIT_LENGTH, ROAD_HALF_WIDTH } from './types';
import { RoadSystem } from './RoadSystem';

export interface BuildingFootprint {
  x: number;
  z: number;
  radius: number;
  kind: 'skyscraper' | 'villa' | 'container';
}

export class CityEnvironment {
  public readonly envGroup: THREE.Group;
  public readonly placedFootprints: BuildingFootprint[] = [];
  public skyMaterial!: THREE.MeshBasicMaterial;
  public streetLightMaterial!: THREE.MeshStandardMaterial;
  public skyTextures!: Record<'clear' | 'rain' | 'neon_fog', THREE.CanvasTexture>;
  private waterNormalTex: THREE.CanvasTexture | null = null;
  private waterMesh: THREE.Mesh | null = null;
  private lcdCanvas: HTMLCanvasElement | null = null;
  private lcdCtx: CanvasRenderingContext2D | null = null;
  private lcdTexture: THREE.CanvasTexture | null = null;
  private distantSkyBeams: Array<{
    mesh: THREE.Mesh;
    baseRotZ: number;
    baseRotX: number;
    speed: number;
    phase: number;
  }> = [];
  private distantLightPods: Array<{
    mesh: THREE.Group;
    centerX: number;
    centerZ: number;
    radius: number;
    baseY: number;
    speed: number;
    angle: number;
  }> = [];
  private lcdAnimTime = 0;
  private lcdFrameAccum = 0;

  constructor(road: RoadSystem, maxAnisotropy = 4) {
    this.envGroup = new THREE.Group();
    this.envGroup.name = 'CityEnvironment';

    this.buildSkyDome();
    this.buildGroundAndRiver(maxAnisotropy);
    this.buildRoadsideHillsAndVillas(road, maxAnisotropy);
    this.buildRealisticCityBuildings(road, maxAnisotropy);
    this.buildRoadsideTreesAndShrubs(road, maxAnisotropy);
    this.buildGrandBridgeStructure(road);
    this.buildElevatedViaductPillars(road);
    this.buildUndergroundTunnel(road, maxAnisotropy);
    this.buildIndustrialSector(road);
    this.buildStreetlights(road);
    this.buildAnimatedLcdBillboards(road, maxAnisotropy);
    this.buildDistantMovingCityLights(road, maxAnisotropy);
    this.buildHorizonMountains(maxAnisotropy);
  }

  /**
   * Verifies that a circular footprint at (x, z) with given radius + safetyMargin
   * does not overlap ANY segment of the entire 2400m circuit.
   */
  private isFootprintClearOfRoad(
    road: RoadSystem,
    x: number,
    z: number,
    radius: number,
    safetyMargin = 5.5
  ): boolean {
    const minRequired = ROAD_HALF_WIDTH + radius + safetyMargin;
    const centerCheck = road.getMinDistanceToRoad(x, z);
    if (centerCheck.distance < minRequired) {
      return false;
    }
    // Also verify 4 perimeter points of the bounding circle
    const diag = radius * 0.72;
    for (const [ox, oz] of [
      [diag, diag],
      [-diag, diag],
      [diag, -diag],
      [-diag, -diag],
    ]) {
      if (road.getMinDistanceToRoad(x + ox, z + oz).distance < ROAD_HALF_WIDTH + safetyMargin) {
        return false;
      }
    }
    return true;
  }

  private createWeatherSkyTexture(
    stops: Array<[number, string]>,
    cloudColorInner: string,
    cloudColorMid: string
  ): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    const skyGrad = ctx.createLinearGradient(0, 0, 0, 512);
    for (const [pos, col] of stops) {
      skyGrad.addColorStop(pos, col);
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, 1024, 512);

    let seed = 901;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let i = 0; i < 52; i++) {
      const cx = rand() * 1024;
      const cy = 105 + rand() * 130;
      const rx = 30 + rand() * 72;
      const ry = 8 + rand() * 18;
      const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, rx);
      grad.addColorStop(0, cloudColorInner);
      grad.addColorStop(0.5, cloudColorMid);
      grad.addColorStop(1, 'rgba(248, 250, 252, 0)');
      ctx.fillStyle = grad;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / rx);
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private buildSkyDome(): void {
    this.skyTextures = {
      clear: this.createWeatherSkyTexture(
        [
          [0.0, '#0f4c92'],
          [0.28, '#2370c4'],
          [0.46, '#58a3e3'],
          [0.53, '#9ad0f0'],
          [0.60, '#c6e5f7'],
          [1.0, '#858d5e'],
        ],
        'rgba(255, 255, 255, 0.80)',
        'rgba(248, 250, 252, 0.40)'
      ),
      rain: this.createWeatherSkyTexture(
        [
          [0.0, '#1e293b'],
          [0.26, '#334155'],
          [0.45, '#475569'],
          [0.54, '#64748b'],
          [0.62, '#7c8ea6'],
          [1.0, '#334155'],
        ],
        'rgba(148, 163, 184, 0.55)',
        'rgba(100, 116, 139, 0.30)'
      ),
      neon_fog: this.createWeatherSkyTexture(
        [
          [0.0, '#0f0728'],
          [0.25, '#2e1065'],
          [0.44, '#701a75'],
          [0.52, '#c026d3'],
          [0.58, '#22d3ee'],
          [1.0, '#1e1b4b'],
        ],
        'rgba(232, 121, 249, 0.48)',
        'rgba(56, 189, 248, 0.24)'
      ),
    };

    const skyGeo = new THREE.SphereGeometry(2200, 40, 24);
    const skyMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: this.skyTextures.clear,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
      depthTest: false,
    });
    this.skyMaterial = skyMat;
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    skyMesh.renderOrder = -100;
    skyMesh.frustumCulled = false;
    skyMesh.position.set(-220, 0, -50);
    this.envGroup.add(skyMesh);
  }

  /**
   * 1. Realistic Daytime Architectural Glass & Steel Skyscraper Texture
   */
  private createGlassTowerDaytimeTexture(maxAnisotropy: number): {
    map: THREE.CanvasTexture;
    bumpMap: THREE.CanvasTexture;
  } {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    const bCanvas = document.createElement('canvas');
    bCanvas.width = 512;
    bCanvas.height = 512;
    const bCtx = bCanvas.getContext('2d')!;

    // Architectural dark aluminum curtain-wall grid frame
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, 512, 512);
    bCtx.fillStyle = '#ffffff';
    bCtx.fillRect(0, 0, 512, 512);

    const cols = 8;
    const rows = 14;
    const cellW = 512 / cols;
    const cellH = 512 / rows;

    let seed = 104;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let r = 0; r < rows; r++) {
      // Concrete structural spandrel slab between floors
      ctx.fillStyle = '#475569';
      ctx.fillRect(0, r * cellH, 512, 7);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, r * cellH + 7, 512, 2);

      for (let c = 0; c < cols; c++) {
        const px = c * cellW + 4;
        const py = r * cellH + 10;
        const pw = cellW - 8;
        const ph = cellH - 13;

        // Reflective architectural sky-blue glass pane with interior office depth
        const g = ctx.createLinearGradient(px, py, px + pw, py + ph);
        const v = rand();
        if (v > 0.65) {
          g.addColorStop(0, '#7dd3fc');
          g.addColorStop(0.5, '#38bdf8');
          g.addColorStop(1, '#1e3a5f');
        } else if (v > 0.25) {
          g.addColorStop(0, '#60a5fa');
          g.addColorStop(0.55, '#2563eb');
          g.addColorStop(1, '#172554');
        } else {
          g.addColorStop(0, '#94a3b8');
          g.addColorStop(1, '#1e293b');
        }
        ctx.fillStyle = g;
        ctx.fillRect(px, py, pw, ph);

        // Interior sunblind / ceiling louvre detail
        if (v > 0.45) {
          ctx.fillStyle = 'rgba(241, 245, 249, 0.28)';
          ctx.fillRect(px + 2, py + 2, pw - 4, ph * (0.25 + (r % 3) * 0.12));
        }

        // Center vertical stainless mullion
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(px + pw / 2 - 1, py, 2, ph);

        bCtx.fillStyle = '#383838';
        bCtx.fillRect(px, py, pw, ph);
      }
    }

    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(2, 2);
    map.anisotropy = maxAnisotropy;

    const bumpMap = new THREE.CanvasTexture(bCanvas);
    bumpMap.wrapS = THREE.RepeatWrapping;
    bumpMap.wrapT = THREE.RepeatWrapping;
    bumpMap.repeat.set(2, 2);
    bumpMap.anisotropy = maxAnisotropy;

    return { map, bumpMap };
  }

  /**
   * 2. Realistic European Limestone & Haussmann Apartment Facade Texture
   */
  private createLimestoneBuildingTexture(maxAnisotropy: number): {
    map: THREE.CanvasTexture;
    bumpMap: THREE.CanvasTexture;
  } {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    const bCanvas = document.createElement('canvas');
    bCanvas.width = 512;
    bCanvas.height = 512;
    const bCtx = bCanvas.getContext('2d')!;

    // Warm dressed limestone ashlar masonry base
    ctx.fillStyle = '#e5dccb';
    ctx.fillRect(0, 0, 512, 512);
    bCtx.fillStyle = '#d8d8d8';
    bCtx.fillRect(0, 0, 512, 512);

    // Subtle ashlar stone block joints & natural weathering grain
    for (let i = 0; i < 5000; i++) {
      const x = (i * 73) % 512;
      const y = (i * 139) % 512;
      const d = (i % 18) - 9;
      ctx.fillStyle = `rgb(${226 + d}, ${216 + d}, ${198 + d})`;
      ctx.fillRect(x, y, 4, 3);
    }

    const cols = 6;
    const rows = 8;
    const cellW = 512 / cols;
    const cellH = 512 / rows;

    for (let r = 0; r < rows; r++) {
      // Sculpted stone cornice molding & shadow line under each floor
      ctx.fillStyle = '#b8ad99';
      ctx.fillRect(0, r * cellH, 512, 6);
      ctx.fillStyle = '#f5f0e6';
      ctx.fillRect(0, r * cellH + 6, 512, 4);

      for (let c = 0; c < cols; c++) {
        // Vertical stone pilaster strip between bays
        ctx.fillStyle = '#d4c9b4';
        ctx.fillRect(c * cellW, r * cellH, 6, cellH);

        const wx = c * cellW + 15;
        const wy = r * cellH + 14;
        const ww = cellW - 30;
        const wh = cellH - 20;

        // Carved stone window architrave surround + pediment lintel
        ctx.fillStyle = '#c4b9a5';
        ctx.fillRect(wx - 4, wy - 5, ww + 8, wh + 8);
        ctx.fillStyle = '#f7f3eb';
        ctx.fillRect(wx - 6, wy - 7, ww + 12, 4);

        // Deep recessed French casement window glass
        const wGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
        wGrad.addColorStop(0, '#1e293b');
        wGrad.addColorStop(0.45, '#334155');
        wGrad.addColorStop(1, '#0f172a');
        ctx.fillStyle = wGrad;
        ctx.fillRect(wx, wy, ww, wh);

        // White wooden window mullions (French cross casement)
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
        ctx.fillRect(wx, wy + wh * 0.36, ww, 2.5);

        // Ornate wrought-iron Juliet balcony railing at base of window
        ctx.fillStyle = '#1e242b';
        ctx.fillRect(wx - 3, wy + wh - 11, ww + 6, 11);
        ctx.fillStyle = '#64748b';
        for (let bx = wx; bx < wx + ww; bx += 5) {
          ctx.fillRect(bx, wy + wh - 10, 2, 9);
        }

        bCtx.fillStyle = '#202020';
        bCtx.fillRect(wx, wy, ww, wh);
      }
    }

    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(2, 2);
    map.anisotropy = maxAnisotropy;

    const bumpMap = new THREE.CanvasTexture(bCanvas);
    bumpMap.wrapS = THREE.RepeatWrapping;
    bumpMap.wrapT = THREE.RepeatWrapping;
    bumpMap.repeat.set(2, 2);
    bumpMap.anisotropy = maxAnisotropy;

    return { map, bumpMap };
  }

  /**
   * 3. Realistic Terracotta Brick & Stone Commercial Facade Texture
   */
  private createTerracottaBrickTexture(maxAnisotropy: number): {
    map: THREE.CanvasTexture;
    bumpMap: THREE.CanvasTexture;
  } {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    const bCanvas = document.createElement('canvas');
    bCanvas.width = 512;
    bCanvas.height = 512;
    const bCtx = bCanvas.getContext('2d')!;

    // Warm Mediterranean terracotta-ochre brick masonry
    ctx.fillStyle = '#b86b4c';
    ctx.fillRect(0, 0, 512, 512);
    bCtx.fillStyle = '#cccccc';
    bCtx.fillRect(0, 0, 512, 512);

    // Subtle brick course texture
    for (let y = 0; y < 512; y += 8) {
      ctx.fillStyle = y % 16 === 0 ? 'rgba(90, 42, 24, 0.25)' : 'rgba(235, 215, 195, 0.15)';
      ctx.fillRect(0, y, 512, 2);
    }

    const cols = 6;
    const rows = 8;
    const cellW = 512 / cols;
    const cellH = 512 / rows;

    for (let r = 0; r < rows; r++) {
      // Dressed cream stone floor band
      ctx.fillStyle = '#dfd5c3';
      ctx.fillRect(0, r * cellH, 512, 8);
      ctx.fillStyle = '#8c523a';
      ctx.fillRect(0, r * cellH + 8, 512, 2);

      for (let c = 0; c < cols; c++) {
        const wx = c * cellW + 14;
        const wy = r * cellH + 15;
        const ww = cellW - 28;
        const wh = cellH - 22;

        // Cream limestone window surround & keystone lintel
        ctx.fillStyle = '#e5dccb';
        ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);

        // Recessed window pane
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(wx, wy, ww, wh);

        // Upper sky reflection & white casement frame
        ctx.fillStyle = '#476a87';
        ctx.fillRect(wx + 2, wy + 2, ww - 4, wh * 0.42);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(wx + ww / 2 - 1, wy, 2, wh);
        ctx.fillRect(wx, wy + wh * 0.42, ww, 2);

        // Wrought-iron balcony rail at bottom of window
        ctx.fillStyle = '#1e242b';
        ctx.fillRect(wx - 2, wy + wh - 7, ww + 4, 7);

        bCtx.fillStyle = '#282828';
        bCtx.fillRect(wx, wy, ww, wh);
      }
    }

    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(2, 2);
    map.anisotropy = maxAnisotropy;

    const bumpMap = new THREE.CanvasTexture(bCanvas);
    bumpMap.wrapS = THREE.RepeatWrapping;
    bumpMap.wrapT = THREE.RepeatWrapping;
    bumpMap.repeat.set(2, 2);
    bumpMap.anisotropy = maxAnisotropy;

    return { map, bumpMap };
  }

  /**
   * 4. Authentic Mediterranean / European Stone & Stucco Villa Texture
   */
  private createVillaWallTexture(maxAnisotropy: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Warm sun-washed Mediterranean stucco plaster
    ctx.fillStyle = '#dfd3bc';
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 6000; i++) {
      const x = (i * 59) % 512;
      const y = (i * 107) % 512;
      const d = (i % 20) - 10;
      ctx.fillStyle = `rgb(${220 + d}, ${208 + d}, ${185 + d})`;
      ctx.fillRect(x, y, 4, 4);
    }

    // Dressed stone corner quoins on left and right edges
    ctx.fillStyle = '#b5a68c';
    for (let y = 0; y < 512; y += 32) {
      const w = (y / 32) % 2 === 0 ? 28 : 18;
      ctx.fillRect(0, y + 2, w, 28);
      ctx.fillRect(512 - w, y + 2, w, 28);
    }

    // Lower rusticated stone masonry base course & arched ground portals
    ctx.fillStyle = '#9e917b';
    ctx.fillRect(0, 360, 512, 152);
    for (let y = 364; y < 512; y += 22) {
      for (let x = 0; x < 512; x += 44) {
        ctx.strokeStyle = '#756a58';
        ctx.lineWidth = 2;
        ctx.strokeRect(x + ((y % 44) * 0.5), y, 42, 20);
      }
    }

    // Upper floor cornice belt
    ctx.fillStyle = '#bfb299';
    ctx.fillRect(0, 172, 512, 10);
    ctx.fillStyle = '#f5efe2';
    ctx.fillRect(0, 182, 512, 5);

    // 2 upper residential floors with louvered wooden shutters & window boxes
    for (const wy of [48, 215]) {
      for (const wx of [72, 224, 376]) {
        const ww = 54;
        const wh = 86;

        // Carved stone window surround
        ctx.fillStyle = '#f2ece1';
        ctx.fillRect(wx - 6, wy - 6, ww + 12, wh + 12);

        // Open louvered Mediterranean green wooden shutters on left & right
        ctx.fillStyle = '#365942';
        ctx.fillRect(wx - 24, wy, 20, wh);
        ctx.fillRect(wx + ww + 4, wy, 20, wh);
        // Horizontal shutter slats
        ctx.fillStyle = '#233d2c';
        for (let sy = wy + 4; sy < wy + wh - 4; sy += 6) {
          ctx.fillRect(wx - 22, sy, 16, 2);
          ctx.fillRect(wx + ww + 6, sy, 16, 2);
        }

        // Recessed dark window glass + white wooden muntins
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(wx, wy, ww, wh);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
        ctx.fillRect(wx, wy + wh * 0.45, ww, 2.5);

        // Terracotta flower box / stone sill at base of window
        ctx.fillStyle = '#9c4a32';
        ctx.fillRect(wx - 4, wy + wh - 6, ww + 8, 9);
      }
    }

    // Ground floor arched wooden doors / shopfront windows
    for (const gx of [72, 224, 376]) {
      ctx.fillStyle = '#4a3525';
      ctx.fillRect(gx - 2, 395, 58, 117);
      ctx.fillStyle = '#1e2630';
      ctx.fillRect(gx + 4, 404, 46, 65);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = maxAnisotropy;
    return tex;
  }

  /**
   * 5. Realistic Spanish / Mediterranean Barrel-Tile Terracotta Roof Texture
   */
  private createTerracottaRoofTexture(maxAnisotropy: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#9e442b';
    ctx.fillRect(0, 0, 256, 256);

    // Curved vertical barrel tiles & horizontal overlapping course shadows
    for (let x = 0; x < 256; x += 12) {
      const grad = ctx.createLinearGradient(x, 0, x + 12, 0);
      grad.addColorStop(0, '#6e2b19');
      grad.addColorStop(0.45, '#bf5a3c');
      grad.addColorStop(0.8, '#a6482c');
      grad.addColorStop(1, '#5c2212');
      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, 12, 256);
    }

    for (let y = 0; y < 256; y += 18) {
      ctx.fillStyle = 'rgba(45, 15, 8, 0.38)';
      ctx.fillRect(0, y, 256, 3);
      ctx.fillStyle = 'rgba(235, 145, 110, 0.22)';
      ctx.fillRect(0, y + 3, 256, 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    tex.anisotropy = maxAnisotropy;
    return tex;
  }

  private createHillsideTerrainTexture(maxAnisotropy: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Sun-baked Mediterranean hillside golden-olive grass base
    ctx.fillStyle = '#9e985e';
    ctx.fillRect(0, 0, 512, 512);

    // Macro organic patches of lush olive grass, limestone outcrops, and dark scrub shadows
    for (let i = 0; i < 420; i++) {
      const x = (i * 97) % 512;
      const y = (i * 173) % 512;
      const w = 18 + (i % 34);
      const h = 10 + (i % 20);
      const mod = i % 5;
      if (mod === 0) ctx.fillStyle = '#5a7032';
      else if (mod === 1) ctx.fillStyle = '#7c8745';
      else if (mod === 2) ctx.fillStyle = '#c4bc8e';
      else if (mod === 3) ctx.fillStyle = '#3b4d20';
      else ctx.fillStyle = '#b3a86e';
      ctx.beginPath();
      ctx.ellipse(x, y, w, h, (i % 7) * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < 8000; i++) {
      const x = (i * 73) % 512;
      const y = (i * 139) % 512;
      const mod = i % 4;
      ctx.fillStyle =
        mod === 0
          ? '#465925'
          : mod === 1
          ? '#6f823d'
          : mod === 2
          ? '#ccc296'
          : '#8f8852';
      ctx.fillRect(x, y, 4, 3);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = maxAnisotropy;
    return tex;
  }

  private createFoliageTexture(maxAnisotropy: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#486b2b';
    ctx.fillRect(0, 0, 256, 256);

    for (let i = 0; i < 320; i++) {
      const x = (i * 79) % 256;
      const y = (i * 131) % 256;
      const c = i % 4;
      ctx.fillStyle =
        c === 0
          ? '#2a4218'
          : c === 1
          ? '#557a34'
          : c === 2
          ? '#759c48'
          : '#98bf5e';
      ctx.beginPath();
      ctx.arc(x, y, 6 + (i % 10), 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < 6000; i++) {
      const x = (i * 61) % 256;
      const y = (i * 113) % 256;
      const c = i % 4;
      ctx.fillStyle =
        c === 0
          ? '#243817'
          : c === 1
          ? '#4b6b32'
          : c === 2
          ? '#6e9444'
          : '#92b85c';
      ctx.fillRect(x, y, 4, 3);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = maxAnisotropy;
    return tex;
  }

  private buildGroundAndRiver(maxAnisotropy: number): void {
    const groundTex = this.createHillsideTerrainTexture(maxAnisotropy);
    groundTex.repeat.set(90, 90);

    // Mainland terrain plane positioned east of x = -445 so the entire western Ocean Bridge span (x <= -455) is over open sea
    const groundGeo = new THREE.PlaneGeometry(2400, 3400);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: groundTex,
      roughness: 0.92,
      metalness: 0.04,
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.position.set(755, -0.2, -50);
    groundMesh.receiveShadow = true;
    this.envGroup.add(groundMesh);

    // Coastal stone seawall / shoreline embankment along x = -445 separating mainland from the open ocean
    const seawallGeo = new THREE.BoxGeometry(8, 3.2, 3400);
    const seawallMat = new THREE.MeshStandardMaterial({
      color: 0x7c7467,
      roughness: 0.88,
      metalness: 0.06,
    });
    const seawallMesh = new THREE.Mesh(seawallGeo, seawallMat);
    seawallMesh.position.set(-446, -0.8, -50);
    this.envGroup.add(seawallMesh);

    // Deep seabed plane beneath the western ocean
    const seabedGeo = new THREE.PlaneGeometry(2400, 3400);
    seabedGeo.rotateX(-Math.PI / 2);
    const seabedMat = new THREE.MeshStandardMaterial({
      color: 0x0a2540,
      roughness: 0.95,
      metalness: 0.05,
    });
    const seabedMesh = new THREE.Mesh(seabedGeo, seabedMat);
    seabedMesh.position.set(-1640, -5.5, -50);
    this.envGroup.add(seabedMesh);

    const wCanvas = document.createElement('canvas');
    wCanvas.width = 256;
    wCanvas.height = 256;
    const wCtx = wCanvas.getContext('2d')!;
    wCtx.fillStyle = '#808080';
    wCtx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 8) {
      for (let x = 0; x < 256; x += 16) {
        const shade = 110 + Math.round(Math.sin(x * 0.1 + y * 0.2) * 35);
        wCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
        wCtx.fillRect(x, y, 14, 4);
      }
    }
    this.waterNormalTex = new THREE.CanvasTexture(wCanvas);
    this.waterNormalTex.wrapS = THREE.RepeatWrapping;
    this.waterNormalTex.wrapT = THREE.RepeatWrapping;
    this.waterNormalTex.repeat.set(64, 64);
    this.waterNormalTex.anisotropy = maxAnisotropy;

    const waterGeo = new THREE.PlaneGeometry(2200, 3400);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0e5a8a,
      roughness: 0.12,
      metalness: 0.78,
      bumpMap: this.waterNormalTex,
      bumpScale: 0.26,
    });
    this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    // Vast open ocean spanning x = -2640 .. -440 underneath the entire 1.24 km Ocean Suspension Bridge
    this.waterMesh.position.set(-1540, 0.35, -50);
    this.envGroup.add(this.waterMesh);
  }

  private getRightHillsideElevation(s: number, lateralDistFromRoadEdge: number): number {
    if (lateralDistFromRoadEdge <= 0) return 0;
    const normalizedRun = Math.min(1, lateralDistFromRoadEdge / 38);
    const baseSlope = Math.sin(normalizedRun * (Math.PI * 0.5)) * 16.5;
    const wave =
      Math.sin(s * 0.045 + lateralDistFromRoadEdge * 0.08) * 1.8 +
      Math.cos(s * 0.09 - lateralDistFromRoadEdge * 0.05) * 0.9;
    let longitudinalEnvelope = 1.0;
    if (s < 0) {
      longitudinalEnvelope = Math.max(0, (s + 30) / 30);
    } else if (s > 280) {
      longitudinalEnvelope = Math.max(0, (335 - s) / 55);
    }
    return Math.max(0, (baseSlope + wave * normalizedRun) * longitudinalEnvelope);
  }

  private buildRoadsideHillsAndVillas(road: RoadSystem, maxAnisotropy: number): void {
    const villaTex = this.createVillaWallTexture(maxAnisotropy);
    const roofTileTex = this.createTerracottaRoofTexture(maxAnisotropy);

    const villaWallMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: villaTex,
      roughness: 0.80,
      metalness: 0.05,
    });
    const pastelGreenVillaMat = new THREE.MeshStandardMaterial({
      color: 0xc2d9bc,
      map: villaTex,
      roughness: 0.80,
      metalness: 0.05,
    });
    const warmOchreVillaMat = new THREE.MeshStandardMaterial({
      color: 0xf2d2a9,
      map: villaTex,
      roughness: 0.80,
      metalness: 0.05,
    });
    const terracottaRoofMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: roofTileTex,
      roughness: 0.72,
      metalness: 0.06,
    });
    const stoneWallMat = new THREE.MeshStandardMaterial({
      color: 0x9c9282,
      roughness: 0.86,
      metalness: 0.08,
    });

    const hillTex = this.createHillsideTerrainTexture(maxAnisotropy);
    const hillMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: hillTex,
      roughness: 0.90,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });

    // 1. Continuous Smooth Sloped Hillside Terrain Ribbon along Right Side of Road (s = -25..335m)
    const sSteps = 90;
    const sMin = -25;
    const sMax = 335;
    const lateralOffsets = [0.4, 4.5, 10.0, 16.5, 24.0, 32.5, 42.0, 56.0];
    const cols = lateralOffsets.length;

    const positions = new Float32Array((sSteps + 1) * cols * 3);
    const uvs = new Float32Array((sSteps + 1) * cols * 2);
    const indices: number[] = [];

    for (let i = 0; i <= sSteps; i++) {
      const s = sMin + (i / sSteps) * (sMax - sMin);
      const sample = road.getSampleAtS(s);

      for (let c = 0; c < cols; c++) {
        const dEdge = lateralOffsets[c];
        const lat = ROAD_HALF_WIDTH + dEdge;
        const pos = sample.position.clone().addScaledVector(sample.right, lat);

        let y = sample.position.y - 0.15;
        if (c > 0 && c < cols - 1) {
          y = sample.position.y - 0.1 + this.getRightHillsideElevation(s, dEdge);
        } else if (c === cols - 1) {
          y = -0.25;
        }

        const vIdx = i * cols + c;
        positions.set([pos.x, y, pos.z], vIdx * 3);
        uvs.set([dEdge * 0.16, (s - sMin) * 0.14], vIdx * 2);

        if (i < sSteps && c < cols - 1) {
          const a = i * cols + c;
          const b = a + 1;
          const d = (i + 1) * cols + c;
          const e = d + 1;
          indices.push(a, b, d, b, e, d);
        }
      }
    }

    const hillRibbonGeo = new THREE.BufferGeometry();
    hillRibbonGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    hillRibbonGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    hillRibbonGeo.setIndex(indices);
    hillRibbonGeo.computeVertexNormals();

    const hillRibbonMesh = new THREE.Mesh(hillRibbonGeo, hillMat);
    hillRibbonMesh.receiveShadow = true;
    this.envGroup.add(hillRibbonMesh);

    // Scatter 145 organic Mediterranean scrub bushes across the right hillside slope
    const scrubGeo = new THREE.IcosahedronGeometry(1.05, 1);
    scrubGeo.scale(1.35, 0.68, 1.25);
    scrubGeo.translate(0, 0.35, 0);
    const foliageTex = this.createFoliageTexture(maxAnisotropy);
    const scrubMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: foliageTex,
      roughness: 0.88,
      metalness: 0.02,
    });

    const scrubCount = 145;
    const scrubInstanced = new THREE.InstancedMesh(scrubGeo, scrubMat, scrubCount);
    const dummy = new THREE.Object3D();
    const bushColor = new THREE.Color();
    const bushPalette = [0x4a6328, 0x3b521f, 0x657d38, 0x7c8c42, 0x2f4218];

    for (let b = 0; b < scrubCount; b++) {
      const bs = -5 + ((b * 47) % 315);
      const dEdge = 2.5 + ((b * 29) % 32);
      const sample = road.getSampleAtS(bs);
      const lat = ROAD_HALF_WIDTH + dEdge;
      const pos = sample.position.clone().addScaledVector(sample.right, lat);
      const y = sample.position.y - 0.15 + this.getRightHillsideElevation(bs, dEdge);

      const sc = 0.65 + ((b * 19) % 90) / 100;
      dummy.position.set(pos.x, y, pos.z);
      dummy.rotation.set(0, (b * 1.1) % (Math.PI * 2), -0.25);
      dummy.scale.set(sc * 1.2, sc * 0.75, sc * 1.1);
      dummy.updateMatrix();
      scrubInstanced.setMatrixAt(b, dummy.matrix);
      scrubInstanced.setColorAt(b, bushColor.setHex(bushPalette[b % bushPalette.length]));
    }
    scrubInstanced.instanceMatrix.needsUpdate = true;
    if (scrubInstanced.instanceColor) scrubInstanced.instanceColor.needsUpdate = true;
    scrubInstanced.computeBoundingSphere();
    this.envGroup.add(scrubInstanced);

    // 2. Detailed Roadside European Stone & Stucco Villas with Terracotta Barrel-Tile Roofs, Eaves & Chimneys
    const villaSpots = [
      { s: 42, side: -1, dist: 21, w: 12, h: 8.2, d: 15, style: 0 },
      { s: 82, side: -1, dist: 22, w: 13, h: 9.2, d: 16, style: 1 },
      { s: 124, side: -1, dist: 21, w: 11, h: 8.4, d: 14, style: 2 },
      { s: 168, side: -1, dist: 22, w: 13, h: 9.0, d: 15, style: 0 },
      { s: 215, side: -1, dist: 23, w: 14, h: 9.5, d: 16, style: 1 },
      { s: 520, side: 1, dist: 24, w: 13, h: 8.8, d: 14, style: 2 },
      { s: 660, side: 1, dist: 24, w: 14, h: 9.2, d: 15, style: 1 },
      { s: 3390, side: -1, dist: 23, w: 13, h: 8.8, d: 15, style: 0 },
      { s: 3480, side: -1, dist: 23, w: 14, h: 9.2, d: 14, style: 2 },
    ];

    for (const v of villaSpots) {
      const sample = road.getSampleAtS(v.s);
      const radius = Math.hypot(v.w, v.d) * 0.58;
      let dist = v.dist;
      let pos = sample.position.clone().addScaledVector(sample.right, v.side * dist);

      // Push outward if needed so villa is 100% guaranteed clear of all road segments
      while (dist < 85 && !this.isFootprintClearOfRoad(road, pos.x, pos.z, radius, 5.5)) {
        dist += 4;
        pos = sample.position.clone().addScaledVector(sample.right, v.side * dist);
      }
      if (!this.isFootprintClearOfRoad(road, pos.x, pos.z, radius, 5.0)) continue;

      this.placedFootprints.push({ x: pos.x, z: pos.z, radius, kind: 'villa' });

      const villa = new THREE.Group();
      villa.position.set(pos.x, 0, pos.z);
      villa.rotation.y = sample.yaw;

      const wallMat =
        v.style === 1
          ? pastelGreenVillaMat
          : v.style === 2
          ? warmOchreVillaMat
          : villaWallMat;

      // Stone plinth base
      const plinth = new THREE.Mesh(
        new THREE.BoxGeometry(v.w + 0.6, 1.2, v.d + 0.6),
        stoneWallMat
      );
      plinth.position.y = 0.6;
      villa.add(plinth);

      // Main stucco villa body
      const bodyGeo = new THREE.BoxGeometry(v.w, v.h, v.d);
      bodyGeo.translate(0, v.h / 2, 0);
      const bodyMesh = new THREE.Mesh(bodyGeo, wallMat);
      bodyMesh.castShadow = true;
      bodyMesh.receiveShadow = true;
      villa.add(bodyMesh);

      // Overhanging roof eaves cornice
      const eaves = new THREE.Mesh(
        new THREE.BoxGeometry(v.w + 1.1, 0.35, v.d + 1.1),
        stoneWallMat
      );
      eaves.position.y = v.h + 0.15;
      villa.add(eaves);

      // Textured terracotta hipped roof
      const roofGeo = new THREE.ConeGeometry(Math.max(v.w, v.d) * 0.78, 3.2, 4);
      roofGeo.rotateY(Math.PI / 4);
      roofGeo.translate(0, v.h + 1.75, 0);
      const roofMesh = new THREE.Mesh(roofGeo, terracottaRoofMat);
      roofMesh.scale.set((v.w + 0.8) / 12, 1, (v.d + 0.8) / 12);
      roofMesh.castShadow = true;
      villa.add(roofMesh);

      // Stone chimney stack on roof
      const chimney = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 2.2, 0.95),
        stoneWallMat
      );
      chimney.position.set(v.w * 0.22, v.h + 2.1, -v.d * 0.18);
      villa.add(chimney);

      this.envGroup.add(villa);
    }

    // 3. Scenic Stone Bridge Overpass on the Left Vista (s = 65m, safely clear of road & villas!)
    const leftBridgeGroup = new THREE.Group();
    const cliffSample = road.getSampleAtS(65);
    const cliffPos = cliffSample.position.clone().addScaledVector(cliffSample.right, -52);
    leftBridgeGroup.position.set(cliffPos.x, 0, cliffPos.z);
    leftBridgeGroup.rotation.y = cliffSample.yaw;

    const stoneBridgeDeck = new THREE.Mesh(
      new THREE.BoxGeometry(24, 2.0, 7.5),
      stoneWallMat
    );
    stoneBridgeDeck.position.set(0, 7.5, 0);
    leftBridgeGroup.add(stoneBridgeDeck);

    for (const px of [-8, 8]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(3.2, 7.5, 6.5), stoneWallMat);
      pier.position.set(px, 3.75, 0);
      leftBridgeGroup.add(pier);
    }

    this.envGroup.add(leftBridgeGroup);
  }

  private buildRealisticCityBuildings(road: RoadSystem, maxAnisotropy: number): void {
    const glassTextures = this.createGlassTowerDaytimeTexture(maxAnisotropy);
    const stoneTextures = this.createLimestoneBuildingTexture(maxAnisotropy);
    const brickTextures = this.createTerracottaBrickTexture(maxAnisotropy);
    const roofTileTex = this.createTerracottaRoofTexture(maxAnisotropy);

    const glassTowerMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: glassTextures.map,
      bumpMap: glassTextures.bumpMap,
      bumpScale: 0.18,
      roughness: 0.18,
      metalness: 0.76,
    });

    const limestoneTowerMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: stoneTextures.map,
      bumpMap: stoneTextures.bumpMap,
      bumpScale: 0.26,
      roughness: 0.68,
      metalness: 0.12,
    });

    const brickTowerMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: brickTextures.map,
      bumpMap: brickTextures.bumpMap,
      bumpScale: 0.26,
      roughness: 0.72,
      metalness: 0.10,
    });

    const podiumTrimMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.42,
      metalness: 0.58,
    });

    const pilasterStoneMat = new THREE.MeshStandardMaterial({
      color: 0xd6cbb8,
      roughness: 0.72,
      metalness: 0.10,
    });

    const mansardRoofMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      map: roofTileTex,
      roughness: 0.65,
      metalness: 0.25,
    });

    const rooftopMechanicalMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.58,
      metalness: 0.38,
    });

    let seed = 2099;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    const unitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    unitBoxGeo.translate(0, 0.5, 0);

    const buildingGroup = new THREE.Group();
    buildingGroup.name = 'RealisticCityBuildings';

    for (let i = 0; i < 96; i++) {
      const s = (i / 96) * CIRCUIT_LENGTH;
      // Keep right hillside open at s < 280m
      if (s < 280 && i % 2 === 1) continue;
      // Skip over the open ocean span of Vantis Ocean Bridge & inside the Mount Vantis Light Tunnel
      if (s > 880 && s < 2900) continue;

      const sample = road.getSampleAtS(s);
      const side = i % 2 === 0 ? -1 : 1;
      // Along Coastal Bayfront (450..880m), place buildings on the landward side (+1 right) away from the coast
      const actualSide = s >= 450 && s <= 880 ? 1 : side;

      const width = 14 + rand() * 14;
      const depth = 14 + rand() * 14;
      const isHighRise = (s > 240 && s < 550) || (s > 2900 && s < 3160) || s > 3350;
      const totalHeight = isHighRise ? 34 + rand() * 50 : 18 + rand() * 24;

      // Bounding radius includes the 1.16x podium base
      const footprintRadius = Math.hypot(width * 1.18, depth * 1.18) * 0.55;

      let distFromCenter =
        s < 260 ? ROAD_HALF_WIDTH + 34 + rand() * 32 : ROAD_HALF_WIDTH + 24 + rand() * 40;
      let pos = sample.position
        .clone()
        .addScaledVector(sample.right, actualSide * distFromCenter);

      // Push building outward if its footprint is near ANY segment of the curved 3600m circuit or west of coastline
      while (
        distFromCenter < 125 &&
        (!this.isFootprintClearOfRoad(road, pos.x, pos.z, footprintRadius, 6.5) ||
          pos.x - footprintRadius < -435)
      ) {
        distFromCenter += 5;
        pos = sample.position
          .clone()
          .addScaledVector(sample.right, actualSide * distFromCenter);
      }

      if (
        !this.isFootprintClearOfRoad(road, pos.x, pos.z, footprintRadius, 6.0) ||
        pos.x - footprintRadius < -435
      ) {
        continue;
      }

      this.placedFootprints.push({
        x: pos.x,
        z: pos.z,
        radius: footprintRadius,
        kind: 'skyscraper',
      });

      const styleIdx = i % 3;
      const mainMat =
        styleIdx === 0
          ? limestoneTowerMat
          : styleIdx === 1
          ? brickTowerMat
          : glassTowerMat;

      const bldg = new THREE.Group();
      bldg.position.set(pos.x, -0.2, pos.z);
      bldg.rotation.y = sample.yaw + (rand() - 0.5) * 0.10;

      // Tier 1: Ground-level Architectural Colonnade & Podium Base
      const podiumH = Math.min(6.8, totalHeight * 0.22);
      const podium = new THREE.Mesh(unitBoxGeo, limestoneTowerMat);
      podium.scale.set(width * 1.12, podiumH, depth * 1.12);
      podium.castShadow = true;
      podium.receiveShadow = true;
      bldg.add(podium);

      // Entrance Canopy / Marquee Overhang facing the road
      const canopy = new THREE.Mesh(unitBoxGeo, podiumTrimMat);
      canopy.position.set(0, 3.6, -actualSide * (depth * 0.58));
      canopy.scale.set(width * 0.48, 0.35, 2.2);
      bldg.add(canopy);

      const ledge = new THREE.Mesh(unitBoxGeo, podiumTrimMat);
      ledge.position.y = podiumH;
      ledge.scale.set(width * 1.16, 0.6, depth * 1.16);
      bldg.add(ledge);

      // Tier 2: Main Building Shaft
      const shaftH = totalHeight * 0.58;
      const shaft = new THREE.Mesh(unitBoxGeo, mainMat);
      shaft.position.y = podiumH + 0.6;
      shaft.scale.set(width, shaftH, depth);
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      bldg.add(shaft);

      // 4 Corner Vertical Architectural Pilasters (3D structural columns framing the facade!)
      const pilasterMat = styleIdx === 2 ? podiumTrimMat : pilasterStoneMat;
      for (const [cx, cz] of [
        [-0.5, -0.5],
        [0.5, -0.5],
        [-0.5, 0.5],
        [0.5, 0.5],
      ]) {
        const pilaster = new THREE.Mesh(unitBoxGeo, pilasterMat);
        pilaster.position.set(cx * width, podiumH + 0.6, cz * depth);
        pilaster.scale.set(1.25, shaftH, 1.25);
        bldg.add(pilaster);
      }

      // Projecting 3D Architectural Balconies / Cornice Bands along Main Shaft
      for (const frac of [0.28, 0.56, 0.84]) {
        const band = new THREE.Mesh(unitBoxGeo, podiumTrimMat);
        band.position.y = podiumH + 0.6 + shaftH * frac;
        band.scale.set(width * 1.06, 0.42, depth * 1.06);
        bldg.add(band);
      }

      // Tier 3: Upper Architectural Setback Tier
      const upperY = podiumH + 0.6 + shaftH;
      const upperH = totalHeight * 0.20;
      const upperTier = new THREE.Mesh(unitBoxGeo, mainMat);
      upperTier.position.y = upperY;
      upperTier.scale.set(width * 0.78, upperH, depth * 0.78);
      upperTier.castShadow = true;
      bldg.add(upperTier);

      // Tier 4: Rooftop Crown Parapet / Mansard Roof & Mechanical Penthouse
      const roofY = upperY + upperH;
      const parapet = new THREE.Mesh(unitBoxGeo, podiumTrimMat);
      parapet.position.y = roofY;
      parapet.scale.set(width * 0.82, 0.75, depth * 0.82);
      bldg.add(parapet);

      if (styleIdx !== 2) {
        // Stepped architectural penthouse & rooftop mechanical tier on stone & brick buildings
        const crownBase = new THREE.Mesh(unitBoxGeo, mainMat);
        crownBase.position.y = roofY + 0.75;
        crownBase.scale.set(width * 0.54, 2.6, depth * 0.54);
        bldg.add(crownBase);

        const crownCap = new THREE.Mesh(unitBoxGeo, mansardRoofMat);
        crownCap.position.y = roofY + 3.35;
        crownCap.scale.set(width * 0.58, 0.55, depth * 0.58);
        bldg.add(crownCap);
      } else {
        // Modernist mechanical penthouse + communication spire on glass towers
        const penthouse = new THREE.Mesh(unitBoxGeo, rooftopMechanicalMat);
        penthouse.position.y = roofY + 0.75;
        penthouse.scale.set(width * 0.42, 2.8, depth * 0.42);
        bldg.add(penthouse);

        const spire = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.22, 8.5, 6),
          podiumTrimMat
        );
        spire.position.set(0, roofY + 7.5, 0);
        bldg.add(spire);
      }

      buildingGroup.add(bldg);
    }

    this.envGroup.add(buildingGroup);
  }

  private buildRoadsideTreesAndShrubs(road: RoadSystem, maxAnisotropy: number): void {
    const foliageTex = this.createFoliageTexture(maxAnisotropy);
    const treeCount = 165;

    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.34, 6.2, 8);
    trunkGeo.translate(0, 3.1, 0);
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x4f3622,
      roughness: 0.9,
      metalness: 0.04,
    });

    const canopyGeo = new THREE.IcosahedronGeometry(2.7, 2);
    const posAttr = canopyGeo.attributes.position;
    const uvAttr = canopyGeo.attributes.uv;
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vy = posAttr.getY(i);
      const vz = posAttr.getZ(i);
      const noise = 0.88 + Math.sin(vx * 1.9 + vy * 2.1 + vz * 1.7) * 0.14;
      posAttr.setXYZ(i, vx * noise * 1.25, vy * noise * 0.78 + 6.4, vz * noise * 1.25);
      if (uvAttr) {
        uvAttr.setXY(i, uvAttr.getX(i) * 2.5, uvAttr.getY(i) * 2.5);
      }
    }
    canopyGeo.computeVertexNormals();

    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: foliageTex,
      roughness: 0.84,
      metalness: 0.02,
      flatShading: false,
    });

    const cypressGeo = new THREE.ConeGeometry(1.05, 12.0, 9);
    cypressGeo.translate(0, 6.0, 0);
    const cypressMat = new THREE.MeshStandardMaterial({
      color: 0x47662c,
      map: foliageTex,
      roughness: 0.86,
      metalness: 0.02,
      flatShading: false,
    });

    const trunksInstanced = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    const canopiesInstancedA = new THREE.InstancedMesh(canopyGeo, canopyMat, treeCount);
    const canopiesInstancedB = new THREE.InstancedMesh(canopyGeo, canopyMat, treeCount);
    const canopiesInstancedC = new THREE.InstancedMesh(canopyGeo, canopyMat, treeCount);
    const cypressInstanced = new THREE.InstancedMesh(cypressGeo, cypressMat, 65);

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const foliageTints = [0x769c46, 0x5f8236, 0x8cb354, 0x4e7029];

    let tIdx = 0;
    let cIdx = 0;
    let seed = 555;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let i = 0; i < treeCount; i++) {
      const s = (i / treeCount) * CIRCUIT_LENGTH;
      // Skip over the Ocean Suspension Bridge (s = 900..2170m) and inside the Mountain Tunnel (s = 2150..2890m)
      if (s > 890 && s < 2895) continue;

      const sample = road.getSampleAtS(s);
      const side = i % 2 === 0 ? -1 : 1;
      const dEdge = 3.2 + rand() * 18;
      const dist = ROAD_HALF_WIDTH + dEdge;
      const pos = sample.position.clone().addScaledVector(sample.right, side * dist);

      // Verify tree trunk is clear of all road segments and on mainland east of x = -435
      if (
        road.getMinDistanceToRoad(pos.x, pos.z).distance < ROAD_HALF_WIDTH + 2.8 ||
        pos.x < -435
      ) {
        continue;
      }

      const hillLift =
        side === 1 && (s <= 330 || s >= 3575)
          ? sample.position.y - 0.15 + this.getRightHillsideElevation(s > 3000 ? s - CIRCUIT_LENGTH : s, dEdge)
          : 0;
      const scale = 0.85 + rand() * 0.45;

      const leanZ = side === -1 ? -0.07 : -0.10;
      dummy.position.set(pos.x, hillLift, pos.z);
      dummy.rotation.set((rand() - 0.5) * 0.08, rand() * Math.PI * 2, leanZ);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      trunksInstanced.setMatrixAt(tIdx, dummy.matrix);

      canopiesInstancedA.setMatrixAt(tIdx, dummy.matrix);
      canopiesInstancedA.setColorAt(tIdx, color.setHex(foliageTints[i % foliageTints.length]));

      dummy.position.set(pos.x + 1.35 * scale, hillLift + 0.55 * scale, pos.z - 0.95 * scale);
      dummy.rotation.y += 1.2;
      dummy.scale.set(scale * 0.84, scale * 0.78, scale * 0.84);
      dummy.updateMatrix();
      canopiesInstancedB.setMatrixAt(tIdx, dummy.matrix);
      canopiesInstancedB.setColorAt(
        tIdx,
        color.setHex(foliageTints[(i + 1) % foliageTints.length])
      );

      dummy.position.set(pos.x - 0.85 * scale, hillLift + 1.35 * scale, pos.z + 0.65 * scale);
      dummy.rotation.y += 2.1;
      dummy.scale.set(scale * 0.72, scale * 0.72, scale * 0.72);
      dummy.updateMatrix();
      canopiesInstancedC.setMatrixAt(tIdx, dummy.matrix);
      canopiesInstancedC.setColorAt(tIdx, color.setHex(0x96bf5a));

      tIdx++;

      if (i % 3 === 0 && cIdx < 65) {
        const cPos = sample.position
          .clone()
          .addScaledVector(sample.right, side * (dist + 2.8));
        if (road.getMinDistanceToRoad(cPos.x, cPos.z).distance >= ROAD_HALF_WIDTH + 3.0) {
          dummy.position.set(cPos.x, hillLift, cPos.z);
          dummy.rotation.set(0, rand() * Math.PI, 0);
          dummy.scale.set(0.85 + rand() * 0.3, 0.95 + rand() * 0.35, 0.85 + rand() * 0.3);
          dummy.updateMatrix();
          cypressInstanced.setMatrixAt(cIdx++, dummy.matrix);
        }
      }
    }

    trunksInstanced.count = tIdx;
    canopiesInstancedA.count = tIdx;
    canopiesInstancedB.count = tIdx;
    canopiesInstancedC.count = tIdx;
    cypressInstanced.count = cIdx;

    trunksInstanced.instanceMatrix.needsUpdate = true;
    canopiesInstancedA.instanceMatrix.needsUpdate = true;
    canopiesInstancedB.instanceMatrix.needsUpdate = true;
    canopiesInstancedC.instanceMatrix.needsUpdate = true;
    if (canopiesInstancedA.instanceColor) canopiesInstancedA.instanceColor.needsUpdate = true;
    if (canopiesInstancedB.instanceColor) canopiesInstancedB.instanceColor.needsUpdate = true;
    if (canopiesInstancedC.instanceColor) canopiesInstancedC.instanceColor.needsUpdate = true;
    cypressInstanced.instanceMatrix.needsUpdate = true;

    trunksInstanced.computeBoundingSphere();
    canopiesInstancedA.computeBoundingSphere();
    canopiesInstancedB.computeBoundingSphere();
    canopiesInstancedC.computeBoundingSphere();
    cypressInstanced.computeBoundingSphere();

    this.envGroup.add(trunksInstanced);
    this.envGroup.add(canopiesInstancedA);
    this.envGroup.add(canopiesInstancedB);
    this.envGroup.add(canopiesInstancedC);
    this.envGroup.add(cypressInstanced);
  }

  private buildGrandBridgeStructure(road: RoadSystem): void {
    const bridgeGroup = new THREE.Group();
    bridgeGroup.name = 'GrandBridge';

    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.38,
      metalness: 0.58,
    });
    const caissonMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.78,
      metalness: 0.18,
    });
    const fenderMat = new THREE.MeshStandardMaterial({
      color: 0xf97316,
      roughness: 0.5,
      metalness: 0.3,
    });
    const cableMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.32,
      metalness: 0.78,
    });
    const beaconRedMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: 0xf43f5e,
      emissiveIntensity: 2.5,
      roughness: 0.2,
    });
    const deckGlowCyanMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee,
      emissive: 0x22d3ee,
      emissiveIntensity: 2.0,
      roughness: 0.2,
    });

    // 5 monumental twin-leg suspension towers across the 1.24 km Vantis Ocean Bridge (s = 920..2160m)
    const towerLocationsS = [1060, 1290, 1520, 1750, 1980];
    for (const s of towerLocationsS) {
      const sample = road.getSampleAtS(s);
      const tower = new THREE.Group();
      tower.position.copy(sample.position);
      tower.rotation.set(0, sample.yaw, 0);

      // Deep ocean concrete caisson foundation pier extending down into the sea below the bridge deck
      const caissonH = sample.position.y + 6.5;
      const caisson = new THREE.Mesh(
        new THREE.BoxGeometry((ROAD_HALF_WIDTH + 4.8) * 2, caissonH, 7.2),
        caissonMat
      );
      caisson.position.set(0, -caissonH / 2 - 0.6, 0);
      tower.add(caisson);

      // High-visibility orange marine fender bumper collar at ocean waterline (y ~ 0.5m world -> -sample.position.y + 0.8 local)
      const fender = new THREE.Mesh(
        new THREE.BoxGeometry((ROAD_HALF_WIDTH + 5.2) * 2, 1.4, 7.8),
        fenderMat
      );
      fender.position.set(0, -sample.position.y + 0.8, 0);
      tower.add(fender);

      // Twin tall suspension pylon legs rising 44m above the bridge deck
      const legGeo = new THREE.BoxGeometry(2.8, 56, 3.6);
      const leftLeg = new THREE.Mesh(legGeo, pylonMat);
      leftLeg.position.set(-(ROAD_HALF_WIDTH + 2.4), 16, 0);
      tower.add(leftLeg);

      const rightLeg = new THREE.Mesh(legGeo, pylonMat);
      rightLeg.position.set(ROAD_HALF_WIDTH + 2.4, 16, 0);
      tower.add(rightLeg);

      // Three horizontal cross-portal struts above the roadway
      const beamGeo = new THREE.BoxGeometry((ROAD_HALF_WIDTH + 3.0) * 2, 2.8, 3.2);
      for (const by of [18, 30, 42]) {
        const beam = new THREE.Mesh(beamGeo, pylonMat);
        beam.position.set(0, by, 0);
        tower.add(beam);
      }

      // Twin aviation warning beacons atop the suspension tower legs
      const beaconGeo = new THREE.SphereGeometry(0.65, 8, 8);
      for (const side of [-1, 1]) {
        const beacon = new THREE.Mesh(beaconGeo, beaconRedMat);
        beacon.position.set(side * (ROAD_HALF_WIDTH + 2.4), 44.5, 0);
        tower.add(beacon);
      }

      bridgeGroup.add(tower);
    }

    // Vertical steel suspender cables, catenary height modulation & glowing cyan bridge edge strips every 14m
    const suspenderGeo = new THREE.CylinderGeometry(0.11, 0.11, 1, 6);
    const edgeGlowGeo = new THREE.BoxGeometry(0.28, 0.22, 8.5);
    for (let s = 935; s <= 2145; s += 14) {
      const sample = road.getSampleAtS(s);
      // Calculate distance to nearest suspension tower for realistic parabolic catenary cable height
      let minTowerDist = 999;
      for (const ts of towerLocationsS) {
        minTowerDist = Math.min(minTowerDist, Math.abs(s - ts));
      }
      const normSpan = Math.min(1, minTowerDist / 115);
      const cableHeight = 8.5 + (1 - normSpan * (2 - normSpan)) * 31.0;

      for (const side of [-1, 1]) {
        const cable = new THREE.Mesh(suspenderGeo, cableMat);
        cable.position
          .copy(sample.position)
          .addScaledVector(sample.right, side * (ROAD_HALF_WIDTH + 1.25))
          .addScaledVector(sample.up, cableHeight * 0.5);
        cable.scale.set(1, cableHeight, 1);
        bridgeGroup.add(cable);

        const edgeGlow = new THREE.Mesh(edgeGlowGeo, deckGlowCyanMat);
        edgeGlow.position
          .copy(sample.position)
          .addScaledVector(sample.right, side * (ROAD_HALF_WIDTH + 0.95))
          .addScaledVector(sample.up, 0.92);
        edgeGlow.rotation.set(sample.pitch, sample.yaw, 0, 'YXZ');
        bridgeGroup.add(edgeGlow);
      }
    }

    // Ocean vessels (composite multi-part ships floating on the sea beside the bridge)
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.5,
      metalness: 0.4,
    });
    const deckSuperMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.4,
      metalness: 0.2,
    });
    const shipSpots = [
      { x: -690, z: -260, yaw: 0.35, scale: 1.1 },
      { x: -960, z: -120, yaw: -0.45, scale: 1.35 },
      { x: -670, z: 95, yaw: 0.85, scale: 1.0 },
    ];
    for (const sp of shipSpots) {
      const ship = new THREE.Group();
      ship.position.set(sp.x, 0.35, sp.z);
      ship.rotation.y = sp.yaw;
      ship.scale.setScalar(sp.scale);

      const hull = new THREE.Mesh(new THREE.BoxGeometry(11, 3.6, 38), hullMat);
      hull.position.y = 1.6;
      ship.add(hull);

      const bridgeCabin = new THREE.Mesh(new THREE.BoxGeometry(8.5, 5.5, 9.0), deckSuperMat);
      bridgeCabin.position.set(0, 5.8, -10);
      ship.add(bridgeCabin);

      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 9, 6), pylonMat);
      mast.position.set(0, 12.5, -10);
      ship.add(mast);

      const mastLight = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), beaconRedMat);
      mastLight.position.set(0, 17.2, -10);
      ship.add(mastLight);

      bridgeGroup.add(ship);
    }

    this.envGroup.add(bridgeGroup);
  }

  private buildElevatedViaductPillars(road: RoadSystem): void {
    const pillarGeo = new THREE.CylinderGeometry(1.4, 1.8, 16, 12);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.75,
      metalness: 0.15,
    });

    // Support pillars under the Skyline Elevated Viaduct (s = 2890..3145m)
    for (let s = 2895; s <= 3145; s += 26) {
      const sample = road.getSampleAtS(s);
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.copy(sample.position).add(new THREE.Vector3(0, -9.2, 0));
      this.envGroup.add(pillar);
    }
  }

  private buildUndergroundTunnel(road: RoadSystem, maxAnisotropy: number): void {
    const tunnelGroup = new THREE.Group();
    tunnelGroup.name = 'MountainOverpassTunnel';

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.55,
      metalness: 0.35,
      side: THREE.DoubleSide,
    });
    const portalStoneMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.78,
      metalness: 0.15,
    });
    const goldLightMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfbbf24,
      emissiveIntensity: 2.8,
      roughness: 0.15,
    });
    const cyanLightMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      emissive: 0x22d3ee,
      emissiveIntensity: 2.6,
      roughness: 0.15,
    });
    const amberLightMat = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xf59e0b,
      emissiveIntensity: 2.6,
      roughness: 0.15,
    });
    const whiteFloodMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfef08a,
      emissiveIntensity: 3.0,
      roughness: 0.1,
    });

    const hillTex = this.createHillsideTerrainTexture(maxAnisotropy);
    const rockCoverMat = new THREE.MeshStandardMaterial({
      color: 0x787564,
      map: hillTex,
      roughness: 0.92,
      metalness: 0.04,
      flatShading: true,
    });
    const alpinePeakMat = new THREE.MeshStandardMaterial({
      color: 0x64685a,
      map: hillTex,
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true,
    });

    const w = ROAD_HALF_WIDTH + 1.4;
    const h = 8.4;

    // 1. Monumental North & South Mountain Tunnel Portals (s = 2160m right after Ocean Bridge, s = 2880m exit)
    for (const portalS of [2160, 2880]) {
      const sample = road.getSampleAtS(portalS);
      const portal = new THREE.Group();
      portal.position.copy(sample.position);
      portal.rotation.set(sample.pitch, sample.yaw, 0, 'YXZ');

      // Left and right massive mountain cliff wing-walls outside the roadway
      const wingGeo = new THREE.BoxGeometry(16, 26, 8);
      const leftWing = new THREE.Mesh(wingGeo, portalStoneMat);
      leftWing.position.set(-(w + 7.5), 12.5, 0);
      portal.add(leftWing);

      const rightWing = new THREE.Mesh(wingGeo, portalStoneMat);
      rightWing.position.set(w + 7.5, 12.5, 0);
      portal.add(rightWing);

      // Massive upper mountain cliff headwall above tunnel ceiling (y >= h)
      const headwall = new THREE.Mesh(
        new THREE.BoxGeometry((w + 15) * 2, 18, 8.5),
        portalStoneMat
      );
      headwall.position.set(0, h + 9.0, 0);
      portal.add(headwall);

      // Glowing Neon Portal Arch Frame
      const topFrameGlow = new THREE.Mesh(
        new THREE.BoxGeometry(w * 2 + 1.2, 0.75, 9.2),
        goldLightMat
      );
      topFrameGlow.position.set(0, h + 0.2, 0);
      portal.add(topFrameGlow);

      for (const side of [-1, 1]) {
        const sideFrameGlow = new THREE.Mesh(
          new THREE.BoxGeometry(0.65, h + 0.4, 9.2),
          cyanLightMat
        );
        sideFrameGlow.position.set(side * (w + 0.1), h / 2, 0);
        portal.add(sideFrameGlow);
      }

      tunnelGroup.add(portal);
    }

    // 2. Continuous 720-Meter Light-Filled Mountain Tunnel Bore (s = 2160..2880m, every 10m = 73 segments)
    const wallGeo = new THREE.BoxGeometry(1.3, h, 10.8);
    const roofGeo = new THREE.BoxGeometry(w * 2 + 2.0, 1.6, 10.8);
    const coverGeo = new THREE.BoxGeometry(w * 2 + 14.0, 7.5, 11.2);
    const ribTopGeo = new THREE.BoxGeometry(w * 2 - 0.6, 0.42, 0.65);
    const ribSideGeo = new THREE.BoxGeometry(0.45, h - 0.8, 0.65);
    const ceilingStripGeo = new THREE.BoxGeometry(0.55, 0.28, 9.6);
    const wallStripGeo = new THREE.BoxGeometry(0.24, 0.28, 9.6);
    const curbStudGeo = new THREE.BoxGeometry(0.32, 0.16, 1.4);

    let segIdx = 0;
    for (let s = 2160; s <= 2880; s += 10) {
      const sample = road.getSampleAtS(s);
      const arch = new THREE.Group();
      arch.position.copy(sample.position);
      arch.rotation.set(sample.pitch, sample.yaw, 0, 'YXZ');

      // Left & Right acoustic tunnel walls
      const leftWall = new THREE.Mesh(wallGeo, wallMat);
      leftWall.position.set(-w, h / 2 - 0.2, 0);
      arch.add(leftWall);

      const rightWall = new THREE.Mesh(wallGeo, wallMat);
      rightWall.position.set(w, h / 2 - 0.2, 0);
      arch.add(rightWall);

      // Tunnel ceiling slab
      const roof = new THREE.Mesh(roofGeo, wallMat);
      roof.position.set(0, h, 0);
      arch.add(roof);

      // Solid rock overburden immediately above tunnel roof
      const mountainCover = new THREE.Mesh(coverGeo, rockCoverMat);
      mountainCover.position.set(0, h + 4.4, 0);
      arch.add(mountainCover);

      // Alternating glowing LED arch ribs (Gold / Cyan / Amber)
      const ribMat =
        segIdx % 3 === 0 ? goldLightMat : segIdx % 3 === 1 ? cyanLightMat : amberLightMat;

      const ribTop = new THREE.Mesh(ribTopGeo, ribMat);
      ribTop.position.set(0, h - 0.85, 0);
      arch.add(ribTop);

      for (const side of [-1, 1]) {
        // Vertical glowing arch rib on left & right walls
        const ribSide = new THREE.Mesh(ribSideGeo, ribMat);
        ribSide.position.set(side * (w - 0.68), h / 2 - 0.1, 0);
        arch.add(ribSide);

        // Twin continuous overhead floodlight banks along the ceiling (x = -3.8m, +3.8m)
        const ceilingLamp = new THREE.Mesh(ceilingStripGeo, whiteFloodMat);
        ceilingLamp.position.set(side * 3.8, h - 0.82, 0);
        arch.add(ceilingLamp);

        // Triple horizontal neon light strips along both tunnel walls (y = 1.6m, 3.5m, 5.4m)
        const lowWallLight = new THREE.Mesh(wallStripGeo, amberLightMat);
        lowWallLight.position.set(side * (w - 0.68), 1.6, 0);
        arch.add(lowWallLight);

        const midWallLight = new THREE.Mesh(wallStripGeo, cyanLightMat);
        midWallLight.position.set(side * (w - 0.68), 3.5, 0);
        arch.add(midWallLight);

        const highWallLight = new THREE.Mesh(wallStripGeo, goldLightMat);
        highWallLight.position.set(side * (w - 0.68), 5.4, 0);
        arch.add(highWallLight);

        // Glowing roadway curb reflector LEDs at road edge
        const curbStud = new THREE.Mesh(
          curbStudGeo,
          segIdx % 2 === 0 ? goldLightMat : cyanLightMat
        );
        curbStud.position.set(side * (ROAD_HALF_WIDTH - 0.25), 0.12, 0);
        arch.add(curbStud);
      }

      tunnelGroup.add(arch);
      segIdx++;
    }

    // 3. Colossal 3D Mountain Massif ("Gunung Vantis") Rising Above and Around the Tunnel
    // 3a. Overhead mountain ridge peaks sitting directly atop the tunnel overburden (y >= sample.position.y + 8.8m)
    for (let i = 0; i < 14; i++) {
      const s = 2165 + (i / 13) * 710;
      const sample = road.getSampleAtS(s);
      const peakH = 52 + ((i * 29) % 58);
      const peakR = 38 + ((i * 17) % 28);
      const peakGeo = new THREE.ConeGeometry(peakR, peakH, 6);
      peakGeo.translate(0, peakH / 2, 0);
      const peakMesh = new THREE.Mesh(
        peakGeo,
        i % 2 === 0 ? rockCoverMat : alpinePeakMat
      );
      const latShift = ((i % 3) - 1) * 14;
      peakMesh.position
        .copy(sample.position)
        .addScaledVector(sample.right, latShift);
      // Base rests at y = sample.position.y + h + 0.5m so it is 100% above the tunnel ceiling!
      peakMesh.position.y = sample.position.y + h + 0.5;
      peakMesh.rotation.y = i * 1.1;
      tunnelGroup.add(peakMesh);
    }

    // 3b. Towering Left & Right Flanking Mountain Peaks Grounded Outside the Tunnel Walls
    for (let i = 0; i < 18; i++) {
      const s = 2145 + (i / 17) * 750;
      const sample = road.getSampleAtS(s);
      const side = i % 2 === 0 ? -1 : 1;
      const peakR = 36 + ((i * 19) % 24);
      const peakH = 68 + ((i * 37) % 72);
      const dist = ROAD_HALF_WIDTH + peakR + 8 + (i % 3) * 10;
      const pos = sample.position.clone().addScaledVector(sample.right, side * dist);

      if (!this.isFootprintClearOfRoad(road, pos.x, pos.z, peakR, 4.0)) {
        continue;
      }

      const flankGeo = new THREE.ConeGeometry(peakR, peakH, 7);
      flankGeo.translate(0, peakH / 2 - 2, 0);
      const flankMesh = new THREE.Mesh(
        flankGeo,
        i % 2 === 0 ? alpinePeakMat : rockCoverMat
      );
      flankMesh.position.set(pos.x, 0, pos.z);
      flankMesh.rotation.y = i * 0.85;
      tunnelGroup.add(flankMesh);
    }

    this.envGroup.add(tunnelGroup);
  }

  private buildIndustrialSector(road: RoadSystem): void {
    const indGroup = new THREE.Group();
    const containerGeo = new THREE.BoxGeometry(6, 3.2, 13);
    containerGeo.translate(0, 1.6, 0);
    const containerColors = [0xd97706, 0x0284c7, 0xdc2626, 0x059669];

    let idx = 0;
    for (let s = 3160; s <= 3365; s += 26) {
      const sample = road.getSampleAtS(s);
      for (const side of [-1, 1]) {
        const stackHeight = 1 + (idx % 3);
        const radius = Math.hypot(6, 13) * 0.55;
        let offset = ROAD_HALF_WIDTH + 16 + (idx % 2) * 8;
        let basePos = sample.position.clone().addScaledVector(sample.right, side * offset);

        while (
          offset < 80 &&
          !this.isFootprintClearOfRoad(road, basePos.x, basePos.z, radius, 5.5)
        ) {
          offset += 4;
          basePos = sample.position.clone().addScaledVector(sample.right, side * offset);
        }
        if (!this.isFootprintClearOfRoad(road, basePos.x, basePos.z, radius, 5.0)) {
          idx++;
          continue;
        }

        this.placedFootprints.push({
          x: basePos.x,
          z: basePos.z,
          radius,
          kind: 'container',
        });

        for (let h = 0; h < stackHeight; h++) {
          const mat = new THREE.MeshStandardMaterial({
            color: containerColors[(idx + h) % containerColors.length],
            roughness: 0.6,
            metalness: 0.4,
          });
          const box = new THREE.Mesh(containerGeo, mat);
          box.position.set(basePos.x, h * 3.25, basePos.z);
          box.rotation.y = sample.yaw;
          indGroup.add(box);
        }
        idx++;
      }
    }

    this.envGroup.add(indGroup);
  }

  private buildStreetlights(road: RoadSystem): void {
    const poleCount = Math.floor(CIRCUIT_LENGTH / 36) * 2;
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.18, 8.2, 6);
    poleGeo.translate(0, 4.1, 0);
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.45,
      metalness: 0.75,
    });

    const fixtureGeo = new THREE.BoxGeometry(1.6, 0.2, 0.5);
    const fixtureMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.25,
      roughness: 0.3,
      metalness: 0.6,
    });
    this.streetLightMaterial = fixtureMat;

    const polesInstanced = new THREE.InstancedMesh(poleGeo, poleMat, poleCount);
    const fixturesInstanced = new THREE.InstancedMesh(fixtureGeo, fixtureMat, poleCount);

    const dummy = new THREE.Object3D();
    let count = 0;

    for (let s = 180; s < CIRCUIT_LENGTH; s += 36) {
      // Skip streetlights inside the enclosed Mount Vantis Light Tunnel (s = 2150..2890m)
      if (s > 2145 && s < 2895) continue;
      const sample = road.getSampleAtS(s);

      for (const side of [-1, 1]) {
        const base = sample.position
          .clone()
          .addScaledVector(sample.right, side * (ROAD_HALF_WIDTH + 0.65));

        dummy.position.copy(base);
        dummy.rotation.set(0, sample.yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        polesInstanced.setMatrixAt(count, dummy.matrix);

        dummy.position
          .copy(base)
          .addScaledVector(sample.up, 8.1)
          .addScaledVector(sample.right, -side * 0.75);
        dummy.rotation.set(0, sample.yaw, 0);
        dummy.updateMatrix();
        fixturesInstanced.setMatrixAt(count, dummy.matrix);

        count++;
      }
    }

    polesInstanced.count = count;
    fixturesInstanced.count = count;
    polesInstanced.instanceMatrix.needsUpdate = true;
    fixturesInstanced.instanceMatrix.needsUpdate = true;
    polesInstanced.computeBoundingSphere();
    fixturesInstanced.computeBoundingSphere();

    this.envGroup.add(polesInstanced);
    this.envGroup.add(fixturesInstanced);
  }

  private drawRoadsideLcdFrame(t: number): void {
    const canvas = this.lcdCanvas;
    const ctx = this.lcdCtx;
    if (!canvas || !ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // 1. Deep LED Matrix Background
    const bgGrad = ctx.createLinearGradient(0, 0, w, h);
    bgGrad.addColorStop(0, '#040814');
    bgGrad.addColorStop(0.5, '#091326');
    bgGrad.addColorStop(1, '#050a18');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle animated diagonal cyber grid bars
    const sweepOffset = (t * 90) % 64;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = 2;
    for (let x = -h; x < w + h; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x + sweepOffset, 0);
      ctx.lineTo(x + sweepOffset - h * 0.6, h);
      ctx.stroke();
    }

    // 2. Top Broadcast Header Bar
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(10, 10, w - 20, 28);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(10, 10, 136, 28);
    ctx.fillStyle = '#040814';
    ctx.font = 'bold 15px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LIVE BROADCAST', 78, 24);

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('NEO VANTIS LED-NET // CH.2099', w - 20, 24);

    // 3. Left & Right Animated Spectrum Equalizer Bars
    const barCount = 6;
    for (let i = 0; i < barCount; i++) {
      const wave = 0.35 + 0.65 * Math.abs(Math.sin(t * 5.2 + i * 0.85));
      const bh = Math.round(wave * 78);
      const by = 136 - bh;
      ctx.fillStyle = i % 2 === 0 ? '#38bdf8' : '#f59e0b';
      // Left equalizer bank
      ctx.fillRect(18 + i * 10, by, 7, bh);
      // Right equalizer bank
      ctx.fillRect(w - 25 - i * 10, by, 7, bh);
    }

    // 4. Animated race headline with sweeping gradient and pulsing chevrons
    const headline = 'VANTIS GP';
    const pulse = 1 + Math.sin(t * 4.5) * 0.04;
    ctx.save();
    ctx.translate(w / 2, 96);
    ctx.scale(pulse, pulse);

    // Chromatic cyan/magenta offset glow, kept between the spectrum bars.
    ctx.font = 'italic 900 64px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxHeadlineWidth = w - 184;
    const glitchShift = Math.sin(t * 14) > 0.92 ? 4 : 2;
    ctx.fillStyle = 'rgba(6, 182, 212, 0.55)';
    ctx.fillText(headline, -glitchShift, -2, maxHeadlineWidth);
    ctx.fillStyle = 'rgba(244, 63, 94, 0.55)';
    ctx.fillText(headline, glitchShift, 3, maxHeadlineWidth);

    // Main sweeping metallic-neon headline gradient
    const sweepX = ((t * 260) % (w + 200)) - (w / 2 + 100);
    const textGrad = ctx.createLinearGradient(-180, -30, 180, 30);
    textGrad.addColorStop(0, '#f59e0b');
    textGrad.addColorStop(0.35, '#fef08a');
    textGrad.addColorStop(0.55, '#ffffff');
    textGrad.addColorStop(0.8, '#38bdf8');
    textGrad.addColorStop(1, '#f59e0b');
    ctx.fillStyle = textGrad;
    ctx.fillText(headline, 0, 0, maxHeadlineWidth);

    // Bright laser highlight band sweeping across the letters
    ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.fillRect(sweepX, -34, 36, 68);
    ctx.restore();

    // Animated flashing chevrons framing the headline
    const chevStep = Math.floor(t * 6) % 3;
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = chevStep === 0 ? '#f59e0b' : '#38bdf8';
    ctx.fillText('>>>', 92, 54);
    ctx.fillText('<<<', w - 92, 54);

    // 5. Bottom Scrolling Marquee Ticker
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(10, h - 42, w - 20, 32);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(10, h - 42, w - 20, 32);

    const tickerText =
      '★ OFFICIAL NEO VANTIS GRAND PRIX  ★  HIGH-SPEED STREET CIRCUIT  ';
    ctx.save();
    ctx.beginPath();
    ctx.rect(12, h - 40, w - 24, 28);
    ctx.clip();
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 16px "Chakra Petch", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const tickerWidth = ctx.measureText(tickerText).width;
    const scrollX = (t * 110) % tickerWidth;
    for (let x = 16 - scrollX; x < w - 12; x += tickerWidth) {
      ctx.fillText(tickerText, x, h - 26);
    }
    ctx.restore();

    // 6. Horizontal LED Scanlines & Neon Outer Frame Border
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    for (let y = 0; y < h; y += 4) {
      ctx.fillRect(0, y, w, 1);
    }

    ctx.strokeStyle = Math.floor(t * 3) % 2 === 0 ? '#f59e0b' : '#06b6d4';
    ctx.lineWidth = 5;
    ctx.strokeRect(3, 3, w - 6, h - 6);

    if (this.lcdTexture) {
      this.lcdTexture.needsUpdate = true;
    }
  }

  private buildAnimatedLcdBillboards(road: RoadSystem, maxAnisotropy: number): void {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 220;
    this.lcdCanvas = canvas;
    this.lcdCtx = canvas.getContext('2d');

    const lcdTex = new THREE.CanvasTexture(canvas);
    lcdTex.colorSpace = THREE.SRGBColorSpace;
    lcdTex.anisotropy = maxAnisotropy;
    this.lcdTexture = lcdTex;
    this.drawRoadsideLcdFrame(0);

    const screenMat = new THREE.MeshBasicMaterial({
      map: lcdTex,
    });
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.35,
      metalness: 0.78,
    });
    const strutMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.45,
      metalness: 0.7,
    });
    const neonTrimMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x06b6d4,
      emissiveIntensity: 1.8,
      roughness: 0.2,
    });
    const amberTrimMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.8,
      roughness: 0.2,
    });

    // Place large roadside LCD billboards on open ground clear of the right-side hillside embankment (s = -25..335m)
    const billboardPlacements: Array<{ s: number; side: -1 | 1; distFromCenter: number }> = [
      { s: 48, side: -1, distFromCenter: ROAD_HALF_WIDTH + 6.2 },
      { s: 410, side: -1, distFromCenter: ROAD_HALF_WIDTH + 6.8 },
      { s: 740, side: 1, distFromCenter: ROAD_HALF_WIDTH + 6.8 },
      { s: 3180, side: 1, distFromCenter: ROAD_HALF_WIDTH + 6.8 },
      { s: 3440, side: -1, distFromCenter: ROAD_HALF_WIDTH + 6.4 },
    ];

    const screenW = 13.2;
    const screenH = 5.6;

    for (const bp of billboardPlacements) {
      const sample = road.getSampleAtS(bp.s);
      const basePos = sample.position
        .clone()
        .addScaledVector(sample.right, bp.side * bp.distFromCenter);

      const boardGroup = new THREE.Group();
      boardGroup.position.copy(basePos);
      // Angle the LCD board slightly inward toward oncoming racers so it is maximally legible from the road
      boardGroup.rotation.set(0, sample.yaw - bp.side * 0.34, 0);

      // Twin heavy steel support columns + concrete foundation plinths
      const pillarH = 8.4;
      const pillarGeo = new THREE.CylinderGeometry(0.28, 0.34, pillarH, 10);
      const plinthGeo = new THREE.BoxGeometry(1.2, 1.4, 1.2);
      for (const px of [-4.2, 4.2]) {
        const plinth = new THREE.Mesh(plinthGeo, strutMat);
        plinth.position.set(px, 0.4, 0);
        boardGroup.add(plinth);

        const pillar = new THREE.Mesh(pillarGeo, frameMat);
        pillar.position.set(px, pillarH / 2, 0);
        pillar.castShadow = true;
        boardGroup.add(pillar);

        // Rear diagonal wind-bracing strut
        const brace = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.16, 6.5, 8),
          strutMat
        );
        brace.position.set(px, 3.0, -1.6);
        brace.rotation.x = 0.46;
        boardGroup.add(brace);
      }

      // Main Widescreen LCD Cabinet Housing (centered at y = 7.2m)
      const centerY = 7.2;
      const cabinet = new THREE.Mesh(
        new THREE.BoxGeometry(screenW + 0.9, screenH + 0.8, 0.68),
        frameMat
      );
      cabinet.position.set(0, centerY, 0);
      cabinet.castShadow = true;
      boardGroup.add(cabinet);

      // Glowing Top & Bottom LED Bezel Strips
      const topStrip = new THREE.Mesh(
        new THREE.BoxGeometry(screenW + 0.96, 0.16, 0.74),
        amberTrimMat
      );
      topStrip.position.set(0, centerY + screenH / 2 + 0.35, 0);
      boardGroup.add(topStrip);

      const botStrip = new THREE.Mesh(
        new THREE.BoxGeometry(screenW + 0.96, 0.16, 0.74),
        neonTrimMat
      );
      botStrip.position.set(0, centerY - screenH / 2 - 0.35, 0);
      boardGroup.add(botStrip);

      // Front and back animated LCD display panels (+Z faces oncoming traffic)
      const frontScreen = new THREE.Mesh(
        new THREE.PlaneGeometry(screenW, screenH),
        screenMat
      );
      frontScreen.position.set(0, centerY, 0.36);
      boardGroup.add(frontScreen);

      const backScreen = new THREE.Mesh(
        new THREE.PlaneGeometry(screenW, screenH),
        screenMat
      );
      backScreen.position.set(0, centerY, -0.36);
      backScreen.rotation.y = Math.PI;
      boardGroup.add(backScreen);

      // Top Maintenance Floodlight Hoods
      for (const lx of [-4.4, 0, 4.4]) {
        const arm = new THREE.Mesh(
          new THREE.BoxGeometry(0.14, 0.14, 1.1),
          strutMat
        );
        arm.position.set(lx, centerY + screenH / 2 + 0.55, 0.45);
        boardGroup.add(arm);

        const lamp = new THREE.Mesh(
          new THREE.BoxGeometry(0.65, 0.12, 0.32),
          neonTrimMat
        );
        lamp.position.set(lx, centerY + screenH / 2 + 0.50, 0.92);
        boardGroup.add(lamp);
      }

      this.envGroup.add(boardGroup);
    }
  }

  /**
   * Builds distant sweeping skyline searchlights and gliding aerial light pods
   * in the distant background around the city.
   */
  private buildDistantMovingCityLights(road: RoadSystem, _maxAnisotropy: number): void {
    // 1. Sweeping Distant Skyline Searchlight Beams
    const beamConeGeo = new THREE.ConeGeometry(14, 135, 12, 1, true);
    beamConeGeo.translate(0, 67.5, 0);
    const cyanBeamMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const amberBeamMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    for (let i = 0; i < 12; i++) {
      const s = ((i * 200 + 65) % CIRCUIT_LENGTH);
      const sample = road.getSampleAtS(s);
      const side = i % 3 === 0 ? -1 : 1;
      const actualSide = s < 350 ? -1 : side;
      const pos = sample.position
        .clone()
        .addScaledVector(sample.right, actualSide * (95 + (i % 3) * 35));

      if (!this.isFootprintClearOfRoad(road, pos.x, pos.z, 12, 14)) {
        continue;
      }

      const beamMesh = new THREE.Mesh(
        beamConeGeo,
        i % 2 === 0 ? cyanBeamMat : amberBeamMat
      );
      beamMesh.name = 'DistantSkySearchlight';
      beamMesh.position.set(pos.x, Math.max(0, sample.position.y) + 8, pos.z);
      const baseRotZ = (i % 2 === 0 ? 1 : -1) * 0.22;
      const baseRotX = (i % 3 === 0 ? 1 : -1) * 0.16;
      beamMesh.rotation.set(baseRotX, i * 0.5, baseRotZ);

      this.envGroup.add(beamMesh);
      this.distantSkyBeams.push({
        mesh: beamMesh,
        baseRotZ,
        baseRotX,
        speed: 0.85 + (i % 4) * 0.28,
        phase: i * 1.1,
      });
    }

    // 3. Gliding Distant Aerial Light Cruisers / Sky-Pod Light Trails
    const podHeadMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const podCyanTrailMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.85,
    });
    const podAmberTrailMat = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.85,
    });

    for (let i = 0; i < 14; i++) {
      const podGroup = new THREE.Group();
      podGroup.name = 'DistantMovingLightPod';

      const core = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 5.5), podHeadMat);
      podGroup.add(core);

      const trail = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.65, 16.0),
        i % 2 === 0 ? podCyanTrailMat : podAmberTrailMat
      );
      trail.position.set(0, 0, -10.5);
      podGroup.add(trail);

      const centerX = -180 + ((i * 97) % 240) - 120;
      const centerZ = -60 + ((i * 131) % 240) - 120;
      const radius = 165 + (i % 5) * 48;
      const baseY = 44 + (i % 4) * 14;
      const angle = (i / 14) * Math.PI * 2;
      const speed = (i % 2 === 0 ? 1 : -1) * (0.14 + (i % 3) * 0.05);

      podGroup.position.set(
        centerX + Math.cos(angle) * radius,
        baseY,
        centerZ + Math.sin(angle) * radius
      );
      this.envGroup.add(podGroup);

      this.distantLightPods.push({
        mesh: podGroup,
        centerX,
        centerZ,
        radius,
        baseY,
        speed,
        angle,
      });
    }
  }

  private buildHorizonMountains(maxAnisotropy: number): void {
    const mCanvas = document.createElement('canvas');
    mCanvas.width = 256;
    mCanvas.height = 256;
    const mCtx = mCanvas.getContext('2d')!;
    mCtx.fillStyle = '#537694';
    mCtx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4000; i++) {
      const x = (i * 53) % 256;
      const y = (i * 97) % 256;
      mCtx.fillStyle = i % 2 === 0 ? '#698ba8' : '#3f5f7a';
      mCtx.fillRect(x, y, 5, 3);
    }
    const mTex = new THREE.CanvasTexture(mCanvas);
    mTex.colorSpace = THREE.SRGBColorSpace;
    mTex.anisotropy = maxAnisotropy;

    const mountainMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: mTex,
      roughness: 0.9,
      metalness: 0.04,
      flatShading: true,
    });

    const peakCount = 48;
    const radius = 1280;

    for (let i = 0; i < peakCount; i++) {
      const angle = (i / peakCount) * Math.PI * 2;
      const h = 120 + ((i * 53) % 135);
      const r = 105 + ((i * 29) % 80);
      const coneGeo = new THREE.ConeGeometry(r, h, 5);
      coneGeo.translate(0, h / 2 - 8, 0);
      const mesh = new THREE.Mesh(coneGeo, mountainMat);
      mesh.position.set(
        -320 + Math.cos(angle) * radius,
        0,
        -60 + Math.sin(angle) * radius
      );
      mesh.rotation.y = angle * 2.1;
      this.envGroup.add(mesh);
    }
  }

  public update(dt: number): void {
    if (this.waterNormalTex) {
      this.waterNormalTex.offset.x = (this.waterNormalTex.offset.x + dt * 0.08) % 1;
      this.waterNormalTex.offset.y = (this.waterNormalTex.offset.y + dt * 0.05) % 1;
    }

    // Update animated roadside LCD billboards at ~20 FPS
    this.lcdAnimTime += dt;
    this.lcdFrameAccum += dt;
    if (this.lcdFrameAccum >= 0.05) {
      this.lcdFrameAccum = 0;
      this.drawRoadsideLcdFrame(this.lcdAnimTime);
    }

    // Smoothly animate sweeping distant skyline searchlight beams
    for (const beam of this.distantSkyBeams) {
      beam.mesh.rotation.z =
        beam.baseRotZ + Math.sin(this.lcdAnimTime * beam.speed + beam.phase) * 0.34;
      beam.mesh.rotation.x =
        beam.baseRotX + Math.cos(this.lcdAnimTime * (beam.speed * 0.75) + beam.phase) * 0.22;
    }

    // Smoothly glide distant background aerial city light pods along their skyway arcs
    for (const pod of this.distantLightPods) {
      pod.angle += pod.speed * dt;
      const nx = pod.centerX + Math.cos(pod.angle) * pod.radius;
      const nz = pod.centerZ + Math.sin(pod.angle) * pod.radius;
      const ny = pod.baseY + Math.sin(this.lcdAnimTime * 1.6 + pod.angle) * 2.5;
      const tangentX = -Math.sin(pod.angle) * Math.sign(pod.speed);
      const tangentZ = Math.cos(pod.angle) * Math.sign(pod.speed);
      pod.mesh.position.set(nx, ny, nz);
      pod.mesh.lookAt(nx + tangentX * 10, ny, nz + tangentZ * 10);
    }
  }
}
