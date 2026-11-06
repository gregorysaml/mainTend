# MainTend test centre — stage 1

Open `/?profile=fleet#evaluation` or `/?profile=owner#evaluation`, or use **Open test centre** in the demonstration notice. It is a research utility, not an extra fleet-only item in the owner/mobile navigation.

**Run isolated scenarios** executes actual backend functions with fixed versioned fixtures. Fleet has 11 checks; owner has 10. These counts are different from the automated regression test suite.

Cases cover the three fleet states / single-owner rules and simulated forecast, conversions, invalid imports, age boundaries, future inputs, repeatability, the complete maintenance workflow, scoped evidence export and reassessment/history retention. Expected outputs are specified independently in the runner; mismatches are FAIL, exceptions are ERROR, not PASS. Case inputs and expected/observed structures can be inspected and downloaded.

Each database workflow starts a separate `:memory:` SQLite Store and closes it afterwards. The runner never receives the live vehicle Store. Reports and reviewer notes persist in `data/evaluations.sqlite`, independently of `data/mvp.sqlite`. The fixed file configuration is used rather than the live user settings. A report records suite version, source file fingerprints, input/expected-results SHA-256, configuration, profile, timestamps and execution durations. The hash excludes observations of the run, duration and reviewer notes; it is not a signed certificate. Runs are retained; the history selector shows the latest 50 for the selected profile.

Reviewer notes are appended with timestamps, up to 2000 characters each / 100 notes per run. They do not overwrite previous notes or alter automated results. JSON is the structured report; CSV contains metadata, case and reviewer-note rows with quoted fields, UTF-8 BOM and formula-prefix protection.

## API

- GET `/api/evaluations/plan?profile=fleet|owner`
- GET `/api/evaluations?profile=fleet|owner`
- POST `/api/evaluations` with `{"profile":"fleet"}`
- GET `/api/evaluations/:runId?profile=fleet|owner`
- POST `/api/evaluations/:runId/notes?profile=fleet|owner` with `{"text":"Reviewer observation"}`
- GET `/api/evaluations/:runId/export?profile=fleet|owner&format=json|csv`

The server must restart after this backend extension. Normal startup opens both databases; set `EVALUATION_DB_PATH` to use a different evaluation database. Profile filtering is a demo convenience, not authentication or account isolation.

## Evidence boundaries

The runner verifies controlled backend behaviour, not browser usability, disk-restart persistence, accessibility, trained predictive accuracy, real vehicle faults, fleet-scale speed or maintenance savings. Existing regression tests separately cover disk persistence and HTTP behaviour. Browser screenshots and human task observations must be recorded separately. Execution milliseconds are not human task times. Stage 6 of the agreed roadmap is the future computed predictive example; this first stage does not implement it.
