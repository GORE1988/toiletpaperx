# TOILET PaperX V7 — Weekly Challenge

Run `node server.js` inside this folder, then open http://localhost:3000.

Free paper trading: 100,000 USDToilet credits. No wallet, purchases, withdrawals or real trades. Positions are stored locally in your browser.

Market sources: GeckoTerminal API, CoinGecko Onchain backup, DexScreener fallback for current prices. Historical candles only appear when GeckoTerminal/CoinGecko Onchain supply genuine OHLCV data; the app never invents historical candles.

Troubleshooting: open http://localhost:3000/api/health then http://localhost:3000/api/markets. If /api/markets returns an error, inspect the provider errors shown in JSON. Internet access is needed.

Community: https://x.com/flushwtf?s=20
Official Sui token type: 0xc5b61b1e1f7f88511c9c0c6f475f823c66cc4e2d39a49beb6777059710be8404::toilet::TOILET

The site is a community project, not an investment recommendation. Buying TOILET is voluntary and not needed to play.


V7 EVENT CHALLENGE
- One-week countdown starts on first `node server.js` launch, and is saved in event-deadline.json. Restarting does not reset it.
- For a public event, choose the exact end timestamp before launching: set EVENT_END_AT to UTC ISO 8601 (e.g. 2026-11-22T12:00:00Z). In Windows CMD: `set EVENT_END_AT=2026-11-22T12:00:00Z` then `node server.js`.
- The website displays an end-of-event screen and market APIs return HTTP 410 after expiry. A public deployment must also configure hosting to disable access after the deadline; this local restriction is not tamper-proof.
- Challenge is community/social only, not a verified global leaderboard. Scores are stored in browser localStorage, resettable and editable; screenshots are not proof. No prizes are advertised.
- Download performance PNG then click Share on X; manually attach PNG (X intent does not support attaching local files).

- Winner announcement on @flushwtf is a community organizer action, not automated by the website. Screenshot submissions are unverified and may be edited.


V8 changes: local Sui logo, illustrated challenge area, Start Trading scrolls to the market selector, DexScreener chart opens immediately for DexScreener-sourced markets, and market API diagnostics improved. No synthetic prices/candles. API requests require an Internet connection and provider availability.


## V9: new branded performance card
The screenshot button renders `performance-card-bg.png` with the current fictional portfolio return, virtual equity, number of closed trades, open positions, and current UTC date. The background image includes example data, which are covered and replaced on the exported canvas. The X button opens a prefilled X post; attach the exported PNG manually.


## V10 DEGEN ARCADE EDITION
- Larger, clickable arcade learning stages.
- Market list filter: All / Mooning / Bleeding (real market data only).
- New Position leverage risk labels, stronger neon layout.
- MOON/REKT visual treatment of open and closed trades.
- Automatic DEGEN RANK from total virtual equity return, shown on challenge and PNG card.
- X share text includes the rank. Image download still requires manually attaching the PNG to X.
- Ranks are playful and not independently verified. The challenge remains local-browser and self-reported.


### V11: token logos
Market cards now show token logos when DexScreener's pool metadata or GeckoTerminal's token metadata provides an image URL. SUI uses the bundled official-style SUI icon when no source image exists. Logos are linked to the token's contract-specific market metadata (not guessed by ticker); tokens without an available logo retain the existing emoji fallback. External images require the browser to reach their respective image hosts.

## V12 — interface réorganisée

Cette version part des fichiers V11 et conserve le moteur de simulation, les logos des tokens, les positions locales et l'export de la carte X. Le bandeau supérieur et les quatre étapes sont condensés ; le panneau de performance/partage est maintenant immédiatement au-dessus de la Leverage Machine ; le trading apparaît plus haut. La galerie et la section communautaire sont placées après les positions.

Sous Windows : ouvrir le dossier `toilet-paperx` (celui qui contient `server.js`), taper `cmd` dans la barre d'adresse de l'Explorateur, puis `node server.js`. Ouvir http://localhost:3000 et utiliser Ctrl+F5 si nécessaire.

Note : la carte PNG conserve l'illustration de fond présente dans la V11. Pour utiliser exactement une nouvelle carte $TOILET en fond, fournir son fichier image source distinct et remplacer `performance-card-bg.png`, puis ajuster les zones de texte dans `app.js` si la disposition change.
