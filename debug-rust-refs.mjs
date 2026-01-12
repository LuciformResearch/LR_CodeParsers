const { RustScopeExtractionParser } = await import('./dist/esm/index.js');

const CODE = `
pub struct UserService {
    pub users: Vec<User>,
    pub current: Option<User>,
}

impl UserService {
    pub fn find(&self) -> Result<User, Error> { Ok(User{}) }
}
`;

const parser = new RustScopeExtractionParser();
await parser.initialize();
const analysis = await parser.parseFile('/tmp/test.rs', CODE.trim());

for (const scope of analysis.scopes) {
  console.log('\n=== ' + scope.name + ' (' + scope.type + ') ===');
  console.log('identifierReferences:', JSON.stringify(scope.identifierReferences, null, 2));
}
