/* v2: redeploy marker */
/* Haptics for the whole site. Android/Chrome: navigator.vibrate. iPhone Safari (iOS 17.4+): Safari has no vibrate, but toggling a hidden
   <input type="checkbox" switch> gives a light tap, so we use that inside the user's tap. Users can turn it off (localStorage 'haptics' = 'off'). */
(function () {
  var sw = null, ios = !(navigator.vibrate) && /iPhone|iPad|iPod/.test(navigator.userAgent);
  function on() { return true; }   // always on
  function mk() {
    if (sw || !document.body) return sw;
    var l = document.createElement('label'); l.setAttribute('aria-hidden', 'true');
    l.style.cssText = 'position:fixed;left:-200px;top:-200px;width:1px;height:1px;opacity:0;pointer-events:none';
    var i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1; l.appendChild(i); document.body.appendChild(l); sw = l; return l;
  }
  function tick() { try { var l = mk(); if (l) l.click(); } catch (e) {} }
  function buzz(p) {
    if (!on()) return;
    try {
      if (navigator.vibrate) { navigator.vibrate(p); return; }
      if (!ios) return;
      var t = 0, n = 0;
      (Array.isArray(p) ? p : [p]).forEach(function (ms, k) { if (k % 2 === 0 && n < 4) { n++; setTimeout(tick, t); } t += ms; });   // one tap per "vibrate" segment
    } catch (e) {}
  }
  window.Haptics = { buzz: buzz, enabled: on, set: function (v) { try { localStorage.setItem('haptics', v ? 'on' : 'off'); } catch (e) {} if (v) buzz(10); } };
})();
