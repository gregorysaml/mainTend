import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../../lib/store.mjs';
import { createApiServer } from './http/app.ts';
import type { ScenarioConfig } from '../../shared/types.ts';
import { EvaluationRepository } from './evaluation/repository.ts';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const config = JSON.parse(fs.readFileSync(path.join(projectRoot, 'config/scenario.json'), 'utf8')) as ScenarioConfig;
const store = new Store(process.env.DB_PATH || path.join(projectRoot, 'data/mvp.sqlite'), projectRoot);
store.seed();
store.seedOwnerJourneys();
store.seedAnnualHistories(config);
store.seedCapabilitySupport(config);
store.applyOwnerCoolingDemo(config);
store.assess(store.getConfig(config));
const evaluations = new EvaluationRepository(process.env.EVALUATION_DB_PATH || path.join(projectRoot, 'data/evaluations.sqlite'));
const server = createApiServer(store, config, projectRoot, evaluations);
server.listen(Number(process.env.PORT || 3000), '127.0.0.1', () => {
  const address = server.address();
  console.log(`MVP running at http://localhost:${typeof address === 'object' && address ? address.port : process.env.PORT}`);
});
server.on('error', error => { console.error(error.message); store.close(); evaluations.close(); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => { store.close(); evaluations.close(); process.exit(0); }));
