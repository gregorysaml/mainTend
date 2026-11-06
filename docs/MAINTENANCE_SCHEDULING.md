# Maintenance scheduling — stage 3

Implemented for fleet coordinators and private owners. Create a task from **Plan a maintenance action** within a warning; choose an optional due date and low/normal/high priority. Fleet tasks still require an assigned role; owner tasks use an optional note. Scheduling is not a booking, external reminder, model-derived recommendation or manufacturer service interval.

## Date and state semantics

Due dates are calendar dates, `YYYY-MM-DD`, between 1900 and 9999. Dates are optional: no date means unscheduled, not a guessed service deadline. Priority defaults to normal for new and legacy tasks. Date and priority are chosen by the user.

Due-state labels compare against the UTC calendar day of the saved assessment time, not the browser timezone or live clock. The date of reference is explicitly shown on the Maintenance page and vehicle maintenance plans. Advancing assessment time updates labels without rewriting the schedule or history.

- Overdue: an open task's date is before the reference day.
- Due today: an open task's date equals the reference day.
- Due soon: the next 1–7 days, inclusive.
- Upcoming: more than 7 days ahead.
- Unscheduled: no due date.
- Closed: completed/cancelled tasks, excluded from open/overdue/due-soon counts regardless of their recorded date.

Within a vehicle, tasks sort by due-state category, due date, high/normal/low priority, then task ID. This is presentation ordering, not a predicted failure-risk score. Completing a task requires a reported outcome and does not remove or clear its linked warning.

## Screens

**Maintenance** is available to both profiles with open, overdue and due-today/next-seven-day counts; filters for all/open/overdue/due-soon/closed; vehicle identity; schedule/status badges; and separate disclosures for editing the schedule, updating status and viewing evidence/history.

Open tasks are also visible in each fleet vehicle card and in the owner overview's maintenance card. Closed fleet tasks remain in the expandable observations/history section. Creating forms and update controls are collapsed until needed, reducing card clutter.

Vehicles, Warnings and Maintenance share a new identity header: generic vector vehicle illustration, prominent registration plate, display name, make/model/year/fuel, recorded mileage and its timestamp. The illustration is explicitly not a photo. Missing mileage is shown as missing, never invented. Owner overview keeps its hero but uses a stronger plate style. No new photo or live telemetry is claimed.

## Storage and API

- `POST /api/actions`: existing fields plus optional `dueDate: string | null` and `priority: low | normal | high`. Omitted values default to unscheduled/normal for backwards compatibility.
- `PATCH /api/actions/:id/schedule`: exactly `{ dueDate, priority, note }`, with a required trimmed note of 1–2000 characters. An empty string is not a date; send null to clear it. Invalid calendar dates, types, priorities, unknown fields and missing fields are rejected. Tasks cannot be rescheduled while completed/cancelled. This endpoint does not change status, outcome, warning link or assigned role.
- Existing status-update endpoint retains the schedule and writes a schedule snapshot into each new history entry.
- Dashboard and JSON/CSV evidence expose saved due dates, priorities and history snapshots. Assessment-input hashes still do not hash whole maintenance reports or task metadata.

An additive transactional migration adds nullable `due_date` and default-normal `priority` to actions, plus nullable schedule snapshot fields to history. Existing notes, links, statuses and timestamps are preserved. Legacy history with no priority snapshot is shown as schedule not recorded, not reconstructed. Task creation, status updates and schedule updates now commit their task/history writes atomically; a history-write failure rolls back the corresponding change.

The SQLite adapter remains the existing JavaScript module. New shared scheduling semantics, validation, contracts, React components and tests are TypeScript. `shared/maintenance.ts` owns pure due-state/calendar/order functions; `backend/src/maintenance/scheduling.ts` validates schedules; `frontend/src/features/maintenance/` owns forms and presentation; `VehicleIdentity.tsx` and the pure odometer selector separate identity presentation from scheduling.

## Verification and limitations

50 automated tests pass: the preceding 41 plus nine scheduling/identity tests. Added checks cover calendar and request validation, UTC/reference-day boundaries, deterministic non-mutating sort, both-profile lifecycle/audit, persistence and legacy migration, actual SQLite failure rollback/retry, evidence serialization, real HTTP creation/rescheduling and latest-valid odometer selection. Strict TypeScript checking and production build pass.

Browser write checks used a separate server with in-memory vehicle/evaluation databases. Fleet: create, reschedule to overdue, overdue filter, move to due soon (which removed the task from the overdue filter), mandatory completion outcome and exclusion of completed tasks from due counts. Owner: create a due-today task with date retained after priority/note edits, reload, mobile reschedule, clear date to unscheduled, then schedule again; owner overview displayed the same pending plan. Four owner bottom-nav links, light/dark layouts and no horizontal overflow at 390 × 844 were checked.

Browser testing initially found native date input values could be lost during controlled-field rerenders. Dates now use native uncontrolled fields and are read directly from FormData at submission; both create and reschedule were reverified after edits to other fields. Database tests alone did not detect this browser issue.

The real local database was backed up as `data/mvp-before-scheduling-20261005-220617.sqlite` before migration. Read-only comparison confirmed its 15 observation rows and saved settings unchanged; it contained no existing action/history rows. Preservation of non-empty legacy task/history rows was tested separately with an isolated legacy database. No QA tasks were inserted into the real local database.

Screenshots include `maintend-vehicles-identity-dark.png` (real application) and `maintend-maintenance-owner-dark.png` / `maintend-maintenance-mobile-light.png` (isolated synthetic QA). These are developer verification, not participant usability results, predictive accuracy or maintenance benefits. Stage 4 remains unimplemented, awaiting user feedback.
