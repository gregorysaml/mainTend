# Verification results

## Substantial MainTend workspace redesign — 8 October 2026

Strict TypeScript and production build pass; 118 automated checks pass, with no failures/skips. The non-fatal large-main-chunk warning remains. The supplied `outputs/design.md` is unchanged. The redesign includes three-pane fleet monitoring, compact vehicle directory/records, owner care/readings composition, warning inbox/planning, maintenance layout and dedicated appearance/assessment/export cards. See `DESIGN_IMPLEMENTATION_V2.md`.

Browser verification used isolated in-memory records on port 54190. Both profiles and themes were reviewed. At 1617×1244 the three fleet panes align at the same vertical position; owner readings share two columns. Tablet 900×900 owner/fleet widths are 885/885. Phone primary pages at 320×740 and owner/Settings/prediction flows at 390×844 have no horizontal document overflow. Narrow prediction tabs fit their popup and retain full labels. Four owner/five fleet navigation links plus the Settings utility remain.

Verified shared ledger/text-location selection, empty search results, directory/record overlays, profile equipment save with dirty-close confirmation, warning-linked task save with vehicle identity, separate missing-data strip on Van 03, historical empty inbox, prediction recommendations draft retention and saved service-book task, dialog keyboard trap/Escape/focus return, theme synchronization and reload persistence, owner-scoped evidence links, 203°F→95°C import preview and invalid JSON draft retention. Console checks found no errors. No full WCAG/usability or real-world predictive-accuracy claim is made.

No live forms were submitted. A read-only table/count/SHA-256 comparison confirms `data/mvp.sqlite` exactly matches `data/mvp-before-design-v2-20261008.sqlite`. QA browser-write fixtures were discarded by stopping the verified QA process; the temporary tab was closed and viewport override reset. Live server remains on localhost:3003, with a user-facing preview left open. Actual live map-marker selection was verified to update the corresponding inspector; loaded map tiles and the finished three-pane layout appear in `maintend-redesign-fleet-desktop-light.png`.

Screenshots: `maintend-redesign-fleet-desktop-dark.png`, `maintend-redesign-vehicles-desktop-light.png`, `maintend-redesign-owner-desktop-light.png`, `maintend-redesign-prediction-mobile-dark.png`. QA screenshots can contain deliberately saved QA task/profile entries; these are not live records.

## Bottom-left Settings icon — 7 October 2026

Settings & evidence moved from the header to a single accessible 44×44 px gear link at the sidebar's bottom-left. On mobile it occupies a separate left-hand utility slot alongside the unchanged five fleet/four owner primary links. The sidebar research-demo footer text and its unused styles are removed; the controlled-demonstration notice and evidence provenance remain. Active state, tooltip, accessible name and keyboard-focus outline are retained. No backend or storage changes.

113 automated regressions, strict TypeScript and production build pass; the existing non-fatal bundle-size warning remains. Live browser checks confirmed one Settings link, none in the header, no removed footer text, navigation back to the dedicated settings screen, and active-page indication in both profiles. Desktop 1280×720: link at x24/y644, 44×44 px. Tablet 900×900: compact-sidebar link x16.5/y832. Phone overrides 390×844 and 320×740 had no document overflow; narrow labels wrap within their slots. No console errors, no assessment/settings forms submitted, user tab/theme unchanged, temporary tabs closed and viewport reset. Screenshots: `maintend-sidebar-settings-desktop.png`, `maintend-sidebar-settings-mobile.png`.

## Calculated lubrication on Delivery Van 03 — 7 October 2026

113 automated checks pass, including 20 new lubrication checks and the contemporaneous owner-cooling regressions. Strict TypeScript and production build pass (105 modules). New checks cover all seven cases, derived pressure trend/crossing/error metrics, future-target separation, comparison-context/age/duplicate/noise/physical-horizon gates, scoped APIs, atomic rollback/retry, idempotent selection/notifications, immutable linked tasks/inspection reports, restart persistence, exports and correct vehicle/system popup resolution. Existing cooling tests remain green. Build retains the non-fatal >500 kB bundle warning (524.67 kB JS); it has not been suppressed.

Browser write tests used a separate in-memory server on 54189. Verified the sole fleet lubrication preview on DEM-1003, cooling on DEM-1002 only, and no scenario on DEM-1001. Trend and sudden-anomaly graphs/labels differ correctly; an anomaly withholds prediction. A planned high-priority fleet task with an assigned role refreshed the Van 03 service book; an owner task saved without fleet-only assignment. An old action link opened its original archived lubrication snapshot rather than the newly selected anomaly. Mobile owner popup: document/client widths 390/390, dialog scroll/client widths 372/372, four owner navigation links, no horizontal overflow. Tested console errors: none. Light mobile screenshot: `maintend-lubrication-owner-mobile-light.png`.

Live activation saved one gradual synthetic lubrication example on FLEET-003, snapshot `97267fed-f8ea-4d75-b478-e39572f6e2d0`, calculated −0.30 bar/day and demo-reference crossing seven hours after the saved cutoff. No QA tasks or owner lubrication runs were saved to live storage. The running server already exposed the new API, so no additional restart was required. A consistent activation backup is `data/mvp-before-lubrication-activation-20261007.sqlite`; the earlier pre-change backup is also retained. Row comparisons retained all prior records and all cooling selections; one concurrent settings-history append has identical configuration and is preserved. The only scenario additions are the Van 03 snapshot, selection, notification and linked computed warning. Current measurements/configuration remain unchanged. Live read-only verification opened the correct popup and retained the separate rule-data-gap indicator. Captures: `maintend-lubrication-delivery-van-03.png`, `maintend-lubrication-predictions-popup.png`.

Dark-theme anomaly presentation was also visually checked in the isolated QA workspace (`maintend-lubrication-anomaly-dark-qa.png`): withheld forecast has no dashed forecast legend and is not described as an issued projection. The temporary test theme was restored, viewport reset, verification tab closed and QA server stopped; the user's live tab, theme and running server were left in place.

These checks do not establish real-world predictive accuracy, safe driving, diagnosis, avoided damage, usability or business value. See `LUBRICATION_SCENARIO.md` for method, synthetic evaluation and source limitations.

## Vehicle-header indicators and cleaner mileage labels — 7 October 2026

91 tests pass (86 previous +5 header/source presentation checks), strict TypeScript and production build pass. Pure selectors distinguish current rule warnings, withheld data, current selected cooling demo, outdated settings and explicitly pre-entered forecasts; archived rising trends are never revived. The cooling indicator remains limited to the designated demonstration vehicle. Original mileage provenance is unchanged in storage/exports; user-facing fleet source wording is simplified.

Live read-only verification: Service Van 02 header displays icon links for the current 112 °C condition-rule warning and selected cooling-demo status, using the former empty header space. The cooling link opens the correct Maintenance popup. No `Synthetic fleet entry` text remains in rendered fleet page content, including collapsed profile/mileage presentation. At the user's 1617×1244 viewport the indicators fit side by side; at the 390×844 mobile override document/client widths are 375/375 and all three header content widths are 309/309, with no horizontal overflow. Only one fleet demo preview remains. No console errors in the tested flow; temporary viewport reset and verification tab closed. Screenshot: `maintend-vehicle-header-indicators.png`.

The production build emitted a non-fatal >500 kB bundle-size warning; it completed successfully. No backend/model/schema or live-record changes were made for these UI revisions.

## Single fleet demo vehicle — 7 October 2026

86 tests, strict TypeScript and production build pass. Fleet demo designation is FLEET-002/DEM-1002 only, matching the user's existing saved scenario. New tests ensure other vehicles receive no preview and a missing designation never falls back to another vehicle/profile; owner remains its existing single-vehicle view. Browser verified one Vehicles preview, one Maintenance preview, correct Service Van 02 popup, and fixed read-only demonstration vehicle. Saved records are preserved; verification did not run or save a live example. This restriction is UI assignment, not authentication or an API authorization change.

## Vehicle preview → maintenance popup — 7 October 2026

84/84 automated regressions, strict TypeScript and production build pass (101 modules). Five new pure tests cover encoded fragment navigation and unchanged primary menus, vehicle/snapshot/profile scope, archived exact-evidence resolution, status-specific bounded demo recommendations and changed-setting suppression without rewriting snapshots. Existing calculation/storage tests remain green.

Browser writes used the separate in-memory QA server, not live storage. Fleet and owner preview cards opened Maintenance and the matching native popup. Verified stable/no-run cases, three tabs, planned task creation, immediate Service book refresh, retained draft across tabs, Escape/Close discard confirmation, keyboard focus trap/restoration and Back to Vehicles. Mobile light: client/document widths 390/390 and modal content widths 372/372, four owner bottom links and no horizontal overflow. Desktop dark popup and mobile light graph were visually checked; tested console logs had no errors. Existing Service Van 02 scenario opened correctly in the live app via read-only verification. No backend/schema/model or live-data migration; no real workshop bookings. See `COOLING_SCENARIO.md` for details and captured screenshots.

## Calculated cooling scenario — 6 October 2026

79/79 automated tests pass (65 previous +14 cooling), strict application TypeScript and production build pass (98 modules). Calculation and crossing are derived, not supplied sentences. Checks cover seven scenarios, context/duplicate/invalid/age/fit/horizon gates, no future-target leakage, both profiles, scoped strict APIs, unchanged observations/assessments, idempotent notification/read/selection, rollback/retry, immutable task evidence, reopen/reseed and JSON/CSV exports. See `COOLING_SCENARIO.md` for policy details and synthetic-only performance limitations.

Browser tests ran against a separate in-memory server on 54188. All seven fleet cases matched expected labels/withholding; a fictional task saved and its notification was marked read without changing its condition. Owner projection and task saved; Maintenance displayed the linked cooling concern and existing inspection controls. Dark desktop/light mobile were visually inspected. Revised mobile graph shows history and projection without horizontal scrolling, document/content widths 375/375 px and graph/container widths 309/309 px at the 390×844 viewport override; owner bottom navigation has four links. Captures use QA records: `maintend-cooling-fleet-desktop-dark.png`, `maintend-cooling-owner-mobile-light.png`.

These checks do not establish real-world prediction accuracy, fault diagnosis, safe driving, avoided failures, usability or commercial savings. Lubrication remains pending user review.

Live release: consistent SQLite backup saved to `data/mvp-before-cooling-20261006.sqlite`. The prior server was no longer listening; the updated application was started on port 3003. HTTP root returned 200 with the latest bundle and dashboard returned three fleet/one owner vehicles. Read-only row-by-row comparison against the backup verified every pre-existing table unchanged (including 15 observations, two warnings, five settings-history entries and empty action/inspection tables); new cooling tables are empty. The live browser showed the seven-case selector and initial no-run state with no console errors. QA task/notification records were not copied to live storage. Temporary theme/viewport restored, QA tab closed and QA server stopped.

## Both-profile structured inspections — 5 October 2026

Stage 5 passes 65 automated regressions (58 preceding plus seven inspection checks), strict TypeScript and production build. New checks cover exact types/enums/required text/calendar/UTC/future validation, all three verdicts in both profiles, unchanged tasks/warnings/assessments/input hashes, profile and stale-revision rejection, completed/cancelled semantics, preservation of legacy completion text without deriving a verdict, injected SQLite insert failure and retry, reopen/reseed persistence, backdated correction save order, and real HTTP/evidence routes. Existing Test centre scenario counts are unchanged; these regressions are not predictive-performance or usability measurements.

Browser writes used a separate in-memory QA server. Fleet: confirmed → not confirmed → further investigation yielded three retained history entries. A separately completed task remained visible in the follow-up filter with further investigation; inspection saves did not change its task state. Owner light mobile: future-time rejection retained inspector, notes, selected result and date; correcting the time saved successfully and the report survived browser reload. The owner retained four bottom-navigation links and no horizontal overflow at 390×844 (document/content equal, 375 px before full-page capture and 390 px during capture). No browser console errors in the tested flow. Dark fleet desktop and light owner mobile were visually inspected; screenshots use fictional QA records, not live data: `maintend-inspections-fleet-desktop-dark.png`, `maintend-inspections-owner-mobile-light.png`. Temporary theme/viewport overrides were restored and the QA browser tab was closed. Stage 6 remains pending user review.

Live server restarted on port 3003 after backup `data/mvp-before-inspections-20261005.sqlite`. A read-only row-by-row comparison verified every existing table unchanged (four vehicles, 15 observations, two warnings, five configuration-history entries and existing profiles); the new inspection table is empty. Both dashboard APIs returned the expected three fleet/one owner vehicles. Live actions/history remain empty: start testing by creating a fictional action from a warning. QA server stopped; no QA records were added to the live store.

Edit-button placement revision: all three fleet cards contain exactly one edit button inside the identity header, directly below the mileage box; clicking opens the existing five-form popup. Owner has one edit button after mileage in the hero card, without the former lower-page duplicate. At 390×844, both profiles had equal document/content widths (375 px); no horizontal overflow. Production proof: `maintend-edit-below-mileage-desktop.png`. Checks were read-only; no database writes.

## Vehicle-profile modal revision — 5 October 2026

All 58 existing automated regressions, strict TypeScript and build pass. Browser verification on an isolated QA database checked five simultaneous forms, partial save with another draft retained, dirty-close confirmation through X/Escape, clean Escape, focus restoration, explicit first/last keyboard focus wrapping and restored body scrolling. Owner light popup at 390×844: document/content widths 390 px, dialog width 370 px, five forms present. Desktop fleet popup uses two-column cards with internal scrolling and fixed header/footer. No live database writes or backend changes were needed. Screenshots: `maintend-profile-popup-desktop-dark.png`, `maintend-profile-popup-mobile-light.png`.

## Both-profile editable vehicle profiles — 5 October 2026

Stage 4 passes 58 automated regression checks (50 preceding plus eight profile checks), strict TypeScript and production build (93 modules). Tests cover validation, both-profile section saves/audit provenance, mileage chronology, duplicate times, service consistency, profile scope, stale revision, tyre/DOT/date/number rejection, raster photo constraints/removal, restart/reseed preservation, injected SQLite audit-write rollback/retry and real HTTP/evidence exports. Profile-only edits leave assessment results and assessment-input hashes unchanged.

Browser writes used an isolated in-memory server, not the live database. Owner mileage, service, tyre pressure, equipment and local photo upload refreshed visibly. The existing illustrative demo PNG was used as the upload sample, not a personal image. Fleet mileage, a newly added tyre record and service saves succeeded. Owner light mobile (390×844) had content/document widths of 375 px and four navigation links. Temporary viewport and theme were restored. Proof: `maintend-profile-editor-fleet-dark.png`, `maintend-profile-editor-mobile-light.png`. Live database backup before restart: `data/mvp-before-profile-editor-20261005.sqlite`.

## Both-profile scheduling and vehicle identity — 5 October 2026

Stage 3 passes all 50 automated regression checks (41 preceding plus nine scheduling/identity checks), strict TypeScript validation and production build (89 modules). New tests cover calendar/priority/audit validation; UTC reference-day and inclusive seven-day boundaries; closed-task exclusion; sorting determinism; both-profile schedule/status/history retention; migration and reopening a legacy database with a non-empty task/history; injected SQLite history-write failure rollback for create/status/schedule and retry; evidence fields; HTTP requests; and valid odometer selection.

Interactive writes were verified against a separate in-memory server, not the actual saved vehicle database. Fleet checks covered overdue → due soon, live summary/filter refresh, and mandatory completion outcome; after completion, all open/due counts became zero. Owner checks covered creating a due-today task, preserving date while changing priority/note, reload, mobile reschedule, clearing the date to unscheduled and restoring it. Owner overview displayed its pending plan. No booking, notification, real diagnosis or service-due interval was produced.

The browser revealed a native-date controlled-field issue not caught by backend tests: filling the date and then changing priority could clear the date before submission. Native date fields now retain their own value, which is read from FormData at submit. Both workflows were reverified after this correction.

At 390 × 844, mobile owner retained four bottom-nav links ending at bottom=844 with no horizontal overflow; light/dark layouts and owner editing worked. Real application Vehicles showed plate/model/mileage identity with 121,800 km (DEM-1002), 103,200 km (DEM-1003) and 92,450 km (DEM-1001), explicit synthetic timestamps and a generic illustration. Saved settings and 15 existing observation rows were unchanged after migration; the real database had zero actions/history, so non-empty legacy preservation was verified in the isolated regression test. A pre-migration database backup is retained. Temporary QA server/browser resources are closed after verification.

Screenshots: `maintend-vehicles-identity-dark.png`, `maintend-maintenance-owner-dark.png`, `maintend-maintenance-mobile-light.png`. These results are developer verification, not user acceptance, predictive performance or demonstrated maintenance savings. Stage 4 has not been implemented.

## Fleet filters and dedicated settings page — 5 October 2026

Stage 2 passes all 41 automated regression checks (33 preceding checks plus eight fleet/navigation checks), strict TypeScript validation and production build (81 modules). New checks exercise current-assessment versus historical/forecast warnings, task counts/statuses, combined search, deterministic non-mutating sorting, future/invalid/missing observation handling, absent assessments, owner exclusion, route/navigation definitions and saved action lifecycle refresh. Tests use isolated in-memory databases; no live maintenance tasks or settings were changed.

Browser verification on port 3003 showed full-fleet totals of 3 vehicles, 1 condition-warning vehicle, 1 data-attention vehicle and 0 pending tasks. The warning filter returned Service Van 02 and one map marker; insufficient-data filtering returned Delivery Van 03 and one marker, with the missing coolant/outdated battery explanations and the 29 September eligible measurement visible. Unmatched search and the zero-pending filter showed explicit empty states; reset restored all three vehicles. Oldest-first ordering was Delivery Van 03, Service Van 02, Delivery Van 01. Combined filtering/search and action lifecycle semantics are additionally covered by the automated checks.

The assessment/export panel was absent from Overview, Vehicles, Warnings, Maintenance and Import data, and present exactly once on the dedicated Settings page. The header link identified that page; both owner download URLs contained `profile=owner` after profile switching. Existing settings-save and export API regressions still pass. Settings were not changed merely to verify the relocated form.

At 390 × 844, content width was 375 px, no horizontal overflow occurred, fleet navigation retained five links ending at bottom=844, and owner retained four without fleet controls. The insufficient-data filter worked on mobile. Dark desktop and light mobile were visually checked; temporary theme/viewport changes were restored. Screenshots: `maintend-fleet-filters-dark.png`, `maintend-fleet-mobile-light.png`, `maintend-settings-mobile-light.png`, `maintend-settings-desktop-dark.png`.

The first new non-mutation assertion compared SQLite null-prototype rows with a `structuredClone` that normalized their prototypes; it failed despite equal values. It was corrected to compare serialized input before and after sorting. The final suite passes all 41 checks. These are developer verification results, not user acceptance, predictive accuracy or measured maintenance benefits. Stage 3 has not been implemented.

## Test centre extension — 5 October 2026

The regression suite now has 33 passing tests: the previous 27 plus six evaluation checks. Strict TypeScript validation and production build passed (77 modules). This is the first stage of the user-requested review-before-next-feature sequence.

The browser displayed NOT RUN before any execution, then 11/11 passing fleet checks and 10/10 owner checks. Expected/observed comparisons, no-match filtering, a timestamped developer reviewer note surviving reload, saved-run retrieval and actual JSON/CSV downloads were verified. Reviewer notes explicitly distinguish developer verification from pending user acceptance. Downloads are developer verification artifacts, not thesis results from representative participants.

At 390 × 844, owner navigation remained four links, fixed at bottom=844; content width was 375 px without horizontal overflow and expected/observed panels stacked into one column. Dark desktop and light mobile were visually checked. Viewport overrides were reset. The runner's separate evaluation storage retained reports; live vehicle actions and settings were not altered by scenario execution.

Screenshots: `maintend-test-centre-dark.jpg`, `maintend-test-centre-comparison.jpg`, `maintend-test-centre-mobile-light.jpg`. The separate browser verification tab is closed after testing. See `EVALUATION_CENTRE.md` for evidence boundaries and APIs.

Execution date: 4 October 2026. Environment: Windows, Node.js 24.19.0, pnpm 11.19.0. These tests verify prototype behaviour under synthetic controlled conditions; they do not measure predictive accuracy, usability, real faults or maintenance savings.

| Check | Expected result | Observed result | Result |
|---|---|---|---|
| Three-vehicle fleet | Normal data gives “No current warning”; high coolant triggers the configured rule; missing/outdated data gives “Insufficient information” | All three outputs matched; no normal value was substituted | Pass |
| Invalid import | Unknown vehicle, non-numeric value and missing fields are rejected with reasons | All three records rejected with the expected explanatory category | Pass |
| Fleet action workflow | Planned → in progress → completed; completion requires outcome; vehicle-warning-action links and history retained; warning remains | Three timestamped history rows retained; missing outcome rejected; fictional non-confirmation outcome stored; warning remained active | Pass |
| Private-owner forecast workflow | Simulated forecast remains clearly labelled and chosen response links to it | Label and limitation displayed; completed action retained the forecast-warning link and fictional outcome | Pass |
| Persistence restart | Saved action, timestamps and warning link survive closing and reopening SQLite | Values matched after a new database connection opened the same file | Pass |
| Determinism | Identical observations, configuration and assessment time produce identical output | Deep structural equality confirmed | Pass |
| TypeScript validation | Application source passes strict static checks | `tsc --noEmit` completed with no diagnostics after fixes | Pass |
| Production frontend build | React application compiles into deployable assets | Vite completed; 17 modules transformed | Pass |
| Desktop browser | Fleet view visibly distinguishes normal, warning and insufficient-information cases | Verified in the in-app browser at the production endpoint | Pass |
| Mobile browser, 390 × 844 | Owner forecast label, explanation and action controls remain readable and vertically ordered | Verified at 390 × 844; no horizontal overflow observed | Pass |
| Synthetic location map | Three fleet positions and one owner position are returned from persistent storage and visibly differentiated by condition/data state | Fleet map displayed three markers around Athens; label explicitly stated that positions were simulated and not live GPS | Pass |

## Errors found and corrections

### Import and unit-conversion extension — 5 October 2026

The suite now contains 12 passing automated tests (the initial six plus six import checks). Strict application TypeScript checking and the Vite production build also passed. These results verify ingestion and application behaviour under synthetic conditions.

| Check | Expected | Observed | Result |
|---|---|---|---|
| Supported unit conversion and UTC normalization | 203 °F → 95 °C, 368.15 K → 95 °C, 12600 mV → 12.6 V; source retained | All tested conversions and timezone normalization matched (floating-point tolerance for numeric comparison) | Pass |
| Invalid inputs | Reject malformed rows, incompatible units, non-numeric values, invalid calendar dates and out-of-range converted values | Nine invalid rows rejected individually with reasons; non-array and excessive-size batches rejected | Pass |
| Rule threshold after conversion | 221 °F (105 °C) produces no trigger for the strict >105 rule; 221.018 °F produces a trigger | Exact boundary and above-boundary outcomes matched | Pass |
| Read-only preview and source persistence | Preview writes nothing; saved canonical/source values survive database reopening | Counts unchanged after preview; 95 °C and original 203 °F retrieved after reopening | Pass |
| Actual database write failure | A failure on the second row rolls back the first row and allows retry | Injected SQLite trigger caused rollback; no partial observations; retry succeeded after removal of trigger | Pass |
| Real HTTP API | Preview, mixed acceptance/rejection, saved conversions and fresh dashboard warning | Local HTTP server accepted two rows/rejected one; converted values stored; newly triggered warning returned; malformed JSON returned 400 | Pass |
| Browser import workflow | Preview conversions, retain malformed JSON, then save the example batch | Verified 203 °F → 95 °C and 12600 mV → 12.6 V; malformed JSON remained in input; two observations saved; repeat save disabled | Pass |
| Mobile import navigation | Import form and fifth navigation item remain available without horizontal overflow | Owner form selected OWNER-001; observed content and viewport widths both 375 px in the mobile browser | Pass |
| Bottom mobile navigation and owner menu | Navigation fixed at the screen bottom; owner has single-vehicle links without fleet menu | Sidebar position was fixed, bottom=844 px for an 844 px window; owner links were My vehicle, Warnings, Maintenance, Add readings; zero Vehicles links and zero FLEET MAP labels | Pass |

The browser check appended two synthetic normal observations to `FLEET-001` at the fixed scenario time. It did not replace the source fixture files. Automated checks use isolated temporary databases.

The first TypeScript check identified missing declarations for the SQLite adapter, untyped caught errors, a nullable React root and a possibly absent assessment. Typed declarations, safe error narrowing, a root guard and conditional assessment rendering corrected these issues. The subsequent strict check passed. An earlier development server occupied port 3000 during restart, so the final TypeScript server was independently verified on port 3001; this was an environment/process conflict, not an application-logic failure.

## Reproduction

### History, assessment settings, evidence and vehicle profile — 5 October 2026

The final suite contains 23 passing automated tests (12 preceding checks plus 11 extension checks). Strict application TypeScript validation and the production build passed; the final build transformed 69 modules. Automated tests use isolated temporary SQLite databases, not the user's persisted demonstration database.

| Check | Observed result | Result |
|---|---|---|
| Native UTC datetime input | Minute-only, second and fractional-second values produce valid explicit UTC timestamps | Pass |
| Age boundary and future values | Exactly 48 hours usable; 48 hours + 1 ms outdated; future-only required observations withhold assessment | Pass |
| Historical selection and chart ordering | Later-than-assessment input excluded; same-time higher-ID record selected; chart chronological order and future classification matched | Pass |
| Settings validation and restart | Invalid dates, missing zones, non-positive/non-numeric/excessive age and rule edits rejected; saved configuration/audit survived reopen | Pass |
| Actual configuration write failure | SQLite audit trigger caused rollback of settings and history; retry succeeded | Pass |
| Historical warnings/action links | Stale/normal reassessment removed current flags without deleting the warning, maintenance action or history | Pass |
| Vehicle-profile seed migration | 68,340 km, eight equipment labels, four tyre records and local photo persisted; repeated seed/reopen did not duplicate owner readings or erase an action | Pass |
| Scoped JSON evidence and input hash | Owner/fleet scope, source conversion, action history, synthetic forecast, rejections and settings included; unchanged inputs stable hash, changed configuration different hash | Pass |
| CSV serialization | BOM, uniform columns, quotes/newlines/commas, structured details, tyre/odometer rows and formula-risk string protection verified | Pass |
| Real HTTP endpoints | Settings changed dashboard and import-schema time; scoped JSON/CSV attachment headers matched; invalid profile/format/settings rejected | Pass |
| Browser settings/save/download | Changing assessment to 7 October with 24-hour age limit visibly produced insufficient information; restored 4 October/48 hours; JSON and CSV downloaded via their controls | Pass |
| Browser profile/chart/mobile | Owner photo loaded; battery selector displayed four stored points in V; at 390×844 content and viewport were both 375 px wide, bottom navigation ended at 844 px; viewport reset afterwards | Pass |

The first browser run exposed that a native datetime-local field omits zero seconds after editing. The server correctly rejected that incomplete timestamp. The browser now supplies omitted seconds while explicitly preserving UTC; an automated regression test and the subsequent successful UI save verified the correction. Test saves remain in configuration audit history; the live demo was restored to its original assessment settings.

The desktop profile/history proof is saved as `owner-profile-history.jpg`. The application's live owner endpoint returned one vehicle with 68,340 km, four tyre records and eight observations after restart on port 3003. The sample photo remains explicitly AI-generated/illustrative and all supplied profile values are marked synthetic.

Navigation verification (5 October 2026): clicked Vehicles, Warnings and Maintenance in the browser and confirmed their respective headings and filtered content. Maintenance displayed its empty-state link to Warnings. Reloading retained the Maintenance route. Overview uses the map and full vehicle summary. Navigation uses URL fragments and native links for keyboard and browser-history support.

Run `pnpm typecheck`, `pnpm build` and `pnpm test` from the project root. Test data and the fixed assessment time are versioned in `data/` and `config/scenario.json`.
