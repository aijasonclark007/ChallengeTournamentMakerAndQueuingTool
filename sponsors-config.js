// Sponsors shown on the court TVs while a court is waiting (no live game).
// One line per sponsor, in the order they should appear. Leave the list empty to turn the slideshow off.
// Each one: { name: 'Sponsor name', line: 'optional second line, e.g. a tagline' }   (line can be left out)
window.SPONSORS_CONFIG = {
  title: 'Thank you to our sponsors',
  seconds: 6,            // how long each sponsor stays on screen
  gap: 30,               // seconds of the normal screen (Up next / attendance) before the sponsors play again
  list: [
    // { name: 'Sponsor one', line: 'Official partner' },
  ]
};
