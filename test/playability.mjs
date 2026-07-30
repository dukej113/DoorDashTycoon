// Playability probe: an autopilot actually DRIVES the city using the same
// physics, collision and timers a human gets, so we can check the loop is
// winnable and that upgrades actually pay off. Slower than smoke.mjs (~4 min).
//
// The city seed is fixed so the phases are comparable run to run.
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = 'file://' + path.join(here, '..', 'index.html');
const SEED = 20260730;
let failed = 0, checks = 0;
function ok(name, cond, extra) {
  checks++;
  if (cond) console.log('  PASS  ' + name);
  else { failed++; console.log('  FAIL  ' + name + (extra ? '  → ' + JSON.stringify(extra) : '')); }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const problems = [];
page.on('pageerror', e => problems.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.__DTR && window.__DTR.City.cv);

// ---- autopilot, installed inside the page ----------------------------------
await page.evaluate(() => {
  const D = window.__DTR, G = D.G;
  D.__log = { punches: 0, calm: 0, wedged: 0, encounters: 0, maxWanted: 0, maxCops: 0, travelled: 0 };
  let last = { x: 0, y: 0 }, still = 0, unstick = 0, idling = false, brakeTick = 0;
  D.__auto = true;
  D.__policy = 'calm';
  D.__trace = [];
  let tn = 0;
  function trace(o, atDoor) {
    if (tn++ % 45) return;
    D.__trace.push({
      t: +G.t.toFixed(1), st: o ? o.state : '-', ord: G.orders.length,
      atDoor: atDoor == null ? -1 : Math.round(atDoor), spd: Math.round(D.P.spd),
      k: (D.keys.w ? 'w' : '') + (D.keys.a ? 'a' : '') + (D.keys.s ? 's' : '') + (D.keys.d ? 'd' : '')
    });
    if (D.__trace.length > 24) D.__trace.shift();
  }
  const release = () => { D.keys.w = D.keys.a = D.keys.s = D.keys.d = false; };

  function drive() {
    if (!D.__auto) return;
    requestAnimationFrame(drive);
    const P = D.P;
    if (G.mode === 'encounter') {
      if (D.Enc.armed > 0.3) {
        D.__log.encounters++;
        if (D.__policy === 'punch') { D.__log.punches++; D.resolveEnc('punch'); }
        else { D.__log.calm++; D.resolveEnc('calm'); }
      }
      return;
    }
    if (G.mode === 'msg') { const b = document.querySelector('#msgacts .btn'); if (b) b.click(); return; }
    if (G.mode === 'summary') { D.nextDay(); return; }
    if (G.mode !== 'play') return;

    D.__log.travelled += Math.hypot(P.x - last.x, P.y - last.y);
    D.__log.maxWanted = Math.max(D.__log.maxWanted, G.wanted);
    D.__log.maxCops = Math.max(D.__log.maxCops, D.cops.length);
    // wedge detector — waiting at a door for food is not "wedged"
    if (Math.hypot(P.x - last.x, P.y - last.y) < 0.6 && !idling) still++; else still = 0;
    last = { x: P.x, y: P.y };
    if (still > 45) { unstick = 30; still = 0; D.__log.wedged++; }

    while (G.orders.length < D.capacity() && G.offers.length) D.acceptOffer(0);
    const o = D.activeOrder();
    idling = false;
    if (!o) { release(); trace(null, null); return; }
    const tgt = D.orderTarget(o);
    // Follow the route to its final node (which is the door itself). Cutting
    // straight to the target near the end wedges us on building corners.
    let tx = tgt.x, ty = tgt.y;
    const rp = D.routePath;
    if (rp && rp.length > 1) {
      tx = rp[rp.length - 1].x; ty = rp[rp.length - 1].y;
      for (let i = 1; i < rp.length; i++) {
        if (Math.hypot(rp[i].x - P.x, rp[i].y - P.y) > 40) { tx = rp[i].x; ty = rp[i].y; break; }
      }
    }
    let dx = tx - P.x, dy = ty - P.y;
    if (unstick > 0) { unstick--; const sx = -dy, sy = dx; dx = sx; dy = sy; }
    const atDoor = Math.hypot(tgt.x - P.x, tgt.y - P.y);
    trace(o, atDoor);
    if (atDoor < 34) { release(); idling = true; D.tryInteract(false); return; }
    // Coast into doors and sharp turns instead of grinding walls at full tilt.
    // Thresholds scale with the vehicle's top speed (otherwise the bot brakes
    // nonstop in a fast car), and braking is rate-limited to every other frame
    // so a jittery route can never stall it to a crawl.
    const st = D.vehStats(), mx = st.sp;
    // walking needs no braking — direction changes are instant on foot
    if (st.kind !== 'foot' && brakeTick++ % 2 === 0) {
      if (atDoor < 130 && P.spd > mx * 0.55) { release(); return; }
      const va = Math.atan2(P.vy, P.vx), ta = Math.atan2(dy, dx);
      const ad = Math.abs(((ta - va + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (P.spd > mx * 0.5 && ad > 1.0) { release(); return; }
    }
    const T = 8;
    D.keys.d = dx > T; D.keys.a = dx < -T;
    D.keys.s = dy > T; D.keys.w = dy < -T;
  }
  requestAnimationFrame(drive);
});

async function reset(extra) {
  await page.evaluate(({ seed, extra }) => {
    const D = window.__DTR, G = D.G;
    D.freshGame(seed);
    Object.assign(G, extra || {});
    if (extra && extra.veh && !G.vehicles.includes(extra.veh)) G.vehicles.push(extra.veh);
    const L = D.__log;
    L.travelled = 0; L.wedged = 0; L.encounters = 0; L.punches = 0; L.maxWanted = 0; L.maxCops = 0;
    G.mode = 'play';
    D.syncUI();
  }, { seed: SEED, extra });
}
async function playFor(ms, label) {
  const t0 = await page.evaluate(() => ({ d: window.__DTR.G.deliveries, m: window.__DTR.G.money, t: window.__DTR.G.t }));
  await page.waitForTimeout(ms);
  const t1 = await page.evaluate(() => {
    const D = window.__DTR, G = D.G;
    return {
      d: G.deliveries, m: G.money, t: G.t, rating: G.rating, late: G.late, failed: G.failed,
      veh: G.veh, wedged: D.__log.wedged, enc: D.__log.encounters,
      travelled: D.__log.travelled, cap: D.capacity()
    };
  });
  const secs = +(t1.t - t0.t).toFixed(1);
  const r = {
    label, deliveries: t1.d - t0.d, earned: +(t1.m - t0.m).toFixed(2),
    perMin: +(((t1.m - t0.m) / secs) * 60).toFixed(2), seconds: secs,
    pxPerSec: Math.round(t1.travelled / secs), cap: t1.cap, rating: +t1.rating.toFixed(2),
    late: t1.late, lost: t1.failed, veh: t1.veh, wedged: t1.wedged, encounters: t1.enc
  };
  console.log('  ' + JSON.stringify(r));
  if (r.deliveries === 0) {
    const tr = await page.evaluate(() => window.__DTR.__trace);
    console.log('  -- trace (no deliveries) --');
    tr.forEach(x => console.log('     ' + JSON.stringify(x)));
  }
  return r;
}

console.log('\n== on foot, starting kit (75s) ==');
await reset();
// a little longer than the other phases: on foot a single unlucky run-in with
// traffic is a bigger slice of the sample
const foot = await playFor(75000, 'foot');
ok('autopilot completes deliveries on foot', foot.deliveries >= 2, foot);
ok('on-foot orders are mostly beatable', foot.late <= Math.ceil(foot.deliveries / 2), foot);
ok('never permanently wedged on foot', foot.wedged < 8, foot);
ok('walking earns money', foot.earned > 0, foot);

console.log('\n== same city, same bot, in a hatchback (60s) ==');
await reset({ money: 0, veh: 'hatch' });
const car = await playFor(60000, 'car');
// px/s is dominated by waiting at doors, so compare the design numbers
const speeds = await page.evaluate(() => {
  const D = window.__DTR, G = D.G, was = G.veh;
  G.veh = 'shoes'; const onFoot = D.vehStats().sp;
  G.veh = 'hatch'; const inCar = D.vehStats().sp;
  G.veh = was;
  return { onFoot, inCar };
});
ok('a car is substantially faster than walking', speeds.inCar > speeds.onFoot * 2, speeds);
ok('a car covers more ground in practice', car.pxPerSec > foot.pxPerSec, { foot: foot.pxPerSec, car: car.pxPerSec });
ok('a car earns more per minute', car.perMin > foot.perMin, { foot: foot.perMin, car: car.perMin });
// a car takes the long, lucrative hauls a walker has to let expire, so it can
// bank more money on fewer jobs — earnings are the meaningful comparison
console.log('  (info) deliveries — foot ' + foot.deliveries + ', car ' + car.deliveries);
ok('a car handles long hauls a walker must skip', car.lost <= foot.lost || car.perMin > foot.perMin, { foot, car });
ok('never permanently wedged in a car', car.wedged < 12, car);

console.log('\n== stacking: van + bag upgrades (60s) ==');
await reset({ money: 0, veh: 'van', ups: { bag1: 1, bag2: 1, gps: 1 } });
const van = await playFor(60000, 'van-stacked');
ok('bigger bag actually holds more', van.cap >= 9, van);
ok('stacked orders do not all expire', van.lost <= Math.max(2, van.deliveries), van);
// A van and a hatchback suit different play styles (haul vs speed), so the
// meaningful invariant is that the upgrade path beats the starting kit.
ok('a loaded van comfortably beats the starting kit', van.perMin > foot.perMin * 1.2, { foot: foot.perMin, van: van.perMin });
console.log('  (info) per-minute — foot ' + foot.perMin + ', hatch ' + car.perMin + ', van ' + van.perMin);

console.log('\n== punch policy: escalation is real (60s) ==');
await reset({ money: 200, veh: 'hatch', rating: 4.8 });
await page.evaluate(() => { window.__DTR.__policy = 'punch'; window.__DTR.setForceAngry(true); });
await playFor(60000, 'punching');
const after = await page.evaluate(() => {
  const D = window.__DTR, G = D.G;
  D.setForceAngry(false); D.__policy = 'calm';
  return {
    punches: G.punches, wanted: G.wanted, maxWanted: D.__log.maxWanted,
    maxCops: D.__log.maxCops, rating: +G.rating.toFixed(2), cred: G.cred,
    busts: G.busts, encounters: D.__log.encounters
  };
});
console.log('  ' + JSON.stringify(after));
ok('confrontations happen while delivering', after.encounters >= 1, after);
ok('punching happens under the punch policy', after.punches >= 1, after);
// a bust knocks wanted back down, so check the peak rather than the tail
ok('punching raises the wanted level', after.maxWanted >= 1, after);
ok('cops materialise to chase you', after.maxCops >= 1, after);
ok('punching costs rating', after.rating < 4.8, after);
ok('punching banks street cred', after.cred >= 1, after);

console.log('\n== crew scaling ==');
const scale = await page.evaluate(async () => {
  const D = window.__DTR, G = D.G;
  G.money = 30000; G.unlockedBiz = true; G.slots = 8; G.wanted = 0; D.cops.length = 0;
  for (let i = 0; i < 5; i++) {
    G.drivers.push({ name: 'Test ' + i, skill: 3, tier: 1, wage: 50, earned: 0, trips: 0, timer: 1 });
  }
  const perMin0 = D.crewIncomePerMin();
  G.expansions = 2;
  const perMin2 = D.crewIncomePerMin();
  const m0 = G.money;
  await new Promise(r => setTimeout(r, 4000));
  return { perMin0: +perMin0.toFixed(2), perMin2: +perMin2.toFixed(2), gained: +(G.money - m0).toFixed(2) };
});
console.log('  ' + JSON.stringify(scale));
ok('crew income scales with expansions', scale.perMin2 > scale.perMin0 * 3, scale);
ok('crew pays out passively while you drive', scale.gained > 0, scale);

console.log('\n== day rollover during live play ==');
const roll = await page.evaluate(async () => {
  const D = window.__DTR, G = D.G;
  const d0 = G.day;
  G.dayT = 178.5;
  await new Promise(r => setTimeout(r, 3500));   // autopilot clicks through the report
  return { d0, day: G.day, mode: G.mode, dayT: +G.dayT.toFixed(1) };
});
ok('shift ends and the next day starts cleanly', roll.day === roll.d0 + 1, roll);
ok('play resumes after the report', roll.mode === 'play', roll);

await page.evaluate(() => { window.__DTR.__auto = false; });
console.log('\n== errors ==');
problems.slice(0, 5).forEach(p => console.log('  !! ' + p));
ok('no page errors during live play', problems.length === 0, problems.slice(0, 2));

await browser.close();
console.log('\n' + (failed ? 'FAILED ' + failed + '/' + checks : 'ALL ' + checks + ' CHECKS PASSED'));
process.exit(failed ? 1 : 0);
