# One year of constructed predictive-maintenance history

MainTend now stores one calendar year of additional, explicitly synthetic history for each existing demo vehicle. The history is available from **Predictions → 12-month history** in both profiles. It is separate from ordinary observations and the reported service book. It does not establish real vehicle coverage, acquired OBD/OEM data or predictive accuracy.

## Dataset

The `annual-constructed-v1` dataset is anchored once to the saved assessment time when the updated server first starts. In this installation the period is 4 October 2025 through 4 October 2026, ending at 09:00 UTC. Both endpoints are included. Leap years and a 29 February endpoint are handled explicitly.

| Vehicle | Readings | Signals |
|---|---:|---|
| FLEET-001 | 1,815 | Four wheel-pressure histories, oil life, post-regeneration DPF |
| FLEET-002 | 1,815 | Four wheel-pressure histories, oil life, post-regeneration DPF |
| FLEET-003 | 1,815 | Four wheel-pressure histories, oil life, post-regeneration DPF |
| OWNER-001 | 1,786 | Four wheel-pressure histories and oil life |
| Total | 7,231 | All constructed fixtures |

Pressure is sampled daily under a fictional comparable cold-pressure protocol, with small deterministic variation, occasional missing days and inflation boundaries every 80 days. Wheel identity is retained. Oil life is sampled against a constructed, cumulative odometer, with separate service cycles every 140 days. These fictional odometer values do not edit the vehicle's recorded mileage. DPF history contains comparable post-regeneration snapshots approximately fortnightly, with flow in g/s, temperature in Celsius, a cleaning boundary and an explicit latest snapshot. A regeneration label is fictional evidence, not a real confirmed event.

References, fitted trends, uncertainty bounds and horizons are fixture assumptions. Oil-pressure and oil-level signals are not substituted for oil life. The petrol owner vehicle receives no diesel DPF history. No traction-battery health or charging-session histories are generated for the existing combustion-engine vehicles.

## Evaluation and presentation

The year is displayed as context. Fitting uses only the latest eligible wheel/intervention or service segment. Lines stop at cycle boundaries. Historical segments remain visible but do not enter the current fit. The exact-observation table has pages of 40 readings. Full-year, 90-day and 30-day controls change only the visible history, not the saved input or fitting window.

The existing selected-function evaluator checks units, provenance, source age, context, history span, fit and applicable boundaries. A changed assessment does not regenerate source times. Stale data or source observations after the selected assessment withhold a result. A year of data cannot override an ineligible current segment. Results report reference-crossing distance or time only when supported within the declared horizon; current concerns and beyond-horizon outputs retain their meanings. Results and input hashes are saved through the existing forecast persistence path. Different wheels retain independent current results.

The annual page supports a directly linked fleet assignment or owner response. The standard Maintenance workspace retains status, outcome and reported inspection separately. JSON/CSV evidence exports include the annual source history and selected-function runs.

## Persistence and API

`annual_histories` stores one JSON snapshot per vehicle and dataset version, its SHA-256 and creation time. Creation is transactional and idempotent. Restarting or changing the assessment does not overwrite the source snapshot. No existing observations, actions or reports are deleted. The updated server calls the additive seeder on startup; ordinary test `Store.seed()` behaviour is unchanged.

- `GET /api/vehicles/:id/annual-history?profile=fleet|owner` retrieves the stored dataset.
- `POST /api/vehicles/:id/annual-history/evaluate?profile=fleet|owner` accepts `{ "seriesId": "oil" }` or a wheel/DPF identifier and evaluates the server's saved series.
- `simulateFailure: true` exercises transactional failure when a new result would be written.

These are demonstration profile filters, not production authentication or customer isolation.

## Executed verification on 5 November 2026

The complete automated suite passed: **161 tests, zero failures**. Type checking and production build passed. The eight additional annual-history tests cover calendar span/leap years, reproducibility, independent wheel identities, declared gaps, fitting only the current segment, freshness/context/boundary withholding, additive and idempotent persistence, a failing seed transaction, HTTP access and linked actions in both profiles, and exact retrieval after stopping and starting a real isolated server process with the same databases.

Browser checks on the running installation exercised both profiles: annual-history display, saved-history evaluation, creation and retrieval of a linked response in Maintenance, and a saved completion outcome explicitly describing a constructed review. The owner's 90-day filter was also exercised. The default fleet front-left case displayed a conditional crossing after approximately 21.769 days; the owner's oil case displayed approximately 9,492.687 km. These are outputs of constructed fixtures, not validated service advice. No full FR/SR acceptance or predictive-performance claim is made from these checks.

A pre-migration backup was retained as `data/mvp-before-annual-history-20261105.sqlite`. The Word thesis and reference project were not changed.
