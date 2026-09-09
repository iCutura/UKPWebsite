# Cookie consent, Meta Pixel and /app: design canvas

Working files for the published canvas (ten artboards + `canvas.json`), the same arrangement as
`docs/design-review/`. Re-seed from these when the design changes; the seeded `.html` is a build
output and is gitignored, as are the assets copied in from `public/`.

To rebuild the canvas, copy the assets the boards reference and run the seeder:

```sh
cd docs/design-pixel
cp ../../public/img/brand/mascot-white-96.webp mascot-white.webp
cp ../../public/img/promo/home-framed.webp phone-home.webp
cp ../../public/img/promo/quiz-framed.webp phone-quiz.webp
cp ../../public/img/qr/app-store.svg qr-appstore.svg
cp ../../public/img/qr/google-play.svg qr-googleplay.svg
```

The boards carry Cobe Heavy inline as a base64 `@font-face`, so they render in the brand face
without a network request and the font survives PNG and PDF export. It comes from
`public/fonts/cobe-heavy.woff2`; re-inline it with `base64 -i` if the subset is ever regenerated.

What shipped from this design lives in: `src/lib/cookieConsent.ts`, `src/components/CookieConsent.astro`,
`src/scripts/cookieConsent.ts`, `src/scripts/pixel.ts`, `src/pages/app.astro`, `src/layouts/Landing.astro`,
`src/components/StoreBadge.astro`, `src/pages/kolacici.astro` and `src/pages/pravila-privatnosti.astro`.

Two boards are specification rather than design (`ConsentSpec`, `PixelEvents`) and one is finished
copy (`Kolacici`). Where the built page and a board disagree, the page won: the boards set three
lines on /app in the faint ink tier (`--on-dark-lo`), which `tests/e2e/contrast.spec.ts` rejects, and
the shipped page uses `--on-dark-md`.
