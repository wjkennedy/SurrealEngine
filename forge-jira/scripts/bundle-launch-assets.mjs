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
// Bonus-pack model registrations require another model/skin set. Ship the four
// original human models and one complete offline arena within the Forge budget.
manifest.bootstrapFiles = manifest.bootstrapFiles.filter(file =>
  !/^System\/(multimesh|tcowmeshskins|tnalimeshskins|tskmskins|BossSkins)\.int$/i.test(file));
manifest.bootstrapFiles = await launchDependencies(source, [...manifest.bootstrapFiles,
  'Maps/DM-Closer.unr',
  'System/relicsbindings.u', 'Textures/LadderFonts.utx', 'Textures/LadrStatic.utx', 'Textures/Soldierskins.utx',
  'Textures/commandoskins.utx', 'Textures/FCommandoSkins.utx', 'Textures/SGirlSkins.utx',
  'Music/Credits.umx', 'Music/Course.umx', 'Music/utmenu23.umx',
  'Textures/UWindowFonts.utx', 'Textures/MenuGr.utx', 'Textures/Palettes.utx', 'Textures/Faces.utx']);
// Preserve the complete import closure, including arena music and bot voices.
manifest.bootstrapCount = manifest.bootstrapFiles.length;
manifest.compression = 'gzip';
// These text overrides are applied to the packaged copies, leaving the original
// game installation intact. Never advertise a model whose skin is not shipped.
manifest.textOverrides = {};
const botpackInt = await readFile(path.join(source, 'System/Botpack.int'), 'utf8');
manifest.textOverrides['System/Botpack.int'] = botpackInt.split(/\r?\n/)
  .filter(line => !/Name=BotPack\.TBoss(?:Bot)?,/i.test(line)).join('\r\n');
for (const name of ['User.ini', 'DefUser.ini']) {
  const text = await readFile(path.join(source, 'System', name), 'utf8');
  manifest.textOverrides[`System/${name}`] = text
    .replace(/^F7=.*$/m, 'F7=MenuCmd 2 1\r')
    .replace(/^F8=.*$/m, 'F8=MenuCmd 0 1\r');
}
let bytes = 0;
for (const file of manifest.bootstrapFiles) bytes += (await stat(path.join(source, file))).size;
const result = spawnSync('python3', [fileURLToPath(new URL('./compress-assets.py', import.meta.url)), source, target], {
  input: JSON.stringify(manifest), encoding: 'utf8',
});
if (result.status !== 0) throw new Error(result.stderr || 'Asset compression failed');
console.log(result.stdout.trim());
console.log(`Bundled ${manifest.bootstrapFiles.length} UT99 startup files (${bytes} bytes uncompressed).`);
