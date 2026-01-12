import { ScopeExtractionParser } from './dist/esm/index.js';

const parser = new ScopeExtractionParser();
await parser.initialize();

// Test TypeScript avec imports externes et locaux
const code = `
import { useState, useEffect } from 'react';
import { User } from './types';
import axios from 'axios';

function MyComponent() {
  const [user, setUser] = useState<User | null>(null);
  
  useEffect(() => {
    axios.get('/api/user').then(res => setUser(res.data));
  }, []);
  
  return user ? <div>{user.name}</div> : null;
}
`;

const analysis = await parser.parseFile('/test/component.tsx', code);

console.log('=== IMPORT REFERENCES ===');
for (const ref of analysis.importReferences || []) {
  console.log(`  ${ref.imported} from "${ref.source}" | isLocal: ${ref.isLocal} | kind: ${ref.kind}`);
}

console.log('\n=== SCOPE importReferences ===');
for (const scope of analysis.scopes) {
  if (scope.importReferences?.length > 0) {
    console.log(`\n${scope.name} (${scope.type}):`);
    for (const ref of scope.importReferences) {
      console.log(`  ${ref.imported} from "${ref.source}" | isLocal: ${ref.isLocal}`);
    }
  }
}
