# Dash to Riches

A complete, playable **delivery tycoon** game in a single HTML file. Canvas 2D, no assets, no
libraries, no build step — every pixel is drawn in code and every sound is synthesized with
WebAudio oscillators and noise buffers.

You start as a broke gig driver on foot with $12 and a bag. You end up running the city's
delivery empire. In between, some customers are going to say things to you, and you get to
decide how professional you feel about it.

**Play it:** open `index.html` in any modern browser. That's it. (Sound starts on your first
click, as browsers require.)

---

## The loop

1. **Take orders** from the offer list (click, or press `1`–`4`). Each shows the trip length,
   the payout and the time limit.
2. **Drive to the restaurant**, wait for the food if it isn't ready, then run it to the customer
   before the clock dies. A glowing route line shows the fastest way there, on the correct side
   of the road.
3. **Get paid.** Base fare plus a tip that shrinks as the timer drains. On-time drops raise your
   rating; late ones cost you.
4. **Reinvest** in wheels, gear, and eventually a crew of drivers who work the city on their own
   and pay you a cut — even while you drive.
5. **Repeat** until your net worth hits $1,000,000.

Days last three minutes. At the close of each shift you get a P&L: fares, tips, crew earnings,
fines, wages, overhead, and whether you actually made money. Miss payroll and drivers walk. Go
$400 under and the app deactivates you (that's the lose condition).

## Controls

| Key | Action |
| --- | --- |
| `WASD` / arrows | drive |
| `Shift` | boost / sprint (recharges) |
| `E` | pick up / drop off (also happens automatically if you slow down at the door) |
| `1`–`4` | accept an offer |
| `Q` | cycle to your next stop (matters once you're carrying a full bag) |
| `Tab` | business menu |
| `Space` | throw a punch — *only* during a confrontation |
| `A` / `R` | apologize / refund during a confrontation |
| `H` | horn (scatters pedestrians) |
| `P` / `Esc` | pause · `M` mute · `N` music |

Touch devices get a drag-anywhere virtual stick and a **DO IT** button.

## The punch mechanic

When you're late — or when the food arrives cold, wrong, or drinkless — the customer may meet you
at the door. A procedurally-drawn, visibly furious face yells a procedurally-chosen complaint, and
you have **nine seconds** to choose:

- **Apologize** — professional, tiny rating save, zero satisfaction.
- **Refund $5** — costs cash, buys back +0.08 rating.
- **PUNCH** — they drop their wallet (instant cash), you gain **street cred**, and you lose
  **0.45 rating**. If anyone sees it, your **wanted level** goes up.
- **Hesitate** — the timer runs out, the door slams, and you eat a 0.20 rating hit for nothing.

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

## World

A procedurally generated 2624×1984 city, regenerated from a seed each new game (the seed is
saved, so your city comes back with your save):

- Grid of streets with lane markings, crosswalks and sidewalks, ~180 buildings in subdivided lots
  with rooftop clutter and doors facing the road
- ~50 uniquely-named restaurants, apartments, houses, offices, five named landmarks, parks with
  trees and ponds you can shortcut through (slowly, unless you buy the tires)
- Traffic that follows lanes, turns at intersections, queues behind other cars and gives way to
  you — briefly
- Wandering pedestrians who scatter at the horn and go comically airborne if you're speeding
- Day/night lighting with headlights and streetlamp pools, rain (slower roads, +30% tips), and
  surge pricing events
- Auto-save to localStorage at the end of each day and on every purchase

## Running the tests

Two headless Playwright suites. Both drive the real page — no mocks.

```bash
npm test          # 65 behaviour checks (~40s)
npm run test:play # 23 live-play checks (~5 min)
npm run test:all
npm run test:shots  # smoke suite + screenshots into .shots/
```

`test/smoke.mjs` covers city generation, door reachability, movement and wall collision, the full
accept→pickup→deliver loop, capacity limits, the encounter and its outcomes, police chase and
bust, crew hiring and passive income, every shop tab, the day cycle, bankruptcy, victory,
save/load round-tripping, and a random-input soak that asserts nothing goes NaN or leaks.

`test/playability.mjs` installs an **autopilot** that plays the game through the real physics,
collision and timers — following the same BFS route the player sees, pressing the same keys — on a
fixed city seed. It asserts the loop is actually winnable on foot, that upgrading to a car and
then a loaded van measurably improves earnings, that stacked orders don't all expire, and that the
punch → wanted → cops → busted escalation really fires end to end.

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
- **Offers were drawn uniformly across the whole map**, making every job a cross-town trek. Pickups
  are now biased toward the player and drop-offs toward the restaurant.
- **The route line ran down the centre of the road**, parking you permanently in oncoming traffic.
  It now hugs the right-hand lane, offset by an amount that leaves room for a van.
- **`BiquadFilterNode.Q` was assigned as a number** instead of an AudioParam, which threw and
  aborted game start outright.
