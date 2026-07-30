// Headless smoke/behaviour test for Dash to Riches.
// Usage: node test/smoke.mjs [--shots]
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = 'file://' + path.join(here, '..', 'index.html');
const SHOTS = process.argv.includes('--shots');
const shotDir = process.env.SHOT_DIR || path.join(here, '..', '.shots');

const problems = [];
let checks = 0, failed = 0;
function ok(name, cond, extra) {
  checks++;
  if (cond) console.log('  PASS  ' + name);
  else { failed++; console.log('  FAIL  ' + name + (extra ? '  → ' + JSON.stringify(extra) : '')); }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
page.on('pageerror', e => problems.push('pageerror: ' + e.message + '\n' + (e.stack || '')));

await page.goto(url);
await page.waitForFunction(() => window.__DTR && window.__DTR.City.cv);
const shot = async n => { if (SHOTS) await page.screenshot({ path: path.join(shotDir, n + '.png') }); };

console.log('\n== city generation ==');
const city = await page.evaluate(() => {
  const C = window.__DTR.City;
  return {
    rests: C.rests.length, homes: C.homes.length, marks: C.marks.length,
    buildings: C.buildings.length, blocks: C.blocks.length,
    doorsSolid: C.buildings.filter(b => {
      const i = Math.floor(b.door.x / 16), j = Math.floor(b.door.y / 16);
      return C.solid[j * (C.solid.length / 124 | 0) + i];
    }).length,
    solidCount: C.solid.reduce((a, b) => a + b, 0)
  };
});
ok('restaurants generated', city.rests >= 16, city);
ok('homes generated', city.homes >= 40, city);
ok('landmarks generated', city.marks >= 1, city);
ok('buildings rasterized as solid', city.solidCount > 2000, city);
await shot('01-title');

console.log('\n== every door is reachable (not inside a wall) ==');
const doorCheck = await page.evaluate(() => {
  const D = window.__DTR;
  const bad = [];
  const all = D.City.buildings;
  for (const b of all) {
    if (!D.__boxFree) break;
  }
  return { total: all.length, bad };
});

const doors = await page.evaluate(() => {
  // re-implement using the exported City grid
  const C = window.__DTR.City;
  const SUB = 16, SGW = 41 * 64 / SUB;
  const solidAt = (x, y) => {
    const i = Math.floor(x / SUB), j = Math.floor(y / SUB);
    if (i < 0 || j < 0 || i >= SGW) return 1;
    return C.solid[j * SGW + i];
  };
  let bad = 0, blocked = [];
  for (const b of C.buildings) {
    if (solidAt(b.door.x, b.door.y)) { bad++; if (blocked.length < 5) blocked.push(b.name || b.type); }
  }
  return { bad, blocked, total: C.buildings.length };
});
ok('no door is inside a building', doors.bad === 0, doors);

console.log('\n== start game ==');
await page.click('#btnNew');
await page.waitForTimeout(300);
let st = await page.evaluate(() => ({ mode: window.__DTR.G.mode, offers: window.__DTR.G.offers.length, money: window.__DTR.G.money }));
ok('mode is play', st.mode === 'play', st);
ok('offers available at start', st.offers >= 3, st);

console.log('\n== movement + collision ==');
// clear traffic first: cars legitimately bump the player sideways, which would
// muddy a pure steering measurement
await page.evaluate(() => { window.__DTR.traffic.length = 0; window.__DTR.peds.length = 0; });
// spawn is on a road cell; find which axis is open and drive along it
const before = await page.evaluate(() => {
  const D = window.__DTR;
  const i = Math.floor(D.P.x / 64), j = Math.floor(D.P.y / 64);
  return { x: D.P.x, y: D.P.y, vertCorridor: i % 4 === 0 };
});
const goKey = before.vertCorridor ? 's' : 'd';
await page.keyboard.down(goKey);
await page.waitForTimeout(900);
await page.keyboard.up(goKey);
await page.waitForTimeout(120);
const after = await page.evaluate(() => ({ x: window.__DTR.P.x, y: window.__DTR.P.y, spd: window.__DTR.P.spd }));
const moved = before.vertCorridor ? after.y - before.y : after.x - before.x;
const drift = before.vertCorridor ? Math.abs(after.x - before.x) : Math.abs(after.y - before.y);
ok('player drives down the open corridor', moved > 80, { before, after, moved });
ok('player does not drift sideways', drift < 6, { before, after, drift });
ok('walls stop the player instead of trapping them', await page.evaluate(async () => {
  const D = window.__DTR;
  const i = Math.floor(D.P.x / 64), j = Math.floor(D.P.y / 64);
  const across = i % 4 === 0 ? 'd' : 's';
  D.keys[across] = true;
  await new Promise(r => setTimeout(r, 700));
  D.keys[across] = false;
  const si = Math.floor(D.P.x / 16), sj = Math.floor(D.P.y / 16);
  return !D.City.solid[sj * (41 * 64 / 16) + si];
}), 'ended up inside geometry');

const stuck = await page.evaluate(async () => {
  // drive into a wall for a second and make sure we never end up inside solid geometry
  const D = window.__DTR;
  // find a building and shove the player at it
  const b = D.City.buildings[10];
  D.tp(b.door.x, b.door.y);
  let insideCount = 0;
  const dirs = [['w'], ['s'], ['a'], ['d']];
  for (const dir of dirs) {
    D.keys.w = D.keys.a = D.keys.s = D.keys.d = false;
    D.keys[dir[0]] = true;
    await new Promise(r => setTimeout(r, 420));
    const i = Math.floor(D.P.x / 16), j = Math.floor(D.P.y / 16);
    if (D.City.solid[j * (41 * 64 / 16) + i]) insideCount++;
  }
  D.keys.w = D.keys.a = D.keys.s = D.keys.d = false;
  return insideCount;
});
ok('player never ends up inside a building', stuck === 0, { stuck });
await page.evaluate(() => { window.__DTR.buildTraffic(); window.__DTR.buildPeds(); });

console.log('\n== recovery from being shoved into geometry ==');
const eject = await page.evaluate(async () => {
  const D = window.__DTR;
  const b = D.City.buildings.find(x => x.w > 60 && x.h > 60);
  D.tp(b.x + b.w / 2, b.y + b.h / 2);      // dead centre of a building
  const inside0 = !!D.City.solid[Math.floor(D.P.y / 16) * (41 * 64 / 16) + Math.floor(D.P.x / 16)];
  await new Promise(r => setTimeout(r, 400));
  const i = Math.floor(D.P.x / 16), j = Math.floor(D.P.y / 16);
  return { inside0, insideAfter: !!D.City.solid[j * (41 * 64 / 16) + i] };
});
ok('player starts buried for the test', eject.inside0, eject);
ok('player is ejected back onto open ground', !eject.insideAfter, eject);

console.log('\n== full delivery loop ==');
const loop = await page.evaluate(async () => {
  const D = window.__DTR, G = D.G;
  const m0 = G.money;
  D.acceptOffer(0);
  const o = G.orders[0];
  if (!o) return { err: 'no order accepted' };
  const s1 = o.state;
  // teleport to restaurant and wait out prep
  D.tp(o.rest.door.x, o.rest.door.y);
  o.readyAt = G.t;
  D.tryInteract(false);
  const s2 = o.state;
  D.tp(o.cust.door.x, o.cust.door.y);
  // suppress the random encounter for this check
  const rnd = Math.random; Math.random = () => 0.99;
  D.tryInteract(false);
  Math.random = rnd;
  return { s1, s2, delivered: G.deliveries, money: G.money, m0, mode: G.mode, held: G.orders.length };
});
ok('order accepted → topickup', loop.s1 === 'topickup', loop);
ok('pickup switches to todrop', loop.s2 === 'todrop', loop);
ok('delivery completed', loop.delivered >= 1, loop);
ok('money increased', loop.money > loop.m0, loop);
ok('order removed from bag', loop.held === 0, loop);
await shot('02-play');

console.log('\n== capacity limit ==');
const cap = await page.evaluate(async () => {
  const D = window.__DTR, G = D.G;
  while (G.offers.length < 3) D.makeOffer(true);
  const c = D.capacity();
  let accepted = 0;
  for (let i = 0; i < 6; i++) { const n = G.orders.length; D.acceptOffer(0); if (G.orders.length > n) accepted++; if (G.offers.length === 0) D.makeOffer(true); }
  const held = G.orders.length;
  // clear
  G.orders.length = 0; D.P.bag = 0;
  return { c, held, accepted };
});
ok('cannot exceed bag capacity', cap.held <= cap.c, cap);

console.log('\n== encounter + punch consequences ==');
const enc = await page.evaluate(async () => {
  const D = window.__DTR, G = D.G;
  D.makeOffer(true);
  D.acceptOffer(0);
  const o = G.orders[0];
  o.readyAt = G.t;
  D.tp(o.rest.door.x, o.rest.door.y); D.tryInteract(false);
  const r0 = G.rating, m0 = G.money, w0 = G.wanted;
  D.startEncounter(o, true, null);
  const encMode = G.mode;
  const veil = document.getElementById('encveil').classList.contains('on');
  await new Promise(r => setTimeout(r, 350));
  D.Enc.armed = 1;
  D.resolveEnc('punch');
  return {
    encMode, veil, mode: G.mode, r0, r1: G.rating, m0, m1: G.money,
    w0, w1: G.wanted, cred: G.cred, punches: G.punches, cops: D.cops.length,
    veilAfter: document.getElementById('encveil').classList.contains('on')
  };
});
ok('encounter enters encounter mode', enc.encMode === 'encounter' && enc.veil, enc);
ok('punch lowers rating', enc.r1 < enc.r0 - 0.4, enc);
ok('punch pays out loot', enc.m1 > enc.m0, enc);
ok('punch raises wanted level', enc.w1 > enc.w0, enc);
ok('punch grants street cred', enc.cred >= 1, enc);
ok('cops spawn when wanted', enc.cops >= 1, enc);
ok('encounter closes and play resumes', enc.mode === 'play' && !enc.veilAfter, enc);
await shot('03-encounter-resolved');

console.log('\n== encounter walk-off (hesitation penalty) ==');
const walk = await page.evaluate(async () => {
  const D = window.__DTR, G = D.G;
  D.makeOffer(true); D.acceptOffer(0);
  const o = G.orders[0]; o.readyAt = G.t;
  D.tp(o.rest.door.x, o.rest.door.y); D.tryInteract(false);
  const r0 = G.rating;
  D.startEncounter(o, true, null);
  D.Enc.t = 8.85;               // just before the deadline
  await new Promise(r => setTimeout(r, 700));
  return { r0, r1: G.rating, mode: G.mode, veil: document.getElementById('encveil').classList.contains('on') };
});
ok('hesitating costs rating', walk.r1 < walk.r0 - 0.15, walk);
ok('walk-off returns to play', walk.mode === 'play' && !walk.veil, walk);

console.log('\n== on-time streak bonus ==');
const streak = await page.evaluate(() => {
  const D = window.__DTR, G = D.G;
  G.streak = 0;
  const b0 = D.__streakBonus ? D.__streakBonus() : null;
  const deliver = () => {
    D.makeOffer(true); D.acceptOffer(0);
    const o = G.orders[0]; o.readyAt = G.t;
    D.tp(o.rest.door.x, o.rest.door.y); D.tryInteract(false);
    D.tp(o.cust.door.x, o.cust.door.y);
    const rnd = Math.random; Math.random = () => 0.99;
    D.tryInteract(false);
    Math.random = rnd;
  };
  for (let i = 0; i < 4; i++) deliver();
  const s4 = G.streak;
  const chip = !!document.getElementById('chip_streak');
  // now blow it with a late drop
  D.makeOffer(true); D.acceptOffer(0);
  const o = G.orders[0]; o.readyAt = G.t;
  D.tp(o.rest.door.x, o.rest.door.y); D.tryInteract(false);
  o.deadline = G.t - 5;
  D.tp(o.cust.door.x, o.cust.door.y);
  const rnd = Math.random; Math.random = () => 0.99;
  D.tryInteract(false);
  Math.random = rnd;
  return { s4, chip, after: G.streak, chipAfter: !!document.getElementById('chip_streak') };
});
ok('streak counts consecutive on-time drops', streak.s4 === 4, streak);
ok('streak shows a HUD chip at x3+', streak.chip, streak);
ok('a late drop wipes the streak', streak.after === 0 && !streak.chipAfter, streak);

console.log('\n== restaurant names are unique ==');
const names = await page.evaluate(() => {
  const n = window.__DTR.City.rests.map(r => r.name);
  const dupes = n.filter((v, i) => n.indexOf(v) !== i);
  return { count: n.length, dupes: dupes.slice(0, 5), dupeCount: dupes.length };
});
ok('no duplicate restaurant names in the city', names.dupeCount === 0, names);

console.log('\n== police chase + bust ==');
const chase = await page.evaluate(async () => {
  const D = window.__DTR, G = D.G;
  G.wanted = 2; D.spawnCops();
  const c = D.cops[0];
  const d0 = c ? Math.hypot(c.x - D.P.x, c.y - D.P.y) : -1;
  // put a cop right next to us and hold still: should get busted
  D.cops.forEach(k => { k.x = D.P.x + 20; k.y = D.P.y + 8; });
  const m0 = G.money, b0 = G.busts;
  await new Promise(r => setTimeout(r, 1600));
  return { d0, busts: G.busts, b0, money: G.money, m0, wanted: G.wanted, mode: G.mode };
});
ok('standing next to a cop gets you busted', chase.busts > chase.b0, chase);
ok('bust costs money', chase.money < chase.m0, chase);
await page.evaluate(() => window.__DTR.G.mode === 'msg' && document.querySelector('#msgacts .btn').click());
await shot('04-busted');

console.log('\n== crew / passive income ==');
const crew = await page.evaluate(async () => {
  const D = window.__DTR, G = D.G;
  G.money = 5000; G.unlockedBiz = true;
  D.openShop('crew');
  const cards = document.querySelectorAll('#shopbody .card').length;
  // hire the first applicant
  const btns = [...document.querySelectorAll('#shopbody .card .btn')].filter(b => b.textContent === 'HIRE');
  const hireBtnCount = btns.length;
  if (btns[0]) btns[0].click();
  const hired = G.drivers.length;
  const m0 = G.money;
  const perMin = D.crewIncomePerMin();
  // fast-forward driver timers
  G.drivers.forEach(d => d.timer = 0.05);
  await new Promise(r => setTimeout(r, 600));
  D.closeShop();
  return { cards, hireBtnCount, hired, m0, m1: G.money, perMin, crewCars: window.__DTR.G.drivers.length };
});
ok('crew tab lists applicants', crew.hireBtnCount >= 3, crew);
ok('hiring adds a driver', crew.hired >= 1, crew);
ok('driver generates passive income', crew.m1 > crew.m0, crew);
ok('crew income rate reported', crew.perMin > 0, crew);

console.log('\n== shop purchases ==');
const shop = await page.evaluate(() => {
  const D = window.__DTR, G = D.G;
  G.money = 100000;
  const capBefore = D.capacity();
  D.openShop('gear');
  const bagBtn = [...document.querySelectorAll('#shopbody .card')].find(c => c.textContent.includes('Insulated Bag'));
  bagBtn.querySelector('.btn').click();
  const capAfter = D.capacity();
  D.openShop('wheels');
  const veh = [...document.querySelectorAll('#shopbody .card')].find(c => c.textContent.includes('Rusty BMX'));
  veh.querySelector('.btn').click();
  const sp0 = D.vehStats().sp;
  D.openShop('empire');
  const exp = [...document.querySelectorAll('#shopbody .card')].find(c => c.textContent.includes('Expand to New District'));
  const mult0 = D.crewIncomePerMin();
  exp.querySelector('.btn').click();
  const mult1 = D.crewIncomePerMin();
  D.openShop('shady');
  D.openShop('stats');
  const statRows = document.querySelectorAll('#shopbody table tr').length;
  D.closeShop();
  return { capBefore, capAfter, veh: G.veh, sp0, mult0, mult1, statRows, expansions: G.expansions };
});
ok('bag upgrade increases capacity', shop.capAfter > shop.capBefore, shop);
ok('vehicle purchase equips it', shop.veh === 'bmx', shop);
ok('bike is faster than walking', shop.sp0 > 200, shop);
ok('district expansion multiplies crew income', shop.mult1 > shop.mult0 * 1.5, shop);
ok('stats tab renders', shop.statRows > 10, shop);
await page.evaluate(() => window.__DTR.openShop('crew'));
await shot('05-shop-crew');
await page.evaluate(() => window.__DTR.closeShop());

console.log('\n== target cycling (Q) ==');
const cyc = await page.evaluate(() => {
  const D = window.__DTR, G = D.G;
  G.orders.length = 0; G.activeId = null;
  G.money = 100000; G.veh = 'van'; if (!G.vehicles.includes('van')) G.vehicles.push('van');
  for (let i = 0; i < 3; i++) { D.makeOffer(true); D.acceptOffer(0); }
  const held = G.orders.length;
  const first = D.activeOrder().id;
  D.cycleTarget ? D.cycleTarget() : null;
  return { held, first, after: G.activeId, ids: G.orders.map(o => o.id) };
});
ok('multiple orders can be held in a van', cyc.held >= 3, cyc);
ok('Q moves the waypoint to another stop', cyc.after !== cyc.first && cyc.ids.includes(cyc.after), cyc);

console.log('\n== vehicle unlock gating ==');
const gate = await page.evaluate(() => {
  const D = window.__DTR, G = D.G;
  G.money = 500000; G.deliveries = 0; G.vehicles = ['shoes']; G.veh = 'shoes';
  D.openShop('wheels');
  const locked = [...document.querySelectorAll('#shopbody .card .btn')].filter(b => /NEEDS/.test(b.textContent)).length;
  G.deliveries = 200;
  D.openShop('wheels');
  const unlocked = [...document.querySelectorAll('#shopbody .card .btn')].filter(b => /NEEDS/.test(b.textContent)).length;
  D.closeShop();
  return { locked, unlocked };
});
ok('late-game vehicles start locked behind deliveries', gate.locked >= 3, gate);
ok('they unlock as deliveries pile up', gate.unlocked === 0, gate);

console.log('\n== victory at $1M net worth ==');
const win = await page.evaluate(() => {
  const D = window.__DTR, G = D.G;
  G.victory = false;
  D.give(1000000);
  const shown = document.getElementById('msgveil').classList.contains('on');
  const title = document.getElementById('msgtitle').textContent;
  const btn = document.querySelector('#msgacts .btn');
  if (btn) btn.click();
  return { shown, title, victory: G.victory, mode: G.mode, worth: Math.round(D.netWorth()) };
});
ok('hitting $1M triggers the victory screen', win.shown && /RICHES/.test(win.title), win);
ok('victory does not end the run', win.victory && win.mode === 'play', win);

console.log('\n== day cycle ==');
const day = await page.evaluate(async () => {
  const D = window.__DTR, G = D.G;
  const d0 = G.day;
  G.money = 3000;
  D.endDay();
  const sumOn = document.getElementById('sumveil').classList.contains('on');
  const rows = document.querySelectorAll('#sumtbl tr').length;
  const mode = G.mode;
  D.nextDay();
  return { d0, day: G.day, sumOn, rows, mode, mode2: G.mode, dayT: G.dayT, offers: G.offers.length };
});
ok('end of day shows a report', day.sumOn && day.rows > 8, day);
ok('summary pauses the sim', day.mode === 'summary', day);
ok('next day advances the counter', day.day === day.d0 + 1, day);
ok('next day resets the clock', day.dayT < 1 && day.offers >= 3, day);

console.log('\n== bankruptcy path ==');
const bank = await page.evaluate(async () => {
  const D = window.__DTR, G = D.G;
  G.money = -1200;
  D.endDay();
  const txt = document.getElementById('sumnotes').textContent;
  const btn = document.getElementById('btnNextDay').textContent;
  D.nextDay();  // should hard-reset
  return { txt, btn, money: G.money, day: G.day, mode: G.mode };
});
ok('bankruptcy is detected', /BANKRUPT/.test(bank.txt), bank);
ok('bankruptcy restarts the run', bank.day === 1 && bank.money > 0, bank);

console.log('\n== save / load ==');
const sv = await page.evaluate(() => {
  const D = window.__DTR, G = D.G;
  G.money = 4242; G.day = 7; G.punches = 3; G.veh = 'shoes';
  D.save();
  const raw = D.loadSave();
  G.money = 0;
  D.startFromTitle(true);
  return { raw: !!raw, money: G.money, day: G.day, punches: G.punches, seed: raw && raw.seed === D.City.seed };
});
ok('save round-trips', sv.raw && sv.money === 4242 && sv.day === 7, sv);
ok('same city seed restored', sv.seed, sv);

console.log('\n== long soak with random input ==');
await page.evaluate(() => { window.__DTR.freshGame(); window.__DTR.G.mode = 'play'; });
const soakStart = await page.evaluate(() => ({ f: window.__DTR.G.frame }));
const seq = ['w', 'a', 's', 'd'];
for (let i = 0; i < 16; i++) {
  const k = seq[i % 4];
  await page.keyboard.down(k);
  await page.waitForTimeout(180);
  await page.keyboard.up(k);
  if (i % 5 === 0) await page.keyboard.press('e');
  if (i === 8) await page.evaluate(() => window.__DTR.acceptOffer(0));
}
await page.waitForTimeout(500);
const soak = await page.evaluate(() => {
  const D = window.__DTR, G = D.G;
  return {
    frames: G.frame, mode: G.mode, nanX: !isFinite(D.P.x), nanY: !isFinite(D.P.y),
    fx: D.fx.length, traffic: D.traffic.length,
    trafficStuck: D.traffic.filter(c => !isFinite(c.x) || !isFinite(c.y)).length
  };
});
ok('sim ran many frames', soak.frames - soakStart.f > 60, soak);
ok('player position stays finite', !soak.nanX && !soak.nanY, soak);
ok('traffic positions stay finite', soak.trafficStuck === 0, soak);
ok('fx list does not leak', soak.fx < 400, soak);

console.log('\n== 25x fast-forward simulation (economy sanity) ==');
const econ = await page.evaluate(async () => {
  const D = window.__DTR, G = D.G;
  D.freshGame(); G.mode = 'play';
  let delivered = 0, guard = 0;
  // simulate a "perfect player" doing back-to-back deliveries by teleporting
  while (delivered < 40 && guard++ < 400) {
    if (!G.orders.length) {
      if (!G.offers.length) D.makeOffer(true);
      D.acceptOffer(0);
      continue;
    }
    const o = G.orders[0];
    if (o.state === 'topickup') { D.tp(o.rest.door.x, o.rest.door.y); o.readyAt = G.t; D.tryInteract(false); }
    else {
      D.tp(o.cust.door.x, o.cust.door.y);
      const rnd = Math.random; Math.random = () => 0.99;
      D.tryInteract(false);
      Math.random = rnd;
      delivered++;
    }
    G.t += 8; // pretend travel time
  }
  return { delivered, money: G.money, rating: G.rating, avg: (G.money - 12) / Math.max(1, delivered), worth: D.netWorth() };
});
ok('40 deliveries complete without error', econ.delivered >= 40, econ);
ok('average payout is in a sane range', econ.avg > 3 && econ.avg < 60, econ);
ok('rating climbs with on-time drops', econ.rating > 4.6, econ);

console.log('\n== errors ==');
if (problems.length) { problems.forEach(p => console.log('  !! ' + p)); }
ok('no console/page errors', problems.length === 0, problems.slice(0, 3));

await browser.close();
console.log('\n' + (failed ? 'FAILED ' + failed + '/' + checks : 'ALL ' + checks + ' CHECKS PASSED'));
process.exit(failed ? 1 : 0);
