# @luciformresearch/codeparsers

Unified code parsers for TypeScript, Python, HTML, CSS, Vue, Svelte, Markdown and more with tree-sitter WASM bindings. **Works in both Node.js and Browser environments.**

### License - Luciform Research Source License (LRSL) v1.1

**2025 Luciform Research. All rights reserved except as granted below.**

**Free to use for:**
- Research, education, personal exploration
- Freelance or small-scale projects (gross monthly revenue up to 100,000 EUR)
- Internal tools (if your company revenue is up to 100,000 EUR/month)

**Commercial use above this threshold** requires a separate agreement.

Contact for commercial licensing: [legal@luciformresearch.com](mailto:legal@luciformresearch.com)

**Grace period:** 60 days after crossing the revenue threshold

Full text: [LICENSE](./LICENSE)

---

**Note:** This is a custom "source-available" license, NOT an OSI-approved open source license.

## Features

- **Multi-language support**: TypeScript, Python, HTML, CSS, SCSS, Vue, Svelte, Markdown
- **Tree-sitter based**: Robust, production-ready parsing with WASM bindings
- **Universal interface**: Consistent API across all parsers
- **Node.js + Browser**: Works in both environments
- **ESM-only**: Modern ES modules for Node.js 18+
- **WASM included**: All tree-sitter grammars included in the package

## Supported Languages

| Language | Parser | Tree-sitter | Features |
|----------|--------|-------------|----------|
| TypeScript/TSX | `TypeScriptLanguageParser` | Yes | Scope extraction, imports, references |
| Python | `PythonLanguageParser` | Yes | Scope extraction, imports, decorators |
| HTML | `HTMLDocumentParser` | Yes | DOM tree, attributes, scripts/styles |
| CSS | `CSSParser` | Yes | Selectors, properties, media queries |
| SCSS | `SCSSParser` | Yes | Variables, mixins, nesting |
| Vue | `VueParser` | Regex | SFC parsing, script/template/style |
| Svelte | `SvelteParser` | Yes | Components, scripts, styles |
| Markdown | `MarkdownParser` | Regex | Sections, code blocks, links |
| Generic | `GenericCodeParser` | Yes | Basic parsing for any language |

## Installation

```bash
npm install @luciformresearch/codeparsers
```

## Quick Start

### Node.js

```typescript
import { TypeScriptLanguageParser } from '@luciformresearch/codeparsers';

const parser = new TypeScriptLanguageParser();
await parser.initialize();

const result = await parser.parseFile('example.ts', `
  function hello(name: string): string {
    return "Hello " + name;
  }
`);

console.log(result.scopes); // [{ type: 'function', name: 'hello', ... }]
```

### Browser

```typescript
import { WasmLoader } from '@luciformresearch/codeparsers/wasm';

// Configure WASM location for browser
WasmLoader.configure({
  wasmBaseUrl: '/assets/wasm' // URL where WASM files are hosted
});

// Then use parsers as normal
import { TypeScriptLanguageParser } from '@luciformresearch/codeparsers';

const parser = new TypeScriptLanguageParser();
await parser.initialize();
// ...
```

**Note:** In browser environments, you need to serve the WASM files from a URL. Copy the files from `node_modules/@luciformresearch/codeparsers/dist/esm/wasm/grammars/` to your public directory.

## Usage Examples

### TypeScript/JavaScript

```typescript
import { TypeScriptLanguageParser } from '@luciformresearch/codeparsers';

const parser = new TypeScriptLanguageParser();
await parser.initialize();

const result = await parser.parseFile('app.tsx', code);

// Access scopes (functions, classes, methods, etc.)
for (const scope of result.scopes) {
  console.log(`${scope.type}: ${scope.name}`);
  console.log(`  Lines: ${scope.startLine}-${scope.endLine}`);
  console.log(`  Parameters: ${scope.parameters?.map(p => p.name).join(', ')}`);
}
```

### Python

```typescript
import { PythonLanguageParser } from '@luciformresearch/codeparsers';

const parser = new PythonLanguageParser();
await parser.initialize();

const result = await parser.parseFile('script.py', `
def greet(name):
    """Say hello to someone."""
    return f"Hello, {name}!"

class Person:
    def __init__(self, name):
        self.name = name
`);

// Access scopes with docstrings, decorators, etc.
for (const scope of result.scopes) {
  console.log(`${scope.type}: ${scope.name}`);
  if (scope.docstring) console.log(`  Doc: ${scope.docstring}`);
}
```

### HTML

```typescript
import { HTMLDocumentParser } from '@luciformresearch/codeparsers/html';

const parser = new HTMLDocumentParser();
await parser.initialize();

const result = await parser.parse(`
  <html>
    <head><title>My Page</title></head>
    <body>
      <div class="container">
        <p id="greeting">Hello!</p>
      </div>
    </body>
  </html>
`);

// Access DOM structure
console.log(result.dom.root.children);
console.log(result.scripts, result.styles);
```

### CSS/SCSS

```typescript
import { CSSParser } from '@luciformresearch/codeparsers/css';
import { SCSSParser } from '@luciformresearch/codeparsers/scss';

const cssParser = new CSSParser();
await cssParser.initialize();

const cssResult = await cssParser.parse(`
  .container { display: flex; }
  @media (max-width: 768px) {
    .container { flex-direction: column; }
  }
`);

// Access rules, selectors, media queries
console.log(cssResult.rules);
```

### Vue Single File Components

```typescript
import { VueParser } from '@luciformresearch/codeparsers/vue';

const parser = new VueParser();
// No initialize() needed - regex-based

const result = await parser.parse(`
  <template>
    <div>{{ message }}</div>
  </template>

  <script setup lang="ts">
  const message = ref('Hello Vue!');
  </script>

  <style scoped>
  div { color: blue; }
  </style>
`);

console.log(result.template, result.script, result.styles);
```

### Svelte Components

```typescript
import { SvelteParser } from '@luciformresearch/codeparsers/svelte';

const parser = new SvelteParser();
await parser.initialize();

const result = await parser.parse(`
  <script>
    let count = 0;
  </script>

  <button on:click={() => count++}>
    Clicks: {count}
  </button>

  <style>
    button { background: blue; }
  </style>
`);
```

### Markdown

```typescript
import { MarkdownParser } from '@luciformresearch/codeparsers/markdown';

const parser = new MarkdownParser();
// No initialize() needed

const result = await parser.parse(`
  # Main Title

  Some introduction text.

  ## Section 1

  Content with a [link](https://example.com).

  \`\`\`typescript
  const x = 1;
  \`\`\`
`);

// Access sections, code blocks, links
console.log(result.sections);
console.log(result.codeBlocks);
```

### Multi-Language with ParserRegistry

```typescript
import {
  ParserRegistry,
  TypeScriptLanguageParser,
  PythonLanguageParser
} from '@luciformresearch/codeparsers';

const registry = new ParserRegistry();

// Register parsers
const tsParser = new TypeScriptLanguageParser();
await tsParser.initialize();
registry.register(tsParser);

const pyParser = new PythonLanguageParser();
await pyParser.initialize();
registry.register(pyParser);

// Auto-detect parser by extension
const parser = registry.getParserForFile('script.py');
const result = await parser.parseFile('script.py', code);
```

## API Reference

### Main Exports

```typescript
// Language parsers (recommended)
import { TypeScriptLanguageParser } from '@luciformresearch/codeparsers';
import { PythonLanguageParser } from '@luciformresearch/codeparsers';

// Web parsers
import { HTMLDocumentParser } from '@luciformresearch/codeparsers/html';
import { CSSParser } from '@luciformresearch/codeparsers/css';
import { SCSSParser } from '@luciformresearch/codeparsers/scss';

// Framework parsers
import { VueParser } from '@luciformresearch/codeparsers/vue';
import { SvelteParser } from '@luciformresearch/codeparsers/svelte';

// Utility parsers
import { MarkdownParser } from '@luciformresearch/codeparsers/markdown';
import { GenericCodeParser } from '@luciformresearch/codeparsers/generic';

// WASM utilities
import { WasmLoader } from '@luciformresearch/codeparsers/wasm';

// Registry
import { ParserRegistry } from '@luciformresearch/codeparsers';
```

### Universal Scope Interface

All language parsers return scopes with a consistent interface:

```typescript
interface UniversalScope {
  type: string;           // 'function', 'class', 'method', etc.
  name: string;           // Identifier name
  startLine: number;      // Start line (1-indexed)
  endLine: number;        // End line
  source: string;         // Source code
  docstring?: string;     // Documentation comment
  parameters?: Parameter[];
  returnType?: string;
  parent?: string;        // Parent scope name
  // ... and more
}
```

## Browser Setup

For browser usage, WASM files must be served from a URL:

1. **Copy WASM files** to your public directory:
   ```bash
   cp node_modules/@luciformresearch/codeparsers/dist/esm/wasm/grammars/*.wasm public/wasm/
   cp node_modules/web-tree-sitter/tree-sitter.wasm public/wasm/
   ```

2. **Configure WasmLoader** before using parsers:
   ```typescript
   import { WasmLoader } from '@luciformresearch/codeparsers/wasm';

   WasmLoader.configure({
     wasmBaseUrl: '/wasm'  // Your public WASM directory
   });
   ```

3. **Use parsers normally** - they will fetch WASM from the configured URL.

## License

LRSL v1.1 - See [LICENSE](./LICENSE) file for details.
