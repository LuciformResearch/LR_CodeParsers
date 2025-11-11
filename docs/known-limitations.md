# Known Limitations & Missing Features in CodeParsers

**Date**: 2025-11-10
**Package**: `@luciformresearch/codeparsers`
**Version**: 0.1.2

This document describes limitations and missing features in the current implementation of the code parsers, particularly the TypeScript and Python scope extraction parsers.

---

## 🐛 Critical Issues

### 1. Class Inheritance Not Captured in Signature

**Severity**: HIGH
**Affected**: TypeScript, likely Python too
**File**: `src/scope-extraction/ScopeExtractionParser.ts` (line 1229-1248)

#### Problem

The `buildSignature()` method does not include the `extends` or `implements` clauses when generating class signatures.

**Current behavior:**
```typescript
// Source code:
export class CodeSourceAdapter extends SourceAdapter {
  ...
}

// Generated signature:
"class CodeSourceAdapter()"
```

**Expected behavior:**
```typescript
"class CodeSourceAdapter() extends SourceAdapter"
```

#### Impact

- **INHERITS_FROM relationships cannot be detected** when using cross-file inheritance
- Class hierarchy analysis is broken for classes that extend imported base classes
- The only workaround is parsing the raw `content` field (first line) directly

#### Root Cause

The `buildSignature()` method at line 1247:
```typescript
return `${modStr}${type} ${name}(${paramsStr})${returnStr}`;
```

Only includes:
- Modifiers (export, abstract, etc.)
- Type (class, interface, etc.)
- Name
- Parameters (for constructors - actually wrong, should be empty for class declarations)
- Return type

It **does NOT** extract or include:
- `extends` clause
- `implements` clause
- Generic type parameters (`<T extends Foo>`)

#### Proposed Fix

1. Add new extraction method `extractHeritageClause(node, content)` in `ScopeExtractionParser`
2. Modify `buildSignature()` to accept optional `extendsClause` and `implementsClause`
3. For classes, extract heritage clause from AST node
4. Update signature format to: `${modStr}${type} ${name}${genericParams}${heritageClause}(${paramsStr})${returnStr}`

Example implementation:
```typescript
private extractHeritageClause(node: ts.ClassDeclaration, content: string): {
  extends?: string;
  implements?: string[];
} {
  const result: { extends?: string; implements?: string[] } = {};

  if (node.heritageClauses) {
    for (const clause of node.heritageClauses) {
      if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
        result.extends = clause.types.map(t => t.getText()).join(', ');
      } else if (clause.token === ts.SyntaxKind.ImplementsKeyword) {
        result.implements = clause.types.map(t => t.getText());
      }
    }
  }

  return result;
}
```

---

## ⚠️ Missing Features

### 2. Generic Type Parameters Not Captured

**Severity**: MEDIUM
**Affected**: TypeScript

Classes, interfaces, and functions with generic parameters lose this information in signatures.

**Example:**
```typescript
// Source:
class QueryBuilder<T extends Entity> {
  ...
}

// Current signature:
"class QueryBuilder()"

// Should be:
"class QueryBuilder<T extends Entity>()"
```

---

### 3. Class Declaration Parameters

**Severity**: LOW
**Affected**: TypeScript

The `buildSignature()` for classes includes parameters (line 231), but **class declarations don't have parameters** - only constructors do.

**Current behavior:**
```typescript
const parameters = this.extractParameters(node, content);
const signature = this.buildSignature('class', name, parameters, ...);
```

This is semantically incorrect. Classes should have empty parameter lists, and constructor parameters should be tracked separately as a `constructor` scope.

**Fix**: Pass empty array for class parameters, extract constructor as separate scope.

---

### 4. Decorator Information Lost

**Severity**: MEDIUM
**Affected**: TypeScript (decorators), Python (decorators)

While decorators are extracted for Python classes (`(scope as any).decorators`), the **detailed decorator arguments and metadata are not preserved**.

**Example:**
```typescript
@Entity({ tableName: 'users', schema: 'public' })
class User {
  ...
}
```

**Current**: Only decorator name stored: `"Entity"`
**Missing**: Decorator arguments: `{ tableName: 'users', schema: 'public' }`

---

### 5. Property Modifiers and Decorators

**Severity**: MEDIUM
**Affected**: TypeScript, Python

Class properties and their modifiers/decorators are extracted via `extractClassMembers()`, but:
- Property decorators are not captured
- Accessibility modifiers (private, protected, public) may be lost
- Readonly/static status may not be preserved

---

### 6. Enum Member Values

**Severity**: LOW
**Affected**: TypeScript, Python

Enum members are extracted, but their **assigned values** are not captured.

**Example:**
```typescript
enum Status {
  PENDING = 'pending',
  ACTIVE = 'active',
  DELETED = 'deleted'
}
```

**Current**: Only names extracted
**Missing**: The string values

---

### 7. Type Alias Complexity

**Severity**: LOW
**Affected**: TypeScript

Complex type aliases like union types, intersection types, mapped types, etc. are stored as raw strings without structured representation.

**Example:**
```typescript
type Result<T> = { data: T } | { error: Error };
```

The type structure is not parsed into a traversable AST.

---

## 📋 Feature Requests for v0.2.0

Based on the issues above, here are the recommended features for the next version:

### High Priority
- [ ] **Extract heritage clauses** (extends/implements) for classes and interfaces
- [ ] **Capture generic type parameters** for classes, interfaces, functions
- [ ] **Separate constructor extraction** from class declaration

### Medium Priority
- [ ] **Decorator metadata extraction** with arguments
- [ ] **Property modifier preservation** (readonly, static, accessibility)
- [ ] **Enum member value extraction**

### Low Priority
- [ ] **Structured type alias parsing** for complex types
- [ ] **Signature tokens** with type reference links (for syntax highlighting)

---

## 🔧 Temporary Workarounds

Until these issues are fixed in codeparsers, the following workarounds can be used:

### For Inheritance Detection

Instead of relying on `scope.signature`, parse the first line of `scope.content`:

```typescript
function detectInheritance(scope: ScopeInfo, targetName: string): boolean {
  if (scope.type !== 'class') return false;

  const firstLine = scope.content?.split('\n')[0] || '';
  const extendsPattern = new RegExp(`class\\s+${scope.name}\\s+extends\\s+${targetName}\\b`);
  return extendsPattern.test(firstLine);
}
```

### For Generic Parameters

Parse from content or signature string with regex:
```typescript
const genericMatch = scope.content?.match(/class\s+\w+<([^>]+)>/);
const generics = genericMatch ? genericMatch[1] : undefined;
```

---

## 📊 Impact Assessment

| Feature | Affected Use Cases | Workaround Difficulty |
|---------|-------------------|----------------------|
| Heritage clauses | Class hierarchy analysis, INHERITS_FROM relationships | **Easy** (regex on content) |
| Generic params | Type-safe code generation, template analysis | **Medium** (regex parsing) |
| Constructor params | Constructor signature analysis | **Easy** (extract from members) |
| Decorators | Framework detection, metadata analysis | **Hard** (need AST parsing) |
| Property modifiers | Encapsulation analysis, API surface detection | **Medium** (check modifiers array) |

---

## 🎯 Recommended Action Plan

1. **Immediate** (v0.1.3 patch):
   - Document these limitations (this file)
   - Add workaround examples to API_GUIDE.md

2. **Short-term** (v0.2.0):
   - Fix heritage clause extraction
   - Add generic parameter support
   - Separate constructor from class scope

3. **Long-term** (v0.3.0):
   - Full decorator metadata
   - Structured type representation
   - Enhanced property analysis

---

## 📝 Notes

- The current parser prioritizes **speed and simplicity** over complete accuracy
- Most limitations can be worked around by parsing the raw `content` field
- For production use, consider whether these limitations impact your specific use case
- Contributions welcome! See `00-parser-refactoring-plan.md` for architecture details

---

**Last Updated**: 2025-11-10
**Maintainer**: Lucie Defraiteur
**Related Issues**: #TBD
