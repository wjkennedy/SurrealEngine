import { readFile } from 'node:fs/promises';
import { validateManifest } from '../static/surreal/src/runtime.js';

const [manifestPath, baseUrl = 'https://ut.a9group.net/ut99/'] = process.argv.slice(2);
if (!manifestPath) throw new Error('Pass a local manifest path and optional asset base URL.');
const local = validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
const origin = process.env.SURREAL_TEST_ORIGIN || 'https://example.cdn.prod.atlassian-dev.net';
let failures = 0;
async function check(file, parse = false) {
  const url = new URL(file.split('/').map(encodeURIComponent).join('/'), base);
  try {
    const response = await fetch(url, {
      method: parse ? 'GET' : 'HEAD', headers: { Origin: origin }, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const cors = response.headers.get('access-control-allow-origin');
    if (cors !== '*' && cors !== origin) throw new Error(`CORS does not allow ${origin}`);
    if (parse) {
      const remote = validateManifest(await response.json());
      if (local.game && remote.game !== local.game) throw new Error(`Expected ${local.game}; host serves ${remote.game}`);
      if (JSON.stringify([...local.bootstrapFiles].sort()) !== JSON.stringify([...remote.bootstrapFiles].sort())) {
        throw new Error('Remote bootstrap list does not match the local manifest');
      }
    }
    console.log(`OK ${file}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${url}: ${error.message}`);
  }
}
await check('manifest.json', true);
for (const file of local.bootstrapFiles) await check(file);
console.log(`${local.bootstrapFiles.length + 1} resources checked; ${failures} failures`);
process.exitCode = failures ? 1 : 0;
