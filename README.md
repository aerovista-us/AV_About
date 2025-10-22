
# AeroVista Vol. ONE — UltraUltimate Player

A branded web player + mini-store for the *Where Vision Takes Flight — Volume One* collection.

## Quick Start
1. Drop your MP3s into `/audio/` and match the filenames used in `assets/data/tracks.json`.
2. Replace cover images in `/assets/img/` if desired.
3. Edit product details in `assets/data/products.json`.
4. Open `index.html` in a browser (or host behind any static server).

## Deploy
- GitHub Pages: push this folder to `main` and set Pages to `/` root.
- Firebase Hosting: `firebase init` → Hosting → deploy.
- NXCore: serve via NGINX/Traefik as a static site.

## Notes
- Web Audio graph includes bass shelf + limiter to prevent clipping.
- Visualizer is GPU-friendly (no external libs).
- Modal/Store is mock checkout — wire to Stripe/Printful when ready.
