// Badminton: everything that is specific to the sport (labels and scoring rules).
(window.SPORT_RULES = window.SPORT_RULES || {}).badminton = {
  key: 'badminton', name: 'Badminton', icon: '🏸', ball: 'shuttle', balls: 'Shuttles',
  blurb: 'First to 31, serving and side swap at 16',
  target: 31, swapAt: 16,
  goal: 'first to 31',
  won: (a, b) => Math.max(a, b) >= 31            // sudden death, no win-by-2
};
