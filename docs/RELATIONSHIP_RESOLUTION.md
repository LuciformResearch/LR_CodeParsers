# Relationship Resolution in Codeparsers

## Objectif

Permettre aux utilisateurs de codeparsers d'obtenir les relations CONSUMES/CONSUMED_BY entre scopes **sans avoir besoin de RagForge**. Actuellement, cette logique est dans `ragforge/packages/core/src/runtime/adapters/code-source-adapter.ts`.

## Architecture Actuelle

### Ce que fait codeparsers (par fichier)

```
fichier.ts → Parser → ScopeFileAnalysis
                      ├── scopes[]
                      │   ├── name, type, signature
                      │   ├── identifierReferences[]  ← références brutes
                      │   │   ├── identifier: "MyClass"
                      │   │   ├── kind: "local_scope" | "import"
                      │   │   ├── source: "./utils" (pour imports)
                      │   │   └── context: "extends MyClass"
                      │   └── importReferences[]
                      │       ├── source: "./utils"
                      │       ├── imported: "MyClass"
                      │       └── isLocal: true
                      └── imports[]
```

### Ce que fait ragforge/core (multi-fichiers)

```
Map<filePath, ScopeFileAnalysis> → code-source-adapter → Relations résolues
                                   ├── buildGlobalUUIDMapping()
                                   ├── buildScopeReferences()      (local_scope)
                                   ├── buildImportReferences()     (cross-file)
                                   ├── isInheritanceReference()    (extends detection)
                                   └── ImportResolver.followReExports()
```

## Ce qu'on veut ajouter à codeparsers

### Nouveau module: `relationship-resolution/`

```
src/relationship-resolution/
├── types.ts                    # Types pour les relations
├── RelationshipResolver.ts     # Classe principale
├── InheritanceDetector.ts      # Détection INHERITS_FROM vs CONSUMES
└── index.ts                    # Exports
```

## Types à créer

```typescript
// types.ts

/**
 * Type de relation entre scopes
 */
export type RelationshipType =
  | 'CONSUMES'       // Scope A utilise Scope B
  | 'CONSUMED_BY'    // Inverse de CONSUMES
  | 'INHERITS_FROM'  // Classe extends autre classe
  | 'IMPLEMENTS'     // Classe implements interface
  | 'CONTAINS'       // Parent contient enfant (class -> method)
  ;

/**
 * Relation résolue entre deux scopes
 */
export interface ResolvedRelationship {
  /** Type de relation */
  type: RelationshipType;
  /** UUID du scope source */
  fromUuid: string;
  /** UUID du scope cible */
  toUuid: string;
  /** Fichier source */
  fromFile: string;
  /** Fichier cible */
  toFile: string;
  /** Nom du scope source */
  fromName: string;
  /** Nom du scope cible */
  toName: string;
  /** Confiance dans la résolution (0-1) */
  confidence: number;
  /** Métadonnées additionnelles */
  metadata?: {
    /** Contexte qui a permis la détection (ex: "extends MyClass") */
    context?: string;
    /** Si résolu via import */
    viaImport?: boolean;
    /** Chemin d'import original */
    importPath?: string;
  };
}

/**
 * Entrée dans le mapping global des scopes
 */
export interface ScopeMappingEntry {
  /** UUID unique du scope */
  uuid: string;
  /** Chemin du fichier */
  file: string;
  /** Type de scope (function, class, etc.) */
  type: string;
  /** Nom du scope */
  name: string;
  /** Signature (pour disambiguation) */
  signature?: string;
}

/**
 * Mapping global: nom → liste de scopes avec ce nom
 */
export type GlobalScopeMapping = Map<string, ScopeMappingEntry[]>;

/**
 * Options pour le RelationshipResolver
 */
export interface RelationshipResolverOptions {
  /** Racine du projet (pour résolution des imports) */
  projectRoot: string;
  /** Langage (pour choisir le bon ImportResolver) */
  language: 'typescript' | 'python' | 'rust' | 'go' | 'c' | 'cpp' | 'csharp';
  /** Générer des UUIDs déterministes (basés sur fichier+nom+type) */
  deterministicUuids?: boolean;
  /** Inclure les relations CONTAINS (parent->enfant) */
  includeContains?: boolean;
  /** Inclure les relations inverses (CONSUMED_BY) */
  includeInverse?: boolean;
}

/**
 * Résultat de la résolution des relations
 */
export interface RelationshipResolutionResult {
  /** Relations résolues */
  relationships: ResolvedRelationship[];
  /** Mapping global des scopes (pour debug/inspection) */
  scopeMapping: GlobalScopeMapping;
  /** Statistiques */
  stats: {
    totalScopes: number;
    totalRelationships: number;
    byType: Record<RelationshipType, number>;
    unresolvedReferences: number;
  };
  /** Références non résolues (pour debug) */
  unresolvedReferences: Array<{
    fromScope: string;
    fromFile: string;
    identifier: string;
    kind: string;
    reason: string;
  }>;
}
```

## Classe RelationshipResolver

```typescript
// RelationshipResolver.ts

import { ScopeInfo, ScopeFileAnalysis } from '../scope-extraction/types.js';
import { BaseImportResolver } from '../import-resolution/types.js';
import { TypeScriptImportResolver } from '../import-resolution/TypeScriptImportResolver.js';
// ... autres resolvers

export class RelationshipResolver {
  private options: RelationshipResolverOptions;
  private importResolver: BaseImportResolver;
  private scopeMapping: GlobalScopeMapping;

  constructor(options: RelationshipResolverOptions) {
    this.options = options;
    this.importResolver = this.createImportResolver(options.language);
    this.scopeMapping = new Map();
  }

  /**
   * Point d'entrée principal
   * Prend les fichiers parsés et retourne les relations résolues
   */
  async resolveRelationships(
    parsedFiles: Map<string, ScopeFileAnalysis>
  ): Promise<RelationshipResolutionResult> {
    // 1. Construire le mapping global
    this.buildGlobalScopeMapping(parsedFiles);

    // 2. Résoudre les relations
    const relationships: ResolvedRelationship[] = [];
    const unresolvedReferences: any[] = [];

    for (const [filePath, analysis] of parsedFiles) {
      for (const scope of analysis.scopes) {
        // 2a. Résoudre les références locales (même fichier)
        const localRefs = this.resolveLocalScopeReferences(scope, filePath);
        relationships.push(...localRefs);

        // 2b. Résoudre les références d'import (cross-file)
        const importRefs = await this.resolveImportReferences(scope, filePath);
        relationships.push(...importRefs.resolved);
        unresolvedReferences.push(...importRefs.unresolved);

        // 2c. Relations CONTAINS (parent -> enfant)
        if (this.options.includeContains && scope.parent) {
          const containsRef = this.resolveContainsRelation(scope, filePath);
          if (containsRef) relationships.push(containsRef);
        }
      }
    }

    // 3. Générer les relations inverses si demandé
    if (this.options.includeInverse) {
      const inverseRels = this.generateInverseRelationships(relationships);
      relationships.push(...inverseRels);
    }

    // 4. Calculer les stats
    const stats = this.calculateStats(relationships, unresolvedReferences);

    return {
      relationships,
      scopeMapping: this.scopeMapping,
      stats,
      unresolvedReferences,
    };
  }

  /**
   * Construit le mapping global: nom → [{uuid, file, type, name}]
   */
  private buildGlobalScopeMapping(parsedFiles: Map<string, ScopeFileAnalysis>): void {
    this.scopeMapping.clear();

    for (const [filePath, analysis] of parsedFiles) {
      for (const scope of analysis.scopes) {
        const uuid = this.generateUuid(scope, filePath);
        const entry: ScopeMappingEntry = {
          uuid,
          file: filePath,
          type: scope.type,
          name: scope.name,
          signature: scope.signature,
        };

        if (!this.scopeMapping.has(scope.name)) {
          this.scopeMapping.set(scope.name, []);
        }
        this.scopeMapping.get(scope.name)!.push(entry);
      }
    }
  }

  /**
   * Résout les références local_scope (même fichier)
   */
  private resolveLocalScopeReferences(
    scope: ScopeInfo,
    filePath: string
  ): ResolvedRelationship[] {
    const relationships: ResolvedRelationship[] = [];

    if (!scope.identifierReferences) return relationships;

    for (const ref of scope.identifierReferences) {
      if (ref.kind !== 'local_scope' || !ref.targetScope) continue;

      const candidates = this.scopeMapping.get(ref.identifier) || [];
      const match = candidates.find(c => c.file === filePath);

      if (match) {
        const relType = this.detectRelationshipType(scope, match, ref.context);
        relationships.push({
          type: relType,
          fromUuid: this.generateUuid(scope, filePath),
          toUuid: match.uuid,
          fromFile: filePath,
          toFile: match.file,
          fromName: scope.name,
          toName: match.name,
          confidence: 1.0,
          metadata: { context: ref.context },
        });
      }
    }

    return relationships;
  }

  /**
   * Résout les références d'import (cross-file)
   */
  private async resolveImportReferences(
    scope: ScopeInfo,
    currentFile: string
  ): Promise<{ resolved: ResolvedRelationship[]; unresolved: any[] }> {
    const resolved: ResolvedRelationship[] = [];
    const unresolved: any[] = [];

    if (!scope.importReferences || !scope.identifierReferences) {
      return { resolved, unresolved };
    }

    // Filtrer les imports locaux
    const localImports = scope.importReferences.filter(i => i.isLocal);

    for (const imp of localImports) {
      // Trouver les références qui utilisent cet import
      const matchingRefs = scope.identifierReferences.filter(
        ref => ref.kind === 'import' &&
               ref.source === imp.source &&
               ref.identifier === imp.imported
      );

      for (const ref of matchingRefs) {
        // Résoudre le chemin d'import
        let resolvedPath = await this.importResolver.resolveImport(imp.source, currentFile);

        // Suivre les re-exports (TypeScript)
        if (resolvedPath && 'followReExports' in this.importResolver) {
          resolvedPath = await (this.importResolver as any).followReExports(
            resolvedPath,
            imp.imported
          );
        }

        const resolvedFile = resolvedPath
          ? this.importResolver.getRelativePath(resolvedPath)
          : undefined;

        // Trouver le scope cible
        const candidates = this.scopeMapping.get(imp.imported) || [];
        let targetEntry: ScopeMappingEntry | undefined;

        if (resolvedFile && candidates.length > 0) {
          // Filtrer par fichier résolu
          const fileCandidates = candidates.filter(c => c.file === resolvedFile);

          if (fileCandidates.length === 1) {
            targetEntry = fileCandidates[0];
          } else if (fileCandidates.length > 1) {
            // Plusieurs scopes avec le même nom: prioriser les "valeurs"
            const valueTypes = ['function', 'const', 'class', 'method', 'variable'];
            targetEntry = fileCandidates.find(c => valueTypes.includes(c.type))
                       || fileCandidates[0];
          }
        } else if (candidates.length === 1) {
          // Un seul candidat global
          targetEntry = candidates[0];
        }

        if (targetEntry) {
          const relType = this.detectRelationshipType(scope, targetEntry, ref.context);
          resolved.push({
            type: relType,
            fromUuid: this.generateUuid(scope, currentFile),
            toUuid: targetEntry.uuid,
            fromFile: currentFile,
            toFile: targetEntry.file,
            fromName: scope.name,
            toName: targetEntry.name,
            confidence: resolvedFile ? 1.0 : 0.8,
            metadata: {
              context: ref.context,
              viaImport: true,
              importPath: imp.source,
            },
          });
        } else {
          unresolved.push({
            fromScope: scope.name,
            fromFile: currentFile,
            identifier: imp.imported,
            kind: 'import',
            reason: candidates.length === 0
              ? 'No scope found with this name'
              : `Multiple candidates (${candidates.length}) but no file match`,
          });
        }
      }
    }

    return { resolved, unresolved };
  }

  /**
   * Détecte si c'est INHERITS_FROM, IMPLEMENTS ou CONSUMES
   */
  private detectRelationshipType(
    source: ScopeInfo | { type: string; signature?: string },
    target: ScopeMappingEntry,
    context?: string
  ): RelationshipType {
    // Vérifier le contexte pour "extends"
    if (context?.includes('extends')) {
      return 'INHERITS_FROM';
    }

    // Vérifier le contexte pour "implements"
    if (context?.includes('implements')) {
      return 'IMPLEMENTS';
    }

    // Vérifier la signature pour "extends"
    if (source.signature?.includes('extends') && source.signature.includes(target.name)) {
      return 'INHERITS_FROM';
    }

    // Vérifier la signature pour "implements"
    if (source.signature?.includes('implements') && source.signature.includes(target.name)) {
      return 'IMPLEMENTS';
    }

    // Rust: check for trait impl
    // impl Trait for Struct
    if (source.signature?.match(/impl\s+\w+\s+for/)) {
      return 'IMPLEMENTS';
    }

    // Python: check for class inheritance
    // class MyClass(BaseClass):
    if (source.type === 'class' && source.signature?.includes(`(${target.name}`)) {
      return 'INHERITS_FROM';
    }

    // Go: embedding (composition, mais traité comme héritage)
    // type MyStruct struct { BaseStruct }
    if (source.type === 'struct' && target.type === 'struct') {
      // TODO: améliorer la détection
    }

    // Par défaut: CONSUMES
    return 'CONSUMES';
  }

  /**
   * Génère un UUID pour un scope
   */
  private generateUuid(scope: ScopeInfo, filePath: string): string {
    if (this.options.deterministicUuids) {
      // UUID déterministe basé sur fichier + nom + type
      const key = `${filePath}:${scope.name}:${scope.type}`;
      return this.hashString(key);
    }
    // UUID aléatoire
    return crypto.randomUUID();
  }

  private hashString(str: string): string {
    // Simple hash pour UUID déterministe
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `scope-${Math.abs(hash).toString(16).padStart(8, '0')}`;
  }
}
```

## Utilisation prévue

```typescript
import { ScopeExtractionParser } from '@luciformresearch/codeparsers';
import { RelationshipResolver } from '@luciformresearch/codeparsers/relationship-resolution';

// 1. Parser les fichiers
const parser = new ScopeExtractionParser();
const parsedFiles = new Map<string, ScopeFileAnalysis>();

for (const file of projectFiles) {
  const content = await fs.readFile(file, 'utf8');
  const analysis = await parser.parseFile(content, file);
  parsedFiles.set(file, analysis);
}

// 2. Résoudre les relations
const resolver = new RelationshipResolver({
  projectRoot: '/path/to/project',
  language: 'typescript',
  deterministicUuids: true,
  includeContains: true,
  includeInverse: false,
});

const result = await resolver.resolveRelationships(parsedFiles);

// 3. Utiliser les relations
for (const rel of result.relationships) {
  console.log(`${rel.fromName} --[${rel.type}]--> ${rel.toName}`);
}

// Exemple de sortie:
// UserService --[CONSUMES]--> Repository
// UserService --[CONSUMES]--> Logger
// AdminService --[INHERITS_FROM]--> UserService
// UserController --[CONTAINS]--> handleRequest
```

## Migration depuis RagForge

Pour les utilisateurs de RagForge qui veulent utiliser codeparsers standalone:

| RagForge (code-source-adapter.ts) | Codeparsers (RelationshipResolver.ts) |
|-----------------------------------|---------------------------------------|
| `buildGlobalUUIDMapping()` | `buildGlobalScopeMapping()` |
| `buildScopeReferences()` | `resolveLocalScopeReferences()` |
| `buildImportReferences()` | `resolveImportReferences()` |
| `isInheritanceReference()` | `detectRelationshipType()` |
| `ImportResolver` | Réutilisé de `import-resolution/` |

## Langages supportés

| Langage | Import Resolver | Héritage | Implements | Notes |
|---------|-----------------|----------|------------|-------|
| TypeScript | `TypeScriptImportResolver` | `extends` | `implements` | Re-exports suivis |
| Python | `PythonImportResolver` (TODO) | `class A(B):` | N/A | |
| Rust | `RustImportResolver` | N/A | `impl Trait for` | Traits != héritage |
| Go | `GoImportResolver` | Embedding | N/A | Composition |
| C++ | `CppImportResolver` (TODO) | `: public Base` | N/A | Multiple inheritance |
| C# | `CSharpImportResolver` | `: Base` | `: IInterface` | |
| C | `CImportResolver` | N/A | N/A | Pas d'OOP |

## Prochaines étapes

1. [ ] Créer `src/relationship-resolution/types.ts`
2. [ ] Créer `src/relationship-resolution/RelationshipResolver.ts`
3. [ ] Ajouter `followReExports()` aux autres ImportResolvers (pas que TS)
4. [ ] Tests unitaires avec fixtures multi-fichiers
5. [ ] Benchmark performance sur gros projets
6. [ ] Documentation API

## Questions ouvertes

1. **UUIDs**: Utiliser `crypto.randomUUID()` ou hash déterministe?
   - Déterministe = même UUID si on re-parse le même fichier
   - Random = plus simple mais incompatible avec caching

2. **Relations inverses**: Générer CONSUMED_BY automatiquement?
   - Pro: Pratique pour requêtes "qui utilise X?"
   - Con: Double la taille des données

3. **Confiance**: Comment scorer la confiance de résolution?
   - 1.0 = fichier résolu exactement
   - 0.8 = candidat unique sans résolution fichier
   - 0.5 = heuristique sur nom

4. **Scope des relations**: Inclure les membres de classe?
   - `class.method` CONSUMES `other.function`?
   - Ou seulement au niveau classe?
