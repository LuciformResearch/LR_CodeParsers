/**
 * Debug test to understand why some identifierReferences don't get linked to imports
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const { ScopeExtractionParser } = await import('./dist/esm/index.js');

const TEST_CODE = `
import { User, Admin, Repository, Cache, BaseEntity } from './types';

export function findById<T extends BaseEntity>(repo: Repository<T>, id: string): T | undefined {
  return repo.find(id);
}
`;

async function main() {
  const parser = new ScopeExtractionParser();
  const analysis = await parser.parseFile('/tmp/test/service.ts', TEST_CODE);

  console.log('=== File-level imports (should have all 5) ===\n');
  const fileScope = analysis.scopes.find(s => s.type === 'module');
  if (fileScope && fileScope.importReferences) {
    for (const imp of fileScope.importReferences) {
      console.log(`  ${imp.imported} from ${imp.source} (kind: ${imp.kind}, isLocal: ${imp.isLocal})`);
    }
  }

  console.log('\n=== findById scope details ===\n');
  const findByIdScope = analysis.scopes.find(s => s.name === 'findById');

  if (findByIdScope) {
    console.log('identifierReferences:');
    for (const ref of findByIdScope.identifierReferences || []) {
      console.log(`  identifier: "${ref.identifier}"`);
      console.log(`    kind: ${ref.kind}`);
      console.log(`    qualifier: ${ref.qualifier || '(none)'}`);
      console.log(`    line: ${ref.line}`);
      console.log(`    source: ${ref.source || '(none)'}`);
      console.log('');
    }

    console.log('importReferences (resolved):');
    for (const imp of findByIdScope.importReferences || []) {
      console.log(`  ${imp.imported} from ${imp.source} (kind: ${imp.kind})`);
    }
  }

  // Now let's manually test the resolveImportsForScope logic
  console.log('\n=== Manual import resolution test ===\n');

  const fileImports = fileScope?.importReferences || [];
  const identRefs = findByIdScope?.identifierReferences || [];

  console.log(`File imports (${fileImports.length}):`);
  for (const imp of fileImports) {
    const alias = imp.alias ?? imp.imported;
    console.log(`  - alias/imported: "${alias}" (from ${imp.source})`);
  }

  console.log(`\nIdentifier refs to match (${identRefs.length}):`);
  for (const ref of identRefs) {
    const matchingImport = fileImports.find(imp => {
      const alias = imp.alias ?? imp.imported;
      if (!alias) return false;
      if (ref.qualifier) {
        return alias === ref.qualifier;
      }
      return alias === ref.identifier;
    });

    if (matchingImport) {
      console.log(`  ✓ "${ref.identifier}" → matched with import "${matchingImport.imported}"`);
    } else {
      console.log(`  ✗ "${ref.identifier}" → NO MATCH FOUND`);
      console.log(`    (qualifier: "${ref.qualifier || 'none'}")`);
    }
  }
}

main().catch(console.error);
