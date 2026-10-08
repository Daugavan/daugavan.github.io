# Background animation investigation — 2026-10-08

The deployed HTML, CSS and JavaScript were downloaded and compared with the publication checkout at `4048f1e`. They use the same animation implementation. The available Git history starts with `5930f6a`; that version already contains the same SVG path morphs, SVG blur filter, gradient background-position animation and SVG-only pause handler. It does not provide a verified stable alternative.

The reported renderer crash did not reproduce in the isolated Edge baseline test. The changes therefore remove expensive rendering operations and repair lifecycle handling; they do not establish a confirmed device-specific crash cause.

## Changes

- Keep the two existing SVG curves, colors and dark gradient background. Remove continuous path morphs, opacity SMIL animations and the SVG Gaussian blur/merge filter.
- Animate transforms of fixed artwork instead. Gradient background-position percentages previously acted on viewport-sized gradient images and did not provide meaningful movement; translating the gradient layer supplies actual movement with bounded overscan.
- Give the SVG explicit viewport width and height.
- Start both background animations paused. Enable them together through `data-background-motion` after checking visibility, reduced motion, viewport size and touch capability. Pause both layers when the document is hidden. Keep the lightweight artwork visible and static on mobile, touch, reduced-motion and script-free visits.
- Update CSS and JavaScript cache version strings and rebuild each existing publication directory.

## Verification

Run `node scripts/prepare-public.mjs` before testing a standalone checkout. Run `node tests/background-browser.cjs <path-to-playwright>` and `node --test tests/security.test.mjs`.

The browser regression exercises real time rather than seeking an animation timeline. The publication version runs continuously for 52 seconds, beyond the complete 48-second forward/backward wave cycle. It checks both transforms for movement and records page errors, renderer crashes and CSP violations. It also checks viewport coverage, horizontal overflow, visibility pause/resume, live reduced-motion changes, mobile resize and desktop resume, touch desktop, JavaScript disabled, language switching and gallery open/close. GitHub responses are mocked to keep animation verification independent of network/API availability.

The workspace browser report is saved as `reports/background-verification.json`; desktop and mobile screenshots are saved alongside it. The existing security and publication checks pass (20 checks across the workspace and publication source).

## Limits

Verification uses Edge on this Windows machine. The original crash was not reproduced, and this does not prove compatibility with every GPU, browser or phone. The calmer replacement deliberately changes the motion from shape morphing to drifting fixed curves. The live website is unchanged until the proposed code is merged and deployed.
