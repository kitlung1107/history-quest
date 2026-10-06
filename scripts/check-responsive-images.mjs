import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'client/src/content/settings/responsive-images.json'), 'utf8'));
const local = url => path.join(root, 'client/public', url.slice('/history-quest/'.length));
for (const [source, asset] of Object.entries(manifest)) {
  const original = fs.readFileSync(local(source));
  if (createHash('sha256').update(original).digest('hex') !== asset.sha256) throw new Error(`Responsive images are stale for ${source}. Run generate-responsive-images.mjs with sharp installed before building.`);
  for (const variant of asset.variants) if (fs.statSync(local(variant.src)).size !== variant.bytes) throw new Error(`Missing/truncated derivative: ${variant.src}`);
}
console.log(`Responsive image manifest valid: ${Object.keys(manifest).length} unchanged originals`);
