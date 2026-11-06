import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../lib/store.mjs';
import { createApiServer } from '../backend/src/http/app.ts';
import type { ScenarioConfig } from '../shared/types.ts';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'config/scenario.json'), 'utf8')) as ScenarioConfig;
test('built design assets and self-hosted fonts are served by the actual app without external font requests', async () => {
  const store = new Store(':memory:', root); store.seed();
  const server = createApiServer(store, config, root);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address(); assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;
    const html = await (await fetch(base, { signal: AbortSignal.timeout(5000) })).text();
    const script = html.match(/src="(\/assets\/index-[^"]+\.js)"/); assert.ok(script);
    const bundle = await fetch(base + script[1], { signal: AbortSignal.timeout(5000) }); assert.equal(bundle.status, 200); assert.match(bundle.headers.get('content-type') ?? '', /javascript/); await bundle.arrayBuffer();
    const fonts = fs.readdirSync(path.join(root, 'dist/assets')).filter(name => name.endsWith('.woff2') && name.includes('-latin-'));
    assert.ok(fonts.some(name => name.startsWith('inter-'))); assert.ok(fonts.some(name => name.startsWith('jetbrains-mono-')));
    for (const font of fonts) { const response = await fetch(`${base}/assets/${font}`, { signal: AbortSignal.timeout(5000) }); assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'font/woff2'); assert.ok((await response.arrayBuffer()).byteLength > 0); }
    assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic/);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); store.close(); }
});
