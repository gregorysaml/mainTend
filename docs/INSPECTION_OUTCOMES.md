# Structured reported inspections — stage 5

Available in both Fleet (B2B) and Private owner (B2C), under Maintenance and the vehicle's action cards. Create an action from a warning first; then open **Record inspection result**.

Choose **Concern confirmed**, **Concern not confirmed**, or **Further investigation needed**. Enter the inspection time explicitly in UTC, the reported inspector/role, and notes describing the fictional check/findings/follow-up. No real diagnosis is inferred. Inspector identity is self-reported, not authenticated.

The latest saved result, notes and provenance appear on the card. **Add follow-up / correction** appends a record; **Inspection history** keeps every previous report. Latest is save order (ID), not inspection-time order; corrections can be backdated. No edit/delete API exists. Existing free-text action outcomes are retained as completion/outcome notes and are not converted into structured verdicts.

The **Inspection / follow-up needed** filter includes non-cancelled tasks with no structured report or a latest report of further investigation, including completed tasks. This is a workflow list, not a risk score or a clinical/mechanical safety assessment. Confirmed or not-confirmed reports leave this list, but do not establish fault resolution or vehicle safety.

## Independent states

- Inspection result does not change action status, schedule, completion note or action-status history.
- Completing an action does not create an inspection report or resolve a warning.
- Any inspection result leaves observations, assessment, warning linkage and current/historical warning derivation unchanged. “Not confirmed” is not “fault-free.” No manual warning-resolution workflow is introduced in this stage.
- Reports can be added to planned, in-progress or completed tasks. Cancelled tasks retain previous reports but cannot receive new ones.

## Persistence and validation

`shared/inspection.ts` defines strict TypeScript contracts and the follow-up predicate. `backend/src/maintenance/inspections.ts` validates exact request keys, enum, owner/fleet scope, safe integer revision, real UTC calendar/time (1900 onward; no future time), trimmed inspector 1–100 characters and notes 1–2000 characters.

`POST /api/actions/:id/inspections` accepts `{ profile, revision, result, inspectedAt, reportedBy, notes }` and returns `{ id }` with HTTP 201. Revision is the latest inspection ID for that action, or 0. A stale revision rejects the save with a draft-preserving message rather than silently replacing another user's latest report. Profile matching is demo scoping, not authentication; other legacy action endpoints remain unauthenticated.

The additive `action_inspections` SQLite table links to the action and stores immutable-through-API result/time/reporter/notes, actual save time and actor profile. A `BEGIN IMMEDIATE` transaction covers scope/status/revision checks and insertion. Database failures roll back and permit retry. Dashboard actions include an `inspections` array in descending save-ID order; legacy actions have an empty array.

Evidence JSON includes every report through its action and warning linkage. CSV adds one `inspection` row per report, with action parent ID and warning ID in details. Reports are labelled unverified user reports; synthetic demo reports are not independent ground truth for predictive-performance testing. The assessment-input SHA-256 excludes actions/inspections, so an inspection-only change does not alter it. Existing test-centre scenario counts are unchanged; stage-5 regressions are developer tests, not a participant study.

## User test

1. Refresh the running app, select either profile, create a fictional action through Warnings if none exists, then open Maintenance.
2. Save a result. Check that the warning and task status remain unchanged.
3. Add a correction or further-investigation report. Inspect both entries in history.
4. Complete the task separately with a completion note; a further-investigation report still appears in the follow-up filter.
5. In Settings, export evidence JSON/CSV and locate inspection records.

Do not use personal inspector details or treat demonstration thresholds/results as vehicle-specific advice. Stage 6 (computed predictive example) remains pending user review of this stage.
