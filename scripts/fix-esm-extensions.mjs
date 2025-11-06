import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ESM_DIR = 'dist/esm';

const exts = ['.js', '.json'];

const relRe = /(from\s+['"])(\.\.?\/[^'"\n]+)(['"];?)/g;
const expRe = /(export\s+\*\s+from\s+['"])(\.\.?\/[^'"\n]+)(['"];?)/g;

function needsExt(spec) {
  return spec.startsWith('./') || spec.startsWith('../');
}

function hasKnownExt(spec) {
  return exts.some((e) => spec.endsWith(e));
}

async function processFile(fp) {
  let src = await readFile(fp, 'utf8');
  const replace = (match, p1, spec, p3) => {
    if (!needsExt(spec) || hasKnownExt(spec)) return match;
    return `${p1}${spec}.js${p3}`;
  };
  src = src.replace(relRe, replace).replace(expRe, replace);
  await writeFile(fp, src, 'utf8');
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (e.isFile() && p.endsWith('.js')) await processFile(p);
  }
}

await walk(ESM_DIR).catch((e) => {
  console.error('[fix-esm-extensions] error:', e?.message || e);
  process.exit(1);
});
console.log('[fix-esm-extensions] patched ESM imports with .js extensions');
