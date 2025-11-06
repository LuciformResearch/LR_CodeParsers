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

### TypeScript Parser

```typescript
import { StructuredTypeScriptParser } from '@luciformresearch/codeparsers';

const parser = new StructuredTypeScriptParser();
await parser.init();

const result = await parser.parseFile('/path/to/file.ts');
console.log(result.scopes); // Parsed scopes with full context
```

### Python Parser

```typescript
import { PythonParser } from '@luciformresearch/codeparsers';

const parser = new PythonParser();
await parser.initialize();

const analysis = await parser.parseFile('/path/to/file.py');
console.log(analysis.scopes); // Parsed Python scopes
```

## Exports

### Main exports
- `StructuredTypeScriptParser` - Full TypeScript parser
- `PythonParser` - Python parser
- `PythonReferenceTracker` - Python import/reference tracker

### Types
- `TypeScriptScope`
- `PythonScope`
- `ParameterInfo`
- `ImportReference`
- And many more...

## License

LRSL v1.1 - See [LICENSE](./LICENSE) file for details.
