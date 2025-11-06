# @luciformresearch/codeparsers

Unified code parsers for TypeScript and Python with tree-sitter WASM bindings.

### ⚖️ License – Luciform Research Source License (LRSL) v1.1

**© 2025 Luciform Research. All rights reserved except as granted below.**

✅ **Free to use for:**
- 🧠 Research, education, personal exploration
- 💻 Freelance or small-scale projects (≤ €100,000 gross monthly revenue)
- 🏢 Internal tools (if your company revenue ≤ €100,000/month)

🔒 **Commercial use above this threshold** requires a separate agreement.

📧 Contact for commercial licensing: [legal@luciformresearch.com](mailto:legal@luciformresearch.com)

⏰ **Grace period:** 60 days after crossing the revenue threshold

📜 Full text: [LICENSE](./LICENSE)

---

**Note:** This is a custom "source-available" license, NOT an OSI-approved open source license.

## Features

- 🔍 **TypeScript Parser**: Full-featured TypeScript/TSX parser with scope analysis
- 🐍 **Python Parser**: Python parser with import resolution and reference tracking
- 🌳 **Tree-sitter based**: Uses tree-sitter for robust, production-ready parsing
- 📦 **WASM included**: All tree-sitter bindings included in the package
- ⚡ **ESM-only**: Modern ES modules for Node.js 18+

## ⚠️ Current Limitations

- **Browser environments**: Not currently supported. This package is designed for Node.js environments only.
- **CommonJS**: Not supported. Use ESM imports only (`import` instead of `require`).

## Installation

```bash
npm install @luciformresearch/codeparsers
```

## Usage

### Basic Example - TypeScript

```typescript
import { ScopeExtractionParser } from '@luciformresearch/codeparsers';
import * as fs from 'fs';

// Initialize parser for TypeScript
const parser = new ScopeExtractionParser('typescript');
await parser.initialize();

// Parse a file
const content = fs.readFileSync('myfile.ts', 'utf-8');
const result = await parser.parseFile('myfile.ts', content);

// Access parsed scopes
console.log(`Found ${result.scopes.length} scopes`);
result.scopes.forEach(scope => {
  console.log(`${scope.type}: ${scope.name}`);
});
```

### Basic Example - Python

```typescript
import { ScopeExtractionParser } from '@luciformresearch/codeparsers';
import * as fs from 'fs';

// Initialize parser for Python
const parser = new ScopeExtractionParser('python');
await parser.initialize();

// Parse a file
const content = fs.readFileSync('myfile.py', 'utf-8');
const result = await parser.parseFile('myfile.py', content);

// Access parsed scopes
console.log(`Found ${result.scopes.length} scopes`);
result.scopes.forEach(scope => {
  console.log(`${scope.type}: ${scope.name}`);
});
```

### Advanced Usage with Language-Specific Parsers

For more control, you can use the ParserRegistry system:

```typescript
import { ParserRegistry, TypeScriptLanguageParser, PythonLanguageParser } from '@luciformresearch/codeparsers';

// Register parsers
const tsParser = new TypeScriptLanguageParser();
await tsParser.initialize();
ParserRegistry.register(tsParser);

const pyParser = new PythonLanguageParser();
await pyParser.initialize();
ParserRegistry.register(pyParser);

// Now you can use the registry to get parsers by language
const parser = ParserRegistry.getParser('typescript');
```

## Main Exports

### Parsers
- **`ScopeExtractionParser`** - Recommended parser for extracting scope information
- **`TypeScriptLanguageParser`** - Low-level TypeScript parser
- **`PythonLanguageParser`** - Low-level Python parser
- **`ParserRegistry`** - Registry system for managing parsers
- **`SyntaxHighlightingParser`** - Parser optimized for syntax highlighting

### Legacy Parsers (Deprecated)
- `StructuredTypeScriptParser` - Use `ScopeExtractionParser` instead
- `PythonParser` - Use `ScopeExtractionParser` instead

### Types
- `ScopeInfo` - Complete scope metadata
- `ScopeFileAnalysis` - File-level analysis result
- `ParameterInfo` - Function parameter information
- `ImportReference` - Import/export references
- And many more...

## License

LRSL v1.1 - See [LICENSE](./LICENSE) file for details.
