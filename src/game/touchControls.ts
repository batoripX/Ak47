import { PlayerController } from './player';
import { TacticalGameEngine } from './engine';

export interface TouchControlsConfig {
  onOpenPauseMenu: () => void;
  onInteract: () => void;
}

export class TouchControlsManager {
  private player: PlayerController;
  private gameEngine: TacticalGameEngine;
  private config: TouchControlsConfig;

  // DOM Elements
  private overlay: HTMLElement;
  private joystickBase: HTMLElement;
  private joystickKnob: HTMLElement;
  private sprintLockBtn: HTMLElement;
  private sprintLockText: HTMLElement;
  private touchLookZone: HTMLElement;
  private touchFireBtn: HTMLElement;
  private touchLeftFireBtn: HTMLElement;
  private touchAdsBtn: HTMLElement;
  private touchJumpBtn: HTMLElement;
  private touchCrouchBtn: HTMLElement;
  private touchReloadBtn: HTMLElement;
  private touchFireModeBtn: HTMLElement;
  private touchMedkitBtn: HTMLElement;
  private touchMedkitCount: HTMLElement;
  private touchInteractBtn: HTMLElement;
  private touchPauseBtn: HTMLElement;

  // Pointer Identifiers (unified for Touch, Mouse, S-Pen on Samsung Galaxy Tab S8)
  private joystickPointerId: number | null = null;
  private lookPointerId: number | null = null;
  private lastLookPos: { x: number; y: number } = { x: 0, y: 0 };
  private joystickOrigin: { x: number; y: number } = { x: 0, y: 0 };
  private readonly maxRadius: number = 55; // travel distance in px
  private isSprintLocked: boolean = false;
  private isEnabled: boolean = true;

  constructor(player: PlayerController, gameEngine: TacticalGameEngine, config: TouchControlsConfig) {
    this.player = player;
    this.gameEngine = gameEngine;
    this.config = config;

    this.overlay = document.getElementById('touchControlsOverlay') as HTMLElement;
    this.joystickBase = document.getElementById('virtualJoystickBase') as HTMLElement;
    this.joystickKnob = document.getElementById('virtualJoystickKnob') as HTMLElement;
    this.sprintLockBtn = document.getElementById('touchSprintLockBtn') as HTMLElement;
    this.sprintLockText = document.getElementById('sprintLockText') as HTMLElement;
    this.touchLookZone = document.getElementById('touchLookZone') as HTMLElement;
    this.touchFireBtn = document.getElementById('touchFireBtn') as HTMLElement;
    this.touchLeftFireBtn = document.getElementById('touchLeftFireBtn') as HTMLElement;
    this.touchAdsBtn = document.getElementById('touchAdsBtn') as HTMLElement;
    this.touchJumpBtn = document.getElementById('touchJumpBtn') as HTMLElement;
    this.touchCrouchBtn = document.getElementById('touchCrouchBtn') as HTMLElement;
    this.touchReloadBtn = document.getElementById('touchReloadBtn') as HTMLElement;
    this.touchFireModeBtn = document.getElementById('touchFireModeBtn') as HTMLElement;
    this.touchMedkitBtn = document.getElementById('touchMedkitBtn') as HTMLElement;
    this.touchMedkitCount = document.getElementById('touchMedkitCount') as HTMLElement;
    this.touchInteractBtn = document.getElementById('touchInteractBtn') as HTMLElement;
    this.touchPauseBtn = document.getElementById('touchPauseBtn') as HTMLElement;

    this.bindEvents();
    this.show(); // Always active and responsive
  }

  public detectAndEnable() {
    this.show();
  }

  public show() {
    this.isEnabled = true;
    if (this.overlay) {
      this.overlay.classList.remove('hidden');
    }
  }

  public hide() {
    this.isEnabled = false;
    if (this.overlay) {
      this.overlay.classList.add('hidden');
    }
    this.resetJoystick();
  }

  public toggle(): boolean {
    if (this.isEnabled) {
      this.hide();
    } else {
      this.show();
    }
    return this.isEnabled;
  }

  public updateMedkitCount(count: number) {
    if (this.touchMedkitCount) {
      this.touchMedkitCount.textContent = `${count}`;
    }
  }

  public updateFireMode(mode: 'AUTO' | 'SEMI') {
    if (this.touchFireModeBtn) {
      this.touchFireModeBtn.textContent = mode;
      if (mode === 'AUTO') {
        this.touchFireModeBtn.className = 'px-3 py-2 rounded-xl bg-stone-900/80 border border-amber-500/80 text-[10px] font-mono font-bold text-amber-400 backdrop-blur-md shadow-lg cursor-pointer active:scale-95 transition-transform touch-none';
      } else {
        this.touchFireModeBtn.className = 'px-3 py-2 rounded-xl bg-stone-900/80 border border-cyan-500/80 text-[10px] font-mono font-bold text-cyan-400 backdrop-blur-md shadow-lg cursor-pointer active:scale-95 transition-transform touch-none';
      }
    }
  }

  public setInteractPrompt(prompt: string | null) {
    if (!this.touchInteractBtn) return;
    if (prompt) {
      this.touchInteractBtn.classList.remove('hidden');
      const cleanText = prompt.replace(/\[E\]\s*/i, '');
      this.touchInteractBtn.innerHTML = `<span>🤝 ${cleanText.toUpperCase()}</span>`;
    } else {
      this.touchInteractBtn.classList.add('hidden');
    }
  }

  public setADSState(isADS: boolean) {
    if (!this.touchAdsBtn) return;
    if (isADS) {
      this.touchAdsBtn.className = 'absolute right-26 bottom-20 w-15 h-15 rounded-full bg-amber-500 border-2 border-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.7)] flex flex-col items-center justify-center text-stone-950 active:scale-95 transition-all cursor-pointer pointer-events-auto touch-none';
    } else {
      this.touchAdsBtn.className = 'absolute right-26 bottom-20 w-15 h-15 rounded-full bg-stone-900/75 active:bg-amber-500 border-2 border-stone-500/80 active:border-amber-300 shadow-xl flex flex-col items-center justify-center text-stone-300 active:text-stone-950 active:scale-95 transition-all cursor-pointer pointer-events-auto touch-none';
    }
  }

  private bindEvents() {
    // Helper to register immediate touch + pointer handlers
    const addImmediateListener = (el: HTMLElement | null, onDown: () => void, onUp?: () => void) => {
      if (!el) return;
      let lastTrigger = 0;

      const handleDown = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        const now = Date.now();
        if (now - lastTrigger < 60) return;
        lastTrigger = now;
        onDown();
      };

      const handleUp = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        if (onUp) onUp();
      };

      el.addEventListener('pointerdown', handleDown, { passive: false });
      el.addEventListener('touchstart', handleDown, { passive: false });
      el.addEventListener('mousedown', handleDown, { passive: false });

      if (onUp) {
        el.addEventListener('pointerup', handleUp, { passive: false });
        el.addEventListener('pointercancel', handleUp, { passive: false });
        el.addEventListener('touchend', handleUp, { passive: false });
        el.addEventListener('touchcancel', handleUp, { passive: false });
        el.addEventListener('mouseup', handleUp, { passive: false });
      }
    };

    // -------------------------------------------------------------
    // 1. VIRTUAL ANALOG JOYSTICK (Left Thumb Zone)
    // -------------------------------------------------------------
    const onJoystickDown = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      this.joystickPointerId = e.pointerId;
      try {
        this.joystickBase.setPointerCapture(e.pointerId);
      } catch {}

      const rect = this.joystickBase.getBoundingClientRect();
      this.joystickOrigin = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2
      };

      this.processJoystickPosition(e.clientX, e.clientY);
    };

    const onJoystickMove = (e: PointerEvent) => {
      if (this.joystickPointerId !== e.pointerId) return;
      e.preventDefault();
      this.processJoystickPosition(e.clientX, e.clientY);
    };

    const onJoystickUp = (e: PointerEvent) => {
      if (this.joystickPointerId !== e.pointerId) return;
      e.preventDefault();
      try {
        this.joystickBase.releasePointerCapture(e.pointerId);
      } catch {}
      this.resetJoystick();
    };

    this.joystickBase.addEventListener('pointerdown', onJoystickDown, { passive: false });
    this.joystickBase.addEventListener('pointermove', onJoystickMove, { passive: false });
    this.joystickBase.addEventListener('pointerup', onJoystickUp, { passive: false });
    this.joystickBase.addEventListener('pointercancel', onJoystickUp, { passive: false });

    // Sprint Lock Button
    addImmediateListener(this.sprintLockBtn, () => {
      this.isSprintLocked = !this.isSprintLocked;
      if (this.isSprintLocked) {
        this.sprintLockBtn.className = 'absolute -top-1 left-12 px-3 py-1.5 rounded-full bg-amber-500 border border-amber-300 text-[10px] font-mono font-black text-stone-950 shadow-[0_0_15px_rgba(245,158,11,0.7)] flex items-center gap-1.5 cursor-pointer pointer-events-auto touch-none';
        this.sprintLockText.textContent = 'SPRINT LOCKED';
        this.player.touchSprintRequested = true;
      } else {
        this.sprintLockBtn.className = 'absolute -top-1 left-12 px-3 py-1.5 rounded-full bg-stone-900/75 border border-stone-600/80 text-[10px] font-mono font-bold text-stone-300 shadow-lg flex items-center gap-1.5 cursor-pointer pointer-events-auto touch-none';
        this.sprintLockText.textContent = 'SPRINT';
        this.player.touchSprintRequested = false;
      }
    });

    // -------------------------------------------------------------
    // 2. TOUCH LOOK / AIM SWIPE (Right Thumb Surface)
    // -------------------------------------------------------------
    this.touchLookZone.addEventListener('pointerdown', (e: PointerEvent) => {
      // Don't intercept touches on buttons
      const target = e.target as HTMLElement;
      if (target && target.closest('button')) {
        return;
      }

      if (this.lookPointerId === null) {
        this.lookPointerId = e.pointerId;
        this.lastLookPos = { x: e.clientX, y: e.clientY };
        try {
          this.touchLookZone.setPointerCapture(e.pointerId);
        } catch {}
      }
    }, { passive: false });

    this.touchLookZone.addEventListener('pointermove', (e: PointerEvent) => {
      if (this.lookPointerId !== e.pointerId) return;

      const deltaX = e.clientX - this.lastLookPos.x;
      const deltaY = e.clientY - this.lastLookPos.y;

      this.player.rotateCamera(deltaX, deltaY);
      this.lastLookPos = { x: e.clientX, y: e.clientY };
    }, { passive: false });

    const onLookEnd = (e: PointerEvent) => {
      if (this.lookPointerId === e.pointerId) {
        try {
          this.touchLookZone.releasePointerCapture(e.pointerId);
        } catch {}
        this.lookPointerId = null;
      }
    };

    this.touchLookZone.addEventListener('pointerup', onLookEnd, { passive: false });
    this.touchLookZone.addEventListener('pointercancel', onLookEnd, { passive: false });

    // -------------------------------------------------------------
    // 3. COMBAT ACTION BUTTONS (Immediate 0ms Registration)
    // -------------------------------------------------------------
    // Primary Fire Button (Right Thumb)
    addImmediateListener(
      this.touchFireBtn,
      () => {
        this.player.isFiring = true;
      },
      () => {
        this.player.isFiring = false;
      }
    );

    // Secondary Fire Button (Left Index / Thumb)
    addImmediateListener(
      this.touchLeftFireBtn,
      () => {
        this.player.isFiring = true;
      },
      () => {
        this.player.isFiring = false;
      }
    );

    // ADS (Aim Down Sights) Toggle
    addImmediateListener(this.touchAdsBtn, () => {
      this.player.toggleADS();
      this.setADSState(this.player.weapon.state.isADS);
    });

    // Jump
    addImmediateListener(this.touchJumpBtn, () => {
      this.player.jump();
    });

    // Crouch
    addImmediateListener(this.touchCrouchBtn, () => {
      this.player.toggleCrouch();
    });

    // Reload
    addImmediateListener(this.touchReloadBtn, () => {
      this.player.weapon.reload();
    });

    // Fire Mode Toggle
    addImmediateListener(this.touchFireModeBtn, () => {
      this.player.weapon.toggleFireMode();
      this.updateFireMode(this.player.weapon.state.fireMode);
    });

    // IFAK Medkit
    addImmediateListener(this.touchMedkitBtn, () => {
      this.player.useMedkit();
    });

    // Contextual Interact Button
    addImmediateListener(this.touchInteractBtn, () => {
      this.config.onInteract();
    });

    // Tactical Pause Button
    addImmediateListener(this.touchPauseBtn, () => {
      this.config.onOpenPauseMenu();
    });
  }

  private processJoystickPosition(clientX: number, clientY: number) {
    const rawDx = clientX - this.joystickOrigin.x;
    const rawDy = clientY - this.joystickOrigin.y;

    const dist = Math.sqrt(rawDx * rawDx + rawDy * rawDy);

    // Deadzone
    if (dist < 5) {
      this.player.touchMoveVector = { x: 0, z: 0 };
      this.joystickKnob.style.transform = 'translate(0px, 0px)';
      return;
    }

    const clampedDist = Math.min(dist, this.maxRadius);
    const angle = Math.atan2(rawDy, rawDx);

    const knobX = Math.cos(angle) * clampedDist;
    const knobY = Math.sin(angle) * clampedDist;

    this.joystickKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;

    // Normalized move vector (-1 to 1)
    // Upwards movement is negative clientY, corresponding to forward +Z
    const normalX = knobX / this.maxRadius;
    const normalZ = -knobY / this.maxRadius;

    this.player.touchMoveVector = { x: normalX, z: normalZ };

    // Auto-sprint if pushed forward past 80% threshold or if sprint locked
    if (normalZ > 0.80 || this.isSprintLocked) {
      this.player.touchSprintRequested = true;
    } else {
      this.player.touchSprintRequested = false;
    }
  }

  private resetJoystick() {
    this.joystickPointerId = null;
    this.joystickKnob.style.transform = 'translate(0px, 0px)';
    this.player.touchMoveVector = { x: 0, z: 0 };
    if (!this.isSprintLocked) {
      this.player.touchSprintRequested = false;
    }
  }
}
