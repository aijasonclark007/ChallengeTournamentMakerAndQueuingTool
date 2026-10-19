// Pickleball: everything that is specific to the sport (labels and scoring rules).
// Serving positions (server 1 / server 2, side-out) are in u.html (svBuild / add) and use these numbers.
(window.SPORT_RULES = window.SPORT_RULES || {}).pickleball = {
  key: 'pickleball', name: 'Pickleball', icon: '🏓', ball: 'ball', balls: 'Balls',
  blurb: 'Side-out scoring to 11, win by 2',
  logo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#1F8A4C"/><circle cx="32" cy="32" r="21" fill="#F5D63D"/><g fill="#1F8A4C"><circle cx="32" cy="19" r="3"/><circle cx="21" cy="28" r="3"/><circle cx="43" cy="28" r="3"/><circle cx="26" cy="40" r="3"/><circle cx="38" cy="40" r="3"/><circle cx="32" cy="31" r="3"/></g></svg>',
  target: 11, swapAt: 0,
  goal: 'first to 11, win by 2',
  won: (a, b) => Math.max(a, b) >= 11 && Math.abs(a - b) >= 2
};
