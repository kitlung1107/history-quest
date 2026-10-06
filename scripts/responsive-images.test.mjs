import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'client/src/content/settings/responsive-images.json'), 'utf8'));
const local = source => path.join(root, 'client/public', source.slice('/history-quest/'.length));
const checks = [];
for (const [source, asset] of Object.entries(manifest)) {
  const original = await fs.readFile(local(source));
  assert.equal(createHash('sha256').update(original).digest('hex'), asset.sha256, `Original changed: ${source}`);
  const meta = await sharp(original).metadata();
  assert.equal(meta.width, asset.width);
  assert.equal(meta.height, asset.height);
  let previous = 0;
  for (const variant of asset.variants) {
    const bytes = await fs.readFile(local(variant.src));
    const m = await sharp(bytes).metadata();
    assert.equal(m.format, 'webp');
    assert.equal(bytes.length, variant.bytes);
    assert.equal(m.width, variant.width);
    assert.ok(m.width > previous && m.width <= asset.width);
    assert.ok(Math.abs(m.height - asset.height * m.width / asset.width) <= 0.5, `Aspect ratio changed: ${source}`);
    if (!asset.isOpaque) assert.ok(m.hasAlpha, `Transparency lost: ${source}`);
    previous = m.width;
  }
  const largest = asset.variants.at(-1);
  assert.equal(largest.width, asset.width, 'Full resolution derivative retained');
  const a = await sharp(original).removeAlpha().raw().toBuffer();
  const b = await sharp(local(largest.src)).removeAlpha().raw().toBuffer();
  assert.equal(a.length, b.length);
  let error = 0;
  for (let i = 0; i < a.length; i++) error += (a[i] - b[i]) ** 2;
  const psnr = error === 0 ? 100 : 10 * Math.log10(255 ** 2 / (error / a.length));
  assert.ok(psnr >= 30, `Compression too destructive: ${source} ${psnr.toFixed(2)}dB`);
  checks.push({ source, originalBytes: original.length, largestBytes: largest.bytes, psnrDb: Number(psnr.toFixed(2)), alpha: Boolean(meta.hasAlpha), opaque: asset.isOpaque });
}
await fs.mkdir(path.join(root, 'tmp/image-review'), { recursive: true });
await fs.writeFile(path.join(root, 'tmp/image-review/asset-checks.json'), JSON.stringify(checks, null, 2));
console.log(`PASS: ${checks.length} original hashes, derivative dimensions/bytes/alpha, full-size PSNR >= 30 dB`);
