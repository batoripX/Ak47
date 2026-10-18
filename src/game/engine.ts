import {
  Engine,
  WebGPUEngine,
  Scene,
  Vector3,
  Color3,
  Color4,
  HemisphericLight,
  DirectionalLight,
  Ray,
  Mesh
} from '@babylonjs/core';
import { MilitaryCompound, WorldObjects, ReactiveTarget } from './world';
import { PlayerController, AnatomicalStatus } from './player';
import { TacticalBot } from './ai';
import { TacticalInstructor, DialogueNode } from './instructor';
import { soundEngine } from './audio';
import { ObjectPoolManager } from './pool';

export interface GameUIState {
  anatomy: AnatomicalStatus;
  stamina: number;
  medkitsCount: number;
  isHealing: boolean;
  healProgress: number;
  ammoInMag: number;
  ammoReserve: number;
  fireMode: 'AUTO' | 'SEMI';
  isReloading: boolean;
  isADS: boolean;
  score: number;
  kills: number;
  targetsHit: number;
  activeDrill: string;
  compassAngle: number;
  hitmarkerActive: boolean;
  hitmarkerHeadshot: boolean;
  damageAngle: number | null;
  interactionPrompt: string | null;
  instructorDialogue: DialogueNode | null;
  isWebGPU: boolean;
  enemyCount: number;
  isSafeZone: boolean;
}

export class TacticalGameEngine {
  private canvas: HTMLCanvasElement;
  private engine!: WebGPUEngine | Engine;
  public scene!: Scene;
  public player!: PlayerController;
  public world!: WorldObjects;
  public instructor!: TacticalInstructor;
  public bots: TacticalBot[] = [];
  public poolManager!: ObjectPoolManager;

  public isWebGPU: boolean = false;
  public isPaused: boolean = false;
  public isInDialogue: boolean = false;
  public activeDrill: string = 'Free Practice';

  // UI state
  private hitmarkerTimer: number = 0;
  private hitmarkerHeadshot: boolean = false;
  private onUIUpdateCallback?: (state: GameUIState) => void;
  private currentDialogue: DialogueNode | null = null;
  private interactionPrompt: string | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  public async initialize(): Promise<void> {
    // 1. WebGPU Engine with automatic fallback to WebGL2
    if (await WebGPUEngine.IsSupportedAsync) {
      try {
        const gpuEngine = new WebGPUEngine(this.canvas, {
          antialias: true,
          powerPreference: 'high-performance',
          audioEngine: false
        });
        await gpuEngine.initAsync();
        this.engine = gpuEngine;
        this.isWebGPU = true;
      } catch (err) {
        console.warn('WebGPU init failed, using WebGL2 engine:', err);
        this.engine = new Engine(this.canvas, true);
        this.isWebGPU = false;
      }
    } else {
      this.engine = new Engine(this.canvas, true);
      this.isWebGPU = false;
    }

    // 2. Scene setup
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.55, 0.68, 0.82, 1.0);
    this.scene.collisionsEnabled = true;

    this.scene.fogMode = Scene.FOGMODE_EXP2;
    this.scene.fogDensity = 0.005;
    this.scene.fogColor = new Color3(0.68, 0.74, 0.78);

    // 3. Natural Lighting
    const hemiLight = new HemisphericLight('sky_light', new Vector3(0, 1, 0), this.scene);
    hemiLight.diffuse = new Color3(0.92, 0.90, 0.84);
    hemiLight.groundColor = new Color3(0.35, 0.32, 0.28);
    hemiLight.intensity = 0.8;

    const sunLight = new DirectionalLight('sun_light', new Vector3(-0.6, -1.2, 0.8), this.scene);
    sunLight.position = new Vector3(30, 60, -40);
    sunLight.diffuse = new Color3(1.0, 0.95, 0.88);
    sunLight.intensity = 1.15;

    // 4. Object Pool Manager
    this.poolManager = new ObjectPoolManager(this.scene);

    // 5. Construct Military Compound
    const compoundBuilder = new MilitaryCompound(this.scene, this.poolManager);
    this.world = compoundBuilder.build();

    // 6. Spawn Player at Staging Armory (Safe Zone)
    const spawnPos = new Vector3(0, 0, -30);
    this.player = new PlayerController(this.scene, this.canvas, spawnPos, this.poolManager);

    // 7. Spawn Instructor Sgt. Vance at Armory Counter
    this.instructor = new TacticalInstructor(this.scene, new Vector3(0, 0, -24.5));

    // 8. Initial Enemies inside the Killhouse (outside safe zone)
    this.spawnCompoundEnemies();

    // 9. Key Interaction
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE') {
        this.handleInteraction();
      }
    });

    // 10. Resize & Render Loop
    window.addEventListener('resize', () => {
      this.engine.resize();
    });

    this.engine.runRenderLoop(() => {
      this.renderTick();
    });
  }

  public setUIUpdateCallback(cb: (state: GameUIState) => void) {
    this.onUIUpdateCallback = cb;
  }

  public spawnCompoundEnemies(count: number = 4) {
    this.bots.forEach((b) => b.dispose());
    this.bots = [];

    // All enemy spawn points are strictly inside the combat zone (Z >= 0)
    const spawnPoints = [
      { pos: new Vector3(18, 0, 8), waypoints: [new Vector3(18, 0, 8), new Vector3(25, 0, 18), new Vector3(16, 0, 2)] },
      { pos: new Vector3(28, 0, 20), waypoints: [new Vector3(28, 0, 20), new Vector3(35, 0, 12), new Vector3(22, 0, 26)] },
      { pos: new Vector3(12, 0, 26), waypoints: [new Vector3(12, 0, 26), new Vector3(18, 0, 32), new Vector3(8, 0, 18)] },
      { pos: new Vector3(34, 0, 28), waypoints: [new Vector3(34, 0, 28), new Vector3(40, 0, 36), new Vector3(30, 0, 18)] }
    ];

    for (let i = 0; i < Math.min(count, spawnPoints.length); i++) {
      const sp = spawnPoints[i];
      const bot = new TacticalBot(this.scene, `bot_${i}`, sp.pos, sp.waypoints);
      this.bots.push(bot);
    }
  }

  public handleInteraction() {
    if (!this.player.stats.isAlive) return;

    // Check near instructor
    if (this.instructor.isNearPlayer) {
      if (this.currentDialogue) {
        this.dismissDialogue();
      } else {
        this.openDialogue();
      }
      return;
    }

    // Check near ammo crates
    for (const crate of this.world.ammoCrates) {
      if (Vector3.Distance(this.player.camera.position, crate.position) < 3.2) {
        this.player.weapon.addReserveAmmo(60);
        soundEngine.playPickup();
        return;
      }
    }

    // Check near medkits
    for (const med of this.world.medkits) {
      if (Vector3.Distance(this.player.camera.position, med.position) < 3.2) {
        this.player.stats.medkitsCount = Math.min(4, this.player.stats.medkitsCount + 1);
        soundEngine.playPickup();
        return;
      }
    }
  }

  public openDialogue() {
    this.isInDialogue = true;
    try {
      document.exitPointerLock();
    } catch {}
    this.currentDialogue = this.instructor.getDialogue(
      (mode) => this.selectDrill(mode),
      () => this.restockPlayer(),
      () => this.dismissDialogue()
    );
  }

  public dismissDialogue() {
    this.isInDialogue = false;
    this.currentDialogue = null;
    try {
      this.canvas.requestPointerLock();
    } catch {}
  }

  public selectDrill(mode: 'RANGE' | 'CQB' | 'SURVIVAL') {
    this.isPaused = false;
    this.isInDialogue = false;
    this.currentDialogue = null;

    if (mode === 'RANGE') {
      this.activeDrill = '100m Steel Range';
      this.world.targets.forEach((t) => t.reset());
      this.player.camera.position.set(-25, 1.72, -14);
      this.player.camera.rotation.set(0, 0, 0);
    } else if (mode === 'CQB') {
      this.activeDrill = 'CQB Killhouse Sweep';
      this.spawnCompoundEnemies(3);
      this.player.camera.position.set(10, 1.72, -8);
      this.player.camera.rotation.set(0, 0, 0);
    } else if (mode === 'SURVIVAL') {
      this.activeDrill = 'Hostile Wave Defense';
      this.spawnCompoundEnemies(4);
      this.player.camera.position.set(0, 1.72, -12);
      this.player.camera.rotation.set(0, 0, 0);
    }

    soundEngine.playBoltRack();
    setTimeout(() => {
      try {
        this.canvas.requestPointerLock();
      } catch {}
    }, 50);
  }

  public restockPlayer() {
    this.isPaused = false;
    this.isInDialogue = false;
    this.currentDialogue = null;
    this.player.weapon.state.ammoInMag = 30;
    this.player.weapon.state.ammoReserve = 120;
    this.player.restockFullKit();
    soundEngine.playPickup();
    setTimeout(() => {
      try {
        this.canvas.requestPointerLock();
      } catch {}
    }, 50);
  }

  private renderTick() {
    if (this.isPaused) {
      this.scene.render();
      return;
    }

    const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.1);

    // Update Object Pool Manager (Casings & Decals)
    this.poolManager.update(dt);

    // Update Player & Weapon
    this.player.update(dt, (ray) => this.onPlayerFiredRay(ray));

    // Update Instructor
    this.instructor.update(this.player.camera.position, dt, (isNear) => {
      if (isNear) {
        this.interactionPrompt = '[E] Speak with Sgt. Vance';
      } else if (this.interactionPrompt?.includes('Vance')) {
        this.interactionPrompt = null;
      }
    });

    // Interaction prompts for ammo / medkits
    if (!this.instructor.isNearPlayer) {
      let foundPrompt = false;
      for (const crate of this.world.ammoCrates) {
        if (Vector3.Distance(this.player.camera.position, crate.position) < 3.2) {
          this.interactionPrompt = '[E] Restock 7.62mm Ammo';
          foundPrompt = true;
          break;
        }
      }
      if (!foundPrompt) {
        for (const med of this.world.medkits) {
          if (Vector3.Distance(this.player.camera.position, med.position) < 3.2) {
            this.interactionPrompt = '[E] Pickup IFAK Field Medkit';
            foundPrompt = true;
            break;
          }
        }
      }
      if (!foundPrompt) {
        this.interactionPrompt = null;
      }
    }

    // Safe Zone Check: Player is safe if Z < safeZoneZ (-15.0)
    const isPlayerInSafeZone = this.player.camera.position.z < this.world.safeZoneZ;

    // Update Tactical AI Bots (Respecting Safe Zone)
    const playerPos = this.player.camera.position;
    const livingBots = this.bots.filter((b) => !b.isDead);

    this.bots.forEach((bot) => {
      bot.update(
        dt,
        playerPos,
        isPlayerInSafeZone,
        this.world.coverNodes,
        this.world.colliders,
        (botPos) => this.onBotFiredAtPlayer(botPos, bot)
      );
    });

    // Hitmarker timer
    if (this.hitmarkerTimer > 0) {
      this.hitmarkerTimer -= dt;
    }

    // Sync UI State
    if (this.onUIUpdateCallback) {
      let heading = (this.player.camera.rotation.y * 180) / Math.PI;
      while (heading < 0) heading += 360;
      heading = heading % 360;

      this.onUIUpdateCallback({
        anatomy: this.player.stats.anatomy,
        stamina: Math.round(this.player.stats.stamina),
        medkitsCount: this.player.stats.medkitsCount,
        isHealing: this.player.stats.isHealing,
        healProgress: this.player.stats.healProgress,
        ammoInMag: this.player.weapon.state.ammoInMag,
        ammoReserve: this.player.weapon.state.ammoReserve,
        fireMode: this.player.weapon.state.fireMode,
        isReloading: this.player.weapon.state.isReloading,
        isADS: this.player.weapon.state.isADS,
        score: this.player.stats.score,
        kills: this.player.stats.kills,
        targetsHit: this.player.stats.targetsHit,
        activeDrill: this.activeDrill,
        compassAngle: Math.round(heading),
        hitmarkerActive: this.hitmarkerTimer > 0,
        hitmarkerHeadshot: this.hitmarkerHeadshot,
        damageAngle: this.player.lastDamageAngle,
        interactionPrompt: this.interactionPrompt,
        instructorDialogue: this.currentDialogue,
        isWebGPU: this.isWebGPU,
        enemyCount: livingBots.length,
        isSafeZone: isPlayerInSafeZone
      });
    }

    this.scene.render();
  }

  private onPlayerFiredRay(ray: Ray) {
    const isSafeZone = this.player.camera.position.z < this.world.safeZoneZ;
    this.bots.forEach((b) => b.onHearGunshot(this.player.camera.position, isSafeZone));

    let hitBot = false;
    for (const bot of this.bots) {
      if (bot.isDead) continue;

      const headHit = ray.intersectsMesh(bot.character.head, false);
      if (headHit.hit && headHit.distance < ray.length) {
        const killed = bot.takeDamage(55, 'head', this.player.camera.position);
        hitBot = true;
        this.hitmarkerTimer = 0.25;
        this.hitmarkerHeadshot = true;
        soundEngine.playHitmarker(true);
        if (killed) {
          this.player.stats.kills++;
          this.player.stats.score += 200;
        }
        break;
      }

      const torsoHit = ray.intersectsMesh(bot.character.torso, false);
      if (torsoHit.hit && torsoHit.distance < ray.length) {
        const killed = bot.takeDamage(35, 'body', this.player.camera.position);
        hitBot = true;
        this.hitmarkerTimer = 0.22;
        this.hitmarkerHeadshot = false;
        soundEngine.playHitmarker(false);
        if (killed) {
          this.player.stats.kills++;
          this.player.stats.score += 100;
        }
        break;
      }
    }

    if (hitBot) return;

    for (const t of this.world.targets) {
      if (t.isDown) continue;
      const hit = ray.intersectsMesh(t.plate, false);
      if (hit.hit && hit.distance < ray.length) {
        t.hit();
        this.player.stats.targetsHit++;
        this.player.stats.score += Math.round(t.distance * 1.5);
        this.hitmarkerTimer = 0.22;
        this.hitmarkerHeadshot = false;
        soundEngine.playHitmarker(false);
        return;
      }
    }

    // Check compound geometry & walls -> spawn pooled impact mark
    const pickResult = this.scene.pickWithRay(ray, (m) => this.world.colliders.includes(m as Mesh));
    if (pickResult && pickResult.hit && pickResult.pickedPoint) {
      const normal = pickResult.getNormal(true) || Vector3.Up();
      this.poolManager.spawnImpact(pickResult.pickedPoint, normal);
    }
  }

  private onBotFiredAtPlayer(botPos: Vector3, bot: TacticalBot) {
    if (!this.player.stats.isAlive) return;

    // Absolute safe zone immunity
    if (this.player.camera.position.z < this.world.safeZoneZ) return;

    const dist = Vector3.Distance(botPos, this.player.camera.position);
    let hitChance = 0.35;
    if (this.player.isSprinting) hitChance -= 0.15;
    if (this.player.isCrouching) hitChance -= 0.10;
    if (dist > 30) hitChance -= 0.18;

    if (Math.random() < Math.max(0.08, hitChance)) {
      const damage = Math.round(12 + Math.random() * 8);
      this.player.takeDamage(damage, botPos);
    }
  }

  public dispose() {
    this.poolManager.dispose();
    this.engine.dispose();
  }
}
