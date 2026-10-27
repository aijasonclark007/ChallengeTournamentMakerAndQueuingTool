/* Speaker announcements for Match Control.
   Reads the text out loud (browser text-to-speech) and plays recordings through whatever speaker the laptop uses (e.g. Bluetooth).
   Everything is stored on this laptop only (localStorage + IndexedDB). Nothing is sent to Supabase.
   One ordered list of items (sponsors, messages, recordings), each with its own repeat time. Court calls are spoken on request and never overlap the timer. */
(function () {
  'use strict';
  var slug = '', S = null, timer = null, playing = false, calling = false, stopFlag = false, hold = 0, wake = null, curAudio = null, recState = null, callQ = [];
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var $ = function (s) { return document.querySelector(s); };
  var EVERY = [0, 10, 15, 20, 30, 40, 45, 60, 90, 120];       // 0 = follow the main "Repeat every" setting
  var DEF = {
    mins: 30, rate: 0.95, vol: 1, voice: '', on: false,
    useOpen: true, open: 'Attention everyone.',
    spons: [], sponsLead: 'This tournament is sponsored by',
    items: [                              // the announcement list, in the order it is spoken: {k:'spons'|'msg'|'rec', on, every, text | id}
      { k: 'spons', on: true, every: 0 },
      { k: 'msg', on: true, every: 0, text: 'Please check your match time and court on the web link. Be ready 10 minutes before your game.' },
      { k: 'msg', on: true, every: 0, text: 'Teams that are not at their court when called may be given a default after the grace time.' },
      { k: 'msg', on: true, every: 0, text: 'Please follow the umpire’s decisions. Respect to players, officials and volunteers.' }
    ],
    recs: [],                             // [{id,name}] the audio itself lives in IndexedDB
    callOn: true, callTwice: true, callVoice: '', callRate: 0, pron: [],      // callVoice '' = same as announcements; callRate 0 = same speed
               // pron: [{name, say}] how to say a player's name in court calls
     callText: 'Court {court}, {bracket}. {team1} versus {team2}. Please proceed to the court.'
  };
  function key() { return 'cmd_voice_' + slug; }
  function migrate(o) {                   // older versions kept things in separate places; fold them into the one list
    if (!o || typeof o !== 'object') return o;
    if (!Array.isArray(o.msgs) && !Array.isArray(o.items)) {
      var m = [], add = function (on, t) { t = String(t || '').trim(); if (t) m.push({ on: on, text: t }); };
      if (o.link !== undefined) add(o.useLink !== false, o.link + (o.linkSay ? ' ' + o.linkSay : ''));
      (Array.isArray(o.lines) ? o.lines : []).forEach(function (l) { if (l) add(o.useLines !== false && l.on !== false, l.text); });
      [o.custom].concat(Array.isArray(o.more) ? o.more : []).forEach(function (t) { add(!!o.useCustom, t); });
      if (m.length) o.msgs = m;
    }
    if (!Array.isArray(o.items) && (Array.isArray(o.msgs) || o.useSpons !== undefined || Array.isArray(o.recs))) {
      var it = [{ k: 'spons', on: o.useSpons !== false, every: 0 }];
      (Array.isArray(o.msgs) ? o.msgs : DEF.items.filter(function (x) { return x.k === 'msg'; })).forEach(function (x) { if (x) it.push({ k: 'msg', on: x.on !== false, every: 0, text: String(x.text || '') }); });
      (Array.isArray(o.recs) ? o.recs : []).forEach(function (r) { if (r && r.id) it.push({ k: 'rec', on: r.on !== false, every: 0, id: r.id }); });
      o.items = it;
    }
    if (Array.isArray(o.recs)) o.recs = o.recs.filter(function (r) { return r && r.id; }).map(function (r) { return { id: r.id, name: String(r.name || 'Recording') }; });
    delete o.msgs; delete o.useSpons;
    return o;
  }
  function load() { try { S = Object.assign({}, DEF, migrate(JSON.parse(localStorage.getItem(key()) || '{}'))); } catch (e) { S = Object.assign({}, DEF); } S.on = false; S.items.forEach(function (i) { i._due = null; }); }
  function save() { try { localStorage.setItem(key(), JSON.stringify(S, function (k, v) { return k === '_due' ? undefined : v; })); } catch (e) {} }

  // ----- recordings are kept in IndexedDB (they are too big for localStorage) -----
  function db() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('cmd_voice', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('rec'); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
  }
  function dbDo(mode, fn) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction('rec', mode), rq = fn(t.objectStore('rec')); t.oncomplete = function () { res(rq && rq.result); }; t.onerror = function () { rej(t.error); }; }); }); }
  var putRec = function (id, blob) { return dbDo('readwrite', function (s) { return s.put(blob, slug + ':' + id); }); };
  var getRec = function (id) { return dbDo('readonly', function (s) { return s.get(slug + ':' + id); }); };
  var delRec = function (id) { return dbDo('readwrite', function (s) { return s.delete(slug + ':' + id); }); };

  // ----- speaking -----
  function voices() { try { return speechSynthesis.getVoices() || []; } catch (e) { return []; } }
  function pickVoice(forCall) {                  // the saved choice, otherwise Brian (Multilingual) when this computer has it, otherwise any Natural English voice
    var vs = voices(), by = function (f) { return vs.filter(f)[0]; };
    return by(function (x) { return forCall && S.callVoice && x.name === S.callVoice; }) ||
      by(function (x) { return S.voice && x.name === S.voice; }) ||
      by(function (x) { return /brian/i.test(x.name) && /multilingual/i.test(x.name) && /^en/i.test(x.lang); }) ||
      by(function (x) { return /brian/i.test(x.name) && /natural/i.test(x.name) && /^en/i.test(x.lang); }) ||
      by(function (x) { return /natural/i.test(x.name) && /^en/i.test(x.lang); }) || null;
  }
  // Edge/Chrome text-to-speech can wedge after many plays (an utterance that never ends, a queue that stays paused, a cancel that swallows the next line).
  // So: keep a strong reference to the utterance, cancel anything left over and wait a moment before speaking, retry once if nothing starts, and never wait forever.
  var uttRef = null;
  function say(text, forCall) {
    return new Promise(function (res) {
      if (!text || !('speechSynthesis' in window)) { res(); return; }
      var ss = speechSynthesis, done = false, started = false, tries = 0, timers = [], v = pickVoice(forCall), u;
      var clear = function () { timers.forEach(clearTimeout); timers = []; };
      var fin = function () { if (done) return; done = true; clear(); if (uttRef === u) uttRef = null; res(); };
      var hardStop = function () { try { ss.cancel(); } catch (e) {} };
      var attempt = function () {
        if (done) return; tries++; started = false; clear();
        u = new SpeechSynthesisUtterance(text);
        if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
        u.rate = forCall && S.callRate ? S.callRate : S.rate; u.volume = S.vol;
        u.onstart = function () { started = true; };
        var mine = u; u.onend = u.onerror = function () { if (u === mine) fin(); };
        uttRef = u;                                                      // without this the browser can drop the utterance and its end event never comes
        try { ss.resume(); } catch (e) {}
        try { ss.speak(u); } catch (e) { fin(); return; }
        timers.push(setTimeout(function () {                             // nothing started: the engine is stuck. Reset it and try once more
          if (done || started) return; hardStop();
          if (tries < 2) setTimeout(attempt, 200); else fin();
        }, 3500));
        timers.push(setTimeout(function () { if (!done) { hardStop(); fin(); } }, 8000 + text.length * 140 / (u.rate || 1)));      // started but never ended
      };
      var busy = false; try { busy = ss.speaking || ss.pending || ss.paused; } catch (e) {}
      if (busy) { hardStop(); setTimeout(attempt, 150); } else attempt();
    });
  }
  function playBlob(blob) {
    return new Promise(function (res) {
      var url = URL.createObjectURL(blob), a = new Audio(url); curAudio = a; a.volume = S.vol;
      var done = function () { curAudio = null; URL.revokeObjectURL(url); res(); };
      a.onended = a.onerror = done; a.play().catch(done);
    });
  }
  var pause = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var sp = function (x) { return String(x.say || x.name || '').trim(); };
  function names(list) { var n = list.map(sp).filter(Boolean); return n.length < 2 ? n.join('') : n.length === 2 ? n[0] + ' and ' + n[1] : n.slice(0, -1).join(', ') + ', and ' + n[n.length - 1]; }
  function partsFor(items) {              // what gets said, in order: [{t:'say',text} | {t:'rec',id}]
    var p = [];
    if (S.useOpen && S.open.trim()) p.push({ t: 'say', text: S.open.trim() });
    items.forEach(function (it) {
      if (it.k === 'spons') { if (S.spons.some(sp)) p.push({ t: 'say', text: (S.sponsLead.trim() || 'This tournament is sponsored by') + ' ' + names(S.spons) + '.' }); }
      else if (it.k === 'msg') { if (String(it.text || '').trim()) p.push({ t: 'say', text: it.text.trim() }); }
      else if (it.k === 'rec') p.push({ t: 'rec', id: it.id });
    });
    return p;
  }
  function stopAll() { stopFlag = true; callQ.length = 0; try { speechSynthesis.cancel(); } catch (e) {} skipNow(); }
  function skipNow() { try { speechSynthesis.cancel(); } catch (e) {} if (curAudio) { try { curAudio.pause(); curAudio.dispatchEvent(new Event('ended')); } catch (e) {} } }
  var toast = function (t) { if (window.__cmdToast) window.__cmdToast(t); };

  // a round of announcements; a court call that arrives meanwhile is spoken between two parts, never on top of one
  async function run(ps) {
    if (playing) return; playing = true; stopFlag = false; paint();
    try {
      if (!ps.length) toast('Nothing is selected to announce.');
      for (var i = 0; i < ps.length && !stopFlag; i++) {
        await drain(); if (stopFlag) break;
        if (ps[i].t === 'say') await say(ps[i].text);
        else { var b = await getRec(ps[i].id); if (b) await playBlob(b); }
        if (!stopFlag) await pause(450);
      }
      await drain();
    } catch (e) { toast('Could not play: ' + (e && e.message || e)); }
    playing = false; hold = Date.now() + 1500; paint();
  }
  async function drain() {
    if (calling || !callQ.length) return;
    calling = true; paint();
    try { while (callQ.length && !stopFlag) { await say(callQ.shift(), true); if (callQ.length) await pause(900); } }
    catch (e) { callQ.length = 0; }
    calling = false; hold = Date.now() + 4000; paint();
  }
  var pronMap = function () { var m = {}; (S.pron || []).forEach(function (x) { if (x && x.name && x.say) m[String(x.name).trim().toLowerCase()] = String(x.say).trim(); }); return m; };
  function teamSay(n) { var m = pronMap(); return String(n || '').split('/').map(function (x) { return x.trim(); }).filter(Boolean).map(function (x) { return m[x.toLowerCase()] || x; }).join(' and '); }
  function callCourt(info) {              // from Match Control's Call to court button
    if (!S || !S.callOn || !info) return false;
    var team = teamSay;
    var t = String(S.callText || DEF.callText).replace(/\{court\}/gi, String(info.court || '').replace(/^court\s*/i, '')).replace(/\{bracket\}/gi, info.bracket || '').replace(/\{team1\}/gi, team(info.t1)).replace(/\{team2\}/gi, team(info.t2)).replace(/\s+/g, ' ').trim();
    if (!t) return false;
    stopFlag = false; callQ.push(t); if (S.callTwice) callQ.push(t);
    if (!playing) drain();
    return true;
  }

  // ----- the repeat timer (runs even when the panel is closed) -----
  var everyMs = function (it) { return (it.every || S.mins) * 60000; };
  var live = function (it) { return it.on && (it.k !== 'msg' || String(it.text || '').trim()) && (it.k !== 'spons' || S.spons.some(sp)); };
  function nextDue() { var d = Infinity; S.items.forEach(function (it) { if (live(it) && it._due != null && it._due < d) d = it._due; }); return d; }
  function tick() {
    if (!S || !S.on) return;
    var now = Date.now();
    S.items.forEach(function (it) { if (live(it) && it._due == null) it._due = now + everyMs(it); });
    if (!playing && !calling && !callQ.length && now >= hold) {
      var due = S.items.filter(function (it) { return live(it) && it._due != null && it._due <= now + 15000; });
      if (due.length && due.some(function (it) { return it._due <= now; })) {
        due.forEach(function (it) { it._due = now + everyMs(it); });
        run(partsFor(due));
      }
    }
    paintCount();
  }
  async function keepAwake(on) {
    try { if (on && navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); else if (wake) { await wake.release(); wake = null; } } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () { if (S && S.on && document.visibilityState === 'visible') keepAwake(true); });
  function start() {
    S.on = true; var now = Date.now(); S.items.forEach(function (it) { it._due = now + everyMs(it); });
    clearInterval(timer); timer = setInterval(tick, 1000); keepAwake(true);
    paint();
  }
  function stop() { S.on = false; clearInterval(timer); timer = null; keepAwake(false); stopAll(); paint(); }

  // ----- the panel -----
  var baseTitle = null;
  function badge() {                      // the Speaker button (and the browser tab title) show when announcements are running, even with the panel closed
    var b = document.querySelector('[data-p="voice"]'); if (!b || !S) return;
    if (baseTitle === null) baseTitle = document.title.replace(/^🔊\s*/, '');
    var busy = playing || calling, nd = nextDue(), s = nd === Infinity ? 0 : Math.max(0, Math.round((nd - Date.now()) / 1000)), on = !!S.on || busy;
    var t = busy ? 'Speaking' : S.on ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : '';
    var k = on + '|' + t; if (b._k === k) return; b._k = k;
    b.classList.toggle('vcon', on);
    b.innerHTML = on ? '<span class="vcdot' + (busy ? ' talk' : '') + '"></span>Speaker ' + (t ? '<span class="vct">' + t + '</span>' : '') : 'Speaker';
    b.setAttribute('aria-label', on ? 'Speaker announcements are on. ' + (busy ? 'Speaking now.' : 'Next in ' + t) : 'Speaker announcements, off');
    document.title = S.on ? '🔊 ' + baseTitle : baseTitle;
  }
  function paintCount() {
    badge();
    var e = $('#vcCount'); if (!e) return;
    if (playing) { e.textContent = 'Announcing now...'; return; }
    if (calling) { e.textContent = 'Calling a court...'; return; }
    if (!S.on) { e.textContent = 'Not running'; return; }
    var nd = nextDue(); if (nd === Infinity) { e.textContent = 'Nothing is ticked to announce.'; return; }
    var s = Math.max(0, Math.round((nd - Date.now()) / 1000)); e.textContent = 'Next announcement in ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  var itemLabel = function (it) {
    if (it.k === 'spons') return S.spons.some(sp) ? 'Sponsors: ' + names(S.spons) : 'Sponsors (add names above)';
    if (it.k === 'rec') { var r = S.recs.filter(function (x) { return x.id === it.id; })[0]; return 'Recording: ' + (r ? r.name : 'missing'); }
    return '';
  };
  function lists() {
    var sb = $('#vcSpons'); if (sb) sb.innerHTML = S.spons.map(function (x, i) {
      return '<div class="vcsp"><input data-n="' + i + '" value="' + esc(x.name) + '" placeholder="Name as written" aria-label="Sponsor name"><input data-s="' + i + '" value="' + esc(x.say || '') + '" placeholder="Say it like (optional)" aria-label="How to say it">' +
        '<button type="button" data-t="' + i + '" title="Hear it">Test</button><button type="button" data-d="' + i + '" class="x" title="Remove">&times;</button></div>';
    }).join('') || '<div class="meta">No sponsors yet. Tap Add sponsor.</div>';
    var pb = $('#vcPron'); if (pb) pb.innerHTML = (S.pron || []).map(function (x, i) {
      return '<div class="vcsp"><input data-pn="' + i + '" value="' + esc(x.name) + '" placeholder="Name as written" aria-label="Name"><input data-ps="' + i + '" value="' + esc(x.say || '') + '" placeholder="Say it like" aria-label="Say it like">' +
        '<button type="button" data-pt="' + i + '" title="Hear it">Test</button><button type="button" data-pd="' + i + '" class="x" title="Remove">&times;</button></div>';
    }).join('') || '<div class="meta">None yet.</div>';
    var ib = $('#vcItems'); if (ib) ib.innerHTML = S.items.map(function (it, i) {
      var main = it.k === 'msg' ? '<input data-it="' + i + '" value="' + esc(it.text) + '" maxlength="240" placeholder="Type a message" aria-label="Message">' : '<div class="vcl">' + esc(itemLabel(it)) + '</div>' + (it.k === 'rec' ? '<button type="button" data-ip="' + i + '">Play</button>' : '');
      return '<div class="vcit"><input type="checkbox" data-ic="' + i + '"' + (it.on ? ' checked' : '') + ' aria-label="Say this"><div class="vcmain">' + main + '</div><button type="button" data-ix="' + i + '" class="x" title="Remove">&times;</button>' +
        '<div class="vcsub"><select data-ie="' + i + '" aria-label="How often">' + EVERY.map(function (m) { return '<option value="' + m + '"' + ((it.every || 0) === m ? ' selected' : '') + '>' + (m ? 'Every ' + m + ' min' : 'Default (' + S.mins + ' min)') + '</option>'; }).join('') + '</select>' +
        '<button type="button" data-iu="' + i + '" title="Move up"' + (i ? '' : ' disabled') + '>&#9650;</button><button type="button" data-idn="' + i + '" title="Move down"' + (i < S.items.length - 1 ? '' : ' disabled') + '>&#9660;</button></div></div>';
    }).join('') || '<div class="meta">Nothing yet. Add a message or a recording.</div>';
  }
  function paint() {
    var b = $('#vcGo'); if (b) { b.textContent = S.on ? 'Stop announcements' : 'Start announcements'; b.className = S.on ? 'stop' : 'ok'; }
    var n = $('#vcNow'); if (n) n.textContent = 'Preview everything';
    var k = $('#vcSkip'); if (k) k.disabled = !(playing || calling);
    var st = $('#vcStop'); if (st) st.disabled = !(playing || calling);
    paintCount();
  }
  function html(link) {
    return '<div class="pn" id="vcBox"><h3>Speaker announcements</h3>' +
      '<div class="meta" style="margin-bottom:8px">Connect your laptop to the speaker in your computer settings, keep this page open, then press Start. Everything here is saved on this laptop only.</div>' +
      '<div class="vcrow"><button type="button" id="vcGo" class="ok">Start announcements</button><button type="button" id="vcNow">Preview everything</button></div>' +
      '<div class="vcrow vcrow2"><button type="button" id="vcSkip" disabled>Skip this one</button><button type="button" id="vcStop" disabled>Stop talking</button></div><div class="meta" id="vcCount" style="margin:6px 0 10px"></div>' +
      '<div class="vcrow"><label>Volume <span id="vcVolV">' + Math.round(S.vol * 100) + '%</span><input type="range" id="vcVol" min="0" max="100" step="5" value="' + Math.round(S.vol * 100) + '"></label></div>' +
      '<div class="vcrow"><label>Repeat every (default)<select id="vcMins">' + [10, 15, 20, 30, 40, 45, 60].map(function (m) { return '<option value="' + m + '"' + (S.mins === m ? ' selected' : '') + '>' + m + ' minutes</option>'; }).join('') + '</select></label>' +
      '<label>Voice<select id="vcVoice"></select></label><label>Speed<select id="vcRate">' + [[0.8, 'Slow'], [0.95, 'Normal'], [1.1, 'Fast']].map(function (r) { return '<option value="' + r[0] + '"' + (S.rate === r[0] ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('') + '</select></label></div>' +
      '<details class="vcnote"><summary>Keep the speaker from turning off</summary><ol>' +
        '<li>Give Match Control its <b>own Edge window</b>. Drag this tab out of the others and keep that window open behind your other windows. Do not minimize it.</li>' +
        '<li>Turn off <b>sleeping tabs</b> for this site. In Edge: Settings, System and performance, Sleeping tabs, then add this site under "Never put these sites to sleep".</li>' +
        '<li>Stop the laptop from <b>sleeping</b>. In Windows: Settings, System, Power, set sleep to Never while plugged in. Keep the charger connected.</li>' +
        '<li>Press <b>Start announcements</b> once, then check with a 10 minute timer: switch to another tab and make sure the announcement still plays.</li>' +
        '<li>Set the speaker and laptop volume before the first game, and keep the Bluetooth speaker charged and close to the laptop.</li></ol></details>' +
      '<h4>What to say</h4>' +
      '<label class="vcck"><input type="checkbox" id="vcUseOpen"' + (S.useOpen ? ' checked' : '') + '> Opening line (said at the start of every round)</label><input class="vcin" id="vcOpen" value="' + esc(S.open) + '" maxlength="160">' +
      '<label class="vcck" style="margin-top:14px">Sponsors</label><input class="vcin" id="vcLead" value="' + esc(S.sponsLead) + '" maxlength="100"><div id="vcSpons"></div><div class="btns"><button type="button" id="vcAdd">Add sponsor</button></div>' +
      '<div class="meta">In the second box, spell the name the way it should sound. For example: Jollibee, say it like "Jolly bee".</div>' +
      '<h4>Announcement list</h4><div class="meta">Spoken top to bottom. Tick what to include, choose how often each one plays, and use the arrows to change the order.</div><div id="vcItems"></div>' +
      '<div class="btns"><button type="button" id="vcAddMsg">Add a message</button><button type="button" id="vcUp">Upload audio</button><button type="button" id="vcRec">Record with microphone</button></div>' +
      '<input type="file" id="vcFile" accept="audio/*" hidden><div class="meta" id="vcRecMsg"></div>' +
      '<h4>Court calls</h4><label class="vcck"><input type="checkbox" id="vcCallOn"' + (S.callOn ? ' checked' : '') + '> Say it out loud when I press Call to court</label>' +
      '<input class="vcin" id="vcCallText" value="' + esc(S.callText) + '" maxlength="240"><div class="meta">Fills in {court}, {bracket}, {team1} and {team2} for that game. A court call never talks over the timer: it waits for the current line to finish.</div>' +
      '<div class="vcrow"><label>Court call voice<select id="vcCallVoice"></select></label><label>Court call speed<select id="vcCallRate">' + [[0, 'Same as announcements'], [0.8, 'Slow'], [0.95, 'Normal'], [1.1, 'Fast']].map(function (r) { return '<option value="' + r[0] + '"' + ((S.callRate || 0) === r[0] ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('') + '</select></label></div>' +
      '<h4>Name pronunciations</h4><div class="meta">Spell a name the way it should sound, for court calls. You can also add these from the Call to court button in Match Control.</div><div id="vcPron"></div><div class="btns"><button type="button" id="vcPronAdd">Add a name</button></div>' +
      '<label class="vcck"><input type="checkbox" id="vcCallTwice"' + (S.callTwice ? ' checked' : '') + '> Say it twice</label><div class="btns"><button type="button" id="vcCallTest">Test a court call</button></div>' +
      '<h4>Save or reuse these settings</h4><div class="meta" style="margin-bottom:6px">Saves the text settings (not the recordings) to a small file. Load it on any computer, or for your next tournament, to get the same sponsors and reminders back.</div>' +
      '<div class="btns"><button type="button" id="vcSave">Save settings to a file</button><button type="button" id="vcLoad">Load settings</button></div><input type="file" id="vcLoadFile" accept=".json,application/json" hidden><div class="meta" id="vcFileMsg"></div></div>';
  }
  var lastLink = '';
  var KEEP = ['mins', 'rate', 'vol', 'voice', 'useOpen', 'open', 'spons', 'sponsLead', 'items', 'callOn', 'callText', 'callTwice', 'callVoice', 'callRate', 'pron'];
  function bind(box, link) {
    lastLink = link;
    var v = $('#vcVoice'), fill = function () {
      var vs = voices().filter(function (x) { return /^en/i.test(x.lang); }); if (!vs.length) vs = voices();
      v.innerHTML = '<option value="">Auto (Brian)</option>' + vs.map(function (x) { return '<option value="' + esc(x.name) + '"' + (S.voice === x.name ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('');
      var cv = $('#vcCallVoice'); if (cv) cv.innerHTML = '<option value="">Same as announcements</option>' + vs.map(function (x) { return '<option value="' + esc(x.name) + '"' + (S.callVoice === x.name ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('');
    };
    fill(); try { speechSynthesis.onvoiceschanged = fill; } catch (e) {}
    lists(); paint();
    var set = function (id, k, bool) { $(id).onchange = $(id).oninput = function () { S[k] = bool ? this.checked : this.value; save(); if (k === 'sponsLead') return; }; };
    set('#vcUseOpen', 'useOpen', 1); set('#vcOpen', 'open'); set('#vcLead', 'sponsLead'); set('#vcCallOn', 'callOn', 1); set('#vcCallText', 'callText'); set('#vcCallTwice', 'callTwice', 1);
    $('#vcMins').onchange = function () { S.mins = +this.value; save(); var now = Date.now(); if (S.on) S.items.forEach(function (it) { if (!it.every) it._due = now + everyMs(it); }); lists(); paintCount(); };
    v.onchange = function () { S.voice = this.value; save(); };
    $('#vcCallVoice').onchange = function () { S.callVoice = this.value; save(); };
    $('#vcCallRate').onchange = function () { S.callRate = +this.value; save(); };
    $('#vcRate').onchange = function () { S.rate = +this.value; save(); };
    $('#vcVol').oninput = function () { S.vol = +this.value / 100; $('#vcVolV').textContent = this.value + '%'; if (curAudio) curAudio.volume = S.vol; save(); };
    $('#vcGo').onclick = function () { S.on ? stop() : start(); };
    $('#vcNow').onclick = function () { if (playing || calling) return; run(partsFor(S.items.filter(live))); };      // hear everything once; the timer is not touched
    $('#vcSkip').onclick = function () { skipNow(); };
    $('#vcStop').onclick = function () { stopAll(); };
    $('#vcCallTest').onclick = function () { var was = S.callOn; S.callOn = true; callCourt({ court: 'Court 7', bracket: 'Low Bracket A', t1: 'Beth Montero / Yojaa Timbancaya', t2: 'Marc Isagani / Kenn Papo' }); S.callOn = was; };
    $('#vcPronAdd').onclick = function () { S.pron.push({ name: '', say: '' }); save(); lists(); var i = $('#vcPron input[data-pn="' + (S.pron.length - 1) + '"]'); if (i) i.focus(); };
    $('#vcPron').oninput = function (e) { var t = e.target; if (t.dataset.pn != null) S.pron[+t.dataset.pn].name = t.value; if (t.dataset.ps != null) S.pron[+t.dataset.ps].say = t.value; save(); };
    $('#vcPron').onclick = function (e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.dataset.pt != null) { var x = S.pron[+t.dataset.pt]; say(x.say || x.name, true); }
      if (t.dataset.pd != null) { S.pron.splice(+t.dataset.pd, 1); save(); lists(); }
    };
    $('#vcAdd').onclick = function () { S.spons.push({ name: '', say: '' }); save(); lists(); var i = $('#vcSpons input[data-n="' + (S.spons.length - 1) + '"]'); if (i) i.focus(); };
    $('#vcSave').onclick = function () {
      var o = { app: 'matchday-speaker', version: 2, saved: new Date().toISOString() }; KEEP.forEach(function (k) { o[k] = S[k]; });
      o.items = S.items.filter(function (it) { return it.k !== 'rec'; }).map(function (it) { var c = {}; Object.keys(it).forEach(function (k) { if (k !== '_due') c[k] = it[k]; }); return c; });
      var a = document.createElement('a'), u = URL.createObjectURL(new Blob([JSON.stringify(o, null, 2)], { type: 'application/json' }));
      a.href = u; a.download = 'speaker-settings-' + new Date().toISOString().slice(0, 10) + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
      $('#vcFileMsg').textContent = 'Saved to your Downloads folder. Keep the file somewhere safe.';
    };
    $('#vcLoad').onclick = function () { $('#vcLoadFile').click(); };
    $('#vcLoadFile').onchange = function () {
      var f = this.files[0]; this.value = ''; if (!f) return;
      var rd = new FileReader(); rd.onload = function () {
        var o; try { o = JSON.parse(rd.result); } catch (e) { o = null; }
        if (!o || o.app !== 'matchday-speaker') { $('#vcFileMsg').textContent = 'That is not a speaker settings file.'; return; }
        migrate(o); var mine = S.items.filter(function (it) { return it.k === 'rec'; });
        KEEP.forEach(function (k) { if (o[k] !== undefined && typeof o[k] === typeof DEF[k] && Array.isArray(o[k]) === Array.isArray(DEF[k])) S[k] = o[k]; });
        S.spons = S.spons.filter(function (x) { return x && typeof x === 'object'; }).map(function (x) { return { name: String(x.name || ''), say: String(x.say || '') }; });
        S.items = S.items.filter(function (x) { return x && typeof x === 'object' && (x.k === 'msg' || x.k === 'spons'); }).map(function (x) { return { k: x.k, on: x.on !== false, every: EVERY.indexOf(+x.every) > -1 ? +x.every : 0, text: String(x.text || ''), _due: null }; }).concat(mine);
        S.pron = (S.pron || []).filter(function (x) { return x && typeof x === 'object'; }).map(function (x) { return { name: String(x.name || ''), say: String(x.say || '') }; });
        S.vol = Math.min(1, Math.max(0, +S.vol || 0)); S.on = S.on; save();
        var bx = $('#vcBox'); if (bx) { bx.outerHTML = html(lastLink); bind(null, lastLink); $('#vcFileMsg').textContent = 'Settings loaded.'; }
      }; rd.readAsText(f);
    };
    $('#vcAddMsg').onclick = function () { S.items.push({ k: 'msg', on: true, every: 0, text: '', _due: null }); save(); lists(); var i = $('#vcItems input[data-it="' + (S.items.length - 1) + '"]'); if (i) i.focus(); };
    var ib = $('#vcItems');
    ib.oninput = function (e) { var t = e.target; if (t.dataset.it != null) { S.items[+t.dataset.it].text = t.value; save(); } };
    ib.onchange = function (e) {
      var t = e.target, now = Date.now();
      if (t.dataset.ic != null) { var a = S.items[+t.dataset.ic]; a.on = t.checked; a._due = S.on && a.on ? now + everyMs(a) : null; save(); }
      if (t.dataset.ie != null) { var b = S.items[+t.dataset.ie]; b.every = +t.value; if (S.on && b.on) b._due = now + everyMs(b); save(); }
    };
    ib.onclick = async function (e) {
      var t = e.target.closest('button'); if (!t || t.disabled) return;
      var mv = function (i, d) { var x = S.items[i]; S.items[i] = S.items[i + d]; S.items[i + d] = x; save(); lists(); };
      if (t.dataset.iu != null) mv(+t.dataset.iu, -1);
      else if (t.dataset.idn != null) mv(+t.dataset.idn, 1);
      else if (t.dataset.ix != null) { var it = S.items.splice(+t.dataset.ix, 1)[0]; if (it && it.k === 'rec') { S.recs = S.recs.filter(function (r) { return r.id !== it.id; }); try { await delRec(it.id); } catch (er) {} } save(); lists(); paintCount(); }
      else if (t.dataset.ip != null) { var r = S.items[+t.dataset.ip]; var bl = await getRec(r.id); if (bl) { if (curAudio) skipNow(); playBlob(bl); } }
    };
    $('#vcSpons').oninput = function (e) { var t = e.target; if (t.dataset.n != null) S.spons[+t.dataset.n].name = t.value; if (t.dataset.s != null) S.spons[+t.dataset.s].say = t.value; save(); var l = $('#vcItems .vcl'); };
    $('#vcSpons').onchange = function () { lists(); };
    $('#vcSpons').onclick = function (e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.dataset.t != null) { var x = S.spons[+t.dataset.t]; say(sp(x)); }
      if (t.dataset.d != null) { S.spons.splice(+t.dataset.d, 1); save(); lists(); }
    };
    var addRec = async function (blob, name) {
      var id = 'r' + Date.now(); try { await putRec(id, blob); } catch (er) { $('#vcRecMsg').textContent = 'Could not save the recording on this browser.'; return; }
      S.recs.push({ id: id, name: name }); S.items.push({ k: 'rec', on: true, every: 0, id: id, _due: null }); save(); lists(); $('#vcRecMsg').textContent = 'Saved. It is in the list, ticked.';
    };
    $('#vcUp').onclick = function () { $('#vcFile').click(); };
    $('#vcFile').onchange = function () { var f = this.files[0]; this.value = ''; if (!f) return; if (f.size > 25 * 1024 * 1024) { $('#vcRecMsg').textContent = 'That file is over 25 MB.'; return; } addRec(f, f.name.replace(/\.[^.]+$/, '')); };
    $('#vcRec').onclick = async function () {
      var btn = this;
      if (recState) { recState.stop(); return; }
      try {
        var st = await navigator.mediaDevices.getUserMedia({ audio: true }), mr = new MediaRecorder(st), ch = [];
        mr.ondataavailable = function (e) { if (e.data.size) ch.push(e.data); };
        mr.onstop = function () { st.getTracks().forEach(function (t) { t.stop(); }); recState = null; btn.textContent = 'Record with microphone'; btn.className = ''; var n = S.recs.length + 1; addRec(new Blob(ch, { type: mr.mimeType || 'audio/webm' }), 'Recording ' + n); };
        mr.start(); recState = mr; btn.textContent = 'Stop recording'; btn.className = 'rec'; $('#vcRecMsg').textContent = 'Recording... speak now, then press Stop.';
      } catch (er) { $('#vcRecMsg').textContent = 'The microphone is blocked. Allow it for this site, or upload a file.'; }
    };
  }
  // the "How to say the names" sheet, opened from Call to court: one row per player, saved for every later match
  function pronSheet(info) {
    if (!S || !info) return;
    var seen = {}, names = [];
    [info.t1, info.t2].forEach(function (t) { String(t || '').split('/').forEach(function (x) { x = x.trim(); if (x && !seen[x.toLowerCase()]) { seen[x.toLowerCase()] = 1; names.push(x); } }); });
    if (!names.length) return;
    var m = pronMap(), old = document.getElementById('vcPronSh'); if (old) old.remove();
    var el = document.createElement('div'); el.className = 'sh'; el.id = 'vcPronSh';
    el.innerHTML = '<div><h2 style="margin:0 0 2px;font-size:19px">How to say the names</h2><p class="meta" style="margin:0 0 8px">Spell each name the way it should sound, then tap Play. It is saved and used for every later call. Leave a box empty to say the name as written.</p><div id="vcPronRows">' +
      names.map(function (n, i) { return '<div style="margin-top:8px"><b>' + esc(n) + '</b><div class="vcsp"><input data-i="' + i + '" value="' + esc(m[n.toLowerCase()] || '') + '" placeholder="Say it like, e.g. ' + esc(n) + '" aria-label="How to say ' + esc(n) + '"><button type="button" data-p="' + i + '">Play</button></div></div>'; }).join('') +
      '</div><div class="btns" style="margin-top:14px"><button class="go" id="vcPronGo">Save and call again</button><button id="vcPronSave">Save</button><button id="vcPronX">Cancel</button></div></div>';
    document.body.appendChild(el); requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('on'); }); });
    var close = function () { el.classList.remove('on'); setTimeout(function () { el.remove(); }, 400); };
    var val = function (i) { var x = el.querySelector('input[data-i="' + i + '"]'); return x ? x.value.trim() : ''; };
    var commit = function () {
      names.forEach(function (n, i) {
        var v = val(i), k = n.toLowerCase();
        S.pron = (S.pron || []).filter(function (x) { return String(x.name).trim().toLowerCase() !== k; });
        if (v && v.toLowerCase() !== k) S.pron.push({ name: n, say: v });
      }); save(); var l = $('#vcPron'); if (l) lists();
    };
    el.onclick = function (e) {
      if (e.target === el) { close(); return; }
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.p != null) { var i = +b.dataset.p; say(val(i) || names[i], true); }
      else if (b.id === 'vcPronX') close();
      else if (b.id === 'vcPronSave') { commit(); close(); toast('Saved. Names will be said this way.'); }
      else if (b.id === 'vcPronGo') { commit(); close(); var was = S.callOn; S.callOn = true; callCourt(info); S.callOn = was; }
    };
  }
  window.Announcer = {
    pron: function (info) { pronSheet(info); },
    init: function (s) { if (slug !== s) { slug = s; load(); } },
    html: function (link) { return html(link); },
    bind: function (link) { bind(null, link); },
    call: function (info) { return callCourt(info); }
  };
})();
