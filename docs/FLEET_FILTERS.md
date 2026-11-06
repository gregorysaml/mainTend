# Fleet summary and filters — stage 2

Available on `?profile=fleet#overview` and `?profile=fleet#vehicles`. Owner pages do not render fleet controls. The overview map and vehicle list use the same filtered set; the Vehicles page shows the list without the map. An empty result shows a reset action instead of an unfiltered map.

## Definitions

- Vehicles monitored: total fleet vehicles in the dashboard response.
- Condition warnings: number of vehicles with one or more current assessment rule triggers, not number of individual warning records. Historical warnings and pre-entered forecasts are excluded.
- Data attention: vehicles with insufficient information or an unavailable assessment. Missing information is not interpreted as a normal condition.
- Pending actions: count of planned and in-progress tasks, with the number of affected vehicles. Completed and cancelled tasks are excluded. Tasks linked to historical warnings can still be pending.

The four summary cards are clickable filter shortcuts and always show whole-fleet totals, even during a filtered search. Search is trimmed, case-insensitive and matches vehicle name, registration, ID or make/model. It combines with the chosen status filter. The additional “usable data / no condition warning” filter does not imply the vehicle is fault-free and does not exclude pending tasks.

Attention-first ordering puts current condition warnings first, then data gaps, then pending actions, then other vehicles. This is a fixed presentation order, not a predicted failure-risk score. Other sorts are name, latest eligible measurement first, and oldest/missing measurement first; missing readings sort first for oldest and last for latest. Name and vehicle ID resolve ties. Filtering/sorting does not modify saved records or input arrays.

Each vehicle displays its newest eligible measurement time, age relative to the saved assessment time, count of excluded later readings, pending task count, and assessment-data status/gaps. “Latest eligible” means any recorded measurement at or before assessment, not that every required parameter is fresh. The backend assessment remains authoritative for data sufficiency. Invalid timestamps are not selected; equal timestamps use the higher observation ID.

Filters are local screen state, not saved fleet preferences. Action saves refresh the dashboard and derived counts. Summary cards are not evidence of a live telemetry connection, diagnostic accuracy or predictive maintenance.

## Dedicated settings page

The header settings icon/link opens `#settings` for either profile. Assessment settings and vehicle-evidence JSON/CSV exports render only on this page, not below overview, vehicles, warnings, maintenance, import or the test centre. The section is directly visible rather than hidden in a disclosure. Shared demo settings, persisted configuration history and profile-scoped exports retain their existing backend behaviour. Test-centre run exports remain in the Test centre because they are different reports.

The settings utility does not add another item to mobile bottom navigation: fleet retains five items, owner four. The header link indicates the current settings page and stays accessible at compact widths.

## Architecture and verification

`frontend/src/features/fleet/selectors.ts` contains independently tested pure derivation/filter/sort functions. `FleetWorkspace.tsx` and `fleet.css` handle controls, summary, map coordination and record presentation. `frontend/src/navigation/pages.ts` owns route parsing and profile-specific primary-navigation definitions. No database migration, new dependency or backend route is required.

Eight added automated checks cover summary semantics, pending statuses, combined searches, deterministic non-mutating ordering, future/invalid/missing readings, absent assessments/owner exclusion, settings-route/mobile-nav definitions, and real saved action lifecycle refresh in an isolated in-memory database.

Developer browser verification: summary 3 vehicles / 1 current condition-warning vehicle / 1 data-attention vehicle / 0 pending tasks in the existing saved demo; warning and data filters each yielded the matching single vehicle and one map marker; unmatched search and pending filter yielded clear empty states; oldest-first ordering matched recorded times; settings panel absent from all five primary fleet pages and present once on Settings. Owner exports retained owner scope. At 390 × 844 the bottom navigation and controls worked without horizontal overflow in dark/light layouts; owner retained four links and no fleet filters. No live settings or maintenance tasks were changed by these checks. User acceptance testing remains pending.
