# Implementation alignment with Chapter 5

The implemented prototype follows the Chapter 5 plan for a common backend/database, two web views, synthetic imports, deterministic checks, visible data limitations, simulated forecasts and linked maintenance history.

Deliberate MVP boundaries match the chapter: no live integration, trained prognostic model, native mobile app, payments, external booking or production security. The browser profile selector is a controlled demonstration device, not an access-control implementation.

Minor implementation choices made concrete here: SQLite is the persistent database; JSON is the import payload; two parameters and two demonstration rules are configured; observation age is 48 hours; the assessment time is fixed for reproducibility. These values should be described as implemented research-scenario settings if Chapter 5 is revised.

The import plan now has a browser workflow and public local API endpoints for schema, preview and saving. Temperature inputs in °F/K and voltage inputs in mV are converted to canonical °C/V. Original inputs and formulas are retained. Unknown units are explicitly rejected. Manufacturer-specific field mapping and live supplier adapters remain outside this implementation.

The implemented interface uses React with TypeScript and a Vite production build. The backend API composition and domain rules are TypeScript; the small SQLite adapter remains JavaScript with an explicit TypeScript declaration because Node's built-in SQLite API is still experimental. This technical choice is more specific than Chapter 5 but does not alter its functional design.

The interface now includes an OpenStreetMap-based fleet/vehicle location panel. Locations are stored synthetic scenario inputs with timestamps and are visibly labelled as simulated, not live GPS observations. Chapter 5 did not require a map, so this is an additive demonstration feature rather than a replacement for a planned function.

Mobile navigation is a fixed bottom bar. Fleet and owner navigation use different menus; the owner view omits the fleet vehicle-management page and displays a single-vehicle map heading. Demo role selection is a separate dropdown, and the selected role is preserved in the URL. Owner response notes are recorded as action-history notes rather than coordinator assignments.

Chapter 5 described planned workshop sharing as part of the broader architecture but explicitly excluded it from the initial prototype. It remains unimplemented. No divergence affecting the agreed MVP scope was identified.
