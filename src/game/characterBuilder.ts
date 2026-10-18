import {
  Scene,
  TransformNode,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  Vector3,
  Quaternion
} from '@babylonjs/core';

export interface HumanoidCharacter {
  root: TransformNode;
  head: Mesh;
  torso: Mesh;
  leftArm: TransformNode;
  rightArm: TransformNode;
  leftLeg: TransformNode;
  rightLeg: TransformNode;
  weaponMesh?: Mesh;
  animate: (walkCycle: number, isMoving?: boolean, isAiming?: boolean, dt?: number) => void;
  playDeath: () => void;
  playFlinch: () => void;
  dispose: () => void;
}

export class CharacterBuilder {
  private static matCache: Map<string, StandardMaterial> = new Map();

  private static getMaterial(scene: Scene, name: string, diffuse: Color3, specular: Color3 = new Color3(0.1, 0.1, 0.1)): StandardMaterial {
    const key = `${name}_${diffuse.r}_${diffuse.g}_${diffuse.b}`;
    if (this.matCache.has(key)) {
      return this.matCache.get(key)!;
    }
    const mat = new StandardMaterial(key, scene);
    mat.diffuseColor = diffuse;
    mat.specularColor = specular;
    this.matCache.set(key, mat);
    return mat;
  }

  /**
   * Build complete humanoid character model with basic human features
   */
  public static createHumanoid(
    scene: Scene,
    id: string,
    type: 'instructor' | 'enemy',
    position: Vector3
  ): HumanoidCharacter {
    const root = new TransformNode(`humanoid_${id}`, scene);
    root.position.copyFrom(position);

    // Materials
    const skinMat = this.getMaterial(scene, 'skin', new Color3(0.78, 0.62, 0.52));
    const eyeMat = this.getMaterial(scene, 'eyes', new Color3(0.1, 0.1, 0.1));
    const hairMat = this.getMaterial(scene, 'hair', new Color3(0.15, 0.1, 0.08));

    // Uniform materials based on type
    let uniformMat: StandardMaterial;
    let vestMat: StandardMaterial;
    let headwearMat: StandardMaterial;
    let bootMat: StandardMaterial;

    if (type === 'instructor') {
      uniformMat = this.getMaterial(scene, 'inst_uniform', new Color3(0.55, 0.50, 0.38)); // Tan military shirt & fatigues
      vestMat = this.getMaterial(scene, 'inst_vest', new Color3(0.32, 0.35, 0.28)); // OD Green tactical rig
      headwearMat = this.getMaterial(scene, 'inst_beret', new Color3(0.65, 0.15, 0.15)); // Maroon tactical instructor beret
      bootMat = this.getMaterial(scene, 'inst_boots', new Color3(0.2, 0.18, 0.14));
    } else {
      uniformMat = this.getMaterial(scene, 'enemy_uniform', new Color3(0.24, 0.28, 0.24)); // Urban camo green/charcoal
      vestMat = this.getMaterial(scene, 'enemy_vest', new Color3(0.15, 0.17, 0.18)); // Black heavy ballistic vest
      headwearMat = this.getMaterial(scene, 'enemy_helmet', new Color3(0.18, 0.20, 0.18)); // Combat ballistic helmet
      bootMat = this.getMaterial(scene, 'enemy_boots', new Color3(0.1, 0.1, 0.1));
    }

    const metalMat = this.getMaterial(scene, 'metal', new Color3(0.15, 0.15, 0.15), new Color3(0.4, 0.4, 0.4));
    const woodMat = this.getMaterial(scene, 'wood', new Color3(0.45, 0.25, 0.12));
    const visorMat = this.getMaterial(scene, 'visor', new Color3(0.85, 0.4, 0.1), new Color3(0.9, 0.9, 0.9));

    // --- PELVIS & HIPS ---
    const pelvis = MeshBuilder.CreateBox(`${id}_pelvis`, { width: 0.36, height: 0.16, depth: 0.24 }, scene);
    pelvis.parent = root;
    pelvis.position.y = 0.95;
    pelvis.material = uniformMat;

    // Tactical Belt with canteen & pouches
    const belt = MeshBuilder.CreateBox(`${id}_belt`, { width: 0.38, height: 0.07, depth: 0.26 }, scene);
    belt.parent = pelvis;
    belt.position.y = 0.05;
    belt.material = vestMat;

    // --- TORSO ---
    const torso = MeshBuilder.CreateBox(`${id}_torso`, { width: 0.44, height: 0.52, depth: 0.26 }, scene);
    torso.parent = root;
    torso.position.y = 1.30;
    torso.material = uniformMat;

    // Tactical Plate Carrier Vest
    const plateCarrier = MeshBuilder.CreateBox(`${id}_plate`, { width: 0.46, height: 0.44, depth: 0.30 }, scene);
    plateCarrier.parent = torso;
    plateCarrier.position.y = -0.02;
    plateCarrier.material = vestMat;

    // Ammo Pouches on chest
    for (let p = -1; p <= 1; p++) {
      const pouch = MeshBuilder.CreateBox(`${id}_pouch_${p}`, { width: 0.09, height: 0.16, depth: 0.08 }, scene);
      pouch.parent = plateCarrier;
      pouch.position.set(p * 0.11, -0.06, 0.16);
      pouch.material = vestMat;
    }

    // --- NECK & HEAD ---
    const neck = MeshBuilder.CreateCylinder(`${id}_neck`, { height: 0.10, diameter: 0.14 }, scene);
    neck.parent = torso;
    neck.position.y = 0.31;
    neck.material = skinMat;

    const head = MeshBuilder.CreateBox(`${id}_head`, { width: 0.22, height: 0.24, depth: 0.22 }, scene);
    head.parent = neck;
    head.position.y = 0.16;
    head.material = skinMat;

    // Nose
    const nose = MeshBuilder.CreateBox(`${id}_nose`, { width: 0.04, height: 0.06, depth: 0.05 }, scene);
    nose.parent = head;
    nose.position.set(0, -0.01, 0.12);
    nose.material = skinMat;

    // Eyes
    const leftEye = MeshBuilder.CreateBox(`${id}_eye_l`, { width: 0.04, height: 0.02, depth: 0.01 }, scene);
    leftEye.parent = head;
    leftEye.position.set(-0.06, 0.04, 0.111);
    leftEye.material = eyeMat;

    const rightEye = MeshBuilder.CreateBox(`${id}_eye_r`, { width: 0.04, height: 0.02, depth: 0.01 }, scene);
    rightEye.parent = head;
    rightEye.position.set(0.06, 0.04, 0.111);
    rightEye.material = eyeMat;

    // Headwear
    if (type === 'instructor') {
      // Tactical Instructor Beret (slanted slightly)
      const beret = MeshBuilder.CreateCylinder(`${id}_beret`, { height: 0.07, diameter: 0.26 }, scene);
      beret.parent = head;
      beret.position.set(0.02, 0.14, -0.01);
      beret.rotation.z = -0.15;
      beret.material = headwearMat;

      // Golden Insignia Pin
      const insignia = MeshBuilder.CreateBox(`${id}_badge`, { width: 0.03, height: 0.03, depth: 0.01 }, scene);
      insignia.parent = beret;
      insignia.position.set(-0.08, 0.01, 0.11);
      insignia.material = metalMat;
    } else {
      // Ballistic Combat Helmet
      const helmet = MeshBuilder.CreateSphere(`${id}_helmet`, { diameterX: 0.28, diameterY: 0.24, diameterZ: 0.28 }, scene);
      helmet.parent = head;
      helmet.position.set(0, 0.06, -0.01);
      helmet.material = headwearMat;

      // Tactical Combat Goggles / Visor
      const goggles = MeshBuilder.CreateBox(`${id}_goggles`, { width: 0.20, height: 0.06, depth: 0.05 }, scene);
      goggles.parent = head;
      goggles.position.set(0, 0.04, 0.12);
      goggles.material = visorMat;
    }

    // Radio Headset with mic boom
    const headsetBand = MeshBuilder.CreateTorus(`${id}_headset`, { diameter: 0.26, thickness: 0.025 }, scene);
    headsetBand.parent = head;
    headsetBand.position.y = 0.04;
    headsetBand.rotation.x = Math.PI / 2;
    headsetBand.material = metalMat;

    const micBoom = MeshBuilder.CreateCylinder(`${id}_mic`, { height: 0.12, diameter: 0.015 }, scene);
    micBoom.parent = head;
    micBoom.position.set(0.11, -0.04, 0.08);
    micBoom.rotation.z = Math.PI / 4;
    micBoom.rotation.y = Math.PI / 3;
    micBoom.material = metalMat;

    // --- ARMS & SHOULDERS ---
    const leftArmRoot = new TransformNode(`${id}_arm_root_l`, scene);
    leftArmRoot.parent = torso;
    leftArmRoot.position.set(-0.28, 0.18, 0);

    const leftUpperArm = MeshBuilder.CreateBox(`${id}_upper_l`, { width: 0.12, height: 0.26, depth: 0.12 }, scene);
    leftUpperArm.parent = leftArmRoot;
    leftUpperArm.position.y = -0.13;
    leftUpperArm.material = uniformMat;

    const leftForearm = MeshBuilder.CreateBox(`${id}_fore_l`, { width: 0.11, height: 0.24, depth: 0.11 }, scene);
    leftForearm.parent = leftUpperArm;
    leftForearm.position.y = -0.22;
    leftForearm.material = uniformMat;

    const leftGlove = MeshBuilder.CreateBox(`${id}_glove_l`, { width: 0.09, height: 0.12, depth: 0.09 }, scene);
    leftGlove.parent = leftForearm;
    leftGlove.position.y = -0.15;
    leftGlove.material = vestMat;

    const rightArmRoot = new TransformNode(`${id}_arm_root_r`, scene);
    rightArmRoot.parent = torso;
    rightArmRoot.position.set(0.28, 0.18, 0);

    const rightUpperArm = MeshBuilder.CreateBox(`${id}_upper_r`, { width: 0.12, height: 0.26, depth: 0.12 }, scene);
    rightUpperArm.parent = rightArmRoot;
    rightUpperArm.position.y = -0.13;
    rightUpperArm.material = uniformMat;

    const rightForearm = MeshBuilder.CreateBox(`${id}_fore_r`, { width: 0.11, height: 0.24, depth: 0.11 }, scene);
    rightForearm.parent = rightUpperArm;
    rightForearm.position.y = -0.22;
    rightForearm.material = uniformMat;

    const rightGlove = MeshBuilder.CreateBox(`${id}_glove_r`, { width: 0.09, height: 0.12, depth: 0.09 }, scene);
    rightGlove.parent = rightForearm;
    rightGlove.position.y = -0.15;
    rightGlove.material = vestMat;

    // --- LEGS & BOOTS WITH ARTICULATED KNEES ---
    const leftLegRoot = new TransformNode(`${id}_leg_root_l`, scene);
    leftLegRoot.parent = pelvis;
    leftLegRoot.position.set(-0.12, -0.08, 0);

    const leftThigh = MeshBuilder.CreateBox(`${id}_thigh_l`, { width: 0.14, height: 0.38, depth: 0.15 }, scene);
    leftThigh.parent = leftLegRoot;
    leftThigh.position.y = -0.19;
    leftThigh.material = uniformMat;

    const leftKneePad = MeshBuilder.CreateBox(`${id}_knee_l`, { width: 0.12, height: 0.10, depth: 0.06 }, scene);
    leftKneePad.parent = leftThigh;
    leftKneePad.position.set(0, -0.16, 0.09);
    leftKneePad.material = vestMat;

    const leftKneePivot = new TransformNode(`${id}_knee_pivot_l`, scene);
    leftKneePivot.parent = leftThigh;
    leftKneePivot.position.set(0, -0.19, 0);

    const leftShin = MeshBuilder.CreateBox(`${id}_shin_l`, { width: 0.13, height: 0.34, depth: 0.14 }, scene);
    leftShin.parent = leftKneePivot;
    leftShin.position.y = -0.17;
    leftShin.material = uniformMat;

    const leftBoot = MeshBuilder.CreateBox(`${id}_boot_l`, { width: 0.14, height: 0.14, depth: 0.22 }, scene);
    leftBoot.parent = leftShin;
    leftBoot.position.set(0, -0.17, 0.04);
    leftBoot.material = bootMat;

    const rightLegRoot = new TransformNode(`${id}_leg_root_r`, scene);
    rightLegRoot.parent = pelvis;
    rightLegRoot.position.set(0.12, -0.08, 0);

    const rightThigh = MeshBuilder.CreateBox(`${id}_thigh_r`, { width: 0.14, height: 0.38, depth: 0.15 }, scene);
    rightThigh.parent = rightLegRoot;
    rightThigh.position.y = -0.19;
    rightThigh.material = uniformMat;

    const rightKneePad = MeshBuilder.CreateBox(`${id}_knee_r`, { width: 0.12, height: 0.10, depth: 0.06 }, scene);
    rightKneePad.parent = rightThigh;
    rightKneePad.position.set(0, -0.16, 0.09);
    rightKneePad.material = vestMat;

    const rightKneePivot = new TransformNode(`${id}_knee_pivot_r`, scene);
    rightKneePivot.parent = rightThigh;
    rightKneePivot.position.set(0, -0.19, 0);

    const rightShin = MeshBuilder.CreateBox(`${id}_shin_r`, { width: 0.13, height: 0.34, depth: 0.14 }, scene);
    rightShin.parent = rightKneePivot;
    rightShin.position.y = -0.17;
    rightShin.material = uniformMat;

    const rightBoot = MeshBuilder.CreateBox(`${id}_boot_r`, { width: 0.14, height: 0.14, depth: 0.22 }, scene);
    rightBoot.parent = rightShin;
    rightBoot.position.set(0, -0.17, 0.04);
    rightBoot.material = bootMat;

    // --- EQUIPPED WEAPON FOR COMBATANTS ---
    let weaponMesh: Mesh | undefined;
    if (type === 'enemy') {
      weaponMesh = this.buildCompactRifle(scene, `${id}_ak`, metalMat, woodMat);
      weaponMesh.parent = rightGlove;
      weaponMesh.position.set(-0.04, -0.02, 0.18);
      weaponMesh.rotation.set(-Math.PI / 2, 0, Math.PI / 2);

      // Default combat stance arms
      rightArmRoot.rotation.set(-Math.PI / 3, 0.2, -0.3);
      leftArmRoot.rotation.set(-Math.PI / 2.6, -0.4, 0.5);
    } else {
      // Instructor standing relaxed with sidearm holster
      const holster = MeshBuilder.CreateBox(`${id}_holster`, { width: 0.09, height: 0.16, depth: 0.08 }, scene);
      holster.parent = belt;
      holster.position.set(0.20, -0.08, 0.04);
      holster.material = metalMat;

      // Relaxed arms
      leftArmRoot.rotation.set(0.1, 0, 0.1);
      rightArmRoot.rotation.set(0.15, 0, -0.15);
    }

    // Locomotion & idle state tracking for fluid organic blending
    let currentStride = 0;
    let idleTimer = Math.random() * 10;

    // Animation handler supporting walking and alert standing respiration
    const animate = (
      walkCycle: number,
      isMoving: boolean = true,
      isAiming: boolean = true,
      dt: number = 0.016
    ) => {
      // Smoothly blend stride intensity to eliminate snapping or robotic popping
      const targetStride = isMoving ? Math.sin(walkCycle) : 0;
      currentStride += (targetStride - currentStride) * Math.min(1, 14 * dt);

      if (isMoving || Math.abs(currentStride) > 0.015) {
        // --- 1. NATURAL ANATOMICAL WALKING ANIMATION ---
        // Left Leg: Hip flexes forward (stride > 0) / extends backward (stride < 0)
        leftLegRoot.rotation.x = currentStride * 0.55;
        // Knee flexes ONLY backwards (negative rotation around local X axis) on push-off
        const kneeBendL = currentStride < 0 ? currentStride * 0.95 : -0.06;
        leftKneePivot.rotation.x = kneeBendL;
        // Ankle compensation keeps tactical boot flat with ground plane
        leftBoot.rotation.x = -currentStride * 0.35 - kneeBendL * 0.5;

        // Right Leg: Opposite antiphase stride
        const rightStride = -currentStride;
        rightLegRoot.rotation.x = rightStride * 0.55;
        const kneeBendR = rightStride < 0 ? rightStride * 0.95 : -0.06;
        rightKneePivot.rotation.x = kneeBendR;
        rightBoot.rotation.x = -rightStride * 0.35 - kneeBendR * 0.5;

        // Pelvis & Torso: Natural vertical step bounce (dips down on foot strike)
        const stepBounce = Math.abs(currentStride) * 0.035;
        pelvis.position.y = 0.95 - stepBounce;
        torso.position.y = 1.30 - stepBounce;

        // Pelvic / Torso counter-twist and lateral weight shift
        torso.rotation.y = -currentStride * 0.12;
        torso.rotation.z = Math.cos(walkCycle) * 0.025;

        if (type === 'instructor' || !isAiming) {
          // Relaxed arm swing counter to legs
          leftArmRoot.rotation.x = -currentStride * 0.55;
          rightArmRoot.rotation.x = currentStride * 0.55;
        } else {
          // Tactical combat weapon carry: Torso and arms stabilize AK-47 with natural stride rhythm
          rightArmRoot.rotation.x = -Math.PI / 3 + Math.sin(walkCycle * 2) * 0.06;
          rightArmRoot.rotation.y = 0.2 + Math.cos(walkCycle) * 0.04;
          leftArmRoot.rotation.x = -Math.PI / 2.6 + Math.sin(walkCycle * 2) * 0.06;
          leftArmRoot.rotation.y = -0.4 + Math.cos(walkCycle) * 0.04;
        }
      } else {
        // --- 2. ALERT IDLE BREATHING & SCANNING ANIMATION ---
        idleTimer += dt * 1.6;

        // Legs return cleanly to solid standing rest
        leftLegRoot.rotation.x = 0;
        leftKneePivot.rotation.x = -0.05;
        leftBoot.rotation.x = 0;
        rightLegRoot.rotation.x = 0;
        rightKneePivot.rotation.x = -0.05;
        rightBoot.rotation.x = 0;

        // Organic respiration: subtle chest heave and pelvic breath cycle
        const breathe = Math.sin(idleTimer);
        pelvis.position.y = 0.95 + breathe * 0.003;
        torso.position.y = 1.30 + breathe * 0.007;
        torso.rotation.y = 0;
        torso.rotation.z = 0;

        // Subtle tactical head scanning (alert soldier presence)
        head.rotation.y = Math.sin(idleTimer * 0.45) * 0.12;
        head.rotation.x = Math.sin(idleTimer * 0.22) * 0.04;

        if (type === 'enemy') {
          // Ready combat weapon stance with subtle organic breathing drift
          rightArmRoot.rotation.set(-Math.PI / 3 + breathe * 0.015, 0.2, -0.3);
          leftArmRoot.rotation.set(-Math.PI / 2.6 + breathe * 0.015, -0.4, 0.5);
        } else {
          // Instructor standing at ease at armory counter
          leftArmRoot.rotation.set(0.1 + breathe * 0.015, 0, 0.1);
          rightArmRoot.rotation.set(0.15 + breathe * 0.015, 0, -0.15);
        }
      }
    };

    const playFlinch = () => {
      torso.rotation.x = 0.2;
      torso.rotation.y = (Math.random() - 0.5) * 0.3;
      setTimeout(() => {
        torso.rotation.x = 0;
        torso.rotation.y = 0;
      }, 140);
    };

    const playDeath = () => {
      // Ragdoll / collapse animation
      let t = 0;
      const deathLoop = () => {
        t += 0.08;
        root.position.y = Math.max(0.2, root.position.y - 0.08);
        root.rotation.x = Math.min(Math.PI / 2, root.rotation.x + 0.12);
        root.rotation.z = Math.min(0.3, root.rotation.z + 0.04);
        torso.rotation.x = 0.3;
        leftArmRoot.rotation.z = 0.8;
        rightArmRoot.rotation.z = -0.8;
        if (t < 1.2) {
          requestAnimationFrame(deathLoop);
        }
      };
      deathLoop();
    };

    return {
      root,
      head,
      torso,
      leftArm: leftArmRoot,
      rightArm: rightArmRoot,
      leftLeg: leftLegRoot,
      rightLeg: rightLegRoot,
      weaponMesh,
      animate,
      playDeath,
      playFlinch,
      dispose: () => {
        root.dispose();
      }
    };
  }

  /**
   * Helper to build a third-person AK rifle for combatant bots
   */
  private static buildCompactRifle(scene: Scene, id: string, metalMat: StandardMaterial, woodMat: StandardMaterial): Mesh {
    const receiver = MeshBuilder.CreateBox(`${id}_rec`, { width: 0.05, height: 0.08, depth: 0.38 }, scene);
    receiver.material = metalMat;

    const barrel = MeshBuilder.CreateCylinder(`${id}_bar`, { height: 0.36, diameter: 0.02 }, scene);
    barrel.parent = receiver;
    barrel.position.set(0, 0.015, 0.32);
    barrel.rotation.x = Math.PI / 2;
    barrel.material = metalMat;

    const stock = MeshBuilder.CreateBox(`${id}_stk`, { width: 0.04, height: 0.10, depth: 0.24 }, scene);
    stock.parent = receiver;
    stock.position.set(0, -0.02, -0.28);
    stock.material = woodMat;

    const handguard = MeshBuilder.CreateBox(`${id}_hg`, { width: 0.05, height: 0.06, depth: 0.18 }, scene);
    handguard.parent = receiver;
    handguard.position.set(0, 0.01, 0.20);
    handguard.material = woodMat;

    // Curved banana magazine
    const mag = MeshBuilder.CreateBox(`${id}_mag`, { width: 0.035, height: 0.18, depth: 0.08 }, scene);
    mag.parent = receiver;
    mag.position.set(0, -0.10, 0.06);
    mag.rotation.x = 0.35;
    mag.material = metalMat;

    return receiver;
  }
}
