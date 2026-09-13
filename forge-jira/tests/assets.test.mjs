import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inspectGame, main } from '../scripts/game-assets.mjs';

for (const [directory, ini, game] of [['SYSTEM', 'Unreal.ini', 'unreal-gold'], ['System', 'UnrealTournament.ini', 'ut99']]) {
  test(`staging and manifest paths agree for ${game}`, async () => {
    const temp = await mkdtemp(path.join(tmpdir(), 'surreal-assets-'));
    try {
      const source = path.join(temp, 'source');
      await mkdir(path.join(source, directory), { recursive: true });
      for (const file of ['Core.u', 'Engine.u', ini]) await writeFile(path.join(source, directory, file), file);
      const { manifest } = await inspectGame(source);
      assert.equal(manifest.game, game);
      const output = path.join(temp, 'staged');
      await main(['stage', source, output]);
      for (const file of manifest.bootstrapFiles) {
        assert.equal(await readFile(path.join(output, file), 'utf8'), path.basename(file));
      }
      assert.deepEqual(JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8')), manifest);
    } finally { await rm(temp, { recursive: true, force: true }); }
  });
}
