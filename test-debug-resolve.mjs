/**
 * Debug to understand resolveImportsForScope
 */

const { ScopeExtractionParser } = await import('./dist/esm/index.js');

// Patch the parser to add debug output
const originalResolveImportsForScope = ScopeExtractionParser.prototype.resolveImportsForScope;
ScopeExtractionParser.prototype.resolveImportsForScope = function(references, fileImports) {
  console.log('\n=== resolveImportsForScope called ===');
  console.log('fileImports:', fileImports.map(i => `${i.imported} from ${i.source}`).join(', '));
  console.log('references:', references.map(r => `${r.identifier} (qualifier: ${r.qualifier || 'none'})`).join(', '));

  const linked = new Map();

  for (const ref of references) {
    console.log(`\nChecking ref: ${ref.identifier} (qualifier: ${ref.qualifier || 'none'})`);

    const match = fileImports.find(imp => {
      const alias = imp.alias ?? imp.imported;
      console.log(`  vs import: alias="${alias}", source="${imp.source}"`);
      if (!alias) {
        console.log('    -> skip (no alias)');
        return false;
      }
      if (ref.qualifier) {
        const result = alias === ref.qualifier;
        console.log(`    -> qualifier match: ${result}`);
        return result;
      }
      const result = alias === ref.identifier;
      console.log(`    -> identifier match: ${result}`);
      return result;
    });

    if (match) {
      const key = `${match.source}|${match.imported}|${match.alias ?? ''}|${match.kind}`;
      console.log(`  MATCH found: ${match.imported} from ${match.source}, key="${key}"`);
      if (!linked.has(key)) {
        linked.set(key, match);
        console.log('  -> Added to linked');
      } else {
        console.log('  -> Already in linked');
      }
    } else {
      console.log('  NO MATCH');
    }
  }

  console.log('\n=== Result ===');
  console.log('linked:', Array.from(linked.values()).map(i => i.imported).join(', '));
  return Array.from(linked.values());
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

  console.log('\n\n=== FINAL RESULT ===');
  const findById = analysis.scopes.find(s => s.name === 'findById');
  if (findById) {
    console.log('findById.importReferences:', findById.importReferences.map(i => i.imported).join(', '));
  }
}

main().catch(console.error);
