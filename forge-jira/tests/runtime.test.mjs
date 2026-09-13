import assert from 'node:assert/strict';
import test from 'node:test';
import { startRuntime, validateManifest } from '../static/surreal/src/runtime.js';

const manifest = { mountPoint: '/ut', bootstrapFiles: ['System/UnrealTournament.ini'] };
const config = { assetBaseUrl: 'https://assets.example/ut99/', wasmEntrypoint: 'wasm/surreal-engine.js' };

function harness(fetchFile) {
  const events = [];
  const target = {};
  return { events, target, options: {
    config, manifest, target, fetchFile,
    async loadScript() {
      assert.equal(target.Module.noInitialRun, true);
      assert.equal(target.Module.FS, undefined);
      target.Module.FS = {
        mkdirTree: path => events.push(['mkdir', path]),
        writeFile: (path, bytes) => events.push(['write', path, [...bytes]]),
      };
      target.Module.callMain = args => { events.push(['main', args]); return 0; };
      target.Module.onRuntimeInitialized();
    },
    onInitialized: () => events.push(['ready']),
  } };
}

test('mounts assets after runtime initialization and before main', async () => {
  const h = harness(async () => new Response(new Uint8Array([1, 2, 3])));
  await startRuntime(h.options);
  assert.deepEqual(h.events, [
    ['mkdir', '/ut/System'], ['write', '/ut/System/UnrealTournament.ini', [1, 2, 3]],
    ['main', ['/ut']],
  ]);
});

for (const [name, fetchFile] of [
  ['HTTP error', async () => new Response('', { status: 404 })],
  ['network error', async () => { throw new Error('Network failure'); }],
]) {
  test(`${name} prevents main and ready notification`, async () => {
    const h = harness(fetchFile);
    await assert.rejects(startRuntime(h.options));
    assert.deepEqual(h.events, []);
  });
}

test('script load and WASM abort errors reach the caller', async () => {
  const h = harness();
  await assert.rejects(startRuntime({ ...h.options, loadScript: async () => {
    throw new Error('Script missing');
  } }), /Script missing/);
  await assert.rejects(startRuntime({ ...h.options, loadScript: async () => {
    h.target.Module.onAbort('compile failed');
  } }), /compile failed/);
});

test('rejects paths that escape the game mount or asset origin', () => {
  for (const path of ['../secret', '/etc/file', '//elsewhere/file', 'System/../file',
    'https://elsewhere/file', 'System\\file', '%2e%2e/file', 'file?token=1', '', null]) {
    assert.throws(() => validateManifest({ bootstrapFiles: [path] }), /Invalid asset path/);
  }
  assert.throws(() => validateManifest({ ...manifest, mountPoint: '/etc' }), /requires assets mounted/);
  assert.throws(() => validateManifest({ bootstrapFiles: [] }), /non-empty/);
});
