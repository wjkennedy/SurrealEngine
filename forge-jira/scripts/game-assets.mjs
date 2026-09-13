import { readdir, mkdir, writeFile, cp } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const folders = ['System', 'Maps', 'Textures', 'Sounds', 'Music'];

export async function inspectGame(sourceRoot) {
  const root = path.resolve(sourceRoot);
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  async function walk(actual, relative) {
    for (const entry of await readdir(actual, { withFileTypes: true })) {
      const absolute = path.join(actual, entry.name);
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await walk(absolute, name);
      else if (entry.isFile()) files.push({ source: absolute, relative: name });
    }
  }
  for (const folder of folders) {
    const entry = entries.find(item => item.isDirectory() && item.name.toLowerCase() === folder.toLowerCase());
    if (entry) await walk(path.join(root, entry.name), folder);
  }
  files.sort((a, b) => a.relative.localeCompare(b.relative));
  const byName = new Map(files.map(file => [file.relative.toLowerCase(), file.relative]));
  if (byName.size !== files.length) throw new Error('Game source contains ambiguous case-insensitive file names.');
  const ut = byName.has('system/unrealtournament.ini');
  const game = ut ? 'ut99' : 'unreal-gold';
  const ini = ut ? 'UnrealTournament.ini' : 'Unreal.ini';
  const required = ['System/Core.u', 'System/Engine.u', `System/${ini}`];
  for (const file of required) {
    if (!byName.has(file.toLowerCase())) throw new Error(`Missing required game file: ${file}`);
  }
  const bootstrap = [...required, 'System/Default.ini', 'System/DefUser.ini', 'System/User.ini',
    ...(ut ? ['System/Fire.u', 'System/IpDrv.u', 'System/IpServer.u', 'System/UBrowser.u',
      'System/UTBrowser.u', 'System/UWindow.u', 'System/UWeb.u', 'System/UnrealI.u',
      'System/UnrealShare.u', 'System/Botpack.u', 'System/UMenu.u', 'System/UTMenu.u',
      'System/UTServerAdmin.u'] : []),
    ...files.filter(file => file.relative.startsWith('System/') && /\.int$/i.test(file.relative)).map(file => file.relative),
    'Maps/Entry.unr'];
  const bootstrapFiles = [...new Set(bootstrap.map(file => byName.get(file.toLowerCase())).filter(Boolean))];
  return { files, manifest: { game, mountPoint: '/ut', bootstrapCount: bootstrapFiles.length, bootstrapFiles } };
}

export async function main([command, source, output]) {
  if (!source || !output || !['manifest', 'stage'].includes(command)) {
    throw new Error('Usage: game-assets.mjs <manifest|stage> <game-directory> <output>');
  }
  const { files, manifest } = await inspectGame(source);
  if (command === 'stage') {
    const sourcePath = path.resolve(source);
    const targetPath = path.resolve(output);
    if (targetPath === sourcePath || targetPath.startsWith(sourcePath + path.sep) || sourcePath.startsWith(targetPath + path.sep)) {
      throw new Error('Stage game assets to a separate directory outside the source tree.');
    }
    for (const file of files) {
      const target = path.join(targetPath, file.relative);
      await mkdir(path.dirname(target), { recursive: true });
      await cp(file.source, target);
    }
    await writeFile(path.join(targetPath, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Staged ${files.length} ${manifest.game} files to ${targetPath}`);
  } else {
    if (process.env.SURREAL_INCLUDE_FULL_LIST === '1') {
      manifest.allFileCount = files.length;
      manifest.allFiles = files.map(file => file.relative);
    }
    await mkdir(path.dirname(path.resolve(output)), { recursive: true });
    await writeFile(output, JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Wrote ${manifest.game} manifest: ${output} (${manifest.bootstrapCount} bootstrap files)`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
