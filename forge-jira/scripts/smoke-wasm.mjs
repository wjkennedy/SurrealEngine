import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { startRuntime } from '../static/surreal/src/runtime.js';

const source = await readFile(new URL('../static/surreal/public/wasm/surreal-engine.js', import.meta.url), 'utf8');
const binary = await readFile(new URL('../static/surreal/public/wasm/surreal-engine.wasm', import.meta.url));
for (const [file, gpu, expected] of [
  ['System/UnrealTournament.ini', {}, 'engine-bootstrap-ready'],
  ['System/Unreal.ini', {}, 'engine-bootstrap-ready'],
  ['System/Core.u', {}, 'engine-bootstrap-missing'],
  ['System/UnrealTournament.ini', undefined, 'webgpu-unavailable'],
]) {
  const target = {};
  const context = vm.createContext({
    window: target, navigator: { gpu }, console, WebAssembly, TextDecoder, TextEncoder,
    URL, setTimeout, clearTimeout, performance,
  });
  const result = startRuntime({
    target,
    config: { assetBaseUrl: 'https://fixture.invalid/ut99/', wasmEntrypoint: 'surreal-engine.js' },
    manifest: { bootstrapFiles: [file] },
    fetchFile: async () => new Response('[URL]\nLocalMap=Entry.unr\n'),
    async loadScript() {
      target.Module.wasmBinary = binary;
      context.Module = target.Module;
      vm.runInContext(source, context);
    },
  });
  if (expected === 'engine-bootstrap-ready') {
    await result;
    assert.match(target.Module.FS.readFile(`/ut/${file}`, { encoding: 'utf8' }), /LocalMap=Entry/);
  } else {
    await assert.rejects(result, /exit code 1/);
  }
  assert.equal(target.SurrealEngineBootStatus, expected);
}
console.log('WASM smoke passed: real compiled main() accepts UT/Unreal INIs and rejects missing INI/WebGPU. Not a gameplay test.');

// Also exercise the deployed asset set when it has been bundled.
if (process.argv.includes('--bundled')) {
  const assetRoot = new URL('../static/surreal/dist/ut99/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', assetRoot), 'utf8'));
  const target = {};
  const context = vm.createContext({ window: target, navigator: { gpu: {} }, console,
    WebAssembly, TextDecoder, TextEncoder, URL, setTimeout, clearTimeout, performance });
  const module = await startRuntime({ target, manifest,
    config: { assetBaseUrl: 'https://fixture.invalid/ut99/', wasmEntrypoint: 'surreal-engine.js' },
    fetchFile: async url => {
      const relative = new URL(url).pathname.slice('/ut99/'.length);
      return new Response(await readFile(new URL(relative, assetRoot)));
    },
    async loadScript() {
      target.Module.wasmBinary = binary;
      context.Module = target.Module;
      vm.runInContext(source, context);
    },
  });
  assert.equal(target.SurrealEngineBootStatus, 'engine-bootstrap-ready');
  assert.equal(module.FS.readFile('/ut/System/Core.u').length,
    (await readFile(new URL('System/Core.u', assetRoot))).length);
  console.log(`Bundled UT99 smoke passed: mounted ${manifest.bootstrapFiles.length} real files and ran compiled main().`);
}
