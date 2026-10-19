// Pickleball: everything that is specific to the sport (labels and scoring rules).
// Serving positions (server 1 / server 2, side-out) are in u.html (svBuild / add) and use these numbers.
(window.SPORT_RULES = window.SPORT_RULES || {}).pickleball = {
  key: 'pickleball', name: 'Pickleball', icon: '🏓', ball: 'ball', balls: 'Balls',
  blurb: 'Side-out scoring to 11, win by 2',
  target: 11, swapAt: 0,
  goal: 'first to 11, win by 2',
  won: (a, b) => Math.max(a, b) >= 11 && Math.abs(a - b) >= 2
};
