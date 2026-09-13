import assert from 'node:assert/strict';
import test from 'node:test';
import resolver from '../src/index.js';

test('resolver exposes only public config and ignores client overrides', async () => {
  const previous = process.env.SURREAL_ASSET_BASE_URL;
  process.env.SURREAL_ASSET_BASE_URL = 'https://assets.example/ut99/';
  try {
    const result = await resolver.handler({ call: {
      functionKey: 'getRuntimeConfig', payload: { assetBaseUrl: 'https://untrusted.example/' },
    }, context: { accountId: 'private-account' } });
    assert.equal(result.assetBaseUrl, 'https://assets.example/ut99/');
    assert.equal(result.wasmBinary, 'wasm/surreal-engine.wasm.gz');
    assert.deepEqual(Object.keys(result).sort(),
      ['assetBaseUrl', 'websocketUrl', 'wasmEntrypoint', 'wasmBinary', 'dataArchive'].sort());
    assert.equal(JSON.stringify(result).includes('private-account'), false);
  } finally {
    if (previous === undefined) delete process.env.SURREAL_ASSET_BASE_URL;
    else process.env.SURREAL_ASSET_BASE_URL = previous;
  }
});

test('unregistered resolver operations are rejected', async () => {
  await assert.rejects(resolver.handler({ call: { functionKey: 'deleteIssue' }, context: {} }), /no definition/);
});
