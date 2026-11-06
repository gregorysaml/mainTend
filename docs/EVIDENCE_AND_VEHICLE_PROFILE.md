# Measurement history, assessment settings and evidence exports

All supplied vehicles, measurements, specifications, locations, tyre values and odometer records are synthetic demonstration data. They do not represent the user's actual car. The vehicle-profile fields are currently populated from versioned fixtures; a profile/photo-editing form and live odometer/TPMS ingestion are not implemented.

## History and assessment

Assessment settings and vehicle-evidence downloads are now on the dedicated `#settings` page, reached through **Settings & evidence** in the header. They are no longer repeated below the primary pages. Both profiles use this same route with their own export scope; settings themselves remain shared demo configuration.

History charts use stored timestamps on the horizontal axis, canonical measurement units on the vertical axis and recorded points only. Coolant and battery values are never plotted on the same unit axis. A single observation is shown as a point, not an invented trend; no data produces an explicit empty state. Exact values, observation IDs, original units/conversion formulas (where available) and import times are available below the chart.

Colours indicate age relative to the saved assessment time, not diagnosis. Only the latest measurement at or before assessment time for each required parameter is assessed. Ties are resolved by the higher stored observation ID. Age exactly equal to the configured limit is usable; age greater than the limit is outdated. Missing/future-only/outdated required measurements withhold rule assessment. The dashed threshold is explicitly a demonstration rule, not a manufacturer limit.

The six additional owner measurements cover 1–3 October 2026, with the original pair on 4 October. The extension imports these older synthetic records once, atomically with its migration marker, and does not fill the deliberate fleet missing-data scenario. Specifications/equipment/odometer/tyre fixtures use insert-if-absent operations rather than overwriting saved records.

## Endpoints

- `GET /api/config`: saved shared configuration, initialized from `config/scenario.json` once.
- `PATCH /api/config`: JSON with exactly `assessmentTime` and `observationMaxAgeHours`. Time requires ISO date-time with seconds and explicit timezone; the browser treats its date/time control as UTC and supplies omitted zero seconds. Age must be finite, greater than 0 and at most 8760 hours. Rule edits and unknown keys are rejected. Configuration, audit and reassessment writes are transactional.
- `GET /api/dashboard?profile=owner|fleet`: vehicles, assessments, configuration and current/historical warning flags.
- `GET /api/evidence?profile=owner|fleet&format=json|csv`: attachment download of a snapshot. Invalid profile or format returns 400.

Example configuration request:

```json
{"assessmentTime":"2026-10-07T09:00:00Z","observationMaxAgeHours":24}
```

Settings apply across both demo profiles, not isolated customer accounts. Updating the time/age limit changes which observations are eligible but does not erase existing evidence or action histories.

## Report contents and meaning

JSON schema version 1.0 includes generation time, profile, explicit synthetic origin, saved rules/settings and settings history, all scoped vehicles/specifications/equipment/odometer/tyres, canonical observations with original source information, warnings with supporting records/current flags, actions/status histories/outcomes, current assessments/gaps/triggers, simulated forecast inputs, scoped import rejections and the measurement dictionary.

`inputSha256` hashes the ordered assessment configuration, scoped vehicle IDs/observations and simulated forecast inputs. It identifies those assessment inputs; it is NOT a signature or hash of the whole report, vehicle specifications, actions or test results. Generation time is excluded. JSON is the authoritative structured format. CSV uses UTF-8 BOM, CRLF, fully quoted cells, doubled embedded quotes and record-type rows with `detailsJson` to preserve nested information. String cells beginning with formula-significant characters are prefixed with an apostrophe for spreadsheet safety.

Owner exports include only the owner vehicle, its measurements/actions/forecast/rejections; fleet exports include fleet vehicles plus rejections whose vehicle cannot be attributed. Configuration history is shared demo history. Profile filtering is not secure authentication or authorization.

The export is stored evidence, not an automatic pass/fail judgement. Controlled tests are documented separately in `TEST_RESULTS.md`. A thesis conclusion must compare this evidence with predetermined objectives. No predictive accuracy, cost savings, confirmed vehicle faults, customer acceptance or tyre-safety certification is claimed. The values for pressure are measurements, not recommended inflation settings.

## Illustrative image provenance

Asset: `frontend/public/images/demo-hatchback.png` (copied into `dist/images/` by Vite). Its local URL and explicit illustrative caption are stored in `vehicle_details`. Generated using the built-in image-generation tool through the imagegen skill, not an external stock-photo URL or a photo of the user's car.

Final prompt:

> Use case: photorealistic-natural. Asset type: demonstration vehicle profile photo in a vehicle maintenance app. Primary request: realistic photograph of a generic unbranded silver five-door compact hatchback, parked on a simple quiet paved street, front three-quarter view, full car visible with comfortable margins, landscape composition, soft daylight, understated natural colors. No people, no brand badges, no readable number plates, no text or watermarks. This is an illustrative demo vehicle, not a depiction of any real user's car.
