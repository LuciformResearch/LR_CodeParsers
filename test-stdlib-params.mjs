import { ScopeExtractionParser, RelationshipResolver } from './dist/esm/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const testDir = '/tmp/stdlib-params-test';
await fs.rm(testDir, { recursive: true, force: true });
await fs.mkdir(testDir, { recursive: true });

// TypeScript test
const TYPES = `
export interface User { id: string; name: string; }
export interface Error { code: number; message: string; }
`;

const SERVICE = `
import { User, Error } from './types';

class UserService {
  // List<User> - List is stdlib, but User should still be a relationship
  getUsers(): Array<User> { return []; }
  
  // Map<string, User> - Map is stdlib, but User should be extracted
  cache: Map<string, User> = new Map();
  
  // Result<User, Error> - both User and Error should be extracted
  getUser(id: string): Promise<User | null> { return Promise.resolve(null); }
  
  // Nested: Array<Array<User>>
  getMatrix(): Array<Array<User>> { return []; }
}
`;

await fs.writeFile(path.join(testDir, 'types.ts'), TYPES.trim());
await fs.writeFile(path.join(testDir, 'service.ts'), SERVICE.trim());

const parser = new ScopeExtractionParser();
await parser.initialize();

const parsedFiles = new Map();
for (const file of ['types.ts', 'service.ts']) {
  const filePath = path.join(testDir, file);
  const content = await fs.readFile(filePath, 'utf8');
  const analysis = await parser.parseFile(filePath, content);
  parsedFiles.set(filePath, analysis);
}

// Check identifier references for UserService
const serviceAnalysis = parsedFiles.get(path.join(testDir, 'service.ts'));
const userServiceScope = serviceAnalysis.scopes.find(s => s.name === 'UserService');

console.log('=== UserService identifierReferences ===');
for (const ref of userServiceScope?.identifierReferences || []) {
  const ctx = ref.context || '-';
  console.log('  ' + ref.identifier + ' | kind: ' + ref.kind + ' | context: ' + ctx);
}

// Resolve relationships
const resolver = new RelationshipResolver({
  projectRoot: testDir,
  defaultLanguage: 'typescript',
  includeInverse: false
});

const result = await resolver.resolveRelationships(parsedFiles);

console.log('\n=== CONSUMES relationships ===');
for (const rel of result.relationships.filter(r => r.type === 'CONSUMES')) {
  console.log('  ' + rel.fromName + ' (' + rel.fromType + ') -> ' + rel.toName + ' (' + rel.toType + ')');
}

// Check what we expect
const expected = [
  ['UserService', 'User'],
  ['UserService', 'Error'],
];

console.log('\n=== Verification ===');
for (const [from, to] of expected) {
  const found = result.relationships.some(r => 
    r.type === 'CONSUMES' && r.fromName === from && r.toName === to
  );
  console.log((found ? '✓' : '✗') + ' ' + from + ' -> ' + to);
}
