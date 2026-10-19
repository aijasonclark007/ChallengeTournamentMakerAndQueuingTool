// Badminton: everything that is specific to the sport (labels and scoring rules).
(window.SPORT_RULES = window.SPORT_RULES || {}).badminton = {
  key: 'badminton', name: 'Badminton', icon: '🏸', ball: 'shuttle', balls: 'Shuttles',
  blurb: 'First to 31, serving and side swap at 16',
  logo: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="bgb" cx=".35" cy=".25" r="1"><stop offset="0" stop-color="#2A63B5"/><stop offset="1" stop-color="#0D2A57"/></radialGradient><linearGradient id="fth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#D3DDEE"/></linearGradient><radialGradient id="ck" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#FFE7A8"/><stop offset="1" stop-color="#E49A1C"/></radialGradient></defs><circle cx="32" cy="32" r="32" fill="url(#bgb)"/><g transform="translate(32 32) rotate(-35) scale(1.04) translate(-32 -32)"><path d="M26.500 42 C22 34 18.500 25 16.500 14 Q32 10 47.500 14 C45.500 25 42 34 37.500 42 Z" fill="url(#fth)"/><g stroke="#9DB1D1" stroke-width=".7" stroke-linecap="round" fill="none"><path d="M28.500 42 L21.500 13"/><path d="M30.500 42 L26.500 12.200"/><path d="M32 42 L32 11.800"/><path d="M33.500 42 L37.500 12.200"/><path d="M35.500 42 L42.500 13"/></g><path d="M20.200 25 Q32 28.500 43.800 25" stroke="#E7A93B" stroke-width="1.100" fill="none" stroke-linecap="round"/><ellipse cx="32" cy="13" rx="15.800" ry="2.800" fill="#fff" stroke="#E7A93B" stroke-width="1.100"/><circle cx="32" cy="46.500" r="7.500" fill="url(#ck)"/><ellipse cx="29.200" cy="43.800" rx="2.600" ry="1.600" fill="#fff" opacity=".5"/></g></svg>',
  target: 31, swapAt: 16,
  goal: 'first to 31',
  won: (a, b) => Math.max(a, b) >= 31            // sudden death, no win-by-2
};
