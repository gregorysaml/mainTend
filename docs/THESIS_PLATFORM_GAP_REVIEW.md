# Thesis and platform gap review

Review date: 7 October 2026

## Conclusion

MainTend already implements the central maintenance decision workflow specified in the thesis: separate fleet and owner views, observation validation, condition rules, visible data limitations, linked actions, timestamped histories, reported inspection outcomes and persistent storage. The most useful next development work is a small completion of the ingestion and service-eligibility design, followed by a consolidated requirements assessment. A larger collection of forecasting examples is not needed to fulfil the present thesis scope.

The thesis's main artifact is a business model and service specification supported by a functional MVP (Sections 1.3, 1.4 and 4.1). Consequently, a technically richer dashboard does not complete the financial evaluation or establish customer value. Business requirements require documented assumptions and calculations as well as software evidence.

## Sources and review boundary

The complete textual content, headings and table cells of `Ptixiaki V6 - Condensed revision 2.docx` were read, together with the separate `Chapter 5 - Three-section revision.md` and all five pages of `Guidelines for Adopting Design Science.pdf`. The Word file contains Chapters 1–4 and references; it describes Chapters 5–7 as subsequent work but does not contain those chapters. The supplied Chapter 5 is an implementation plan. Chapters 6 and 7 were not available in these supplied sources.

The review inspected current application contracts, ingestion, SQLite storage, rule assessment, evaluation runner, evidence exports, owner/fleet presentation and cooling/lubrication implementation documentation. It did not rerun the full test suite, conduct a usability study or alter application records. Existing test files and reports are evidence locations, not a fresh acceptance verdict. The Word renderer was unavailable because the bundled environment did not provide `soffice.exe`; this is a content and implementation review, not a pagination or formatting audit. The reference documents were not edited.

## Recommended platform changes

### 1 Support documented field-name variations

Priority: high. Requirement: TR1; Sections 4.4–4.5 and Chapter 5.1.

`backend/src/imports/normalization.ts` accepts the canonical keys `vehicleId`, `parameter`, `value`, `unit` and `observedAt`. It converts supported temperature and voltage units, but it has no field-name mapping layer. `docs/DATA_DICTIONARY.md` explicitly states that field names and parameter identifiers must match the exact schema. TR1 asks for evidence that supported field-name and unit variations produce the common structure; only the unit portion is currently supported.

Add a small, explicitly documented mapping profile, for example `vehicle_id` to `vehicleId` and `timestamp` to `observedAt`, with a defined list of supported parameter aliases. Preserve the original field names alongside the mapping profile/version. Reject conflicting aliases and ambiguous inputs rather than guessing. Demonstrate both fleet and owner examples using different names and units that produce the same canonical record. Manufacturer-specific integration remains a future component.

### 2 Prevent duplicate observations on reimport

Priority: high. Requirement basis: Section 2.4.1's repeated-transmission requirement.

`Store.importObservations` inserts every accepted row. There is no observation uniqueness key, source-event identifier or request idempotency mechanism. `docs/API_IMPORT.md` accurately describes this as append-only ingestion without deduplication. A repeated batch therefore creates additional observations; because rule-warning identity includes observation ID, this can also add another warning record for equivalent evidence.

Introduce a documented duplicate policy using source/event identity where supplied, or a clearly stated canonical identity for the controlled JSON importer. Define what happens when the same identity arrives with different values; preserve genuine corrections instead of silently overwriting history. The preview/save report should distinguish inserted, duplicate/skipped, rejected and conflicting records. Retrying a successful import must not multiply equivalent observations or warning events. Existing stored rows and linked evidence need a preservation policy during migration.

### 3 Add a per-vehicle data availability and service-scope record

Priority: medium for the interface; high for the service specification. Requirements: BR1 and TR4; Sections 2.3.3, 3.5.2, 4.3 and 4.5.

Vehicle identity, specifications and current data gaps exist. A per-vehicle record of the intended data source, supported parameters, expected observation frequency, required history and supported functions does not exist. The globally accepted parameter dictionary does not establish that each vehicle can supply every required signal. Likewise, rejecting an unknown parameter does not communicate that a known function is unsupported by a particular vehicle.

Add a `Data availability` panel or an equivalent documented synthetic eligibility record. It should identify a fictional source, declared parameter coverage, observation frequency/history prerequisites and feature eligibility. Distinguish `supported but missing`, `outdated` and `not supported`. Link each function to the observations and context it needs. Cooling and lubrication fixtures must remain visibly separate from ordinary imported readings; displaying a demo for a vehicle must not imply confirmed manufacturer compatibility. This is a demonstration of eligibility reasoning, not a real compatibility checker.

Section 2.4.1 also asks for source, measurement time and receipt time. Measurement and import times and original units/formulas are already retained. Add an explicit source identifier/type if source-provider provenance is to be demonstrated; the current `ObservationSource` describes conversion provenance but does not identify an upstream provider or source event.

### 4 Consolidate requirement assessment and final demonstration evidence

Priority: high for evaluation. Requirements: Section 4.6 and all FR/TR/BR items.

The Test Centre already stores expected/observed backend scenario results and reviewer notes. Its cases refer to objectives and chapter sections, but it does not provide a complete FR1–FR4/TR1–TR4/BR1–BR5 assessment with `satisfied`, `partially satisfied`, `not satisfied` or `not evaluated` outcomes. A passing case is not automatically evidence that every condition of a broader requirement is met.

Create a requirements matrix linking each item to its implemented function or specification, scenario IDs, stored report IDs, external regression evidence and limitations. This can be a research page added to the Test Centre or a versioned document; implementing another screen is optional. Include a build/source version so evidence can be tied to the reviewed application, not only to fixture hashes.

The in-app runner explicitly uses in-memory stores and excludes disk restart and browser behaviour. Separate disk-persistence tests already exist, so persistence is not a missing application feature. The final thesis evidence package should reference those checks and record complete fleet and owner demonstrations, including actual process restart and retrieval where required by the evaluation protocol.

The runner still tests the older pre-entered owner charging forecast, whereas normal startup now selects the owner computed cooling example. Extend or explicitly version the final demonstration plan so the expected/observed records correspond to the current owner scenario and fleet examples. Keep the pre-entered fixture as a separate historical/controlled case if it is still useful.

### 5 Improve the owner's immediate next-step presentation

Priority: optional interface refinement. Requirements basis: FR3 and Chapters 4.3/5.2.

The owner already has warning explanations, next-step links and a Predictions/Recommendations/Service book workflow. The overview explanation still uses terms such as `comparable-session trend` and `demo-reference crossing`. Add a short plain-language explanation and a direct action entry beside the warning, while retaining technical evidence in expandable details. Explain that the projected event is a fictional comparison threshold, not a confirmed failed component. Clarity or usability benefits would still require user evidence; this is a design recommendation, not a measured finding.

## Preliminary requirement coverage

These are inspection-based coverage judgments, not final Section 4.6 acceptance results.

| Requirement | Current evidence | Remaining issue |
|---|---|---|
| FR1 Synthetic import and rejection reasons | Browser import preview/save; normalization; import tests | Extend field mappings and duplicate handling as above. |
| FR2 Fleet and single-vehicle records | Fleet workspace, owner overview, charts, histories and map | Assemble final screenshots and checked scenario records. |
| FR3 Distinct alerts and simulated forecasts | Rule/pre-entered/computed provenance labels and stored evidence | Update the thesis and final scenarios for computed synthetic examples; explicitly demonstrate both output types in both profiles. |
| FR4 Linked action and outcome workflow | Scheduling, action status/history, required completion outcome and structured inspections | Consolidate the two complete demonstrations and their evidence links. |
| TR1 Common field and unit structure | Canonical schema, conversions and original-value provenance | Field-name variation mapping is missing. |
| TR2 Data limitations | Import rejection; missing, old and after-cutoff assessment gates | Per-vehicle unsupported-function distinction is not represented; include both profiles in final evidence. |
| TR3 Persistent action sequence | SQLite relations, histories and disk-reopen regression tests | Link external restart evidence to the final assessment; the Test Centre alone does not test disk restart. |
| TR4 Architecture and future access specification | Layered architecture and documented prototype boundary | Specify future account/role boundaries, workshop sharing/revocation and interface responsibilities more concretely. Production authentication is not required inside this MVP. |
| BR1 Segment-specific eligibility and functions | Separate workflows and Chapter 5 segment descriptions | Complete explicit B2B/B2C service-scope and data-prerequisite records. |
| BR2 Provider/customer cost inputs | Cost categories described in the thesis | No cost-input register or financial calculation model was located in this workspace. |
| BR3 Baselines, viability and customer value | Scenario-analysis approach described in the thesis | Calculations, break-even, sensitivity and adverse cases remain outstanding here. |
| BR4 Business model | Chapter 5.3 describes value, revenue, channels, activities, resources and partnerships | Review consistency with delivered functions and attach explicit evidence/assumption status. |
| BR5 Customer journeys and support | Chapter 5.3 outlines business onboarding and consumer activation/support | Document the proposed journeys and their cost assumptions at the detail needed for review; these commercial steps need not be implemented. |

## Work needed for the thesis outside the application

The financial model is the largest outstanding research deliverable located by this review. It can be a separate workbook or calculation report; it does not require payment processing or a commercial pricing screen.

Record provider development/operating costs separately from customer intervention costs, with units, periods, provenance and uncertainty. Actual expenditure and recorded effort must be distinguished from estimates; elapsed calendar time or automated test duration cannot be presented as measured development labour. Construct separate B2B and B2C baselines, provider results and customer net benefits. Include unnecessary inspections and zero/negative benefit cases.

The Chapter 5 author assumptions are B2B EUR 10 per vehicle/month, possible EUR 150 onboarding per business, and B2C EUR 5/month or EUR 50/year as alternative plans. These are assumptions, not validated prices. Count shared infrastructure once, distinguish vehicles from businesses, and keep annual cash receipts distinct from revenue attribution when modelling service periods. No financial calculations or supplier-price verification were performed in this review.

For TR4, add a future service specification covering who owns each vehicle record, coordinator/driver/technician/owner responsibilities, workshop sharing scope and revocation, retention and ownership changes, and adapter responsibilities. Detailed design evidence is required; secure commercial implementation remains outside the current prototype.

Update the chapter narrative to reflect the actual artifact. Chapters 4 and 5 currently describe forecasts only as pre-entered simulated inputs. The application now also calculates bounded linear cooling and oil-pressure projections from isolated synthetic fixtures. Describe these as additional calculated demonstrations, with methods, assumptions and limited fixture evaluation. Their MAE/reference-crossing results do not demonstrate vehicle-failure prediction, realised savings or the thesis's business viability.

## Suggested order

1. Complete the documented importer with supported field mappings and a duplicate/conflict policy.
2. Define synthetic per-vehicle source/eligibility records and the segment-specific service specification.
3. Consolidate the requirement matrix and versioned fleet/owner demonstration evidence for the current scenarios.
4. Build the separate cost/scenario/sensitivity model and write the final Chapter 6 assessment.
5. Refine owner wording if needed, then obtain and report real user feedback only if a separate evaluation is conducted.

Live OEM/telematics integration, additional OBD hardware, a trained forecasting model, production account isolation, workshop access accounts, payments, native mobile apps and further vehicle subsystems are future development items under the supplied scope. They are not prerequisites for completing this research MVP.
