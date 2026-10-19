# The Decision Wheel — Love for Mena

Spin it and let love choose for us: what to eat, what to watch, who pays for the
pizza. Part of the **Love for Mena** collection.

**Live:** https://menaammarpro.github.io/love-spinner/

## What it does

- A canvas **decision wheel** with up to 24 options
- **Spin** with a gentle ease-out animation — the wheel tells you the answer
  (or press **Space** / **S**)
- **Add / remove** options, **clear** them, or **shuffle** the order
- A **recent results** strip remembers the last few answers
- Ready-made **presets** (what to eat, what to watch, who pays, tonight) and you
  can save your own sets
- Everything is remembered on this device — no tracking, no network calls
- Installable PWA with offline support

## How it works

All of the maths lives in pure functions on `window.MenaSpinner` so it can be
tested without a canvas:

- `pickIndex(rand, n)` — turn a random number into a segment index
- `wheelSegment(i, n)` — start / end / mid angles of a segment
- `indexAtPointer(rotation, n)` — which segment the top pointer is over
- `targetRotation(current, targetIndex, n, turns)` — the rotation that stops on a
  chosen option

State is stored in localStorage under `mena-spinner` as
`{ presets:[{name,options:[]}], options:[], spins, lastResult, history:[] }`.

## Files

- `index.html` — the page
- `css/theme.css` — shared love-theme (copied from `_love-theme/`)
- `css/app.css` — page-specific styles
- `js/theme-main.js`, `js/effects.js` — shared behaviour/effects
- `js/app.js` — wheel logic (`window.MenaSpinner`)
- `manifest.webmanifest`, `sw.js` — PWA
- `assets/favicon.svg` — the icon
- `test/harness.js` — dependency-free Node test harness

## Run locally

```powershell
py -m http.server 8000
```

Then visit http://localhost:8000.

## Test

```powershell
node --check js/app.js
node test/harness.js
```

## Deploy

Static site, deployed with GitHub Pages from `main`.

## License

Creative Commons BY-NC-ND 4.0 — see [`LICENSE`](LICENSE).
© 2026 Ammar (MenaAmmarPro). Made with care for Mena.
