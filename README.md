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

> 📖 **New to this library?** Check out the [API Guide](./API_GUIDE.md) for a detailed explanation of the different parser APIs and when to use each one.

### Recommended API - Language-Specific Parsers

The recommended way to use this library is through language-specific parsers, which implement a universal interface:

#### TypeScript Example

```typescript
import { TypeScriptLanguageParser } from '@luciformresearch/codeparsers';
import * as fs from 'fs';

// Initialize parser for TypeScript
const parser = new TypeScriptLanguageParser();
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

#### Python Example

```typescript
import { PythonLanguageParser } from '@luciformresearch/codeparsers';
import * as fs from 'fs';

// Initialize parser for Python
const parser = new PythonLanguageParser();
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

### Multi-Language Projects with ParserRegistry

For projects that need to handle multiple languages:

```typescript
import { ParserRegistry, TypeScriptLanguageParser, PythonLanguageParser } from '@luciformresearch/codeparsers';

// Create and register parsers
const registry = new ParserRegistry();

const tsParser = new TypeScriptLanguageParser();
await tsParser.initialize();
registry.register(tsParser);

const pyParser = new PythonLanguageParser();
await pyParser.initialize();
registry.register(pyParser);

// Get parser by language
const parser = registry.getParser('typescript');
const result = await parser.parseFile('myfile.ts', content);

// Or get parser by file extension
const autoParser = registry.getParserForFile('script.py');
```

### Advanced Usage - Low-Level Parsers

For advanced use cases, you can use the low-level scope extraction parsers directly:

```typescript
import { ScopeExtractionParser, PythonScopeExtractionParser } from '@luciformresearch/codeparsers';

// TypeScript low-level parser
const tsParser = new ScopeExtractionParser('typescript');
await tsParser.initialize();

// Python low-level parser
const pyParser = new PythonScopeExtractionParser();
await pyParser.initialize();
```

**Note**: The low-level parsers return `ScopeFileAnalysis` instead of the universal `FileAnalysis` format. Use language-specific parsers (`TypeScriptLanguageParser`, `PythonLanguageParser`) for the recommended universal interface.

## Main Exports

### Recommended Parsers (Universal Interface)
- **`TypeScriptLanguageParser`** - Recommended TypeScript/JavaScript parser
- **`PythonLanguageParser`** - Recommended Python parser
- **`ParserRegistry`** - Registry system for multi-language projects

### Advanced Parsers (Low-Level)
- **`ScopeExtractionParser`** - Low-level scope extraction for TypeScript
- **`PythonScopeExtractionParser`** - Low-level scope extraction for Python
- **`SyntaxHighlightingParser`** - Parser optimized for syntax highlighting

### Legacy Parsers (Deprecated)
- `StructuredTypeScriptParser` - Use `TypeScriptLanguageParser` instead
- `PythonParser` - Use `PythonLanguageParser` instead

### Types
- `ScopeInfo` - Complete scope metadata
- `ScopeFileAnalysis` - File-level analysis result
- `ParameterInfo` - Function parameter information
- `ImportReference` - Import/export references
- And many more...

## License

LRSL v1.1 - See [LICENSE](./LICENSE) file for details.
