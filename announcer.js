/* Speaker announcements for Match Control.
   Reads the text out loud (browser text-to-speech) and plays recordings through whatever speaker the laptop uses (e.g. Bluetooth).
   Everything is stored on this laptop only (localStorage + IndexedDB). Nothing is sent to Supabase. */
(function () {
  'use strict';
  var slug = '', S = null, timer = null, nextAt = 0, playing = false, stopFlag = false, wake = null, curAudio = null, recState = null;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var $ = function (s) { return document.querySelector(s); };
  var DEF = {
    mins: 30, rate: 0.95, voice: '', on: false,
    useOpen: true, open: 'Attention everyone.',
    useSpons: true, spons: [], sponsLead: 'This tournament is sponsored by',
    useLink: true, link: 'Always check your schedule on the schedule web link.', linkSay: '',
    useLines: true,
    lines: [
      { on: true, text: 'Please check your match time and court on the web link. Be ready 10 minutes before your game.' },
      { on: true, text: 'Teams that are not at their court when called may be given a default after the grace time.' },
      { on: true, text: 'Please follow the umpire\u2019s decisions. Respect to players, officials and volunteers.' }
    ],
    useCustom: false, custom: '', more: [],
    recs: []                              // [{id,name,on}] the audio itself lives in IndexedDB
  };
  function key() { return 'cmd_voice_' + slug; }
  function load() { try { S = Object.assign({}, DEF, JSON.parse(localStorage.getItem(key()) || '{}')); } catch (e) { S = Object.assign({}, DEF); } S.on = false; }
  function save() { try { localStorage.setItem(key(), JSON.stringify(S)); } catch (e) {} }

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
  function pickVoice() {                  // the saved choice, otherwise Brian (Multilingual) when this computer has it, otherwise any Natural English voice
    var vs = voices(), by = function (f) { return vs.filter(f)[0]; };
    return by(function (x) { return S.voice && x.name === S.voice; }) ||
      by(function (x) { return /brian/i.test(x.name) && /multilingual/i.test(x.name) && /^en/i.test(x.lang); }) ||
      by(function (x) { return /brian/i.test(x.name) && /natural/i.test(x.name) && /^en/i.test(x.lang); }) ||
      by(function (x) { return /natural/i.test(x.name) && /^en/i.test(x.lang); }) || null;
  }
  function say(text) {
    return new Promise(function (res) {
      if (!text || !('speechSynthesis' in window)) { res(); return; }
      var u = new SpeechSynthesisUtterance(text), v = pickVoice();
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
      u.rate = S.rate; u.onend = u.onerror = function () { res(); };
      speechSynthesis.speak(u);
    });
  }
  function playBlob(blob) {
    return new Promise(function (res) {
      var url = URL.createObjectURL(blob), a = new Audio(url); curAudio = a;
      var done = function () { curAudio = null; URL.revokeObjectURL(url); res(); };
      a.onended = a.onerror = done; a.play().catch(done);
    });
  }
  var sp = function (x) { return String(x.say || x.name || '').trim(); };
  function names(list) { var n = list.map(sp).filter(Boolean); return n.length < 2 ? n.join('') : n.length === 2 ? n[0] + ' and ' + n[1] : n.slice(0, -1).join(', ') + ', and ' + n[n.length - 1]; }
  function parts() {                      // the things that get said, in order: [{t:'say',text} | {t:'rec',id}]
    var p = [];
    if (S.useOpen && S.open.trim()) p.push({ t: 'say', text: S.open.trim() });
    if (S.useSpons && S.spons.length) p.push({ t: 'say', text: (S.sponsLead.trim() || 'This tournament is sponsored by') + ' ' + names(S.spons) + '.' });
    if (S.useLink && S.link.trim()) p.push({ t: 'say', text: S.link.trim() + (S.linkSay.trim() ? ' ' + S.linkSay.trim() : '') });
    if (S.useLines) S.lines.forEach(function (l) { if (l.on && l.text.trim()) p.push({ t: 'say', text: l.text.trim() }); });
    if (S.useCustom) [S.custom].concat(S.more).forEach(function (t) { if (String(t || '').trim()) p.push({ t: 'say', text: String(t).trim() }); });
    S.recs.forEach(function (r) { if (r.on) p.push({ t: 'rec', id: r.id }); });
    return p;
  }
  async function playAll() {
    if (playing) return; playing = true; stopFlag = false; paint();
    try {
      try { speechSynthesis.cancel(); } catch (e) {}
      var ps = parts();
      if (!ps.length) toast('Nothing is selected to announce.');
      for (var i = 0; i < ps.length && !stopFlag; i++) {
        if (ps[i].t === 'say') { await say(ps[i].text); }
        else { var b = await getRec(ps[i].id); if (b) await playBlob(b); }
        if (!stopFlag) await new Promise(function (r) { setTimeout(r, 450); });
      }
    } catch (e) { toast('Could not play: ' + (e && e.message || e)); }
    playing = false; paint();
  }
  function stopAll() { stopFlag = true; try { speechSynthesis.cancel(); } catch (e) {} if (curAudio) { try { curAudio.pause(); curAudio.dispatchEvent(new Event('ended')); } catch (e) {} } }
  var toast = function (t) { if (window.__cmdToast) window.__cmdToast(t); };

  // ----- the repeat timer (runs even when the panel is closed) -----
  function tick() {
    if (!S || !S.on) return;
    if (Date.now() >= nextAt) { nextAt = Date.now() + S.mins * 60000; playAll(); }
    paintCount();
  }
  async function keepAwake(on) {
    try { if (on && navigator.wakeLock) wake = await navigator.wakeLock.request('screen'); else if (wake) { await wake.release(); wake = null; } } catch (e) {}
  }
  document.addEventListener('visibilitychange', function () { if (S && S.on && document.visibilityState === 'visible') keepAwake(true); });
  function start() {
    S.on = true; nextAt = Date.now() + S.mins * 60000; clearInterval(timer); timer = setInterval(tick, 1000); keepAwake(true);
    try { speechSynthesis.cancel(); } catch (e) {}                        // a click unlocks sound in the browser
    paint();
  }
  function stop() { S.on = false; clearInterval(timer); timer = null; keepAwake(false); stopAll(); paint(); }

  // ----- the panel -----
  function paintCount() {
    var e = $('#vcCount'); if (!e) return;
    if (!S.on) { e.textContent = 'Not running'; return; }
    if (playing) { e.textContent = 'Announcing now...'; return; }
    var s = Math.max(0, Math.round((nextAt - Date.now()) / 1000)); e.textContent = 'Next announcement in ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function lists() {
    var sb = $('#vcSpons'); if (sb) sb.innerHTML = S.spons.map(function (x, i) {
      return '<div class="vcsp"><input data-n="' + i + '" value="' + esc(x.name) + '" placeholder="Name as written" aria-label="Sponsor name"><input data-s="' + i + '" value="' + esc(x.say || '') + '" placeholder="Say it like (optional)" aria-label="How to say it">' +
        '<button type="button" data-t="' + i + '" title="Hear it">Test</button><button type="button" data-d="' + i + '" class="x" title="Remove">&times;</button></div>';
    }).join('') || '<div class="meta">No sponsors yet. Tap Add sponsor.</div>';
    var mb = $('#vcMore'); if (mb) mb.innerHTML = S.more.map(function (t, i) {
      return '<div class="vcsp"><input data-mi="' + i + '" value="' + esc(t) + '" maxlength="240" placeholder="Another message" aria-label="Another message"><button type="button" data-md="' + i + '" class="x" title="Remove">&times;</button></div>';
    }).join('');
    var lb = $('#vcLines'); if (lb) lb.innerHTML = S.lines.map(function (l, i) {
      return '<div class="vcsp vcl"><input type="checkbox" data-lc="' + i + '"' + (l.on ? ' checked' : '') + ' aria-label="Include"><textarea data-lt="' + i + '" rows="2" maxlength="240" aria-label="Reminder text">' + esc(l.text) + '</textarea><button type="button" data-ld="' + i + '" class="x" title="Remove">&times;</button></div>';
    }).join('') || '<div class="meta">No reminders yet.</div>';
    var rb = $('#vcRecs'); if (rb) rb.innerHTML = S.recs.map(function (r, i) {
      return '<div class="vcsp vcr"><label class="vcck"><input type="checkbox" data-ri="' + i + '"' + (r.on ? ' checked' : '') + '> ' + esc(r.name) + '</label><button type="button" data-rp="' + i + '">Play</button><button type="button" data-rd="' + i + '" class="x" title="Delete">&times;</button></div>';
    }).join('') || '<div class="meta">No recordings yet.</div>';
  }
  function paint() {
    var b = $('#vcGo'); if (b) { b.textContent = S.on ? 'Stop announcements' : 'Start announcements'; b.className = S.on ? 'stop' : 'ok'; }
    var n = $('#vcNow'); if (n) { n.textContent = playing ? 'Stop talking' : 'Play now'; }
    paintCount();
  }
  function html(link) {
    return '<div class="pn" id="vcBox"><h3>Speaker announcements</h3>' +
      '<div class="meta" style="margin-bottom:8px">Connect your laptop to the speaker in your computer settings, keep this page open, then press Start. Everything here is saved on this laptop only.</div>' +
      '<div class="vcrow"><button type="button" id="vcGo" class="ok">Start announcements</button><button type="button" id="vcNow">Play now</button></div><div class="meta" id="vcCount" style="margin:6px 0 10px"></div>' +
      '<div class="vcrow"><label>Repeat every<select id="vcMins">' + [10, 15, 20, 30, 40, 45, 60].map(function (m) { return '<option value="' + m + '"' + (S.mins === m ? ' selected' : '') + '>' + m + ' minutes</option>'; }).join('') + '</select></label>' +
      '<label>Voice<select id="vcVoice"></select></label><label>Speed<select id="vcRate">' + [[0.8, 'Slow'], [0.95, 'Normal'], [1.1, 'Fast']].map(function (r) { return '<option value="' + r[0] + '"' + (S.rate === r[0] ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('') + '</select></label></div>' +
      '<details class="vcnote"><summary>Keep the speaker from turning off</summary><ol>' +
        '<li>Give Match Control its <b>own Edge window</b>. Drag this tab out of the others and keep that window open behind your other windows. Do not minimize it.</li>' +
        '<li>Turn off <b>sleeping tabs</b> for this site. In Edge: Settings, System and performance, Sleeping tabs, then add this site under "Never put these sites to sleep".</li>' +
        '<li>Stop the laptop from <b>sleeping</b>. In Windows: Settings, System, Power, set sleep to Never while plugged in. Keep the charger connected.</li>' +
        '<li>Press <b>Start announcements</b> once, then check with a 10 minute timer: switch to another tab and make sure the announcement still plays.</li>' +
        '<li>Set the speaker and laptop volume before the first game, and keep the Bluetooth speaker charged and close to the laptop.</li></ol></details>' +
      '<h4>What to say</h4>' +
      '<label class="vcck"><input type="checkbox" id="vcUseOpen"' + (S.useOpen ? ' checked' : '') + '> Opening line</label><input class="vcin" id="vcOpen" value="' + esc(S.open) + '" maxlength="160">' +
      '<label class="vcck"><input type="checkbox" id="vcUseSpons"' + (S.useSpons ? ' checked' : '') + '> Sponsors</label><input class="vcin" id="vcLead" value="' + esc(S.sponsLead) + '" maxlength="100"><div id="vcSpons"></div><div class="btns"><button type="button" id="vcAdd">Add sponsor</button></div>' +
      '<div class="meta">In the second box, spell the name the way it should sound. For example: Jollibee, say it like "Jolly bee".</div>' +
      '<label class="vcck"><input type="checkbox" id="vcUseLink"' + (S.useLink ? ' checked' : '') + '> Schedule reminder</label><input class="vcin" id="vcLink" value="' + esc(S.link) + '" maxlength="200">' +
      '<input class="vcin" id="vcLinkSay" value="' + esc(S.linkSay) + '" maxlength="120" placeholder="Optional, say the address: challenge match day dot vercel dot app">' +
      '<div class="meta">Your public schedule link: ' + esc(link) + '</div>' +
      '<label class="vcck"><input type="checkbox" id="vcUseLines"' + (S.useLines ? ' checked' : '') + '> Reminders for players</label><div id="vcLines"></div><div class="btns"><button type="button" id="vcAddLine">Add a reminder</button></div>' +
      '<label class="vcck"><input type="checkbox" id="vcUseCustom"' + (S.useCustom ? ' checked' : '') + '> Your own messages</label><input class="vcin" id="vcCustom" value="' + esc(S.custom) + '" maxlength="240" placeholder="e.g. Lunch is served at the canteen"><div id="vcMore"></div><div class="btns"><button type="button" id="vcAddMsg">Add another message</button></div>' +
      '<h4>Recordings</h4><div id="vcRecs"></div><div class="btns"><button type="button" id="vcUp">Upload audio</button><button type="button" id="vcRec">Record with microphone</button></div>' +
      '<input type="file" id="vcFile" accept="audio/*" hidden><div class="meta" id="vcRecMsg">Ticked recordings play after the spoken lines, in this order.</div>' +
      '<h4>Save or reuse these settings</h4><div class="meta" style="margin-bottom:6px">Saves the text settings (not the recordings) to a small file. Load it on any computer, or for your next tournament, to get the same sponsors and reminders back.</div>' +
      '<div class="btns"><button type="button" id="vcSave">Save settings to a file</button><button type="button" id="vcLoad">Load settings</button></div><input type="file" id="vcLoadFile" accept=".json,application/json" hidden><div class="meta" id="vcFileMsg"></div></div>';
  }
  var lastLink = '';
  var KEEP = ['mins', 'rate', 'voice', 'useOpen', 'open', 'useSpons', 'spons', 'sponsLead', 'useLink', 'link', 'linkSay', 'useLines', 'lines', 'useCustom', 'custom', 'more'];
  function bind(box, link) {
    lastLink = link;
    var v = $('#vcVoice'), fill = function () {
      var vs = voices().filter(function (x) { return /^en/i.test(x.lang); }); if (!vs.length) vs = voices();
      v.innerHTML = '<option value="">Auto (Brian)</option>' + vs.map(function (x) { return '<option value="' + esc(x.name) + '"' + (S.voice === x.name ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('');
    };
    fill(); try { speechSynthesis.onvoiceschanged = fill; } catch (e) {}
    lists(); paint();
    var set = function (id, k, bool) { $(id).onchange = $(id).oninput = function () { S[k] = bool ? this.checked : this.value; save(); }; };
    set('#vcUseOpen', 'useOpen', 1); set('#vcOpen', 'open'); set('#vcUseSpons', 'useSpons', 1); set('#vcLead', 'sponsLead'); set('#vcUseLink', 'useLink', 1); set('#vcLink', 'link'); set('#vcLinkSay', 'linkSay'); set('#vcUseLines', 'useLines', 1); set('#vcUseCustom', 'useCustom', 1); set('#vcCustom', 'custom');
    $('#vcMins').onchange = function () { S.mins = +this.value; save(); if (S.on) nextAt = Date.now() + S.mins * 60000; paintCount(); };
    v.onchange = function () { S.voice = this.value; save(); };
    $('#vcRate').onchange = function () { S.rate = +this.value; save(); };
    $('#vcGo').onclick = function () { S.on ? stop() : start(); };
    $('#vcNow').onclick = function () { if (playing) stopAll(); else playAll(); };
    $('#vcAdd').onclick = function () { S.spons.push({ name: '', say: '' }); save(); lists(); var i = $('#vcSpons input[data-n="' + (S.spons.length - 1) + '"]'); if (i) i.focus(); };
    $('#vcSave').onclick = function () {
      var o = { app: 'matchday-speaker', version: 1, saved: new Date().toISOString() }; KEEP.forEach(function (k) { o[k] = S[k]; });
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
        KEEP.forEach(function (k) { if (o[k] !== undefined && typeof o[k] === typeof DEF[k] && Array.isArray(o[k]) === Array.isArray(DEF[k])) S[k] = o[k]; });
        S.spons = S.spons.filter(function (x) { return x && typeof x === 'object'; }).map(function (x) { return { name: String(x.name || ''), say: String(x.say || '') }; });
        S.lines = S.lines.filter(function (x) { return x && typeof x === 'object'; }).map(function (x) { return { on: x.on !== false, text: String(x.text || '') }; });
        S.more = S.more.map(String); save();
        var box = $('#vcBox'); if (box) { box.outerHTML = html(lastLink); bind(null, lastLink); $('#vcFileMsg').textContent = 'Settings loaded.'; }
      }; rd.readAsText(f);
    };
    $('#vcAddMsg').onclick = function () { S.more.push(''); S.useCustom = true; var c = $('#vcUseCustom'); if (c) c.checked = true; save(); lists(); var i = $('#vcMore input[data-mi="' + (S.more.length - 1) + '"]'); if (i) i.focus(); };
    $('#vcMore').oninput = function (e) { var t = e.target; if (t.dataset.mi != null) { S.more[+t.dataset.mi] = t.value; save(); } };
    $('#vcMore').onclick = function (e) { var t = e.target.closest('button'); if (t && t.dataset.md != null) { S.more.splice(+t.dataset.md, 1); save(); lists(); } };
    $('#vcAddLine').onclick = function () { S.lines.push({ on: true, text: '' }); save(); lists(); var t = $('#vcLines textarea[data-lt="' + (S.lines.length - 1) + '"]'); if (t) t.focus(); };
    $('#vcLines').oninput = function (e) { var t = e.target; if (t.dataset.lt != null) { S.lines[+t.dataset.lt].text = t.value; save(); } };
    $('#vcLines').onchange = function (e) { var t = e.target; if (t.dataset.lc != null) { S.lines[+t.dataset.lc].on = t.checked; save(); } };
    $('#vcLines').onclick = function (e) { var t = e.target.closest('button'); if (t && t.dataset.ld != null) { S.lines.splice(+t.dataset.ld, 1); save(); lists(); } };
    $('#vcSpons').oninput = function (e) { var t = e.target; if (t.dataset.n != null) S.spons[+t.dataset.n].name = t.value; if (t.dataset.s != null) S.spons[+t.dataset.s].say = t.value; save(); };
    $('#vcSpons').onclick = function (e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.dataset.t != null) { var x = S.spons[+t.dataset.t]; try { speechSynthesis.cancel(); } catch (er) {} say(sp(x)); }
      if (t.dataset.d != null) { S.spons.splice(+t.dataset.d, 1); save(); lists(); }
    };
    $('#vcRecs').onclick = async function (e) {
      var t = e.target.closest('button'); if (!t) return;
      if (t.dataset.rp != null) { var b = await getRec(S.recs[+t.dataset.rp].id); if (b) { if (curAudio) stopAll(); playBlob(b); } }
      if (t.dataset.rd != null) { var r = S.recs.splice(+t.dataset.rd, 1)[0]; await delRec(r.id); save(); lists(); }
    };
    $('#vcRecs').onchange = function (e) { var t = e.target; if (t.dataset.ri != null) { S.recs[+t.dataset.ri].on = t.checked; save(); } };
    var addRec = async function (blob, name) {
      var id = 'r' + Date.now(); try { await putRec(id, blob); } catch (er) { $('#vcRecMsg').textContent = 'Could not save the recording on this browser.'; return; }
      S.recs.push({ id: id, name: name, on: true }); save(); lists(); $('#vcRecMsg').textContent = 'Saved. It is ticked, so it plays in the rotation.';
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
  window.Announcer = {
    init: function (s) { if (slug !== s) { slug = s; load(); } },
    html: function (link) { return html(link); },
    bind: function (link) { bind(null, link); }
  };
})();
