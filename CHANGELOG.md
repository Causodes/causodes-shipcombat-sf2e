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