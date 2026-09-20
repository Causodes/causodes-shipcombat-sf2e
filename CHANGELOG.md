## v1.5.2
### Bug Fixes
- Preserve a weapon trait's configured numeric value when it is disabled, matching the shared component editor contract
- Preserve SF2e party/opposition alliance on custom ships and NPC-launched ordnance so SF2e derives the correct Token disposition
- Keep the Ordnance Master roll available on a new turn while existing commitments lock only the allocation controls
- Await reroll synchronization and equipment assignment requests so socket failures remain visible to their initiating workflow

## v1.5.1
### Improvements
- Require Core 2.5.1 for corrected player and NPC ordnance lifecycle behavior
- Publish an allowlisted runtime-only module archive without repository development files

## v1.5.0
### Bug Fixes
- Route SF2e popup, reroll, and equipment requests through Core's actor-bound request factory and require Core 2.5.0+
- Remove stale Sensor contacts and locks after their scene Token or world Actor is deleted
- Allow NPC ships to select which torpedo or strike-craft template they launch
- Include the initiating ship in SF2e Priority Target, rerolled allocation-point, and equipment-unassignment requests
- Scope SF2e weapon, ram, and strike-craft targeting to their owning ship's locks and contact data
- Seed first-round movement independently for every SF2e player ship in combat
- Restore SF2e ram thrust selection, live damage previews, and partial-power commitments against Core's current popup template
- Restore the formatted attack value in SF2e strike-craft target rows
- Delegate strike-craft ammunition and per-target turn tracking to Core's serialized GM-side attack action
- Include and verify parent-ship scope when the SF2e strike-craft popup submits an attack

## v1.4.3
### Bug Fixes
- Include the firing ship identity required by Core when SF2e AppV1 targeting dialogs submit player or NPC weapon attacks
- Pass strike-craft damage dice and damage type through the SF2e AppV1 attack flow
- Preserve the surviving SF2e strike-craft flight size when calculating attack salvos, including zero remaining craft
- Run SF2e ordnance base and derived data preparation so repeated sheet opens retain computed subtype data

## v1.4.2
### Bug Fixes
- Let Observer users operate SF2e bridge-station controls while keeping trait, IWR, equipment, and other ship configuration listeners restricted to Owners
### Improvements
- Use the native SF2e disabled-overlay treatment for prow weapon ram lockouts
- Wait for the Core API before evaluating SF2e models and adapters, preventing startup races that leave module document subtypes unregistered

## v1.4.1
- Provide SF2e's common item fields and persist its migration-version markers on Ship Combat actors and items so the SF2e migration wizard can complete successfully
- Prune legacy NPC ship schema and configuration fields
- Bump verified version to 14.367

## v1.4.0
### Bug Fixes
- Display strike-craft accuracy as a signed d20 modifier and consistently grant the +2 Lock 4 bonus
- Fix Captain initiative allocations replacing the ship's rolled total by applying only a reversible per-turn bonus, and disable initiative allocation until PF2e tracker initiative has been rolled
- Disable Gunner allocation controls before Ordnance is rolled in four-person crews while keeping the roll control available, and restore the Captain status bar's Auxiliary Power label
- Replace remaining inherited and dynamically generated “SL” descriptions with “points” terminology
- Use readable purple/red target-marker colours on parchment and mirror Core's self/allied-contact exclusion across SF2e targeting dialogs
- Keep NPC helm values aligned with Core's derived critical-condition penalties
- Standardize SF2e calls to use the same GM transport policy as core on overriden functionality
- Fade and disable every committed Captain, Gunner, Pilot, and Ordnance allocation row consistently, including combined reduced-crew allocation, and disable Pilot/Gunner decrement controls at zero allocation
### Improvements
- Derive all accuracy descriptions from adapter values and use the shared fire-mode conversion path
- Remove the redundant Active Standing Orders panel from all SF2e Captain layouts
- Apply SF2e's parchment Captain-card theme universally across the hand, chat, Emergency Salvage, and Dead Reckoning instead of limiting it to ship-sheet cards
- Preserve category tinting on Dead Reckoning cards against SF2e list styles and make its footer controls use the borderless SF2e dialog-button typography
- Apply the SF2e parchment Captain-card graphic consistently to the hand, chat, pile previews, Emergency Salvage, and Dead Reckoning, eliminating remaining Core scan-line surfaces
- Define SF2e's singular `point` and plural `points` allocation terminology once in the system adapter and consume it across localized and generated UI copy
- Rename Battle Clarity to Priority Target and use Core's pale-teal intercardinal crew mark plus red priority lock ring on the SF2e radar
- Show Core's named critical-disable overlay with SF2e's parchment lockout styling on NPC weapon sections
- Adjust Standing Orders notifications to be more visible against parchment colored backgrounds
- Use parchment-safe contrast for Standing Orders banners, stance states, power values, and ready-core indicators across role tabs
### New Features
- Display the shared persistent contact designations and Sensors/Priority Target markers in SF2e targeting interfaces
- Add Critical Hit effect tooltips on chat cards

## v1.3.2
- Prevent disabling the SF2E adapter or Ship Combat Core while the world still contains Ship Combat actor/item subtypes, avoiding an SF2E startup failure that also bypasses Foundry's safe-configuration recovery.

## v1.3.1
- Replace deprecated Foundry API calls (`renderChatMessage` hook → `renderChatMessageHTML`; `getTemplate`/`loadTemplates` → `foundry.applications.handlebars.*`)

## v1.3.0
- Rescale fire-mode hit modifiers to d20 steps: Ranging Fire −2, Full Broadside +2, Devastating Broadside +4 (broadsides previously leaked the core d100 values of +10/+20)
- Enforce **Sensor Disruption**: the disrupted ship takes a penalty equal to the disruptor's sensor Hit Modifier (minimum −1) on weapon fire and NPC ship checks
- Enforce **Sensor Overcharge**: an overcharged ship can only target within its own auto-scan range
- **Signal Inversion** now mechanically strips all shields from the target's closest quadrant (via core)
- Fix strike craft flight size being inverted (full-strength flights attacked with a salvo of 1; crippled flights with a full salvo)
- Strike craft Lock 4 accuracy bonus is now +2, matching ship weapons (was +1)
- Fix the `Devastating` trait description (was stale d100 "doubles" wording); Devastating lowers the crit margin and adds bonus damage on critting shots
- Update documentation

## v1.2.4
- Explicitly classify buttons as type `button` in handlebars templates to prevent unintended form submission behavior
- Fix Overclock behavior (was using core d100 roll under logic, which does not make sense for SF2e)
- Add Overclock Base DC field on Reactor Core ship component to allow custom Overclock DC

## v1.2.3
- Fix NPC ships always moving only their min move distance instead of min move + base speed. `NpcShipModel` now bridges `prepareBaseData`/`prepareDerivedData` so `computeDerived` runs and sets `movement.speed` from `movement.baseSpeed`

## v1.2.2
- Fix NPC ships to correctly pull from `PIL`, `ENG`, and `RNG` for various checks

## v1.2.1
- Add `TUTORIAL.md`, which goes over first time setup as well as NPC ship setup.
- Add missing `Max Shield Flux` field to NPC ships.
- Rename `TECH` and `GUN` on NPC ships to `ENG` and `RNG` to better reflect SF2e skill names.
- Fix NPC Ship initiative not picking up `PIL` modifier.

## v1.2.0
- Compatibility with the **pf2e** system with optional **sf2e-anachronism** support. All system-namespaced references (grant flags, reroll context, default-icon paths, the Tagify vendor bundle) now resolve via `game.system.id`, so the module runs unchanged on sf2e and additionally on pf2e or pf2e+anachronism.

## v1.1.0
- Fix Forge compatibility: access core APIs via globalThis.ShipCombat._api instead of ES imports

## v1.0.3
- Fix module not loading on Forge-hosted instances (convert cross-module relative imports to absolute paths)

## v1.0.2
- Fix NPC helm controls not picking up values from stats
- Rename ASR to OPT and RTG to HIT in Strike Craft configs

## v1.0.1
- Fix player-side claim and release role buttons

## v1.0.0
- Initial v14 release
