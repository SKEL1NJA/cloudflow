import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = path.resolve(import.meta.dirname, '../dist');
const budgetKb = Number(process.env.INITIAL_BUDGET_KB ?? 250);

if (!existsSync(path.join(dist, 'index.html'))) {
  console.error('No build found. Run "npm run build -w apps/web" first.');
  process.exit(1);
}

const assets = readdirSync(path.join(dist, 'assets'))
  .filter((file) => file.endsWith('.js') || file.endsWith('.css'))
  .map((file) => {
    const content = readFileSync(path.join(dist, 'assets', file));
    return { file, raw: content.length, gzip: gzipSync(content).length };
  });

const html = readFileSync(path.join(dist, 'index.html'), 'utf8');
const initial = new Set(
  [...html.matchAll(/(?:src|href)="\/assets\/([^"]+\.(?:js|css))"/g)].map((match) => match[1]),
);

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;
const rows = [...assets].sort((a, b) => b.gzip - a.gzip);
const width = Math.max(...rows.map((row) => row.file.length));

console.log(`${'asset'.padEnd(width)}  ${'raw'.padStart(10)}  ${'gzip'.padStart(10)}  loaded`);
for (const row of rows) {
  const loaded = initial.has(row.file) ? 'on first load' : 'on demand';
  console.log(
    `${row.file.padEnd(width)}  ${kb(row.raw).padStart(10)}  ${kb(row.gzip).padStart(10)}  ${loaded}`,
  );
}

const initialGzip = assets
  .filter((asset) => initial.has(asset.file))
  .reduce((sum, asset) => sum + asset.gzip, 0);
const totalGzip = assets.reduce((sum, asset) => sum + asset.gzip, 0);
console.log(`\nFirst load: ${kb(initialGzip)} gzip (budget ${budgetKb} kB)`);
console.log(`Everything: ${kb(totalGzip)} gzip across ${assets.length} files`);

if (initialGzip > budgetKb * 1024) {
  console.error(`\nOver budget by ${kb(initialGzip - budgetKb * 1024)}.`);
  process.exit(1);
}
