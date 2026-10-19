// Badminton: everything that is specific to the sport (labels and scoring rules).
(window.SPORT_RULES = window.SPORT_RULES || {}).badminton = {
  key: 'badminton', name: 'Badminton', icon: '🏸', ball: 'shuttle', balls: 'Shuttles',
  blurb: 'First to 31, serving and side swap at 16',
  logo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#12305F"/><g transform="rotate(30 32 32)"><path d="M23 26 L26 9 H38 L41 26 Z" fill="#fff"/><path d="M26.500 15 H37.500 M25 20.500 H39 M30 9 L29.500 26 M34 9 L34.500 26" stroke="#12305F" stroke-width="1.200" fill="none"/><path d="M22.500 26 H41.500 Q42 38 32 52 Q22 38 22.500 26Z" fill="#F5B53D"/></g></svg>',
  target: 31, swapAt: 16,
  goal: 'first to 31',
  won: (a, b) => Math.max(a, b) >= 31            // sudden death, no win-by-2
};
