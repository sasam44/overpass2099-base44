import * as THREE from 'three';

export type CivilianVehicleType = 'sedan' | 'van' | 'shuttle';

export interface SportsCarBuildOptions {
  colorHex: number;
  accentHex?: number;
  plateText?: string;
  raceNumber?: string;
  markerLabel?: string;
  isPlayer?: boolean;
}

export interface BuiltSportsCar {
  root: THREE.Group;
  bodyTiltGroup: THREE.Group;
  wheels: THREE.Object3D[];
  frontWheelPivots: THREE.Object3D[];
  brakeLightMaterial: THREE.MeshStandardMaterial;
  headLightMaterial: THREE.MeshStandardMaterial;
  nitroFlameGroup: THREE.Group;
  bodyPaintMaterial: THREE.MeshPhysicalMaterial;
  overheadMarker: THREE.Sprite;
  setRaceNumber: (raceNumber: string, accentHex?: number, markerLabel?: string) => void;
}

function hexToCss(hex: number): string {
  return '#' + hex.toString(16).padStart(6, '0');
}

function createLicensePlateTexture(plateText: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 256, 64);

  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(0, 0, 256, 4);
  ctx.fillRect(0, 60, 256, 4);

  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(0, 0, 32, 64);
  ctx.fillStyle = '#facc15';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('★', 16, 22);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('F', 16, 48);

  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(226, 0, 30, 64);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('69', 241, 48);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 31px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(plateText, 129, 34);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSVJBadgeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#090b10';
  ctx.fillRect(0, 0, 160, 64);

  // Italian tricolore subtle micro-stripe under badge
  ctx.fillStyle = '#10b981';
  ctx.fillRect(26, 52, 36, 4);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(62, 52, 36, 4);
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(98, 52, 36, 4);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'italic 900 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SVJ', 62, 28);

  ctx.fillStyle = '#f59e0b';
  ctx.font = 'italic 900 22px sans-serif';
  ctx.fillText('V12', 120, 29);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Renders a motorsport racing number plate decal for the car doors, front wedge hood, and rear fascia.
 */
function createRaceNumberDecalTexture(
  raceNumber: string,
  accentHex: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  const accentCss = hexToCss(accentHex);

  // Angled hexagonal motorsport shield background
  ctx.clearRect(0, 0, 256, 192);
  ctx.beginPath();
  ctx.moveTo(26, 12);
  ctx.lineTo(238, 12);
  ctx.lineTo(246, 44);
  ctx.lineTo(228, 180);
  ctx.lineTo(18, 180);
  ctx.lineTo(10, 148);
  ctx.closePath();
  ctx.fillStyle = '#0b0f19';
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = accentCss;
  ctx.stroke();

  // Top header bar ("NEO VANTIS GT")
  ctx.fillStyle = accentCss;
  ctx.fillRect(24, 16, 208, 28);
  ctx.fillStyle = '#090d16';
  ctx.font = '900 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NEO VANTIS CORSA', 128, 30);

  // Inner white/silver contrast number box
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(26, 48, 204, 120);

  // Diagonal racing speed slash
  ctx.fillStyle = accentCss;
  ctx.beginPath();
  ctx.moveTo(182, 48);
  ctx.lineTo(230, 48);
  ctx.lineTo(196, 168);
  ctx.lineTo(148, 168);
  ctx.closePath();
  ctx.globalAlpha = 0.22;
  ctx.fill();
  ctx.globalAlpha = 1.0;

  // Bold Italic Motorsport Number
  ctx.fillStyle = '#090d16';
  ctx.font = 'italic 900 98px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(raceNumber, 124, 112);

  // Subtle accent outline
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = accentCss;
  ctx.strokeText(raceNumber, 124, 112);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Renders the compact floating overhead marker above each car during active street racing.
 */
function createOverheadMarkerTexture(
  markerLabel: string,
  raceNumber: string,
  accentHex: number,
  isPlayer: boolean
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 112;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 256, 112);
  const borderCol = isPlayer ? '#facc15' : hexToCss(accentHex);

  // Compact top telemetry pill
  ctx.beginPath();
  ctx.roundRect(22, 8, 212, 54, 10);
  ctx.fillStyle = isPlayer ? 'rgba(9, 14, 26, 0.92)' : 'rgba(11, 17, 30, 0.86)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = borderCol;
  ctx.stroke();

  // Number badge block on the left
  ctx.beginPath();
  ctx.roundRect(28, 14, 62, 42, 6);
  ctx.fillStyle = borderCol;
  ctx.fill();

  ctx.fillStyle = '#090d16';
  ctx.font = 'italic 900 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`#${raceNumber}`, 59, 36);

  // Driver / Player label on the right
  ctx.fillStyle = '#ffffff';
  ctx.font = 'italic 900 23px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(markerLabel, 160, 36);

  // Crisp downward chevron arrow pointing to the car roof
  ctx.beginPath();
  ctx.moveTo(106, 68);
  ctx.lineTo(150, 68);
  ctx.lineTo(128, 102);
  ctx.closePath();
  ctx.fillStyle = borderCol;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#090d16';
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Builds a Lamborghini Aventador SVJ / Revuelto / Huracán GT3 style wedge supercar
 * with body racing numbers on the doors, front nose, and rear fascia, plus an overhead race marker.
 */
export function buildSportsCarModel(
  options: SportsCarBuildOptions
): BuiltSportsCar {
  const primaryHex = options.colorHex;
  const accentHex = options.accentHex ?? 0xf59e0b;
  const isPlayer = options.isPlayer ?? false;
  const plateText = options.plateText ?? 'GEAR.CLUB';
  const raceNumber = options.raceNumber ?? (isPlayer ? '01' : '02');
  const markerLabel = options.markerLabel ?? (isPlayer ? 'YOU' : 'RIVAL');

  const root = new THREE.Group();
  const bodyTiltGroup = new THREE.Group();
  root.add(bodyTiltGroup);

  // Automotive metallic paint with high-gloss clearcoat
  const bodyPaintMaterial = new THREE.MeshPhysicalMaterial({
    color: primaryHex,
    roughness: 0.20,
    metalness: 0.68,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  });

  const carbonMat = new THREE.MeshStandardMaterial({
    color: 0x13161f,
    roughness: 0.36,
    metalness: 0.48,
  });

  const satinBlackMat = new THREE.MeshStandardMaterial({
    color: 0x0a0d13,
    roughness: 0.44,
    metalness: 0.35,
  });

  const accentTrimMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    roughness: 0.28,
    metalness: 0.72,
  });

  const interiorMat = new THREE.MeshStandardMaterial({
    color: 0x181c24,
    roughness: 0.75,
    metalness: 0.12,
  });

  const seatInsertMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    roughness: 0.48,
    metalness: 0.2,
  });

  // Lamborghini tinted cockpit canopy glass
  const windowGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x7dd3fc,
    roughness: 0.05,
    metalness: 0.18,
    clearcoat: 1.0,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
  });

  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.12,
    metalness: 0.96,
  });

  const caliperMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    roughness: 0.32,
    metalness: 0.45,
  });

  const brakeLightMaterial = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xdc2626,
    emissiveIntensity: 1.55,
    roughness: 0.14,
  });

  const headLightMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xe0f2fe,
    emissiveIntensity: 2.35,
    roughness: 0.1,
  });

  // =========================================================================
  // 1. LAMBORGHINI WEDGE MONOCOQUE FUSELAGE (Sharp Pointed Nose -> Low Canopy -> Mid-Engine Deck)
  // =========================================================================
  const wedgeProfile = new THREE.Shape();
  wedgeProfile.moveTo(-2.26, 0.18); // Ultra-low sharp front splitter tip
  wedgeProfile.lineTo(-2.30, 0.34); // Pointed Lamborghini shark/wedge nose apex
  wedgeProfile.lineTo(-1.38, 0.56); // Steeply raked front frunk hood
  wedgeProfile.lineTo(-0.34, 0.96); // Continuous seamless windshield rake up to low canopy peak
  wedgeProfile.lineTo(0.24, 0.97);  // Low hexagonal cockpit roof crown
  wedgeProfile.lineTo(0.36, 0.84);  // Recessed step for mid-engine V12 carbon louver bay
  wedgeProfile.lineTo(1.62, 0.64);  // Sloping mid-engine V12 rear bay floor
  wedgeProfile.lineTo(2.08, 0.62);  // Aggressive rear aero deck
  wedgeProfile.lineTo(2.12, 0.34);  // Rear fascia cutout
  wedgeProfile.lineTo(1.96, 0.19);  // Rear Venturi diffuser base
  wedgeProfile.lineTo(-2.12, 0.18); // Flat carbon underbody floor
  wedgeProfile.closePath();

  const mainBodyGeo = new THREE.ExtrudeGeometry(wedgeProfile, {
    depth: 1.68,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 4,
    curveSegments: 10,
  });
  mainBodyGeo.rotateY(-Math.PI / 2);
  mainBodyGeo.translate(0.84, 0, 0);
  mainBodyGeo.computeVertexNormals();

  const mainBodyMesh = new THREE.Mesh(mainBodyGeo, bodyPaintMaterial);
  mainBodyMesh.castShadow = true;
  mainBodyMesh.receiveShadow = true;
  bodyTiltGroup.add(mainBodyMesh);

  // =========================================================================
  // 2. SCULPTED WIDE SUPERCAR FENDERS, ANGULAR SIDE NACA INTAKES & CARBON SKIRTS
  // =========================================================================
  const rearHaunchProfile = new THREE.Shape();
  rearHaunchProfile.moveTo(-0.08, 0.24);
  rearHaunchProfile.lineTo(0.26, 0.68);
  rearHaunchProfile.lineTo(1.36, 0.74);
  rearHaunchProfile.lineTo(2.06, 0.63);
  rearHaunchProfile.lineTo(2.04, 0.30);
  rearHaunchProfile.lineTo(-0.08, 0.24);
  rearHaunchProfile.closePath();

  const rearHaunchGeo = new THREE.ExtrudeGeometry(rearHaunchProfile, {
    depth: 0.18,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 3,
  });
  rearHaunchGeo.rotateY(-Math.PI / 2);
  rearHaunchGeo.computeVertexNormals();

  const frontFenderProfile = new THREE.Shape();
  frontFenderProfile.moveTo(-2.18, 0.22);
  frontFenderProfile.lineTo(-1.92, 0.54);
  frontFenderProfile.lineTo(-1.02, 0.62);
  frontFenderProfile.lineTo(-0.56, 0.54);
  frontFenderProfile.lineTo(-0.56, 0.22);
  frontFenderProfile.closePath();

  const frontFenderGeo = new THREE.ExtrudeGeometry(frontFenderProfile, {
    depth: 0.15,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.035,
    bevelSegments: 3,
  });
  frontFenderGeo.rotateY(-Math.PI / 2);
  frontFenderGeo.computeVertexNormals();

  for (const side of [-1, 1]) {
    // Wide Rear Supercar Haunch (2.06m total rear track width)
    const rearHaunch = new THREE.Mesh(rearHaunchGeo, bodyPaintMaterial);
    rearHaunch.position.set(side > 0 ? 1.02 : -0.84, 0, 0);
    rearHaunch.castShadow = true;
    bodyTiltGroup.add(rearHaunch);

    // Sculpted Angular Front Fender Arch
    const frontFender = new THREE.Mesh(frontFenderGeo, bodyPaintMaterial);
    frontFender.position.set(side > 0 ? 0.98 : -0.83, 0, 0);
    frontFender.castShadow = true;
    bodyTiltGroup.add(frontFender);

    // Sculpted Door Panel connecting front fender to rear intake
    const doorPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.36, 1.05),
      bodyPaintMaterial
    );
    doorPanel.position.set(side * 0.90, 0.42, -0.25);
    doorPanel.castShadow = true;
    bodyTiltGroup.add(doorPanel);

    // Deep Lamborghini Side NACA / Hexagonal Radiator Air Intake Scoop behind Door
    const sideIntakeCavity = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.34, 0.58),
      satinBlackMat
    );
    sideIntakeCavity.position.set(side * 0.94, 0.46, 0.32);
    sideIntakeCavity.rotation.y = side * 0.14;
    bodyTiltGroup.add(sideIntakeCavity);

    // Diagonal Carbon Intake Strake Fin
    const intakeBlade = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.03, 0.62),
      accentTrimMat
    );
    intakeBlade.position.set(side * 0.97, 0.47, 0.32);
    intakeBlade.rotation.x = 0.25;
    bodyTiltGroup.add(intakeBlade);

    // Flying Buttress C-Pillar Fin (Lamborghini Revuelto / Centenario aero buttress)
    const buttress = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.12, 1.32),
      bodyPaintMaterial
    );
    buttress.position.set(side * 0.64, 0.88, 0.94);
    buttress.rotation.x = -0.19;
    buttress.rotation.z = -side * 0.14;
    buttress.castShadow = true;
    bodyTiltGroup.add(buttress);

    // Accent aero trim line along the flying buttress edge
    const buttressTrim = new THREE.Mesh(
      new THREE.BoxGeometry(0.025, 0.025, 1.28),
      accentTrimMat
    );
    buttressTrim.position.set(side * 0.58, 0.93, 0.94);
    buttressTrim.rotation.x = -0.19;
    bodyTiltGroup.add(buttressTrim);

    // Wide Carbon Side Splitters / Skirts with Accent Aero Fin
    const skirt = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.06, 2.52),
      carbonMat
    );
    skirt.position.set(side * 0.98, 0.19, -0.02);
    bodyTiltGroup.add(skirt);

    const skirtAccent = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.02, 2.48),
      accentTrimMat
    );
    skirtAccent.position.set(side * 0.99, 0.16, -0.02);
    bodyTiltGroup.add(skirtAccent);
  }

  // =========================================================================
  // 3. MID-ENGINE CARBON SLATTED LOUVERS & V12 ENGINE BAY SPINE
  // =========================================================================
  const engineBayRecess = new THREE.Mesh(
    new THREE.BoxGeometry(1.04, 0.05, 1.32),
    satinBlackMat
  );
  engineBayRecess.position.set(0, 0.84, 0.98);
  engineBayRecess.rotation.x = -0.17;
  bodyTiltGroup.add(engineBayRecess);

  // Visible Gold/Accent V12 Engine Manifold Cross-Brace under Louvers
  const v12BraceA = new THREE.Mesh(
    new THREE.BoxGeometry(0.84, 0.03, 0.045),
    accentTrimMat
  );
  v12BraceA.position.set(0, 0.88, 0.92);
  v12BraceA.rotation.y = 0.55;
  v12BraceA.rotation.x = -0.17;
  bodyTiltGroup.add(v12BraceA);

  const v12BraceB = new THREE.Mesh(
    new THREE.BoxGeometry(0.84, 0.03, 0.045),
    accentTrimMat
  );
  v12BraceB.position.set(0, 0.88, 0.92);
  v12BraceB.rotation.y = -0.55;
  v12BraceB.rotation.x = -0.17;
  bodyTiltGroup.add(v12BraceB);

  // 4 Stepped Lamborghini Aventador SVJ Slatted Carbon Engine Louvers
  for (let l = 0; l < 4; l++) {
    const lz = 0.50 + l * 0.29;
    const ly = 0.96 - l * 0.052;
    const louverWidth = 0.96 - l * 0.05;
    const louver = new THREE.Mesh(
      new THREE.BoxGeometry(louverWidth, 0.032, 0.19),
      carbonMat
    );
    louver.position.set(0, ly, lz);
    louver.rotation.x = -0.08;
    bodyTiltGroup.add(louver);
  }

  // Center Carbon Shark-Fin Aero Spine over the V12 Engine Deck
  const centerSpine = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 0.12, 1.22),
    carbonMat
  );
  centerSpine.position.set(0, 0.94, 1.02);
  centerSpine.rotation.x = -0.17;
  bodyTiltGroup.add(centerSpine);

  // =========================================================================
  // 4. JET-FIGHTER HEXAGONAL COCKPIT CANOPY & INTERIOR BUCKET SEATS
  // =========================================================================
  const frontWindshield = new THREE.Mesh(
    new THREE.BoxGeometry(1.24, 0.02, 1.12),
    windowGlassMat
  );
  frontWindshield.position.set(0, 0.79, -0.82);
  frontWindshield.rotation.x = -0.39;
  frontWindshield.renderOrder = 2;
  bodyTiltGroup.add(frontWindshield);

  // Side Cockpit Windows
  for (const side of [-1, 1]) {
    const sideGlass = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.25, 0.98),
      windowGlassMat
    );
    sideGlass.position.set(side * 0.72, 0.79, -0.14);
    sideGlass.rotation.z = -side * 0.24;
    sideGlass.renderOrder = 2;
    bodyTiltGroup.add(sideGlass);
  }

  // Cockpit Dashboard & Steering Yoke
  const dashMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.18, 0.20, 0.44),
    interiorMat
  );
  dashMesh.position.set(0, 0.68, -0.56);
  bodyTiltGroup.add(dashMesh);

  for (const sx of [-0.30, 0.30]) {
    const seatBack = new THREE.Mesh(
      new THREE.BoxGeometry(0.30, 0.32, 0.10),
      interiorMat
    );
    seatBack.position.set(sx, 0.71, 0.12);
    seatBack.rotation.x = -0.22;
    bodyTiltGroup.add(seatBack);

    const shoulderInsert = new THREE.Mesh(
      new THREE.BoxGeometry(0.20, 0.07, 0.11),
      seatInsertMat
    );
    shoulderInsert.position.set(sx, 0.80, 0.13);
    shoulderInsert.rotation.x = -0.22;
    bodyTiltGroup.add(shoulderInsert);
  }

  // Angular Lamborghini Wing Mirrors on Door Shoulders
  for (const side of [-1, 1]) {
    const mirrorStem = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.03, 0.06),
      carbonMat
    );
    mirrorStem.position.set(side * 0.86, 0.68, -0.54);
    mirrorStem.rotation.z = side * 0.18;
    bodyTiltGroup.add(mirrorStem);

    const mirrorHousing = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.065, 0.12),
      bodyPaintMaterial
    );
    mirrorHousing.position.set(side * 0.96, 0.71, -0.52);
    mirrorHousing.rotation.y = -side * 0.22;
    bodyTiltGroup.add(mirrorHousing);
  }

  // =========================================================================
  // 5. LAMBORGHINI SVJ ALA-MOBILE CARBON REAR WING & SWAN-NECK PYLONS
  // =========================================================================
  const pylonGeo = new THREE.BoxGeometry(0.045, 0.32, 0.24);
  for (const side of [-1, 1]) {
    const pylon = new THREE.Mesh(pylonGeo, carbonMat);
    pylon.position.set(side * 0.44, 0.82, 1.92);
    pylon.rotation.x = 0.24;
    bodyTiltGroup.add(pylon);
  }

  const svjWingMain = new THREE.Mesh(
    new THREE.BoxGeometry(1.94, 0.038, 0.30),
    carbonMat
  );
  svjWingMain.position.set(0, 0.98, 2.02);
  svjWingMain.rotation.x = 0.14;
  svjWingMain.castShadow = true;
  bodyTiltGroup.add(svjWingMain);

  const svjWingLeadingEdge = new THREE.Mesh(
    new THREE.BoxGeometry(1.92, 0.024, 0.08),
    accentTrimMat
  );
  svjWingLeadingEdge.position.set(0, 1.00, 2.14);
  svjWingLeadingEdge.rotation.x = 0.20;
  bodyTiltGroup.add(svjWingLeadingEdge);

  const endplateGeo = new THREE.BoxGeometry(0.035, 0.24, 0.44);
  for (const side of [-1, 1]) {
    const endplate = new THREE.Mesh(endplateGeo, bodyPaintMaterial);
    endplate.position.set(side * 0.97, 0.95, 2.02);
    endplate.rotation.x = 0.10;
    bodyTiltGroup.add(endplate);
  }

  // =========================================================================
  // 6. LAMBORGHINI Y-MOTIF LED TAILLIGHTS, HIGH-MOUNTED HEX EXHAUSTS & 6-FIN DIFFUSER
  // =========================================================================
  const rearFasciaMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.92, 0.26, 0.12),
    satinBlackMat
  );
  rearFasciaMesh.position.set(0, 0.52, 2.12);
  bodyTiltGroup.add(rearFasciaMesh);

  // Iconic Lamborghini Y-Shaped LED Taillight Blades on Left & Right
  for (const side of [-1, 1]) {
    const mainBar = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.042, 0.06),
      brakeLightMaterial
    );
    mainBar.position.set(side * 0.64, 0.58, 2.17);
    mainBar.rotation.z = -side * 0.06;
    bodyTiltGroup.add(mainBar);

    // Upper & Lower Y-Chevron Forks
    for (let k = 0; k < 2; k++) {
      const cx = side * (0.48 + k * 0.18);
      const upperFork = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.032, 0.065),
        brakeLightMaterial
      );
      upperFork.position.set(cx, 0.61, 2.175);
      upperFork.rotation.z = side * 0.42;
      bodyTiltGroup.add(upperFork);

      const lowerFork = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.032, 0.065),
        brakeLightMaterial
      );
      lowerFork.position.set(cx, 0.54, 2.175);
      lowerFork.rotation.z = -side * 0.42;
      bodyTiltGroup.add(lowerFork);
    }
  }

  // Center SVJ V12 Emblem
  const svjBadgeMat = new THREE.MeshStandardMaterial({
    map: createSVJBadgeTexture(),
    roughness: 0.28,
    metalness: 0.6,
  });
  const svjBadgeMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.34, 0.13),
    svjBadgeMat
  );
  svjBadgeMesh.position.set(0, 0.58, 2.185);
  bodyTiltGroup.add(svjBadgeMesh);

  // High-Mounted Lamborghini SVJ / Revuelto Dual Hexagonal Exhaust Pipes (Mounted high at y=0.45m!)
  const nitroFlameGroup = new THREE.Group();
  nitroFlameGroup.visible = false;
  bodyTiltGroup.add(nitroFlameGroup);

  const hexPipeOuterGeo = new THREE.CylinderGeometry(0.078, 0.078, 0.24, 6);
  hexPipeOuterGeo.rotateX(Math.PI / 2);
  const hexPipeInnerGeo = new THREE.CylinderGeometry(0.060, 0.060, 0.25, 6);
  hexPipeInnerGeo.rotateX(Math.PI / 2);

  const flameGeo = new THREE.ConeGeometry(0.085, 0.78, 12);
  flameGeo.rotateX(Math.PI / 2);
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.92,
  });

  for (const ex of [-0.19, 0.19]) {
    const pipeOuter = new THREE.Mesh(hexPipeOuterGeo, chromeMat);
    pipeOuter.position.set(ex, 0.45, 2.17);
    bodyTiltGroup.add(pipeOuter);

    const pipeInner = new THREE.Mesh(hexPipeInnerGeo, satinBlackMat);
    pipeInner.position.set(ex, 0.45, 2.175);
    bodyTiltGroup.add(pipeInner);

    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(ex, 0.45, 2.58);
    nitroFlameGroup.add(flame);
  }

  // EU License Plate in Lower Center Fascia
  const plateMat = new THREE.MeshStandardMaterial({
    map: createLicensePlateTexture(plateText),
    roughness: 0.35,
    metalness: 0.1,
  });
  const plateMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.50, 0.12), plateMat);
  plateMesh.position.set(-0.42, 0.36, 2.19);
  bodyTiltGroup.add(plateMesh);

  // Aggressive 6-Strake Carbon GT3 Rear Venturi Diffuser
  const diffuserMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.94, 0.16, 0.26),
    carbonMat
  );
  diffuserMesh.position.set(0, 0.22, 2.08);
  bodyTiltGroup.add(diffuserMesh);

  const diffuserAccentStrip = new THREE.Mesh(
    new THREE.BoxGeometry(1.92, 0.022, 0.05),
    accentTrimMat
  );
  diffuserAccentStrip.position.set(0, 0.30, 2.19);
  bodyTiltGroup.add(diffuserAccentStrip);

  for (const fx of [-0.82, -0.52, -0.22, 0.22, 0.52, 0.82]) {
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(0.028, 0.16, 0.28),
      carbonMat
    );
    fin.position.set(fx, 0.20, 2.11);
    bodyTiltGroup.add(fin);
  }

  // =========================================================================
  // 7. LAMBORGHINI WEDGE FRONT SPLITTER, HEX INTAKES & Y-SHAPED LED HEADLIGHTS
  // =========================================================================
  const frontSplitter = new THREE.Mesh(
    new THREE.BoxGeometry(1.94, 0.045, 0.34),
    carbonMat
  );
  frontSplitter.position.set(0, 0.17, -2.20);
  bodyTiltGroup.add(frontSplitter);

  const splitterLip = new THREE.Mesh(
    new THREE.BoxGeometry(1.96, 0.018, 0.06),
    accentTrimMat
  );
  splitterLip.position.set(0, 0.155, -2.35);
  bodyTiltGroup.add(splitterLip);

  // Twin Hexagonal Front Bumper Air Intakes
  for (const side of [-1, 1]) {
    const frontIntake = new THREE.Mesh(
      new THREE.BoxGeometry(0.54, 0.14, 0.08),
      satinBlackMat
    );
    frontIntake.position.set(side * 0.56, 0.27, -2.28);
    frontIntake.rotation.y = -side * 0.12;
    bodyTiltGroup.add(frontIntake);

    // Y-Motif LED Daytime Running Headlight Blades
    const headMain = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.035, 0.18),
      headLightMaterial
    );
    headMain.position.set(side * 0.68, 0.42, -2.08);
    headMain.rotation.y = side * 0.22;
    headMain.rotation.x = 0.16;
    bodyTiltGroup.add(headMain);

    const headFork = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.032, 0.12),
      headLightMaterial
    );
    headFork.position.set(side * 0.58, 0.43, -2.14);
    headFork.rotation.y = -side * 0.38;
    bodyTiltGroup.add(headFork);
  }

  // =========================================================================
  // 8. RACING NUMBERS ON CAR BODY (Doors, Front Wedge Hood & Rear Fascia!)
  // =========================================================================
  const numberDecalMat = new THREE.MeshStandardMaterial({
    map: createRaceNumberDecalTexture(raceNumber, accentHex),
    roughness: 0.25,
    metalness: 0.2,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });

  // Left Door Racing Number Plate
  const leftDoorNumber = new THREE.Mesh(
    new THREE.PlaneGeometry(0.56, 0.30),
    numberDecalMat
  );
  leftDoorNumber.position.set(-0.985, 0.43, -0.24);
  leftDoorNumber.rotation.y = -Math.PI / 2;
  bodyTiltGroup.add(leftDoorNumber);

  // Right Door Racing Number Plate
  const rightDoorNumber = new THREE.Mesh(
    new THREE.PlaneGeometry(0.56, 0.30),
    numberDecalMat
  );
  rightDoorNumber.position.set(0.985, 0.43, -0.24);
  rightDoorNumber.rotation.y = Math.PI / 2;
  bodyTiltGroup.add(rightDoorNumber);

  // Front Wedge Hood Racing Number Plate (visible from front & showcase camera)
  const hoodNumber = new THREE.Mesh(
    new THREE.PlaneGeometry(0.50, 0.38),
    numberDecalMat
  );
  hoodNumber.position.set(0, 0.51, -1.62);
  hoodNumber.rotation.x = -Math.PI / 2 + 0.23;
  bodyTiltGroup.add(hoodNumber);

  // Rear Fascia Racing Number Plate (visible directly from third-person chase camera!)
  const rearNumber = new THREE.Mesh(
    new THREE.PlaneGeometry(0.28, 0.20),
    numberDecalMat
  );
  rearNumber.position.set(0.56, 0.38, 2.19);
  bodyTiltGroup.add(rearNumber);

  // Left & Right Rear Wing Endplate Numbers
  for (const side of [-1, 1]) {
    const wingNumber = new THREE.Mesh(
      new THREE.PlaneGeometry(0.32, 0.20),
      numberDecalMat
    );
    wingNumber.position.set(side * 0.995, 0.95, 2.02);
    wingNumber.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    bodyTiltGroup.add(wingNumber);
  }

  // =========================================================================
  // 9. SMALL OVERHEAD RACE MARKER ABOVE THE CAR (Active during race!)
  // =========================================================================
  const markerSpriteMat = new THREE.SpriteMaterial({
    map: createOverheadMarkerTexture(markerLabel, raceNumber, accentHex, isPlayer),
    transparent: true,
    depthTest: true,
    depthWrite: false,
  });
  const overheadMarker = new THREE.Sprite(markerSpriteMat);
  overheadMarker.position.set(0, isPlayer ? 1.56 : 1.68, 0.15);
  overheadMarker.scale.set(isPlayer ? 1.32 : 1.55, isPlayer ? 0.58 : 0.68, 1);
  overheadMarker.visible = false; // Enabled automatically when race starts on the road
  root.add(overheadMarker);

  // Helper to update car racing number & overhead marker when switching cars in showroom
  const setRaceNumber = (
    newRaceNumber: string,
    newAccentHex = accentHex,
    newMarkerLabel = markerLabel
  ) => {
    accentTrimMat.color.setHex(newAccentHex);
    seatInsertMat.color.setHex(newAccentHex);
    caliperMat.color.setHex(newAccentHex);

    const nextDecalTex = createRaceNumberDecalTexture(newRaceNumber, newAccentHex);
    numberDecalMat.map?.dispose();
    numberDecalMat.map = nextDecalTex;
    numberDecalMat.needsUpdate = true;

    const nextMarkerTex = createOverheadMarkerTexture(
      newMarkerLabel,
      newRaceNumber,
      newAccentHex,
      isPlayer
    );
    markerSpriteMat.map?.dispose();
    markerSpriteMat.map = nextMarkerTex;
    markerSpriteMat.needsUpdate = true;
  };

  // =========================================================================
  // 10. FORGED CENTER-LOCK SUPERCAR WHEELS WITH CARBON-CERAMIC BRAKES
  // =========================================================================
  const wheels: THREE.Object3D[] = [];
  const frontWheelPivots: THREE.Object3D[] = [];

  const wellGeo = new THREE.CylinderGeometry(0.39, 0.39, 0.34, 18);
  wellGeo.rotateZ(Math.PI / 2);

  const tireGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.30, 24);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x111319,
    roughness: 0.85,
    metalness: 0.08,
  });

  const rimBarrelGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.31, 20);
  rimBarrelGeo.rotateZ(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x1e232d,
    roughness: 0.22,
    metalness: 0.9,
  });

  const brakeDiscGeo = new THREE.CylinderGeometry(0.20, 0.20, 0.04, 16);
  brakeDiscGeo.rotateZ(Math.PI / 2);
  const brakeDiscMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.35,
    metalness: 0.8,
  });

  const spokeGeo = new THREE.BoxGeometry(0.32, 0.028, 0.48);

  const wheelPositions = [
    { x: -0.95, y: 0.36, z: -1.36, isFront: true },
    { x: 0.95, y: 0.36, z: -1.36, isFront: true },
    { x: -0.99, y: 0.37, z: 1.32, isFront: false },
    { x: 0.99, y: 0.37, z: 1.32, isFront: false },
  ];

  for (const wp of wheelPositions) {
    const well = new THREE.Mesh(wellGeo, satinBlackMat);
    well.position.set(wp.x * 0.88, wp.y + 0.02, wp.z);
    bodyTiltGroup.add(well);

    const pivot = new THREE.Group();
    pivot.position.set(wp.x, wp.y, wp.z);
    root.add(pivot);

    const caliper = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.13, 0.09),
      caliperMat
    );
    caliper.position.set(wp.x > 0 ? 0.06 : -0.06, 0.04, -0.11);
    pivot.add(caliper);

    const spinGroup = new THREE.Group();
    pivot.add(spinGroup);

    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    spinGroup.add(tire);

    const rim = new THREE.Mesh(rimBarrelGeo, rimMat);
    spinGroup.add(rim);

    const disc = new THREE.Mesh(brakeDiscGeo, brakeDiscMat);
    spinGroup.add(disc);

    // 5 Forged Lamborghini Y-Spokes
    for (let s = 0; s < 5; s++) {
      const spoke = new THREE.Mesh(spokeGeo, chromeMat);
      spoke.rotation.x = (s * Math.PI) / 5;
      spinGroup.add(spoke);
    }

    wheels.push(spinGroup);
    if (wp.isFront) {
      frontWheelPivots.push(pivot);
    }
  }

  return {
    root,
    bodyTiltGroup,
    wheels,
    frontWheelPivots,
    brakeLightMaterial,
    headLightMaterial,
    nitroFlameGroup,
    bodyPaintMaterial,
    overheadMarker,
    setRaceNumber,
  };
}

/**
 * Builds civilian highway vehicles (commuter crossover SUVs, delivery vans, and city transit shuttles)
 * with upright everyday silhouettes that are visually distinct from the Lamborghini wedge race cars.
 */
export function buildCivilianVehicleModel(
  type: CivilianVehicleType,
  colorHex: number
): { root: THREE.Group; wheels: THREE.Object3D[] } {
  const root = new THREE.Group();
  const wheels: THREE.Object3D[] = [];

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: colorHex,
    roughness: 0.34,
    metalness: 0.35,
    clearcoat: 0.75,
  });

  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.65,
    metalness: 0.25,
  });

  const silverRailMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.3,
    metalness: 0.8,
  });

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.12,
    metalness: 0.85,
  });

  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xf43f5e,
    emissive: 0xe11d48,
    emissiveIntensity: 1.2,
  });

  const amberTurnMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xd97706,
    emissiveIntensity: 1.0,
  });

  const headMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfef08a,
    emissiveIntensity: 1.4,
  });

  if (type === 'sedan') {
    const width = 1.78;
    const length = 4.18;

    const lowerCladding = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.04, 0.28, length + 0.06),
      trimMat
    );
    lowerCladding.position.set(0, 0.34, 0);
    lowerCladding.castShadow = true;
    root.add(lowerCladding);

    const mainBody = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.54, length),
      bodyMat
    );
    mainBody.position.set(0, 0.72, 0);
    mainBody.castShadow = true;
    mainBody.receiveShadow = true;
    root.add(mainBody);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(width - 0.18, 0.56, 2.65),
      bodyMat
    );
    cabin.position.set(0, 1.24, 0.35);
    cabin.castShadow = true;
    root.add(cabin);

    const sideGlass = new THREE.Mesh(
      new THREE.BoxGeometry(width - 0.14, 0.38, 2.32),
      glassMat
    );
    sideGlass.position.set(0, 1.25, 0.36);
    root.add(sideGlass);

    const frontWindshield = new THREE.Mesh(
      new THREE.BoxGeometry(width - 0.28, 0.44, 0.08),
      glassMat
    );
    frontWindshield.position.set(0, 1.22, -0.98);
    frontWindshield.rotation.x = -0.32;
    root.add(frontWindshield);

    const rearTailgateGlass = new THREE.Mesh(
      new THREE.BoxGeometry(width - 0.28, 0.38, 0.08),
      glassMat
    );
    rearTailgateGlass.position.set(0, 1.24, 1.68);
    rearTailgateGlass.rotation.x = 0.14;
    root.add(rearTailgateGlass);

    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.06, 2.15),
        silverRailMat
      );
      rail.position.set(side * 0.64, 1.55, 0.38);
      root.add(rail);
    }
    for (const rz of [-0.35, 1.05]) {
      const crossbar = new THREE.Mesh(
        new THREE.BoxGeometry(1.32, 0.035, 0.07),
        trimMat
      );
      crossbar.position.set(0, 1.57, rz);
      root.add(crossbar);
    }

    const rearLightStrip = new THREE.Mesh(
      new THREE.BoxGeometry(width - 0.12, 0.10, 0.06),
      tailMat
    );
    rearLightStrip.position.set(0, 0.88, length / 2 + 0.01);
    root.add(rearLightStrip);

    for (const side of [-1, 1]) {
      const turnLamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.07, 0.07),
        amberTurnMat
      );
      turnLamp.position.set(side * 0.66, 0.78, length / 2 + 0.01);
      root.add(turnLamp);
    }

    const civPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.12, 0.04),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    );
    civPlate.position.set(0, 0.56, length / 2 + 0.02);
    root.add(civPlate);

    const frontLightBar = new THREE.Mesh(
      new THREE.BoxGeometry(width - 0.24, 0.12, 0.06),
      headMat
    );
    frontLightBar.position.set(0, 0.78, -length / 2 - 0.01);
    root.add(frontLightBar);

    const tireGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 16);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x111318,
      roughness: 0.85,
    });
    const hubcapGeo = new THREE.CylinderGeometry(0.20, 0.20, 0.25, 12);
    hubcapGeo.rotateZ(Math.PI / 2);

    for (const pos of [
      [-0.86, 0.34, -1.28],
      [0.86, 0.34, -1.28],
      [-0.86, 0.34, 1.28],
      [0.86, 0.34, 1.28],
    ]) {
      const wGroup = new THREE.Group();
      wGroup.position.set(pos[0], pos[1], pos[2]);
      wGroup.add(new THREE.Mesh(tireGeo, tireMat));
      wGroup.add(new THREE.Mesh(hubcapGeo, silverRailMat));
      root.add(wGroup);
      wheels.push(wGroup);
    }

    return { root, wheels };
  }

  const isHeavy = type === 'shuttle';
  const length = isHeavy ? 6.2 : 4.8;
  const height = isHeavy ? 2.45 : 1.95;
  const width = isHeavy ? 2.25 : 1.98;

  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.55, length),
    trimMat
  );
  chassis.position.y = 0.52;
  chassis.castShadow = true;
  root.add(chassis);

  const cargoBox = new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.06, height - 0.5, length * 0.72),
    bodyMat
  );
  cargoBox.position.set(0, 0.55 + (height - 0.5) / 2, length * 0.12);
  cargoBox.castShadow = true;
  root.add(cargoBox);

  const roofAc = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.58, 0.22, 1.35),
    silverRailMat
  );
  roofAc.position.set(0, height + 0.11, 0.2);
  root.add(roofAc);

  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.12, height * 0.65, length * 0.26),
    bodyMat
  );
  cab.position.set(0, 0.55 + (height * 0.65) / 2, -length * 0.36);
  cab.castShadow = true;
  root.add(cab);

  const windshield = new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.22, height * 0.32, 0.08),
    glassMat
  );
  windshield.position.set(0, height * 0.72, -length * 0.49);
  windshield.rotation.x = -0.18;
  root.add(windshield);

  const tailBar = new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.25, 0.16, 0.08),
    tailMat
  );
  tailBar.position.set(0, 0.62, length / 2 + 0.02);
  root.add(tailBar);

  const headBar = new THREE.Mesh(
    new THREE.BoxGeometry(width - 0.3, 0.16, 0.08),
    headMat
  );
  headBar.position.set(0, 0.62, -length / 2 - 0.02);
  root.add(headBar);

  const tireGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 16);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x111318,
    roughness: 0.85,
  });

  const zOff = length * 0.33;
  const xOff = width * 0.48;
  for (const pos of [
    [-xOff, 0.38, -zOff],
    [xOff, 0.38, -zOff],
    [-xOff, 0.38, zOff],
    [xOff, 0.38, zOff],
  ]) {
    const w = new THREE.Mesh(tireGeo, tireMat);
    w.position.set(pos[0], pos[1], pos[2]);
    root.add(w);
    wheels.push(w);
  }

  return { root, wheels };
}
