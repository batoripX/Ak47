import {
  Scene,
  UniversalCamera,
  Vector3,
  Ray
} from '@babylonjs/core';
import { AK47Weapon } from './weapon';
import { soundEngine } from './audio';
import { ObjectPoolManager } from './pool';

export interface AnatomicalStatus {
  head: number;      // 0 - 100 (Critical)
  thorax: number;    // 0 - 100 (Vital chest)
  plateArmor: number;// 0 - 100 (NIJ Level III/IV Ballistic Plate)
  abdomen: number;   // 0 - 100 (Viscera)
  arms: number;      // 0 - 100 (Weapon handling)
  legs: number;      // 0 - 100 (Mobility)
  overallVitality: number; // 0 - 100
}

export interface PlayerStats {
  anatomy: AnatomicalStatus;
  stamina: number;
  maxStamina: number;
  medkitsCount: number;
  isHealing: boolean;
  healProgress: number; // 0 to 1
  isAlive: boolean;
  score: number;
  kills: number;
  targetsHit: number;
}

export class PlayerController {
  private scene: Scene;
  public camera: UniversalCamera;
  public weapon: AK47Weapon;

  // Stats
  public stats: PlayerStats = {
    anatomy: {
      head: 100,
      thorax: 100,
      plateArmor: 100,
      abdomen: 100,
      arms: 100,
      legs: 100,
      overallVitality: 100
    },
    stamina: 100,
    maxStamina: 100,
    medkitsCount: 2,
    isHealing: false,
    healProgress: 0,
    isAlive: true,
    score: 0,
    kills: 0,
    targetsHit: 0
  };

  // Responsive Tactical Movement
  private moveSpeed: number = 4.2;        // Responsive, fluid shooter movement speed
  private sprintMultiplier: number = 1.6;  // Fast tactical sprint
  private crouchMultiplier: number = 0.55; // Crouch sneak
  private jumpVelocity: number = 3.2;     // Realistic 0.6m obstacle hop
  private gravity: number = -16.0;        // Heavy grounded gravity
  private verticalVelocity: number = 0;
  private isGrounded: boolean = true;

  // Camera Heights
  private standHeight: number = 1.72;
  private crouchHeight: number = 1.05;
  private currentCameraHeight: number = 1.72;
  private walkStepCycle: number = 0;

  // Input states
  public keys: { [key: string]: boolean } = {};
  public isSprinting: boolean = false;
  public isCrouching: boolean = false;
  public isFiring: boolean = false;
  public isAiming: boolean = false;

  // Settings
  public mouseSensitivity: number = 0.0020;
  public touchSensitivity: number = 0.0032;
  public invertY: boolean = false;

  // Touch Input State for Samsung Galaxy Tab S8 & Mobile
  public touchMoveVector: { x: number; z: number } = { x: 0, z: 0 };
  public touchSprintRequested: boolean = false;

  // Camera Recoil Spring Damper (Recovers back to zero automatically)
  private cameraRecoilSpring: number = 0;
  private stepTimer: number = 0;
  private healDuration: number = 2.0; // 2 seconds to apply IFAK medkit

  // Damage indicators
  public lastDamageAngle: number | null = null;
  public damageFlashTimer: number = 0;

  public rotateCamera(deltaX: number, deltaY: number) {
    this.camera.rotation.y += deltaX * this.touchSensitivity;
    this.camera.rotation.x = Math.max(
      -Math.PI / 2.2,
      Math.min(Math.PI / 2.2, this.camera.rotation.x + deltaY * this.touchSensitivity * (this.invertY ? -1 : 1))
    );
  }

  public jump() {
    if (this.isGrounded && !this.isCrouching) {
      this.verticalVelocity = this.jumpVelocity;
      this.isGrounded = false;
    }
  }

  public toggleCrouch() {
    this.isCrouching = !this.isCrouching;
  }

  public toggleADS() {
    this.isAiming = !this.isAiming;
    this.weapon.setADS(this.isAiming);
  }

  constructor(scene: Scene, canvas: HTMLCanvasElement, spawnPos: Vector3, poolManager: ObjectPoolManager) {
    this.scene = scene;

    // First person camera (minZ = 0.02 to prevent ANY viewmodel arm clipping)
    this.camera = new UniversalCamera('player_camera', spawnPos.add(new Vector3(0, this.standHeight, 0)), scene);
    this.camera.minZ = 0.02;
    this.camera.maxZ = 200;
    this.camera.fov = 1.1; // ~63 deg vertical FOV
    this.camera.checkCollisions = true;
    this.camera.ellipsoid = new Vector3(0.4, 0.85, 0.4);
    this.camera.inertia = 0; // ZERO inertia eliminates runaway acceleration and exponential speed buildup!
    this.camera.speed = 1.0;

    this.camera.inputs.clear();

    // AK-47 viewmodel with human arms and fingers
    this.weapon = new AK47Weapon(scene, this.camera, poolManager);

    this.setupInput(canvas);
  }

  private setupInput(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;

      if (e.code === 'KeyR') {
        this.weapon.reload();
      }
      if (e.code === 'KeyB') {
        this.weapon.toggleFireMode();
      }
      if (e.code === 'KeyC') {
        this.isCrouching = !this.isCrouching;
      }
      if (e.code === 'KeyG' || e.code === 'Digit4') {
        this.useMedkit();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    canvas.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== canvas) return;
      if (e.button === 0) {
        this.isFiring = true;
      } else if (e.button === 2) {
        this.isAiming = true;
        this.weapon.setADS(true);
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.isFiring = false;
      } else if (e.button === 2) {
        this.isAiming = false;
        this.weapon.setADS(false);
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;

      const deltaX = e.movementX * this.mouseSensitivity;
      const deltaY = e.movementY * this.mouseSensitivity * (this.invertY ? -1 : 1);

      this.camera.rotation.y += deltaX;
      this.camera.rotation.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, this.camera.rotation.x + deltaY));
    });
  }

  /**
   * Apply realistic soldier modular anatomical damage
   */
  public takeDamage(rawAmount: number, attackerPos: Vector3, hitPart?: 'head' | 'thorax' | 'abdomen' | 'arms' | 'legs') {
    if (!this.stats.isAlive) return;

    soundEngine.playPlayerHit();
    this.damageFlashTimer = 0.5;

    // Calculate angle for directional HUD indicator
    const forward = this.camera.getDirection(Vector3.Forward());
    forward.y = 0;
    forward.normalize();

    const toAttacker = attackerPos.subtract(this.camera.position);
    toAttacker.y = 0;
    toAttacker.normalize();

    const dot = Vector3.Dot(forward, toAttacker);
    const cross = forward.x * toAttacker.z - forward.z * toAttacker.x;
    const angleRad = Math.atan2(cross, dot);
    this.lastDamageAngle = (angleRad * 180) / Math.PI;

    // Determine hit part if not specified (random combat distribution: 55% thorax, 20% abdomen, 15% arms/legs, 10% head)
    const part = hitPart || (Math.random() < 0.1 ? 'head' : Math.random() < 0.65 ? 'thorax' : Math.random() < 0.85 ? 'abdomen' : Math.random() < 0.92 ? 'arms' : 'legs');

    const a = this.stats.anatomy;

    switch (part) {
      case 'head':
        // High damage to head
        a.head = Math.max(0, a.head - rawAmount * 1.8);
        break;

      case 'thorax':
        // Protected by NIJ Level III/IV Ballistic Plate!
        if (a.plateArmor > 0) {
          // Plate absorbs 85% of bullet energy
          const absorbed = rawAmount * 0.85;
          const bluntDamage = rawAmount * 0.15; // Blunt trauma bruising through plate
          a.plateArmor = Math.max(0, a.plateArmor - absorbed * 0.7);
          a.thorax = Math.max(0, a.thorax - bluntDamage);
        } else {
          // Plate broken, direct vital thorax damage
          a.thorax = Math.max(0, a.thorax - rawAmount);
        }
        break;

      case 'abdomen':
        a.abdomen = Math.max(0, a.abdomen - rawAmount * 0.8);
        break;

      case 'arms':
        a.arms = Math.max(0, a.arms - rawAmount * 0.6);
        // Arm hit causes slight weapon flinch
        this.weapon.state.recoilSpread = Math.min(0.04, this.weapon.state.recoilSpread + 0.015);
        break;

      case 'legs':
        a.legs = Math.max(0, a.legs - rawAmount * 0.6);
        // Leg hit temporarily drains stamina
        this.stats.stamina = Math.max(0, this.stats.stamina - 25);
        break;
    }

    // Update overall vitality score
    this.updateOverallVitality();

    if (a.head <= 0 || a.thorax <= 0 || a.abdomen <= 0 || a.overallVitality <= 0) {
      this.stats.isAlive = false;
      this.stats.anatomy.overallVitality = 0;
    }
  }

  private updateOverallVitality() {
    const a = this.stats.anatomy;
    // Weighted anatomical vitality
    const vital = (a.head * 0.3) + (a.thorax * 0.35) + (a.abdomen * 0.2) + (a.arms * 0.075) + (a.legs * 0.075);
    a.overallVitality = Math.max(0, Math.min(100, Math.round(vital)));
  }

  /**
   * Use an equippable IFAK Field Medkit
   */
  public useMedkit(): boolean {
    if (this.stats.isHealing || this.stats.medkitsCount <= 0 || !this.stats.isAlive) {
      return false;
    }
    this.stats.isHealing = true;
    this.stats.healProgress = 0;
    soundEngine.playPickup();
    return true;
  }

  public restockFullKit() {
    const a = this.stats.anatomy;
    a.head = 100;
    a.thorax = 100;
    a.plateArmor = 100;
    a.abdomen = 100;
    a.arms = 100;
    a.legs = 100;
    a.overallVitality = 100;
    this.stats.medkitsCount = 3;
    this.stats.stamina = 100;
    this.stats.isHealing = false;
    this.stats.healProgress = 0;
    soundEngine.playPickup();
  }

  public respawn(spawnPos: Vector3) {
    this.restockFullKit();
    this.stats.isAlive = true;
    this.camera.position.copyFrom(spawnPos.add(new Vector3(0, this.standHeight, 0)));
    this.camera.rotation.set(0, Math.PI, 0); // Face into the compound
    this.weapon.state.ammoInMag = 30;
    this.weapon.state.ammoReserve = 120;
    this.weapon.state.isReloading = false;
  }

  public update(dt: number, onPlayerFired: (ray: Ray) => void) {
    if (!this.stats.isAlive) return;

    // 1. Damage flash timer
    if (this.damageFlashTimer > 0) {
      this.damageFlashTimer -= dt;
      if (this.damageFlashTimer <= 0) {
        this.lastDamageAngle = null;
      }
    }

    // 2. Field Medkit Application Progress
    if (this.stats.isHealing) {
      this.stats.healProgress += dt / this.healDuration;
      if (this.stats.healProgress >= 1.0) {
        this.stats.isHealing = false;
        this.stats.healProgress = 0;
        this.stats.medkitsCount--;

        // Heal anatomical zones
        const a = this.stats.anatomy;
        a.head = Math.min(100, a.head + 40);
        a.thorax = Math.min(100, a.thorax + 45);
        a.abdomen = Math.min(100, a.abdomen + 50);
        a.arms = Math.min(100, a.arms + 50);
        a.legs = Math.min(100, a.legs + 50);
        this.updateOverallVitality();
        soundEngine.playPickup();
      }
    }

    // 3. Sprinting & Stamina
    const isW = !!this.keys['KeyW'];
    const wantSprint = !!this.keys['ShiftLeft'] || !!this.keys['ShiftRight'] || this.touchSprintRequested;
    const isMovingForward = isW || this.touchMoveVector.z > 0.25;

    if (wantSprint && isMovingForward && !this.isCrouching && !this.weapon.state.isADS && this.stats.stamina > 5) {
      this.isSprinting = true;
      this.stats.stamina = Math.max(0, this.stats.stamina - dt * 20);
    } else {
      this.isSprinting = false;
      this.stats.stamina = Math.min(this.stats.maxStamina, this.stats.stamina + dt * 14);
    }

    // 4. Smooth Crouch Height
    const targetHeight = this.isCrouching ? this.crouchHeight : this.standHeight;
    this.currentCameraHeight += (targetHeight - this.currentCameraHeight) * Math.min(1, 14 * dt);

    // 5. Tactical Movement Calculation
    let currentSpeed = this.moveSpeed;
    if (this.isSprinting) currentSpeed *= this.sprintMultiplier;
    if (this.isCrouching) currentSpeed *= this.crouchMultiplier;
    if (this.weapon.state.isADS) currentSpeed *= 0.65;
    if (this.stats.isHealing) currentSpeed *= 0.5; // Walking carefully while dressing wounds

    let moveX = 0;
    let moveZ = 0;

    if (this.keys['KeyW']) moveZ += 1;
    if (this.keys['KeyS']) moveZ -= 1;
    if (this.keys['KeyA']) moveX -= 1;
    if (this.keys['KeyD']) moveX += 1;

    // Add virtual joystick touch input (analog 360-degree range)
    if (this.touchMoveVector.x !== 0 || this.touchMoveVector.z !== 0) {
      moveX += this.touchMoveVector.x;
      moveZ += this.touchMoveVector.z;
    }

    const isMoving = Math.abs(moveX) > 0.05 || Math.abs(moveZ) > 0.05;

    if (isMoving) {
      const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
      if (len > 1.0) {
        moveX /= len;
        moveZ /= len;
      }

      // Get camera view orientation (horizontal plane)
      const forward = this.camera.getDirection(Vector3.Forward());
      forward.y = 0;
      forward.normalize();

      const right = this.camera.getDirection(Vector3.Right());
      right.y = 0;
      right.normalize();

      // Combine forward and strafe vectors according to camera aim direction
      const moveDir = forward.scale(moveZ).add(right.scale(moveX)).normalize();
      const moveStep = moveDir.scale(currentSpeed * dt);

      this.camera.position.x += moveStep.x;
      this.camera.position.z += moveStep.z;

      // Compound perimeter boundary bounds
      this.camera.position.x = Math.max(-62, Math.min(62, this.camera.position.x));
      this.camera.position.z = Math.max(-62, Math.min(62, this.camera.position.z));

      // Natural walking step cycle (faster cadence when sprinting)
      this.walkStepCycle += dt * (this.isSprinting ? 9.5 : 6.0);

      // Footstep audio
      this.stepTimer += dt * (this.isSprinting ? 2.2 : 1.4);
      if (this.stepTimer > 1.0) {
        this.stepTimer = 0;
        soundEngine.playFootstep(this.isSprinting);
      }
    }

    // Zero out cameraDirection so Babylon internal input manager does not conflict
    this.camera.cameraDirection.set(0, 0, 0);

    // 6. Jump & Gravity
    if (this.keys['Space'] && this.isGrounded && !this.isCrouching) {
      this.verticalVelocity = this.jumpVelocity;
      this.isGrounded = false;
    }

    this.verticalVelocity += this.gravity * dt;
    this.camera.position.y += this.verticalVelocity * dt;

    // Precise grounded height clamping
    const groundLevel = this.currentCameraHeight;
    if (this.camera.position.y <= groundLevel) {
      this.camera.position.y = groundLevel;
      this.verticalVelocity = 0;
      this.isGrounded = true;
    }

    // Subtle first-person head bob on foot strike
    if (isMoving && this.isGrounded && !this.weapon.state.isADS) {
      const bobIntensity = this.isSprinting ? 0.0016 : 0.0008;
      this.camera.rotation.x += Math.sin(this.walkStepCycle * 2) * bobIntensity;
    }

    // 7. Recoil Spring Damper Recovery (Pulls camera pitch back down cleanly)
    if (Math.abs(this.cameraRecoilSpring) > 0.0001) {
      const recovery = this.cameraRecoilSpring * Math.min(1, 14 * dt);
      this.camera.rotation.x -= recovery;
      this.cameraRecoilSpring -= recovery;
    }

    // 8. Weapon Update
    this.weapon.update(dt, isMoving, this.isSprinting);

    // 9. Firing Action
    const now = performance.now();
    if (this.isFiring && !this.stats.isHealing) {
      const fired = this.weapon.tryFire(now, isMoving, this.isCrouching);
      if (fired) {
        // Apply temporary spring impulse (spring pulls it right back)
        const kickImpulse = this.weapon.state.isADS ? 0.005 : 0.012;
        this.camera.rotation.x -= kickImpulse;
        this.cameraRecoilSpring += kickImpulse;

        // Construct straight-shooting ballistic ray
        const ray = this.constructStraightRay();
        onPlayerFired(ray);

        if (this.weapon.state.fireMode === 'SEMI') {
          this.isFiring = false;
        }
      }
    }
  }

  /**
   * Authentic straight-shooting ray along camera point of aim
   */
  private constructStraightRay(): Ray {
    const origin = this.camera.position.clone();
    const forward = this.camera.getDirection(Vector3.Forward());
    const right = this.camera.getDirection(Vector3.Right());
    const up = this.camera.getDirection(Vector3.Up());

    // Minimal spread cone centered directly on crosshair
    const spread = this.weapon.state.recoilSpread;
    const spreadX = (Math.random() * 2 - 1) * spread;
    const spreadY = (Math.random() * 2 - 1) * spread;

    const fireDirection = forward.add(right.scale(spreadX)).add(up.scale(spreadY)).normalize();
    return new Ray(origin, fireDirection, 160);
  }

  public dispose() {
    this.weapon.dispose();
    this.camera.dispose();
  }
}
