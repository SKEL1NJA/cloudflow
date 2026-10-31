import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const [app, requestedEntry] = process.argv.slice(2);

if (!app) {
  console.error('Usage: node scripts/bundle.mjs <app> [entry]');
  process.exit(1);
}

const appDir = path.join(root, 'apps', app);
const candidates = requestedEntry
  ? [requestedEntry]
  : ['src/index.ts', 'src/server.ts', 'src/main.ts'];
const entry = candidates.map((file) => path.join(appDir, file)).find((file) => existsSync(file));

if (!entry) {
  console.error(`No entry file found in ${appDir}. Tried: ${candidates.join(', ')}`);
  process.exit(1);
}

const externalDependencies = {
  name: 'external-dependencies',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.kind === 'entry-point') return undefined;
      if (args.path.startsWith('@cloudflow/') || args.path.startsWith('node:')) return undefined;
      return { path: args.path, external: true };
    });
  },
};

const outfile = path.join(appDir, 'dist', 'index.mjs');

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  logLevel: 'info',
  plugins: [externalDependencies],
});

console.log(`Bundled ${path.relative(root, entry)} into ${path.relative(root, outfile)}`);
