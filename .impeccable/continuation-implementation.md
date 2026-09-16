# Continuation handoff — Angular implementation still pending

## Read first

1. This file (latest execution state).
2. `.impeccable/centro-de-juegos-handoff.md` (authoritative requirements).
3. `.agents/skills/impeccable/SKILL.md` and its new-work/craft-floor references.
4. Open `.impeccable/mocks/manual-02-indice.png` and both material references.

The user chose **Manual de misión / Índice primero**. Approval is final. Do not reopen visual exploration or ask questions. Build and verify the Angular application. Use **pnpm exclusively**. The user values legible, auditable code, simple architecture, SOLID where useful, and faithful high-quality materials.

## Honest status

**The application UI has NOT been implemented. There is no `src/` yet.** No app build, browser interaction tests, accessibility audit, or final screenshots have run. This session completed environment setup, asset generation, comp measurement and test authoring. Do not report the application as working based on the setup alone.

## Completed and saved

### Angular and tooling

- `package.json`, `pnpm-lock.yaml`, installed `node_modules/`.
- Angular core/compiler/platform-browser 21.2.23 and CLI/build 21.2.24. Chosen for installed Node **22.21.1**; current Angular 22 requires newer Node. No Node upgrade needed.
- Strict TypeScript, including strict Angular templates and unchecked indexed access: `tsconfig.json`, `tsconfig.app.json`, `tsconfig.test.json`.
- `angular.json`: application builder, static output `dist/chairo/browser`, relative base href via `pnpm build`, local dev server via `pnpm start`, asset copying from `assets/plates/*.png` and `public/`.
- `pnpm-workspace.yaml`: native dependency builds allowed for esbuild, parcel watcher, lmdb and msgpackr-extract; install/rebuild completed.
- Self-hostable Fontsource dependencies: Cabin Condensed, Dosis, Kalam, Lilita One. Font CSS has not yet been imported because UI is absent.
- Playwright, axe-core integration and Node type declarations installed.
- `.gitignore` and an initial README. README describes the intended behavior; finish implementation before considering its behavior claims verified.

### Tests authored, not executed against an application

`tests/game-center.spec.ts` contains 13 tests covering:

- 320, 390, 941, 1280 and 1440 px widths; six tabs, titles, state, panel changes, URL stability, touch target heights, overflow, assets and axe checks.
- Keyboard skip link, Up/Down wrapping, Home/End, roving tabindex, visible focus and Tab order.
- Optional preference persistence, clearing and independence from selected game.
- Invalid storage contents, storage getter/read failures, and write/remove failures.
- 200% root text size, reduced motion and forced colors.
- Screenshot output to `.impeccable/review/mobile.png`, `desktop.png`, `comp-size.png`, `width-320.png`, `width-1280.png`.

`pnpm exec tsc --project tsconfig.test.json` **passed**. Tests may need adjustments to the final semantic implementation; preserve their behavioral intent rather than weakening assertions.

`playwright.config.ts` serves **the production build** using Python 3 on port 4173, with base URL `http://127.0.0.1:4173/chairo/browser/`. This intentionally tests static subpath hosting. Run `pnpm build` before `pnpm test` (or `pnpm check`).

### Measured comp and Impeccable state

- Copied existing approval sidecars to the format the CLI actually reads: `.png.json` alongside the original `.json` files. No approval was changed or requested again.
- `comps` and `spec` phases closed successfully.
- `.impeccable/build/regions.json` and `spec.json`: 37 measured regions, five plates, text measurements.
- `.impeccable/build/scaffold/layout.css` and `hero-reference.html` generated. These are layout references, **not the actual app**.
- Current phase in `.impeccable/build/state.json`: **plates**, gate failed. Do not mark it passed without resolving the issue described below.
- Font matching with sans category selected **Cabin Condensed 700**, estimated 44px at the 941px comp width for regular game labels. Use actual visual checks to set final fluid sizes.
- Font measurement is imperfect: the rotated footer note was misread as a single 115px-high glyph group. Do not blindly size the real note from that value. Font-match did not resolve a browser even after Playwright was installed.

### Production art

Five generated PNG assets exist in `assets/plates/` (about 1.6 MB total):

| Asset | Dimensions | Use |
|---|---|---|
| `paper.png` | 660 × 168 | Ivory paper grain |
| `brand.png` | 902 × 324 | Yellow Chairo wordmark with deep blue outline |
| `ring.png` | 192 × 136 | Silver binder ring and brass eyelet |
| `brush.png` | 1132 × 294 | Yellow paint swash |
| `stage.png` | 1240 × 500 | Blue/gold stage with three podiums, 100 / 200 / 300 |

The art was generated with native Imagegen using actual comp references. Prompts are in `.impeccable/build/asset-prompts/`; `.impeccable/build/asset-provenance.json` also exists. The producer reported embedded prompts; verify with `impeccable embed-prompt --scan assets/plates` at finish.

**Transparency limitation:** Imagegen produced RGB checkerboards instead of alpha in the first two attempts. The final four illustration files were regenerated on **plain opaque white**, with no checkerboard. They are suitable for printing onto the paper using CSS `mix-blend-mode: multiply`; they are **not transparent PNGs**. Inspect integration, especially the metal ring and acetate. The final artwork was visually inspected and reads close to the comp. Do not ship the earlier checkerboard versions in `.impeccable/build/asset-review/`. Clean up abandoned generated variants at finish while retaining useful provenance.

## Unresolved Impeccable gate / tooling issue

`impeccable build-phase advance` rejected:

- `brand.png`: structure score 36% against the comp region.
- `stage.png`: structure score 26%.

Paper, ring and brush did not produce gate objections. **This is an unresolved rejection, not a verified false positive.** There is evidence that the CLI crop path is broken: `impeccable comp-spec --crop brand` produced an entirely flat beige image, and the asset producer observed the same for all five CLI crops. The producer created real reference crops separately; they are `*-reference.png` in `.impeccable/build/crops/`.

The full comp and separately created reference crops display correctly. The spec includes plausible normalized `box` and pixel `px` coordinates. Investigate the actual crop/measurement issue before spending more generations on already useful art. Try checking `--raw` behavior (not attempted yet). No `--force` was used, and the user did not downgrade the comp.

The environment has `/usr/bin/convert-im6.q16` although Impeccable context claimed no converter. Temporary symlinks were made at `/tmp/chairo-image-tools/{magick,convert}`. Prepending that directory to PATH **did not fix** flat crop output or the plates gate. Do not assume this workaround succeeded. No skill binaries were modified.

## Environment notes

- Workspace: `/home/ordson/Documentos/Christian/Chairo`.
- `pnpm` network commands initially failed DNS inside the sandbox; `exec_command` with `sandbox_permissions: require_escalated` succeeded. These automatic approval requests were accepted. No user permission is pending.
- Chromium exists at `/home/ordson/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`.
- Browser launch inside the sandbox failed with `setsockopt: Operation not permitted`; an escalated `pnpm exec node` Playwright smoke check **successfully opened Chromium and read a page title**. This is browser availability evidence only, not app testing.
- Playwright config uses the cached Chromium when present, with `CHROMIUM_PATH` override and ordinary Playwright fallback on other machines.
- `git status` reported that this directory is not a Git repository despite a mounted read-only `.git` directory. Nothing was committed or deployed.
- The Impeccable asset producer subagent hit the account usage limit after saving the final assets/provenance. Its final formal report was not completed. Treat files and direct inspection as evidence.

## Next implementation work

1. Resolve/document the measurement issue and advance the plates gate honestly. Keep the approved comp authoritative.
2. Read craft-floor immediately before editing UI. Create `src/main.ts`, `src/index.html`, `src/styles.css`, `src/app/` and `public/` as needed.
3. Build the actual Angular app with semantic responsive markup, preserving the stacked index above the acetate panel and preference below. No routing or backend for this screen.
4. Initial selection: Jeopardy. Exactly six games in the agreed order; every tab and panel says Próximamente. Correct pictograms: bulb, question mark, compass, book, shell, trophy.
5. Use accessible vertical tabs, one active tab in Tab order, Up/Down + Home/End, visible focus, associated focusable panel, and reduced motion.
6. Preference starts Sin preferencia, can be cleared, and never blocks exploration. Help text must remain `La modalidad se elegirá dentro de cada juego.`
7. Keep code small and readable. Suggested architecture (not yet implemented): readonly typed game catalogue; standalone OnPush component with signals; tiny icon component; preference service with injected storage capability and guarded read/write/remove. Avoid speculative base classes, routers, game mechanics, Supabase scaffolding or generic repositories.
8. Existing tests expect preference values `none`, `solo`, `shared-device`, `multiple-phones` and storage key `chairo:play-preference`. These are implementation suggestions encoded in tests, not user-approved product requirements. Adjust consistently if needed.
9. Complete Impeccable hero/sections/motion/responsive stages. Compare at **941 × 1672** as well as the required device widths. Do not scale the full mockup into an image; mobile type and targets must remain readable.
10. Run build, tests, screenshot inspection, contrast checks and the detector. Bounded inspection/fix passes per skill. Fix failures, including long names and 200% text overflow.
11. Perform the skill's independent finish review, apply findings, and complete **DESIGN.md** plus **.impeccable/design.json** via the documenter. Neither exists yet. Update README and evidence documents to describe only verified behavior.
12. Deliver execution commands, actual test results and screenshot links. Do not deploy external services.

## Sources checked

- Angular compatibility: https://angular.dev/reference/versions
- Angular zoneless behavior: https://angular.dev/guide/zoneless
- WAI-ARIA vertical tabs and keyboard behavior: https://www.w3.org/WAI/ARIA/apg/patterns/tabs/

## Short resume prompt

Continue building the Chairo game center in Angular at `/home/ordson/Documentos/Christian/Chairo`. Read `.impeccable/continuation-implementation.md` first, then the original handoff and Impeccable skill. The Manual de misión / Índice primero comp is already approved; do not ask questions or repeat exploration. Setup, generated assets and authored tests exist, but the actual Angular UI is still absent. Resolve the recorded plates measurement issue, implement the app faithfully, verify mobile/desktop/keyboard/accessibility with pnpm, and finish the independent review and design documentation. Build and verify; do not stop at a plan.
