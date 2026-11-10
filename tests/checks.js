// Automatic checks: run with `npm test`. Needs Playwright (npm install, then npx playwright install chromium).
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
let fails = 0, passes = 0;
const ok = (c, name, extra) => { if (c) { passes++; console.log('  ok   ' + name); } else { fails++; console.log('  FAIL ' + name + (extra ? '  -> ' + extra : '')); } };

// 1. every page's scripts must at least parse
function syntax() {
  console.log('Script syntax');
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'chk-'));
  fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).forEach(f => {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8'); let bad = '';
    [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].forEach((m, i) => {
      if (m[1].trim().length < 50) return;
      const p = path.join(tmp, f + i + '.js'); fs.writeFileSync(p, m[1]);
      const r = cp.spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' }); if (r.status) bad += r.stderr.split('\n').slice(0, 4).join(' ');
    });
    ok(!bad, f, bad);
  });
}

const server = () => new Promise(res => { const s = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0].split('#')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': /\.html$/.test(f) ? 'text/html' : /\.js$/.test(f) ? 'application/javascript' : 'application/octet-stream' }); r.end(d); } }); }).listen(0, () => res(s)); });
async function page(b, base, url, platform) {
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } }), errs = []; p.errs = errs;
  p.on('pageerror', e => errs.push(e.message));
  await p.route('**/cdn.jsdelivr.net/**', r => r.fulfill({ body: '' })); await p.route('**/platform-config.js', r => r.fulfill({ body: '' }));
  if (platform) await p.route('**/platform.js', r => r.fulfill({ contentType: 'application/javascript', body: platform }));
  await p.goto(base + url); await p.waitForTimeout(900); return p;
}

async function schedule(b, base) {
  console.log('Draw & Schedule');
  const p = await page(b, base, '/schedule.html');
  await p.evaluate(() => document.querySelector('#pvTry').click()); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => !!(window.sched || (typeof sched !== 'undefined' && sched))), 'sample schedule builds');
  // knockout seeding: teams of one group can only meet in the final (4 groups, top 2)
  const ko = await p.evaluate(() => {
    const brackets = [], st = {}; for (let i = 0; i < 4; i++) { const name = 'P' + (i + 1), teams = [0, 1, 2, 3].map(k => ({ name: name + 't' + (k + 1), players: [] })); brackets.push({ id: 'b' + i, name, level: 'Mid', teams }); st['b' + i] = { rows: teams.map((t, k) => ({ team: t, won: 4 - k, lost: k, pf: 100 - k * 5 - i, pa: 50, pd: 50 - k * 5 - i, rank: k + 1, out: false })) }; }
    const k = buildKnockout(brackets, st, { levels: ['Mid'], advance: 2, advanceBy: { Mid: 2 } }), ms = k.matches;
    const leaf = r => r.team ? [r.team.name] : (m => leaf(m.slots[0]).concat(leaf(m.slots[1])))(ms.find(x => x.id === r.winnerOf)), fin = ms[ms.length - 1], L = leaf(fin.slots[0]).concat(leaf(fin.slots[1])), pool = n => n.slice(0, n.indexOf('t')); let worst = 0;
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) if (pool(L[i]) === pool(L[j])) worst = Math.max(worst, 3 - (32 - Math.clz32(i ^ j)));
    return { n: L.length, worst };
  });
  ok(ko.n === 8 && ko.worst === 0, 'knockout keeps same-group teams apart until the final', JSON.stringify(ko));
  // running late: shifting game times also moves the knockout
  const late = await p.evaluate(() => {
    sched.matches.forEach((m, i) => { results[m.id] = { a: 21, b: 10 + (i % 5), saved: true }; }); makeKnockout();
    const t = () => koSched.matches.slice(0, 3).map(m => slotLabel(m.slot).split(' - ')[0]).join(), a = t();
    document.querySelector('#lateFrom').value = '1'; document.querySelector('#lateMin').value = '15'; document.querySelector('#lateGo').click(); return { a, b: t() };
  });
  ok(late.a !== late.b, 'late shift moves knockout times', JSON.stringify(late));
  ok(await p.evaluate(() => { const d = historyData(); return Array.isArray(d.standings) && d.standings.length > 0; }), 'results can be turned into history data');
  // 200 players
  const big = await p.evaluate(() => {
    document.querySelector('#tmOpen').click(); document.querySelector('#oLevels').value = OPEN_PRESET.join(', '); document.querySelector('#oNg').value = 'novice';
    const cats = []; OPEN_PRESET.forEach(l => ["Men's", "Women's", "Mixed"].forEach(d => cats.push([l, d]))), L = [];
    for (let i = 0; i < 200; i++) { const c = cats[i % cats.length]; L.push('P' + (2 * i) + ' Smith, P' + (2 * i + 1) + ' Jones, ' + c[1] + ', ' + c[0]); }
    document.querySelector('#pairs').value = L.join('\n'); document.querySelector('#courts').value = 10; const t = performance.now(); startOpenDraw(); const r = draw.generate(); return { ms: performance.now() - t, games: r.matches.length, errs: parsePairs(document.querySelector('#pairs').value).errs.length };
  });
  ok(big.errs === 0 && big.games > 100 && big.ms < 3000, '200-pair Open draw builds quickly', JSON.stringify(big));
  ok(p.errs.length === 0, 'no page errors', p.errs.join(' | ')); await p.close();
}

const PLAT = ms => `window.Platform={configured:true,user:{id:'u'},whenReady:async()=>{},getLiveScores:async()=>[],umpireGet:async()=>({matches:${JSON.stringify(ms)},scores:[{id:'m3',s1:5,s2:3,status:'live'}],name:'T'}),getAnnouncement:async()=>null,getSponsors:async()=>[],liveChannel:()=>{},addLog(){},getPublicLive:async()=>[],getTvCode:async()=>null,umpireInfo:async()=>({}),listEventResults:async()=>[],playMatch:async(...a)=>{window.__pm=a}};`;
async function control(b, base) {
  console.log('Match Control');
  const M = [['m1', 'Court 1', 1, 'A / B', 'C / D'], ['m2', 'Court 1', 2, 'E / F', 'G / H'], ['m3', 'Court 2', 1, 'I / J', 'K / L'], ['m4', 'Court 2', 2, 'M / N', 'O / P']].map(x => ({ mid: x[0], court: x[1], slot: x[2], time: '9:00 AM - 9:20 AM', t1: x[3], t2: x[4], bracket: 'Low A', sport: 'badminton' }));
  const p = await page(b, base, '/control.html?s=abc&k=key', PLAT(M));
  ok(await p.locator('.court').count() === 2, 'both courts show');
  ok(await p.evaluate(() => document.querySelector('.court h2').className.includes('cn')), 'court names are coloured by status');
  await p.click('.court >> nth=0 >> summary'); await p.click('details.sec[data-sk="pl"] > summary');
  await p.selectOption('[data-pn="Court 1"]', 'm4'); await p.click('[data-doplay="Court 1"]'); await p.waitForTimeout(600);
  const pm = await p.evaluate(() => window.__pm);
  ok(pm && pm[2] === 'm4' && pm[3] === 'Court 1', 'Play a match here now sends the match to the chosen court', JSON.stringify(pm));
  ok(p.errs.filter(e => !/allowSignup/.test(e)).length === 0, 'no page errors', p.errs.join(' | ')); await p.close();
}
async function simple(b, base) {
  console.log('Other pages');
  for (const f of ['/checklist.html', '/history.html', '/index.html', '/queue.html', '/raffle.html']) {
    const p = await page(b, base, f, f === '/history.html' ? PLAT([]) : null); ok(p.errs.length === 0, f + ' opens without errors', p.errs.join(' | ')); await p.close();
  }
}

(async () => {
  syntax();
  const s = await server(), base = 'http://localhost:' + s.address().port, b = await chromium.launch();
  try { await schedule(b, base); await control(b, base); await simple(b, base); } catch (e) { fails++; console.log('  FAIL crashed: ' + e.message); }
  await b.close(); s.close();
  console.log('\n' + passes + ' passed, ' + fails + ' failed'); process.exit(fails ? 1 : 0);
})();
