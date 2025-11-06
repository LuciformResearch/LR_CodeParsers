# Refactorisation des Parseurs - Architecture Modulaire

## Vision

Refactoriser `@luciformresearch/codeparsers` pour séparer clairement :
1. **La logique de chargement WASM** (partagée Node.js + Browser)
2. **Les parseurs métier** spécialisés par use case :
   - **Scope Extraction** : découpe de scopes pour génération XML
   - **Syntax Highlighting** : tokenization pour affichage visuel

## Problèmes actuels

### 1. Organisation confuse
- `TypeScriptParser.ts` : Parser legacy, rôle flou
- `StructuredTypeScriptParser.ts` : Parser pour scope extraction (utilisé dans scripts)
- `BrowserTypeScriptParser.ts` : Parser pour browser (syntax highlighting)
- **Redondance** : logique WASM dupliquée dans chaque parser

### 2. Couplage fort
- Logique métier mélangée avec chargement WASM
- Impossible de réutiliser le chargement WASM entre parseurs
- Code Node.js vs Browser dupliqué

### 3. Nommage peu clair
- Pas évident quel parser utiliser pour quel use case
- "Structured" ne décrit pas bien le rôle (scope extraction)

## Architecture cible

### 1. Module de chargement WASM unifié

```typescript
// src/wasm/WasmLoader.ts

export interface WasmLoaderConfig {
  environment: 'node' | 'browser';
  treeSitterWasmUrl?: string;
  languageWasmUrl?: string;
}

export interface LoadedParser {
  parser: any; // web-tree-sitter Parser instance
  language: any; // Language instance
}

/**
 * Gestionnaire unifié de chargement WASM pour Node.js et Browser
 */
export class WasmLoader {
  private static parserInstances = new Map<string, LoadedParser>();

  /**
   * Charge tree-sitter et une grammaire de langage
   * Fonctionne en Node.js et Browser avec la même API
   */
  static async loadParser(
    language: 'typescript' | 'python',
    config: WasmLoaderConfig
  ): Promise<LoadedParser> {
    const cacheKey = `${language}-${config.environment}`;

    if (this.parserInstances.has(cacheKey)) {
      return this.parserInstances.get(cacheKey)!;
    }

    let parser: any;

    if (config.environment === 'browser') {
      parser = await this.loadBrowserParser(language, config);
    } else {
      parser = await this.loadNodeParser(language, config);
    }

    this.parserInstances.set(cacheKey, parser);
    return parser;
  }

  private static async loadBrowserParser(
    language: string,
    config: WasmLoaderConfig
  ): Promise<LoadedParser> {
    const Parser = (await import('web-tree-sitter')).default;

    const treeSitterUrl = config.treeSitterWasmUrl ||
      'https://cdn.jsdelivr.net/npm/web-tree-sitter@0.25.10/tree-sitter.wasm';

    await Parser.init({
      locateFile(scriptName: string) {
        return treeSitterUrl;
      },
    });

    const parser = new Parser();

    const languageUrl = config.languageWasmUrl ||
      `https://cdn.jsdelivr.net/npm/tree-sitter-wasms@0.1.13/out/tree-sitter-${language}.wasm`;

    const languageInstance = await Parser.Language.load(languageUrl);
    parser.setLanguage(languageInstance);

    return { parser, language: languageInstance };
  }

  private static async loadNodeParser(
    language: string,
    config: WasmLoaderConfig
  ): Promise<LoadedParser> {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);

    const Parser: any = await import('web-tree-sitter');
    await Parser.init();

    const parser = new Parser();

    // Charge depuis node_modules
    const wasmPath = require.resolve(`tree-sitter-${language}/tree-sitter-${language}.wasm`);
    const languageInstance = await Parser.Language.load(wasmPath);
    parser.setLanguage(languageInstance);

    return { parser, language: languageInstance };
  }

  /**
   * Nettoie les parseurs en cache
   */
  static clearCache(): void {
    this.parserInstances.clear();
  }
}
```

### 2. Parser spécialisé : Scope Extraction

```typescript
// src/scope-extraction/ScopeExtractionParser.ts

import { WasmLoader } from '../wasm/WasmLoader.js';

export interface ScopeInfo {
  uuid?: string; // Assigned later
  name: string;
  type: 'class' | 'function' | 'method' | 'interface' | 'type_alias';
  signature: string;
  startLine: number;
  endLine: number;
  content: string;
  parameters: ParameterInfo[];
  returnType?: string;
  children: ScopeInfo[];
  // ... full metadata for XML generation
}

/**
 * Parser optimisé pour l'extraction de scopes
 * Utilisé par les scripts de génération XML
 */
export class ScopeExtractionParser {
  private parser: any = null;
  private language: 'typescript' | 'python';

  constructor(language: 'typescript' | 'python') {
    this.language = language;
  }

  async initialize(): Promise<void> {
    const { parser } = await WasmLoader.loadParser(this.language, {
      environment: 'node'
    });
    this.parser = parser;
  }

  /**
   * Parse un fichier et extrait tous les scopes
   * Retourne une structure riche pour génération XML
   */
  async extractScopes(code: string, filePath: string): Promise<ScopeInfo[]> {
    const tree = this.parser.parse(code);
    const scopes: ScopeInfo[] = [];

    // Traverse l'AST et extrait les scopes avec toutes leurs métadonnées
    this.traverseForScopes(tree.rootNode, code, scopes);

    return scopes;
  }

  private traverseForScopes(node: any, code: string, scopes: ScopeInfo[]): void {
    // Logique complète d'extraction de scopes
    // Signature reconstruction, parameters, children, etc.
    // ...
  }
}
```

### 3. Parser spécialisé : Syntax Highlighting

```typescript
// src/syntax-highlighting/SyntaxHighlightingParser.ts

import { WasmLoader } from '../wasm/WasmLoader.js';

export interface HighlightToken {
  type: 'keyword' | 'identifier' | 'type' | 'string' | 'number' |
        'comment' | 'operator' | 'punctuation' | 'function' | 'class';
  text: string;
  start: number;
  end: number;
}

/**
 * Parser optimisé pour le syntax highlighting
 * Léger et rapide, utilisé dans le visualisateur browser
 */
export class SyntaxHighlightingParser {
  private parser: any = null;
  private language: 'typescript' | 'python';
  private environment: 'node' | 'browser';

  constructor(
    language: 'typescript' | 'python',
    environment: 'node' | 'browser' = 'browser'
  ) {
    this.language = language;
    this.environment = environment;
  }

  async initialize(wasmConfig?: { treeSitterUrl?: string; languageUrl?: string }): Promise<void> {
    const { parser } = await WasmLoader.loadParser(this.language, {
      environment: this.environment,
      treeSitterWasmUrl: wasmConfig?.treeSitterUrl,
      languageWasmUrl: wasmConfig?.languageUrl
    });
    this.parser = parser;
  }

  /**
   * Tokenize le code pour syntax highlighting
   * Retourne une liste de tokens catégorisés
   */
  getHighlightTokens(code: string): HighlightToken[] {
    const tree = this.parser.parse(code);
    const tokens: HighlightToken[] = [];

    this.traverseForTokens(tree.rootNode, code, tokens);

    return tokens;
  }

  private traverseForTokens(node: any, code: string, tokens: HighlightToken[]): void {
    // Traverse et catégorise les tokens pour highlighting
    // Utilise les types natifs tree-sitter
    // ...
  }
}
```

### 4. Exports clairs par use case

```typescript
// src/index.ts (main)
export { WasmLoader } from './wasm/WasmLoader.js';

// Scope extraction (Node.js)
export { ScopeExtractionParser } from './scope-extraction/ScopeExtractionParser.js';
export type { ScopeInfo } from './scope-extraction/ScopeExtractionParser.js';

// Syntax highlighting (Node.js + Browser)
export { SyntaxHighlightingParser } from './syntax-highlighting/SyntaxHighlightingParser.js';
export type { HighlightToken } from './syntax-highlighting/SyntaxHighlightingParser.js';

// Legacy (deprecated, à supprimer progressivement)
export { StructuredTypeScriptParser } from './legacy/StructuredTypeScriptParser.js';
export { TypeScriptParser } from './legacy/TypeScriptParser.js';
```

```typescript
// src/browser/index.ts
export { SyntaxHighlightingParser as BrowserParser } from '../syntax-highlighting/SyntaxHighlightingParser.js';
export type { HighlightToken } from '../syntax-highlighting/SyntaxHighlightingParser.js';
```

## Structure des fichiers

```
packages/codeparsers/
├── src/
│   ├── index.ts                           # Export principal
│   │
│   ├── wasm/                              # 🆕 Module WASM unifié
│   │   ├── WasmLoader.ts                  # Chargement Node.js + Browser
│   │   └── types.ts                       # Types partagés
│   │
│   ├── scope-extraction/                  # 🆕 Parser pour XML generation
│   │   ├── ScopeExtractionParser.ts       # Parser principal
│   │   ├── typescript/                    # Logique spécifique TS
│   │   ├── python/                        # Logique spécifique Python
│   │   └── types.ts                       # Types ScopeInfo, etc.
│   │
│   ├── syntax-highlighting/               # 🆕 Parser pour visualisateur
│   │   ├── SyntaxHighlightingParser.ts    # Parser principal
│   │   ├── categorizers/                  # Catégorisation des tokens
│   │   └── types.ts                       # Types HighlightToken, etc.
│   │
│   ├── browser/                           # Export browser
│   │   └── index.ts                       # Ré-exporte SyntaxHighlightingParser
│   │
│   ├── legacy/                            # 📦 Anciens parseurs (à migrer)
│   │   ├── StructuredTypeScriptParser.ts
│   │   ├── TypeScriptParser.ts
│   │   └── BrowserTypeScriptParser.ts
│   │
│   └── base/                              # Infrastructure universelle
│       └── ...                            # Types universels (déjà existant)
│
├── docs/
│   ├── 00-parser-refactoring-plan.md     # Ce document
│   ├── 01-usage-guide.md                 # Guide d'utilisation
│   └── 02-migration-guide.md             # Guide de migration
│
└── package.json
```

## Plan d'implémentation

### Phase 1: Module WASM unifié ✅
- [x] Créer `src/wasm/WasmLoader.ts`
- [x] Implémenter chargement Node.js
- [x] Implémenter chargement Browser
- [x] Tests unitaires

### Phase 2: Syntax Highlighting Parser
- [ ] Créer `src/syntax-highlighting/SyntaxHighlightingParser.ts`
- [ ] Migrer logique de `BrowserTypeScriptParser`
- [ ] Utiliser `WasmLoader` au lieu de logique custom
- [ ] Tester dans le visualisateur

### Phase 3: Scope Extraction Parser
- [ ] Créer `src/scope-extraction/ScopeExtractionParser.ts`
- [ ] Migrer logique de `StructuredTypeScriptParser`
- [ ] Utiliser `WasmLoader` au lieu de logique custom
- [ ] Tester dans scripts de génération XML

### Phase 4: Nettoyage et migration
- [ ] Déplacer anciens parseurs dans `legacy/`
- [ ] Marquer comme `@deprecated` dans JSDoc
- [ ] Créer guide de migration
- [ ] Mettre à jour scripts pour utiliser nouveaux parseurs
- [ ] Mettre à jour visualisateur pour utiliser nouveaux parseurs

### Phase 5: Publication
- [ ] Bump version à 0.2.0
- [ ] Documentation complète
- [ ] CHANGELOG détaillé
- [ ] Publier sur npm

## Avantages

### 1. Clarté
- **Nommage explicite** : `ScopeExtractionParser` vs `SyntaxHighlightingParser`
- **Séparation des responsabilités** : chaque parser fait une chose
- **Organisation logique** : structure reflète les use cases

### 2. Réutilisabilité
- **WasmLoader partagé** : pas de duplication
- **Même API** : Node.js et Browser utilisent la même interface
- **Testabilité** : chaque module peut être testé indépendamment

### 3. Maintenabilité
- **Code plus court** : parseurs focalisés sur leur métier
- **Pas de logique WASM** dans les parseurs métier
- **Évolutivité** : facile d'ajouter de nouveaux parseurs

### 4. Performance
- **Lazy loading** : charge seulement ce qui est nécessaire
- **Cache** : WasmLoader garde les instances en mémoire
- **Optimisation** : chaque parser optimisé pour son use case

## Utilisation après refactorisation

### Pour génération XML (scripts Node.js)
```typescript
import { ScopeExtractionParser } from '@luciformresearch/codeparsers';

const parser = new ScopeExtractionParser('typescript');
await parser.initialize();

const scopes = await parser.extractScopes(code, filePath);
// Génère XML avec scopes complets
```

### Pour syntax highlighting (browser)
```typescript
import { SyntaxHighlightingParser } from '@luciformresearch/codeparsers/browser';

const parser = new SyntaxHighlightingParser('typescript', 'browser');
await parser.initialize();

const tokens = parser.getHighlightTokens(code);
// Affiche avec couleurs
```

## Notes de migration

### Scripts existants
```typescript
// Avant
import { StructuredTypeScriptParser } from '@luciformresearch/codeparsers';

// Après
import { ScopeExtractionParser } from '@luciformresearch/codeparsers';
```

### Visualisateur
```typescript
// Avant
import { BrowserTypeScriptParser } from '@luciformresearch/codeparsers/browser';

// Après
import { SyntaxHighlightingParser as BrowserParser } from '@luciformresearch/codeparsers/browser';
// Ou directement
import { SyntaxHighlightingParser } from '@luciformresearch/codeparsers';
```

## Timeline

- **Semaine 1** : WasmLoader + SyntaxHighlightingParser
- **Semaine 2** : ScopeExtractionParser + tests
- **Semaine 3** : Migration des scripts et visualisateur
- **Semaine 4** : Documentation, cleanup, publication

---

**Status**: 📋 Plan (à implémenter)
**Date**: 2025-11-01
**Version cible**: 0.2.0
