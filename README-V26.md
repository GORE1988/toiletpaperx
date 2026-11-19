# TOILET PaperX V26 — Card Fix & Hero Navigation

- Both top arcade illustration panels (BATTLE READY and 7-DAY CHALLENGE) now jump to the trading terminal, with keyboard support.
- Fixed PNG card generation: `server.js` previously rejected all `/cards/performance-XX.jpg` asset URLs (404). The server now explicitly allows only the ten bundled card artworks, while retaining its path allowlist.
- The existing Level 04 and score-panel PNG buttons continue using the same export function.
- Launch from the inner `toilet-paperx` directory using `node server.js`, then open http://localhost:3000.
