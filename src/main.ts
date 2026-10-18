import { TacticalGameEngine, GameUIState } from './game/engine';
import { soundEngine } from './game/audio';
import { DialogueNode } from './game/instructor';
import { Vector3 } from '@babylonjs/core';
import { TouchControlsManager } from './game/touchControls';

// DOM Elements
const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const startScreen = document.getElementById('startScreen') as HTMLDivElement;
const deployBtn = document.getElementById('deployBtn') as HTMLButtonElement;
const engineBadge = document.getElementById('engineBadge') as HTMLSpanElement;

// Tactical HUD
const tacticalHud = document.getElementById('tacticalHud') as HTMLDivElement;
const radioMessage = document.getElementById('radioMessage') as HTMLParagraphElement;
const zoneBadge = document.getElementById('zoneBadge') as HTMLDivElement;
const compassBearing = document.getElementById('compassBearing') as HTMLSpanElement;
const compassIndicator = document.getElementById('compassIndicator') as HTMLDivElement;
const hudDrillName = document.getElementById('hudDrillName') as HTMLSpanElement;
const hudScore = document.getElementById('hudScore') as HTMLSpanElement;
const hudHostiles = document.getElementById('hudHostiles') as HTMLSpanElement;
const hudTargets = document.getElementById('hudTargets') as HTMLSpanElement;

// Reticle
const crosshair = document.getElementById('crosshair') as HTMLDivElement;
const chTop = document.getElementById('chTop') as HTMLDivElement;
const chBottom = document.getElementById('chBottom') as HTMLDivElement;
const chLeft = document.getElementById('chLeft') as HTMLDivElement;
const chRight = document.getElementById('chRight') as HTMLDivElement;
const hitmarker = document.getElementById('hitmarker') as HTMLDivElement;
const adsOverlay = document.getElementById('adsOverlay') as HTMLDivElement;
const damageIndicator = document.getElementById('damageIndicator') as HTMLDivElement;

// Modular Anatomical Health
const vitalityNum = document.getElementById('vitalityNum') as HTMLSpanElement;
const partHead = document.getElementById('partHead') as HTMLSpanElement;
const partThorax = document.getElementById('partThorax') as HTMLSpanElement;
const partAbdomen = document.getElementById('partAbdomen') as HTMLSpanElement;
const partArms = document.getElementById('partArms') as HTMLSpanElement;
const partLegs = document.getElementById('partLegs') as HTMLSpanElement;
const staminaNum = document.getElementById('staminaNum') as HTMLSpanElement;
const plateNum = document.getElementById('plateNum') as HTMLSpanElement;
const plateBar = document.getElementById('plateBar') as HTMLDivElement;

// IFAK Medkit
const medkitBtn = document.getElementById('medkitBtn') as HTMLButtonElement;
const medkitCount = document.getElementById('medkitCount') as HTMLSpanElement;
const healingProgressContainer = document.getElementById('healingProgressContainer') as HTMLDivElement;
const healingProgressBar = document.getElementById('healingProgressBar') as HTMLDivElement;

// Weapon
const magAmmo = document.getElementById('magAmmo') as HTMLSpanElement;
const reserveAmmo = document.getElementById('reserveAmmo') as HTMLSpanElement;
const fireModeBtn = document.getElementById('fireModeBtn') as HTMLButtonElement;
const reloadIndicator = document.getElementById('reloadIndicator') as HTMLDivElement;

// Interaction & Dialogue
const interactionPromptContainer = document.getElementById('interactionPromptContainer') as HTMLDivElement;
const interactionPromptText = document.getElementById('interactionPromptText') as HTMLSpanElement;
const dialogueModal = document.getElementById('dialogueModal') as HTMLDivElement;
const dialogueSpeaker = document.getElementById('dialogueSpeaker') as HTMLHeadingElement;
const dialogueTitle = document.getElementById('dialogueTitle') as HTMLDivElement;
const dialogueMessage = document.getElementById('dialogueMessage') as HTMLParagraphElement;
const dialogueOptions = document.getElementById('dialogueOptions') as HTMLDivElement;

// Pause & Game Over
const pauseMenu = document.getElementById('pauseMenu') as HTMLDivElement;
const resumeBtn = document.getElementById('resumeBtn') as HTMLButtonElement;
const sensSlider = document.getElementById('sensSlider') as HTMLInputElement;
const sensVal = document.getElementById('sensVal') as HTMLSpanElement;
const volSlider = document.getElementById('volSlider') as HTMLInputElement;
const volVal = document.getElementById('volVal') as HTMLSpanElement;

const drillRangeBtn = document.getElementById('drillRangeBtn') as HTMLButtonElement;
const drillCqbBtn = document.getElementById('drillCqbBtn') as HTMLButtonElement;
const drillSurvivalBtn = document.getElementById('drillSurvivalBtn') as HTMLButtonElement;
const drillFreeBtn = document.getElementById('drillFreeBtn') as HTMLButtonElement;

const gameOverModal = document.getElementById('gameOverModal') as HTMLDivElement;
const goScore = document.getElementById('goScore') as HTMLSpanElement;
const goKills = document.getElementById('goKills') as HTMLSpanElement;
const goTargets = document.getElementById('goTargets') as HTMLSpanElement;
const respawnBtn = document.getElementById('respawnBtn') as HTMLButtonElement;

// Mobile Touch Controls (Samsung Galaxy Tab S8 & Mobile)
const touchControlsOverlay = document.getElementById('touchControlsOverlay') as HTMLDivElement;
const toggleTouchBtn = document.getElementById('toggleTouchBtn') as HTMLButtonElement;
const touchSensSlider = document.getElementById('touchSensSlider') as HTMLInputElement;
const touchSensVal = document.getElementById('touchSensVal') as HTMLSpanElement;

let gameEngine: TacticalGameEngine | null = null;
let touchManager: TouchControlsManager | null = null;
let isStarted = false;
let currentActiveDialogue: DialogueNode | null = null;

// Initialize Engine
async function initGame() {
  soundEngine.init();
  gameEngine = new TacticalGameEngine(canvas);
  await gameEngine.initialize();

  if (gameEngine.isWebGPU) {
    engineBadge.textContent = '⚡ Active: Babylon.js (WebGPU Mode · 60fps)';
    engineBadge.className = 'inline-flex items-center gap-2 px-3 py-1 rounded-full bg-stone-800 text-emerald-400 font-mono text-xs mb-3 border border-emerald-600/50';
  } else {
    engineBadge.textContent = '⚡ Active: Babylon.js (WebGL2 Fallback)';
    engineBadge.className = 'inline-flex items-center gap-2 px-3 py-1 rounded-full bg-stone-800 text-amber-400 font-mono text-xs mb-3 border border-amber-600/50';
  }

  // Initialize Mobile Dual-Thumb Touch Controls
  touchManager = new TouchControlsManager(gameEngine.player, gameEngine, {
    onOpenPauseMenu: () => {
      pauseMenu.classList.remove('hidden');
      if (gameEngine) gameEngine.isPaused = true;
    },
    onInteract: () => {
      gameEngine?.handleInteraction();
    }
  });
  touchManager.detectAndEnable();

  gameEngine.setUIUpdateCallback(updateHUD);
}

function updateHUD(s: GameUIState) {
  // 1. Zone Status Banner
  if (s.isSafeZone) {
    zoneBadge.textContent = 'ARMORY SAFE ZONE · WEAPONS COLD';
    zoneBadge.className = 'bg-emerald-950/90 border border-emerald-600/60 text-emerald-400 text-[10px] font-mono font-bold px-3 py-0.5 rounded-full uppercase tracking-wider shadow';
  } else {
    zoneBadge.textContent = 'LIVE-FIRE COMBAT ZONE · HOSTILES ACTIVE';
    zoneBadge.className = 'bg-red-950/90 border border-red-600/60 text-red-400 text-[10px] font-mono font-bold px-3 py-0.5 rounded-full uppercase tracking-wider shadow animate-pulse';
  }

  // 2. Anatomical Modular Health Status
  const a = s.anatomy;
  const vit = a.overallVitality;
  if (vit > 65) {
    vitalityNum.textContent = `${vit}% STABLE`;
    vitalityNum.className = 'font-bold text-xs font-mono text-emerald-400 tabular-nums';
  } else if (vit > 30) {
    vitalityNum.textContent = `${vit}% WOUNDED`;
    vitalityNum.className = 'font-bold text-xs font-mono text-amber-400 tabular-nums';
  } else {
    vitalityNum.textContent = `${vit}% CRITICAL`;
    vitalityNum.className = 'font-bold text-xs font-mono text-red-500 tabular-nums animate-pulse';
  }

  setPartStatus(partHead, a.head);
  setPartStatus(partThorax, a.thorax);
  setPartStatus(partAbdomen, a.abdomen);
  setPartStatus(partArms, a.arms);
  setPartStatus(partLegs, a.legs);

  staminaNum.textContent = `${s.stamina}%`;

  // Ballistic Chest Plate Integrity
  const plateVal = Math.round(a.plateArmor);
  plateNum.textContent = `${plateVal}%`;
  plateBar.style.width = `${plateVal}%`;
  if (plateVal > 50) {
    plateBar.className = 'h-full bg-cyan-400 transition-all duration-150 rounded-full';
  } else if (plateVal > 0) {
    plateBar.className = 'h-full bg-amber-400 transition-all duration-150 rounded-full';
  } else {
    plateBar.className = 'h-full bg-red-600 transition-all duration-150 rounded-full';
  }

  // 3. IFAK Medkit Status
  medkitCount.textContent = `${s.medkitsCount}`;
  if (s.isHealing) {
    healingProgressContainer.style.opacity = '1';
    healingProgressBar.style.width = `${Math.round(s.healProgress * 100)}%`;
  } else {
    healingProgressContainer.style.opacity = '0';
    healingProgressBar.style.width = '0%';
  }

  // 4. Weapon Counter
  magAmmo.textContent = `${s.ammoInMag}`;
  reserveAmmo.textContent = `${s.ammoReserve}`;
  fireModeBtn.textContent = `[B] ${s.fireMode}`;

  if (s.isReloading) {
    reloadIndicator.textContent = 'RELOADING...';
    reloadIndicator.className = 'text-xs font-mono text-amber-400 uppercase animate-pulse font-bold';
  } else if (s.ammoInMag === 0) {
    reloadIndicator.textContent = 'EMPTY - PRESS R';
    reloadIndicator.className = 'text-xs font-mono text-red-500 uppercase animate-pulse font-bold';
  } else {
    reloadIndicator.textContent = 'READY';
    reloadIndicator.className = 'text-xs font-mono text-stone-400 uppercase';
  }

  // 5. Score & Missions
  hudDrillName.textContent = s.activeDrill;
  hudScore.textContent = `${s.score}`;
  hudHostiles.textContent = `${s.enemyCount} Active`;
  hudTargets.textContent = `${s.targetsHit}`;

  // 6. Compass
  const cardinal = getCardinal(s.compassAngle);
  compassBearing.textContent = `${s.compassAngle.toString().padStart(3, '0')}° ${cardinal}`;
  const pct = (s.compassAngle / 360) * 100;
  compassIndicator.style.left = `${pct}%`;

  // 7. Reticle dynamic spread bloom
  const offset = s.isADS ? 2 : 5 + (gameEngine?.player.weapon.state.recoilSpread || 0.015) * 200;
  chTop.style.transform = `translateY(-${offset}px)`;
  chBottom.style.transform = `translateY(${offset}px)`;
  chLeft.style.transform = `translateX(-${offset}px)`;
  chRight.style.transform = `translateX(${offset}px)`;

  adsOverlay.style.opacity = s.isADS ? '1' : '0';

  // 8. Hitmarker
  if (s.hitmarkerActive) {
    hitmarker.style.opacity = '1';
    hitmarker.style.transform = 'scale(1.2)';
    if (s.hitmarkerHeadshot) {
      hitmarker.className = 'absolute inset-0 opacity-100 scale-125 transition-all duration-75 flex items-center justify-center text-amber-400';
    } else {
      hitmarker.className = 'absolute inset-0 opacity-100 scale-110 transition-all duration-75 flex items-center justify-center text-red-500';
    }
  } else {
    hitmarker.style.opacity = '0';
    hitmarker.style.transform = 'scale(0.85)';
  }

  // 9. Directional Damage Arc
  if (s.damageAngle !== null) {
    damageIndicator.style.opacity = '0.9';
    damageIndicator.style.transform = `rotate(${s.damageAngle}deg)`;
    damageIndicator.style.borderColor = 'rgba(239, 68, 68, 0.85)';
  } else {
    damageIndicator.style.opacity = '0';
  }

  // 10. Interaction prompt
  if (s.interactionPrompt && !s.instructorDialogue) {
    interactionPromptText.textContent = s.interactionPrompt;
    interactionPromptContainer.style.opacity = '1';
  } else {
    interactionPromptContainer.style.opacity = '0';
  }

  // Update touch controls state for mobile/tablets
  if (touchManager) {
    touchManager.updateMedkitCount(s.medkitsCount);
    touchManager.updateFireMode(s.fireMode);
    touchManager.setADSState(s.isADS);
    touchManager.setInteractPrompt(s.interactionPrompt || null);
  }

  // 11. Instructor Dialogue Modal
  if (s.instructorDialogue !== currentActiveDialogue) {
    currentActiveDialogue = s.instructorDialogue;
    if (currentActiveDialogue) {
      renderDialogue(currentActiveDialogue);
      dialogueModal.classList.remove('hidden');
    } else {
      dialogueModal.classList.add('hidden');
      dialogueOptions.innerHTML = '';
    }
  }

  // 12. Game Over
  if (s.anatomy.overallVitality <= 0) {
    goScore.textContent = `${s.score}`;
    goKills.textContent = `${s.kills}`;
    goTargets.textContent = `${s.targetsHit}`;
    gameOverModal.classList.remove('hidden');
  } else {
    gameOverModal.classList.add('hidden');
  }
}

function setPartStatus(el: HTMLSpanElement, val: number) {
  const rounded = Math.round(val);
  el.textContent = `${rounded}%`;
  if (rounded > 65) {
    el.className = 'font-bold text-emerald-400 tabular-nums';
  } else if (rounded > 30) {
    el.className = 'font-bold text-amber-400 tabular-nums';
  } else {
    el.className = 'font-bold text-red-500 tabular-nums';
  }
}

function getCardinal(deg: number): string {
  if (deg >= 337.5 || deg < 22.5) return 'N';
  if (deg < 67.5) return 'NE';
  if (deg < 112.5) return 'E';
  if (deg < 157.5) return 'SE';
  if (deg < 202.5) return 'S';
  if (deg < 247.5) return 'SW';
  if (deg < 292.5) return 'W';
  return 'NW';
}

function renderDialogue(node: { speaker: string; title: string; message: string; options: { label: string; action: () => void }[] }) {
  dialogueSpeaker.textContent = node.speaker;
  dialogueTitle.textContent = node.title;
  dialogueMessage.textContent = node.message;

  dialogueOptions.innerHTML = '';
  node.options.forEach((opt) => {
    const btn = document.createElement('button');
    btn.className = 'w-full py-2.5 px-3 bg-stone-800 hover:bg-stone-700 active:bg-amber-600 border border-stone-700 hover:border-amber-500/60 rounded-lg text-left text-xs font-semibold text-stone-200 hover:text-amber-400 transition-colors flex items-center justify-between cursor-pointer select-none touch-none';
    btn.innerHTML = `<span>${opt.label}</span><span class="text-stone-500 text-[10px] font-mono">SELECT ➔</span>`;
    
    let executed = false;
    const triggerOption = (e: Event) => {
      if (executed) return;
      executed = true;
      e.preventDefault();
      e.stopPropagation();

      dialogueModal.classList.add('hidden');
      dialogueOptions.innerHTML = '';
      currentActiveDialogue = null;
      if (gameEngine) {
        gameEngine.isInDialogue = false;
      }
      opt.action();

      setTimeout(() => {
        try {
          const p = canvas.requestPointerLock();
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch {}
      }, 50);
    };

    btn.addEventListener('pointerdown', triggerOption);
    btn.addEventListener('click', triggerOption);
    dialogueOptions.appendChild(btn);
  });
}

// Deploy button click
deployBtn.addEventListener('click', async () => {
  if (!gameEngine) {
    await initGame();
  }
  isStarted = true;
  startScreen.classList.add('hidden');
  tacticalHud.classList.remove('hidden');

  // Activate mobile touch controls if touch device / tablet is detected
  touchManager?.detectAndEnable();

  try {
    canvas.requestPointerLock();
  } catch {
    // Expected on mobile/touch browsers
  }
  soundEngine.playBoltRack();
  radioMessage.textContent = 'Operator deployed in Armory Safe Zone. Step forward to engage live range.';
});

// Fire mode toggle
fireModeBtn.addEventListener('click', () => {
  gameEngine?.player.weapon.toggleFireMode();
  touchManager?.updateFireMode(gameEngine?.player.weapon.state.fireMode || 'AUTO');
});

// Medkit button click
medkitBtn.addEventListener('click', () => {
  gameEngine?.player.useMedkit();
});

// Pointer Lock change listener
document.addEventListener('pointerlockchange', () => {
  // If touch controls are currently active on a touchscreen, ignore missing pointerlock
  const isTouchActive = touchControlsOverlay && !touchControlsOverlay.classList.contains('hidden');

  if (document.pointerLockElement !== canvas) {
    // Only open pause menu if NOT in dialogue, alive, and not in active touch mode
    if (!isTouchActive && isStarted && !gameEngine?.isInDialogue && gameEngine?.player.stats.isAlive) {
      pauseMenu.classList.remove('hidden');
      if (gameEngine) gameEngine.isPaused = true;
    }
  } else {
    pauseMenu.classList.add('hidden');
    if (gameEngine) gameEngine.isPaused = false;
  }
});

// Resume button
resumeBtn.addEventListener('click', () => {
  pauseMenu.classList.add('hidden');
  if (gameEngine) gameEngine.isPaused = false;
  try {
    canvas.requestPointerLock();
  } catch {
    // Touch browsers
  }
});

// Touch Controls Toggle in Settings
toggleTouchBtn.addEventListener('click', () => {
  if (touchManager) {
    const isNowOn = touchManager.toggle();
    toggleTouchBtn.textContent = isNowOn ? 'TOUCH: ON' : 'TOUCH: OFF';
    toggleTouchBtn.className = isNowOn
      ? 'px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold font-mono transition-colors cursor-pointer'
      : 'px-2.5 py-1 rounded bg-stone-700 hover:bg-stone-600 text-stone-300 text-xs font-bold font-mono transition-colors cursor-pointer';
  }
});

// Touch Look Sensitivity Slider
touchSensSlider.addEventListener('input', () => {
  const val = parseFloat(touchSensSlider.value);
  touchSensVal.textContent = val.toFixed(1);
  if (gameEngine) {
    gameEngine.player.touchSensitivity = val * 0.001;
  }
});

// Mouse Sensitivity Slider
sensSlider.addEventListener('input', () => {
  const val = parseFloat(sensSlider.value);
  sensVal.textContent = val.toFixed(1);
  if (gameEngine) {
    gameEngine.player.mouseSensitivity = val * 0.001;
  }
});

volSlider.addEventListener('input', () => {
  const val = parseInt(volSlider.value, 10);
  volVal.textContent = `${val}%`;
  soundEngine.setVolume(val / 100);
});

// Drill Selector buttons in pause menu
drillRangeBtn.addEventListener('click', () => {
  gameEngine?.selectDrill('RANGE');
  pauseMenu.classList.add('hidden');
});
drillCqbBtn.addEventListener('click', () => {
  gameEngine?.selectDrill('CQB');
  pauseMenu.classList.add('hidden');
});
drillSurvivalBtn.addEventListener('click', () => {
  gameEngine?.selectDrill('SURVIVAL');
  pauseMenu.classList.add('hidden');
});
drillFreeBtn.addEventListener('click', () => {
  if (gameEngine) {
    gameEngine.activeDrill = 'Free Playground';
    gameEngine.spawnCompoundEnemies(4);
    pauseMenu.classList.add('hidden');
    try {
      canvas.requestPointerLock();
    } catch {}
  }
});

// Respawn button
respawnBtn.addEventListener('click', () => {
  if (gameEngine) {
    gameEngine.player.respawn(new Vector3(0, 0, -30));
    gameOverModal.classList.add('hidden');
    try {
      canvas.requestPointerLock();
    } catch {}
  }
});

// Auto-initialize Babylon on load
initGame().catch(console.error);
