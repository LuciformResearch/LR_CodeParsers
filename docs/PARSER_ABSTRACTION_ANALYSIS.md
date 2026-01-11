# Analyse d'Abstraction des Parsers

**Date**: 2026-01-11
**Objectif**: Identifier les parties abstractisables du parser TypeScript pour les réutiliser dans les parsers C/C++, Rust, C#, Go et améliorer le parser Python.

---

## 1. État Actuel

### Fichiers existants

| Fichier | Lignes | Description |
|---------|--------|-------------|
| `ScopeExtractionParser.ts` | 2758 | Parser TypeScript complet |
| `PythonScopeExtractionParser.ts` | 1538 | Parser Python (incomplet) |
| `types.ts` | 178 | Types partagés |

### Langages à supporter

| Langage | Grammaire tree-sitter | Status |
|---------|----------------------|--------|
| TypeScript/JS | `tree-sitter-typescript` | ✅ Complet |
| Python | `tree-sitter-python` | ⚠️ Incomplet |
| C | `tree-sitter-c` | ❌ À créer |
| C++ | `tree-sitter-cpp` | ❌ À créer |
| Rust | `tree-sitter-rust` | ❌ À créer |
| C# | `tree-sitter-c-sharp` | ❌ À créer |
| Go | `tree-sitter-go` | ❌ À créer |

---

## 2. Analyse Comparative TypeScript vs Python

### Méthodes Identiques (copier-coller)

Ces méthodes sont quasiment identiques entre les deux parsers:

```
initialize()                    - Chargement WasmLoader
getNodeText()                   - Extraction texte d'un nœud
dedentContent()                 - Dédentation du code
validateNode()                  - Validation AST
validateAST()                   - Validation AST globale
extractNodeIssues()             - Extraction des erreurs
extractNodeNotes()              - Extraction des notes
extractASTIssues()              - Extraction erreurs globales
calculateComplexity()           - Calcul complexité cyclomatique
buildReferenceExclusions()      - Construction des exclusions
isNestedScope()                 - Vérification scope imbriqué
getLineFromContent()            - Extraction ligne par numéro
extractBaseTypeIdentifier()     - Extraction type de base
extractAllTypeIdentifiers()     - Extraction tous les types
```

**Économie potentielle**: ~400 lignes

### Méthodes Similaires (pattern commun, détails différents)

Ces méthodes suivent le même pattern mais diffèrent dans les détails:

| Méthode | TypeScript | Python | Différence |
|---------|------------|--------|------------|
| `parseFile()` | ✅ | ✅ | Structure identique |
| `extractScopes()` | Node types TS | Node types Py | Types de nœuds différents |
| `extractClass()` | ✅ | ✅ | Extraction héritage différente |
| `extractFunction()` | ✅ | ✅ | Syntaxe params différente |
| `extractMethod()` | ✅ | ✅ | Pattern similaire |
| `extractParameters()` | TS syntax | Py syntax | Syntaxe très différente |
| `buildSignature()` | TS format | Py format | Format légèrement différent |
| `extractImports()` | Regex TS | Regex Py | Regex différentes |
| `extractExports()` | Regex TS | Regex Py | Regex différentes |
| `extractDependencies()` | Regex TS | Regex Py | Regex différentes |
| `extractIdentifierReferences()` | ✅ | ✅ | Node types différents |
| `collectLocalSymbols()` | TS nodes | Py nodes | Types différents |
| `classifyScopeReferences()` | ✅ | ✅ | Pattern identique |
| `attachSignatureReferences()` | ✅ | ✅ | Pattern similaire |
| `resolveImportsForScope()` | ✅ | ✅ | Identique |
| `extractStructuredImports()` | TS syntax | Py syntax | Très différent |

### Méthodes TypeScript-Only

Ces méthodes n'existent que dans le parser TypeScript:

```
extractInterface()              - Interfaces
extractEnum()                   - Énumérations
extractTypeAlias()              - Alias de types
extractNamespace()              - Namespaces
extractConstFunctions()         - Const arrow functions
extractGlobalVariables()        - Variables globales
extractHeritageClauses()        - extends/implements
extractGenericParameters()      - Génériques <T>
extractDecoratorDetails()       - Détails décorateurs
extractEnumMembers()            - Membres d'enum
extractClassMembers()           - Membres de classe
extractAccessibility()          - public/private/protected
extractJSDoc()                  - Commentaires JSDoc
extractFileScopes()             - Scopes niveau fichier
extractTopLevelVariables()      - Variables top-level
extractReturnTypeInfo()         - Info type retour détaillée
hasModifier()                   - Vérification modificateur
buildMethodSignature()          - Signature méthode
extractVariables()              - Variables locales
getVariableKind()               - Type de variable
findChildrenByType()            - Recherche enfants par type
splitImportSpec()               - Split import spec
escapeRegex()                   - Échapper regex
attachClassFieldTypeReferences() - Références types champs
createFileScope()               - Création scope fichier
hasMeaningfulContent()          - Contenu significatif
extractIdentifierReferencesFromText() - Refs depuis texte
getPropertyAccessParts()        - Parties accès propriété
ensureImportReferencesTracked() - Tracking imports
isDefinitionIdentifier()        - Est-ce une définition
```

### Méthodes Python-Only

```
extractLambdaAssignment()       - Assignation lambda
extractLambdaParameters()       - Paramètres lambda
extractDocstring()              - Docstrings Python
extractDecorators()             - Décorateurs (simple)
handleCallExpression()          - Gestion appels
handleAttribute()               - Gestion attributs
hasLambda()                     - Détection lambda
isInsideClass()                 - Est dans une classe
isDescendantOf()                - Est descendant de
attachParameterTypeReferences() - Refs types params
```

---

## 3. Proposition d'Architecture

### 3.1 Classe de Base: `BaseScopeExtractionParser`

```typescript
abstract class BaseScopeExtractionParser {
  // ══════════════════════════════════════════════════════════════════
  // PROPRIÉTÉS
  // ══════════════════════════════════════════════════════════════════
  protected parser: any = null;
  protected initialized: boolean = false;

  abstract readonly language: SupportedLanguage;
  abstract readonly stopWords: Set<string>;
  abstract readonly builtinIdentifiers: Set<string>;

  // ══════════════════════════════════════════════════════════════════
  // MÉTHODES COMMUNES (implémentées dans la base)
  // ══════════════════════════════════════════════════════════════════

  // Initialisation
  async initialize(): Promise<void>

  // Point d'entrée principal
  async parseFile(filePath: string, content: string): Promise<ScopeFileAnalysis>

  // Utilitaires AST
  protected getNodeText(node: SyntaxNode | null, content: string): string
  protected findChildrenByType(node: SyntaxNode, type: string): SyntaxNode[]
  protected findChildByFieldName(node: SyntaxNode, fieldName: string): SyntaxNode | null

  // Utilitaires texte
  protected dedentContent(content: string): string
  protected getLineFromContent(content: string, lineNumber: number): string | undefined
  protected escapeRegex(str: string): string

  // Validation AST
  protected validateNode(node: SyntaxNode): boolean
  protected validateAST(rootNode: SyntaxNode): boolean
  protected extractNodeIssues(node: SyntaxNode): string[]
  protected extractNodeNotes(node: SyntaxNode): string[]
  protected extractASTIssues(rootNode: SyntaxNode): string[]

  // Métriques
  protected calculateComplexity(node: SyntaxNode): number

  // Références
  protected buildReferenceExclusions(name: string, parameters: ParameterInfo[]): Set<string>
  protected isNestedScope(node: SyntaxNode): boolean
  protected resolveImportsForScope(refs: IdentifierReference[], imports: ImportReference[]): ImportReference[]
  protected classifyScopeReferences(scopes: ScopeInfo[], imports: ImportReference[]): Map<string, ScopeInfo>
  protected attachSignatureReferences(scopes: ScopeInfo[], scopeIndex: Map<string, ScopeInfo>, imports: ImportReference[]): void

  // Extraction types
  protected extractBaseTypeIdentifier(type?: string): string | undefined
  protected extractAllTypeIdentifiers(type?: string): string[]

  // ══════════════════════════════════════════════════════════════════
  // MÉTHODES ABSTRAITES (à implémenter par chaque langage)
  // ══════════════════════════════════════════════════════════════════

  // Configuration des types de nœuds
  abstract readonly scopeNodeTypes: ScopeNodeTypeConfig;

  // Extraction principale
  protected abstract extractScopes(
    node: SyntaxNode,
    scopes: ScopeInfo[],
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[],
    filePath: string
  ): void;

  // Imports/Exports (syntaxe très différente par langage)
  protected abstract extractStructuredImports(content: string): ImportReference[];
  protected abstract extractImports(content: string): string[];
  protected abstract extractExports(content: string): string[];
  protected abstract extractDependencies(content: string): string[];

  // Paramètres et types (syntaxe différente)
  protected abstract extractParameters(node: SyntaxNode, content: string): ParameterInfo[];
  protected abstract extractReturnType(node: SyntaxNode, content: string): string | undefined;

  // Documentation (JSDoc vs docstrings vs /// comments)
  protected abstract extractDocumentation(node: SyntaxNode, content: string): string | undefined;

  // Symboles locaux
  protected abstract collectLocalSymbols(node: SyntaxNode, content: string): Set<string>;

  // Références identifiants
  protected abstract extractIdentifierReferences(
    node: SyntaxNode,
    content: string,
    exclusions: Set<string>
  ): IdentifierReference[];

  // Signature
  protected abstract buildSignature(
    type: string,
    name: string,
    parameters: ParameterInfo[],
    returnType?: string,
    modifiers?: string[]
  ): string;

  // ══════════════════════════════════════════════════════════════════
  // MÉTHODES OPTIONNELLES (override si le langage supporte)
  // ══════════════════════════════════════════════════════════════════

  // Classes
  protected extractClass?(node: SyntaxNode, content: string, depth: number, parent: string | undefined, fileImports: ImportReference[]): ScopeInfo;
  protected extractClassMembers?(node: SyntaxNode, content: string): ClassMemberInfo[];

  // Interfaces/Traits/Protocols
  protected extractInterface?(node: SyntaxNode, content: string, depth: number, parent: string | undefined, fileImports: ImportReference[]): ScopeInfo;

  // Fonctions
  protected extractFunction?(node: SyntaxNode, content: string, depth: number, parent: string | undefined, fileImports: ImportReference[]): ScopeInfo;
  protected extractMethod?(node: SyntaxNode, content: string, depth: number, parent: string | undefined, fileImports: ImportReference[]): ScopeInfo;

  // Énums
  protected extractEnum?(node: SyntaxNode, content: string, depth: number, parent: string | undefined, fileImports: ImportReference[]): ScopeInfo;
  protected extractEnumMembers?(node: SyntaxNode, content: string): EnumMemberInfo[];

  // Types
  protected extractTypeAlias?(node: SyntaxNode, content: string, depth: number, parent: string | undefined, fileImports: ImportReference[]): ScopeInfo;
  protected extractGenericParameters?(node: SyntaxNode, content: string): GenericParameter[];
  protected extractHeritageClauses?(node: SyntaxNode, content: string): HeritageClause[];

  // Décorateurs/Annotations
  protected extractDecoratorDetails?(node: SyntaxNode, content: string): DecoratorInfo[];

  // Modificateurs
  protected extractModifiers?(node: SyntaxNode, content: string): string[];
  protected extractAccessibility?(node: SyntaxNode): 'public' | 'private' | 'protected' | undefined;

  // Namespaces/Modules
  protected extractNamespace?(node: SyntaxNode, content: string, depth: number, parent: string | undefined, fileImports: ImportReference[]): ScopeInfo;

  // Variables
  protected extractVariables?(node: SyntaxNode, content: string, scopeName: string): VariableInfo[];
}
```

### 3.2 Configuration des Types de Nœuds

```typescript
interface ScopeNodeTypeConfig {
  // Noms des types de nœuds dans l'AST tree-sitter
  class?: string[];           // ex: ['class_declaration', 'abstract_class_declaration']
  interface?: string[];       // ex: ['interface_declaration']
  function?: string[];        // ex: ['function_declaration', 'function_definition']
  method?: string[];          // ex: ['method_definition', 'method_declaration']
  enum?: string[];            // ex: ['enum_declaration']
  typeAlias?: string[];       // ex: ['type_alias_declaration']
  namespace?: string[];       // ex: ['namespace_declaration', 'module_declaration']
  variable?: string[];        // ex: ['lexical_declaration', 'variable_declaration']
  struct?: string[];          // ex: ['struct_specifier'] (C/C++)
  trait?: string[];           // ex: ['trait_item'] (Rust)
  impl?: string[];            // ex: ['impl_item'] (Rust)

  // Nœuds à traverser récursivement
  containerNodes: string[];   // ex: ['program', 'statement_block', 'class_body']

  // Nœuds de définition (pour exclure des références)
  definitionNodes: string[];  // ex: ['identifier', 'property_identifier']
}
```

### 3.3 Mapping par Langage

| Concept | TypeScript | Python | C | C++ | Rust | C# | Go |
|---------|------------|--------|---|-----|------|----|----|
| **Classe** | `class_declaration` | `class_definition` | - | `class_specifier` | `struct_item` | `class_declaration` | - |
| **Interface** | `interface_declaration` | - | - | - | `trait_item` | `interface_declaration` | `type_spec` + `interface_type` |
| **Fonction** | `function_declaration` | `function_definition` | `function_definition` | `function_definition` | `function_item` | `method_declaration` | `function_declaration` |
| **Méthode** | `method_definition` | `function_definition` (in class) | - | `function_definition` (in class) | `function_item` (in impl) | `method_declaration` | `method_declaration` |
| **Enum** | `enum_declaration` | - | `enum_specifier` | `enum_specifier` | `enum_item` | `enum_declaration` | - |
| **Struct** | - | - | `struct_specifier` | `struct_specifier` | `struct_item` | `struct_declaration` | `type_spec` + `struct_type` |
| **Import** | `import_statement` | `import_statement` | `preproc_include` | `preproc_include` | `use_declaration` | `using_directive` | `import_declaration` |
| **Namespace** | `namespace_declaration` | - | - | `namespace_definition` | `mod` | `namespace_declaration` | `package_clause` |

---

## 4. Plan d'Implémentation

### Phase 1: Création de la classe de base (~2-3h)

1. Créer `BaseScopeExtractionParser.ts`
2. Extraire les méthodes communes de `ScopeExtractionParser.ts`
3. Définir les méthodes abstraites
4. Créer `ScopeNodeTypeConfig` interface

### Phase 2: Migration TypeScript (~1-2h)

1. Faire hériter `ScopeExtractionParser` de `BaseScopeExtractionParser`
2. Implémenter les méthodes abstraites
3. Vérifier que les tests passent

### Phase 3: Migration Python (~2-3h)

1. Faire hériter `PythonScopeExtractionParser` de `BaseScopeExtractionParser`
2. Compléter les fonctionnalités manquantes:
   - `extractInterface()` → Protocol/ABC
   - `extractEnum()` → enum.Enum
   - `extractTypeAlias()` → type aliases
   - `extractHeritageClauses()` → bases classes
   - `extractGenericParameters()` → Generic[T]
   - `extractDecoratorDetails()` → détails décorateurs

### Phase 4: Nouveaux parsers (~2-3h chacun)

Pour chaque langage (C, C++, Rust, C#, Go):

1. Créer `{Lang}ScopeExtractionParser.ts` héritant de `BaseScopeExtractionParser`
2. Définir `scopeNodeTypes` pour le langage
3. Implémenter les méthodes abstraites
4. Implémenter les méthodes optionnelles pertinentes
5. Ajouter des tests

---

## 5. Estimation des Économies

### Avant abstraction

| Parser | Lignes estimées |
|--------|----------------|
| TypeScript | 2758 |
| Python | 1538 (incomplet) |
| C | ~2000 |
| C++ | ~2500 |
| Rust | ~2200 |
| C# | ~2300 |
| Go | ~1800 |
| **Total** | ~15,000 lignes |

### Après abstraction

| Composant | Lignes estimées |
|-----------|----------------|
| BaseScopeExtractionParser | ~600 |
| TypeScript (delta) | ~1200 |
| Python (delta) | ~800 |
| C (delta) | ~600 |
| C++ (delta) | ~900 |
| Rust (delta) | ~700 |
| C# (delta) | ~800 |
| Go (delta) | ~500 |
| **Total** | ~6,100 lignes |

**Économie: ~60% de code en moins**

---

## 6. Risques et Considérations

### Risques

1. **Complexité accrue**: L'abstraction ajoute de l'indirection
2. **Cas edge**: Certains langages ont des particularités non prévues
3. **Performance**: Les méthodes virtuelles peuvent avoir un coût

### Mitigations

1. **Documentation claire**: Bien documenter les méthodes abstraites
2. **Tests exhaustifs**: Ajouter des tests pour chaque langage
3. **Profiling**: Mesurer la performance avant/après

---

## 7. Prochaines Étapes

1. [ ] Valider cette analyse avec les stakeholders
2. [ ] Créer `BaseScopeExtractionParser.ts`
3. [ ] Migrer TypeScript parser
4. [ ] Migrer et compléter Python parser
5. [ ] Implémenter C parser
6. [ ] Implémenter C++ parser (étendre C)
7. [ ] Implémenter Rust parser
8. [ ] Implémenter C# parser
9. [ ] Implémenter Go parser
10. [ ] Tests d'intégration

---

## Annexe: Structure AST par Langage

### C
```
translation_unit
├── preproc_include         → Import
├── type_definition         → Typedef + struct
│   └── struct_specifier    → Struct
├── enum_specifier          → Enum
└── function_definition     → Function
```

### C++
```
translation_unit
├── preproc_include         → Import
├── namespace_definition    → Namespace
│   └── declaration_list
├── template_declaration    → Template class/function
│   └── class_specifier     → Class
├── class_specifier         → Class
├── struct_specifier        → Struct
├── enum_specifier          → Enum
└── function_definition     → Function
```

### Rust
```
source_file
├── use_declaration         → Import
├── struct_item             → Struct
├── impl_item               → Impl block
│   └── function_item       → Method
├── trait_item              → Trait
├── enum_item               → Enum
└── function_item           → Function
```

### C#
```
compilation_unit
├── using_directive         → Import
└── namespace_declaration   → Namespace
    ├── interface_declaration → Interface
    ├── class_declaration     → Class
    ├── struct_declaration    → Struct
    └── enum_declaration      → Enum
```

### Go
```
source_file
├── package_clause          → Package
├── import_declaration      → Import
├── type_declaration        → Type definition
│   ├── struct_type         → Struct
│   └── interface_type      → Interface
├── function_declaration    → Function
└── method_declaration      → Method
```
