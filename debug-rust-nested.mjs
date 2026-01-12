const { RustScopeExtractionParser, RelationshipResolver } = await import('./dist/esm/index.js');
import * as fs from 'fs/promises';
import * as path from 'path';

const TYPES_RS = `
pub struct User { pub name: String }
pub struct Error { pub msg: String }
`;

const SERVICE_RS = `
use crate::types::*;

pub struct UserService {
    pub users: Vec<User>,
    pub errors: Vec<Error>,
}

impl UserService {
    pub fn get_user(&self) -> Option<User> { None }
}
`;

async function main() {
  const testDir = '/tmp/rust-debug';
  await fs.rm(testDir, { recursive: true, force: true });
  await fs.mkdir(testDir, { recursive: true });
  
  await fs.writeFile(path.join(testDir, 'types.rs'), TYPES_RS.trim());
  await fs.writeFile(path.join(testDir, 'service.rs'), SERVICE_RS.trim());
  
  const parser = new RustScopeExtractionParser();
  await parser.initialize();
  
  const parsedFiles = new Map();
  for (const filename of ['types.rs', 'service.rs']) {
    const filePath = path.join(testDir, filename);
    const content = await fs.readFile(filePath, 'utf8');
    const analysis = await parser.parseFile(filePath, content);
    parsedFiles.set(filePath, analysis);
    
    console.log('\n=== ' + filename + ' ===');
    for (const scope of analysis.scopes) {
      console.log(scope.name + ' (' + scope.type + ')');
      const refs = (scope.identifierReferences || []).map(r => r.identifier);
      const unique = [...new Set(refs)].filter(r => r === 'User' || r === 'Error' || r === 'Vec' || r === 'Option');
      if (unique.length) console.log('  refs: ' + unique.join(', '));
    }
  }
  
  const resolver = new RelationshipResolver({
    projectRoot: testDir,
    defaultLanguage: 'rust',
    includeInverse: true
  });
  
  const result = await resolver.resolveRelationships(parsedFiles);
  
  console.log('\n=== Relationships ===');
  for (const rel of result.relationships.filter(r => r.type === 'CONSUMES')) {
    console.log(rel.fromName + ' -> ' + rel.toName);
  }
  
  console.log('\n=== Scope Mapping ===');
  for (const [name, entries] of result.scopeMapping) {
    if (name === 'User' || name === 'Error') {
      console.log(name + ': ' + entries.map(e => e.file).join(', '));
    }
  }
}

main().catch(console.error);
