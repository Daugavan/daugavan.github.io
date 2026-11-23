# Liquid Glass web adaptation — 2026-11-13

Implemented from the approved plan and the supplied `apple-liquid-glass` skill,
Mode B. This is a browser interpretation, not Apple's native material renderer.
The comparison baseline is commit `6aa9c42`.

## Materials and behavior

| Region | Purpose and implementation | Solid / reduced-motion behavior |
| --- | --- | --- |
| Header | One green sampled background on a pseudo-element, separate from the fixed drawer | Opaque backing; the drawer always stays solid |
| Menu categories | One sampled bar; an **unfiltered** capsule marks the current anchor | Solid capsule, immediate position updates |
| Home photo actions | Clear secondary booking action; emerald primary menu action; matching capsule geometry | Solid backing, stable targets |
| Footer | Native button with `role=switch`, name **Glaseffekter**, `aria-checked`, visible På/Av and positional feedback | Solid thumb/track; remains operable |
| Home heading | Existing 40/88px lens and 1.45× magnification, restrained edge light, 220ms return | Stationary with touch/reduced motion; removed for solid/high-contrast modes |
| Food and forms | Stronger photo scrim and subtle card edge; no additional sampled materials | Stable reading surfaces and unchanged form behavior |

The categories remain real anchor links, with `aria-current=location`, keyboard
navigation and horizontal visibility of the selected/focused destination. The
220ms mark animation affects its decorative background only, is interruptible,
and never delays navigation. The header height and category height are measured;
the bar follows the header's visible height without the previous mobile gap.

The lens uses a deterministic 256×256 displacement map with a neutral centre and
smooth annulus. Its SVG filter applies **before** the text copy's transform, to a
source region only 40/1.45 or 88/1.45 CSS px wide. Post-transform displacement is
at most 3/6px. The original heading has a matching circular mask. Neither the
photograph nor arbitrary DOM behind the lens is refracted. If map generation is
unavailable, the ordinary magnified copy and edge lighting remain.

Filtering the transformed wrapper with a larger region was rejected: WebKit
could lose the glyph, and a broader region produced unstable rendering samples.
The final small source region preserves the glyph in the tested engines. Pixel
checks verify both a visible difference and preservation of the letter, rather
than treating disappearance as successful refraction.

Custom timings (140ms feedback, 220ms movement), tint, map, shadows and geometry
are project decisions (**INFERRED**), not Apple constants. Shared values are
recorded in `design_tokens.json`. No runtime dependency, shader library, build
step, backend, new theme or remote asset was added. CSP remains unchanged.

## Preferences and accessibility

- Opaque styles are the base; `@supports` enables bounded backdrop filters.
- `coco-glass` preserves the user's setting. `head.js` now runs synchronously in
  the head, applying saved and system preferences before body rendering.
- Blocked storage permits in-session operation. Storage changes in another tab
  update the local control. Changing material does not remount content.
- Media queries and live MediaQueryList listeners handle motion, contrast,
  forced colors and supported reduced transparency. System restrictions take
  precedence over a saved glass-on preference. The switch reflects the saved
  preference; system accessibility settings may still suppress the material.
- Reduced motion removes CSS animations/transitions and scripted spatial effects.
  Preference-off also stops photo parallax and the existing photo entrance zoom.
- The lens copy is inert, `aria-hidden`, non-interactive and non-semantic. There
  is only one accessible H1. Real links/buttons, focus outlines and the mobile
  menu's Escape/focus return are retained. Initial drawer focus waits one frame
  for its visibility change. No new automatic motion loop was introduced.

## Executed verification

Linux, Playwright, local HTTPS fixture with the production CSP. The self-signed
certificate is trusted only by the test contexts. Tests require Node, Playwright,
`pngjs` and OpenSSL; the website itself still has no package dependencies.

```sh
node tests/glass-review.cjs
GLASS_BROWSER=firefox node tests/glass-review.cjs
GLASS_BROWSER=webkit node tests/glass-review.cjs
```

Chromium uses `/usr/bin/chromium` by default (`CHROMIUM_PATH` overrides it).
Firefox/WebKit use Playwright's installations. In this environment WebKit's
missing Debian libraries were extracted under `/tmp` and linked into its own
bundle. The host-cache check was skipped because it cannot discover those local
libraries; actual WebKit processes and tests executed.

| Engine | Observed version | Automated checks |
| --- | --- | --- |
| chromium | 156.0.8078.79 | 125 PASS |
| firefox | 153.0 | 122 PASS |
| webkit | 26.5 | 122 PASS |

JavaScript syntax checks, JSON parsing and `git diff --check` also passed.

Results and screenshots are retained in [tests/artifacts](tests/artifacts).
The scripts default to `/tmp/coco-glass-review`; set `GLASS_ARTIFACTS` to change it.

The suite covers 320/390/768/1440px across all five pages; 200% root text sizing;
header/category alignment; direct hashes, keyboard and rapid reversals; switch
persistence/focus; no-JS/no-filter/no-canvas fallbacks; touch; preference changes;
visible glyphs; and invalid/valid booking/contact submissions.

**Fixture boundaries:** the mail-client transport is captured after the actual
submit handler builds its encoded URL; no mail is sent. The remote OpenStreetMap
embed is a static fixture, and its unchanged source endpoint is asserted. When
allowed to run live, the embed emitted a WebGL2 creation failure in headless
Firefox. External map rendering is not part of the local glass regression claim.

Firefox's automation changes new `matchMedia` queries without updating existing
MediaQueryLists or firing change events for some emulated settings. The test
records this and reloads to verify startup behavior. These passes do not establish
live OS preference-change behavior in Firefox. Raw per-engine notes are retained.

### Contrast and interaction

`node tests/glass-contrast.cjs` samples actual composited backgrounds beneath
changed controls, including hover states and the photo/menu backdrops. Minimum
normal-text contrast was **4.66:1**; selected-capsule boundary contrast was
**3.24:1**. Other sampled text values are in [contrast.json](tests/artifacts/contrast.json).
A visible 2px emerald focus outline was verified. This targeted sampling is not
a whole-site WCAG certification or every possible backdrop/zoom combination.

Trusted switch pointer input to the second animation frame took **7.7–40.9ms**
in three samples, with **0px** button width/height shift between states. The
second frame is a visual-feedback proxy, not physical-device input latency.
See [interaction.json](tests/artifacts/interaction.json).

### Rendering comparison

```sh
# Serve this checkout, and optionally the old checkout on another local port.
GLASS_URL=http://127.0.0.1:8765 \
GLASS_BASELINE_URL=http://127.0.0.1:8766 node tests/glass-profile.cjs
```

Chromium 156.0.8078.79; 1440×1000; three warmed, alternated pointer pairs, 90
frames per run. All variants disable the existing background-photo animation
for the comparison. Trace durations are the union of main-thread timeline work
inside each marked frame, not GPU time or presented frame rate.

| Pointer run | Magnification only, p95 | Edge refraction, p95 | Added p95 |
| --- | ---: | ---: | ---: |
| 1 | 6.409ms | 5.930ms | −0.479ms |
| 2 | 4.666ms | 5.261ms | +0.595ms |
| 3 | 3.223ms | 3.010ms | −0.213ms |

The **worst paired added p95 was 0.595ms**, below the project's 2ms gate, so the
bounded refraction is retained. Negative differences are sample variability,
not evidence that adding a filter makes rendering faster.

| Scroll run | Before change, p95 | New solid mode, p95 | New glass mode, p95 |
| --- | ---: | ---: | ---: |
| 1 | 1.529ms | 1.476ms | 1.434ms |
| 2 | 1.132ms | 1.573ms | 1.088ms |
| 3 | 1.202ms | 2.083ms | 5.515ms |

The third scroll sample shows variability; no scrolling performance improvement
is claimed. There were zero application-requested animation frames during a
500ms settled idle observation. Raw measurements are in
[performance.json](tests/artifacts/performance.json). These desktop samples do
not establish mobile GPU cost, battery impact or a 60/120Hz frame-rate guarantee.

## Visual reference comparison

**OBSERVED:** before/after desktop/mobile images and the three engines' output
were inspected. They establish visible appearance, not screen-reader speech or
GPU behavior.

| Reference / trait | Status | Deliberate implementation boundary |
| --- | --- | --- |
| [Inspiration](https://liquidglassdesign.com/gallery/liquid-glass-inspiration): edge light and thickness | PARTIALLY MATCHED | Applied to small controls; no floating rectangle that warps the whole page |
| [Playground](https://liquidglassdesign.com/gallery/liquid-glass-animation-playground): local optical lens | PARTIALLY MATCHED | Actual text displacement and magnification; restrained colour, no automated looping or large expansion |
| [Switch](https://liquidglassdesign.com/gallery/liquid-glass-switch): moving glass thumb and two positions | MATCHED for interaction/silhouette; PARTIALLY MATCHED for material | Controls glass preference; native illumination and the reference's theme change are not reproduced |
| Arbitrary live-background refraction / native Apple renderer | NOT MATCHED | Outside this web adaptation |

[Before desktop](tests/artifacts/before-home-desktop.jpg) ·
[After desktop](tests/artifacts/after-home-desktop.jpg) ·
[Before mobile](tests/artifacts/before-home-mobile.jpg) ·
[After mobile](tests/artifacts/after-home-mobile.jpg) ·
[Categories](tests/artifacts/categories-mobile.jpg) ·
[Switch](tests/artifacts/switch.jpg)

## Remaining release checks

**NOT TESTED:** actual Safari on macOS/iOS; real touch hardware; actual browser
200% zoom (root-text resizing was tested); screen-reader speech and Voice Control;
live OS settings on physical devices; low-end device GPU, battery and thermal
behavior; live external map rendering in headless Firefox.

This report records local verification before publication; hosting status is
tracked separately. Complete the remaining device checks before treating the
web adaptation as verified on those devices, especially Safari glyph rendering
and busy-backdrop focus.
