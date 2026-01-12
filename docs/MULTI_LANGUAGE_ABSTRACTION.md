# Abstraction Multi-Langages - codeparsers

## Objectif

Étendre codeparsers pour supporter plusieurs langages de programmation (C, C++, Rust, Go) en plus de TypeScript/JavaScript et Python, tout en maintenant une API cohérente.

## Travail Réalisé

### 1. BaseScopeExtractionParser

**Fichier:** `src/scope-extraction/BaseScopeExtractionParser.ts`

Classe de base abstraite créée en copiant `ScopeExtractionParser` (TypeScript) puis en:
- Changeant toutes les méthodes `private` en `protected` pour permettre l'override
- Ajoutant des propriétés d'instance overridables:
  - `stopWords: Set<string>` - Mots-clés à exclure des références
  - `builtinIdentifiers: Set<string>` - Identifiants built-in à exclure
  - `nodeTypes: NodeTypeConfig` - Mappings des types de nœuds AST

### 2. NodeTypeConfig

**Fichier:** `src/scope-extraction/BaseScopeExtractionParser.ts`

Interface définissant les mappings entre concepts sémantiques et types de nœuds AST:

```typescript
interface NodeTypeConfig {
  // Scopes
  classDeclaration: string[];      // ['class_declaration', 'abstract_class_declaration']
  functionDeclaration: string[];   // ['function_declaration']
  methodDefinition: string[];      // ['method_definition']
  enumDeclaration: string[];       // ['enum_declaration']
  // ... etc
}
```

**Configurations disponibles:**
- `TYPESCRIPT_NODE_TYPES` - TypeScript/JavaScript (défaut)
- `C_NODE_TYPES` - Langage C
- `CPP_NODE_TYPES` - C++
- `RUST_NODE_TYPES` - Rust
- `GO_NODE_TYPES` - Go
- `CSHARP_NODE_TYPES` - C#

### 3. Helpers isNodeType

Méthodes pour vérifier les types de nœuds de manière abstraite:

```typescript
// Vérifie si un nœud correspond à une catégorie
protected isNodeType(node: SyntaxNode, category: keyof NodeTypeConfig): boolean

// Vérifie si un nœud correspond à plusieurs catégories (OR)
protected isNodeTypeAny(node: SyntaxNode, ...categories: (keyof NodeTypeConfig)[]): boolean
```

## Structure des Fichiers

```
src/
├── scope-extraction/
│   ├── BaseScopeExtractionParser.ts   # Classe de base abstraite
│   ├── ScopeExtractionParser.ts       # Parser TypeScript (original)
│   ├── PythonScopeExtractionParser.ts # Parser Python
│   ├── CScopeExtractionParser.ts      # Parser C
│   ├── CppScopeExtractionParser.ts    # Parser C++
│   ├── RustScopeExtractionParser.ts   # Parser Rust
│   ├── GoScopeExtractionParser.ts     # Parser Go
│   ├── CSharpScopeExtractionParser.ts # Parser C#
│   ├── types.ts                       # Types partagés (ScopeInfo, etc.)
│   └── index.ts                       # Exports
├── import-resolution/
│   ├── types.ts                       # Interface BaseImportResolver
│   ├── TypeScriptImportResolver.ts    # Résolveur TS/JS
│   ├── CImportResolver.ts             # Résolveur C/C++
│   ├── RustImportResolver.ts          # Résolveur Rust
│   ├── GoImportResolver.ts            # Résolveur Go
│   ├── CSharpImportResolver.ts        # Résolveur C#
│   ├── path-utils.ts                  # Utilitaires de chemins
│   └── index.ts                       # Exports
└── wasm/
    └── grammars/                      # Grammaires tree-sitter WASM
        ├── tree-sitter-c.wasm
        ├── tree-sitter-cpp.wasm
        ├── tree-sitter-rust.wasm
        ├── tree-sitter-c_sharp.wasm
        └── tree-sitter-go.wasm
```

## Parsers Implémentés

### CScopeExtractionParser

**Fichier:** `src/scope-extraction/CScopeExtractionParser.ts`

- Étend `BaseScopeExtractionParser`
- Override `nodeTypes` avec `C_NODE_TYPES`
- Gère: fonctions, structs, enums, typedefs
- AST: `function_definition -> function_declarator -> identifier`

### CppScopeExtractionParser

**Fichier:** `src/scope-extraction/CppScopeExtractionParser.ts`

- Étend `CScopeExtractionParser` (réutilise la logique C)
- Ajoute: namespaces, classes, templates, méthodes
- Gère les access modifiers (public/private/protected)
- AST: `namespace_definition`, `class_specifier`, `template_declaration`

### RustScopeExtractionParser

**Fichier:** `src/scope-extraction/RustScopeExtractionParser.ts`

- Étend `BaseScopeExtractionParser`
- Gère: structs, traits, impl blocks, enums avec variants, modules
- Supporte les génériques et lifetimes
- AST: `struct_item`, `trait_item`, `impl_item`, `function_item`, `mod_item`

### GoScopeExtractionParser

**Fichier:** `src/scope-extraction/GoScopeExtractionParser.ts`

- Étend `BaseScopeExtractionParser`
- Gère: structs, interfaces, functions, methods avec receivers
- Détecte l'export via capitalisation (convention Go)
- AST: `type_declaration`, `function_declaration`, `method_declaration`

### CSharpScopeExtractionParser

**Fichier:** `src/scope-extraction/CSharpScopeExtractionParser.ts`

- Étend `BaseScopeExtractionParser`
- Gère: namespaces, classes, structs, records, interfaces, enums
- Supporte: properties, methods, constructors, attributes
- Gère les modificateurs d'accès (public, private, protected, internal)
- AST: `namespace_declaration`, `class_declaration`, `interface_declaration`, `method_declaration`

## Import Resolvers Implémentés

| Langage | Config | Résolution | Status |
|---------|--------|------------|--------|
| TypeScript/JS | tsconfig.json | node_modules, aliases | ✅ Done |
| C/C++ | compile_commands.json | -I flags | ✅ Done |
| Rust | Cargo.toml | crate::, self::, super:: | ✅ Done |
| Go | go.mod | module path, vendor | ✅ Done |
| C# | .csproj | NuGet, namespaces | ✅ Done |
| Python | pyproject.toml, setup.py | sys.path, PYTHONPATH | Pending |

### TypeScriptImportResolver

- Charge `tsconfig.json` pour les path aliases
- Résout les extensions (.js → .ts)
- Gère les fichiers index
- Identifie les modules Node.js built-in

### CImportResolver

- Charge `compile_commands.json` pour les include paths
- Différencie `#include <...>` (système) et `#include "..."` (local)
- Identifie les headers stdlib C/C++

### RustImportResolver

- Charge `Cargo.toml` pour le nom du crate et dépendances
- Résout `crate::`, `self::`, `super::`
- Supporte la structure mod.rs/module.rs
- Identifie les crates std (std, core, alloc)

### GoImportResolver

- Charge `go.mod` pour le nom du module
- Résout les imports locaux (même module)
- Supporte le répertoire vendor/
- Identifie les packages stdlib Go (fmt, net, etc.)

### CSharpImportResolver

- Charge `.csproj` pour le namespace racine et dépendances
- Identifie les namespaces .NET BCL (System.*, Microsoft.*)
- Résout les références NuGet
- Supporte les références de projet

## Exemple d'Utilisation

```typescript
import {
  CppScopeExtractionParser,
  RustScopeExtractionParser,
  GoScopeExtractionParser,
  CSharpScopeExtractionParser,
  RustImportResolver,
  GoImportResolver,
  CSharpImportResolver
} from '@luciformresearch/codeparsers';

// Parser C++
const cppParser = new CppScopeExtractionParser();
await cppParser.initialize();
const cppResult = await cppParser.parseFile('main.cpp', `
  namespace MyLib {
    template<typename T>
    class Container {
      void add(T item) { }
    };
  }
`);

// Parser Rust
const rustParser = new RustScopeExtractionParser();
await rustParser.initialize();
const rustResult = await rustParser.parseFile('lib.rs', `
  pub struct Point { x: i32, y: i32 }

  impl Point {
    pub fn new(x: i32, y: i32) -> Self {
      Self { x, y }
    }
  }
`);

// Parser Go
const goParser = new GoScopeExtractionParser();
await goParser.initialize();
const goResult = await goParser.parseFile('main.go', `
  type Point struct {
    X, Y int
  }

  func (p Point) Distance() float64 {
    return math.Sqrt(float64(p.X*p.X + p.Y*p.Y))
  }
`);

// Import Resolver Rust
const rustResolver = new RustImportResolver();
await rustResolver.loadConfig('/path/to/project');
const resolved = await rustResolver.resolveImport('use crate::auth::AuthService', 'src/main.rs');

// Import Resolver Go
const goResolver = new GoImportResolver();
await goResolver.loadConfig('/path/to/project');
const goResolved = await goResolver.resolveImport('import "mymodule/utils"', 'main.go');

// Parser C#
const csharpParser = new CSharpScopeExtractionParser();
await csharpParser.initialize();
const csharpResult = await csharpParser.parseFile('UserService.cs', `
  namespace MyApp.Services
  {
    public class UserService : IUserService
    {
      public User GetUser(int id) { }
    }
  }
`);

// Import Resolver C#
const csharpResolver = new CSharpImportResolver();
await csharpResolver.loadConfig('/path/to/project');
const csharpResolved = await csharpResolver.resolveImport('using MyApp.Models', 'UserService.cs');
```

## Notes Techniques

- Les grammaires WASM sont déjà disponibles pour tous les langages cibles
- L'approche "copier puis abstraire" permet de ne pas casser le code existant
- Chaque langage peut override uniquement les méthodes nécessaires
- CppScopeExtractionParser étend CScopeExtractionParser pour réutiliser la logique C

## Prochaines Étapes

1. **PythonImportResolver** - pyproject.toml, setup.py, PYTHONPATH
2. Tests unitaires pour chaque parser/resolver
3. Tests d'intégration avec des projets GitHub réels
