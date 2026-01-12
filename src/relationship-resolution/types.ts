/**
 * Relationship Resolution Types
 *
 * Types for resolving CONSUMES/CONSUMED_BY relationships between scopes
 * across multiple files without needing a database.
 */

import type { ScopeInfo, ScopeFileAnalysis } from '../scope-extraction/types.js';

/**
 * Type de relation entre scopes
 */
export type RelationshipType =
  | 'CONSUMES'       // Scope A utilise Scope B
  | 'CONSUMED_BY'    // Inverse de CONSUMES (auto-généré)
  | 'INHERITS_FROM'  // Classe extends autre classe
  | 'IMPLEMENTS'     // Classe implements interface (TS, C#, Java)
  | 'PARENT_OF'      // Parent contient enfant (class -> method)
  | 'HAS_PARENT'     // Enfant pointe vers parent (method -> class)
  | 'DECORATES'      // Decorator/Attribute sur un scope
  | 'DECORATED_BY'   // Inverse de DECORATES (auto-généré)
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
  /** Fichier source (chemin relatif) */
  fromFile: string;
  /** Fichier cible (chemin relatif) */
  toFile: string;
  /** Nom du scope source */
  fromName: string;
  /** Nom du scope cible */
  toName: string;
  /** Type du scope source */
  fromType: string;
  /** Type du scope cible */
  toType: string;
  /** Métadonnées additionnelles */
  metadata?: RelationshipMetadata;
}

/**
 * Métadonnées d'une relation
 */
export interface RelationshipMetadata {
  /** Contexte qui a permis la détection (ex: "extends MyClass") */
  context?: string;
  /** Si résolu via import */
  viaImport?: boolean;
  /** Chemin d'import original */
  importPath?: string;
  /** Pour INHERITS_FROM: clause utilisée (extends, implements) */
  clause?: 'extends' | 'implements' | 'trait_impl' | 'embedding';
  /** Pour les decorators: arguments du decorator */
  decoratorArgs?: string;
  /** Si résolu via fallback (matching par nom sans import resolution) */
  fallbackResolution?: boolean;
}

/**
 * Entrée dans le mapping global des scopes
 */
export interface ScopeMappingEntry {
  /** UUID unique du scope (déterministe) */
  uuid: string;
  /** Chemin du fichier (relatif au projet) */
  file: string;
  /** Type de scope (function, class, method, etc.) */
  type: string;
  /** Nom du scope */
  name: string;
  /** Signature complète (pour disambiguation) */
  signature?: string;
  /** Nom du parent (pour méthodes de classe) */
  parent?: string;
  /** Ligne de début */
  startLine: number;
  /** Ligne de fin */
  endLine: number;
}

/**
 * Mapping global: nom → liste de scopes avec ce nom
 * Permet de trouver rapidement tous les scopes qui s'appellent "MyClass"
 */
export type GlobalScopeMapping = Map<string, ScopeMappingEntry[]>;

/**
 * Mapping UUID → ScopeMappingEntry pour lookup rapide
 */
export type UuidToScopeMapping = Map<string, ScopeMappingEntry>;

/**
 * Langages supportés pour la résolution
 */
export type SupportedLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'rust'
  | 'go'
  | 'c'
  | 'cpp'
  | 'csharp';

/**
 * Options pour le RelationshipResolver
 */
export interface RelationshipResolverOptions {
  /** Racine du projet (pour résolution des imports) */
  projectRoot: string;

  /**
   * Langage par défaut si non détectable depuis l'extension.
   * Si non spécifié, le langage est détecté automatiquement.
   */
  defaultLanguage?: SupportedLanguage;

  /**
   * Inclure les relations PARENT_OF/HAS_PARENT (hiérarchie parent-enfant)
   * @default true
   */
  includeContains?: boolean;

  /**
   * Inclure les relations inverses (CONSUMED_BY, HAS_PARENT, DECORATED_BY)
   * @default true
   */
  includeInverse?: boolean;

  /**
   * Inclure les relations DECORATES pour les decorators/attributes
   * @default true
   */
  includeDecorators?: boolean;

  /**
   * Résoudre les références cross-file (via imports)
   * Si false, ne résout que les références locales (même fichier)
   * @default true
   */
  resolveCrossFile?: boolean;

  /**
   * Chemin vers tsconfig.json (pour TypeScript/JavaScript)
   * @default auto-detect in projectRoot
   */
  tsConfigPath?: string;

  /**
   * Debug mode: log des informations de résolution
   * @default false
   */
  debug?: boolean;
}

/**
 * Référence non résolue (pour debug/amélioration)
 */
export interface UnresolvedReference {
  /** Nom du scope source */
  fromScope: string;
  /** Type du scope source */
  fromType: string;
  /** Fichier source */
  fromFile: string;
  /** Identifiant référencé */
  identifier: string;
  /** Type de référence (local_scope, import, etc.) */
  kind: string;
  /** Raison de l'échec */
  reason: string;
  /** Candidats trouvés (pour debug) */
  candidates?: Array<{ file: string; type: string }>;
}

/**
 * Statistiques de résolution
 */
export interface ResolutionStats {
  /** Nombre total de scopes analysés */
  totalScopes: number;
  /** Nombre total de relations créées */
  totalRelationships: number;
  /** Relations par type */
  byType: Partial<Record<RelationshipType, number>>;
  /** Nombre de références non résolues */
  unresolvedCount: number;
  /** Nombre de fichiers analysés */
  filesAnalyzed: number;
  /** Temps de résolution (ms) */
  resolutionTimeMs?: number;
}

/**
 * Résultat de la résolution des relations
 */
export interface RelationshipResolutionResult {
  /** Relations résolues */
  relationships: ResolvedRelationship[];

  /** Mapping global des scopes (nom → entries) */
  scopeMapping: GlobalScopeMapping;

  /** Mapping UUID → scope pour lookup rapide */
  uuidMapping: UuidToScopeMapping;

  /** Statistiques */
  stats: ResolutionStats;

  /** Références non résolues (pour debug) */
  unresolvedReferences: UnresolvedReference[];
}

/**
 * Input pour la résolution: Map de fichiers parsés
 */
export type ParsedFilesMap = Map<string, ScopeFileAnalysis>;

/**
 * Extension de ScopeInfo avec informations de relation
 * (pour enrichir les scopes après résolution)
 */
export interface EnrichedScope extends ScopeInfo {
  /** UUID unique du scope */
  uuid: string;
  /** Scopes que ce scope consomme */
  consumes: string[];
  /** Scopes qui consomment ce scope */
  consumedBy: string[];
  /** Scopes dont ce scope hérite */
  inheritsFrom: string[];
  /** Scopes qui héritent de ce scope */
  inheritedBy: string[];
  /** Scopes dont ce scope est parent (enfants) */
  parentOf: string[];
  /** Scope parent de ce scope */
  hasParent?: string;
  /** Decorators appliqués à ce scope */
  decoratedBy: string[];
}

/**
 * Fichier enrichi avec relations résolues
 */
export interface EnrichedFileAnalysis {
  /** Chemin du fichier */
  filePath: string;
  /** Scopes enrichis avec relations */
  scopes: EnrichedScope[];
  /** Imports du fichier */
  imports: string[];
}
