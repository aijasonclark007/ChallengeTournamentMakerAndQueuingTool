/* Add or edit tournaments here. Each block becomes a card on the Tournaments tab and its own event page.
   status: 'open' (registration open) | 'soon' (coming soon) | 'done' (finished)
   endpoint: the Google Apps Script web app that saves registrations for that event (leave '' until it is ready). */
window.TOURNAMENTS = [
  {
    id: 'nov-8',
    name: 'Nov 8 Tournament',
    title: 'FBC x Racketeers Badminton Tournament',
    date: '2026-11-08',
    dateText: 'November 8, 2026',
    time: '2:00 PM - 9:00 PM',
    venue: 'IBT Sports Center',
    status: 'open',
    category: 'Non-gender doubles',
    fee: '\u20b1500 / player',
    deadline: 'October 30, 2026',
    perks: 'Food & drinks included, with cash prizes & medals for the winners',
    levels: {
      High: { cap: 24, base: 'Michael Saragena / Joy Pasquil' },
      Mid:  { cap: 24, base: 'Judge Cabasa / Celine Caubanan' },
      Low:  { cap: 24, base: 'Ni\u00f1o Ortiz / Gelliane Ubagan' }
    },
    rules: [
      ['\ud83c\udff8', 'Game format', '31 points, single round-robin, sudden death'],
      ['\ud83e\udd1d', 'Ties', 'Total wins. Total points. Game winner of the tied teams.'],
      ['\ud83d\udc65', 'Blind pairing', 'No substitution during the event'],
      ['\u23f0', 'Be on time', 'Games are from 2PM - 9PM']
    ],
    endpoint: 'https://script.google.com/macros/s/AKfycby5MjyrpwulfYo1SgcFk_wqFMa2itW7LeFx8dF7kxRy37OlHepJLO1Z35oxxq2zMSCB/exec'
  },
  {
    id: 'nov-9',
    name: 'Nov 9 Tournament',
    title: 'Racketeers B.C. Tournament',
    date: '2026-11-09',
    dateText: 'November 9, 2026',
    time: 'To be announced',
    venue: 'To be announced',
    status: 'soon',
    category: 'To be announced',
    fee: 'To be announced',
    deadline: '',
    perks: '',
    levels: {},
    rules: [],
    endpoint: ''
  }
];
