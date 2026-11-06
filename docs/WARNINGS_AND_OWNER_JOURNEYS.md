# Shared warnings and owner journey history

Updated 6 November 2026. This change addresses the shared warning presentation and lifecycle for FR3 and the selected FR5–FR8 outputs, plus a compact owner journey map. It does not establish full predictive acceptance, live acquisition, compatibility verification or real-world accuracy.

## Warning lifecycle

Selected-function snapshots previously created warning evidence that was always historical in the dashboard. The dashboard now derives current status from the selected decision for each vehicle/function/wheel, its original assessment and required source times. Current observed concerns are labelled **Current condition · synthetic** and have priority over conditional planning forecasts. Replaced records are labelled **Recorded condition** or **Saved forecast**, with an explicit historical explanation. No immutable input or result is rewritten.

- A current concern from the tyre, oil, DPF or capacity evaluator becomes a current recorded-condition warning.
- A supported reference-crossing or attributed oil-service estimate becomes a conditional planning alert.
- A capacity outlook generates a planning alert only when its declared interval approaches or crosses the saved reference. A stable high-capacity outlook alone is not an alert or replacement recommendation.
- Supplementary charging comparison remains separate. A nonpositive margin can generate a planning alert; a present interrupted session remains a current concern. Positive margins do not create warnings.
- Stable, withheld and beyond-horizon evaluations remain retrievable but do not create current warnings.
- A new decision for the same function and wheel replaces the previous decision across fixture/source segments. Different wheel positions remain independent. An unavailable latest decision does not silently restore an earlier alert.
- Changing the saved assessment makes the original warning historical until evaluated again with the applicable context. Source age is checked against the function's own policy, independently of baseline coolant/voltage completeness.

Explicit re-evaluation can select an existing eligible constructed snapshot without duplicating or rewriting it. Selection state and append-only selection history are stored separately. Superseded charging estimates cannot be selected again as current; fresh evidence with a newer revision is required. Failed insertions and failed selection changes roll back without archiving the previous current state.

Current conditions are reflected in the owner's attention area, fleet condition counts and ranking, directory/inspector badges, vehicle signals and fleet map markers. Future selected-function planning alerts are labelled separately and prioritised after current conditions. The use-plan precedence check now recognises these new current conditions; a future forecast alone is not treated as an existing present fault.

## Inspecting the evidence

The warning inbox provides **Open exact decision evidence**. The dialog retrieves the selected snapshot for the scoped vehicle/profile and shows origin, assessment, source time, method, recorded reference and paginated observations. The full saved input/result and selection history remain expandable. Existing action creation, status changes, reported outcomes and separate inspections retain their original links.

`GET /api/vehicles/:id/selected-forecasts/:runId?profile=owner|fleet` retrieves one exact snapshot. A run from another vehicle is not substituted. These are controlled profile filters, not authenticated production account boundaries.

## Owner map

**My vehicle → Last journey** shows a compact street-map preview. Clicking it opens **Journey history** with a larger map and a list of three constructed journeys. The latest completed journey at or before the saved assessment is selected initially. A previous journey can be selected without changing location, mileage, observations or maintenance state. The Location records tab also exposes the journey card alongside the existing recorded-position map.

The seeded latest example runs from City centre to Zografou on 4 October 2026, from 07:10 to 07:50 UTC. Its 33 points produce an approximately 3.6 km geometric trace. Distances are calculated along the illustrative point sequence, not through a verified road router. Source times, starts, finishes and previous journeys are retained in SQLite and JSON/CSV evidence. Journey examples are seeded once for OWNER-001; fleet records are not assigned fabricated owner journeys.

Street tiles use the existing OpenStreetMap source and attribution. The trace is still drawn if street tiles are unavailable, with a visible explanation. The route is not acquired GPS, live tracking, a confirmed driving record or evidence of OBD connectivity. A future real route source would need its own authorised acquisition and validation flow.

## Storage and validation

Additive tables retain function selections/selection history and `vehicle_journeys`. Original warnings, snapshots, actions and measurements are preserved. A SQLite backup was made before updating the running installation: `data/mvp-before-warning-journeys-20261106-1793917949625.sqlite`.

All **174 automated tests** passed, including 13 new warning/journey checks. Type checking and the production build passed. The new checks cover both controlled profiles, current-condition priority and plan precedence, independent wheels, no-alert results, changed assessments, preservation on failed saves, snapshot reselection, journey chronology and distance, idempotent seeding, rollback, exact evidence endpoint scope, and exact retrieval after stopping and starting a real isolated server process.

Browser verification exercised current oil-condition presentation and priority, opening exact evidence, the fleet inbox, restoration of the previous annual oil estimate with the constructed current-condition check retained in history, opening the owner's map and selecting a previous journey. The running local server was restarted with the same database. No claim of full T/O/D/B/E/U acceptance or real predictive performance is inferred from this update.
