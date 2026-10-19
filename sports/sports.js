// Sport registry. Load AFTER sports/badminton/rules.js and sports/pickleball/rules.js.
// To add a sport: create sports/<name>/rules.js, include it in the pages, and add its key to ORDER.
(function () {
  const R = window.SPORT_RULES || {}, ORDER = ['badminton', 'pickleball'];
  const def = () => { try { return localStorage.getItem('sport') === 'pickleball' ? 'pickleball' : 'badminton'; } catch (e) { return 'badminton'; } };
  window.Sports = {
    list: () => ORDER.map(k => R[k]),
    get: k => R[k] || R.badminton,
    of: o => R[(o && o.sport) === 'pickleball' ? 'pickleball' : 'badminton'],   // from anything with a .sport field
    current: def                                                               // the default chosen on the Sports tab
  };
})();
