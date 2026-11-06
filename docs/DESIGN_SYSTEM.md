# MainTend design system

Implemented React + TypeScript UI, not a separate mobile mockup or production-readiness claim. Updated 8 October 2026 to follow `../../design.md`.

## Identity and themes

MainTend combines its geometric M/measurement-line mark with “Vehicle care, informed.” Lucide supplies consistent interface icons. Self-hosted Inter and JetBrains Mono distinguish prose from registration/units/evidence. Tailwind semantic tokens and customised shadcn-style components use Radix for dialogs, tabs and tooltips.

Light is the default: off-white canvas, white panels, teal actions and navy desktop sidebar. Dark Tech uses near-black canvas, blue-grey panels and teal accents. Header and Settings share one saved theme preference. Tokens and compositions live in `styles/globals.css`, `styles/design-system.css` and `styles/workspaces.css`. Amber denotes rule/data attention; violet identifies synthetic projections; green denotes usable data, never fault-free status. Every status has text. Map imagery retains its provider palette.

Themes apply through `data-theme` on the document root. The `maintend-theme` local-storage key stores the preference; unavailable storage does not prevent switching. The initial head script prevents a light/dark flash when reloading. Theme changes do not remount forms or alter database records.

## Layout

- Above 1050 px: 224 px sidebar and multi-column workspaces.
- 681–1050 px: compact icon sidebar, cards adapt to available space.
- Up to 680 px: stacked content and a fixed bottom bar, respecting safe-area insets. Four owner links, five fleet links.
- SVG history charts observe their rendered width so labels remain readable rather than shrinking a fixed desktop graphic.

Fleet Overview has compact metrics/filters and a ledger/map/inspector composition: three aligned panes above 1500 px, two columns below, stacked at 760 px and below. Vehicles uses three/two/one-column directory tiles with registration, mileage, concern actions and a full-records popup. Owner has an identity band, care/attention column, reading/service sidebar and secondary History/Location/Tyres/Equipment & profile tabs. Warnings has current/historical inbox and contextual planning; Maintenance has grouped schedules and exact prediction snapshots. Assessment/export and appearance live only in Settings.

Vehicle identity and generic icons replace oversized dashboard illustrations. Uploaded photos remain user-controlled; original demo imagery stays labelled in profile details. Tyre readings, mileage, service, timestamps, missing measurements and synthetic projections remain distinct. Controls use 44 px minimum targets. Dialogs trap/restore keyboard focus; dirty-close guards and mounted prediction tabs retain drafts. Existing APIs and evidence provenance remain.

## Checks

Run `pnpm typecheck`, `pnpm test` and `pnpm build`. Theme helper tests cover the default, persistence key, blocked storage and reversible switching. Browser checks should cover desktop/tablet/mobile layouts, both themes, owner/fleet navigation and exact-record/export controls. Synthetic data is not real-world validation.

Verified on 8 October 2026: strict TypeScript, production build and 118 automated checks pass. Browser checks cover both profiles/themes, 1617×1244 desktop, 900×900 tablet, 390×844 and 320×740 phones, isolated saves, keyboard dialogs, theme persistence and responsive overflow. Live records were unchanged. See [verification results](TEST_RESULTS.md) and [implementation record](DESIGN_IMPLEMENTATION_V2.md). The non-fatal bundle-size warning remains; checks do not establish full WCAG conformance, usability or predictive accuracy.

Screenshots: `maintend-redesign-fleet-desktop-dark.png`, `maintend-redesign-vehicles-desktop-light.png`, `maintend-redesign-owner-desktop-light.png` and `maintend-redesign-prediction-mobile-dark.png`.
