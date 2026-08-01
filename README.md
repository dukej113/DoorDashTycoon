# Dash to Riches

A complete, playable **third-person delivery tycoon** game in a single HTML file. Hand-written
WebGL2, no assets, no libraries, no build step — every mesh is generated at load, every texture is
synthesized into a canvas and uploaded, and every sound comes from WebAudio oscillators and noise
buffers.

The camera sits behind and above your character. The *simulation* is still a 2D world on the ground
plane (x east, y south, z up) — only the view is 3D — which is why collision, routing and the
economy survived the conversion untouched.

**Renderer:** shadow depth pass → HDR forward pass (analytic sky, GGX specular, PCF shadow map,
height-map contact AO, up to 8 street-lamp point lights plus a headlight spot, height fog) → bloom
chain → composite (ACES tonemap, bloom, depth of field, camera motion blur, vignette, grain) →
FXAA, with 4× MSAA on the main pass at Ultra. Three quality presets on `G`, and it steps itself
down automatically if the first seconds of play run below 24 fps.

You start as a broke gig driver on foot with $12 and a bag. You end up running the city's
delivery empire. In between, some customers are going to say things to you, and you get to
decide how professional you feel about it.

**Play it:** open `index.html` in any modern browser. That's it. (Sound starts on your first
click, as browsers require.)

---

## The loop

1. **Take orders** from the offer list (click, or press `1`–`4`). Each shows the trip length,
   the payout and the time limit.
2. **Drive to the restaurant**, then **park up and press `F` to get out** — deliveries happen on
   foot. Walk the bag to the door, wait for the food if it isn't ready, hop back in (`F`) and run
   it to the customer before the clock dies. A glowing route line shows the fastest way there, on
   the correct side of the road.
3. **Get paid.** Base fare plus a tip that shrinks as the timer drains. On-time drops raise your
   rating; late ones cost you.
4. **Reinvest** in wheels, gear, and eventually a crew of drivers who work the city on their own
   and pay you a cut — even while you drive.
5. **Repeat** until your net worth hits $1,000,000.

Days last three minutes. At the close of each shift you get a P&L: fares, tips, crew earnings,
fines, wages, overhead, and whether you actually made money. Miss payroll and drivers walk. Go
$400 under and the app deactivates you (that's the lose condition).

## Controls

Movement is **camera-relative**: `W` is always "away from the camera", and the camera swings in
behind your direction of travel.

| Key | Action |
| --- | --- |
| `WASD` / arrows | move — camera-relative |
| `Shift` | boost / sprint (recharges) |
| `F` | **get out of / back into your vehicle** |
| `E` | pick up / drop off (also fires automatically if you slow down at the door, on foot) |
| `Space` | **throw a punch** — a real aimed action, on foot, any time |
| `X` / `R` | apologize / refund during a confrontation |
| `1`–`4` | accept an offer |
| `Q` | cycle to your next stop (matters once you're carrying a full bag) |
| `V` | camera angle — Close / Chase / Overwatch |
| `Tab` | business menu |
| `H` | horn (scatters pedestrians) |
| `P` / `Esc` | pause · `M` mute · `N` music |

Touch devices get a drag-anywhere virtual stick and an action button.

## Deliver on foot

Pulling up outside isn't enough. Park, press `F`, and walk the bag to the door — the vehicle stays
exactly where you left it (with a marker over it and a dot on the minimap) until you walk back and
press `F` again. You can't complete a delivery, or throw a punch, from the driver's seat.

Order timers include an allowance for parking and the walk at both ends, so the economy is
unchanged; the trip just has a beat at each end now.

## The punch mechanic

When you're late — or when the food arrives cold, wrong, or drinkless — the customer comes out to
meet you. **This is not a modal.** They spawn in the world, march over to you yelling, and the game
keeps running the whole time: the clock ticks, traffic drives, cops keep chasing. A side panel
shows their procedurally-drawn furious face and complaint. You have **eleven seconds**:

- **`Space` — PUNCH.** A real aimed action: you have to be *out of the car*, within reach, and
  actually facing them, and it's on a cooldown. Swing wide and you whiff. Land it and they drop
  their wallet (instant cash), you gain **street cred**, and you lose **0.45 rating**. If anyone
  sees it, your **wanted level** goes up.
- **`X` — Apologize** — professional, tiny rating save, zero satisfaction.
- **`R` — Refund $5** — costs cash, buys back +0.08 rating.
- **Hesitate or drive off** — the timer runs out, the door slams, and you eat a 0.20 rating hit
  for nothing.

`Space` works whenever you're on foot, not just during confrontations — including on innocent
passers-by, who go comically airborne for a rating hit and a bump of heat.

Wanted level spawns that many police cars, which path toward you through the streets with sirens
and flashing lights. Let one sit on you for a second and you're **busted**: a fine, every order in
your bag confiscated, and a rating hit per lost order. Shake them for long enough and the heat
drops a level.

Street cred isn't decorative — it's the currency of the **Shady** tab: bribe the precinct to wipe
your heat, launder your rating through a review farm, buy a getaway kit, arrange for witnesses to
go quiet, or unionize your crew at a discount. Being a menace is a real, viable, expensive
strategy.

## Progression

- **8 vehicles** — Worn Sneakers → BMX → E-Scooter → Rust Bucket → Hatchback → Cargo Van →
  Muscle Coupe → Silent EV Sport. Each trades speed, handling and bag capacity; the later ones
  unlock as your delivery count climbs.
- **12 upgrades** — bag capacity, thermal liner (slower tip decay), flagship phone (better
  offers), live route GPS, turbo tune, curb-hopper tires (parks stop slowing you), lawyer on
  retainer (heat cools faster, fines halved), PR agency, dispatch software, ghost kitchen (no prep
  waits).
- **Crew** — hire applicants with a skill rating and a daily wage. They drive around the actual
  city as labelled cars, complete deliveries on a timer, drop floating `+$` popups, and fire off
  random events (parking tickets, five-star reviews, catering scores, skill-ups, wrong-house
  deliveries). Upgrade each driver's vehicle tier as you grow.
- **Empire** — dispatch offices add driver slots; district expansions multiply crew earnings
  ×1.85 each, compounding. That's what carries you to $1M.

## Where the ceiling actually is

Being straight about this, since it was asked:

**What hand-written WebGL gets you here.** Real per-pixel lighting, a directional sun with a 2048²
PCF shadow map, an analytic sky that also serves as the ambient and reflection probe, GGX specular
so glass/painted metal/asphalt/concrete genuinely read differently, contact AO sampled from the
building height field, point lights for street lamps, HDR with ACES tonemapping, bloom, depth of
field, camera motion blur, MSAA. Those are all real, and they are the bulk of what makes an image
look lit rather than coloured in.

**What isn't achievable this way, and why.** Screen-space reflections and screen-space GI need a
G-buffer and a deferred pipeline — buildable, but it would roughly double the renderer and the
payoff on a city of flat-shaded boxes is small; the analytic sky reflection already covers the
cases that read (glass, car paint, wet road). Ray-traced anything is out. Cascaded shadow maps
would fix the ~620-unit shadow radius, but need 3-4× the shadow cost. Soft shadows are PCF, not
area lights. Real cloth, hair, skin and facial animation need an asset pipeline and rigged meshes —
the character is articulated boxes with a walk cycle, and it looks like articulated boxes with a
walk cycle. Volumetric light shafts, SSAO with a proper normal buffer, parallax/normal-mapped
surfaces and decals are all *possible* extensions; none of them are what's holding this back.

**The honest limiter is content, not technique.** Every mesh here is generated from primitives at
load. That ceiling is a stylised, well-lit toy city — not photorealism, which is a function of
authored assets (scanned materials, modelled geometry, baked lighting) far more than of shader
code.

**Performance.** I can report the cost structure precisely: ~36k static triangles for the whole
city in three buffers, a few hundred to ~2k instanced parts a frame, 6 draw calls for the main
pass, 4 for the shadow pass, 5-7 full-screen post passes. What I **cannot** honestly report is a
real frame rate: this was built and tested in a headless container whose "GPU" is SwiftShader, a
CPU rasteriser, which turns in ~2 fps at Ultra and ~7 fps at Low — a number that says nothing about
a real GPU. The pipeline is small enough that any discrete or recent integrated GPU should be
comfortable at 60, but I have not measured that and won't claim it. The auto-stepdown exists
because I couldn't verify it.

## World

A procedurally generated 2624×1984 city, regenerated from a seed each new game (the seed is
saved, so your city comes back with your save), drawn as extruded 3D geometry every frame:

- Grid of streets with lane markings, crosswalks and sidewalks, ~180 buildings in subdivided lots
  with banded windows that light up after dark, and doors facing the road
- A chase camera that raises itself over rooftops and tucks in when needed, verifying line of
  sight so the character is never hidden behind a building
- ~50 uniquely-named restaurants, apartments, houses, offices, five named landmarks, parks with
  trees and ponds you can shortcut through (slowly, unless you buy the tires)
- Traffic that follows lanes, turns at intersections, queues behind other cars and gives way to
  you — briefly
- Wandering pedestrians who scatter at the horn and go comically airborne if you're speeding
- Day/night lighting with headlights and streetlamp pools, rain (slower roads, +30% tips), and
  surge pricing events
- Auto-save to localStorage at the end of each day and on every purchase

## Physics

- **Vehicles use a traction ellipse.** You still point where you want to go, but acceleration
  *along* the direction of travel is limited by engine power and acceleration *across* it by grip.
  Demand more turn than the tyres have and the car washes wide and slides — `P.slide` drives a tyre
  chirp and the body's visible drift angle. Top speed is unchanged, so the economy is unchanged.
- **Weight transfer** drives body pitch under braking and roll into corners; wheels spin with
  travel and the front pair steers.
- **Collisions deflect.** The wall normal is probed from the solid grid, and velocity is reflected
  with restitution plus tangential friction, so a glancing hit scrapes you along the wall (with
  sparks, a scrape sound and a small yaw kick) instead of dead-stopping you. Car-to-car contact
  exchanges momentum by mass ratio rather than shoving one side.
- I first built a full steering/heading model — kinematic bicycle, throttle from facing angle,
  reverse and counter-steer. It felt right in isolation and was **wrong for this game**: braking
  and steering share one stick, so slowing down meant losing all steering authority, and the
  autopilot's delivery rate collapsed (wedged 28 times in 60s). That's in the git history; the
  traction ellipse is what shipped.

## Running the tests

Two headless Playwright suites. Both drive the real page — no mocks.

```bash
npm test          # 91 behaviour checks (~1 min)
npm run test:play # 24 live-play checks (~6 min)
npm run test:all
npm run test:shots  # smoke suite + screenshots into .shots/
```

`test/smoke.mjs` covers city generation, door reachability, camera-relative movement and wall
collision, the third-person camera (behind/above, presets, never clipping into or occluded by
geometry), getting in and out of the vehicle, the full accept→park→walk→deliver loop, capacity
limits, the confrontation and every outcome, the punch as an aimed action (misses when facing
away, misses out of reach, refused from the driver's seat, cooldown), police chase and bust, crew
hiring and passive income, every shop tab, the day cycle, bankruptcy, victory, save/load
round-tripping, and a random-input soak that asserts nothing goes NaN or leaks.

`test/playability.mjs` installs an **autopilot** that plays the game through the real physics,
collision and timers — following the same BFS route the player sees, pressing the same
camera-relative keys, parking up and walking the bag to each door, and deciding what to do when a
customer comes out swinging — on a fixed city seed. It asserts the loop is actually winnable on foot, that upgrading to a car and
then a loaded van measurably improves earnings, that stacked orders don't all expire, and that the
punch → wanted → cops → busted escalation really fires end to end.

### Measured balance (autopilot, fixed seed, per 60–75s sample)

| | deliveries | $/min |
| --- | --- | --- |
| on foot, starting kit | 5–6 | 99–177 |
| hatchback | 9–10 | 157–326 |
| cargo van, bags + GPS | 6–9 | 88–242 |
| five drivers, 2 districts | — | 199 → 726 passive |

The van is the noisy one, and honestly so: the autopilot re-parks at every single door instead of
clearing a neighbourhood on foot the way a human with twelve slots would, so it under-uses exactly
what the van is for. The suite asserts the van works and stays profitable rather than pretending a
cross-vehicle win is stable.

### Bugs the autopilot caught that a demo wouldn't

The live-play suite exists because these were all real, and none of them were visible from a
screenshot:

- **Order timers ignored the trip to the restaurant.** The limit was sized off the
  restaurant→customer distance only, so an order across town from you was mathematically
  impossible on foot.
- **Traffic collisions compounded into a dead stop.** Overlapping a car multiplied your velocity
  by 0.72 *every frame*, dropping you from 158 to 15 px/s.
- **Cars could shove you inside a building.** The separation push wrote position directly, skipping
  wall collision — once inside, every axis was blocked and the run was over. Now the push is
  wall-aware and there's a last-resort ejection guard.
- **Deadlock with oncoming traffic**: cars braked for you indefinitely while your own collision
  pushed back. Cars now get impatient and drive on.
- **The waypoint flip-flopped** between two roughly equidistant stops, so with a full bag you'd
  oscillate on the spot. The active stop is now sticky, with `Q` to cycle manually.
- **Forcing the waypoint onto the order you just picked up** blocked batching — the entire point
  of a big bag. Van throughput more than doubled once the nearest-stop rule was allowed to choose.
- **Pedestrians lost half their speed to phantom collisions.** Cars were tested as circles of
  radius 16, which bulged ~6px past each flank — a walker was in contact with traffic **40% of the
  time**, and a per-frame velocity damp compounded that into a crawl. Cars are now oriented boxes
  and contact sits at 2–8%; on-foot deliveries per minute doubled.
- **A wide vehicle could be shoved into the kerb and pinned.** Resolving the full overlap in one
  frame flung a van 18px sideways; the push is now capped and the car gives ground too.
- **Speed damping was per-frame rather than per-second**, so anything touching you for a second
  brought you to a near stop regardless of frame rate.
- **Offers were drawn uniformly across the whole map**, making every job a cross-town trek. Most
  are now biased toward the player, but a third are deliberately long hauls — on foot those are
  unwinnable and you watch them expire, which is what makes buying wheels feel earned. Without
  that mix, walking earned as much per minute as a $5,600 hatchback.
- **The route line ran down the centre of the road**, parking you permanently in oncoming traffic.
  It now hugs the right-hand lane, offset by an amount that leaves room for a van.
- **`BiquadFilterNode.Q` was assigned as a number** instead of an AudioParam, which threw and
  aborted game start outright.

Found during the third-person conversion:

- **The chase camera clipped inside buildings**, then — once it was taught to rise over them — hid
  the player *behind a rooftop*, which is worse. Raising alone can't guarantee visibility, so the
  camera now tests a ladder of distance/height candidates and picks the first with a clear line of
  sight to the player, falling back to pulling in. Verified over 50 worst-case positions (standing
  at a door facing into the wall): 0 clipped, 0 occluded, median distance unchanged.
- **Pedestrians rendered as black pillars**: their `hsl()` colours hit a shader that parses hex,
  producing `rgb(NaN,…)` and silently keeping the previous fill colour.
