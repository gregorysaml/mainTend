# Dependencies and versions

Versions used for the verified build on 4 October 2026:

| Component | Version | Role |
|---|---:|---|
| Node.js | 24.19.0 | HTTP runtime, built-in SQLite and test runner |
| pnpm | 11.19.0 | Development dependency manager |
| React | 19.3.0 | Component-based user interface |
| React DOM | 19.3.0 | Browser rendering |
| TypeScript | 7.0.2 | Static type checking |
| Vite | 8.3.2 | Frontend development and production build |
| `@vitejs/plugin-react` | 6.1.1 | React transformation for Vite |
| Leaflet | 1.9.4 | Interactive map rendering |
| React Leaflet | 5.0.0 | React components for Leaflet |

Exact resolved dependency versions are retained in `pnpm-lock.yaml`. Runtime persistence uses `node:sqlite`, so no external database server is required.

The map uses OpenStreetMap raster tiles and therefore needs an internet connection to display the basemap. Synthetic markers and all other application functions remain local.
