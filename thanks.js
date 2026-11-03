// "Say thank you to the developer": a small button that opens a sheet with the ways to send a thank-you.
// Settings live in thanks-config.js. Add  <button class="thx-btn" data-thanks></button>  anywhere, or call Thanks.open().
(function () {
  var C = window.THANKS_CONFIG || {}, links = (C.links || []).filter(function (l) { return l && l.url && l.label; });
  var has = !!(C.qr || links.length);
  var css = '.thx-btn{display:inline-flex;align-items:center;gap:7px;border:0;cursor:pointer;font:inherit;font-size:14px;font-weight:700;color:#007AFF;background:rgba(0,122,255,.1);padding:9px 16px;border-radius:999px;-webkit-tap-highlight-color:transparent;touch-action:manipulation;transition:background-color .2s ease,transform .16s cubic-bezier(.2,.8,.2,1)}' +
    '.thx-btn:active{transform:scale(.95)}@media (hover:hover){.thx-btn:hover{background:rgba(0,122,255,.17)}}' +
    '.thx-btn .h{display:inline-block;animation:thxbeat 2.6s ease-in-out infinite}@keyframes thxbeat{0%,70%,100%{transform:none}80%{transform:scale(1.25)}90%{transform:scale(.95)}}' +
    '#thx{position:fixed;inset:0;z-index:100000;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0);visibility:hidden;transition:background-color .28s ease,visibility 0s linear .32s;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",Inter,system-ui,sans-serif}' +
    '#thx.on{background:rgba(0,0,0,.42);visibility:visible;transition:background-color .28s ease}' +
    '#thx .sh{width:100%;max-width:440px;max-height:92vh;overflow:auto;box-sizing:border-box;background:#fff;color:#1C1C1E;border-radius:22px 22px 0 0;padding:10px 20px calc(22px + env(safe-area-inset-bottom));transform:translateY(105%);transition:transform .38s cubic-bezier(.2,.9,.25,1);box-shadow:0 -10px 40px rgba(0,0,0,.2)}' +
    '#thx.on .sh{transform:none}@media (min-width:600px){#thx{align-items:center}#thx .sh{border-radius:22px;transform:translateY(24px) scale(.96);opacity:0;transition:transform .34s cubic-bezier(.2,.9,.25,1),opacity .25s ease}#thx.on .sh{transform:none;opacity:1}}' +
    '#thx .gr{width:38px;height:5px;border-radius:3px;background:rgba(60,60,67,.25);margin:0 auto 12px}' +
    '#thx h2{color:inherit;margin:0 0 6px;font-size:22px;letter-spacing:-.01em;text-align:center}#thx p{margin:0 0 14px;color:#5F5F66;font-size:15px;line-height:1.45;text-align:center}' +
    '#thx .qr{display:block;margin:0 auto 14px;text-align:center;opacity:0;transform:translateY(8px);transition:opacity .4s ease .12s,transform .4s cubic-bezier(.2,.8,.2,1) .12s}#thx.on .qr{opacity:1;transform:none}' +
    '#thx .qr img{width:210px;max-width:70%;height:auto;border-radius:16px;border:1px solid rgba(60,60,67,.18);background:#fff;padding:8px;box-sizing:border-box}#thx .qr small{display:block;margin-top:6px;color:#5F5F66;font-size:13px;font-weight:600}' +
    '#thx a.lk{display:flex;justify-content:center;align-items:center;gap:8px;margin:8px 0;padding:14px;border-radius:14px;background:#007AFF;color:#fff;font-weight:700;font-size:16px;text-decoration:none;opacity:0;transform:translateY(8px);transition:opacity .35s ease,transform .35s cubic-bezier(.2,.8,.2,1),filter .15s}#thx.on a.lk{opacity:1;transform:none}' +
    '#thx a.lk:nth-of-type(2){transition-delay:.18s}#thx a.lk:nth-of-type(3){transition-delay:.24s}#thx a.lk:active{transform:scale(.97);filter:brightness(.92)}' +
    '#thx button.cl{display:block;width:100%;margin-top:6px;padding:13px;border:0;border-radius:14px;background:rgba(118,118,128,.12);color:#1C1C1E;font:inherit;font-weight:700;font-size:16px;cursor:pointer;transition:transform .15s ease,background-color .2s}#thx button.cl:active{transform:scale(.97)}' +
    '#thx .sh:focus{outline:none}#thx button.cl:focus:not(:focus-visible){outline:none}#thx .fine{margin:10px 0 0;font-size:12px;color:#8E8E93}' +
    '@media (prefers-color-scheme:dark){#thx .sh{background:#1C1C1E;color:#F2F2F7}#thx p,#thx .qr small{color:#A1A1A8}#thx button.cl{background:rgba(118,118,128,.28);color:#F2F2F7}}' +
    '@media (prefers-reduced-motion:reduce){#thx,#thx .sh,#thx .qr,#thx a.lk,.thx-btn,.thx-btn .h{transition:none!important;animation:none!important}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var box = null, prev = null;
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function build() {
    box = document.createElement('div'); box.id = 'thx'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Say thank you to the developer');
    var h = '<div class="sh" tabindex="-1"><div class="gr"></div><h2>Say thank you 💙</h2><p>Challenge Match Day is free to use. If it made your tournament easier, you can send a small thank-you. It is completely optional.</p>';
    if (C.qr) h += '<div class="qr"><img src="' + esc(C.qr) + '" alt="' + esc(C.qrLabel || 'QR code') + '" onerror="this.parentNode.style.display=\'none\'"><small>Scan with ' + esc(C.qrLabel || 'your app') + '</small></div>';
    links.forEach(function (l) { h += '<a class="lk" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' + esc(l.label) + '</a>'; });
    h += '<button type="button" class="cl">Close</button><p class="fine">Thank you for using it. — ' + esc(C.name || 'Jason Clark') + '</p></div>';
    box.innerHTML = h; document.body.appendChild(box);
    box.addEventListener('click', function (e) { if (e.target === box || (e.target.closest && e.target.closest('.cl'))) close(); });
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function open() {
    if (!has) return; if (!box) build(); prev = document.activeElement;
    void box.offsetWidth; box.classList.add('on'); document.addEventListener('keydown', onKey);
    setTimeout(function () { var b = box.querySelector('.sh'); if (b) b.focus({ preventScroll: true }); }, 60);
  }
  function close() { if (!box) return; box.classList.remove('on'); document.removeEventListener('keydown', onKey); if (prev && prev.focus) try { prev.focus({ preventScroll: true }); } catch (e) {} }
  function paint() {
    [].slice.call(document.querySelectorAll('[data-thanks]')).forEach(function (b) {
      if (!has) { b.style.display = 'none'; return; }
      if (b.dataset.thxReady) return; b.dataset.thxReady = '1'; b.classList.add('thx-btn'); b.type = 'button';
      if (!b.textContent.trim()) b.innerHTML = '<span class="h">💙</span> Say thank you to the developer';
      b.addEventListener('click', open);
    });
  }
  window.Thanks = { open: open, close: close, paint: paint, enabled: has };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint); else paint();
})();
