/**
 * Debug classifyScopeReferences
 */

const { ScopeExtractionParser } = await import('./dist/esm/index.js');

// Patch ensureImportReferencesTracked
const origEnsure = ScopeExtractionParser.prototype.ensureImportReferencesTracked;
ScopeExtractionParser.prototype.ensureImportReferencesTracked = function(scope, fileImports, aliasMap) {
  console.log(`\n=== ensureImportReferencesTracked for ${scope.name} ===`);
  console.log(`  identifierReferences BEFORE: [${scope.identifierReferences.map(r => r.identifier).join(', ')}]`);
  origEnsure.call(this, scope, fileImports, aliasMap);
  console.log(`  identifierReferences AFTER: [${scope.identifierReferences.map(r => r.identifier).join(', ')}]`);
};

// Patch classifyScopeReferences to show importReferences additions
const origClassify = ScopeExtractionParser.prototype.classifyScopeReferences;
ScopeExtractionParser.prototype.classifyScopeReferences = function(scopes, fileImports) {
  const aliasMap = new Map();
  for (const imp of fileImports) {
    const key = imp.alias ?? imp.imported;
    if (key) aliasMap.set(key, imp);
  }

  const scopeIndex = new Map();
  for (const scope of scopes) {
    const bucket = scopeIndex.get(scope.name) ?? [];
    bucket.push(scope);
    scopeIndex.set(scope.name, bucket);
  }

  for (const scope of scopes) {
    console.log(`\n=== Processing ${scope.name} in classifyScopeReferences ===`);
    console.log(`  importReferences BEFORE: [${scope.importReferences.map(r => r.imported).join(', ')}]`);

    // Call ensureImportReferencesTracked
    this.ensureImportReferencesTracked(scope, fileImports, aliasMap);

    // Process identifierReferences
    scope.identifierReferences = scope.identifierReferences
      .map((ref) => {
        const aliasKey = ref.qualifier ?? ref.identifier;
        const importMatch = aliasKey ? aliasMap.get(aliasKey) : undefined;

        if (importMatch) {
          ref.kind = 'import';
          ref.source = importMatch.source;
          ref.isLocalImport = importMatch.isLocal;

          const alreadyPresent = scope.importReferences.some(ir =>
            ir.source === importMatch.source &&
            ir.imported === importMatch.imported
          );
          console.log(`  Checking ${ref.identifier}: importMatch=${importMatch.imported}, alreadyPresent=${alreadyPresent}`);

          if (!alreadyPresent) {
            scope.importReferences.push(importMatch);
            console.log(`    -> ADDED to importReferences`);
          }
          return ref;
        }

        const localTargets = scopeIndex.get(ref.identifier);
        if (localTargets && localTargets.length) {
          ref.kind = 'local_scope';
          const target = localTargets[0];
          ref.targetScope = `${target.filePath ?? ''}::${target.name}:${target.startLine}-${target.endLine}`;
          return ref;
        }

        ref.kind = 'unknown';
        return ref;
      })
      .filter((ref) => ref.kind !== 'builtin');

    console.log(`  importReferences AFTER: [${scope.importReferences.map(r => r.imported).join(', ')}]`);
  }

  return scopeIndex;
};

const TEST_CODE = `
import { User, Admin, Repository, Cache, BaseEntity } from './types';

export function findById<T extends BaseEntity>(repo: Repository<T>, id: string): T | undefined {
  return repo.find(id);
}
`;

async function main() {
  const parser = new ScopeExtractionParser();
  const analysis = await parser.parseFile('/tmp/test/service.ts', TEST_CODE);
}

main().catch(console.error);
