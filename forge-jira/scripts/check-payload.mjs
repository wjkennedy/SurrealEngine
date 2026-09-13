import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../static/surreal/dist/', import.meta.url));
async function sizeOf(directory) {
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    bytes += entry.isDirectory() ? await sizeOf(file) : (await stat(file)).size;
  }
  return bytes;
}
const bytes = await sizeOf(root);
console.log(`Static payload: ${bytes} / 100000000 bytes`);
if (bytes > 100000000) throw new Error('Static Forge payload exceeds the 100 MB budget.');
