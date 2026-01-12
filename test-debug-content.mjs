/**
 * Debug to check scope.content and scope.signature
 */

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

  for (const scope of analysis.scopes) {
    console.log(`\n=== ${scope.name} (${scope.type}) ===`);
    console.log('\nSignature:', scope.signature);
    console.log('\nContent (first 200 chars):', scope.content?.substring(0, 200));
    console.log('\nGeneric Parameters:', scope.genericParameters);

    if (scope.identifierReferences?.length) {
      console.log('\nidentifierReferences:');
      for (const ref of scope.identifierReferences) {
        console.log(`  ${ref.identifier} (kind: ${ref.kind}, source: ${ref.source || 'N/A'})`);
      }
    }

    if (scope.importReferences?.length) {
      console.log('\nimportReferences:');
      for (const ref of scope.importReferences) {
        console.log(`  ${ref.imported} from ${ref.source}`);
      }
    }
  }
}

main().catch(console.error);
