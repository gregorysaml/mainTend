# Per-vehicle capabilities and everyday use

Implemented 6 November 2026 against SR3 and U04–U06 in the supplied V22 thesis. These are prototype software results on constructed data, not real vehicle verification or a customer study. The thesis document has not been changed.

## Everyday workflow

1. Open **Capabilities & care** from either profile, or use the vehicle shortcut on My vehicle/the fleet inspector. Select the vehicle.
2. Read each function's configuration support, current data readiness, explanation, evidence time and next step. Expand a tyre function to inspect all four wheels independently. Diesel examples may expose DPF; the petrol owner's DPF and the combustion vehicles' EV/charging functions are not applicable.
3. Choose **Review data** to move to the selected function. Review the latest eight source observations or the complete 12-month history. **Evaluate eligible data** saves an immutable result using the retained inputs; it cannot bypass a missing source, changed configuration, inappropriate powertrain or unready channel.
4. Expand **Add a timestamped observation** for normal fields: origin, source, UTC time, value/unit, wheel or odometer, comparison context and intervention. DPF also requires numerical exhaust context; capacity observations require battery identity, age and throughput. Canonical conversions retain original values and units. Constructed and unverified manual histories remain separate. Manual/proposed sources are awaiting verification and cannot enable forecasts. A failed write retains the entered form and source ID for retry. Repeated identical source IDs are idempotent; changed evidence with an existing ID is rejected.
5. Evaluate oil-service data, then choose its saved estimate in **Plan the next journey or fleet work**. Enter total intended distance, start and maintenance opportunity. Optional declared manufacturer constraints take precedence. Remaining distance and uncertainty come from the stored snapshot, not the browser. The server rejects missing, foreign, superseded, differently assessed or changed-source estimates. Save follow-up against the exact estimate or plan, then use Maintenance for status, outcome and inspection records.

## Support and readiness

Support is **supported in demonstration only**, **awaiting verification**, **unsupported**, or **not applicable**. The recorded make/model, model year and fuel type identify the demonstration configuration; no VIN, OEM response or real source qualification is inferred. A fingerprint change invalidates existing associations instead of silently reusing their support. Restoring the recorded configuration restores its original association; verifying a new real configuration still requires a future provider/device verification workflow.

Readiness is calculated from required source times, function-specific age/history policies, current segments, context, units, fit and feed availability. It may be **ready**, **partial**, **missing**, **stale**, **insufficient history** or **unavailable**. Readiness is not a healthy-vehicle verdict. A temporary interruption or permission gap does not erase retained demonstration support. It prevents new evaluations and current forecast use. Inapplicable or changed-configuration decisions become historical while their immutable evidence and task links remain retrievable. An applicable already-recorded current concern is not cleared merely because its feed was interrupted.

The installation uses a saved assessment time, shown on the card. Later observations are retained but cannot be used at an earlier assessment. Settings changes can make data stale or eligible automatically. Each observation also retains the actual import time separately from constructed source time. No live clock freshness or live OBD/OEM feed is implied.

## Disclosure and persistence

**Refresh & save disclosure** retains all five functions, including unavailable/not-applicable ones, at During use, Before purchase, or Before proposed payment. The snapshot records the actual disclosure time, configuration, evidence, readiness and differences from the last disclosure. Source changes clear an on-screen prior confirmation. Failed refresh hides the current card and displays **Verification incomplete**, retaining prior disclosures as history. These controls do not charge or purchase anything.

New capability tables are additive. Original annual histories, manual capability notes, forecasts, vehicle records, actions and links are preserved. Card versions, source settings/history, raw and converted observations and disclosures appear in JSON/CSV evidence. The report input hash now includes selected forecast inputs/selection, capability configuration/source state and new raw observations; action and inspection records remain outside the input hash. Normal plans use the new validated endpoint; the older generic service endpoint remains an explicitly constructed compatibility/test interface rather than a verified live estimate adapter.

## Verification

189 automated tests passed, including 15 additional tests for automatic cards, applicability, mixed U04 states, per-wheel partial history, U05 interruption/staleness/restoration, changed configuration, U06 disclosure/failure, unit provenance, duplicate IDs, transactional failures, server-resolved planning, HTTP scope and real process restart for both profiles. Type checking and production build passed. Browser checks cover owner/petrol and fleet/diesel cards, disabled inapplicable functions, feed interruption/restoration, changed disclosure, failed refresh/recovery, retained observation drafts, a saved source-linked owner plan and fleet DPF evaluation.

No real compatibility, predictive accuracy, complete operational charging adapter, production account permissions, payment system or usability outcome is established. The existing Test centre still runs its own isolated baseline scenarios; its case count is not the full command-line suite.
