const ResolverModule = require('@forge/resolver');
const Resolver = ResolverModule.default || ResolverModule.Resolver || ResolverModule;

const resolver = new Resolver();

resolver.define('getRuntimeConfig', () => ({
  assetBaseUrl: process.env.SURREAL_ASSET_BASE_URL || 'ut99/',
  websocketUrl: process.env.SURREAL_WS_URL || '',
  wasmEntrypoint: 'wasm/surreal-engine.js',
  wasmBinary: 'wasm/surreal-engine.wasm.gz',
  dataArchive: 'wasm/surreal-engine.data',
}));

exports.handler = resolver.getDefinitions();
