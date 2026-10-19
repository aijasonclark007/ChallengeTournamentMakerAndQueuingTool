// Badminton: everything that is specific to the sport (labels and scoring rules).
(window.SPORT_RULES = window.SPORT_RULES || {}).badminton = {
  key: 'badminton', name: 'Badminton', icon: '🏸', ball: 'shuttle', balls: 'Shuttles',
  blurb: 'First to 31, serving and side swap at 16',
  logo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#12305F"/><g transform="rotate(-35 32 32)"><path d="M16 12 L24 40 H40 L48 12 Z" fill="#fff"/><path d="M22 12 L27 40 M32 12 V40 M42 12 L37 40" stroke="#12305F" stroke-width="1.400" fill="none"/><path d="M19.500 24 H44.500" stroke="#12305F" stroke-width="1.400"/><rect x="14" y="9" width="36" height="5" rx="2.500" fill="#fff"/><path d="M24 40 H40 Q41 52 32 54 Q23 52 24 40Z" fill="#F5B53D"/></g></svg>',
  target: 31, swapAt: 16,
  goal: 'first to 31',
  won: (a, b) => Math.max(a, b) >= 31            // sudden death, no win-by-2
};
