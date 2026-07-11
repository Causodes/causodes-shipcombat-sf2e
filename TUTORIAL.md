# Introduction

This module introduces a standalone role-based starship combat system. The key idea behind the module is that players have asymmetric information and can only see the information available to their role.

The module registers **three actor types**:
* Player role-based ship actors
* GM/NPC simplified ship actors
* Ordnance (Torpedo/Strike Craft) actors used by both Player and GM/NPC ships

Ships are broken into four quadrants: Bow, Stern, Port, and Starboard, and attacks/damage are resolved against each quadrant depending on the relative positions of the attacker and defender.

Additionally, this module also registers a **Starship Component item type**, which is used to register various stats on Player ships and weapons on Player and GM/NPC ships. The motive for Ship Components is to grant players a modular ship customization experience where they can weigh the tradeoffs of various components as they swap parts out.

# Initial Setup
Start by heading over to **Module Settings** and adjust some global settings as you see fit. You'll see something like this:
![](https://github.com/user-attachments/assets/c4bc6ed6-7560-4239-b388-2c510a0e729c)
* **Contact Designation**: Purely flavor text. Adjust according to your setting.
* **Sweep-Gated Sensor Radar Positions**: If this is toggled on, on the sensor radar, the contact blips' locations will only update when the sweeping arm passes over their new/old positions. While this is more realistic, this may be annoying for player experience as when their ship or enemy ships move, the positions on the UI will only update after a brief delay.
* **Movement Mode**: 
    * **Simplified** makes all ships handle like naval ships; they move along their bearing and turn in arcs. This is not how ships would actually move in space but it is great for gaming purposes and more intuitive.
    * **Realistic** makes all ships handle like how they actually would in space. Ships carry momentum from round to round and can drift independent of their current bearing. If a ship wants to stop, they'll have to rotate opposite their current momentum vector and accelerate in that new direction. This is more complicated and may prove to be more confusing for players, but it is also the way Newtonian physics actually work.

Next, go to **Core** settings and make sure you turn `Automatic Token Rotation` ON:
![](https://github.com/user-attachments/assets/3569f69c-db95-4b6c-9d35-e8f6d2e1315b)

Next, for battlemap setup, I would recommend a gridless setup. Due to the nature of the ships' movement, ships will not always end up exactly on a grid square. Do make sure you correctly configure the grid size though, so ships will have enough room to work with.

# Player Ship
To set up a **player ship**, create a new `Player Starship` actor and grant all players **Observer** ownership permissions.

You will see a sheet like the one below:

![](https://github.com/user-attachments/assets/b1abbe74-b7d1-4b0f-abf7-4dd3186a3bd4)

### Sidebar

Let's start with the sidebar and what each of the sections do:
* **Hit Points**
    * Current HP/Max HP: The current/maximum hitpoints of the player ship. The max HP value is **NOT** inherited from starship components and is manually set. 
        * The value can be overriden by the GM by double clicking it and editing it.
    * Fire: Fire deals damage directly to a ship's HP pool, bypassing Hardness and Shields. 
        * Fire will originate from various sources and can be dealt with using certain crew abilities. 
        * The value can be overriden by the GM by double clicking it and editing it.
* **Armor Class**
    * AC: The Armor Class of the ship is used in calculating whether an attack against it hits the ship. This value is inherited from a combination of the ship's `Engine` and `Hardness` **Starship Components**. 
        * A breakdown of the contribution can be viewed by clicking the *Modifiers* button, and flat modifiers can be injected there as well.
    * Hardness: The Hardness of the ship decreases all incoming damage to the ship's respective quadrant by a flat modifier equal to its value. This value is inherited from the ship's `Hardness` **Starship Component**. 
        * Hardness values can be damaged/reduced by various sources.
* **Shields**
    * Shields: Each point of shield will completely negate the damage of one successful incoming attack to its respective quadrant, draining one point of shield instead. The maximum shield value per quadrant is inherited from the ship's `Shields` **Starship Component**. 
        * Shields can be overcharged above their maximum; however, at the start of the next turn any remaining values that are overcharged will decay back to their maximum.
* **Initiative**
    * Initiative: Used to determine the starship's combat initiative. This uses the actor in the `Captain` role's stats and defaults to the Captain role's main skill.
* **Immunities, Weaknesses, and Resistances**
    * Immunities: Manually set by the GM, the starship is immune to all incoming damage of this type. Attacks of this type **DO NOT** drain Shields.
    * Weaknesses: Manually set by the GM, the starship is weak to all incoming damage of this type. Incoming damage is modified by the weakness value BEFORE Hardness is applied.
    * Resistances: Manually set by the GM, the starship is resistant to all incoming damage of this type. Incoming damage is modified by the resistance value BEFORE Hardness is applied.

### Configuration
Now that we've taken a look at some of the major stats, let's set up our player ship. Head on over to the **Configuration** tab by clicking the *Cog Wheel* icon in the top right corner. You will see a sheet that looks like the following:

![](https://github.com/user-attachments/assets/b102431c-e99b-434c-ab87-c0318983a646)

**IMPORTANT**: note that various values, especially those inherited from Components, may not update until the **Reset/Refresh** button is clicked on the **Overview Tab** in the *Bridge Crew* table: ![](https://github.com/user-attachments/assets/06cb2f5c-bf0a-4d76-8e40-b079bf3143c8).

This is my recommended order for setting up a ship:

1. **Active Roles**: Determine the number of players that will crew this ship and set the Active Roles accordingly. Valid values are 3 - 6. If you have more than 6 players, consider using two ships (for example, for 7 players, a ship of 3 and a ship of 4). The roles will dynamically update based on the number of active roles.
2. **Strike Craft**: Determine whether you want your ship to have strike craft (Fighters/Bombers). A large battleship/carrier would likely have strike craft; a small patrol craft may not. These can be flavoured to be drones, so this is purely up to how you want the ship to play.
3. **Manpower Flavor**: Purely adjusts flavor text depending on the size of the ship. A large cruiser would use raw manpower for its massive batteries and ordnance. A small patrol craft would probably use something like an autoloader.
4. **Component Inventory**: We'll next move on to defining the key starting characteristics of the ship via adding components to it. Add a component by either clicking the "+" in the top right corner of the section or creating a item of **Starship Component** and dragging it into the **Component Inventory** section. Open the starship component and you'll see a sheet like the following: ![](https://github.com/user-attachments/assets/df735ca0-2e85-42aa-ba71-fbcdbfb7c1bf)
    1. **Shields**: Start by changing the `Slot` to `Shields` on the lefthand sidebar and hopping over to the **Details** tab. You'll see several values; the following screenshot shows what I think are a good starting point, but feel free to adjust as necessary ![](https://github.com/user-attachments/assets/cc40a434-7e45-453b-af61-3c74a97cc2d8):
        * **Max Shield Flux**: This is the maximum potential "pool" of points the player in charge of shields can have at the start of their turn to distribute to the four quadrants.
        * **Zone Threshold**: This is the maximum value that a shield can have in each given quadrant of the ship. Note that shields can be *overcharged* above this value for a turn; however, any remaining overcharged shields will decay back down to this value at the start of the next turn.
        * **Flux → AP Ratio**: The player in charge of shields can convert points of `Flux` to `Auxiliary Power`. Auxiliary Power is a sort of "universal currency" used by many of the roles; this field determines the conversion rate of Flux to Auxiliary Power. Since this particular field works as a bleedback, I tend to keep it relatively low.
    2. **Hardness**: Next, make a new starship component and change the `Slot` to `Hardness` on the lefthand sidebar and hop over to the **Details** tab. You'll see something like the following screenshot; these are what I think are a good starting point ![](https://github.com/user-attachments/assets/29d98d7c-bf11-4dbb-8913-a75b94fc45d2):
        * **Hardness**: This is the starting/maximum hardness for each given quadrant of the ship. Various effects can reduce these values, and upon resetting the ship's combat state, the hardness values will default back to the configuration here.
            * Bow Hardness also partially determines the damage a ship will deal and reduce reflected damage when *ramming* another ship. 
            * I like to make the hardness values non-uniform to make positioning a bit more important.
        * **AC Contribution**: How much `Armor Class` is provided by the Hardness component. The other half comes from the **Engine** component that we will go over next. I split this into two so that players can have a bit more nuance when deciding whether to swap out Hardness and Engines.
    3. **Engine**: Next, make a new starship component and change the `Slot` to `Engine` on the lefthand sidebar and hop over to the **Details** tab. You'll see something like the following screenshot; these are what I think are a good starting point ![](https://github.com/user-attachments/assets/1fc59bc7-4d03-49d7-af0c-967feeef3e71):
        * **Speed**: This determines how many tiles a ship can go in a turn and how much it can affect its inertia. Each point corresponds to one grid square distance on a map. A player ship's initial momentum/interia will be equivalent to half of this value.
        * **Maneuverability**: This determines how many degrees of an arc a ship can turn using 100% of thrust in *Simplified* movement and how much a ship can rotate in a turn in *Realistic* movement. Each point corresponds to 15 degrees of an arc.
            * For example, if the value is `6`, in *Simplified* movement a ship starting facing due North will end up facing due West if the pilot inputs full Port bearing with 100% of Power. In *Realistic* movement, a ship can adjust its bearing at most a total of 90 degrees in a single turn.
        * **Power Per AP**: The player in charge of piloting the ship can take `Auxiliary Power` and convert it into more power for their movement slider. This value determines how much Power% is awarded per AP spent. 
            * I like to do an even but small number like 5% or 10%.
        * **AC Contribution**: How much `Armor Class` is provided by the Engine component. The other half comes from the **Hardness** component that we went over previously. I split this into two so that players can have a bit more nuance when deciding whether to swap out Hardness and Engines.
    4. **Sensor**: Next, make a new starship component and change the `Slot` to `Sensor` on the lefthand sidebar and hop over to the **Details** tab. You'll see something like the following screenshot; these are what I think are a good starting point ![](https://github.com/user-attachments/assets/f51c8fa9-db67-409d-9891-6e2a56c0d0b9):
        * **Hit Modifier**: Applies a flat modifier to hit for all weapons mounted to the ship. Think of this like a +N rune/enchant on a weapon.
        * **Band Size**: Each weapon mounted to the ship will have a *Max Range*. Targets can be engaged outside of a weapon's max range, however, a stacking penalty will be applied depending on how many *bands* the target is outside of of the maximum range.
            * For example, if the *Band Size* is `2`, a weapon has a *Max Range* of `10`, and the target is `15` units away, a `-3` modifier will be applied: `ceil( (15-10) / 2 ) = 3`.
            * The maximum negative modifier is `-20`. Targets further away than that can no longer be engaged.
        * **Optimal Range**: Targets within optimal range will have all the various modifiers to hit *doubled* against them. Additionally, the player in charge of the sensor usually needs to maintain various levels of lock for the gunner to be able to engage targets. Ships within optimal range automatically have at least *Lock Level 2* applied to them. 
            * This is intended to be a distance that players can close to for a devastating point blank engagement. It should be very small and similar to what we will later put for NPCs to make this a high risk high reward option.
        * **Max Detection Range**: What is the maximum range that other contacts will show up on the sensor UI. 
            * Unless a target has at least *Lock Level 1*, a ship is hidden on the canvas and can only be detected by the player on the sensors. It is the responsibility of the player on sensors to lock up the target so the other players can see and engage the target.
            * Consequently, we want to make this value very large so players will have ample time to detect and react accordingly to hostile ships.
        * **AP Cost Multiplier**: The player in charge of sensors has various abilities/actions they can take. Each of them has an associated `Auxiliary Power` cost. This field multiplies the default costs for each ability/action by its scalar value.
            * The idea for this is you can configure a sensor with very good stats to cost more for abilities or vice-versa.
    5. **Reactor Core**: Next, make a new starship component and change the `Slot` to `Reactor Core` on the lefthand sidebar and hop over to the **Details** tab. You'll see something like the following screenshot; these are what I think are a good starting point ![](https://github.com/user-attachments/assets/3a1189aa-e435-487e-93ec-6296a2f2becc):
        * **Core Output**: This determines the baseline number of cores that are awarded at the start of each turn. Cores are the primary currency used by the player in the Engineer role. They are used to unlock additional abilities for other roles, generate `Auxiliary Power` used by all other roles, and allocate `Shield Flux` to power the ship's Shields.
            * We want to make the Cores a little scarce so the Engineer has to consider various tradeoffs each turn. They can get more in a given turn by gambling with an action called *Overclocking*, so we can go a bit on the lower side. I recommend the number of cores to be about the number of other roles available in the ship (so for a `6 crew` ship, about `5 cores`).
        * **Shield Strength per Core**: This determines how much *Shield Flux* is awarded at the start of the following turn per core spent on Shields.
            * I recommend a value to be around the **Max Shield Flux** we set earlier divided by the **Core Output**. 
            * The reason the Shield Flux is delayed by a turn is to reward planning ahead by the Engineer. If Shield Flux is urgently needed, the player in charge of shields can divert Shield Flux from one quadrant to another.
        * **Heat Capacity**: Heat is a shared resource used by both the Gunner and Engineer. Each time the gunner fires a heat-based weapon or the Engineer *Overclocks*, Heat increases.
            * I like to default Heat to a value of about `20`. You can adjust accordingly, and make better cores have higher capacity.
            * Heat serves as the secondary tension for the Engineer. They need to manage the tradeoff between their Heat generated by *Overclocking* and the need for more Cores from *Overclocking*.
        * **Auxiliary Power Capacity**: `Auxiliary Power` is a "universal currency" used by nearly every role. This value determines the maximum Auxiliary Power a ship can have at any given point of time.
            * I recommend a minimum of `40` if you plan on having Sensors have a default cost multiplier of `1.0`.
        * **Auxiliary Power per Core**: This determines how much *Auxiliary Power* is awarded at the start of the following turn per core spent on Auxiliary Power.
            * I recommend a value to be around the **Auxiliary Power Capacity** divided by the **Core Output**. 
            * The reason the Auxiliary Power is delayed by a turn is to reward planning ahead by the Engineer. If Auxiliary Power is urgently needed, the player in charge of shields can divert Shield Flux to Auxiliary Power.
        * **Overclock Base DC**: The base DC for the Engineer's *Overclock* checks at minimum heat. The DC scales up by 10 as the reactor approaches maximum Heat.
            * Only successful *Overclock* tests grant cores, so use this as a lever to tune how consistently the reactor rewards cores.
            * I recommend staying around `10`, potentially moving this as low as `5` to as high as `20`, depending on how inconsistent you want this reactor to be. Remember, the max DC will be the base plus an additional `10`.
    6. **Ordnance Bay**: Next, make a new starship component and change the `Slot` to `Ordnance Bay` on the lefthand sidebar and hop over to the **Details** tab. Note that if you have `Strike Craft: No` under the **Configuration Tab**, you don't need to fill out the Strike Craft sections. You'll see something like the following screenshot; these are what I think are a good starting point ![](https://github.com/user-attachments/assets/7b37e404-285c-4eaf-9fb3-add77edf78fc):  
        * **Manpower**: Manpower (or **Load Capacity**, if you set the *Manpower Flavor* to `Small Craft`) is the primary resource used by the player in charge of Ordnance. Various actions taken by the player will reserve `x manpower` for `n turns`.
            * I recommend a default value of around `30-40`.
            * **Fire** in addition to dealing direct damage to a ship's HP will also decrease the max Manpower of the ship.
        * **Ammo Capacity**: The maximum amount of *Ready Rounds* resource that the ship can have. This is used by gunner weapons that consume *Ammo*.
        * **Torpedo Salvo Size**: When firing torpedos, this determines the number of torpedos in the generated torpedo actor.
            * The number of hitpoints of the torpedo are multiplied by the salvo size. The damage is multiplied by the number of surviving torpedos at detonation time. Adjust this accordingly if you want your ship to feel more like a gunship, a torpedo ship, or somewhere in between.
        * **Strike Craft Capacity**: The maximum number of flights/groups of strike craft this ship carries.
            * If all flights are lost/destroyed, the ship cannot launch additional flights until a flight is repaired.
        * **Concurrent Flights**: The maximum number of concurrent flights that can be deployed at a given time.
        * **Strike Craft Flight Size**: When launching strike craft, this determines the number of strike craft in the generated strike craft flight actor.
            * The number of hitpoints of the strike craft flight are multiplied by the flight size. The damage is multiplied by the number of surviving strike craft at attack time.
5. **Weapons**: Next, we'll take a look at the weapons we want the ship to have. Go back to the **Configuration Tab** and adjust the **Weapon Battery Slots** accordingly to the number of weapons you want to have in each position. Each slot is centered on a different location:
    * Prow: Centered on the Bow (straight forward)
    * Dorsal: Centered on the Bow (straight forward)
    * Port: Centered on the Port (straight left)
    * Starboard: Centered on the Starboard (straight right)
    * Stern: Centered on the Stern (straight back)
    * Ordnance: The number of unique types of ordnance (strike craft and torpedoes) the ship will carry. More will allow the ship to be able to potentially fire multiple types of torpedoes or launch multiple types of strike craft.


    1. **Weapon Batteries**: To set up a weapon battery, make a new starship component and change the `Slot` to `Weapon Battery` on the lefthand sidebar and hop over to the **Details** tab. You'll see something like the following screenshot; this is an example weapon ![](https://github.com/user-attachments/assets/af530e33-18d5-456b-9404-b9d7230060b6)
        * **Animation Style**: This only determines what type of animation the weapon will have when it fires. Requires [Sequencer](https://foundryvtt.com/packages/sequencer) and [JB2A - Jules&Ben's Animated Assets](https://foundryvtt.com/packages/JB2A_DnD5e). If you don't have these modules, this field does nothing and can be left to any value.
        * **Position**: Which weapon position this battery will occupy.
        * **Resource Type**: Whether the weapon consumes `Auxiliary Power` (Power), consumes `Ready Rounds` (Ammo), generates `System Heat` (Heat), or is free (None).
            * Power-based weapons have a special *Charge Step* mechanic that multiplies their damage based on consumed `Auxiliary Power`. A Power-based weapon will always fire at their maximum charge.
            * Ammo-based weapons can consume additional `Ready Rounds` to fire extra salvos and multiply their damage.
            * Heat-based weapons, if they have the *Overcharge* trait, can generate additional heat per shot to apply their other weapon trait effects extra times.
        * **Range**: The maximum effective range of the weapon. Weapons can shoot beyond this range with penalties depending on the equipped sensor's **Band Size**.
        * **Degree of Fire**: The arc that the weapon can fire in. Only targets within the arc can be targeted.
        * **Charge Step (ONLY FOR POWER WEAPONS)**: The amount of Auxiliary Power spent to go up each charge level. Each charge level multiplies the damage dealt by an additional factor, up to 4x.
        * **Damage**: Damage and type for the weapon.
        * **Salvo Size**: The number of attack rolls made per attack with the weapon. Each successful attack roll applies the full damage.
        * **Traits**: The active traits on the weapon. See the `Weapon Traits` section of the [README.md](README.md) for detailed descriptions.
    2. **Torpedoes**: To set up a torpedo, create a new **Starship Ordnance** actor, go to the **Configuration** tab, and under **Ordnance Type** select **Torpedo**. You'll see something like the following screenshot; this is an example configured weapon ![](https://github.com/user-attachments/assets/4ced7d84-9810-4e15-ad38-47ca51a6063c):
        * **FUEL**: The maximum number of rounds a torpedo will be active for.
        * **SPD**: The speed of the torpedo; see the **Engine** section above for more details.
        * **MAN**: The maneuverability of the torpedo; see the **Engine** section above for more details.
        * **RADIUS**: The blast radius of the torpedo upon detonation. The closer the target is to the center of the blast radius, the more damage the torpedo deals, up to its maximum configured value.
        * **AC**: The Armor Class of the torpedo.
        * **DAMAGE**: The damage dealt PER surviving torpedo at detonation time.
        * **WARHEAD TRAITS**: See the `Weapon Traits` section of the [README.md](README.md) for detailed descriptions.
            * REND: Rend
            * HARD PEN: Hardness Penetration
            * SHD BURN: Shield Burn
            * SHD BYPASS: Shield Bypass
        * **Token Configuration**: Don't forget to configure the Prototype Token for the Torpedo.
        * **Warheads Mechanic**: The number of warheads for the torpedo will be dependent on the **Ordnance Bay** component at time of launch. Each successful attack against a torpedo actor will deduct `1` warhead, regardless of damage dealt. Damage inflicted by the torpedo is multiplied by the number of surviving warheads at detonation time.
    3. **Strike Craft**: To set up a strike craft, create a new **Starship Ordnance** actor, go to the **Configuration** tab, and under **Ordnance Type** select **Strike Craft**. You'll see something like the following screenshot; this is an example configured weapon ![](https://github.com/user-attachments/assets/f8727081-d3b6-478a-b6dd-68a88bcdc7e3):
        * **FUEL**: The maximum number of rounds a strike craft will be active for. If it does not return to the ship by the time it runs out of fuel, it will be considered lost and destroyed.
        * **AMMO**: The maximum number of attack runs a strike craft can make during a sortie.
        * **SPD**: The speed of the strike craft; see the **Engine** section above for more details.
        * **MAN**: The maneuverability of the strike craft; see the **Engine** section above for more details.
        * **OPT**: The optimal range of the strike craft; see the **Sensor** section above for more details.
        * **BND**: The band of the strike craft, see the **Sensor** section above for more details.
        * **HIT**: The hit modifier of the strike craft, see the **Sensor** section above for more details.
        * **AC**: The Armor Class of the strike craft.
        * **DAMAGE**: The damage dealt PER surviving strike craft at attack time.
        * **ANGLE**: The arc that the strike craft can attack in. Only targets within the arc can be targeted. The arc is centered on the bow (straight forward).
        * **SALVO**: The number of attack rolls made per attack with the strike craft. Each successful attack roll applies the full damage.
        * **WEAPON TRAITS**: See the `Weapon Traits` section of the [README.md](README.md) for detailed descriptions.
            * REND: Rend
            * HARD PEN: Hardness Penetration
            * SHD BURN: Shield Burn
            * SHD BYPASS: Shield Bypass
        * **CRAFT TYPE**: Fighters can target anything; Bombers cannot target other strike craft or torpedoes (only ships).
        * **Token Configuration**: Don't forget to configure the Prototype Token for the Strike Craft.
        * **FLIGHTS Mechanic**: The number of strike craft in a flight will be dependent on the **Ordnance Bay** component at time of launch. Each successful attack against a strike craft flight actor will deduct `1` FLIGHTS, regardless of damage dealt. Damage inflicted by the strike craft is multiplied by the number of surviving strike craft at attack time.
        * **Attack Mechanic**: Strike craft can only attack a given target once per turn.
6. **Register Components**: Now that you've set up all the components, updated the Max HP, Immunities, Weaknesses, and Resistances accordingly, you'll need to register/activate them. Head on over to the **Overview** tab, swap to the **Components** subtab, and make sure each item is set in the appropriate category/activated, as seen in the screenshot: ![](https://github.com/user-attachments/assets/e51f5d3a-a894-4b13-9be3-9187d2f5c6c4)
7. **Assign Player Roles**: Last step, assign roles! Swap back to the **Crew** subtab on the **Overview** tab and either click and drag player actors into each role, or allow them to assign the roles themselves! Players will have a button they can click to claim/release a given role. If you so wish, you can rename the role or adjust the Main Skill associated with each role as well.

If you wish to learn about the functionalities of each role, check out the role-specific reference documents for full details on what each station does!

- [README_3.md](README_3.md) — 3-player crew
- [README_4.md](README_4.md) — 4-player crew
- [README_5.md](README_5.md) — 5-player crew
- [README_6.md](README_6.md) — 6-player crew

# NPC Ship

NPC Ships operate much in the same manner as Player Ships, albeit with a much simplified workflow to facilitate easy GMing. With the exception of Weapon Batteries and Ordnance (Strike Craft/Torpedoes), NPC Ships do NOT inherit stats from components; the values are manually set.

To create an NPC ship, head on over to the Actors tab and create a new **NPC Starship**. You'll see a sheet like the one below:

![](https://github.com/user-attachments/assets/713b5b1a-5983-4f9a-b116-7ab8bd3057da)

Let's go over the parts:

### Ship Stats
* **PIL**: Piloting modifier. A flat modifier to *Piloting Checks* used to allocate additional *Speed*, *Maneuverability*, or *Evasion* points on the **Movement** tab. It also determines the *Initiative* modifier.
* **ENG**: Engineering modifier. A flat modifier to *Engineering Checks* used to *Reduce Heat* or *Suppress Fire*. 
* **RNG**: Ranged modifier. A flat modifier to *Ranged Checks* used to allocate additional *Accuracy*, *Penetration*, or *Firepower* points on the **Weapons** tab.
* **SPD**: The speed of the NPC ship; see the **Engine** section under **Player Ship** for more details.
* **MAN**: The maneuverability of the NPC ship; see the **Engine** section under **Player Ship** for more details.
* **OPT**: The optimal range of the NPC ship; see the **Sensor** section under **Player Ship** for more details.
* **BND**: The band size of the NPC ship; see the **Sensor** section under **Player Ship** for more details.
* **HIT**: The hit modifier for the NPC ship; see the **Sensor** section under **Player Ship** for more details.

### Hardness
The hardness section is an overview of the Hardness status of the ship. Each of the four sections is broken into two numbers: the **current** armor/hardness value on the left, and the **maximum** on the right.

### Button Controls
These buttons serve as a simplified version of the Engineer's actions as well as the NPC ship's version of the Reset/Refresh button the player ship actor has.
* **Reduce Heat**: Reduces the *System Heat* resource based on the result of an *Engineering Check*.
* **Suppress Fire**: Reduces *Internal Fire* based on the result of an *Engineering Check*.
* **Full Reset**: Fully resets the combat state of the ship.

### Shield Allocation
This UI functions much the same way as the Player Ship's shield allocation UI, with the exception that the maxes are directly edited on the legend to the left.

### Ship Conditions
Any active conditions affecting the ship will be listed here.

### Sidebar
Much of the core stats of the ship are manually set here. These include **AC**, **HP**, **Immunities**, **Weaknesses**, and **Resistances**.

### Movement, Weapons, and Ordnance Tabs
**Movement** and **Weapons** function much in the same way of the player ship, with the exception that weapons do not require a "Lock" to fire. The three resource tracks at the top of the **Weapons** tab can be manually edited, and serve as a guideline more than anything for GMs. **Ordnance** is greatly simplified, with just a UI to register `Ordnance Actors` and a button to launch them.

# Testing
When testing your ships, make sure that you register them to an active combat encounter! Much of the functionality is tied behind turn incrementation, so if you just test it in a whitebox outside of combat, some things will seem to be broken. Have fun; I wish you the best in your sessions!