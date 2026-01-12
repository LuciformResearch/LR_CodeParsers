/**
 * Debug test to see what identifierReferences are extracted
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const { ScopeExtractionParser, RelationshipResolver } = await import('./dist/esm/index.js');

const TEST_CODE = `
import { User, Admin, Repository, Cache, BaseEntity } from './types';

// Generic function with constraint
export function findById<T extends BaseEntity>(repo: Repository<T>, id: string): T | undefined {
  return repo.find(id);
}

// Function with nested generics in parameter
export function processUsers(cache: Cache<string, Array<User>>): void {
  console.log('processing');
}

// Function with union type parameter
export function handlePerson(person: User | Admin): string {
  return person.name;
}
`;

async function main() {
  const parser = new ScopeExtractionParser();
  const analysis = await parser.parseFile('/tmp/test/service.ts', TEST_CODE);

  console.log('=== Parsed Scopes ===\n');

  for (const scope of analysis.scopes) {
    console.log(`\n--- ${scope.name} (${scope.type}) ---`);
    console.log(`Signature: ${scope.signature}`);
    console.log(`Lines: ${scope.startLine}-${scope.endLine}`);

    if (scope.identifierReferences && scope.identifierReferences.length > 0) {
      console.log(`\nidentifierReferences (${scope.identifierReferences.length}):`);
      for (const ref of scope.identifierReferences) {
        console.log(`  - ${ref.identifier} (line ${ref.line}, kind: ${ref.kind || 'unknown'})`);
        if (ref.context) {
          console.log(`    context: ${ref.context.substring(0, 60)}...`);
        }
      }
    } else {
      console.log('\nNo identifierReferences');
    }

    if (scope.importReferences && scope.importReferences.length > 0) {
      console.log(`\nimportReferences (${scope.importReferences.length}):`);
      for (const ref of scope.importReferences) {
        console.log(`  - ${ref.imported} from ${ref.source} (${ref.kind}, local: ${ref.isLocal})`);
      }
    }
  }

  // Also test relationship resolution
  console.log('\n\n=== Relationship Resolution ===\n');

  const typesCode = `
export interface User { id: string; name: string; }
export interface Admin extends User { permissions: string[]; }
export interface Repository<T> { find(id: string): T; }
export class Cache<K, V> { get(key: K): V | undefined { return undefined; } }
export class BaseEntity { id: string = ''; }
`;

  const analysis2 = await parser.parseFile('/tmp/test/types.ts', typesCode);

  const parsedFiles = new Map();
  parsedFiles.set('/tmp/test/service.ts', analysis);
  parsedFiles.set('/tmp/test/types.ts', analysis2);

  const resolver = new RelationshipResolver({
    projectRoot: '/tmp/test',
    defaultLanguage: 'typescript',
    includeContains: true,
    includeInverse: false,
    debug: true,
  });

  const result = await resolver.resolveRelationships(parsedFiles);

  console.log('\nRelationships found:');
  for (const rel of result.relationships) {
    if (rel.type === 'CONSUMES' || rel.type === 'INHERITS_FROM' || rel.type === 'IMPLEMENTS') {
      console.log(`  ${rel.fromName} (${rel.fromType}) --${rel.type}--> ${rel.toName} (${rel.toType})`);
      console.log(`    from: ${path.basename(rel.fromFile)}, to: ${path.basename(rel.toFile)}`);
    }
  }

  console.log('\nUnresolved:');
  for (const unres of result.unresolvedReferences) {
    console.log(`  ${unres.fromScope} → ${unres.identifier}: ${unres.reason}`);
  }
}

main().catch(console.error);
