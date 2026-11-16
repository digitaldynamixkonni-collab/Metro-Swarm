import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ARENA_HALF_SIZE, BuildingCollider, buildCityArena } from './cityBuilder';
import { gameAudio } from './audio';
import {
  ActivePowerUp,
  FACTION_COLORS,
  FactionColorOption,
  GameEventToast,
  GamePhase,
  HudSnapshot,
  LeaderboardEntry,
  MatchDuration,
  MatchResult,
  MinimapBlock,
  MinimapFactionBlip,
  MinimapPowerUpBlip,
  POWER_UP_CONFIG,
  PowerUpType,
  RIVAL_NAMES,
  ScreenBadge,
} from './types';

// Pre-allocated math helpers (Zero GC in render loop)
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _projVec = new THREE.Vector3();

const MAX_CITIZENS = 440;
const MAX_PARTICLES = 160;
const MAX_SHOCKWAVES = 16;
const MAX_POWERUPS_ON_MAP = 6;
const RIVAL_COUNT = 5;

interface Citizen {
  active: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  factionId: number; // -1 = neutral, 0 = player, 1..5 = rivals
  isLeader: boolean;
  runPhase: number;
  popTimer: number;
  convertCooldown: number;
  wanderAngle: number;
  wanderTimer: number;
}

interface Faction {
  id: number;
  name: string;
  colorHex: string;
  colorNum: number;
  isPlayer: boolean;
  alive: boolean;
  leaderIdx: number;
  count: number;
  peakCount: number;
  stamina: number;
  sprinting: boolean;
  powerUps: Record<PowerUpType, number>; // remaining seconds
  aiState: 'gather' | 'hunt' | 'flee' | 'powerup';
  aiTimer: number;
  aiTargetX: number;
  aiTargetZ: number;
  auraRing: THREE.Mesh;
  magnetRing: THREE.Mesh;
  shieldDome: THREE.Mesh;
}

interface PowerUpEntity {
  id: number;
  active: boolean;
  type: PowerUpType;
  x: number;
  z: number;
  phase: number;
  group: THREE.Group;
  core: THREE.Mesh;
  orbitRing: THREE.Mesh;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  colorNum: number;
}

interface Shockwave {
  active: boolean;
  x: number;
  z: number;
  life: number;
  maxLife: number;
  maxRadius: number;
  colorNum: number;
  mesh: THREE.Mesh;
}

export interface EngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onMatchEnd: (result: MatchResult) => void;
}

export class CrowdCityEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;

  private isSoftwareGl = false;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private sunLight!: THREE.DirectionalLight;

  private city!: ReturnType<typeof buildCityArena>;
  private colliders: BuildingCollider[] = [];

  // Instanced Citizen Layers (composite 5-part procedural character)
  private shadowInst!: THREE.InstancedMesh;
  private leftLegInst!: THREE.InstancedMesh;
  private rightLegInst!: THREE.InstancedMesh;
  private torsoInst!: THREE.InstancedMesh;
  private headInst!: THREE.InstancedMesh;
  private crownInst!: THREE.InstancedMesh;
  private particleInst!: THREE.InstancedMesh;

  private citizens: Citizen[] = [];
  private factions: Faction[] = [];
  private powerUpEntities: PowerUpEntity[] = [];
  private particles: Particle[] = [];
  private shockwaves: Shockwave[] = [];

  private extraDisposables: {
    geometries: THREE.BufferGeometry[];
    materials: THREE.Material[];
  } = { geometries: [], materials: [] };

  // Simulation State
  private phase: GamePhase = 'title';
  private matchDuration: MatchDuration = 120;
  private selectedPlayerColor: FactionColorOption = FACTION_COLORS[0];
  private timeRemaining = 120;
  private elapsedMatchTime = 0;
  private neutralSpawnTimer = 0;
  private powerUpSpawnTimer = 0;
  private nextPowerUpId = 1;
  private nextToastId = 1;
  private toasts: { toast: GameEventToast; ttl: number }[] = [];

  // Stats
  private absorbedRivals = 0;
  private convertedTotal = 0;
  private powerUpsCollected = 0;
  private lastCountdownBeep = -1;
  private rushAnnounced = false;

  // Juice
  private hitstopTimer = 0;
  private shakeIntensity = 0;
  private currentFov = 46;
  private camPos = new THREE.Vector3(0, 34, 34);
  private camLook = new THREE.Vector3(0, 0, 0);
  private titleOrbitAngle = 0.5;

  // Input State
  private heldKeys = new Set<string>();
  private sprintRequested = false;
  private pointerActive = false;
  private pointerNdcX = 0;
  private pointerNdcY = 0;
  private steerDirX = 0;
  private steerDirZ = 0;

  // Loop
  private frameId = 0;
  private lastFrameMs = 0;
  private hudSyncTimer = 0;
  private disposed = false;

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.init();
  }

  private detectSoftwareGl(): boolean {
    try {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      return true;
    }
  }

  private init() {
    this.isSoftwareGl = this.detectSoftwareGl();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(this.container.clientWidth || window.innerWidth, this.container.clientHeight || window.innerHeight);

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    // Scene + Horizon-matched sky fog
    this.scene = new THREE.Scene();
    const skyColor = new THREE.Color(0xdbeafe);
    this.scene.background = skyColor;
    this.scene.fog = new THREE.Fog(0xdbeafe, 78, 215);

    // Studio PBR environment reflections
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Camera
    const aspect =
      (this.container.clientWidth || window.innerWidth) /
      Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(46, aspect, 0.5, 420);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    // 3-Point Warm/Cool Outdoor Lighting
    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x64748b, 0.85);
    this.scene.add(hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfffbeb, 1.85);
    this.sunLight.position.set(42, 68, 36);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    const d = 52;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 175;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.025;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.45);
    rimLight.position.set(-45, 30, -45);
    this.scene.add(rimLight);

    // Build City Arena
    this.city = buildCityArena(this.renderer, this.isSoftwareGl);
    this.colliders = this.city.colliders;
    this.scene.add(this.city.group);

    // Initialize Pooled Citizen Meshes, PowerUp Beacons, Particles, Shockwaves
    this.initCitizenMeshes();
    this.initPowerUpBeacons();
    this.initVfxPools();

    // Populate initial lively demo match on Title Screen
    this.setupTitleDemoMatch();

    // Pre-warm shaders on GPU
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Bind Events
    this.bindEvents();

    // Start Loop
    this.lastFrameMs = performance.now();
    this.scheduleNextFrame();
  }

  private initCitizenMeshes() {
    const shadowGeo = new THREE.CircleGeometry(0.36, 12);
    shadowGeo.rotateX(-Math.PI / 2);
    const legGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.44, 8);
    const torsoGeo = new THREE.CylinderGeometry(0.24, 0.29, 0.72, 12);
    const headGeo = new THREE.SphereGeometry(0.23, 12, 10);
    const crownGeo = new THREE.ConeGeometry(0.28, 0.42, 4);
    crownGeo.rotateX(Math.PI);

    this.extraDisposables.geometries.push(shadowGeo, legGeo, torsoGeo, headGeo, crownGeo);

    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
    });
    const legMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.85,
      metalness: 0.05,
    });
    const torsoMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.56,
      metalness: 0.06,
    });
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.34,
      metalness: 0.04,
    });
    const crownMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.4,
      roughness: 0.22,
      metalness: 0.75,
    });

    this.extraDisposables.materials.push(shadowMat, legMat, torsoMat, headMat, crownMat);

    this.shadowInst = new THREE.InstancedMesh(shadowGeo, shadowMat, MAX_CITIZENS);
    this.leftLegInst = new THREE.InstancedMesh(legGeo, legMat, MAX_CITIZENS);
    this.rightLegInst = new THREE.InstancedMesh(legGeo, legMat, MAX_CITIZENS);
    this.torsoInst = new THREE.InstancedMesh(torsoGeo, torsoMat, MAX_CITIZENS);
    this.headInst = new THREE.InstancedMesh(headGeo, headMat, MAX_CITIZENS);
    this.crownInst = new THREE.InstancedMesh(crownGeo, crownMat, 16);

    [
      this.shadowInst,
      this.leftLegInst,
      this.rightLegInst,
      this.torsoInst,
      this.headInst,
      this.crownInst,
    ].forEach((inst) => {
      inst.frustumCulled = false;
      inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.scene.add(inst);
    });

    if (!this.isSoftwareGl) {
      this.torsoInst.castShadow = true;
      this.headInst.castShadow = true;
    }

    // Initialize instance color buffer on torsoInst
    this.torsoInst.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_CITIZENS * 3),
      3,
    );

    for (let i = 0; i < MAX_CITIZENS; i++) {
      this.citizens.push({
        active: false,
        x: 0,
        z: 0,
        vx: 0,
        vz: 0,
        yaw: 0,
        factionId: -1,
        isLeader: false,
        runPhase: Math.random() * Math.PI * 2,
        popTimer: 0,
        convertCooldown: 0,
        wanderAngle: Math.random() * Math.PI * 2,
        wanderTimer: Math.random() * 2,
      });
    }
  }

  private initPowerUpBeacons() {
    const padGeo = new THREE.RingGeometry(1.15, 1.55, 24);
    padGeo.rotateX(-Math.PI / 2);
    const orbitGeo = new THREE.TorusGeometry(1.1, 0.08, 8, 24);
    const beamGeo = new THREE.CylinderGeometry(0.45, 0.9, 3.6, 16, 1, true);
    const coreGeos: Record<PowerUpType, THREE.BufferGeometry> = {
      speed: new THREE.OctahedronGeometry(0.75, 0),
      magnet: new THREE.TorusGeometry(0.55, 0.22, 10, 20, Math.PI * 1.4),
      shield: new THREE.IcosahedronGeometry(0.72, 0),
      surge: new THREE.DodecahedronGeometry(0.72, 0),
    };
    this.extraDisposables.geometries.push(
      padGeo,
      orbitGeo,
      beamGeo,
      coreGeos.speed,
      coreGeos.magnet,
      coreGeos.shield,
      coreGeos.surge,
    );

    const types: PowerUpType[] = ['speed', 'magnet', 'shield', 'surge'];
    for (let i = 0; i < MAX_POWERUPS_ON_MAP; i++) {
      const type = types[i % types.length];
      const meta = POWER_UP_CONFIG[type];
      const g = new THREE.Group();
      g.visible = false;

      const padMat = new THREE.MeshBasicMaterial({
        color: meta.hex,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const coreMat = new THREE.MeshStandardMaterial({
        color: meta.hex,
        emissive: meta.hex,
        emissiveIntensity: 0.45,
        roughness: 0.2,
        metalness: 0.6,
      });
      const orbitMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: meta.hex,
        emissiveIntensity: 0.35,
        roughness: 0.25,
        metalness: 0.7,
      });
      const beamMat = new THREE.MeshBasicMaterial({
        color: meta.hex,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.extraDisposables.materials.push(padMat, coreMat, orbitMat, beamMat);

      const pad = new THREE.Mesh(padGeo, padMat);
      pad.position.y = 0.05;
      const core = new THREE.Mesh(coreGeos[type], coreMat);
      core.position.y = 1.6;
      const orbitRing = new THREE.Mesh(orbitGeo, orbitMat);
      orbitRing.position.y = 1.6;
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.y = 1.85;

      g.add(pad, core, orbitRing, beam);
      this.scene.add(g);

      this.powerUpEntities.push({
        id: i,
        active: false,
        type,
        x: 0,
        z: 0,
        phase: Math.random() * Math.PI * 2,
        group: g,
        core,
        orbitRing,
      });
    }
  }

  private initVfxPools() {
    // Particles
    const pGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
    const pMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.1,
    });
    this.extraDisposables.geometries.push(pGeo);
    this.extraDisposables.materials.push(pMat);

    this.particleInst = new THREE.InstancedMesh(pGeo, pMat, MAX_PARTICLES);
    this.particleInst.frustumCulled = false;
    this.particleInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleInst.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_PARTICLES * 3),
      3,
    );
    this.scene.add(this.particleInst);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.5,
        scale: 1,
        colorNum: 0xffffff,
      });
    }

    // Shockwaves
    const swGeo = new THREE.RingGeometry(0.75, 1.0, 32);
    swGeo.rotateX(-Math.PI / 2);
    this.extraDisposables.geometries.push(swGeo);

    for (let i = 0; i < MAX_SHOCKWAVES; i++) {
      const swMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.extraDisposables.materials.push(swMat);
      const mesh = new THREE.Mesh(swGeo, swMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.shockwaves.push({
        active: false,
        x: 0,
        z: 0,
        life: 0,
        maxLife: 0.45,
        maxRadius: 5,
        colorNum: 0xffffff,
        mesh,
      });
    }
  }

  private createFactionVisuals(colorNum: number) {
    const auraGeo = new THREE.RingGeometry(0.9, 1.22, 28);
    auraGeo.rotateX(-Math.PI / 2);
    const auraMat = new THREE.MeshBasicMaterial({
      color: colorNum,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const auraRing = new THREE.Mesh(auraGeo, auraMat);
    auraRing.position.y = 0.04;
    this.scene.add(auraRing);

    const magGeo = new THREE.RingGeometry(15.2, 16.0, 48);
    magGeo.rotateX(-Math.PI / 2);
    const magMat = new THREE.MeshBasicMaterial({
      color: POWER_UP_CONFIG.magnet.hex,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const magnetRing = new THREE.Mesh(magGeo, magMat);
    magnetRing.position.y = 0.06;
    magnetRing.visible = false;
    this.scene.add(magnetRing);

    const shieldGeo = new THREE.SphereGeometry(2.3, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.58);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: POWER_UP_CONFIG.shield.hex,
      transparent: true,
      opacity: 0.24,
      wireframe: true,
      depthWrite: false,
    });
    const shieldDome = new THREE.Mesh(shieldGeo, shieldMat);
    shieldDome.position.y = 0.05;
    shieldDome.visible = false;
    this.scene.add(shieldDome);

    this.extraDisposables.geometries.push(auraGeo, magGeo, shieldGeo);
    this.extraDisposables.materials.push(auraMat, magMat, shieldMat);

    return { auraRing, magnetRing, shieldDome };
  }

  private clearFactions() {
    for (const f of this.factions) {
      this.scene.remove(f.auraRing);
      this.scene.remove(f.magnetRing);
      this.scene.remove(f.shieldDome);
    }
    this.factions = [];
  }

  private allocCitizen(): number {
    for (let i = 0; i < MAX_CITIZENS; i++) {
      if (!this.citizens[i].active) return i;
    }
    // Reclaim an old neutral if full
    for (let i = 0; i < MAX_CITIZENS; i++) {
      if (this.citizens[i].active && this.citizens[i].factionId === -1) return i;
    }
    return -1;
  }

  private spawnCitizen(
    x: number,
    z: number,
    factionId: number,
    isLeader = false,
    pop = true,
  ): number {
    const idx = this.allocCitizen();
    if (idx < 0) return -1;
    const c = this.citizens[idx];
    c.active = true;
    c.x = x;
    c.z = z;
    c.vx = 0;
    c.vz = 0;
    c.yaw = Math.random() * Math.PI * 2;
    c.factionId = factionId;
    c.isLeader = isLeader;
    c.runPhase = Math.random() * Math.PI * 2;
    c.popTimer = pop ? 0.35 : 0;
    c.convertCooldown = 0.25;
    c.wanderAngle = Math.random() * Math.PI * 2;
    c.wanderTimer = 1 + Math.random() * 2.5;
    return idx;
  }

  private setupWorldEntities(playerColor: FactionColorOption, includeHumanPlayer: boolean) {
    this.clearFactions();
    for (const c of this.citizens) c.active = false;
    for (const p of this.particles) p.active = false;
    for (const s of this.shockwaves) {
      s.active = false;
      s.mesh.visible = false;
    }
    for (const pu of this.powerUpEntities) {
      pu.active = false;
      pu.group.visible = false;
    }

    this.absorbedRivals = 0;
    this.convertedTotal = 0;
    this.powerUpsCollected = 0;
    this.toasts = [];
    this.rushAnnounced = false;
    this.lastCountdownBeep = -1;
    this.hitstopTimer = 0;
    this.shakeIntensity = 0;

    // Pick rival colors excluding player's selected color
    const otherColors = FACTION_COLORS.filter((c) => c.id !== playerColor.id);
    const totalFactions = 1 + RIVAL_COUNT;

    // Spawn positions spaced cleanly along avenues
    const startSpots = [
      { x: 0, z: 33 },
      { x: -33, z: -33 },
      { x: 33, z: -33 },
      { x: -66, z: 0 },
      { x: 66, z: 0 },
      { x: 0, z: -66 },
    ];

    for (let i = 0; i < totalFactions; i++) {
      const isPlayer = i === 0 && includeHumanPlayer;
      const col = i === 0 ? playerColor : otherColors[(i - 1) % otherColors.length];
      const spot = startSpots[i % startSpots.length];
      const visuals = this.createFactionVisuals(col.num);

      const leaderIdx = this.spawnCitizen(spot.x, spot.z, i, true, false);
      const starterFollowers = 3; // Start with 4 total (leader + 3)
      for (let f = 0; f < starterFollowers; f++) {
        const ang = (f / starterFollowers) * Math.PI * 2;
        this.spawnCitizen(
          spot.x + Math.cos(ang) * 1.4,
          spot.z + Math.sin(ang) * 1.4,
          i,
          false,
          false,
        );
      }

      this.factions.push({
        id: i,
        name: isPlayer ? 'You' : RIVAL_NAMES[(i - 1) % RIVAL_NAMES.length],
        colorHex: col.hex,
        colorNum: col.num,
        isPlayer,
        alive: true,
        leaderIdx,
        count: 1 + starterFollowers,
        peakCount: 1 + starterFollowers,
        stamina: 1,
        sprinting: false,
        powerUps: { speed: 0, magnet: 0, shield: 0, surge: 0 },
        aiState: 'gather',
        aiTimer: 0.4 + Math.random() * 0.8,
        aiTargetX: 0,
        aiTargetZ: 0,
        auraRing: visuals.auraRing,
        magnetRing: visuals.magnetRing,
        shieldDome: visuals.shieldDome,
      });
    }

    // Spawn generous initial neutral stragglers in clusters across avenues & park
    for (let n = 0; n < 135; n++) {
      this.spawnNeutralAtRandomPoint(false);
    }

    // Spawn 4 initial power-ups on map
    for (let k = 0; k < 4; k++) {
      this.spawnPowerUpBeacon();
    }
  }

  private setupTitleDemoMatch() {
    this.phase = 'title';
    this.setupWorldEntities(this.selectedPlayerColor, false);
  }

  public startMatch(color: FactionColorOption, duration: MatchDuration) {
    this.selectedPlayerColor = color;
    this.matchDuration = duration;
    this.timeRemaining = duration;
    this.elapsedMatchTime = 0;
    this.neutralSpawnTimer = 0;
    this.powerUpSpawnTimer = 0;
    this.phase = 'playing';

    this.heldKeys.clear();
    this.pointerActive = false;
    this.sprintRequested = false;

    this.setupWorldEntities(color, true);

    const playerLeader = this.citizens[this.factions[0].leaderIdx];
    this.camLook.set(playerLeader.x, 0, playerLeader.z);
    this.camPos.set(playerLeader.x, 28, playerLeader.z + 24);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    gameAudio.unlock();
    this.pushHudSnapshot();
  }

  public pauseMatch() {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.heldKeys.clear();
      this.pointerActive = false;
    }
  }

  public resumeMatch() {
    if (this.phase === 'paused') {
      this.phase = 'playing';
      this.lastFrameMs = performance.now();
    }
  }

  public returnToTitle() {
    this.setupTitleDemoMatch();
    this.pushHudSnapshot();
  }

  public setSelectedColor(color: FactionColorOption) {
    this.selectedPlayerColor = color;
    if (this.phase === 'title' && this.factions[0]) {
      this.factions[0].colorHex = color.hex;
      this.factions[0].colorNum = color.num;
      (this.factions[0].auraRing.material as THREE.MeshBasicMaterial).color.setHex(color.num);
    }
  }

  private spawnNeutralAtRandomPoint(pop = true) {
    const pts = this.city.spawnPoints;
    const pt = pts[Math.floor(Math.random() * pts.length)];
    const rx = pt.x + (Math.random() - 0.5) * 9;
    const rz = pt.z + (Math.random() - 0.5) * 9;
    const resolved = this.resolveBuildingCollision(rx, rz, 0.6);
    this.spawnCitizen(resolved.x, resolved.z, -1, false, pop);
  }

  private spawnPowerUpBeacon() {
    // Pick an inactive beacon slot
    const slot = this.powerUpEntities.find((p) => !p.active);
    if (!slot) return;

    const pts = this.city.powerUpPoints;
    // Pick a point not already occupied by another active power-up
    const candidates = pts.filter(
      (pt) =>
        !this.powerUpEntities.some(
          (other) => other.active && Math.hypot(other.x - pt.x, other.z - pt.z) < 10,
        ),
    );
    const pt =
      candidates.length > 0
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : pts[Math.floor(Math.random() * pts.length)];

    // Cycle or randomize type fairly
    const types: PowerUpType[] = ['speed', 'magnet', 'shield', 'surge'];
    const chosenType = types[this.nextPowerUpId % types.length];
    this.nextPowerUpId++;

    // Rebuild slot's color/geometry or reuse matching slot!
    // Even cleaner: find inactive slot matching chosenType, or swap type visuals
    const matchingSlot = this.powerUpEntities.find((p) => !p.active && p.type === chosenType) ?? slot;
    matchingSlot.active = true;
    matchingSlot.x = pt.x;
    matchingSlot.z = pt.z;
    matchingSlot.phase = Math.random() * Math.PI * 2;
    matchingSlot.group.position.set(pt.x, 0, pt.z);
    matchingSlot.group.visible = true;

    this.spawnShockwave(pt.x, pt.z, 3.2, POWER_UP_CONFIG[matchingSlot.type].hex);
  }

  private spawnBurst(x: number, y: number, z: number, colorNum: number, count = 8) {
    let spawned = 0;
    for (let i = 0; i < MAX_PARTICLES && spawned < count; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.x = x;
        p.y = y;
        p.z = z;
        const ang = Math.random() * Math.PI * 2;
        const spd = 2.5 + Math.random() * 5.5;
        p.vx = Math.cos(ang) * spd;
        p.vy = 3.2 + Math.random() * 4.5;
        p.vz = Math.sin(ang) * spd;
        p.life = 0;
        p.maxLife = 0.35 + Math.random() * 0.28;
        p.scale = 0.7 + Math.random() * 0.7;
        p.colorNum = colorNum;
        spawned++;
      }
    }
  }

  private spawnShockwave(x: number, z: number, maxRadius: number, colorNum: number) {
    const sw = this.shockwaves.find((s) => !s.active);
    if (!sw) return;
    sw.active = true;
    sw.x = x;
    sw.z = z;
    sw.life = 0;
    sw.maxLife = 0.48;
    sw.maxRadius = maxRadius;
    sw.colorNum = colorNum;
    sw.mesh.position.set(x, 0.09, z);
    sw.mesh.scale.setScalar(0.5);
    (sw.mesh.material as THREE.MeshBasicMaterial).color.setHex(colorNum);
    (sw.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85;
    sw.mesh.visible = true;
  }

  private addToast(text: string, color: string, kind: GameEventToast['kind']) {
    this.toasts.unshift({
      toast: { id: this.nextToastId++, text, color, kind },
      ttl: 2.6,
    });
    if (this.toasts.length > 3) {
      this.toasts.length = 3;
    }
  }

  private resolveBuildingCollision(x: number, z: number, radius: number): { x: number; z: number } {
    let rx = THREE.MathUtils.clamp(x, -ARENA_HALF_SIZE + radius, ARENA_HALF_SIZE - radius);
    let rz = THREE.MathUtils.clamp(z, -ARENA_HALF_SIZE + radius, ARENA_HALF_SIZE - radius);

    for (let i = 0; i < this.colliders.length; i++) {
      const b = this.colliders[i];
      const closestX = THREE.MathUtils.clamp(rx, b.minX, b.maxX);
      const closestZ = THREE.MathUtils.clamp(rz, b.minZ, b.maxZ);
      const dx = rx - closestX;
      const dz = rz - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        if (distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const push = radius - dist;
          rx += (dx / dist) * push;
          rz += (dz / dist) * push;
        } else {
          // Inside box center fallback: push along shortest axis
          const penX = b.halfW + radius - Math.abs(rx - b.cx);
          const penZ = b.halfD + radius - Math.abs(rz - b.cz);
          if (penX < penZ) {
            rx += rx >= b.cx ? penX : -penX;
          } else {
            rz += rz >= b.cz ? penZ : -penZ;
          }
        }
      }
    }

    return { x: rx, z: rz };
  }

  private bindEvents() {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    dom.addEventListener('webglcontextlost', this.handleContextLost);
  }

  private unbindEvents() {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    dom.removeEventListener('webglcontextlost', this.handleContextLost);
  }

  private handleContextLost = (e: Event) => {
    e.preventDefault();
  };

  private handleResize = () => {
    if (!this.container || this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      if (this.phase === 'playing') e.preventDefault();
    }
    this.heldKeys.add(e.code);

    if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      if (!this.sprintRequested && this.phase === 'playing') {
        const pf = this.factions[0];
        if (pf && pf.stamina > 0.15) {
          gameAudio.playSprintStart();
        }
      }
      this.sprintRequested = true;
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.heldKeys.delete(e.code);
    if (
      !this.heldKeys.has('Space') &&
      !this.heldKeys.has('ShiftLeft') &&
      !this.heldKeys.has('ShiftRight')
    ) {
      this.sprintRequested = false;
    }
  };

  private handleBlur = () => {
    this.heldKeys.clear();
    this.sprintRequested = false;
    this.pointerActive = false;
  };

  private handlePointerDown = (e: PointerEvent) => {
    if (this.phase !== 'playing') return;
    gameAudio.unlock();
    this.pointerActive = true;
    this.updatePointerNdc(e);
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (!this.pointerActive || this.phase !== 'playing') return;
    this.updatePointerNdc(e);
  };

  private handlePointerUp = () => {
    this.pointerActive = false;
  };

  private updatePointerNdc(e: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    this.pointerNdcX = (e.clientX - cx) / Math.max(1, rect.width / 2);
    this.pointerNdcY = (e.clientY - cy) / Math.max(1, rect.height / 2);
  }

  private computePlayerSteer() {
    let kx = 0;
    let kz = 0;
    if (this.heldKeys.has('KeyW') || this.heldKeys.has('ArrowUp')) kz -= 1;
    if (this.heldKeys.has('KeyS') || this.heldKeys.has('ArrowDown')) kz += 1;
    if (this.heldKeys.has('KeyA') || this.heldKeys.has('ArrowLeft')) kx -= 1;
    if (this.heldKeys.has('KeyD') || this.heldKeys.has('ArrowRight')) kx += 1;

    if (kx !== 0 || kz !== 0) {
      const len = Math.hypot(kx, kz);
      this.steerDirX = kx / len;
      this.steerDirZ = kz / len;
      return true;
    }

    if (this.pointerActive) {
      const len = Math.hypot(this.pointerNdcX, this.pointerNdcY);
      if (len > 0.04) {
        this.steerDirX = this.pointerNdcX / len;
        this.steerDirZ = this.pointerNdcY / len;
        return true;
      }
    }

    this.steerDirX = 0;
    this.steerDirZ = 0;
    return false;
  }

  private stepSimulation(dt: number) {
    // Hitstop pause for punchy elimination feedback
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      return;
    }

    // Update toasts
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].ttl -= dt;
      if (this.toasts[i].ttl <= 0) this.toasts.splice(i, 1);
    }

    // Match timer in playing mode
    if (this.phase === 'playing') {
      this.elapsedMatchTime += dt;
      this.timeRemaining = Math.max(0, this.timeRemaining - dt);

      if (this.timeRemaining <= 30 && !this.rushAnnounced) {
        this.rushAnnounced = true;
        this.addToast('Rush Hour! Bonus crowds arriving', '#F59E0B', 'rush');
      }

      if (this.timeRemaining <= 5 && this.timeRemaining > 0) {
        const sec = Math.ceil(this.timeRemaining);
        if (sec !== this.lastCountdownBeep) {
          this.lastCountdownBeep = sec;
          gameAudio.playTick(sec <= 2);
        }
      }

      if (this.timeRemaining <= 0) {
        this.finishMatchByTimer();
        return;
      }
    }

    // Continuous neutral & power-up spawning
    const isRush = this.phase === 'playing' && this.timeRemaining <= 30;
    const spawnInterval = isRush ? 0.35 : 0.65;
    this.neutralSpawnTimer += dt;
    if (this.neutralSpawnTimer >= spawnInterval) {
      this.neutralSpawnTimer = 0;
      let neutralCount = 0;
      for (let i = 0; i < MAX_CITIZENS; i++) {
        if (this.citizens[i].active && this.citizens[i].factionId === -1) neutralCount++;
      }
      const targetNeutrals = isRush ? 150 : 115;
      if (neutralCount < targetNeutrals) {
        this.spawnNeutralAtRandomPoint(true);
      }
    }

    this.powerUpSpawnTimer += dt;
    if (this.powerUpSpawnTimer >= 5.5) {
      this.powerUpSpawnTimer = 0;
      const activePowerUps = this.powerUpEntities.filter((p) => p.active).length;
      if (activePowerUps < MAX_POWERUPS_ON_MAP) {
        this.spawnPowerUpBeacon();
      }
    }

    // Recount faction sizes cleanly
    for (const f of this.factions) f.count = 0;
    for (let i = 0; i < MAX_CITIZENS; i++) {
      const c = this.citizens[i];
      if (c.active && c.factionId >= 0) {
        const fac = this.factions[c.factionId];
        if (fac) fac.count++;
      }
    }

    // Update Power-Up timers & visuals for each faction
    for (const f of this.factions) {
      if (!f.alive) continue;
      if (f.count > f.peakCount) f.peakCount = f.count;

      (['speed', 'magnet', 'shield'] as PowerUpType[]).forEach((t) => {
        if (f.powerUps[t] > 0) {
          f.powerUps[t] = Math.max(0, f.powerUps[t] - dt);
        }
      });

      const leader = this.citizens[f.leaderIdx];
      if (!leader || !leader.active) continue;

      // Update Faction Aura Rings
      f.auraRing.visible = true;
      f.auraRing.position.set(leader.x, 0.04, leader.z);
      const auraScale = 1.0 + Math.min(f.count, 100) * 0.015;
      f.auraRing.scale.setScalar(auraScale);

      if (f.powerUps.magnet > 0) {
        f.magnetRing.visible = true;
        f.magnetRing.position.set(leader.x, 0.06, leader.z);
        const pulse = 0.94 + Math.sin(performance.now() * 0.008) * 0.06;
        f.magnetRing.scale.setScalar(pulse);
      } else {
        f.magnetRing.visible = false;
      }

      if (f.powerUps.shield > 0) {
        f.shieldDome.visible = true;
        f.shieldDome.position.set(leader.x, 0.05, leader.z);
        f.shieldDome.rotation.y += dt * 1.8;
        const sScale = 1 + Math.min(f.count, 40) * 0.02;
        f.shieldDome.scale.setScalar(sScale);
      } else {
        f.shieldDome.visible = false;
      }
    }

    // Move Leaders (Player & AI)
    for (const f of this.factions) {
      if (!f.alive) continue;
      const leader = this.citizens[f.leaderIdx];
      if (!leader || !leader.active) continue;

      let dirX = 0;
      let dirZ = 0;
      let moving = false;

      if (f.isPlayer && this.phase === 'playing') {
        moving = this.computePlayerSteer();
        dirX = this.steerDirX;
        dirZ = this.steerDirZ;

        // Stamina & Sprint
        const hasSpeedBoost = f.powerUps.speed > 0;
        if (this.sprintRequested && moving && (hasSpeedBoost || f.stamina > 0.02)) {
          f.sprinting = true;
          if (!hasSpeedBoost) {
            f.stamina = Math.max(0, f.stamina - dt * 0.32);
          }
        } else {
          f.sprinting = false;
          f.stamina = Math.min(1, f.stamina + dt * 0.22);
        }
      } else {
        // Smart AI Leader Steering
        const aiDir = this.computeAiSteer(f, leader, dt);
        dirX = aiDir.x;
        dirZ = aiDir.z;
        moving = aiDir.moving;
      }

      const baseSpeed = 12.2;
      const speedMult =
        (f.powerUps.speed > 0 ? 1.55 : 1.0) * (f.sprinting && f.powerUps.speed <= 0 ? 1.4 : 1.0);
      const speed = baseSpeed * speedMult;

      if (moving) {
        leader.vx = THREE.MathUtils.damp(leader.vx, dirX * speed, 14, dt);
        leader.vz = THREE.MathUtils.damp(leader.vz, dirZ * speed, 14, dt);
        const targetYaw = Math.atan2(leader.vx, leader.vz);
        const diff = Math.atan2(Math.sin(targetYaw - leader.yaw), Math.cos(targetYaw - leader.yaw));
        leader.yaw += diff * Math.min(1, dt * 12);
        leader.runPhase += dt * (f.powerUps.speed > 0 || f.sprinting ? 19 : 13);

        if ((f.powerUps.speed > 0 || f.sprinting) && Math.random() < dt * 14) {
          this.spawnBurst(
            leader.x,
            0.4,
            leader.z,
            f.powerUps.speed > 0 ? POWER_UP_CONFIG.speed.hex : f.colorNum,
            1,
          );
        }
      } else {
        leader.vx = THREE.MathUtils.damp(leader.vx, 0, 10, dt);
        leader.vz = THREE.MathUtils.damp(leader.vz, 0, 10, dt);
      }

      const nextPos = this.resolveBuildingCollision(
        leader.x + leader.vx * dt,
        leader.z + leader.vz * dt,
        0.75,
      );
      leader.x = nextPos.x;
      leader.z = nextPos.z;

      // Check Power-Up Pickups!
      this.checkPowerUpPickup(f, leader);
    }

    // Update Power-Up Beacon animations
    for (const pu of this.powerUpEntities) {
      if (!pu.active) continue;
      pu.phase += dt * 2.8;
      pu.core.position.y = 1.6 + Math.sin(pu.phase) * 0.28;
      pu.core.rotation.y += dt * 2.1;
      pu.orbitRing.position.y = pu.core.position.y;
      pu.orbitRing.rotation.x = Math.PI * 0.35 + Math.sin(pu.phase * 0.6) * 0.25;
      pu.orbitRing.rotation.z += dt * 1.9;
    }

    // Update Followers & Neutrals (Flocking, Magnet Pull, Conversion)
    this.updateFollowersAndNeutrals(dt);

    // Combat & Elimination between Factions
    this.updateSkirmishes(dt);

    // Update VFX (Particles & Shockwaves)
    this.updateVfx(dt);

    // Check Early Victory / Elimination in playing mode
    if (this.phase === 'playing') {
      const playerFac = this.factions[0];
      if (!playerFac.alive || playerFac.count <= 0) {
        this.triggerMatchEnd(false, 'eliminated');
        return;
      }
      const aliveRivals = this.factions.filter((f) => !f.isPlayer && f.alive);
      if (aliveRivals.length === 0) {
        this.triggerMatchEnd(true, 'eliminated_all');
        return;
      }
    }
  }

  private computeAiSteer(
    f: Faction,
    leader: Citizen,
    dt: number,
  ): { x: number; z: number; moving: boolean } {
    f.aiTimer -= dt;

    // Immediate threat check: flee from larger nearby rivals (unless shielded!)
    let nearestThreat: Faction | null = null;
    let nearestThreatDist = 20;
    let nearestPrey: Faction | null = null;
    let nearestPreyDist = 28;

    for (const other of this.factions) {
      if (other.id === f.id || !other.alive) continue;
      const ol = this.citizens[other.leaderIdx];
      if (!ol || !ol.active) continue;
      const dist = Math.hypot(ol.x - leader.x, ol.z - leader.z);

      if (other.count > f.count + 1 && f.powerUps.shield <= 0 && dist < nearestThreatDist) {
        nearestThreatDist = dist;
        nearestThreat = other;
      } else if (f.count >= other.count + 3 && other.powerUps.shield <= 0 && dist < nearestPreyDist) {
        nearestPreyDist = dist;
        nearestPrey = other;
      }
    }

    if (nearestThreat) {
      const tl = this.citizens[nearestThreat.leaderIdx];
      const dx = leader.x - tl.x;
      const dz = leader.z - tl.z;
      const len = Math.max(0.01, Math.hypot(dx, dz));
      f.aiState = 'flee';
      f.sprinting = nearestThreatDist < 12 && f.stamina > 0.25;
      if (f.sprinting) f.stamina = Math.max(0, f.stamina - dt * 0.3);
      return { x: dx / len, z: dz / len, moving: true };
    }

    f.sprinting = false;
    f.stamina = Math.min(1, f.stamina + dt * 0.2);

    if (f.aiTimer <= 0) {
      f.aiTimer = 0.55 + Math.random() * 0.65;

      // Check for nearby power-up first
      let bestPu: PowerUpEntity | null = null;
      let bestPuDist = 24;
      for (const pu of this.powerUpEntities) {
        if (!pu.active) continue;
        const d = Math.hypot(pu.x - leader.x, pu.z - leader.z);
        if (d < bestPuDist) {
          bestPuDist = d;
          bestPu = pu;
        }
      }

      if (bestPu) {
        f.aiState = 'powerup';
        f.aiTargetX = bestPu.x;
        f.aiTargetZ = bestPu.z;
      } else if (nearestPrey) {
        const pl = this.citizens[nearestPrey.leaderIdx];
        f.aiState = 'hunt';
        f.aiTargetX = pl.x;
        f.aiTargetZ = pl.z;
      } else {
        // Seek nearest neutral citizen
        let bestNx = 0;
        let bestNz = 0;
        let bestNDist = Infinity;
        for (let i = 0; i < MAX_CITIZENS; i++) {
          const c = this.citizens[i];
          if (!c.active || c.factionId !== -1) continue;
          const d = (c.x - leader.x) ** 2 + (c.z - leader.z) ** 2;
          if (d < bestNDist) {
            bestNDist = d;
            bestNx = c.x;
            bestNz = c.z;
          }
        }
        if (bestNDist < Infinity) {
          f.aiState = 'gather';
          f.aiTargetX = bestNx;
          f.aiTargetZ = bestNz;
        } else {
          f.aiTargetX = (Math.random() - 0.5) * 90;
          f.aiTargetZ = (Math.random() - 0.5) * 90;
        }
      }
    }

    const dx = f.aiTargetX - leader.x;
    const dz = f.aiTargetZ - leader.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.5) return { x: 0, z: 0, moving: false };
    return { x: dx / len, z: dz / len, moving: true };
  }

  private checkPowerUpPickup(f: Faction, leader: Citizen) {
    const pickupRadius = 2.4 + Math.min(f.count * 0.04, 1.4);
    for (const pu of this.powerUpEntities) {
      if (!pu.active) continue;
      const dist = Math.hypot(pu.x - leader.x, pu.z - leader.z);
      if (dist <= pickupRadius) {
        pu.active = false;
        pu.group.visible = false;

        const meta = POWER_UP_CONFIG[pu.type];
        this.spawnBurst(pu.x, 1.3, pu.z, meta.hex, 18);
        this.spawnShockwave(pu.x, pu.z, 7.5, meta.hex);

        if (pu.type === 'surge') {
          const bonus = 6;
          for (let k = 0; k < bonus; k++) {
            const ang = (k / bonus) * Math.PI * 2;
            const pos = this.resolveBuildingCollision(
              leader.x + Math.cos(ang) * 1.8,
              leader.z + Math.sin(ang) * 1.8,
              0.5,
            );
            this.spawnCitizen(pos.x, pos.z, f.id, false, true);
          }
          f.count += bonus;
        } else {
          f.powerUps[pu.type] = meta.duration;
          if (pu.type === 'speed') f.stamina = 1;
        }

        if (f.isPlayer && this.phase === 'playing') {
          this.powerUpsCollected++;
          gameAudio.playPowerUp(pu.type);
          this.shakeIntensity = Math.max(this.shakeIntensity, 0.25);
          this.addToast(`${meta.label}! · ${meta.shortDesc}`, meta.color, 'powerup');
        }
      }
    }
  }

  private updateFollowersAndNeutrals(dt: number) {
    // 1. Update each citizen's movement & neutral recruitment
    for (let i = 0; i < MAX_CITIZENS; i++) {
      const c = this.citizens[i];
      if (!c.active) continue;
      if (c.popTimer > 0) c.popTimer = Math.max(0, c.popTimer - dt);
      if (c.convertCooldown > 0) c.convertCooldown = Math.max(0, c.convertCooldown - dt);

      if (c.isLeader) continue;

      if (c.factionId === -1) {
        // Neutral wander + Magnet pull check!
        c.wanderTimer -= dt;
        if (c.wanderTimer <= 0) {
          c.wanderTimer = 1.4 + Math.random() * 2.5;
          c.wanderAngle += (Math.random() - 0.5) * 2.2;
        }

        let targetVx = Math.cos(c.wanderAngle) * 2.2;
        let targetVz = Math.sin(c.wanderAngle) * 2.2;
        let attracted = false;

        // Check if any faction with active Magnet is pulling this neutral
        for (const f of this.factions) {
          if (!f.alive || f.powerUps.magnet <= 0) continue;
          const leader = this.citizens[f.leaderIdx];
          if (!leader || !leader.active) continue;
          const dx = leader.x - c.x;
          const dz = leader.z - c.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 16.5 && dist > 0.1) {
            const pullStrength = 13.5 + (1 - dist / 16.5) * 9.0;
            targetVx = (dx / dist) * pullStrength;
            targetVz = (dz / dist) * pullStrength;
            attracted = true;
            break;
          }
        }

        c.vx = THREE.MathUtils.damp(c.vx, targetVx, attracted ? 14 : 5, dt);
        c.vz = THREE.MathUtils.damp(c.vz, targetVz, attracted ? 14 : 5, dt);

        const next = this.resolveBuildingCollision(c.x + c.vx * dt, c.z + c.vz * dt, 0.45);
        if (Math.abs(next.x - (c.x + c.vx * dt)) > 0.02 || Math.abs(next.z - (c.z + c.vz * dt)) > 0.02) {
          c.wanderAngle += Math.PI * 0.75;
        }
        c.x = next.x;
        c.z = next.z;

        if (Math.hypot(c.vx, c.vz) > 0.3) {
          c.yaw = Math.atan2(c.vx, c.vz);
          c.runPhase += dt * (attracted ? 16 : 6.5);
        }

        // Check recruitment by any active faction member (leader or follower)
        for (const f of this.factions) {
          if (!f.alive) continue;
          const leader = this.citizens[f.leaderIdx];
          if (!leader || !leader.active) continue;
          const recruitRadius =
            (f.powerUps.magnet > 0 ? 3.8 : 2.35) + Math.min(Math.sqrt(f.count) * 0.55, 4.5);
          const distToLeader = Math.hypot(c.x - leader.x, c.z - leader.z);
          if (distToLeader <= recruitRadius) {
            c.factionId = f.id;
            c.popTimer = 0.38;
            c.convertCooldown = 0.25;
            f.count++;
            if (f.isPlayer && this.phase === 'playing') {
              this.convertedTotal++;
              gameAudio.playRecruit(false);
            }
            this.spawnBurst(c.x, 0.9, c.z, f.colorNum, 5);
            break;
          }
        }
      } else {
        // Faction Follower flocking toward Leader
        const fac = this.factions[c.factionId];
        if (!fac || !fac.alive) {
          c.factionId = -1;
          continue;
        }
        const leader = this.citizens[fac.leaderIdx];
        if (!leader || !leader.active) {
          c.factionId = -1;
          continue;
        }

        // Desired formation offset around leader based on index hash
        const ringAngle = (i * 2.39996) % (Math.PI * 2);
        const ringDist = 1.2 + Math.sqrt((i % Math.max(1, fac.count)) + 1) * 0.92;
        const targetX = leader.x + Math.cos(ringAngle) * ringDist;
        const targetZ = leader.z + Math.sin(ringAngle) * ringDist;

        const dx = targetX - c.x;
        const dz = targetZ - c.z;
        const dist = Math.hypot(dx, dz);

        const maxSpd =
          (fac.powerUps.speed > 0 ? 19.5 : 13.8) * (fac.sprinting ? 1.35 : 1.0);
        const desiredSpeed = Math.min(maxSpd, dist * 4.8);
        const tvx = dist > 0.08 ? (dx / dist) * desiredSpeed : 0;
        const tvz = dist > 0.08 ? (dz / dist) * desiredSpeed : 0;

        c.vx = THREE.MathUtils.damp(c.vx, tvx, 11, dt);
        c.vz = THREE.MathUtils.damp(c.vz, tvz, 11, dt);

        const next = this.resolveBuildingCollision(c.x + c.vx * dt, c.z + c.vz * dt, 0.42);
        c.x = next.x;
        c.z = next.z;

        const spd = Math.hypot(c.vx, c.vz);
        if (spd > 0.6) {
          const tYaw = Math.atan2(c.vx, c.vz);
          const diff = Math.atan2(Math.sin(tYaw - c.yaw), Math.cos(tYaw - c.yaw));
          c.yaw += diff * Math.min(1, dt * 11);
          c.runPhase += dt * (8 + spd * 0.75);
        }
      }
    }

    // 2. Fast pairwise separation between active non-leader citizens in same area
    for (let i = 0; i < MAX_CITIZENS; i++) {
      const a = this.citizens[i];
      if (!a.active || a.isLeader) continue;
      for (let j = i + 1; j < MAX_CITIZENS; j++) {
        const b = this.citizens[j];
        if (!b.active || b.isLeader) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const distSq = dx * dx + dz * dz;
        const minDist = 0.78;
        if (distSq > 0.0001 && distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq);
          const overlap = (minDist - dist) * 0.45;
          const nx = dx / dist;
          const nz = dz / dist;
          a.x -= nx * overlap;
          a.z -= nz * overlap;
          b.x += nx * overlap;
          b.z += nz * overlap;
        }
      }
    }
  }

  private updateSkirmishes(dt: number) {
    // Check faction-vs-faction leader & swarm overlaps
    for (let i = 0; i < this.factions.length; i++) {
      const fa = this.factions[i];
      if (!fa.alive) continue;
      const la = this.citizens[fa.leaderIdx];
      if (!la || !la.active) continue;

      for (let j = i + 1; j < this.factions.length; j++) {
        const fb = this.factions[j];
        if (!fb.alive) continue;
        const lb = this.citizens[fb.leaderIdx];
        if (!lb || !lb.active) continue;

        const dx = lb.x - la.x;
        const dz = lb.z - la.z;
        const dist = Math.hypot(dx, dz);
        const swarmReachA = 1.6 + Math.sqrt(fa.count) * 0.75;
        const swarmReachB = 1.6 + Math.sqrt(fb.count) * 0.75;
        const engageDist = swarmReachA + swarmReachB;

        if (dist > engageDist) continue;

        // Determine winner & loser
        if (fa.count === fb.count) continue;
        const winner = fa.count > fb.count ? fa : fb;
        const loser = fa.count > fb.count ? fb : fa;
        const winLeader = this.citizens[winner.leaderIdx];
        const loseLeader = this.citizens[loser.leaderIdx];

        // Shield check!
        if (loser.powerUps.shield > 0) {
          // Bounce winner back softly
          const pushDx = winLeader.x - loseLeader.x;
          const pushDz = winLeader.z - loseLeader.z;
          const pLen = Math.max(0.01, Math.hypot(pushDx, pushDz));
          winLeader.vx = (pushDx / pLen) * 18;
          winLeader.vz = (pushDz / pLen) * 18;
          if (loser.isPlayer || winner.isPlayer) {
            gameAudio.playShieldBlock();
            this.spawnShockwave(loseLeader.x, loseLeader.z, 4.5, POWER_UP_CONFIG.shield.hex);
          }
          continue;
        }

        // Convert loser followers overlapping winner's swarm
        const winReachSq = (swarmReachA + 1.4) ** 2;
        for (let k = 0; k < MAX_CITIZENS; k++) {
          const c = this.citizens[k];
          if (!c.active || c.factionId !== loser.id || c.isLeader || c.convertCooldown > 0) {
            continue;
          }
          const dSq = (c.x - winLeader.x) ** 2 + (c.z - winLeader.z) ** 2;
          if (dSq <= winReachSq) {
            c.factionId = winner.id;
            c.popTimer = 0.35;
            c.convertCooldown = 0.2;
            winner.count++;
            loser.count = Math.max(0, loser.count - 1);
            this.spawnBurst(c.x, 0.9, c.z, winner.colorNum, 6);
            if (winner.isPlayer && this.phase === 'playing') {
              this.convertedTotal++;
              gameAudio.playRecruit(true);
            }
          }
        }

        // Leader Elimination check
        const leaderDist = Math.hypot(winLeader.x - loseLeader.x, winLeader.z - loseLeader.z);
        if (leaderDist < 2.5 + Math.sqrt(winner.count) * 0.25 && winner.count > loser.count) {
          // Eliminate loser faction!
          loser.alive = false;
          loser.auraRing.visible = false;
          loser.magnetRing.visible = false;
          loser.shieldDome.visible = false;

          // Convert all remaining loser units to winner
          let converted = 0;
          for (let k = 0; k < MAX_CITIZENS; k++) {
            const c = this.citizens[k];
            if (c.active && c.factionId === loser.id) {
              c.factionId = winner.id;
              c.isLeader = false;
              c.popTimer = 0.45;
              converted++;
            }
          }
          winner.count += converted;
          loser.count = 0;

          this.spawnBurst(loseLeader.x, 1.2, loseLeader.z, winner.colorNum, 24);
          this.spawnShockwave(loseLeader.x, loseLeader.z, 9.0, winner.colorNum);

          if (this.phase === 'playing') {
            if (winner.isPlayer) {
              this.absorbedRivals++;
              this.convertedTotal += converted;
              this.hitstopTimer = 0.048;
              this.shakeIntensity = 0.48;
              gameAudio.playElimination(true);
              this.addToast(
                `Absorbed ${loser.name}! +${converted}`,
                winner.colorHex,
                'elimination',
              );
            } else if (loser.isPlayer) {
              this.hitstopTimer = 0.06;
              this.shakeIntensity = 0.65;
              gameAudio.playElimination(false);
            }
          }
        }
      }
    }
    void dt;
  }

  private updateVfx(dt: number) {
    // Particles
    let pCount = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }
      p.vy -= 18 * dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.1, p.y + p.vy * dt);
      p.z += p.vz * dt;

      const t = 1 - p.life / p.maxLife;
      _vec3A.set(p.x, p.y, p.z);
      _euler.set(p.life * 6, p.life * 8, 0);
      _quat.setFromEuler(_euler);
      _scale.setScalar(p.scale * t);
      _mat4.compose(_vec3A, _quat, _scale);
      this.particleInst.setMatrixAt(pCount, _mat4);
      _color.setHex(p.colorNum);
      this.particleInst.setColorAt(pCount, _color);
      pCount++;
    }
    this.particleInst.count = pCount;
    this.particleInst.instanceMatrix.needsUpdate = true;
    if (this.particleInst.instanceColor) this.particleInst.instanceColor.needsUpdate = true;

    // Shockwaves
    for (const sw of this.shockwaves) {
      if (!sw.active) continue;
      sw.life += dt;
      if (sw.life >= sw.maxLife) {
        sw.active = false;
        sw.mesh.visible = false;
        continue;
      }
      const t = sw.life / sw.maxLife;
      const radius = THREE.MathUtils.lerp(0.8, sw.maxRadius, 1 - (1 - t) * (1 - t));
      sw.mesh.scale.setScalar(radius);
      (sw.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.78;
    }
  }

  private syncCitizenInstances() {
    let count = 0;
    let crownCount = 0;
    const nowSec = performance.now() * 0.001;

    for (let i = 0; i < MAX_CITIZENS; i++) {
      const c = this.citizens[i];
      if (!c.active) continue;

      const idx = count++;
      const spd = Math.hypot(c.vx, c.vz);
      const runAmp = Math.min(1, spd / 5);
      const bob = Math.abs(Math.sin(c.runPhase)) * 0.14 * runAmp;

      // Squash-and-stretch pop on recruitment
      let sXZ = c.isLeader ? 1.24 : 1.0;
      let sY = c.isLeader ? 1.24 : 1.0;
      if (c.popTimer > 0) {
        const pt = c.popTimer / 0.35;
        const bounce = Math.sin(pt * Math.PI) * 0.32;
        sY *= 1 + bounce;
        sXZ *= 1 - bounce * 0.4;
      }

      // 1. Contact Shadow
      _vec3A.set(c.x, 0.03, c.z);
      _quat.identity();
      _scale.setScalar(sXZ);
      _mat4.compose(_vec3A, _quat, _scale);
      this.shadowInst.setMatrixAt(idx, _mat4);

      // 2. Left & Right Striding Legs
      const legSwing = Math.sin(c.runPhase) * 0.55 * runAmp;
      const cosY = Math.cos(c.yaw);
      const sinY = Math.sin(c.yaw);
      const sideOffset = 0.13 * sXZ;

      // Left Leg
      _vec3A.set(c.x + cosY * sideOffset, 0.22 * sY + bob * 0.4, c.z - sinY * sideOffset);
      _euler.set(legSwing, c.yaw, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(sXZ, sY, sXZ);
      _mat4.compose(_vec3A, _quat, _scale);
      this.leftLegInst.setMatrixAt(idx, _mat4);

      // Right Leg
      _vec3A.set(c.x - cosY * sideOffset, 0.22 * sY + bob * 0.4, c.z + sinY * sideOffset);
      _euler.set(-legSwing, c.yaw, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _mat4.compose(_vec3A, _quat, _scale);
      this.rightLegInst.setMatrixAt(idx, _mat4);

      // 3. Torso (slight forward lean when running)
      const lean = runAmp * 0.16;
      _vec3A.set(c.x, 0.72 * sY + bob, c.z);
      _euler.set(lean, c.yaw, 0, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(sXZ, sY, sXZ);
      _mat4.compose(_vec3A, _quat, _scale);
      this.torsoInst.setMatrixAt(idx, _mat4);

      if (c.factionId === -1) {
        _color.setHex(0xe2e8f0); // Crisp neutral slate-white jacket
      } else {
        _color.setHex(this.factions[c.factionId]?.colorNum ?? 0xffffff);
      }
      this.torsoInst.setColorAt(idx, _color);

      // 4. Head
      _vec3A.set(c.x + sinY * lean * 0.4, 1.32 * sY + bob, c.z + cosY * lean * 0.4);
      _euler.set(0, c.yaw, 0);
      _quat.setFromEuler(_euler);
      _scale.setScalar(sXZ);
      _mat4.compose(_vec3A, _quat, _scale);
      this.headInst.setMatrixAt(idx, _mat4);

      // 5. Leader Floating Beacon Crown
      if (c.isLeader && crownCount < 16) {
        _vec3A.set(c.x, 2.05 + Math.sin(nowSec * 4 + c.factionId) * 0.12, c.z);
        _euler.set(0, nowSec * 2.5, 0);
        _quat.setFromEuler(_euler);
        _scale.setScalar(1.0);
        _mat4.compose(_vec3A, _quat, _scale);
        this.crownInst.setMatrixAt(crownCount++, _mat4);
      }
    }

    this.shadowInst.count = count;
    this.leftLegInst.count = count;
    this.rightLegInst.count = count;
    this.torsoInst.count = count;
    this.headInst.count = count;
    this.crownInst.count = crownCount;

    this.shadowInst.instanceMatrix.needsUpdate = true;
    this.leftLegInst.instanceMatrix.needsUpdate = true;
    this.rightLegInst.instanceMatrix.needsUpdate = true;
    this.torsoInst.instanceMatrix.needsUpdate = true;
    if (this.torsoInst.instanceColor) this.torsoInst.instanceColor.needsUpdate = true;
    this.headInst.instanceMatrix.needsUpdate = true;
    this.crownInst.instanceMatrix.needsUpdate = true;
  }

  private updateCamera(dt: number) {
    if (this.phase === 'title') {
      // Smooth live-world orbital pan over the bustling city!
      this.titleOrbitAngle += dt * 0.14;
      const radius = 56;
      const targetX = Math.cos(this.titleOrbitAngle) * radius;
      const targetZ = Math.sin(this.titleOrbitAngle) * radius;
      this.camPos.x = THREE.MathUtils.damp(this.camPos.x, targetX, 3.5, dt);
      this.camPos.y = THREE.MathUtils.damp(this.camPos.y, 40, 3.5, dt);
      this.camPos.z = THREE.MathUtils.damp(this.camPos.z, targetZ, 3.5, dt);
      this.camLook.x = THREE.MathUtils.damp(this.camLook.x, -8, 3.5, dt);
      this.camLook.y = 0;
      this.camLook.z = THREE.MathUtils.damp(this.camLook.z, -6, 3.5, dt);
    } else {
      const pf = this.factions[0];
      if (pf && pf.alive) {
        const leader = this.citizens[pf.leaderIdx];
        if (leader && leader.active) {
          // Pull camera back smoothly as crowd grows
          const crowdZoom = Math.min(24, Math.sqrt(Math.max(1, pf.count)) * 2.15);
          const height = 25 + crowdZoom * 0.92;
          const backZ = 21 + crowdZoom * 0.78;

          this.camLook.x = THREE.MathUtils.damp(this.camLook.x, leader.x, 8, dt);
          this.camLook.z = THREE.MathUtils.damp(this.camLook.z, leader.z, 8, dt);

          this.camPos.x = THREE.MathUtils.damp(this.camPos.x, leader.x, 7, dt);
          this.camPos.y = THREE.MathUtils.damp(this.camPos.y, height, 4.5, dt);
          this.camPos.z = THREE.MathUtils.damp(this.camPos.z, leader.z + backZ, 7, dt);

          // Speed FOV kick
          const targetFov = pf.powerUps.speed > 0 ? 53 : pf.sprinting ? 50 : 46;
          this.currentFov = THREE.MathUtils.damp(this.currentFov, targetFov, 7, dt);
          if (Math.abs(this.camera.fov - this.currentFov) > 0.05) {
            this.camera.fov = this.currentFov;
            this.camera.updateProjectionMatrix();
          }

          // Keep directional shadow frustum centered near player
          this.sunLight.position.set(this.camLook.x + 42, 68, this.camLook.z + 36);
          this.sunLight.target.position.set(this.camLook.x, 0, this.camLook.z);
          this.sunLight.target.updateMatrixWorld();
        }
      }
    }

    // Apply decaying camera shake
    let shakeX = 0;
    let shakeY = 0;
    if (this.shakeIntensity > 0.005) {
      shakeX = (Math.random() - 0.5) * this.shakeIntensity;
      shakeY = (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity = THREE.MathUtils.damp(this.shakeIntensity, 0, 12, dt);
    } else {
      this.shakeIntensity = 0;
    }

    this.camera.position.set(this.camPos.x + shakeX, this.camPos.y + shakeY, this.camPos.z);
    this.camera.lookAt(this.camLook.x, 0, this.camLook.z);
  }

  private buildLeaderboard(): LeaderboardEntry[] {
    return this.factions
      .map((f) => ({
        id: f.id,
        name: f.name,
        color: f.colorHex,
        count: f.alive ? f.count : 0,
        isPlayer: f.isPlayer,
        alive: f.alive,
      }))
      .sort((a, b) => {
        if (a.alive !== b.alive) return a.alive ? -1 : 1;
        if (b.count !== a.count) return b.count - a.count;
        return a.isPlayer ? -1 : 1;
      });
  }

  private finishMatchByTimer() {
    const lb = this.buildLeaderboard();
    const top = lb[0];
    const playerWon = top?.isPlayer ?? false;
    this.triggerMatchEnd(
      playerWon,
      playerWon ? 'time_up_winner' : 'time_up_outnumbered',
    );
  }

  private triggerMatchEnd(won: boolean, reason: MatchResult['reason']) {
    this.phase = won ? 'victory' : 'gameover';
    this.heldKeys.clear();
    this.pointerActive = false;
    this.sprintRequested = false;

    gameAudio.playMatchEnd(won);

    const lb = this.buildLeaderboard();
    const playerIdx = lb.findIndex((e) => e.isPlayer);
    const pf = this.factions[0];

    this.callbacks.onMatchEnd({
      won,
      reason,
      playerCount: pf ? pf.count : 0,
      peakCount: pf ? pf.peakCount : 0,
      absorbedRivals: this.absorbedRivals,
      convertedTotal: this.convertedTotal,
      powerUpsCollected: this.powerUpsCollected,
      rank: playerIdx >= 0 ? playerIdx + 1 : lb.length,
      totalFactions: lb.length,
      timeSurvived: Math.round(this.elapsedMatchTime),
      leaderboard: lb,
    });
  }

  public getMinimapBlocks(): MinimapBlock[] {
    const span = ARENA_HALF_SIZE * 2;
    return this.colliders.map((b) => {
      const w = (b.maxX - b.minX) / span;
      const h = (b.maxZ - b.minZ) / span;
      const x = (b.minX + ARENA_HALF_SIZE) / span;
      const y = (b.minZ + ARENA_HALF_SIZE) / span;
      const isFountain = Math.abs(b.cx + 16.5) < 1 && Math.abs(b.cz + 16.5) < 1;
      return { x, y, w, h, isFountain };
    });
  }

  private pushHudSnapshot() {
    const pf = this.factions[0];
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const span = ARENA_HALF_SIZE * 2;

    const activePowerUps: ActivePowerUp[] = [];
    if (pf) {
      (['speed', 'magnet', 'shield'] as PowerUpType[]).forEach((t) => {
        if (pf.powerUps[t] > 0) {
          activePowerUps.push({
            type: t,
            remaining: pf.powerUps[t],
            duration: POWER_UP_CONFIG[t].duration,
          });
        }
      });
    }

    const badges: ScreenBadge[] = [];
    const minimapFactions: MinimapFactionBlip[] = [];
    const playerCount = pf ? pf.count : 0;
    const playerLeader = pf && pf.alive ? this.citizens[pf.leaderIdx] : null;
    const px = playerLeader ? playerLeader.x : 0;
    const pz = playerLeader ? playerLeader.z : 0;

    for (const f of this.factions) {
      if (!f.alive) continue;
      const leader = this.citizens[f.leaderIdx];
      if (!leader || !leader.active) continue;

      _projVec.set(leader.x, 2.75, leader.z);
      _projVec.project(this.camera);

      // Behind camera check
      const isBehind = _projVec.z > 1;
      let sx = ((_projVec.x + 1) / 2) * w;
      let sy = ((-_projVec.y + 1) / 2) * h;

      if (isBehind) {
        sx = w - sx;
        sy = h - 40;
      }

      const margin = 44;
      const onScreen = !isBehind && sx >= margin && sx <= w - margin && sy >= margin && sy <= h - margin;

      const clampedX = THREE.MathUtils.clamp(sx, margin, w - margin);
      const clampedY = THREE.MathUtils.clamp(sy, 72, h - 56);

      let threatRelation: ScreenBadge['threatRelation'] = 'player';
      if (!f.isPlayer) {
        if (f.count > playerCount + 1) threatRelation = 'stronger';
        else if (f.count < playerCount) threatRelation = 'weaker';
        else threatRelation = 'even';
      }

      badges.push({
        id: f.id,
        name: f.name,
        color: f.colorHex,
        count: f.count,
        isPlayer: f.isPlayer,
        x: clampedX,
        y: clampedY,
        visible: true,
        onScreen,
        hasShield: f.powerUps.shield > 0,
        hasMagnet: f.powerUps.magnet > 0,
        hasSpeed: f.powerUps.speed > 0,
        threatRelation,
      });

      const distToPlayer = f.isPlayer ? 0 : Math.hypot(leader.x - px, leader.z - pz);
      minimapFactions.push({
        id: f.id,
        name: f.name,
        color: f.colorHex,
        x: THREE.MathUtils.clamp((leader.x + ARENA_HALF_SIZE) / span, 0.02, 0.98),
        y: THREE.MathUtils.clamp((leader.z + ARENA_HALF_SIZE) / span, 0.02, 0.98),
        yaw: leader.yaw,
        count: f.count,
        isPlayer: f.isPlayer,
        threatRelation,
        isNearby: !f.isPlayer && distToPlayer <= 42,
      });
    }

    const minimapPowerUps: MinimapPowerUpBlip[] = [];
    for (const pu of this.powerUpEntities) {
      if (!pu.active) continue;
      minimapPowerUps.push({
        id: pu.id,
        x: THREE.MathUtils.clamp((pu.x + ARENA_HALF_SIZE) / span, 0.02, 0.98),
        y: THREE.MathUtils.clamp((pu.z + ARENA_HALF_SIZE) / span, 0.02, 0.98),
        color: POWER_UP_CONFIG[pu.type].color,
        type: pu.type,
      });
    }

    const powerUpsOnMap = minimapPowerUps.length;

    this.callbacks.onHudUpdate({
      timeRemaining: this.timeRemaining,
      isRushHour: this.timeRemaining <= 30,
      playerCount,
      peakCount: pf ? pf.peakCount : 0,
      stamina: pf ? pf.stamina : 1,
      sprinting: pf ? pf.sprinting : false,
      activePowerUps,
      leaderboard: this.buildLeaderboard(),
      badges,
      toasts: this.toasts.map((t) => t.toast),
      powerUpsOnMap,
      minimapFactions,
      minimapPowerUps,
    });
  }

  private tick = () => {
    if (this.disposed) return;

    const now = performance.now();
    const rawDt = (now - this.lastFrameMs) / 1000;
    this.lastFrameMs = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    if (this.phase === 'playing' || this.phase === 'title') {
      this.stepSimulation(dt);
      this.syncCitizenInstances();
      this.updateCamera(dt);

      // Gentle harbor water shimmer
      this.city.waterMesh.position.y = -0.75 + Math.sin(now * 0.0012) * 0.05;
    }

    this.renderer.render(this.scene, this.camera);

    if (this.phase === 'playing') {
      this.hudSyncTimer += dt;
      if (this.hudSyncTimer >= 0.045) {
        this.hudSyncTimer = 0;
        this.pushHudSnapshot();
      }
    }

    this.scheduleNextFrame();
  };

  private scheduleNextFrame() {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.unbindEvents();

    // Dispose city & extra geometries/materials/textures
    this.city.disposables.geometries.forEach((g) => g.dispose());
    this.city.disposables.materials.forEach((m) => m.dispose());
    this.city.disposables.textures.forEach((t) => t.dispose());
    this.extraDisposables.geometries.forEach((g) => g.dispose());
    this.extraDisposables.materials.forEach((m) => m.dispose());

    if (this.scene.environment) {
      this.scene.environment.dispose();
    }

    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
