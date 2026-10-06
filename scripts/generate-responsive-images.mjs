import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Reuse an installed sharp; no network downloads or edits to the originals.
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const root = path.resolve(import.meta.dirname, '..');
const publicRoot = path.join(root, 'client/public');
const contentRoot = path.join(root, 'client/src/content');
const entries = new Map();
function add(source, kind) {
  if (!source?.startsWith('/history-quest/uploads/')) return;
  if (!entries.has(source)) entries.set(source, new Set());
  entries.get(source).add(kind);
}
const json = async name => JSON.parse(await fs.readFile(path.join(contentRoot, name), 'utf8'));
add((await json('settings/site.json')).hero, 'hero');
for (const item of (await json('settings/backgrounds.json')).backgrounds) add(item.image, 'hero');
for (const item of (await json('settings/cards.json')).cards) add(item.image, 'card');
for (const filename of await fs.readdir(path.join(contentRoot, 'tasks'))) {
  if (filename.endsWith('.json')) add((await json(`tasks/${filename}`)).image, 'task');
}
const manifest = {};
const output = path.join(publicRoot, 'uploads/responsive');
await fs.mkdir(output, { recursive: true });
for (const [source, kinds] of entries) {
  const original = path.join(publicRoot, source.slice('/history-quest/'.length));
  const bytes = await fs.readFile(original);
  const metadata = await sharp(bytes).metadata();
  const stats = await sharp(bytes).stats();
  if (metadata.pages > 1) throw new Error(`Animated source must not be flattened: ${source}`);
  const width = metadata.width;
  const height = metadata.height;
  const quality = kinds.has('card') ? 94 : 92;
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const token = createHash('sha256').update(bytes).update(`webp-q${quality}-v1`).digest('hex').slice(0, 16);
  const candidates = kinds.has('hero') ? [480, 768, 1024, 1440, 1920, width] : kinds.has('card') ? [320, 480, 768, width] : [320, 480, 768, 1024, width];
  const widths = [...new Set(candidates.filter(value => value <= width))].sort((a, b) => a - b);
  const variants = [];
  for (const size of widths) {
    const filename = `${token}-${size}.webp`;
    try { await fs.access(path.join(output, filename)); }
    catch {
      await sharp(bytes).resize({ width: size, withoutEnlargement: true, kernel: 'lanczos3' })
        .webp({ quality, alphaQuality: 100, effort: 6 }).toFile(path.join(output, filename));
    }
    const result = await sharp(path.join(output, filename)).metadata();
    if (!stats.isOpaque && !result.hasAlpha) throw new Error(`Transparency lost: ${source}`);
    variants.push({ src: `/history-quest/uploads/responsive/${filename}`, width: result.width, height: result.height, bytes: (await fs.stat(path.join(output, filename))).size });
  }
  manifest[source] = { width, height, bytes: bytes.length, sha256, hasAlpha: metadata.hasAlpha, isOpaque: stats.isOpaque, quality, kinds: [...kinds], variants };
  console.log(`${source}: ${bytes.length} -> ${variants.at(-1).bytes} bytes (${variants.length} sizes)`);
}
await fs.writeFile(path.join(contentRoot, 'settings/responsive-images.json'), JSON.stringify(manifest, null, 2) + '\n');
