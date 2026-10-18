import {
  Scene,
  TransformNode,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  Vector3,
  Camera,
  PointLight
} from '@babylonjs/core';
import { soundEngine } from './audio';
import { ObjectPoolManager } from './pool';

export interface WeaponState {
  ammoInMag: number;
  ammoReserve: number;
  maxMag: number;
  isReloading: boolean;
  isADS: boolean;
  fireMode: 'AUTO' | 'SEMI';
  recoilSpread: number;
}

export class AK47Weapon {
  private scene: Scene;
  private camera: Camera;
  public rootNode: TransformNode;
  private gunMesh: TransformNode;
  private magazineMesh: Mesh | null = null;
  private chargingHandle: Mesh | null = null;
  private muzzleFlashLight: PointLight;
  private muzzleFlashMesh: Mesh;
  private poolManager: ObjectPoolManager;

  // Viewmodel resting positions
  // Hipfire stance: slightly to the right, lowered, natural ready carry
  private hipPos = new Vector3(0.20, -0.22, 0.48);
  private hipRot = new Vector3(0.02, -0.04, 0);

  // ADS stance: perfectly aligned front sight pin inside rear notch along camera center-Z
  private adsPos = new Vector3(0.0, -0.165, 0.42);
  private adsRot = new Vector3(0.0, 0.0, 0);

  // Smooth lerped offsets
  private currentPos = new Vector3(0.20, -0.22, 0.48);
  private currentRot = new Vector3(0.02, -0.04, 0);

  // Spring-damper recoil system
  private recoilZ: number = 0;
  private recoilPitch: number = 0;
  private recoilYaw: number = 0;

  // Weapon state
  public state: WeaponState = {
    ammoInMag: 30,
    ammoReserve: 120,
    maxMag: 30,
    isReloading: false,
    isADS: false,
    fireMode: 'AUTO',
    recoilSpread: 0.015
  };

  private lastFireTime: number = 0;
  private fireRateMs: number = 100; // 600 RPM
  private walkTime: number = 0;
  private idleTime: number = 0;
  private reloadTimer: number = 0;

  constructor(scene: Scene, camera: Camera, poolManager: ObjectPoolManager) {
    this.scene = scene;
    this.camera = camera;
    this.poolManager = poolManager;

    this.rootNode = new TransformNode('ak47_root', scene);
    this.rootNode.parent = camera;
    this.rootNode.position.copyFrom(this.hipPos);
    this.rootNode.rotation.copyFrom(this.hipRot);

    this.gunMesh = new TransformNode('ak47_gun_pivot', scene);
    this.gunMesh.parent = this.rootNode;

    // Build the high-detail AK-47 & Articulated Human Arms with Fingers
    this.buildAK47();
    this.buildHumanArmsWithFingers();

    // Muzzle Flash
    this.muzzleFlashLight = new PointLight('muzzle_light', new Vector3(0, 0.032, 0.96), scene);
    this.muzzleFlashLight.parent = this.gunMesh;
    this.muzzleFlashLight.diffuse = new Color3(1.0, 0.78, 0.28);
    this.muzzleFlashLight.intensity = 0;
    this.muzzleFlashLight.range = 7;

    this.muzzleFlashMesh = MeshBuilder.CreateDisc('muzzle_flash_cross', { radius: 0.12, tessellation: 6 }, scene);
    this.muzzleFlashMesh.parent = this.gunMesh;
    this.muzzleFlashMesh.position.set(0, 0.032, 0.96);
    const flashMat = new StandardMaterial('flash_mat', scene);
    flashMat.emissiveColor = new Color3(1.0, 0.85, 0.3);
    flashMat.disableLighting = true;
    this.muzzleFlashMesh.material = flashMat;
    this.muzzleFlashMesh.isVisible = false;
  }

  private buildAK47() {
    const metalMat = new StandardMaterial('ak_metal', this.scene);
    metalMat.diffuseColor = new Color3(0.12, 0.13, 0.14);
    metalMat.specularColor = new Color3(0.35, 0.35, 0.38);

    const darkMetalMat = new StandardMaterial('ak_darkmetal', this.scene);
    darkMetalMat.diffuseColor = new Color3(0.08, 0.08, 0.09);
    darkMetalMat.specularColor = new Color3(0.2, 0.2, 0.2);

    const woodMat = new StandardMaterial('ak_wood', this.scene);
    woodMat.diffuseColor = new Color3(0.50, 0.26, 0.12);
    woodMat.specularColor = new Color3(0.10, 0.06, 0.04);

    // 1. Milled Steel Receiver
    const receiver = MeshBuilder.CreateBox('ak_rec', { width: 0.048, height: 0.075, depth: 0.40 }, this.scene);
    receiver.parent = this.gunMesh;
    receiver.position.set(0, 0, 0.12);
    receiver.material = metalMat;

    // Receiver Cover (stamped metal top)
    const cover = MeshBuilder.CreateCylinder('ak_cover', { height: 0.38, diameter: 0.048 }, this.scene);
    cover.parent = receiver;
    cover.position.set(0, 0.038, 0);
    cover.rotation.x = Math.PI / 2;
    cover.material = metalMat;

    // 2. Wooden Handguard & Gas Tube
    const handguardLower = MeshBuilder.CreateBox('ak_hg_low', { width: 0.052, height: 0.055, depth: 0.22 }, this.scene);
    handguardLower.parent = receiver;
    handguardLower.position.set(0, -0.005, 0.31);
    handguardLower.material = woodMat;

    const gasTubeWood = MeshBuilder.CreateCylinder('ak_hg_up', { height: 0.20, diameter: 0.042 }, this.scene);
    gasTubeWood.parent = receiver;
    gasTubeWood.position.set(0, 0.038, 0.31);
    gasTubeWood.rotation.x = Math.PI / 2;
    gasTubeWood.material = woodMat;

    // 3. Barrel & Slant Muzzle Brake
    const barrel = MeshBuilder.CreateCylinder('ak_bar', { height: 0.38, diameter: 0.022 }, this.scene);
    barrel.parent = receiver;
    barrel.position.set(0, 0.02, 0.58);
    barrel.rotation.x = Math.PI / 2;
    barrel.material = darkMetalMat;

    const muzzleBrake = MeshBuilder.CreateCylinder('ak_brake', { height: 0.05, diameter: 0.028 }, this.scene);
    muzzleBrake.parent = receiver;
    muzzleBrake.position.set(0, 0.02, 0.78);
    muzzleBrake.rotation.x = Math.PI / 2;
    muzzleBrake.material = darkMetalMat;

    // 4. Precision Iron Sights
    // Front Sight Base and Red High-Vis Pin
    const frontSightBase = MeshBuilder.CreateBox('ak_fs_base', { width: 0.028, height: 0.045, depth: 0.03 }, this.scene);
    frontSightBase.parent = receiver;
    frontSightBase.position.set(0, 0.048, 0.72);
    frontSightBase.material = darkMetalMat;

    const frontSightPin = MeshBuilder.CreateCylinder('ak_fs_pin', { height: 0.022, diameter: 0.0035 }, this.scene);
    frontSightPin.parent = frontSightBase;
    frontSightPin.position.set(0, 0.024, 0);
    const pinMat = new StandardMaterial('fs_pin_mat', this.scene);
    pinMat.emissiveColor = new Color3(1.0, 0.15, 0.15);
    pinMat.diffuseColor = new Color3(1.0, 0.1, 0.1);
    frontSightPin.material = pinMat;

    // Rear Tangent Sight with U-Notch
    const rearSightBase = MeshBuilder.CreateBox('ak_rs_base', { width: 0.032, height: 0.02, depth: 0.08 }, this.scene);
    rearSightBase.parent = receiver;
    rearSightBase.position.set(0, 0.054, 0.20);
    rearSightBase.material = metalMat;

    const rearNotchL = MeshBuilder.CreateBox('ak_rs_nl', { width: 0.011, height: 0.016, depth: 0.01 }, this.scene);
    rearNotchL.parent = rearSightBase;
    rearNotchL.position.set(-0.009, 0.015, -0.035);
    rearNotchL.material = darkMetalMat;

    const rearNotchR = MeshBuilder.CreateBox('ak_rs_nr', { width: 0.011, height: 0.016, depth: 0.01 }, this.scene);
    rearNotchR.parent = rearSightBase;
    rearNotchR.position.set(0.009, 0.015, -0.035);
    rearNotchR.material = darkMetalMat;

    // 5. Curved 30-round Banana Magazine
    this.magazineMesh = MeshBuilder.CreateBox('ak_mag', { width: 0.036, height: 0.22, depth: 0.09 }, this.scene);
    this.magazineMesh.parent = receiver;
    this.magazineMesh.position.set(0, -0.12, 0.10);
    this.magazineMesh.rotation.x = 0.32;
    this.magazineMesh.material = darkMetalMat;

    // Magazine ribs
    for (let r = -2; r <= 2; r++) {
      const rib = MeshBuilder.CreateBox(`ak_mag_rib_${r}`, { width: 0.040, height: 0.008, depth: 0.085 }, this.scene);
      rib.parent = this.magazineMesh;
      rib.position.set(0, r * 0.035, 0);
      rib.material = darkMetalMat;
    }

    // 6. Wooden Pistol Grip & Trigger
    const grip = MeshBuilder.CreateBox('ak_grip', { width: 0.038, height: 0.14, depth: 0.06 }, this.scene);
    grip.parent = receiver;
    grip.position.set(0, -0.10, -0.08);
    grip.rotation.x = -0.38;
    grip.material = woodMat;

    const triggerGuard = MeshBuilder.CreateTorus('ak_trig_guard', { diameter: 0.055, thickness: 0.006 }, this.scene);
    triggerGuard.parent = receiver;
    triggerGuard.position.set(0, -0.055, 0.01);
    triggerGuard.rotation.y = Math.PI / 2;
    triggerGuard.material = metalMat;

    const trigger = MeshBuilder.CreateBox('ak_trigger', { width: 0.008, height: 0.025, depth: 0.012 }, this.scene);
    trigger.parent = receiver;
    trigger.position.set(0, -0.052, 0.01);
    trigger.rotation.x = -0.25;
    trigger.material = metalMat;

    // 7. Wooden Shoulder Stock
    const stock = MeshBuilder.CreateBox('ak_stock', { width: 0.042, height: 0.11, depth: 0.32 }, this.scene);
    stock.parent = receiver;
    stock.position.set(0, -0.03, -0.32);
    stock.rotation.x = -0.08;
    stock.material = woodMat;

    const buttplate = MeshBuilder.CreateBox('ak_butt', { width: 0.044, height: 0.12, depth: 0.02 }, this.scene);
    buttplate.parent = stock;
    buttplate.position.set(0, 0, -0.16);
    buttplate.material = darkMetalMat;

    // 8. Steel Charging Handle
    this.chargingHandle = MeshBuilder.CreateCylinder('ak_bolt', { height: 0.035, diameter: 0.012 }, this.scene);
    this.chargingHandle.parent = receiver;
    this.chargingHandle.position.set(0.035, 0.025, 0.08);
    this.chargingHandle.rotation.z = Math.PI / 2;
    this.chargingHandle.material = metalMat;
  }

  /**
   * Anatomically complete human hands with articulated fingers gripping the AK-47
   * (Green stick sleeve cylinders completely removed)
   */
  private buildHumanArmsWithFingers() {
    const skinMat = new StandardMaterial('vp_skin', this.scene);
    skinMat.diffuseColor = new Color3(0.82, 0.65, 0.54); // Natural skin tone
    skinMat.specularColor = new Color3(0.1, 0.1, 0.1);

    const gloveMat = new StandardMaterial('vp_glove', this.scene);
    gloveMat.diffuseColor = new Color3(0.15, 0.15, 0.16); // Tactical combat glove
    gloveMat.specularColor = new Color3(0.2, 0.2, 0.2);

    // ==========================================
    // RIGHT HAND (Firmly Gripping Pistol Grip & Trigger)
    // ==========================================
    const rightPalm = MeshBuilder.CreateBox('vp_palm_r', { width: 0.072, height: 0.082, depth: 0.09 }, this.scene);
    rightPalm.parent = this.gunMesh;
    rightPalm.position.set(0.015, -0.09, -0.075);
    rightPalm.rotation.set(-0.38, 0.02, 0);
    rightPalm.material = skinMat;

    // Tactical glove knuckle protector
    const rightKnuckle = MeshBuilder.CreateBox('vp_knuckle_r', { width: 0.074, height: 0.038, depth: 0.045 }, this.scene);
    rightKnuckle.parent = rightPalm;
    rightKnuckle.position.set(0, 0.02, 0.028);
    rightKnuckle.material = gloveMat;

    // Right Hand Fingers:
    // 1. Index Finger (Curved naturally inside trigger guard on the trigger)
    const rightIndex = MeshBuilder.CreateCylinder('vp_finger_index_r', { height: 0.045, diameter: 0.015 }, this.scene);
    rightIndex.parent = rightPalm;
    rightIndex.position.set(-0.012, 0.035, 0.072);
    rightIndex.rotation.set(0.4, 0.1, 0.3);
    rightIndex.material = skinMat;

    // 2. Thumb (Wrapped over side of the wooden pistol grip)
    const rightThumb = MeshBuilder.CreateCylinder('vp_finger_thumb_r', { height: 0.05, diameter: 0.017 }, this.scene);
    rightThumb.parent = rightPalm;
    rightThumb.position.set(-0.030, 0.015, 0.015);
    rightThumb.rotation.set(0.7, -0.3, 0.4);
    rightThumb.material = skinMat;

    // 3, 4, 5. Middle, Ring, Pinky Fingers (Wrapped tightly around the wooden pistol grip)
    const fingersR = [
      { y: 0.012, z: 0.062, name: 'middle' },
      { y: -0.012, z: 0.058, name: 'ring' },
      { y: -0.034, z: 0.052, name: 'pinky' }
    ];
    fingersR.forEach((f) => {
      const finger = MeshBuilder.CreateBox(`vp_finger_${f.name}_r`, { width: 0.038, height: 0.015, depth: 0.024 }, this.scene);
      finger.parent = rightPalm;
      finger.position.set(-0.005, f.y, f.z);
      finger.rotation.set(-0.2, 0, 0);
      finger.material = skinMat;
    });

    // ==========================================
    // LEFT HAND (Firmly Cupping & Supporting Wooden Handguard)
    // ==========================================
    const leftPalm = MeshBuilder.CreateBox('vp_palm_l', { width: 0.075, height: 0.078, depth: 0.09 }, this.scene);
    leftPalm.parent = this.gunMesh;
    leftPalm.position.set(-0.01, -0.025, 0.30);
    leftPalm.rotation.set(0.2, 0.1, 0.3);
    leftPalm.material = skinMat;

    // Glove knuckle pad
    const leftKnuckle = MeshBuilder.CreateBox('vp_knuckle_l', { width: 0.075, height: 0.038, depth: 0.045 }, this.scene);
    leftKnuckle.parent = leftPalm;
    leftKnuckle.position.set(0, -0.02, 0.028);
    leftKnuckle.material = gloveMat;

    // Left Thumb resting along upper edge of the wood handguard
    const leftThumb = MeshBuilder.CreateCylinder('vp_finger_thumb_l', { height: 0.05, diameter: 0.017 }, this.scene);
    leftThumb.parent = leftPalm;
    leftThumb.position.set(0.025, 0.025, 0.01);
    leftThumb.rotation.set(-0.25, 0.15, -0.4);
    leftThumb.material = skinMat;

    // Left 4 Fingers wrapping underneath the wooden handguard supporting the AK-47
    for (let i = 0; i < 4; i++) {
      const finger = MeshBuilder.CreateBox(`vp_finger_l_${i}`, { width: 0.036, height: 0.015, depth: 0.02 }, this.scene);
      finger.parent = leftPalm;
      finger.position.set(-0.015, -0.032 + i * 0.02, 0.055);
      finger.rotation.set(0.28, 0.08, 0);
      finger.material = skinMat;
    }
  }

  public setADS(active: boolean) {
    if (this.state.isReloading) return;
    this.state.isADS = active;
  }

  public toggleFireMode() {
    this.state.fireMode = this.state.fireMode === 'AUTO' ? 'SEMI' : 'AUTO';
  }

  public reload() {
    if (this.state.isReloading || this.state.ammoInMag === this.state.maxMag || this.state.ammoReserve <= 0) {
      return;
    }
    this.state.isReloading = true;
    this.state.isADS = false;
    this.reloadTimer = 0;
    soundEngine.playMagOut();
  }

  public addReserveAmmo(amount: number) {
    this.state.ammoReserve = Math.min(240, this.state.ammoReserve + amount);
    soundEngine.playPickup();
  }

  /**
   * Fire weapon with authentic AK-47 recoil spring kick
   */
  public tryFire(now: number, isMoving: boolean, isCrouching: boolean): boolean {
    if (this.state.isReloading) return false;
    if (now - this.lastFireTime < this.fireRateMs) return false;

    if (this.state.ammoInMag <= 0) {
      this.lastFireTime = now;
      soundEngine.playDryFire();
      return false;
    }

    this.lastFireTime = now;
    this.state.ammoInMag--;

    // Authentic AK-47 recoil impulse
    const kickMult = this.state.isADS ? 0.35 : 1.0;

    // Recoil springs
    this.recoilZ = -0.038 * kickMult;
    this.recoilPitch = -0.045 * kickMult;
    this.recoilYaw = (Math.random() - 0.45) * 0.015 * kickMult;

    // Spread calculation
    let baseSpread = this.state.isADS ? 0.002 : 0.014;
    if (isMoving) baseSpread *= 1.6;
    if (isCrouching) baseSpread *= 0.7;
    this.state.recoilSpread = Math.min(0.04, baseSpread + 0.008);

    // Muzzle flash on
    this.muzzleFlashLight.intensity = 4.0;
    this.muzzleFlashMesh.isVisible = true;
    this.muzzleFlashMesh.rotation.z = Math.random() * Math.PI * 2;
    setTimeout(() => {
      this.muzzleFlashLight.intensity = 0;
      this.muzzleFlashMesh.isVisible = false;
    }, 45);

    // Gunshot Audio
    soundEngine.playAK47Shot(true, 0);

    // Eject Brass Casing using Object Pool
    const worldPos = this.rootNode.getAbsolutePosition();
    const forward = this.camera.getDirection(Vector3.Forward());
    const right = this.camera.getDirection(Vector3.Right());
    const up = this.camera.getDirection(Vector3.Up());
    this.poolManager.spawnCasing(worldPos, forward, right, up);

    return true;
  }

  /**
   * Per-frame update with spring damper return
   */
  public update(dt: number, isMoving: boolean, isSprinting: boolean) {
    // 1. Viewmodel Locomotion & Posture
    const targetPos = this.state.isADS ? this.adsPos.clone() : this.hipPos.clone();
    const targetRot = this.state.isADS ? this.adsRot.clone() : this.hipRot.clone();

    if (isSprinting && !this.state.isADS) {
      // Tactical Sprint Carry Stance (Rifle held diagonally across chest at low-ready)
      targetPos.set(0.14, -0.27, 0.44);
      targetRot.set(-0.25, -0.15, 0.32);

      // Energetic jogging stride cadence
      this.walkTime += dt * 9.5;
      targetPos.y -= Math.abs(Math.sin(this.walkTime)) * 0.034;
      targetPos.x += Math.sin(this.walkTime * 0.5) * 0.026;
      targetPos.z += Math.cos(this.walkTime) * 0.020;
      targetRot.z += Math.sin(this.walkTime * 0.5) * 0.08;
      targetRot.x += Math.sin(this.walkTime) * 0.045;
    } else if (isMoving) {
      // Normal Tactical Walking Pace (~1.5 m/s)
      this.walkTime += dt * 6.2;

      if (this.state.isADS) {
        // In ADS: Iron sights remain locked center with minimal movement sway
        targetPos.x += Math.sin(this.walkTime * 0.5) * 0.0016;
        targetPos.y += Math.sin(this.walkTime) * 0.0016;
      } else {
        // In Hipfire: Smooth figure-8 weapon and arms walking sway
        // Vertical step dip (dips on each footstep)
        targetPos.y -= Math.abs(Math.sin(this.walkTime)) * 0.016;
        // Lateral stride sway (side to side)
        targetPos.x += Math.sin(this.walkTime * 0.5) * 0.022;
        // Forward-back inertia surge
        targetPos.z += Math.cos(this.walkTime) * 0.012;

        // Realistic rifle tilt and rock
        targetRot.x += Math.sin(this.walkTime) * 0.025;
        targetRot.z += Math.sin(this.walkTime * 0.5) * 0.045;
        targetRot.y += Math.cos(this.walkTime * 0.5) * 0.022;
      }
    } else {
      // Alert Standing Respiration & Breathing
      this.idleTime += dt * 1.8;

      if (this.state.isADS) {
        // Subtle sniper reticle drift
        targetPos.y += Math.sin(this.idleTime * 1.5) * 0.0008;
        targetPos.x += Math.cos(this.idleTime * 0.75) * 0.0006;
      } else {
        // Natural chest breathing heaves the rifle up and down gently
        targetPos.y += Math.sin(this.idleTime) * 0.004;
        targetRot.x += Math.sin(this.idleTime) * 0.008;
        targetPos.x += Math.cos(this.idleTime * 0.5) * 0.0025;
      }
    }

    // 2. Smooth Lerp to target position
    const lerpSpeed = this.state.isADS ? 22 * dt : 15 * dt;
    Vector3.LerpToRef(this.currentPos, targetPos, Math.min(1, lerpSpeed), this.currentPos);
    Vector3.LerpToRef(this.currentRot, targetRot, Math.min(1, lerpSpeed), this.currentRot);

    // 3. Recoil Spring Damper Recovery (Pulls back to 0 cleanly)
    this.recoilZ += (0 - this.recoilZ) * Math.min(1, 18 * dt);
    this.recoilPitch += (0 - this.recoilPitch) * Math.min(1, 18 * dt);
    this.recoilYaw += (0 - this.recoilYaw) * Math.min(1, 18 * dt);

    // Apply combined position & rotation
    this.rootNode.position.set(
      this.currentPos.x,
      this.currentPos.y,
      this.currentPos.z + this.recoilZ
    );

    this.rootNode.rotation.set(
      this.currentRot.x + this.recoilPitch,
      this.currentRot.y + this.recoilYaw,
      this.currentRot.z
    );

    // Natural spread recovery
    const minSpread = this.state.isADS ? 0.002 : 0.014;
    this.state.recoilSpread = Math.max(minSpread, this.state.recoilSpread - dt * 0.05);

    // 4. Reload Animation
    if (this.state.isReloading && this.magazineMesh && this.chargingHandle) {
      this.reloadTimer += dt;

      if (this.reloadTimer < 0.6) {
        this.magazineMesh.position.y = -0.12 - (this.reloadTimer / 0.6) * 0.35;
        this.gunMesh.rotation.z = -0.22;
      } else if (this.reloadTimer < 1.3) {
        if (this.reloadTimer > 0.95 && this.magazineMesh.position.y < -0.18) {
          soundEngine.playMagIn();
        }
        const prog = (this.reloadTimer - 0.6) / 0.7;
        this.magazineMesh.position.y = -0.47 + prog * 0.35;
      } else if (this.reloadTimer < 2.0) {
        this.magazineMesh.position.y = -0.12;
        if (this.reloadTimer > 1.4 && this.chargingHandle.position.z > 0.05) {
          soundEngine.playBoltRack();
        }
        const boltProg = (this.reloadTimer - 1.3) / 0.7;
        this.chargingHandle.position.z = 0.08 - Math.sin(boltProg * Math.PI) * 0.07;
      } else {
        this.chargingHandle.position.z = 0.08;
        this.gunMesh.rotation.z = 0;
        this.state.isReloading = false;

        const needed = this.state.maxMag - this.state.ammoInMag;
        const available = Math.min(needed, this.state.ammoReserve);
        this.state.ammoInMag += available;
        this.state.ammoReserve -= available;
      }
    }
  }

  public dispose() {
    this.rootNode.dispose();
  }
}
