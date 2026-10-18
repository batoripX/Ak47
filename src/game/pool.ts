import {
  Scene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Vector3
} from '@babylonjs/core';

export interface PooledCasing {
  mesh: Mesh;
  velocity: Vector3;
  rotVelocity: Vector3;
  life: number;
  isActive: boolean;
}

export interface PooledImpact {
  sparkMesh: Mesh;
  decalMesh: Mesh;
  life: number;
  isActive: boolean;
}

export class ObjectPoolManager {
  private scene: Scene;

  // 1. Brass Casing Pool (35 pre-allocated meshes)
  private casingPool: PooledCasing[] = [];
  private casingIndex: number = 0;
  private readonly MAX_CASINGS = 35;

  // 2. Bullet Impact Pool (30 pre-allocated spark + decal pairs)
  private impactPool: PooledImpact[] = [];
  private impactIndex: number = 0;
  private readonly MAX_IMPACTS = 30;

  constructor(scene: Scene) {
    this.scene = scene;
    this.initCasingPool();
    this.initImpactPool();
  }

  private initCasingPool() {
    const brassMat = new StandardMaterial('pool_brass_mat', this.scene);
    brassMat.diffuseColor = new Color3(0.85, 0.65, 0.15);
    brassMat.specularColor = new Color3(0.9, 0.8, 0.4);
    brassMat.freeze();

    for (let i = 0; i < this.MAX_CASINGS; i++) {
      const mesh = MeshBuilder.CreateCylinder(`casing_pool_${i}`, { height: 0.035, diameter: 0.01 }, this.scene);
      mesh.material = brassMat;
      mesh.isVisible = false;
      mesh.isPickable = false;

      this.casingPool.push({
        mesh,
        velocity: Vector3.Zero(),
        rotVelocity: Vector3.Zero(),
        life: 0,
        isActive: false
      });
    }
  }

  private initImpactPool() {
    const sparkMat = new StandardMaterial('pool_spark_mat', this.scene);
    sparkMat.emissiveColor = new Color3(1.0, 0.85, 0.3);
    sparkMat.disableLighting = true;
    sparkMat.freeze();

    const decalMat = new StandardMaterial('pool_decal_mat', this.scene);
    decalMat.diffuseColor = new Color3(0.08, 0.08, 0.08);
    decalMat.specularColor = Color3.Black();
    decalMat.freeze();

    for (let i = 0; i < this.MAX_IMPACTS; i++) {
      const spark = MeshBuilder.CreateDisc(`spark_pool_${i}`, { radius: 0.09, tessellation: 4 }, this.scene);
      spark.material = sparkMat;
      spark.isVisible = false;
      spark.isPickable = false;

      const decal = MeshBuilder.CreateDisc(`decal_pool_${i}`, { radius: 0.045, tessellation: 8 }, this.scene);
      decal.material = decalMat;
      decal.isVisible = false;
      decal.isPickable = false;

      this.impactPool.push({
        sparkMesh: spark,
        decalMesh: decal,
        life: 0,
        isActive: false
      });
    }
  }

  /**
   * Spawn brass casing from object pool (zero heap allocation)
   */
  public spawnCasing(origin: Vector3, forward: Vector3, right: Vector3, up: Vector3) {
    const item = this.casingPool[this.casingIndex];
    this.casingIndex = (this.casingIndex + 1) % this.MAX_CASINGS;

    item.mesh.position.copyFrom(origin);
    item.velocity.copyFrom(
      right.scale(2.2 + Math.random() * 0.7)
        .add(up.scale(1.6 + Math.random() * 0.5))
        .add(forward.scale(-0.3 + Math.random() * 0.3))
    );
    item.rotVelocity.set(Math.random() * 25, Math.random() * 25, Math.random() * 25);
    item.life = 1.6;
    item.isActive = true;
    item.mesh.isVisible = true;
  }

  /**
   * Spawn bullet impact spark and surface mark from object pool (zero heap allocation)
   */
  public spawnImpact(point: Vector3, normal: Vector3) {
    const item = this.impactPool[this.impactIndex];
    this.impactIndex = (this.impactIndex + 1) % this.MAX_IMPACTS;

    // Position spark slightly offset along surface normal
    item.sparkMesh.position.copyFrom(point.add(normal.scale(0.02)));
    item.sparkMesh.lookAt(point.add(normal));
    item.sparkMesh.isVisible = true;

    // Position bullet impact mark
    item.decalMesh.position.copyFrom(point.add(normal.scale(0.005)));
    item.decalMesh.lookAt(point.add(normal));
    item.decalMesh.isVisible = true;

    item.life = 12.0; // Mark stays for 12 seconds
    item.isActive = true;
  }

  /**
   * Per-frame update of active pooled objects
   */
  public update(dt: number) {
    // 1. Update Casings
    for (let i = 0; i < this.MAX_CASINGS; i++) {
      const c = this.casingPool[i];
      if (!c.isActive) continue;

      c.life -= dt;
      c.velocity.y -= 9.8 * dt; // Gravity
      c.mesh.position.addInPlace(c.velocity.scale(dt));
      c.mesh.rotation.addInPlace(c.rotVelocity.scale(dt));

      // Ground bounce / settle
      if (c.mesh.position.y < 0.02) {
        c.mesh.position.y = 0.02;
        c.velocity.set(0, 0, 0);
        c.rotVelocity.set(0, 0, 0);
      }

      if (c.life <= 0) {
        c.isActive = false;
        c.mesh.isVisible = false;
      }
    }

    // 2. Update Impacts
    for (let i = 0; i < this.MAX_IMPACTS; i++) {
      const imp = this.impactPool[i];
      if (!imp.isActive) continue;

      imp.life -= dt;

      // Spark hides after 0.07s
      if (imp.life < 11.93 && imp.sparkMesh.isVisible) {
        imp.sparkMesh.isVisible = false;
      }

      // Decal mark hides when life expires
      if (imp.life <= 0) {
        imp.isActive = false;
        imp.decalMesh.isVisible = false;
      }
    }
  }

  public dispose() {
    this.casingPool.forEach((c) => c.mesh.dispose());
    this.impactPool.forEach((imp) => {
      imp.sparkMesh.dispose();
      imp.decalMesh.dispose();
    });
    this.casingPool = [];
    this.impactPool = [];
  }
}
