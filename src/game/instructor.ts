import {
  Scene,
  Vector3
} from '@babylonjs/core';
import { CharacterBuilder, HumanoidCharacter } from './characterBuilder';
import { soundEngine } from './audio';

export interface DialogueOption {
  label: string;
  action: () => void;
}

export interface DialogueNode {
  speaker: string;
  title: string;
  message: string;
  options: DialogueOption[];
}

export class TacticalInstructor {
  public character: HumanoidCharacter;
  public position: Vector3;
  private scene: Scene;
  private hasGreeted: boolean = false;
  private interactionDistance: number = 3.8;
  public isNearPlayer: boolean = false;

  constructor(scene: Scene, position: Vector3) {
    this.scene = scene;
    this.position = position.clone();
    this.character = CharacterBuilder.createHumanoid(scene, 'instructor_vance', 'instructor', position);

    // Initial stance facing toward the staging entrance
    this.character.root.rotation.y = Math.PI * 0.9;
  }

  public update(playerPos: Vector3, dt: number, onProximityChanged: (isNear: boolean) => void) {
    const dist = Vector3.Distance(this.position, playerPos);
    const near = dist <= this.interactionDistance;

    if (near !== this.isNearPlayer) {
      this.isNearPlayer = near;
      onProximityChanged(near);

      if (near && !this.hasGreeted) {
        this.hasGreeted = true;
        soundEngine.playRadioSquelch();
      }
    }

    // Turn head/body slightly toward player when close
    if (near) {
      const dx = playerPos.x - this.position.x;
      const dz = playerPos.z - this.position.z;
      const angle = Math.atan2(dx, dz);
      let diff = angle - this.character.root.rotation.y;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.character.root.rotation.y += diff * 0.05;
    }

    // Alert idle breathing and presence
    this.character.animate(0, false, false, dt);
  }

  /**
   * Generates peer-to-peer operator dialogue nodes
   */
  public getDialogue(
    onSelectDrill: (mode: 'RANGE' | 'CQB' | 'SURVIVAL') => void,
    onRestock: () => void,
    onDismiss?: () => void
  ): DialogueNode {
    soundEngine.playRadioSquelch();
    return {
      speaker: 'Master Gunnery Sgt. Vance',
      title: 'Range Master · Range Alpha',
      message: 'Good to have you back on the line, Operator. Your AK-47 is zeroed and cleared. You can warm up on the reactive steel lanes, run the CQB killhouse, or take on live-fire combat drills. What are you looking to run today?',
      options: [
        {
          label: 'Run 100m Steel Target Drills',
          action: () => {
            onSelectDrill('RANGE');
          }
        },
        {
          label: 'Deploy CQB Killhouse Sweep (Hostiles Active)',
          action: () => {
            onSelectDrill('CQB');
          }
        },
        {
          label: 'Engage Full Tactical Wave Defense',
          action: () => {
            onSelectDrill('SURVIVAL');
          }
        },
        {
          label: 'Restock Full 7.62x39mm Ammo & Fresh Armor',
          action: () => {
            onRestock();
          }
        },
        {
          label: "I'll handle this myself. (Dismiss)",
          action: () => {
            if (onDismiss) onDismiss();
          }
        }
      ]
    };
  }

  public dispose() {
    this.character.dispose();
  }
}
