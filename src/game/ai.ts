import {
  Scene,
  Vector3,
  Ray,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3
} from '@babylonjs/core';
import { CharacterBuilder, HumanoidCharacter } from './characterBuilder';
import { soundEngine } from './audio';

export type AIState = 'PATROL' | 'SEARCH' | 'ENGAGE' | 'TAKE_COVER' | 'PEEK' | 'FLANK';

export interface CoverNode {
  position: Vector3;
  normal: Vector3;
}

export class TacticalBot {
  public id: string;
  private scene: Scene;
  public character: HumanoidCharacter;
  public position: Vector3;
  public velocity: Vector3 = Vector3.Zero();

  // Combat & Stats
  public health: number = 100;
  public maxHealth: number = 100;
  public isDead: boolean = false;
  public state: AIState = 'PATROL';

  // AI navigation & perception
  private waypoints: Vector3[];
  private currentWaypointIdx: number = 0;
  private lastKnownPlayerPos: Vector3 | null = null;
  private targetCoverPos: Vector3 | null = null;
  private searchTimer: number = 0;
  private stateTimer: number = 0;
  private walkCycle: number = 0;

  // Firing behavior
  private burstCount: number = 0;
  private burstCooldown: number = 0;
  private lastShotTime: number = 0;
  private muzzleFlashMesh: Mesh;

  private moveSpeed: number = 3.2;

  constructor(scene: Scene, id: string, spawnPos: Vector3, patrolWaypoints: Vector3[]) {
    this.id = id;
    this.scene = scene;
    this.position = spawnPos.clone();
    this.waypoints = patrolWaypoints.length > 0 ? patrolWaypoints : [spawnPos.clone()];

    this.character = CharacterBuilder.createHumanoid(scene, id, 'enemy', spawnPos);

    this.muzzleFlashMesh = MeshBuilder.CreateDisc(`bot_flash_${id}`, { radius: 0.1, tessellation: 6 }, scene);
    if (this.character.weaponMesh) {
      this.muzzleFlashMesh.parent = this.character.weaponMesh;
      this.muzzleFlashMesh.position.set(0, 0, 0.45);
    }
    const flashMat = new StandardMaterial(`bot_flash_mat_${id}`, scene);
    flashMat.emissiveColor = new Color3(1.0, 0.7, 0.2);
    flashMat.disableLighting = true;
    this.muzzleFlashMesh.material = flashMat;
    this.muzzleFlashMesh.isVisible = false;
  }

  public onHearGunshot(shotOrigin: Vector3, isSafeZone: boolean) {
    if (this.isDead || isSafeZone) return;
    const dist = Vector3.Distance(this.position, shotOrigin);
    if (dist < 60) {
      this.lastKnownPlayerPos = shotOrigin.clone();
      if (this.state === 'PATROL') {
        this.state = 'SEARCH';
        this.searchTimer = 8;
      }
    }
  }

  public takeDamage(amount: number, hitLocation: 'head' | 'body', playerPos: Vector3): boolean {
    if (this.isDead) return false;

    const multiplier = hitLocation === 'head' ? 2.5 : 1.0;
    const finalDamage = amount * multiplier;
    this.health = Math.max(0, this.health - finalDamage);

    this.character.playFlinch();
    this.lastKnownPlayerPos = playerPos.clone();

    if (this.health < 40 && this.state !== 'TAKE_COVER') {
      this.state = 'TAKE_COVER';
      this.stateTimer = 5;
    } else if (this.state === 'PATROL' || this.state === 'SEARCH') {
      this.state = 'ENGAGE';
    }

    if (this.health <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  private die() {
    this.isDead = true;
    this.muzzleFlashMesh.isVisible = false;
    this.character.playDeath();
    this.spawnAmmoDrop();
  }

  private spawnAmmoDrop() {
    const drop = MeshBuilder.CreateBox(`ammo_drop_${this.id}`, { width: 0.4, height: 0.25, depth: 0.3 }, this.scene);
    drop.position.set(this.position.x, 0.15, this.position.z);
    const dropMat = new StandardMaterial(`drop_mat_${this.id}`, this.scene);
    dropMat.diffuseColor = new Color3(0.2, 0.5, 0.2);
    dropMat.emissiveColor = new Color3(0.05, 0.2, 0.05);
    drop.material = dropMat;
    (drop as unknown as { isAmmoDrop: boolean; ammoAmount: number }).isAmmoDrop = true;
    (drop as unknown as { isAmmoDrop: boolean; ammoAmount: number }).ammoAmount = 45;
  }

  /**
   * Main tactical tick with Safe Zone compliance
   */
  public update(
    dt: number,
    playerPos: Vector3,
    isPlayerInSafeZone: boolean,
    coverNodes: CoverNode[],
    obstacleMeshes: Mesh[],
    onBotFireAtPlayer: (botPos: Vector3, bot: TacticalBot) => void
  ) {
    if (this.isDead) return;

    this.stateTimer -= dt;
    this.searchTimer -= dt;

    // Check direct Line of Sight to player (if player is not in safe zone)
    const distToPlayer = Vector3.Distance(this.position, playerPos);
    const hasLOS = !isPlayerInSafeZone && this.checkLineOfSight(playerPos, obstacleMeshes);

    if (isPlayerInSafeZone) {
      // Player is in safe staging area -> enemies NEVER attack!
      if (this.state === 'ENGAGE' || this.state === 'SEARCH' || this.state === 'PEEK' || this.state === 'FLANK') {
        this.state = 'PATROL';
        this.lastKnownPlayerPos = null;
      }
    } else {
      if (hasLOS) {
        this.lastKnownPlayerPos = playerPos.clone();
        if (this.state === 'PATROL' || this.state === 'SEARCH') {
          this.state = 'ENGAGE';
        }
      } else {
        if (this.state === 'ENGAGE') {
          this.state = 'SEARCH';
          this.searchTimer = 6;
        }
      }
    }

    // State Machine execution
    let targetMovePos: Vector3 | null = null;
    let lookTarget: Vector3 = playerPos;

    switch (this.state) {
      case 'PATROL': {
        this.moveSpeed = 1.35; // Regular human patrol pace
        targetMovePos = this.waypoints[this.currentWaypointIdx];
        if (Vector3.Distance(this.position, targetMovePos) < 1.5) {
          this.currentWaypointIdx = (this.currentWaypointIdx + 1) % this.waypoints.length;
          targetMovePos = this.waypoints[this.currentWaypointIdx];
        }
        lookTarget = targetMovePos;
        break;
      }

      case 'SEARCH': {
        this.moveSpeed = 1.6; // Alert tactical search pace
        if (this.lastKnownPlayerPos) {
          targetMovePos = this.lastKnownPlayerPos;
          lookTarget = this.lastKnownPlayerPos;
          if (Vector3.Distance(this.position, this.lastKnownPlayerPos) < 2.0 || this.searchTimer <= 0) {
            this.state = 'PATROL';
            this.lastKnownPlayerPos = null;
          }
        } else {
          this.state = 'PATROL';
        }
        break;
      }

      case 'ENGAGE': {
        lookTarget = playerPos;
        if (this.health < 40) {
          this.state = 'TAKE_COVER';
          this.stateTimer = 5;
          this.findBestCover(playerPos, coverNodes, obstacleMeshes);
          break;
        }

        if (distToPlayer > 18) {
          this.moveSpeed = 1.75;
          targetMovePos = playerPos;
        } else if (distToPlayer < 6) {
          this.moveSpeed = 1.4;
          const awayDir = this.position.subtract(playerPos).normalize();
          targetMovePos = this.position.add(awayDir.scale(4));
        } else {
          this.moveSpeed = 1.3;
          // In combat zone: if good line of sight, plant feet into steady tactical shooting stance
          if (!hasLOS) {
            targetMovePos = playerPos;
          } else {
            targetMovePos = null;
          }
        }

        // Shoot at player only if NOT in safe zone
        if (!isPlayerInSafeZone) {
          this.handleCombatShooting(dt, playerPos, onBotFireAtPlayer);
        }
        break;
      }

      case 'TAKE_COVER': {
        this.moveSpeed = 2.4; // Tactical sprint to cover
        if (!this.targetCoverPos) {
          this.findBestCover(playerPos, coverNodes, obstacleMeshes);
        }

        if (this.targetCoverPos) {
          targetMovePos = this.targetCoverPos;
          lookTarget = targetMovePos;
          if (Vector3.Distance(this.position, this.targetCoverPos) < 1.2 || this.stateTimer <= 0) {
            this.state = 'PEEK';
            this.stateTimer = 2.0 + Math.random() * 2.0;
          }
        } else {
          this.state = 'ENGAGE';
        }
        break;
      }

      case 'PEEK': {
        lookTarget = playerPos;
        targetMovePos = null; // Plant feet while peeking from cover
        if (this.stateTimer <= 0) {
          if (Math.random() < 0.4) {
            this.state = 'FLANK';
            this.stateTimer = 4;
          } else {
            this.state = 'ENGAGE';
          }
        } else {
          if (hasLOS && !isPlayerInSafeZone) {
            this.handleCombatShooting(dt, playerPos, onBotFireAtPlayer);
          }
        }
        break;
      }

      case 'FLANK': {
        this.moveSpeed = 2.2; // Tactical combat jog flanking maneuver
        const toPlayer = playerPos.subtract(this.position).normalize();
        const flankDir = new Vector3(-toPlayer.z, 0, toPlayer.x).scale(Math.random() > 0.5 ? 1 : -1);
        targetMovePos = this.position.add(flankDir.scale(6)).add(toPlayer.scale(2.5));
        lookTarget = playerPos;

        if (this.stateTimer <= 0 || hasLOS) {
          this.state = 'ENGAGE';
        }
        break;
      }
    }

    // Dynamic Navigation & Avoidance
    const prevPos = this.position.clone();
    let isMoving = false;

    if (targetMovePos) {
      this.moveTowardWithAvoidance(dt, targetMovePos, obstacleMeshes);
      const movedDist = Vector3.Distance(this.position, prevPos);
      isMoving = movedDist > 0.001;
    }

    if (isMoving) {
      this.walkCycle += dt * this.moveSpeed * 3.4;
    }

    this.character.animate(
      this.walkCycle,
      isMoving,
      this.state === 'ENGAGE' || this.state === 'PEEK',
      dt
    );

    this.faceTarget(lookTarget, dt);

    this.position.y = 0;
    this.character.root.position.copyFrom(this.position);
  }

  private moveTowardWithAvoidance(dt: number, target: Vector3, obstacleMeshes: Mesh[]) {
    const toTarget = target.subtract(this.position);
    toTarget.y = 0;
    if (toTarget.length() < 0.2) return;

    let desiredDir = toTarget.normalize();
    const origin = new Vector3(this.position.x, 0.8, this.position.z);
    const centerRay = new Ray(origin, desiredDir, 2.4);

    const hitCenter = this.scene.pickWithRay(centerRay, (m) => obstacleMeshes.includes(m as Mesh) && m !== this.character.root);

    if (hitCenter && hitCenter.hit) {
      const leftDir = new Vector3(
        desiredDir.x * Math.cos(0.6) - desiredDir.z * Math.sin(0.6),
        0,
        desiredDir.x * Math.sin(0.6) + desiredDir.z * Math.cos(0.6)
      );
      const rightDir = new Vector3(
        desiredDir.x * Math.cos(-0.6) - desiredDir.z * Math.sin(-0.6),
        0,
        desiredDir.x * Math.sin(-0.6) + desiredDir.z * Math.cos(-0.6)
      );

      const hitLeft = this.scene.pickWithRay(new Ray(origin, leftDir, 2.4), (m) => obstacleMeshes.includes(m as Mesh));
      const hitRight = this.scene.pickWithRay(new Ray(origin, rightDir, 2.4), (m) => obstacleMeshes.includes(m as Mesh));

      if (!hitRight || !hitRight.hit) {
        desiredDir = rightDir;
      } else if (!hitLeft || !hitLeft.hit) {
        desiredDir = leftDir;
      } else {
        desiredDir = new Vector3(-desiredDir.z, 0, desiredDir.x);
      }
    }

    const moveStep = desiredDir.scale(this.moveSpeed * dt);
    this.position.addInPlace(moveStep);
  }

  private faceTarget(target: Vector3, dt: number) {
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const targetAngle = Math.atan2(dx, dz);

    let currentAngle = this.character.root.rotation.y;
    let diff = targetAngle - currentAngle;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;

    this.character.root.rotation.y += diff * Math.min(1, 10 * dt);
  }

  private findBestCover(playerPos: Vector3, coverNodes: CoverNode[], obstacleMeshes: Mesh[]) {
    let bestCover: CoverNode | null = null;
    let bestDist = Infinity;

    for (const node of coverNodes) {
      const dist = Vector3.Distance(this.position, node.position);
      if (dist < 25 && dist < bestDist) {
        const rayOrigin = new Vector3(node.position.x, 1.2, node.position.z);
        const rayDir = playerPos.subtract(rayOrigin).normalize();
        const rayDist = Vector3.Distance(rayOrigin, playerPos);
        const ray = new Ray(rayOrigin, rayDir, rayDist);
        const hit = this.scene.pickWithRay(ray, (m) => obstacleMeshes.includes(m as Mesh));

        if (hit && hit.hit && hit.distance < rayDist - 1.0) {
          bestCover = node;
          bestDist = dist;
        }
      }
    }

    if (bestCover) {
      this.targetCoverPos = bestCover.position.clone();
    } else {
      const awayDir = this.position.subtract(playerPos).normalize();
      this.targetCoverPos = this.position.add(awayDir.scale(6));
    }
  }

  private checkLineOfSight(playerPos: Vector3, obstacleMeshes: Mesh[]): boolean {
    const origin = new Vector3(this.position.x, 1.5, this.position.z);
    const targetEye = new Vector3(playerPos.x, 1.6, playerPos.z);
    const dir = targetEye.subtract(origin).normalize();
    const dist = Vector3.Distance(origin, targetEye);

    if (dist > 45) return false;

    const ray = new Ray(origin, dir, dist);
    const hit = this.scene.pickWithRay(ray, (m) => obstacleMeshes.includes(m as Mesh));

    return !(hit && hit.hit && hit.distance < dist - 0.5);
  }

  /**
   * Controlled 2-3 round bursts dealing balanced damage
   */
  private handleCombatShooting(
    dt: number,
    playerPos: Vector3,
    onBotFireAtPlayer: (botPos: Vector3, bot: TacticalBot) => void
  ) {
    this.burstCooldown -= dt;

    if (this.burstCooldown <= 0) {
      const now = performance.now();
      if (now - this.lastShotTime > 140) {
        this.lastShotTime = now;
        this.burstCount++;

        this.muzzleFlashMesh.isVisible = true;
        setTimeout(() => {
          this.muzzleFlashMesh.isVisible = false;
        }, 40);

        const dist = Vector3.Distance(this.position, playerPos);
        soundEngine.playAK47Shot(false, dist);
        onBotFireAtPlayer(this.position, this);

        if (this.burstCount >= 3) {
          this.burstCount = 0;
          this.burstCooldown = 1.6 + Math.random() * 1.0; // Rest between bursts
        }
      }
    }
  }

  public dispose() {
    this.muzzleFlashMesh.dispose();
    this.character.dispose();
  }
}
