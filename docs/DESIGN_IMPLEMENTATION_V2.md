# MainTend design-system implementation v2

Date: 8 October 2026

Reference: `../../design.md`. That supplied specification remains unchanged. This is an implementation record, not a production-readiness or usability claim.

## Implemented

- React/TypeScript/Vite retained. Tailwind 4 uses the current Vite integration, rather than the older `@tailwind` directives shown in the reference. New UI dependencies are pinned in the package manifest and lockfile.
- Customised shadcn-style components live in `frontend/src/components/ui`: button, badge, card, dialog, tabs, table and tooltip. Dialog, tabs, slot and tooltip behaviour uses Radix primitives. `components.json` and the `@/` alias support future component additions.
- `components/layout` owns shared header/sidebar and theme state; `components/telematics` contains recorded-reading cards; `features/owner` contains the owner dashboard. Existing fleet, maintenance, predictive and vehicle-editor features remain separated. `types/telematics.ts` re-exports canonical contracts instead of duplicating them.
- `styles/globals.css` contains HSL semantic tokens, both themes, Tailwind mappings, locally served Inter/JetBrains Mono and shared component rules. `styles/design-system.css` supplies the v2 screen compositions. Compatibility aliases keep remaining feature styles on the same tokens.
- The supplied HEX palette is the reference for the light-theme HSL conversions: some supplied CSS-example HSL values do not match their HEX comments. Dark Tech has a separate readable palette. Teal identifies actions; amber identifies demonstration-rule attention; violet identifies synthetic projections; green indicates usable data/no rule alert, never a fault-free claim.
- Fleet Overview has a compact summary ribbon and filters above a ledger/map/inspector workspace. Above 1500 px the three panes align side by side; narrower desktops put ledger/map alongside the inspector, and phones stack them. Selection is shared across ledger and map/text locations, and constrained by filtering. Vehicles now uses compact three/two/one-column directory tiles with registration, mileage, contextual concern actions and a full-records popup, replacing the long card list.
- Owner Overview has a full-width identity/mileage band, a primary attention/prediction/maintenance column and a recorded-readings/service sidebar. History, Location, Tyres and Equipment & profile are secondary record tabs. Calculated concerns link to exact Maintenance snapshots. Uploaded photos remain user-controlled; no replacement photo was invented.
- Warnings is a current/historical inbox with contextual evidence and a vehicle/warning-specific planning dialog. Separate rule-data gaps remain visible even when a synthetic projection exists. Maintenance has a summary ribbon, prediction previews and grouped schedule records. Assessment/export remain only in Settings beside appearance controls. The new screen compositions are in `styles/workspaces.css`.
- Profile and prediction overlays use Radix dialogs. Prediction tabs use Radix tabs; hidden mounted panels retain drafts. Existing save locks, dirty-close confirmations and exact snapshot/vehicle context remain. Available assigned-role context appears on the prediction workflow; no driver identity is invented.
- Settings includes a Light/Dark Tech selector sharing state with the header toggle. The `maintend-theme` preference persists locally, handles unavailable storage and syncs across tabs. Theme changes do not save assessment settings or alter database records.
- Shared controls have 44 px minimum targets; mobile bottom navigation and the bottom-left Settings gear remain. Statuses include text and icon/colour coding. Charts retain exact reading/evidence tables and recorded-versus-projected labels.
- Import, assessment/export, maintenance, reported inspections and Test centre retain their existing APIs and validation. Core forms now reuse the shared button component. Font MIME types were added to the actual HTTP server. No vehicle schema or predictive algorithm was changed.

## Scope boundaries

This is still a controlled research prototype. Live CAN-bus/GPS/WebSocket telemetry, trained failure models, real driver communication, automatic dispatch and SMS are not added by a UI redesign. Hardware-warning styling is used for **condition rules on recorded demo inputs**, not falsely labelled ECU hardware evidence. Reported inspections remain unverified reports. Synthetic projections are not component diagnoses, failure probabilities, RUL or safe-driving assessments.

## Verification status

Strict TypeScript and production build pass. All 118 regressions pass, including models/storage/APIs, warning provenance and inbox scoping, filtered ledger selection, units and self-hosted font/bundle delivery. The suite used `node --test --test-concurrency=1 --test-timeout=30000 test/*.test.ts`. Builds still emit a non-fatal large-main-chunk warning; Import, Test centre and Predictive workspace are split out. The warning has not been suppressed.

Rendered checks used an isolated in-memory server and covered both profiles/themes, desktop 1617×1244, tablet 900×900, phones 390×844 and 320×740. Tested primary pages at 320 px had matching document/client widths. Verified ledger/text-location selection, empty filters, record popup, profile save/dirty guards, warning-linked task save, prediction draft retention/service-book refresh, keyboard focus trapping/restoration, theme reload persistence, scoped evidence links and import conversion/invalid JSON retention. Console checks found no errors. The owner reading-grid and narrow prediction-tab fixes were rechecked after rebuilding.

Browser writes were confined to disposable QA records. Read-only table/count/SHA-256 comparison confirmed live `data/mvp.sqlite` unchanged from `data/mvp-before-design-v2-20261008.sqlite`. Live preview runs on localhost:3003. See `TEST_RESULTS.md` for screenshots and verification. These checks are not a full accessibility audit, user study or predictive-accuracy validation.

## Primary setup references

- [shadcn Vite integration](https://ui.shadcn.com/docs/installation/vite)
- [Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite)
- [Lucide React](https://lucide.dev/guide/react)

These references guided the library integration, not claims of measured usability or full accessibility conformance.
