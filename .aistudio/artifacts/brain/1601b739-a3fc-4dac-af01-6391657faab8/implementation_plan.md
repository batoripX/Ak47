# Tactical Range: AK-47 Operator & Military Compound (Realistic Combat & Object Pooling Overhaul)

A comprehensive mechanical, visual, and performance overhaul of the first-person tactical shooter in Babylon.js and WebGPU. This update introduces authentic 7.62x39mm ballistics with recoil spring recovery, a modular soldier anatomical health system (vital organs, limbs, NIJ Level III/IV ballistic plate), an equippable field medkit (IFAK), an Armory Safe Zone, grounded soldier movement, responsive NPC dialogue interaction, fully modeled human arms with fingers gripping the AK-47, and high-performance **Object Pooling** for zero-allocation combat effects.

## User Review & Critical Decisions

> [!IMPORTANT]
> The revision incorporates all requirements and performance enhancements:
> - **Object Pooling for Peak Performance**: Implemented dedicated memory pools for high-frequency combat objects—ejected 7.62mm brass casings (35 pooled meshes), bullet impact sparks/decals (30 recycled decals via circular index), and muzzle flash lights. Eliminates runtime heap allocations and Garbage Collection (GC) frame stutters during sustained 600 RPM automatic fire.
> - **Modular Anatomical Health & Armor**: Replaced simple arcade HP with a realistic soldier vitals system: Head (critical), Thorax (with NIJ Level III/IV ballistic plate integrity), Abdomen, and Limbs (Arms/Legs). Ballistic plates stop 7.62mm rounds with blunt impact absorption; limb hits degrade combat agility rather than causing instant fatal collapse.
> - **Equippable Field Medkit (IFAK)**: Added an inventory-equipped medical kit (`[4]` or `[G]` or clickable HUD button) with field-dressing animation and sound to treat wounded limbs and restore vital stability.
> - **Authentic AK-47 Recoil & Trajectory**: Fixed bullet path so rounds fire dead straight to crosshair/iron-sight alignment; implemented realistic 7.62mm kick into the shoulder with automatic spring recovery rather than climbing permanently into the sky.
> - **Armory Safe Zone**: Demarcated safe staging area where Sgt. Vance and respawn point reside; enemies will never target or shoot players inside this perimeter.
> - **Tactical Movement & Jump**: Reduced movement speed and jump height to realistic combat operator weights (grounded 0.65m hop rather than floaty arcade leap).
> - **Sgt. Vance Dialog Fix**: Fixed click registration and pointer lock release so conversation choices work smoothly on first click.
> - **Human Arms & Fingers Viewmodel**: Built fully articulated anatomical arms with realistic skin, sleeves, palm, and individual fingers gripping the receiver, trigger, and handguard without clipping or disappearing.

---

## 1. Overview & Core Concept

- **What It Does**: Provides an authentic, physics-grounded military marksmanship and CQB combat experience. The player operates an AK-47 with real-world handling characteristics, navigates an outdoor compound with a safe briefing post and live-fire sectors, survives incoming fire through realistic body armor plate mechanics and field medical treatment, and benefits from rock-solid 60+ FPS frame rates powered by WebGPU and object pooling.
- **Key Value**: Replaces arcade shooter abstractions with grounded tactical realism, true-to-life ballistic trajectories, and zero-stutter sustained weapon fire.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Staging & Safe Zone Briefing**: Player spawns at the armory counter. The HUD clearly indicates `[SAFE ZONE · WEAPONS COLD]`. Interacting with Sgt. Vance (`[E]`) smoothly frees the mouse cursor, enabling direct clicks on drill options without enemy interference.
2. **Weapons Handling & ADS Alignment**: When aiming down sights (Right-Click), the AK-47's front sight post aligns with millimeter precision inside the rear tangent U-notch. Left-clicking fires 7.62x39mm rounds straight into targets; recoil produces a sharp rearward punch followed by rapid natural recentering.
3. **Transition to Live-Fire Zone**: Walking past the yellow boundary line shifts HUD status to `[LIVE-FIRE COMBAT ZONE · HOSTILES ACTIVE]`. Tactical AI bots detect player presence through sight and sound, seeking cover behind concrete barriers and sandbags.
4. **Anatomical Damage & IFAK Field Dressing**: When taking fire, the anatomical paperdoll HUD displays which body sector absorbed the round (e.g., chest plate absorbing impact with reduced vitality loss). Pressing `[4]` or `[G]` equips the IFAK medkit, performing a 2-second treatment to restore health and patch wounds.
5. **High-Rate Sustained Fire**: Dumping multiple magazines into CQB barricades and steel targets produces brass casings and spark decals seamlessly through pooled buffers without frame drops.

### Visual Identity & HUD Layout
- **Anatomical Silhouette Paperdoll (Bottom-Left)**:
  - Humanoid operator figure with 5 health zones: Head, Thorax (with Plate Integrity bar), Abdomen, Arms, and Legs.
  - Color-coded condition: Healthy (Green `#10B981`), Wounded (Amber `#F59E0B`), Damaged (Red `#EF4444`).
- **Inventory & Medical Quickslot (Bottom-Center)**:
  - Tactical IFAK Medkit icon with quantity (`x2`) and hotkey `[4]`.
  - Field treatment progress ring during application.
- **Firearm Status (Bottom-Right)**:
  - AK-47 designation, 7.62x39mm caliber, fire selector, and 30-round magazine counter.
- **Safe Zone / Combat Zone Status Banner (Top-Center)**:
  - Clean status indicator showing current zone rules and enemy alert state.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Zero-Allocation Object Pooling Architecture**
  - *Chosen Approach*: Maintain fixed-size circular pools:
    - Brass Ejection Pool (35 reusable casing meshes)
    - Bullet Impact Decals & Sparks Pool (30 recycled impact meshes)
  - *Why*: Eliminates garbage collection spikes during high-rate automatic fire (600 RPM = 10 mesh instantiations/sec if unpooled).
  - *Alternatives Considered*: On-demand creation with `setTimeout(() => mesh.dispose())` (causes micro-stutters and GC pressure).
- **Decision 2: Component Anatomical Health vs. Single HP Bar**
  - *Chosen Approach*: Head (critical), Thorax + Plate (ballistic shield), Abdomen (vital), Left/Right Arms (affects weapon sway), Legs (affects sprint/mobility).
  - *Why*: Delivers the authentic soldier damage absorption requested, preventing sudden unfair deaths while rewarding cover usage.
- **Decision 3: Recoil Spring Recovery System**
  - *Chosen Approach*: Replace open-ended pitch accumulation with a spring-damper recoil impulse model that immediately returns camera pitch and weapon pitch to the user's initial aiming target upon burst cessation.
  - *Why*: Eliminates the bug where firing forced the camera to look straight up at the sky, matching authentic AK-47 muzzle impulse.
- **Decision 4: Dedicated First-Person Mesh Architecture**
  - *Chosen Approach*: Construct articulated human hands with 5 distinct finger segments gripping the pistol grip and trigger, parented directly to a dedicated camera rig with `minZ = 0.02` and calibrated frustum bounds.
  - *Why*: Prevents viewmodel clipping, disappearing meshes, and crude stick geometry.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        HTML5 Tactical Application                      │
│                                                                        │
│  ┌────────────────────────┐  ┌──────────────────────────────────────┐  │
│  │   Babylon WebGPU Scene │  │       HTML5 Tactical HUD Overlay     │  │
│  │                        │  │                                      │  │
│  │  ┌──────────────────┐  │  │  - Anatomical Paperdoll (Limbs/Plate)│  │
│  │  │ Object Pool Mgr  │  │  │  - Safe Zone / Combat Status Banner  │  │
│  │  │ (Casings/Decals) │  │  │  - IFAK Medkit Quickslot [4] / [G]   │  │
│  │  └────────┬─────────┘  │  │  - Dynamic Straight-Shot Crosshair  │  │
│  │           │            │  │  - Interactive Vance Dialogue Menu   │  │
│  │           ▼            │  └──────────────────▲───────────────────┘  │
│  │  ┌──────────────────┐  │                    │                       │
│  │  │ Anatomical Hand  │  │                    │                       │
│  │  │ & Finger System  │  │                    │                       │
│  │  └────────┬─────────┘  │                    │                       │
│  │           │            │                    │                       │
│  │           ▼            │                    │                       │
│  │  ┌──────────────────┐  │                    │                       │
│  │  │ AK-47 Recoil     │──┼────────────────────┤ Modular Vitals Sync   │
│  │  │ Spring Physics   │  │                    │ (Plate, Organs, Limbs,│
│  │  └────────┬─────────┘  │                    │  Medkit Count, Zone)  │
│  │           │            │                    │                       │
│  │           ▼            │                    │                       │
│  │  ┌──────────────────┐  │                    │                       │
│  │  │ Safe Zone Gate   │  │                    │                       │
│  │  │ (AI Shooting Ban)│  │                    │                       │
│  │  └──────────────────┘  │                    │                       │
│  └────────────────────────┘                                            │
└────────────────────────────────────────────────────────────────────────┘
```

### Core Updates to Files
- **`game/pool.ts`**:
  - High-performance object pool class for brass shell casings and impact sparks/decals with circular ring index.
- **`game/player.ts`**:
  - Replace single HP with `AnatomicalStatus` (Head, Thorax, Plate, Abdomen, Arms, Legs).
  - Add IFAK medkit inventory with field-treatment application logic.
  - Tune movement speed to 3.5 m/s jog / 5.2 m/s sprint, jump velocity to 3.4 m/s (0.65m realistic hop).
  - Implement recoil spring return so shots land straight where aimed.
- **`game/weapon.ts`**:
  - Integrate shell casing object pool.
  - Re-model first-person arms with anatomical forearms, wrists, palms, and articulated fingers gripping the AK-47.
  - Re-zero ADS alignment so front post and rear notch align dead center with camera ray.
  - Prevent viewmodel meshes from ever disappearing or clipping.
- **`game/engine.ts`**:
  - Implement Armory Safe Zone perimeter (Z < -15). Enemies are barred from shooting or targeting players in safe zone.
  - Fix dialogue click registration: correctly handle pointer lock release and re-engagement without opening the pause menu.
  - Manage object pools during scene updates.
- **`game/world.ts`**:
  - Integrate bullet impact object pool.
  - Add visual yellow hazard demarcation line on ground marking safe zone exit.
- **`index.html` & `main.ts`**:
  - Add anatomical silhouette paperdoll HUD with plate armor integrity and limb status.
  - Add clickable IFAK medkit button and quick-use key `[4]`.
  - Fix modal pointer-events and button click handlers.
