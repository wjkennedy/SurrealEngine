import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { launchDependencies } from './package-dependencies.mjs';
import { validateManifest } from '../static/surreal/src/runtime.js';

const source = path.resolve(process.argv[2] || fileURLToPath(new URL('../asset-staging/ut99/', import.meta.url)));
const target = fileURLToPath(new URL('../static/surreal/public/ut99/', import.meta.url));
const manifest = validateManifest(JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8')));
if (manifest.game !== 'ut99') throw new Error('Expected a UT99 asset manifest.');
// Resolve Unreal package imports from the startup set so maps do not fail one
// package at a time. This remains bounded to the launch dependency closure,
// rather than bundling every optional/editor/anti-cheat asset in the archive.
manifest.bootstrapFiles = await launchDependencies(source, [...manifest.bootstrapFiles,
  'Maps/DM-Tutorial.unr', 'Textures/LadderFonts.utx', 'Textures/Soldierskins.utx']);
// Music is optional for the browser bootstrap; keep the player skin package
// available so the default TMale2 pawn has its actual texture data.
manifest.bootstrapFiles = manifest.bootstrapFiles.filter(file => !/^Music\//i.test(file));
manifest.bootstrapCount = manifest.bootstrapFiles.length;
manifest.compression = 'gzip';
let bytes = 0;
for (const file of manifest.bootstrapFiles) bytes += (await stat(path.join(source, file))).size;
const result = spawnSync('python3', [fileURLToPath(new URL('./compress-assets.py', import.meta.url)), source, target], {
  input: JSON.stringify(manifest), encoding: 'utf8',
});
if (result.status !== 0) throw new Error(result.stderr || 'Asset compression failed');
console.log(result.stdout.trim());
console.log(`Bundled ${manifest.bootstrapFiles.length} UT99 startup files (${bytes} bytes uncompressed).`);
