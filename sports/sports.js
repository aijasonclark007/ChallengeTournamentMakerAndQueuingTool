// Sport registry + the little sport badge/dropdown used on every page.
// Load AFTER sports/badminton/rules.js and sports/pickleball/rules.js.
// To add a sport: create sports/<name>/rules.js, include it in the pages, and add its key to ORDER.
(function () {
  const R = window.SPORT_RULES || {}, ORDER = ['badminton', 'pickleball'];
  const def = () => { try { return localStorage.getItem('sport') === 'pickleball' ? 'pickleball' : 'badminton'; } catch (e) { return 'badminton'; } };
  const subs = [];
  const fire = () => subs.forEach(f => { try { f(def()); } catch (e) {} });
  window.addEventListener('storage', e => { if (e.key === 'sport') { mountAll(); fire(); } });      // changed in another tab/frame (e.g. the logo menu)
  const css = '.sppick{position:relative;display:inline-block;vertical-align:middle}' +
    '.sppick>button{display:inline-flex;align-items:center;gap:6px;border:0;font:inherit;font-weight:700;font-size:13px;padding:5px 11px;border-radius:999px;background:#E9EBF1;color:#5B6472;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .15s,background .15s}' +
    '.sppick>button:active{transform:scale(.95);background:#DDE1EA}.sppick .car{font-size:10px;opacity:.7;transition:transform .2s}.sppick.open .car{transform:rotate(180deg)}' +
    '.sppick .menu{position:absolute;left:0;top:calc(100% + 6px);z-index:60;min-width:190px;background:#fff;border-radius:14px;padding:5px;box-shadow:0 2px 6px rgba(0,0,0,.08),0 12px 32px rgba(0,0,0,.18);animation:sppin .18s cubic-bezier(.22,1,.36,1)}' +
    '.sppick .menu[hidden]{display:none}@keyframes sppin{from{opacity:0;transform:scale(.94) translateY(-6px)}}' +
    '.sppick .menu button{display:flex;align-items:center;gap:10px;width:100%;border:0;background:none;padding:10px;border-radius:10px;font:inherit;font-weight:700;font-size:16px;text-align:left;cursor:pointer;color:#111}' +
    '.sppick .menu button:active{background:#EEF1F7}.sppick .menu .ck{margin-left:auto;color:#007AFF}';
  function mount(el) {
    if (!document.getElementById('sppickcss')) { const s = document.createElement('style'); s.id = 'sppickcss'; s.textContent = css; document.head.appendChild(s); }
    const cur = R[def()];
    el.classList.add('sppick'); el.classList.remove('open');
    el.innerHTML = '<button type="button" aria-haspopup="true" aria-expanded="false">' + cur.icon + ' ' + cur.name + ' <span class="car">▼</span></button><div class="menu" hidden></div>';
    const b = el.querySelector('button'), m = el.querySelector('.menu');
    const close = () => { m.hidden = true; el.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); };
    b.onclick = e => {
      e.stopPropagation();
      if (!m.hidden) return close();
      document.querySelectorAll('.sppick .menu').forEach(x => { x.hidden = true; });
      m.innerHTML = ORDER.map(k => '<button type="button" data-k="' + k + '">' + R[k].icon + ' ' + R[k].name + (def() === k ? '<span class="ck">✓</span>' : '') + '</button>').join('');
      m.hidden = false; el.classList.add('open'); b.setAttribute('aria-expanded', 'true');
      m.querySelectorAll('[data-k]').forEach(o => o.onclick = ev => {
        ev.stopPropagation(); try { localStorage.setItem('sport', o.dataset.k); } catch (x) {}
        try { navigator.vibrate && navigator.vibrate(8); } catch (x) {}
        mountAll(); fire();
      });
    };
    if (!window.__sppickDoc) { window.__sppickDoc = 1; document.addEventListener('click', () => document.querySelectorAll('.sppick .menu').forEach(x => { x.hidden = true; x.parentNode.classList.remove('open'); })); }
  }
  function mountAll() { document.querySelectorAll('[data-sportpick]').forEach(mount); }
  window.Sports = {
    list: () => ORDER.map(k => R[k]),
    get: k => R[k] || R.badminton,
    of: o => R[(o && o.sport) === 'pickleball' ? 'pickleball' : 'badminton'],   // from anything with a .sport field
    current: def,                                                              // the site-wide sport
    mount: mountAll,                                                           // turn every [data-sportpick] element into the badge + dropdown
    onChange: f => subs.push(f)                                                // called after the sport changes (here or in another frame)
  };
})();
