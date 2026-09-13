import './styles.css';
import { validateManifest, startRuntime } from './runtime.js';

const root = document.getElementById('root');

root.innerHTML = `
  <main class="shell">
    <section class="topbar" aria-label="Engine controls">
      <div class="brand">
        <img src="./surreal-engine-icon-64.png" alt="" />
        <span>Surreal Engine</span>
      </div>
      <div class="status" id="status">Preparing runtime</div>
    </section>

    <section class="viewport" aria-label="Surreal Engine viewport">
      <canvas id="canvas" tabindex="0"></canvas>
      <div class="controls-hint" id="controls-hint" role="note" hidden>
        <strong>Controls</strong> · WASD move · Mouse look · Left click fire · Right click alt-fire · Space jump · P menu
      </div>
      <pre class="asset-log" id="asset-log" aria-live="polite"></pre>
      <div class="overlay" id="overlay">
        <h1>Preparing Surreal Engine</h1>
        <p>Checking the browser runtime and game assets.</p>
      </div>
    </section>

    <section class="bottombar" aria-label="Runtime details">
      <span id="wasm-state">WASM: pending</span>
      <span id="webgpu-state">WebGL 2: checking</span>
      <span id="asset-state">Assets: not configured</span>
      <span id="socket-state">WebSocket: disabled</span>
    </section>
  </main>
`;

const canvas = document.getElementById('canvas');
const overlay = document.getElementById('overlay');
const status = document.getElementById('status');
const wasmState = document.getElementById('wasm-state');
const webgpuState = document.getElementById('webgpu-state');
const assetState = document.getElementById('asset-state');
const socketState = document.getElementById('socket-state');
const assetLog = document.getElementById('asset-log');
const controlsHint = document.getElementById('controls-hint');

window.addEventListener('keydown', event => {
  if (event.key.toLowerCase() !== 'p' || wasmState.textContent !== 'WASM: running') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (overlay.hidden) showBrowserMenu();
}, true);

function logAsset(message) {
  const lines = assetLog.textContent ? assetLog.textContent.split('\n') : [];
  lines.push(`[${new Date().toLocaleTimeString()}] ${message}`);
  assetLog.textContent = lines.slice(-80).join('\n');
  assetLog.scrollTop = assetLog.scrollHeight;
}

function setStatus(message) {
  status.textContent = message;
}

function setOverlay(title, detail) {
  overlay.querySelector('h1').textContent = title;
  overlay.querySelector('p').textContent = detail;
  overlay.hidden = false;
}

function showBrowserMenu() {
  overlay.innerHTML = '<h1>Surreal Tournament</h1><p>WASD move · Mouse look · Left click fire · Right click alt-fire · Space jump</p><button type="button" id="resume-game">Resume</button>';
  overlay.hidden = false;
  document.getElementById('resume-game').addEventListener('click', () => {
    overlay.hidden = true;
    canvas.focus();
  }, { once: true });
}

function getDefaultConfig() {
  return {
    assetBaseUrl: 'ut99/',
    websocketUrl: '',
    wasmEntrypoint: 'wasm/surreal-engine.js',
    wasmBinary: 'wasm/surreal-engine.wasm.gz',
    dataArchive: 'wasm/surreal-engine.data',
  };
}

function getErrorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

async function safeFetch(url, options = {}) {
  try {
    const response = await fetch(url, options);
    return response;
  } catch (error) {
    const message = `Fetch failed: ${url} (${getErrorMessage(error)})`;
    window.SurrealLastFetchError = message;
    throw new Error(message);
  }
}

function resizeCanvas() {
  const bounds = canvas.parentElement.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(bounds.width * scale));
  canvas.height = Math.max(1, Math.floor(bounds.height * scale));
  canvas.style.width = `${bounds.width}px`;
  canvas.style.height = `${bounds.height}px`;
}

async function loadScript(src) {
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function connectWebSocket(url) {
  if (!url) {
    socketState.textContent = 'WebSocket: disabled';
    return null;
  }

  const socket = new WebSocket(url);
  socket.binaryType = 'arraybuffer';
  socket.addEventListener('open', () => {
    socketState.textContent = 'WebSocket: connected';
  });
  socket.addEventListener('close', () => {
    socketState.textContent = 'WebSocket: closed';
  });
  socket.addEventListener('error', () => {
    socketState.textContent = 'WebSocket: error';
  });
  window.SurrealMultiplayerSocket = socket;
  return socket;
}

async function initializeWebGPU() {
  const probe = document.createElement('canvas');
  if (!probe.getContext('webgl2')) throw new Error('WebGL 2 is not available in this browser.');
  webgpuState.textContent = 'WebGL 2: available';
}

function joinUrl(baseUrl, relativePath) {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(relativePath, base).toString();
}

async function checkAssets(assetBaseUrl) {
  if (!assetBaseUrl) {
    assetState.textContent = 'Assets: not configured';
    return null;
  }

  const manifestUrl = joinUrl(assetBaseUrl, 'manifest.json');
  let response = await safeFetch(manifestUrl, { method: 'GET', mode: 'cors' });
  if (!response.ok) {
    assetState.textContent = 'Assets: unavailable';
    const message = `Manifest HTTP ${response.status}: ${manifestUrl}`;
    window.SurrealAssetBootstrapError = message;
    throw new Error(message);
  }

  const manifest = await response.json();
  validateManifest(manifest);

  assetState.textContent = 'Assets: available';
  window.SurrealAssetBaseUrl = assetBaseUrl;
  window.SurrealAssetManifest = manifest;
  return manifest;
}

async function boot() {
  assetLog.textContent = '';
  logAsset('Launch started');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  let config;
  try {
    if (window.parent === window) {
      config = getDefaultConfig();
    } else {
      const { invoke } = await import('@forge/bridge');
      config = await invoke('getRuntimeConfig');
    }
  } catch (error) {
    const message = getErrorMessage(error);
    console.error('Forge bridge invoke(getRuntimeConfig) failed:', error);
    window.SurrealForgeBridgeError = message;
    config = getDefaultConfig();
    setStatus('Bridge fallback');
    setOverlay('Forge bridge fallback', `Using default runtime config because getRuntimeConfig failed: ${message}`);
  }

  config.assetBaseUrl = new URL(config.assetBaseUrl, document.baseURI).href;
  config.wasmBinary = new URL(config.wasmBinary, document.baseURI).href;
  config.wasmEntrypoint = new URL(config.wasmEntrypoint, document.baseURI).href;
  await initializeWebGPU();
  const manifest = await checkAssets(config.assetBaseUrl);
  logAsset(`Manifest ready: ${manifest.bootstrapFiles.length} startup files (${manifest.compression || 'raw'})`);

  setStatus('Loading WASM');
  wasmState.textContent = 'WASM: loading';
  logAsset(`Loading engine: ${config.wasmBinary}`);
  await startRuntime({
    config, manifest, canvas, loadScript, fetchFile: safeFetch,
    onLog: logAsset,
    onProgress(done, total, path) {
      assetState.textContent = `Assets: loaded ${done}/${total}`;
      logAsset(`Mounted ${done}/${total}: ${path}`);
    },
    onFailure: reportFailure,
    async beforeMain() {
      setStatus('Ready to launch');
      setOverlay('Unreal Tournament', 'The game is ready. Click Play to start.');
      const play = document.createElement('button');
      play.textContent = 'Play Unreal Tournament';
      overlay.appendChild(play);
      await new Promise(resolve => play.addEventListener('click', resolve, { once: true }));
      play.remove();
      setStatus('Starting game');
      logAsset('Assets complete; starting Unreal Tournament');
      setOverlay('Starting Unreal Tournament', 'Loading the intro map…');
    },
    onInitialized() {
      wasmState.textContent = 'WASM: running';
      setStatus('Running');
      overlay.hidden = true;
      controlsHint.hidden = false;
      assetLog.textContent = '';
      assetLog.hidden = true;
      canvas.focus();
      connectWebSocket(config.websocketUrl);
    },
  });
}

function reportFailure(error) {
  console.error(error);
  window.SurrealRuntimeError = getErrorMessage(error);
  wasmState.textContent = 'WASM: failed';
  setStatus('Runtime failed');
  assetLog.hidden = false;
  logAsset(`ERROR: ${getErrorMessage(error)}`);
  setOverlay('Runtime failed', getErrorMessage(error));
}

boot().catch(reportFailure);
