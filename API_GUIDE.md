# API Guide

This guide clarifies the different parser APIs available in `@luciformresearch/codeparsers` and when to use each one.

## Architecture Overview

The package provides **3 levels of APIs**:

### 1. **Recommended API - Universal Language Parsers** ✅

**Use this for:** Production code, multi-language projects, consistent interfaces

**Classes:**
- `TypeScriptLanguageParser` - For TypeScript/JavaScript
- `PythonLanguageParser` - For Python
- `ParserRegistry` - For managing multiple language parsers

**Returns:** `FileAnalysis` (universal format)

**Example:**
```typescript
import { TypeScriptLanguageParser } from '@luciformresearch/codeparsers';

const parser = new TypeScriptLanguageParser();
await parser.initialize();
const result = await parser.parseFile('file.ts', content);
// result: FileAnalysis (universal interface)
```

**Benefits:**
- ✅ Consistent interface across languages
- ✅ Supports ParserRegistry for multi-language projects
- ✅ Returns universal `FileAnalysis` format
- ✅ Future-proof as new languages are added

---

### 2. **Advanced API - Low-Level Scope Extraction** ⚙️

**Use this for:** Advanced use cases requiring direct access to scope extraction logic

**Classes:**
- `ScopeExtractionParser` - Low-level TypeScript scope extraction
- `PythonScopeExtractionParser` - Low-level Python scope extraction

**Returns:** `ScopeFileAnalysis` (scope-specific format)

**Example:**
```typescript
import { ScopeExtractionParser } from '@luciformresearch/codeparsers';

const parser = new ScopeExtractionParser('typescript');
await parser.initialize();
const result = await parser.parseFile('file.ts', content);
// result: ScopeFileAnalysis (scope-specific interface)
```

**When to use:**
- You need direct access to low-level scope extraction features
- You're building custom tooling that requires `ScopeFileAnalysis` format
- You need features not yet exposed in the universal interface

---

### 3. **Legacy API - Deprecated** ⚠️

**Classes:**
- `StructuredTypeScriptParser` - **Use `TypeScriptLanguageParser` instead**
- `PythonParser` - **Use `PythonLanguageParser` instead**

These parsers are deprecated and will be removed in a future version.

---

## Quick Decision Guide

**Q: I'm parsing TypeScript/JavaScript files**
→ Use `TypeScriptLanguageParser`

**Q: I'm parsing Python files**
→ Use `PythonLanguageParser`

**Q: I need to parse both TypeScript and Python**
→ Use `ParserRegistry` with `TypeScriptLanguageParser` + `PythonLanguageParser`

**Q: I need advanced scope extraction features not in the universal interface**
→ Use `ScopeExtractionParser` or `PythonScopeExtractionParser`

**Q: I'm using `ScopeExtractionParser` from the README examples**
→ Migrate to `TypeScriptLanguageParser` or `PythonLanguageParser` for the recommended API

---

## Migration Guide

### From `ScopeExtractionParser('typescript')` to `TypeScriptLanguageParser`

**Before:**
```typescript
import { ScopeExtractionParser } from '@luciformresearch/codeparsers';

const parser = new ScopeExtractionParser('typescript');
await parser.initialize();
const result = await parser.parseFile('file.ts', content);
```

**After:**
```typescript
import { TypeScriptLanguageParser } from '@luciformresearch/codeparsers';

const parser = new TypeScriptLanguageParser();
await parser.initialize();
const result = await parser.parseFile('file.ts', content);
```

### From `ScopeExtractionParser('python')` to `PythonLanguageParser`

**Before:**
```typescript
import { ScopeExtractionParser } from '@luciformresearch/codeparsers';

const parser = new ScopeExtractionParser('python');
await parser.initialize();
const result = await parser.parseFile('file.py', content);
```

**After:**
```typescript
import { PythonLanguageParser } from '@luciformresearch/codeparsers';

const parser = new PythonLanguageParser();
await parser.initialize();
const result = await parser.parseFile('file.py', content);
```

---

## API Comparison

| Feature | Universal API | Low-Level API | Legacy API |
|---------|--------------|---------------|------------|
| TypeScript Support | ✅ TypeScriptLanguageParser | ✅ ScopeExtractionParser | ⚠️ StructuredTypeScriptParser |
| Python Support | ✅ PythonLanguageParser | ✅ PythonScopeExtractionParser | ⚠️ PythonParser |
| Multi-Language | ✅ ParserRegistry | ❌ | ❌ |
| Return Format | FileAnalysis | ScopeFileAnalysis | Various |
| Future-Proof | ✅ | ⚙️ | ❌ |
| Recommended | ✅ | For advanced use | ❌ Deprecated |

---

## Internal Architecture

For those interested in how the parsers work internally:

```
┌─────────────────────────────────────┐
│  TypeScriptLanguageParser           │  ← Recommended API
│  (Universal Interface)              │
└──────────────┬──────────────────────┘
               │ wraps
               ▼
┌─────────────────────────────────────┐
│  ScopeExtractionParser              │  ← Low-level API
│  (TypeScript-specific)              │
└──────────────┬──────────────────────┘
               │ uses
               ▼
┌─────────────────────────────────────┐
│  WasmLoader                         │  ← tree-sitter WASM
│  (tree-sitter-typescript.wasm)      │
└─────────────────────────────────────┘
```

Similarly for Python:
```
PythonLanguageParser → PythonScopeExtractionParser → WasmLoader (tree-sitter-python.wasm)
```

The universal parsers (`TypeScriptLanguageParser`, `PythonLanguageParser`) wrap the low-level scope extraction parsers and convert their output to a universal `FileAnalysis` format, making them interchangeable and suitable for multi-language projects.
