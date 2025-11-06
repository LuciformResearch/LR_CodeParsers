import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CJS_DIR = 'dist/cjs';
await mkdir(CJS_DIR, { recursive: true });
await writeFile(join(CJS_DIR, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2));
console.log('[write-cjs-type] wrote dist/cjs/package.json { type: "commonjs" }');
