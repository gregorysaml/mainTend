# Calculated cooling scenario — 6 October 2026

## Private-owner default warning — 7 October 2026

Local application startup now applies `owner-cooling-warning-v1` once: the owner vehicle receives the same gradual-deterioration synthetic cooling scenario used for the fleet example, calculated with the saved assessment settings. The snapshot and warning belong to `OWNER-001`; fleet snapshots are not reassigned. The earlier charging-system forecast remains stored as historical evidence with its original title, source and action links, but is no longer a current warning. Measurements are preserved. Subsequent restarts retain the user's selected cooling scenario instead of restoring the initial example. The replacement is transactional and retains an application timestamp in `demo_extensions`.

Verification: 16 relevant cooling/replacement tests and strict TypeScript validation passed. Tests confirmed scoped warning replacement, preserved action links and observations, unchanged fleet records, idempotency, preservation of a later stable selection, and rollback on an injected archival failure. This verifies demonstration behaviour using synthetic inputs.

## One fleet demonstration vehicle — 7 October 2026

At the user's request, only **Service Van 02 / DEM-1002 / FLEET-002** has a cooling demo preview in fleet Vehicles, Overview and Maintenance. Demonstration controls use a read-only vehicle field fixed to that vehicle, rather than a fleet-wide selector. Other fleet vehicles retain normal condition/task/profile records without empty demo cards. The existing single-vehicle owner workspace remains available. The shared presentation helper never substitutes another vehicle if the designated example is missing. This is a UI/demo-assignment policy, not a new backend access-control restriction; existing saved snapshots, task links and reports are retained, not deleted or moved.

86 automated tests pass (84 previous +2 designation/non-fallback checks), strict TypeScript and production build pass. Live read-only browser verification found exactly one cooling preview in Vehicles and one in Maintenance, opening Service Van 02, and a read-only `DEM-1002 · Service Van 02` demonstration field. No console errors or live data writes. Capture: `maintend-single-fleet-demo.png`.

## Cleaner maintenance entry flow — 7 October 2026

Vehicle cooling cards are now compact clickable previews with registration, status and a decorative history/projection sparkline. Fleet Vehicles collapses supporting condition/task/profile records by default; owner My vehicle uses the same preview. Clicking navigates to `#maintenance?vehicle=...&run=...` and opens a native modal, not the demonstration workspace. Snapshot links from warnings, notifications and tasks use the same flow. Unknown/wrong-profile vehicle or snapshot references are rejected rather than opening a different vehicle.

The popup separates **Predictions**, **Recommendations** and **Service book**. Predictions shows bounded crossing/trend, responsive chart and collapsed model/evidence information. Recommendations are status-specific demo next steps, not diagnoses or automatic repairs; missing/stable/archived or changed-settings cases do not offer a new inferred task. Current trend/anomaly/data-quality cases can create an explicitly user-selected task linked to the exact snapshot. Service book is the recorded last-service value, service-record correction audit and all vehicle task/status/outcome/inspection history, not a verified workshop certificate or external booking. No new service-history database or external service integration was introduced.

Demonstration controls remain at `#predictive`; detailed research evidence is collapsed by default. Popups lock background scrolling, support Escape/Close/Done and trapped keyboard focus, restore focus, and retain task drafts across tab changes. Unsaved close/reload has protection; saving locks fields/tabs/close and refreshes service-book records. Technical details/evaluation remain available without dominating the main flow. Primary bottom navigation remains five fleet/four owner links. Existing computed results, model policies and backend schema/API remain unchanged.

84 automated regressions pass (79 previous +5 navigation/scope/advice tests), strict TypeScript and production build pass (101 modules). Isolated browser QA verified vehicle → Maintenance → exact popup, stable/no-snapshot states, prediction/recommendation/service flow, linked task save and immediate service-book refresh in both profiles, retained drafts/close confirmation, Escape, focus wrapping/restoration, Back navigation and original snapshot links. At mobile 390×844: document/client widths 390/390, modal/content widths 372/372; no horizontal overflow, four owner navigation links. Dark desktop and light mobile screenshots visually checked; console errors absent in tested flows. Live verification was read-only and opened the existing Service Van 02 snapshot; no QA records were added. Temporary theme/viewport restored and test tab/server closed. Captures: `maintend-maintenance-predictions-popup-dark.png`, `maintend-maintenance-popup-owner-mobile-light.png`, `maintend-vehicle-cooling-previews-dark.png`.

## Scope

Both fleet/B2B and private owner/B2C can run isolated synthetic examples at `#predictive`, via header or vehicle cards. Mobile primary navigation counts stay unchanged. This is a calculated comparable-session projection, NOT live telemetry, an engine thermal model, trained/validated failure prediction, RUL, diagnosis or safe-driving assessment. It does not predict a particular pump/thermostat failure. Lubrication is pending.

Existing observations, imports, condition checks and records remain separate. Ordinary coolant/voltage imports lack RPM/load/ambient context and are NOT silently used by this model. No real-vehicle forecast is inferred from them.

## Model and fictional assumptions

Version `cooling-comparable-linear-v1`: ordinary least squares of comparable-session coolant °C versus UTC hours relative to saved assessment cutoff. The settings supply cutoff/latest-reading maximum age only; existing condition-rule limits are unchanged. Older historical samples can be used; freshness governs the latest comparable sample.

Fictional comparison window: warmed-up engine, 2000 ±100 rpm, 45 ±5% load, 25 ±2 °C ambient. Healthy reference 96 °C; demo comparison reference 105 °C. At least four distinct comparable readings over 48 hours; maximum adjacent step 6 °C and fit RMSE 1.5 °C. These are prototype policy choices, NOT OEM or safe-driving limits.

Invalid/future/context-mismatched readings are excluded. Duplicates, insufficient span/count or stale latest readings withhold forecasting; stale readings cannot establish a current anomaly. Fresh latest readings at/above the demo reference produce a current anomaly without extrapolation. Large steps/noisy fits also withhold. Eligible projections cover +72 hours only; rising slope >0.01 °C/hour is labelled deteriorating, otherwise no adverse trend detected (never fault-free). Reference crossing is displayed only inside the bounded horizon. No calibrated confidence interval or invented failure probability.

Seven deterministic fixtures: gradual, stable, abrupt, too few, stale, conflicting/noisy, different context. They are artificial teaching cases, not realistic run-to-failure validation. Changing age settings regenerates the stale fixture to remain stale. Fixture/model policy changes require a version bump; stored snapshots are not recalculated.

## Graphs and evaluation

Solid teal: historical comparable synthetic sessions. Dashed purple: calculated projection. Orange: fictional demo reference. Vertical cutoff separates historical inputs from future. Optional open circles are explicitly future synthetic evaluation targets, not already observed telemetry. Mobile has a compact full-width relative-hours graph; desktop UTC timestamps. Exact UTC/context/exclusion/target data is available in the evidence table.

Four held-out synthetic targets at +12/+24/+48/+72 hours are used ONLY after fitting to calculate mean absolute error (MAE), versus a keep-last-value baseline. Synthetic warning lead time is cutoff to the first held-out sample meeting the reference, reported only if a crossing is projected and observed in held-out fixtures. It is NOT time to breakdown or proof of avoided failure. Withheld forecasts have no error/lead metrics.

Designed gradual fixture: 2 °C/day, computed crossing cutoff +11 h, forecast MAE 0.150 °C versus baseline 3.333 °C, fixture warning lead 12 h. These values are properties of deliberately designed synthetic data, not real-world accuracy, independent ground truth, generalisation or maintenance savings. The prior Test Centre remains the functional suite; cooling provides its own synthetic forecast/baseline comparison.

## API, storage and workflow

`POST /api/cooling/runs` accepts exactly `{profile, vehicleId, scenario}`. Configuration/fixtures/results are server-owned; arbitrary user results/readings are rejected. Invalid inputs/profile mismatch return 400. One transaction saves the immutable snapshot, per-vehicle selected pointer and, for non-stable statuses, warning/unread in-app notification. Stable runs are retained without warning.

Same vehicle/model/scenario/settings/input hash reselects the original run without a duplicate warning/notification or modified save/read time. Warning current status requires the selected run AND matching cutoff/age settings. Other evidence is historical. Viewing history does not select it; rerunning selects it. Model snapshots block UPDATE/DELETE. A settings change does not rewrite prior decision evidence.

`POST /api/cooling/runs/:id/read` accepts exactly `{profile}`; read acknowledgement is idempotent and separate. It does not clear a condition, complete a task or alter evidence. Unread badge counts all retained unread notices for the profile, including archived notices. No OS/browser push, email, SMS, external messages or bookings. Profile filtering is not production authentication.

Existing user-selected scheduling/priority/inspection workflows link a cooling task to its exact run-warning, including archived evidence. Data-quality alerts may need new measurements, not repair. Maintenance links return to the original graph/snapshot. Inspection outcomes are unverified reports, not independent predictive ground truth or automatic warning resolution.

Settings JSON/CSV evidence includes all scoped cooling snapshots/configuration/inputs/targets/results and separate selection/read state. Per-run input SHA-256 covers configuration/vehicle/scenario/historical fixtures, excluding future targets/read/actions. Overall evidence input hash additionally covers run identities/input hashes/selection, not read/task/inspection mutations. It is not a hash of the entire mutable report.

## Verification and user review

79 automated tests pass: 65 previous +14 cooling, covering computation, seven statuses, cutoff/held-out leakage exclusion, context/invalid/duplicate handling, age/fit/horizon gates, payload validation, both profiles, unchanged vehicle observations/assessments, deduplication/reselection/read, scope/exports/immutable task links, injected rollback/retry, reopen/reseed and real HTTP. Strict application TypeScript and production build pass (98 modules).

Browser verification uses a separate in-memory server at port 54188, not live data. All seven fleet cases, task creation, read acknowledgement, owner projection/task and inspection concern link verified. Dark desktop/light mobile visually inspected. At 390×844 override, observed client/content widths are 375 px with no page overflow; compact graph fits a 309 px container, owner bottom navigation retains four links. QA captures: `maintend-cooling-fleet-desktop-dark.png`, `maintend-cooling-owner-mobile-light.png`. Restore temporary theme/viewport, close QA tab/server after testing.

User checklist: run Gradual; compare Abrupt (no forecast), Too few/Outdated/Conflicting (withheld), Different conditions (inspect exclusion); repeat identical inputs (no duplicates); create task and follow original snapshot; change settings (prior warning historical); export evidence with historical and future targets clearly distinct. Do not implement lubrication until user requests the next scenario.
