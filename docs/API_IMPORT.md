# Observation import API and user workflow

Implemented on 5 October 2026. All examples use synthetic records. No live manufacturer or telematics connection is included.

## Browser workflow

Open **Import data** from the navigation. Choose **Single observation**, or **JSON batch** to paste a JSON array, load the conversion example or open a local `.json` file. Click **Preview & validate** to review canonical values and per-row rejection reasons. Preview does not write to the database. **Save accepted observations** stores accepted rows and rejection explanations. Input remains present on save failure; retry is available. The save button is disabled after success until input is edited or a new preview is requested.

This is append-only ingestion, without deduplication. Submitting the same batch again adds observations. Duplicate prevention across separate requests is not claimed. Field edits invalidate the earlier preview. The backend revalidates all records when saving.

## Endpoints

| Endpoint | Behaviour |
|---|---|
| `GET /api/import/schema` | Parameter definitions, accepted units, canonical ranges, 500-record limit, fixed assessment time and sample input. |
| `POST /api/import/preview` | Validate and normalize an array; no database writes. |
| `POST /api/import` | Validate again, then atomically save accepted rows, source metadata and rejection explanations. |

Both POST endpoints accept the array directly:

```json
[
  {"vehicleId":"FLEET-001","parameter":"engine_coolant_temperature","value":203,"unit":"°F","observedAt":"2026-10-04T08:30:00Z"},
  {"vehicleId":"FLEET-001","parameter":"battery_voltage","value":12600,"unit":"mV","observedAt":"2026-10-04T08:30:00Z"}
]
```

Expected values: 95 °C and 12.6 V. Responses contain `accepted` and `rejected` arrays, each with a 1-based `rowNumber`. Accepted rows include canonical fields and `source` (original value, unit, timestamp and conversion formula); saved rows also include the observation `id`. Rejections include the original `record` and `reason`.

## Error handling and persistence

A valid array with row-level errors returns HTTP 200 and the per-row report. Invalid JSON, non-array input, empty batches, more than 500 records or excessive request size return HTTP 400 with an `error` string. Request bodies are limited to 1 MB. A database failure rolls back the entire batch and returns an error; neither partial observations nor partial source records are left from that batch.

Schema initialization adds the `observation_sources` table to existing databases, preserving existing records. Canonical observations and their source records persist across database reopening. Subsequent dashboard requests assess the latest stored observations before returning warning data.

Timestamp parsing and observation freshness are distinct: an old or future timestamp can be a valid stored observation while still withholding the assessment according to the scenario's observation-age limits. The fixed assessment time remains `2026-10-04T09:00:00.000Z`; importing present-day timestamps does not silently advance it.

## Fixtures

`data/import-unit-conversions.json` contains Fahrenheit, Kelvin, millivolt and unknown-vehicle examples. It is a controlled test fixture, not measured vehicle telemetry.
