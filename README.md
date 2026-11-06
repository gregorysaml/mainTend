# MainTend — Vehicle care, informed.

This is a locally runnable Design Science research prototype for demonstrating vehicle condition checks, simulated forecasts, and linked maintenance-action records. The interface and documentation are in English. Supplied vehicle data, forecast content and inspection outcomes are synthetic; editable profile fields may additionally contain unverified user entries.

Both B2B/fleet and B2C/owner support **Edit vehicle profile**: one popup containing mileage, service, tyres, equipment, photo and change history. Each section saves independently with a change note; other section drafts stay intact. Closing prompts before discarding unsaved changes. Fleet: Vehicles. Owner: My vehicle. See [vehicle-profile editor](docs/VEHICLE_PROFILE_EDITOR.md).

Both profiles now support structured **Reported inspection** on maintenance tasks: concern confirmed, not confirmed or further investigation, with UTC inspection time, reported inspector, notes and append-only history. The inspection/follow-up filter includes completed tasks that still need investigation. Reports do not change warnings or task status and are exported in evidence JSON/CSV. These are unverified user reports, not diagnoses or independent ground truth. See [inspection outcomes](docs/INSPECTION_OUTCOMES.md).

## Interface

**Capabilities & everyday care (SR3):** both profiles have a dedicated navigation entry and per-vehicle shortcuts. The card derives five function boundaries from the recorded configuration and retained source evidence, separates configuration support from current data readiness, and explains age, missing permissions, insufficient history and per-wheel gaps. Refresh and retain the complete disclosure before a proposed purchase/payment or during use; a failed refresh explicitly leaves verification incomplete. Ordinary source, measurement and next-use forms replace the primary JSON editors. Plans resolve a current saved oil estimate on the server, retain its exact link and uncertainty, and reject changed source evidence. All current coverage is explicitly demonstration-only; manual entries never verify real compatibility. See [capabilities and daily use](docs/CAPABILITIES_AND_DAILY_USE.md).

**Current warnings and owner journeys:** selected tyre, oil-service, DPF and EV capacity evaluations now feed the shared warning inbox, vehicle indicators and fleet triage. Present recorded concerns appear before conditional forecasts; replaced or mismatched assessments retain their evidence as history. Open **exact decision evidence** from an inbox record to inspect its source, times, method, readings and saved result. In **My vehicle**, the compact **Last journey** map opens a larger map with three timestamped constructed journeys, start/finish markers and history selection. These are illustrative traces, not acquired GPS or live tracking. See [warning and journey update](docs/WARNINGS_AND_OWNER_JOURNEYS.md).

**One-year history:** open **Predictions → 12-month history** (`http://localhost:3003/?profile=fleet#predictive?system=annual`, or `profile=owner`). The application now retains a separate, deterministic constructed year for each existing vehicle: four wheel-pressure histories, oil-life histories divided by service cycle, and post-regeneration DPF snapshots for diesel demo configurations. The default dataset contains 7,231 readings across the four vehicles, anchored to the saved assessment date (4 October 2025 to 4 October 2026 in this installation). Full-year, 90-day and 30-day views include maintenance boundaries and exact, paginated observations. **Evaluate saved history** uses the stored source records and the latest eligible segment; its evidence can be linked to a fleet assignment or owner response. Original measurements, service-book entries and previous snapshots are retained. No EV traction-battery or charging history is invented for these combustion-engine vehicles. See [annual history](docs/ANNUAL_HISTORY.md).

Predictive examples: cooling stays on **Service Van 02 / DEM-1002**; the second scenario, engine lubrication/oil pressure, is on **Delivery Van 03 / DEM-1003**. Click its Vehicles preview or header indication to open **Maintenance → Predictions → Recommendations → Service book**. The header Predictive controls have separate Cooling/Lubrication tabs; both are supported in the private-owner view. These are bounded calculated synthetic examples, not real diagnoses or engine-failure estimates. See [lubrication scenario](docs/LUBRICATION_SCENARIO.md).

MainTend uses Dark Tech and light themes, shared by Header and Settings. Fleet Overview combines a ledger, map and selected-vehicle inspector; Vehicles uses compact directory tiles and full-record popups. The owner workspace prioritises identity, attention and maintenance, with readings/service alongside and secondary record tabs. Warnings uses a current/historical inbox with contextual planning. Desktop has a sidebar, tablets a compact rail, and mobile bottom navigation; owner navigation excludes fleet pages. See [design system](docs/DESIGN_SYSTEM.md) and [redesign implementation](docs/DESIGN_IMPLEMENTATION_V2.md). Expand **About these records** for the Test centre link and full demonstration limits.

## Test centre

Use **Open test centre** in the demonstration notice, or open `http://localhost:3003/?profile=fleet#evaluation`. Run 11 fleet / 10 owner backend scenarios in isolated in-memory databases, inspect expected versus observed results, append reviewer notes and download JSON/CSV. Reports persist in a separate `data/evaluations.sqlite`; live vehicle records and settings are not changed by scenario execution. See `docs/EVALUATION_CENTRE.md` and the user-review sequence in `docs/FEATURE_ROADMAP.md`.

## Fleet summary and filters

Fleet Overview and Vehicles now have clickable whole-fleet summary cards, combined identity search/status filters, and attention/name/measurement-time sorting. The overview map shows the same matching vehicles as the list. Cards distinguish current rule-warning vehicles, insufficient data and open maintenance tasks; each vehicle shows its latest eligible measurement time and pending-task count. Historical warnings are not counted as current. See `docs/FLEET_FILTERS.md` for exact definitions and limitations.

## Maintenance scheduling

Both fleet and owner profiles support optional task due dates, low/normal/high priority, audited rescheduling, overdue/due-today/next-seven-days indicators and maintenance filters. Due indicators use the saved assessment's UTC calendar day (shown on screen), not the live clock. Open plans appear on fleet vehicle cards and the owner overview; completed/cancelled tasks are excluded from pending/due counts. Vehicle cards now prominently show registration, model and recorded mileage with a timestamp and an explicitly generic vector illustration. See `docs/MAINTENANCE_SCHEDULING.md`.

## Technology choice

The MVP uses React 19 with Vite for the responsive interface, plus Node.js 24 built-in modules (`http`, `node:sqlite`, `node:test`) for the backend. This provides a component-based UI while keeping the server small and the persistent relational database local.

## Run

Requirements: Node.js 24 or newer and pnpm. The repository includes the built frontend in `dist`, so normal execution does not require a development server.

```powershell
cd outputs/vehicle-maintenance-mvp
node backend/src/server.ts
```

Open `http://localhost:3000`. Data is stored in `data/mvp.sqlite` and survives restarts. To use a different database, set `DB_PATH` before starting. To change the port, set `PORT`.

### Run this Windows workspace on port 3003

Open PowerShell and run:

```powershell
cd "C:\Users\grego\Documents\Codex\2026-10-04\automotive-predictive-maintenance-mvp\outputs\vehicle-maintenance-mvp"
$env:PORT = "3003"
pnpm start
```

Open `http://localhost:3003/?profile=owner#overview` for the private-owner view. Keep this terminal open; press Ctrl+C to stop a server started this way. If port 3003 is already in use by this app, use the running app instead of starting a second copy, or choose another port. Do not delete the database to resolve a port conflict.

The built frontend is included. After changing frontend source, run `pnpm build` and reload the browser. Backend changes require a server restart. If dependencies are absent in a fresh copy, install them with `pnpm install --frozen-lockfile` first. This installation step requires internet access; normal local startup does not (except external map tiles).

## Vehicle profile, measurement history and evidence

The private-owner vehicle has synthetic specifications, an illustrative AI-generated photo, equipment, timestamped odometer history and four tyre records. Tyre records include position, size, season, DOT code, installation date/mileage, pressure, tread depth and measurement/rotation dates. These are records, not a safety verdict or recommended pressure. Fleet vehicles have specifications and odometer records; missing tyre records remain explicitly missing.

Each vehicle displays coolant-temperature/battery-voltage history with an exact-record table. Colours distinguish readings within the age limit, outdated readings and readings after assessment time. Lines connect records and are not forecasts. Older synthetic owner readings are added once from `data/owner-history.json`; existing observations and action links are preserved.

Open **Settings & evidence** using the bottom-left sidebar gear (left of the mobile navigation bar) or `#settings` to save the assessment time in UTC and maximum data age. This section and the vehicle-evidence downloads appear only on that dedicated page, not below every screen. Settings and their audit history persist in SQLite and apply to both controlled-demo profiles. Changing settings refreshes assessments without deleting historical warnings or actions. Download JSON or CSV evidence for the selected profile. See `docs/EVIDENCE_AND_VEHICLE_PROFILE.md` for the schema, endpoints, limitations and image provenance.

Run the automated checks:

```powershell
pnpm test
```

For frontend development, install dependencies, run `pnpm build`, and restart the Node server. `pnpm dev` starts Vite on its development port and proxies API requests to the Node server on port 3000.

## Import observations

Use **Import data** for a guided single-observation form or JSON batch/file input. Preview the conversions and rejection explanations before saving. Temperature in °F/K is converted to °C; voltage in mV is converted to V. Source values and formulas are preserved in SQLite and shown in observation details. See `docs/API_IMPORT.md` for endpoints, payloads and transaction behaviour, and `data/import-unit-conversions.json` for a mixed test fixture.

## Project architecture

| Folder | Responsibility |
|---|---|
| `frontend/` | React + TypeScript interface, API client, components and styles |
| `backend/src/` | Typed HTTP/API composition and deterministic domain rules |
| `shared/` | Contracts shared between browser and server |
| `lib/` | SQLite persistence adapter; kept as JavaScript because Node's built-in SQLite API remains experimental |
| `data/` | Synthetic source datasets and persistent SQLite database |
| `config/` | Reproducible scenario and rule configuration |
| `test/` | Functional and persistence tests |
| `docs/` | Thesis-facing technical documentation and observed results |

## Scope and limitations

The initial private-owner current warning is the gradual-deterioration coolant demonstration, with its own calculated snapshot and graph. Startup applies this default once per database. The older charging-system forecast remains in historical records, and later scenario selections are preserved across restart.

Implemented: fleet and owner views; synthetic observations; validation and rejection reasons; missing/outdated-data handling; deterministic configurable rules; separate data and condition labels; pre-entered simulated forecasts; warning evidence; maintenance actions, four statuses, required completion outcome, history and persistent links. The **Predictive maintenance** utility has separate cooling and lubrication tabs, each with calculated bounded comparable-session projections, responsive graphs, seven synthetic cases, retained in-app notifications, immutable snapshots and held-out fixture evaluation against a keep-last-value baseline. These fixture-specific results are not real-world predictive accuracy.

Not implemented: production authentication or customer isolation, external messages/bookings, workshop sharing, payment processing, live telematics/manufacturer connections, OBD hardware, trained forecasting models or a native mobile application. Demo profile selection is not evidence of secure account isolation. No real-world predictive accuracy, usability, savings or market acceptance is claimed.

For the main flow, open **Vehicles** (fleet) or **My vehicle** (owner) and select a cooling preview. It opens **Maintenance** with a **Predictions → Recommendations → Service book** popup. Service book contains recorded service/task history, not external workshop booking. Header demonstration controls remain at `http://localhost:3003/?profile=fleet#predictive` or `?profile=owner#predictive`: select **Gradual deterioration** and **Run cooling example**, then compare other cases. Detailed research evidence is collapsed by default. Primary mobile-navigation counts are unchanged. Runs use saved assessment time/data age, not the live clock; vehicle measurements remain unchanged. See `docs/COOLING_SCENARIO.md`.

## Storage-failure behaviour

The fleet cooling demonstration is assigned only to **Service Van 02 (DEM-1002)**. Other fleet vehicles do not show demo previews; the demo vehicle field is fixed. Existing records are retained and the single-vehicle owner view remains supported.

The API returns a clear error and the browser form is not reset when saving fails. For a controlled demonstration, sending `simulateFailure: true` with `POST /api/actions` produces the failure response without creating a record.
