import { ScopeExtractionParser, RelationshipResolver } from './dist/esm/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const testDir = '/tmp/stdlib-params-test2';
await fs.rm(testDir, { recursive: true, force: true });
await fs.mkdir(testDir, { recursive: true });

const TYPES = `
export interface User { id: string; }
export interface AppError { code: number; }
export interface Result<T, E> { value?: T; error?: E; }
`;

const SERVICE = `
import { User, AppError, Result } from './types';

class UserService {
  // Array<User> - User should be extracted
  getUsers(): Array<User> { return []; }
  
  // Map<string, User> - User should be extracted  
  cache: Map<string, User> = new Map();
  
  // Result<User, AppError> - BOTH User AND AppError should be extracted
  getUser(id: string): Result<User, AppError> { return {}; }
  
  // Array<Result<User, AppError>> - nested: User and AppError
  batch(): Array<Result<User, AppError>> { return []; }
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

const resolver = new RelationshipResolver({
  projectRoot: testDir,
  defaultLanguage: 'typescript',
  includeInverse: false
});

const result = await resolver.resolveRelationships(parsedFiles);

console.log('=== CONSUMES from UserService ===');
const userServiceRels = result.relationships.filter(r => 
  r.type === 'CONSUMES' && r.fromName === 'UserService'
);
const targets = [...new Set(userServiceRels.map(r => r.toName))];
for (const t of targets) {
  console.log('  UserService -> ' + t);
}

// Verification
const expected = ['User', 'AppError', 'Result'];
console.log('\n=== Expected relationships ===');
for (const name of expected) {
  const found = targets.includes(name);
  console.log((found ? '✓' : '✗') + ' UserService -> ' + name);
}
