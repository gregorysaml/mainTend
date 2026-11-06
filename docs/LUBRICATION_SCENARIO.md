# Calculated lubrication demonstration — 7 October 2026

## Placement and workflow

The user designated **Delivery Van 03 / DEM-1003 / FLEET-003** for scenario 2. Cooling stays on **Service Van 02 / DEM-1002**; no scenario is assigned to Delivery Van 01. The owner workspace supports lubrication on OWNER-001 with its own scoped snapshot, never a reassigned fleet snapshot. Designation helpers never fall back to another vehicle when the designated record is missing. This is a UI demonstration policy, not authentication or an API authorization boundary.

Vehicles and Overview show a compact lubrication preview plus a header icon/status for the current selected matching snapshot. Rule-data gaps remain separate and visible. Clicking opens Maintenance with the shared **Predictions → Recommendations → Service book** native popup for that vehicle, system and exact snapshot. Recommendations suggest verification/assessment, not diagnosis, parts replacement, automatic task completion or external booking. A planned action links to the immutable warning/snapshot; the existing scheduling, status and append-only reported-inspection workflow applies. Service book reads existing records, not verified workshop certificates.

The header Predictive utility opens two system tabs, not additional primary-navigation destinations. Lubrication controls use a fixed demonstration vehicle and seven cases: gradual decline, stable, sudden anomaly, too few readings, stale readings, noisy fit and different operating context. Notification acknowledgements are in-app only, do not resolve conditions, and are retained separately for archived examples. A warning/notification is emitted once per unique non-stable input snapshot; stable examples do not generate a new warning. All snapshots export through the dedicated Settings evidence report in JSON and formula-safe CSV.

## Model and synthetic fixture boundaries

Method: **lubrication-comparable-linear-v1**, ordinary least squares of oil pressure (bar) against time relative to the saved UTC assessment cutoff. This is a calculated illustrative projection, not trained ML, live telemetry, an oil-life model, RUL, engine-failure time, calibrated probability or safe-driving verdict.

The fictional comparison window requires a warmed-up engine, **2000 ±100 rpm**, **45 ±5% load**, and **90 ±3 °C oil temperature**. The illustrative baseline is **3.2 bar** and lower comparison reference **2 bar**. These are invented demonstration settings, not manufacturer limits for the represented vehicles. No oil-level, viscosity, contamination, wear-particle, pump, bearing or sensor-fault diagnosis is inferred.

Eligibility: only valid readings at/before cutoff; duplicate comparable instants withhold prediction. Latest age must be within the saved inclusive maximum-age limit. A fresh comparable reading ≤2 bar produces a **current demo anomaly**, not a successful advance prediction, and suppresses extrapolation. Otherwise at least four distinct sessions over 48 hours are required; adjacent steps above 0.8 bar, fit RMSE above 0.12 bar, or extrapolation outside 0–12 bar withhold the forecast. Missing/stale/noisy/context-ineligible data never imply a fault-free vehicle.

A slope below −0.003 bar/hour is labelled deteriorating. The projection horizon is bounded to 72 hours. A reference crossing is reported only inside that horizon, under continued linear behaviour and unchanged operating conditions. It is not a recommendation to keep driving until that time.

Gradual fixture: six daily sessions ending one hour before cutoff, pressures **3.6, 3.3, 3.0, 2.7, 2.4, 2.1 bar**. It calculates **−0.30 bar/day** and a crossing approximately **7 hours after cutoff**. Four future synthetic evaluation targets at +12/+24/+48/+72 hours never enter fitting, eligibility, current-condition status or the input hash. Forecast MAE is **0.015 bar** on these deliberately designed targets versus the keep-last-value baseline; the first target crossing gives **12 hours synthetic warning lead**. These numbers do not establish real-world accuracy, avoided engine damage, maintenance savings or generalisation.

## Persistence and API

`shared/lubrication.ts` defines typed contracts and labels. `backend/src/predictive/lubrication.ts` owns deterministic fixtures, pure calculation and transactional snapshot storage. Additive `lubrication_runs` (update/delete blocked), `lubrication_selection` and `lubrication_notifications` preserve all existing cooling/measurement/action records. A per-vehicle configuration/scenario/historical-input hash deduplicates selection, warnings and notifications; reading an alert never resets or mutates decision evidence. Failure during any insert rolls back the entire save.

- `POST /api/lubrication/runs`: exact `{ profile, vehicleId, scenario }`, profile/vehicle checked.
- `POST /api/lubrication/runs/:id/read`: exact `{ profile }`, scoped and idempotent.
- Dashboard/evidence include `lubricationRuns`; CSV includes `computed_lubrication` records in bar.
- Changed saved assessment time/data age makes old warnings historical, without rewriting linked evidence or creating a new recommendation.

## Sources and interpretation

[MathWorks condition monitoring and predictive maintenance workflow](https://www.mathworks.com/help/predmaint/gs/designing-algorithms-for-condition-monitoring-and-predictive-maintenance.html) distinguishes monitoring from prediction and discusses operating-condition data. It does not validate this app's artificial oil-pressure fixture or numerical settings.

[Ford owner-manual oil-pressure warning guidance](https://www.fordservicecontent.com/Ford_Content/vdirsnet/OwnerManual/Home/Content?ProcUid=G2489838&Uid=G2489836&buildType=web&countryCode=USA&div=f&languageCode=EN&userMarket=BHS&vCode=&vFilteringEnabled=False&variantid=10878) treats an actual warning while the engine is running as requiring a stop/engine-off response. This prototype therefore never uses a projected reference-crossing time to authorize continued operation or to downgrade a real warning into a routine oil-change task. For a real vehicle follow its own manual and qualified assistance; the fictional numerical reference is not that manual's limit.
