import {
  Scene,
  Vector3,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Mesh,
  TransformNode
} from '@babylonjs/core';
import { CoverNode } from './ai';
import { soundEngine } from './audio';
import { ObjectPoolManager } from './pool';

export interface ReactiveTarget {
  root: TransformNode;
  plate: Mesh;
  distance: number;
  isDown: boolean;
  hit: () => void;
  reset: () => void;
}

export interface WorldObjects {
  ground: Mesh;
  colliders: Mesh[];
  coverNodes: CoverNode[];
  targets: ReactiveTarget[];
  ammoCrates: Mesh[];
  medkits: Mesh[];
  safeZoneZ: number;
}

export class MilitaryCompound {
  private scene: Scene;
  private poolManager: ObjectPoolManager;
  public readonly safeZoneBoundaryZ = -15.0;

  constructor(scene: Scene, poolManager: ObjectPoolManager) {
    this.scene = scene;
    this.poolManager = poolManager;
  }

  public build(): WorldObjects {
    const colliders: Mesh[] = [];
    const coverNodes: CoverNode[] = [];
    const targets: ReactiveTarget[] = [];
    const ammoCrates: Mesh[] = [];
    const medkits: Mesh[] = [];

    // --- MATERIALS ---
    const terrainMat = new StandardMaterial('compound_ground', this.scene);
    terrainMat.diffuseColor = new Color3(0.58, 0.52, 0.40); // Khaki dirt / military soil
    terrainMat.specularColor = new Color3(0.05, 0.05, 0.05);

    const concreteMat = new StandardMaterial('compound_concrete', this.scene);
    concreteMat.diffuseColor = new Color3(0.48, 0.50, 0.52);
    concreteMat.specularColor = new Color3(0.12, 0.12, 0.12);

    const woodWallMat = new StandardMaterial('compound_plywood', this.scene);
    woodWallMat.diffuseColor = new Color3(0.55, 0.40, 0.25);
    woodWallMat.specularColor = new Color3(0.04, 0.04, 0.04);

    const sandbagMat = new StandardMaterial('compound_sandbag', this.scene);
    sandbagMat.diffuseColor = new Color3(0.68, 0.60, 0.44);

    const metalContainerRed = new StandardMaterial('container_red', this.scene);
    metalContainerRed.diffuseColor = new Color3(0.55, 0.18, 0.15);
    metalContainerRed.specularColor = new Color3(0.3, 0.3, 0.3);

    const metalContainerOlive = new StandardMaterial('container_olive', this.scene);
    metalContainerOlive.diffuseColor = new Color3(0.25, 0.32, 0.22);
    metalContainerOlive.specularColor = new Color3(0.3, 0.3, 0.3);

    const metalDark = new StandardMaterial('metal_dark', this.scene);
    metalDark.diffuseColor = new Color3(0.18, 0.20, 0.22);
    metalDark.specularColor = new Color3(0.4, 0.4, 0.4);

    const targetSteelMat = new StandardMaterial('target_steel', this.scene);
    targetSteelMat.diffuseColor = new Color3(0.92, 0.92, 0.92);
    targetSteelMat.specularColor = new Color3(0.6, 0.6, 0.6);

    const targetRedMat = new StandardMaterial('target_bullseye', this.scene);
    targetRedMat.diffuseColor = new Color3(0.85, 0.15, 0.15);

    const hazardYellowMat = new StandardMaterial('hazard_yellow', this.scene);
    hazardYellowMat.diffuseColor = new Color3(0.9, 0.75, 0.1);
    hazardYellowMat.emissiveColor = new Color3(0.3, 0.25, 0.05);

    // --- 1. EXPANSIVE GROUND & PERIMETER ---
    const ground = MeshBuilder.CreateGround('compound_ground', { width: 140, height: 140 }, this.scene);
    ground.material = terrainMat;
    ground.checkCollisions = true;

    // Yellow Hazard Demarcation Line on ground (Z = -15) marking the Armory Safe Zone exit
    const safeZoneLine = MeshBuilder.CreateBox('safe_zone_demarcation', { width: 40, height: 0.02, depth: 0.6 }, this.scene);
    safeZoneLine.position.set(0, 0.015, this.safeZoneBoundaryZ);
    safeZoneLine.material = hazardYellowMat;

    // Perimeter boundary walls
    const perimWalls = [
      { w: 140, h: 4, d: 1, pos: new Vector3(0, 2, 70) },
      { w: 140, h: 4, d: 1, pos: new Vector3(0, 2, -70) },
      { w: 1, h: 4, d: 140, pos: new Vector3(70, 2, 0) },
      { w: 1, h: 4, d: 140, pos: new Vector3(-70, 2, 0) }
    ];
    perimWalls.forEach((p, idx) => {
      const wall = MeshBuilder.CreateBox(`perim_wall_${idx}`, { width: p.w, height: p.h, depth: p.d }, this.scene);
      wall.position.copyFrom(p.pos);
      wall.material = concreteMat;
      wall.checkCollisions = true;
      colliders.push(wall);
    });

    // --- 2. STAGING AREA & ARMORY BRIEFING POST (SAFE ZONE) ---
    const armorySlab = MeshBuilder.CreateBox('armory_slab', { width: 18, height: 0.2, depth: 14 }, this.scene);
    armorySlab.position.set(0, 0.1, -28);
    armorySlab.material = concreteMat;
    armorySlab.checkCollisions = true;

    // Roof pillars & canopy
    for (const px of [-8, 8]) {
      for (const pz of [-34, -22]) {
        const pillar = MeshBuilder.CreateCylinder(`armory_pillar_${px}_${pz}`, { height: 4.5, diameter: 0.3 }, this.scene);
        pillar.position.set(px, 2.25, pz);
        pillar.material = metalDark;
        pillar.checkCollisions = true;
        colliders.push(pillar);
      }
    }
    const armoryRoof = MeshBuilder.CreateBox('armory_roof', { width: 19, height: 0.3, depth: 15 }, this.scene);
    armoryRoof.position.set(0, 4.5, -28);
    armoryRoof.material = metalDark;

    // Instructor Briefing Desk
    const desk = MeshBuilder.CreateBox('instructor_desk', { width: 3.2, height: 1.0, depth: 1.0 }, this.scene);
    desk.position.set(0, 0.5, -26);
    desk.material = woodWallMat;
    desk.checkCollisions = true;
    colliders.push(desk);

    // Ammo Resupply Crate at Staging Area
    const stagingAmmoCrate = MeshBuilder.CreateBox('staging_ammo_crate', { width: 1.2, height: 0.7, depth: 0.8 }, this.scene);
    stagingAmmoCrate.position.set(-4, 0.35, -25);
    const ammoMat = new StandardMaterial('ammo_mat', this.scene);
    ammoMat.diffuseColor = new Color3(0.2, 0.45, 0.2);
    stagingAmmoCrate.material = ammoMat;
    stagingAmmoCrate.checkCollisions = true;
    colliders.push(stagingAmmoCrate);
    ammoCrates.push(stagingAmmoCrate);

    // First Aid Kit at Staging Area
    const stagingMedkit = MeshBuilder.CreateBox('staging_medkit', { width: 0.8, height: 0.5, depth: 0.6 }, this.scene);
    stagingMedkit.position.set(4, 0.25, -25);
    const medkitMat = new StandardMaterial('medkit_mat', this.scene);
    medkitMat.diffuseColor = new Color3(0.9, 0.85, 0.8);
    stagingMedkit.material = medkitMat;
    stagingMedkit.checkCollisions = true;
    colliders.push(stagingMedkit);
    medkits.push(stagingMedkit);

    // --- 3. FIRING RANGE LANE (West Sector) ---
    const bench = MeshBuilder.CreateBox('firing_bench', { width: 22, height: 1.0, depth: 1.2 }, this.scene);
    bench.position.set(-25, 0.5, -12);
    bench.material = concreteMat;
    bench.checkCollisions = true;
    colliders.push(bench);

    this.createSandbagBunker(new Vector3(-25, 0, -10), sandbagMat, colliders, coverNodes);

    // Target Distances: 25m, 50m, 75m, 100m
    const targetDistances = [
      { z: 10, dist: 25 },
      { z: 25, dist: 50 },
      { z: 40, dist: 75 },
      { z: 55, dist: 100 }
    ];

    targetDistances.forEach((td) => {
      for (let tx = -32; tx <= -18; tx += 7) {
        const targetNode = new TransformNode(`target_${td.dist}m_${tx}`, this.scene);
        targetNode.position.set(tx, 0, td.z);

        const stand = MeshBuilder.CreateCylinder(`target_stand_${td.dist}_${tx}`, { height: 1.3, diameter: 0.08 }, this.scene);
        stand.parent = targetNode;
        stand.position.y = 0.65;
        stand.material = metalDark;

        const plate = MeshBuilder.CreateBox(`target_plate_${td.dist}_${tx}`, { width: 0.55, height: 0.9, depth: 0.05 }, this.scene);
        plate.parent = targetNode;
        plate.position.set(0, 1.4, 0);
        plate.material = targetSteelMat;

        const bullseye = MeshBuilder.CreateDisc(`target_bull_${td.dist}_${tx}`, { radius: 0.12 }, this.scene);
        bullseye.parent = plate;
        bullseye.position.set(0, 0.1, -0.026);
        bullseye.material = targetRedMat;

        const reactiveTarget: ReactiveTarget = {
          root: targetNode,
          plate,
          distance: td.dist,
          isDown: false,
          hit: () => {
            if (reactiveTarget.isDown) return;
            reactiveTarget.isDown = true;
            soundEngine.playSteelTargetHit();
            plate.rotation.x = -Math.PI / 2.2;
            setTimeout(() => {
              reactiveTarget.reset();
            }, 3000);
          },
          reset: () => {
            plate.rotation.x = 0;
            reactiveTarget.isDown = false;
          }
        };

        (plate as unknown as { targetRef: ReactiveTarget }).targetRef = reactiveTarget;
        targets.push(reactiveTarget);
        colliders.push(plate);
      }
    });

    // --- 4. CQB KILLHOUSE MAZE & URBAN OBSTACLES (East Sector) ---
    const containerDefs = [
      { pos: new Vector3(15, 1.4, 0), rot: 0, mat: metalContainerRed },
      { pos: new Vector3(30, 1.4, 12), rot: Math.PI / 4, mat: metalContainerOlive },
      { pos: new Vector3(22, 1.4, 28), rot: -Math.PI / 6, mat: metalContainerRed },
      { pos: new Vector3(38, 1.4, 32), rot: Math.PI / 2, mat: metalContainerOlive }
    ];

    containerDefs.forEach((c, idx) => {
      const container = MeshBuilder.CreateBox(`container_${idx}`, { width: 3.2, height: 2.8, depth: 7.5 }, this.scene);
      container.position.copyFrom(c.pos);
      container.rotation.y = c.rot;
      container.material = c.mat;
      container.checkCollisions = true;
      colliders.push(container);

      coverNodes.push({ position: c.pos.add(new Vector3(-2, 0, 3.8)), normal: new Vector3(-1, 0, 0) });
      coverNodes.push({ position: c.pos.add(new Vector3(2, 0, -3.8)), normal: new Vector3(1, 0, 0) });
    });

    // Killhouse Plywood Breach Walls
    const killhouseWalls = [
      { w: 12, h: 3.0, d: 0.2, pos: new Vector3(20, 1.5, -8), rot: 0 },
      { w: 0.2, h: 3.0, d: 14, pos: new Vector3(14, 1.5, -1), rot: 0 },
      { w: 0.2, h: 3.0, d: 18, pos: new Vector3(28, 1.5, 6), rot: 0 },
      { w: 6, h: 3.0, d: 0.2, pos: new Vector3(18, 1.5, 6), rot: 0 },
      { w: 7, h: 3.0, d: 0.2, pos: new Vector3(23, 1.5, 15), rot: 0 },
      { w: 0.2, h: 3.0, d: 8, pos: new Vector3(20, 1.5, 20), rot: 0 },
      { w: 5, h: 3.0, d: 0.2, pos: new Vector3(36, 1.5, 20), rot: Math.PI / 4 }
    ];

    killhouseWalls.forEach((kw, idx) => {
      const wall = MeshBuilder.CreateBox(`killhouse_wall_${idx}`, { width: kw.w, height: kw.h, depth: kw.d }, this.scene);
      wall.position.copyFrom(kw.pos);
      wall.rotation.y = kw.rot;
      wall.material = woodWallMat;
      wall.checkCollisions = true;
      colliders.push(wall);
    });

    // Concrete Jersey Barriers
    const barrierPositions = [
      new Vector3(5, 0.6, 5),
      new Vector3(10, 0.6, 18),
      new Vector3(18, 0.6, -2),
      new Vector3(26, 0.6, 22),
      new Vector3(34, 0.6, 6)
    ];

    barrierPositions.forEach((bp, idx) => {
      const barrier = MeshBuilder.CreateBox(`barrier_${idx}`, { width: 3.2, height: 1.2, depth: 0.6 }, this.scene);
      barrier.position.copyFrom(bp);
      barrier.material = concreteMat;
      barrier.checkCollisions = true;
      colliders.push(barrier);

      coverNodes.push({ position: bp.add(new Vector3(0, 0, -1.0)), normal: new Vector3(0, 0, -1) });
      coverNodes.push({ position: bp.add(new Vector3(0, 0, 1.0)), normal: new Vector3(0, 0, 1) });
    });

    this.createSandbagBunker(new Vector3(16, 0, 12), sandbagMat, colliders, coverNodes);
    this.createSandbagBunker(new Vector3(25, 0, 24), sandbagMat, colliders, coverNodes);

    // Ammo Crates & Medkits inside CQB
    const cqbAmmo1 = MeshBuilder.CreateBox('cqb_ammo_1', { width: 1.0, height: 0.6, depth: 0.7 }, this.scene);
    cqbAmmo1.position.set(15, 0.3, -4);
    cqbAmmo1.material = ammoMat;
    cqbAmmo1.checkCollisions = true;
    ammoCrates.push(cqbAmmo1);
    colliders.push(cqbAmmo1);

    const cqbMedkit = MeshBuilder.CreateBox('cqb_medkit_1', { width: 0.8, height: 0.5, depth: 0.6 }, this.scene);
    cqbMedkit.position.set(21, 0.25, 10);
    cqbMedkit.material = medkitMat;
    cqbMedkit.checkCollisions = true;
    medkits.push(cqbMedkit);
    colliders.push(cqbMedkit);

    return {
      ground,
      colliders,
      coverNodes,
      targets,
      ammoCrates,
      medkits,
      safeZoneZ: this.safeZoneBoundaryZ
    };
  }

  private createSandbagBunker(pos: Vector3, sandbagMat: StandardMaterial, colliders: Mesh[], coverNodes: CoverNode[]) {
    const bunkerRoot = new TransformNode(`sandbag_bunker_${pos.x}_${pos.z}`, this.scene);
    bunkerRoot.position.copyFrom(pos);

    for (let layer = 0; layer < 3; layer++) {
      for (let s = -1; s <= 1; s++) {
        const bag = MeshBuilder.CreateBox(`bag_${layer}_${s}`, { width: 0.85, height: 0.32, depth: 0.45 }, this.scene);
        bag.parent = bunkerRoot;
        bag.position.set(s * 0.82 + (layer % 2 === 1 ? 0.35 : 0), layer * 0.30 + 0.16, 0);
        bag.material = sandbagMat;
        bag.checkCollisions = true;
        colliders.push(bag);
      }
    }

    coverNodes.push({
      position: pos.add(new Vector3(0, 0, -1.2)),
      normal: new Vector3(0, 0, -1)
    });
  }

  /**
   * Spawn pooled bullet impact sparks and surface decal
   */
  public spawnBulletImpact(hitPos: Vector3, hitNormal: Vector3) {
    this.poolManager.spawnImpact(hitPos, hitNormal);
  }
}
