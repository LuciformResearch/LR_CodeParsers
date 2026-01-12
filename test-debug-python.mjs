/**
 * Debug Python import resolution
 */

const { PythonScopeExtractionParser, RelationshipResolver } = await import('./dist/esm/index.js');
import * as fs from 'fs/promises';
import * as path from 'path';

const TEST_DIR = '/tmp/test-python-imports';

const MODELS_PY = `
from dataclasses import dataclass

@dataclass
class User:
    id: str
    name: str

class Admin(User):
    permissions: list
`;

const SERVICE_PY = `
from models import User, Admin

def handle_person(person: User) -> str:
    return person.name

def create_admin(user: User) -> Admin:
    return Admin(id=user.id, name=user.name, permissions=[])

class UserService:
    def get_user(self, id: str) -> User:
        return User(id=id, name="test")
`;

async function main() {
  // Setup files
  await fs.mkdir(TEST_DIR, { recursive: true });
  await fs.writeFile(path.join(TEST_DIR, 'models.py'), MODELS_PY.trim());
  await fs.writeFile(path.join(TEST_DIR, 'service.py'), SERVICE_PY.trim());

  // Parse files
  const parser = new PythonScopeExtractionParser();

  console.log('=== Parsing models.py ===');
  const modelsAnalysis = await parser.parseFile(
    path.join(TEST_DIR, 'models.py'),
    MODELS_PY.trim()
  );

  console.log('\nScopes:', modelsAnalysis.scopes.map(s => `${s.name} (${s.type})`).join(', '));

  console.log('\n=== Parsing service.py ===');
  const serviceAnalysis = await parser.parseFile(
    path.join(TEST_DIR, 'service.py'),
    SERVICE_PY.trim()
  );

  console.log('\nScopes:', serviceAnalysis.scopes.map(s => `${s.name} (${s.type})`).join(', '));

  // Check file-level imports
  const fileScope = serviceAnalysis.scopes.find(s => s.type === 'module');
  if (fileScope) {
    console.log('\n=== File scope import analysis ===');
    console.log('importReferences:', fileScope.importReferences);
    console.log('identifierReferences:', fileScope.identifierReferences?.slice(0, 5));
  }

  // Check function imports
  const handlePerson = serviceAnalysis.scopes.find(s => s.name === 'handle_person');
  if (handlePerson) {
    console.log('\n=== handle_person scope ===');
    console.log('importReferences:', handlePerson.importReferences);
    console.log('identifierReferences:', handlePerson.identifierReferences);
    console.log('content:', handlePerson.content);
  }

  // Try relationship resolution
  console.log('\n=== Resolving relationships ===');
  const parsedFiles = new Map();
  parsedFiles.set(path.join(TEST_DIR, 'models.py'), modelsAnalysis);
  parsedFiles.set(path.join(TEST_DIR, 'service.py'), serviceAnalysis);

  const resolver = new RelationshipResolver({
    projectRoot: TEST_DIR,
    defaultLanguage: 'python',
    includeContains: true,
    includeInverse: false,
    debug: true,
  });

  const result = await resolver.resolveRelationships(parsedFiles);

  console.log('\nRelationships:');
  for (const rel of result.relationships) {
    if (rel.fromFile !== rel.toFile) {
      console.log(`  ${rel.fromName} (${path.basename(rel.fromFile)}) --${rel.type}--> ${rel.toName} (${path.basename(rel.toFile)})`);
    }
  }

  console.log('\nUnresolved:');
  for (const unres of result.unresolvedReferences) {
    console.log(`  ${unres.fromScope} → ${unres.identifier}: ${unres.reason}`);
  }
}

main().catch(console.error);
