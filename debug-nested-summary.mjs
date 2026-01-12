const { 
  ScopeExtractionParser,
  PythonScopeExtractionParser,
  RustScopeExtractionParser,
  RelationshipResolver
} = await import('./dist/esm/index.js');
import * as fs from 'fs/promises';
import * as path from 'path';

// TypeScript test
const TS_TYPES = `
export interface User { id: string; }
export interface Error { message: string; }
export interface Result<T, E> { value?: T; error?: E; }
export interface List<T> { items: T[]; }
`;
const TS_SERVICE = `
import { User, Error, Result, List } from './types';
class UserService {
  getUsers(): Result<List<User>, Error> { return {}; }
}
`;

// Rust test  
const RS_TYPES = `
pub struct User { pub name: String }
pub struct Error { pub msg: String }
`;
const RS_SERVICE = `
use crate::types::*;
pub struct UserService {
    pub users: Vec<User>,
    pub error: Option<Error>,
}
`;

// Python test
const PY_TYPES = `
class User:
    name: str
class Error:
    msg: str
`;
const PY_SERVICE = `
from typing import List, Dict, Optional
from types import User, Error
class UserService:
    def get_users(self) -> List[User]:
        pass
    cache: Dict[str, User]
    error: Optional[Error]
`;

async function test(name, parser, typesFile, serviceFile, typesExt, serviceExt) {
  const testDir = '/tmp/nested-debug-' + name;
  await fs.rm(testDir, { recursive: true, force: true });
  await fs.mkdir(testDir, { recursive: true });
  
  await fs.writeFile(path.join(testDir, 'types' + typesExt), typesFile.trim());
  await fs.writeFile(path.join(testDir, 'service' + serviceExt), serviceFile.trim());
  
  await parser.initialize();
  const parsedFiles = new Map();
  
  for (const file of ['types' + typesExt, 'service' + serviceExt]) {
    const filePath = path.join(testDir, file);
    const content = await fs.readFile(filePath, 'utf8');
    const analysis = await parser.parseFile(filePath, content);
    parsedFiles.set(filePath, analysis);
  }
  
  const resolver = new RelationshipResolver({
    projectRoot: testDir,
    defaultLanguage: name,
    includeInverse: true
  });
  
  const result = await resolver.resolveRelationships(parsedFiles);
  
  console.log('\n=== ' + name.toUpperCase() + ' ===');
  console.log('Relationships found:');
  for (const rel of result.relationships.filter(r => r.type === 'CONSUMES')) {
    console.log('  ' + rel.fromName + ' -> ' + rel.toName);
  }
}

await test('typescript', new ScopeExtractionParser(), TS_TYPES, TS_SERVICE, '.ts', '.ts');
await test('rust', new RustScopeExtractionParser(), RS_TYPES, RS_SERVICE, '.rs', '.rs');
await test('python', new PythonScopeExtractionParser(), PY_TYPES, PY_SERVICE, '.py', '.py');
