// Keep startup independent of the Forge bridge so it can be exercised locally.
export function validateManifest(manifest) {
  if (!manifest || !Array.isArray(manifest.bootstrapFiles) || !manifest.bootstrapFiles.length) {
    throw new Error('Asset manifest must include a non-empty bootstrapFiles array.');
  }
  if (manifest.mountPoint && manifest.mountPoint !== '/ut') {
    throw new Error('The engine requires assets mounted at /ut.');
  }
  for (const path of manifest.bootstrapFiles) {
    if (typeof path !== 'string' || !path || /[\\:%?#\x00-\x1f]/.test(path) ||
        path.split('/').some(part => !part || part === '.' || part === '..')) {
      throw new Error(`Invalid asset path: ${String(path)}`);
    }
  }
  return manifest;
}

export async function mountAssets(Module, config, manifest, fetchFile = fetch, onProgress = () => {}) {
  validateManifest(manifest);
  const base = new URL(config.assetBaseUrl);
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  for (const [index, path] of manifest.bootstrapFiles.entries()) {
    const url = new URL(path.split('/').map(encodeURIComponent).join('/') + (manifest.compression === 'lzma' ? '.lzma' : manifest.compression === 'brotli' ? '.br' : manifest.compression === 'gzip' ? '.gz' : ''), base);
    const response = await fetchFile(url.toString(), { mode: 'cors' });
    if (!response.ok) throw new Error(`Asset HTTP ${response.status}: ${url}`);
    let bytes;
    if (manifest.compression !== 'lzma') {
      const data = manifest.compression
        ? await new Response(response.body.pipeThrough(new DecompressionStream(manifest.compression))).arrayBuffer()
        : await response.arrayBuffer();
      bytes = new Uint8Array(data);
    } else {
      throw new Error('Legacy LZMA assets are unsupported; rebuild the asset bundle with gzip.');
    }
    const target = `/ut/${path}`;
    Module.FS.mkdirTree(target.slice(0, target.lastIndexOf('/')));
    Module.FS.writeFile(target, bytes);
    onProgress(index + 1, manifest.bootstrapFiles.length, path);
  }
}

export async function startRuntime({ config, manifest, canvas, loadScript, fetchFile = fetch,
  onProgress, onLog = () => {}, beforeMain = async () => {}, onInitialized = () => {},
  onFailure = () => {}, target = window }) {
  let ready;
  const initialized = new Promise((resolve, reject) => {
    ready = { resolve, reject };
  });
  // Observe rejection even if an abort arrives before script loading completes.
  initialized.catch(() => {});
  const Module = {
    canvas,
    noInitialRun: true,
    locateFile(path) {
      if (path.endsWith('.wasm')) return config.wasmBinary;
      if (path.endsWith('.data')) return config.dataArchive;
      return `wasm/${path}`;
    },
    print: text => { console.log(text); onLog(`WASM: ${text}`); },
    printErr: text => { console.error(text); onLog(`WASM error: ${text}`); },
    onRuntimeInitialized: () => ready.resolve(),
    onEngineReady: onInitialized,
    onEngineError: message => onFailure(new Error(message)),
    onAbort(reason) {
      const error = new Error(`WASM aborted: ${reason}`);
      onLog(`WASM abort: ${reason || 'native code called abort()'}`);
      ready.reject(error);
      onFailure(error);
    },
  };
  if (config.wasmBinary?.endsWith('.gz')) {
    const response = await fetchFile(config.wasmBinary);
    if (!response.ok) throw new Error(`WASM HTTP ${response.status}`);
    const binary = new Uint8Array(await response.arrayBuffer());
    Module.wasmBinary = binary[0] === 0x1f && binary[1] === 0x8b
      ? new Uint8Array(await new Response(new Blob([binary]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())
      : binary;
  }
  target.Module = Module;
  await loadScript(config.wasmEntrypoint);
  await initialized;
  if (!Module.FS || typeof Module.callMain !== 'function') {
    throw new Error('WASM build is missing FS/callMain exports. Rebuild with npm run build:engine.');
  }
  await mountAssets(Module, config, manifest, fetchFile, onProgress);
  await beforeMain();
  const exitCode = Module.callMain(['/ut']);
  if (typeof exitCode === 'number' && exitCode !== 0) {
    throw new Error(`Engine startup failed with exit code ${exitCode}.`);
  }
  return Module;
}
