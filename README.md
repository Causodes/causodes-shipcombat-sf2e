# Causodes's Ship Combat (SF2e/PF2e)

![](https://github.com/user-attachments/assets/7115df81-b7f6-4f2d-9fc4-358f9de1a6ab)

A FoundryVTT module for **Starfinder 2e** and **Pathfinder 2e** that adds a full ship combat system. Up to six players each claim a named bridge station and execute their role's mechanics from a dedicated tab on the shared starship sheet. The crew size is adjustable; roles collapse and merge as headcount drops. All players take their turns simultaneously on the player ship's turn in the combat tracker.

See the role-specific reference documents for full details on what each station does:

- [README_3.md](README_3.md) — 3-player crew
- [README_4.md](README_4.md) — 4-player crew
- [README_5.md](README_5.md) — 5-player crew
- [README_6.md](README_6.md) — 6-player crew

For help with first time setup, please see [TUTORIAL.md](TUTORIAL.md)!

---

## Dependencies

- socketlib
- **Starfinder 2e** system
- **Pathfinder 2e** system

**Optional (for combat animations):**
- Sequencer
- JB2A Patreon (Jules and Ben's Animated Assets - Patreon version required for the full animation set)
- Starfinder Anachronism (For Starfinder 2e skills when using Pathfinder 2e)

---

## The Ship Sheet

Each player sees only their own station tab. The GM sees all tabs simultaneously. Players with full ownership of the actor can additionally see the Configuration tab.

### Sidebar

The Sidebar shows a snapshot of ship status visible to all crew: HP, shields, internal fire, and hardness status. 

### Overview Tab

Players can view and claim roles as well as view and equip various ship components on this tab. The "Ready" column on the Bridge Crew table indicates that status of the role; players who have marked their turn as "Done" will have the status update to "Yes". Once all roles are ready, the GM can advance the turn in the combat tracker.

GMs can manually override the name of a role as well as change the skill associated with a given role from this tab by editing the fields under the Bridge Crew table.

---

## Configuration Tab

The Configuration tab is where role count, weapon configuration, and the ship component inventory is managed. It is only accessible to players with Owner-level permission and to the GM.

### Ship Configuration

| Setting | Values | Notes |
|---------|--------|-------|
| Active Roles | 3 – 6 | Number of active player stations; see crew reference READMEs for per-size layouts |
| Strike Craft | Yes / No | Show or hide the Strike Craft ordnance column and actor template drop target |
| Movement | Simplified / Realistic | Helm movement model. **Simplified** uses fixed-radius arcs and immediate bearing changes. **Realistic** uses Newtonian vector physics with persistent momentum. |

### Torpedo / Strike Craft Launch Directions

Pill toggles for each direction (Bow, Port, Starboard, Stern) control which sides are valid launch origins for torpedoes and strike craft. At least one direction must be active; if all are deselected for a type the launch action returns an error.

### Hull Max

**Hull maximum is set directly on the ship actor** — it is the only stat not derived from a component. Set it in the header bar at the top of the sheet.

### Weapon Slots

Set the slot count for each weapon position. Only positions with at least one slot are shown in the active station tabs.

| Position | Notes |
|----------|-------|
| Prow | Forward-facing fixed mount |
| Dorsal | Forward-facing fixed mount |
| Port | Port broadside |
| Starboard | Starboard broadside |
| Stern | Rear-facing fixed mount |
| Ordnance | Number of simultaneously loadable ordnance bays |

### Equipment Slots (Component Inventory)

All ship stats other than hull max are derived from installed **Ship Component** items. Only components with the equipped flag active are read.

| Slot | Drives |
|------|--------|
| Shields | Max flux, shield strength per core, sector zone thresholds, Flux to AP ratio |
| Hardness | Hardness value per sector (Bow, Stern, Port, Starboard), Hardness portion of **AC** contribution |
| Engine | Base speed, base maneuverability, Auxiliary Power conversion rate, Engine protion of **AC** contribution |
| Sensor Array | Hit Modifier (weapon accuracy bonus), band size (accuracy decay), optimal range, max detection range, AP cost ratio |
| Reactor Core | Core output, heat capacity, Auxiliary Power capacity, Auxiliary Power generated per core dispatched |
| Ordnance Bay | Torpedo salvo size, strike craft flight size, available payload count, manpower |

Only one component per equipment slot type is active at a time; switching the dropdown unequips the previous one.

### Ordnance Actor Templates

Torpedoes and strike craft are separate **actor** types that are initialized outside the ship sheet. They are registered as launch templates by dragging them into the two drop targets on the Config tab; once registered, the original actor can be deleted:

- **Torpedo Actors** — drag one or more torpedo actors here; the Ordnance Master selects which type to arm/launch each round depending on how many are equipped on the **Overview** tab.
- **Strike Craft Actors** — drag one or more strike craft actors here; same selection logic

Each template actor carries all stats for that ordnance type: speed, maneuverability, fuel, warhead damage and blast radius (torpedoes), hull, sensor rating, weapon load (strike craft). When a torpedo or flight is launched, a new token is spawned on the canvas using the template actor's stats. The original template actor is never modified during play.

The health of an ordnance actor template should be 0/1; this will be multiplied accordingly by the Ordnance Bay's salvo/flight size stat. Upon taking damage from any source, an ordnance actor will lose exactly 1 hitpoint; multiple hits from a salvo will deduct multiple hitpoints.

---

## Points Allocation

Several station roles (Captain, Engineer, Pilot, Gunner, Ordnance Officer) earn **action points** each round by rolling their primary skill check. The number of points awarded is determined by the roll total against the following DC table:

| Roll Total | Points Awarded |
|-----------|----------------|
| ≤ 14      | 0              |
| 15 – 19   | 1              |
| 20 – 24   | 2              |
| 25 – 29   | 3              |
| 30 – 34   | 4              |
| *(+5 per tier)* | *(+1 per tier)* |

### Natural 20 and Natural 1

- **Natural 20** (die face = 20): the points awarded are increased by **+1**, on top of the table result.
- **Natural 1** (die face = 1): the points awarded are decreased by **−1** (minimum 0), on top of the table result.

The chat card shows the table with the active row highlighted at the roll-total position, a "Natural 20: +1 point" or "Natural 1: −1 point" note when applicable, and the final adjusted **→ Points Granted** count.

If the player uses the PF2e reroll context menu (Hero Point, Keep New, etc.) on a points roll, the chat card updates to the new total **and** the ship sheet is automatically updated to the new point value.

---

## Movement

Two movement models are available, selectable in the Configuration tab.

### Simplified Movement

The ship travels in a fixed-radius arc anchored to the current heading. The Helmsman sets a bearing (port or starboard, up to Maneuverability × 15°) and a power level; the ship arcs that many degrees and travels the corresponding distance. Minimum move is enforced: the ship must travel at least half the distance it moved last turn, represented by the yellow marker on the Thrust slider.

### Realistic Movement (Newtonian)

The ship has a persistent **velocity vector** carried between turns. Each helm activation adds thrust along the new heading on top of that residual momentum. The interplay of momentum and thrust determines where the ship actually ends up.

#### Helm Controls

| Control | Description |
|---------|-------------|
| **Bearing** | Port/starboard heading change, in degrees. Capped to Maneuverability × 15° per turn (the **Bearing Adjustments** bar tracks remaining budget). |
| **Thrust** | Power committed to the drives. |
| **Momentum** | Percentage of last turn's velocity to carry into this manoeuvre. Remaining momentum auto-drifts at turn end. |

#### Velocity Display

The Min. Move indicator in the header row shows the current momentum vector on hover. Click the compass icon to toggle between **relative** bearing (degrees off the ship's nose) and **true** bearing (compass north = 0°).

### Ramming

The **Ram Target** button (both modes) becomes active when at least one visible target is reachable within the current bearing arc and remaining power. Hovering a row in the popup previews the ram arc; clicking **Ram** commits all remaining power.

**Physics on impact:**
- The rammed ship is displaced in the direction of impact and receives hull damage bypassing shields and hardness.
- The ramming ship receives hull damage in return.
- **Realistic mode:** The ramming ship retains 20% of its velocity vector; the rammed ship inherits 50% of the ramming ship's velocity.
- **Simplified mode:** The ramming ship rotates ±20° randomly to simulate the impact jolt.
- In both modes a crit roll is made for each ship.
- **Damage formula** (both modes): `(bowHardness + 0.25 × hullMax) × thrustFraction × angleMod × 2`. The ramming ship's incoming damage is reduced by bow hardness.
- After a ram the helm is locked for the remainder of the turn: Thrust slider, prow weapons, and bow ordnance launches are all disabled.

---

## Shields, Hardness, and AC

The angle of incoming damage is calculated and assigned to the appropriate sector that is hit (Bow, Stern, Port, Starboard). 

For every point of active shield, 1 incoming hit is fully nullified, regardless of damage. Shields can be **overcharged** above the sector's maximum; however, any shields over the maximum are lost at the start of the following turn.

Hardness negates 1 point of damage per point of hardness. 

Weapon attacks are rolled against the target's **AC** (Armour Class) to determine hits.

---

## Internal Fire

Deals passive hull damage each round and reduces available manpower.

---

## Critical Hits

Each shot outcome follows the **four-degree SF2e resolution** — the same rules as the core system: exceed the DC by 10+ → critical success, meet the DC → success, fail by up to 9 → failure, fail by 10+ → critical failure.

**Crits** (critical successes) are scored when a single shot's total exceeds the target's AC by **10 or more**. Each critting shot generates one crit roll, always starting at the **Low** tier (there is no pre-roll severity die).

**Natural 20** promotes the outcome by one degree: failure → success, success → critical success. A missed shot becomes a hit; a hit does not automatically become a crit unless it already exceeded AC by 10.

**Natural 1** demotes the outcome by one degree: critical success → success, success → failure, failure → critical failure.

The **Devastating** weapon trait lowers the crit margin: Devastating 2 means a shot crits when it exceeds AC by 8 or more. Critting shots also deal bonus damage equal to the Devastating value.

The **Devastation Protocol** captain stance changes the rule: every shot that deals net hull damage after shields and hardness counts as a crit, regardless of the roll margin.

Location is determined by a **d6** (or Gunner's choice with **Directed Fire** active). Crits landing on an already-damaged location trigger an escalation roll: 4+ on a d6 steps it up one tier; a High-tier location that would escalate further deals –3 hull damage instead.

| Location | Low | Medium | High |
|----------|-----|--------|------|
| Hull | +1 hull damage/round | +2 hull damage/round | +3 hull damage/round + +5 internal fire/round |
| Engines | –1 Speed | –2 Speed | –4 Speed |
| Manoeuvring Thrusters | –1 Maneuverability | –2 Maneuverability | –4 Maneuverability |
| Core Systems | Core distribution disabled | Core distribution disabled + 5 heat/round | Core distribution disabled + 5 heat/round + AP generation disabled |
| Weapons & Sensors | One weapon section disabled | One weapon section disabled + sensor offline (lock upgrades blocked, radar hidden) | All weapons –2 to hit + one weapon section disabled + sensor offline |

Condition step-down (damage control) costs 10% of maximum Auxiliary Power per action. The same location can be stepped down multiple times in the same turn as long as AP and repair actions remain.

---

## Ordnance

### Torpedoes

Torpedo tokens are manually controlled by the owning player. Each torpedo has hull (warhead count), speed, maneuverability, and fuel. They must be moved each round; the controlling player issues helm orders. On detonation, the warhead deals area damage falling off with distance from the blast centre, multiplied by the number of intact warhead sections (hull integrity). All ships, torpedoes, and strike craft within the blast radius are affected regardless of allegiance.

The turn a torpedo is launched it drifts automatically and cannot be given orders — it acts normally from the following round.

### Strike Craft

Strike craft flight tokens are manually controlled. Each flight has hull, fuel, an sensor rating, and an optional weapon. Fighters make attack runs against ships, other craft, or torpedoes; bombers attack ships only. Flights that run out of fuel before returning to the mothership are lost.

---

## Weapon Traits

| Trait | Effect |
|-------|--------|
| Shield Bypass | Hits ignore shields entirely |
| Multiple Attacks| Able to fire an infinite amount of times per turn, as resources permit |
| Shield Burn | Each hit absorbed by shields drains additional flux |
| Rend | Each hit permanently reduces sector hardness regardless of hull damage dealt |
| Hardness Penetration | Reduces effective sector hardness per hit |
| Devastating | Reduces the crit margin by this value (base crit requires exceeding AC by 10; Devastating 2 means crit at AC+8). Each critting shot also deals bonus damage equal to this value |
| Unreliable | A **critical failure** (the shot's final tier is `crit_miss` — fails by 10 or more after nat-20/nat-1 degree adjustments) causes that shot to jam and **halts the entire salvo**. A nat-1 that is promoted to a miss (e.g. nat-1 on a hit) does **not** trigger a jam; only a genuine critical failure does |
| Overcharge | Heat weapons only. When fired overcharged: 2 heat per shot, triple weapon trait values |
| Hit Rating | Flat bonus or penalty to base hit chance for all shots |

---

## NPC Ships

NPC ships use a separate actor type with simplified GM-only controls: weapon batteries, hardness, shields, hull, and condition tracking without the full player-facing station UI.

---

## Module Settings

| Setting | Description |
|---------|-------------|
| Contact Designation | Label style for unidentified Sensor blips: Greek letters, numeric, or naval callsigns |
| Sweep-Gated Radar Positions | Blip positions only update when the radar sweep arm passes over them |
| Movement Mode | Simplified fixed-radius arcs or Realistic Newtonian vector physics |