# Scenario configuration and demonstration rules

The fixed assessment time is `2026-10-04T09:00:00.000Z`; maximum observation age is 48 hours. Both coolant temperature and battery voltage are required. A missing, future-dated or older required observation produces **Insufficient information** and withholds rule output.

| Rule | Demonstration condition | Output |
|---|---|---|
| `DEMO-COOLANT-HIGH` | Latest usable coolant temperature > 105 °C | High coolant temperature observation |
| `DEMO-BATTERY-LOW` | Latest usable battery voltage < 11.8 V | Low battery voltage observation |

These thresholds are scenario settings only. They are not validated diagnostic limits for a real make or model.

Fleet scenarios: `FLEET-001` has usable observations and no trigger; `FLEET-002` triggers the coolant rule; `FLEET-003` lacks coolant data and has an outdated battery observation. `OWNER-001` has usable observations plus a separately entered simulated forecast. The assessment is deterministic for identical database content, configuration and assessment time.
