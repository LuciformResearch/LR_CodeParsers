/**
 * RelationshipResolver - Resolve CONSUMES/CONSUMED_BY relationships between scopes
 *
 * This class takes parsed files from codeparsers and resolves cross-file relationships
 * without needing a database. Users of codeparsers can use this standalone.
 *
 * Based on the logic from ragforge/packages/core/src/runtime/adapters/code-source-adapter.ts
 */

import { createHash } from 'crypto';
import * as path from 'path';
import type { ScopeInfo, ScopeFileAnalysis } from '../scope-extraction/types.js';
import type { BaseImportResolver } from '../import-resolution/types.js';
import { TypeScriptImportResolver } from '../import-resolution/TypeScriptImportResolver.js';
import { PythonImportResolver } from '../import-resolution/PythonImportResolver.js';
import { RustImportResolver } from '../import-resolution/RustImportResolver.js';
import { GoImportResolver } from '../import-resolution/GoImportResolver.js';
import { CImportResolver } from '../import-resolution/CImportResolver.js';
import { CSharpImportResolver } from '../import-resolution/CSharpImportResolver.js';

import type {
  RelationshipResolverOptions,
  RelationshipResolutionResult,
  ResolvedRelationship,
  RelationshipType,
  ScopeMappingEntry,
  GlobalScopeMapping,
  UuidToScopeMapping,
  UnresolvedReference,
  ResolutionStats,
  ParsedFilesMap,
  SupportedLanguage,
  EnrichedScope,
  EnrichedFileAnalysis,
} from './types.js';

/**
 * Default options for the resolver
 */
const DEFAULT_OPTIONS: Partial<RelationshipResolverOptions> = {
  includeContains: true,
  includeInverse: true,
  includeDecorators: true,
  resolveCrossFile: true,
  debug: false,
};

/**
 * Map file extensions to languages
 */
const EXTENSION_TO_LANGUAGE: Record<string, SupportedLanguage> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',
  '.cs': 'csharp',
};

export class RelationshipResolver {
  private options: Required<RelationshipResolverOptions>;
  private importResolvers: Map<SupportedLanguage, BaseImportResolver> = new Map();
  private scopeMapping: GlobalScopeMapping = new Map();
  private uuidMapping: UuidToScopeMapping = new Map();
  private configsLoaded = false;

  constructor(options: RelationshipResolverOptions) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      defaultLanguage: options.defaultLanguage || 'typescript',
    } as Required<RelationshipResolverOptions>;
  }

  /**
   * Initialize import resolvers for detected languages
   */
  private async initializeResolvers(languages: Set<SupportedLanguage>): Promise<void> {
    if (this.configsLoaded) return;

    for (const lang of languages) {
      if (this.importResolvers.has(lang)) continue;

      let resolver: BaseImportResolver;

      switch (lang) {
        case 'typescript':
        case 'javascript':
          resolver = new TypeScriptImportResolver(this.options.projectRoot);
          break;
        case 'rust':
          resolver = new RustImportResolver(this.options.projectRoot);
          break;
        case 'go':
          resolver = new GoImportResolver(this.options.projectRoot);
          break;
        case 'c':
        case 'cpp':
          resolver = new CImportResolver(this.options.projectRoot);
          break;
        case 'csharp':
          resolver = new CSharpImportResolver(this.options.projectRoot);
          break;
        case 'python':
          resolver = new PythonImportResolver(this.options.projectRoot);
          break;
        default:
          resolver = new TypeScriptImportResolver(this.options.projectRoot);
      }

      // Load config
      await resolver.loadConfig(
        this.options.projectRoot,
        lang === 'typescript' || lang === 'javascript'
          ? this.options.tsConfigPath
          : undefined
      );

      this.importResolvers.set(lang, resolver);
    }

    this.configsLoaded = true;
  }

  /**
   * Detect language from file extension
   */
  private detectLanguage(filePath: string): SupportedLanguage {
    const ext = path.extname(filePath).toLowerCase();
    return EXTENSION_TO_LANGUAGE[ext] || this.options.defaultLanguage;
  }

  /**
   * Get import resolver for a file
   */
  private getResolver(filePath: string): BaseImportResolver | undefined {
    const lang = this.detectLanguage(filePath);
    return this.importResolvers.get(lang);
  }

  /**
   * Main entry point: resolve all relationships from parsed files
   */
  async resolveRelationships(
    parsedFiles: ParsedFilesMap
  ): Promise<RelationshipResolutionResult> {
    const startTime = Date.now();

    // Detect languages and initialize resolvers
    const languages = new Set<SupportedLanguage>();
    for (const filePath of parsedFiles.keys()) {
      languages.add(this.detectLanguage(filePath));
    }
    await this.initializeResolvers(languages);

    // Build global scope mapping
    this.buildGlobalScopeMapping(parsedFiles);

    // Resolve relationships
    const relationships: ResolvedRelationship[] = [];
    const unresolvedReferences: UnresolvedReference[] = [];

    for (const [filePath, analysis] of parsedFiles) {
      for (const scope of analysis.scopes) {
        // 1. Resolve local scope references (same file)
        const localRefs = this.resolveLocalScopeReferences(scope, filePath);
        relationships.push(...localRefs);

        // 2. Resolve import references (cross-file)
        if (this.options.resolveCrossFile) {
          const importResult = await this.resolveImportReferences(scope, filePath, analysis);
          relationships.push(...importResult.resolved);
          unresolvedReferences.push(...importResult.unresolved);

          // 2b. Fallback: resolve unknown references (for languages without full import extraction)
          const unknownRefs = this.resolveUnknownReferences(scope, filePath, analysis);
          relationships.push(...unknownRefs);
        }

        // 3. Resolve PARENT_OF relationships (parent -> children)
        if (this.options.includeContains && scope.parent) {
          const containsRef = this.resolveContainsRelation(scope, filePath);
          if (containsRef) {
            relationships.push(containsRef);
          }
        }

        // 4. Resolve DECORATES relationships
        if (this.options.includeDecorators && scope.decorators && scope.decorators.length > 0) {
          const decoratorRefs = this.resolveDecoratorRelations(scope, filePath);
          relationships.push(...decoratorRefs);
        }
      }
    }

    // Generate inverse relationships
    if (this.options.includeInverse) {
      const inverseRels = this.generateInverseRelationships(relationships);
      relationships.push(...inverseRels);
    }

    // Calculate stats
    const stats = this.calculateStats(
      relationships,
      unresolvedReferences,
      parsedFiles.size,
      Date.now() - startTime
    );

    return {
      relationships,
      scopeMapping: this.scopeMapping,
      uuidMapping: this.uuidMapping,
      stats,
      unresolvedReferences,
    };
  }

  /**
   * Build global scope mapping: name → [{uuid, file, type, ...}]
   */
  private buildGlobalScopeMapping(parsedFiles: ParsedFilesMap): void {
    this.scopeMapping.clear();
    this.uuidMapping.clear();

    for (const [filePath, analysis] of parsedFiles) {
      // Use relative path for consistency
      const relativePath = this.getRelativePath(filePath);

      for (const scope of analysis.scopes) {
        const uuid = this.generateUuid(scope, relativePath);

        const entry: ScopeMappingEntry = {
          uuid,
          file: relativePath,
          type: scope.type,
          name: scope.name,
          signature: scope.signature,
          parent: scope.parent,
          startLine: scope.startLine,
          endLine: scope.endLine,
        };

        // Add to name mapping
        if (!this.scopeMapping.has(scope.name)) {
          this.scopeMapping.set(scope.name, []);
        }
        this.scopeMapping.get(scope.name)!.push(entry);

        // Add to UUID mapping
        this.uuidMapping.set(uuid, entry);
      }
    }

    if (this.options.debug) {
      console.log(`[RelationshipResolver] Built mapping for ${this.uuidMapping.size} scopes`);
    }
  }

  /**
   * Resolve local scope references (same file)
   */
  private resolveLocalScopeReferences(
    scope: ScopeInfo,
    filePath: string
  ): ResolvedRelationship[] {
    const relationships: ResolvedRelationship[] = [];
    const relativePath = this.getRelativePath(filePath);

    if (!scope.identifierReferences || !Array.isArray(scope.identifierReferences)) {
      return relationships;
    }

    const sourceUuid = this.generateUuid(scope, relativePath);

    for (const ref of scope.identifierReferences) {
      // Only process local_scope references
      if (ref.kind !== 'local_scope') continue;

      const candidates = this.scopeMapping.get(ref.identifier) || [];
      // Filter to same file
      const match = candidates.find(c => c.file === relativePath);

      if (match) {
        const relType = this.detectRelationshipType(scope, match, ref.context);

        relationships.push({
          type: relType,
          fromUuid: sourceUuid,
          toUuid: match.uuid,
          fromFile: relativePath,
          toFile: match.file,
          fromName: scope.name,
          toName: match.name,
          fromType: scope.type,
          toType: match.type,
          metadata: {
            context: ref.context,
            viaImport: false,
          },
        });
      }
    }

    return relationships;
  }

  /**
   * Resolve unknown references as relationships (both same-file and cross-file)
   * This handles:
   * 1. Languages that don't have full import extraction (Rust, Go, C, C++, C#)
   * 2. Same-file references that weren't classified as local_scope
   * by matching identifier references directly against the global scope mapping.
   */
  private resolveUnknownReferences(
    scope: ScopeInfo,
    filePath: string,
    fileAnalysis?: ScopeFileAnalysis
  ): ResolvedRelationship[] {
    const relationships: ResolvedRelationship[] = [];
    const relativePath = this.getRelativePath(filePath);

    // Collect identifier references from the scope
    let refs = scope.identifierReferences || [];

    // For non-module scopes, also include file-level identifier references
    // This helps languages where imports are only tracked at module level
    if (fileAnalysis && scope.type !== 'module') {
      const fileScope = fileAnalysis.scopes.find(s => s.type === 'module' || s.name.startsWith('file_scope'));
      if (fileScope?.identifierReferences) {
        refs = [...refs, ...fileScope.identifierReferences];
      }
    }

    // For class scopes, also include child method/constructor references
    // This allows class-level relationships like "UserService → User" when methods use User
    if (fileAnalysis && scope.type === 'class') {
      const childScopes = fileAnalysis.scopes.filter(s =>
        s.parent === scope.name &&
        (s.type === 'method' || s.type === 'function')
      );
      for (const child of childScopes) {
        if (child.identifierReferences) {
          refs = [...refs, ...child.identifierReferences];
        }
      }
    }

    if (refs.length === 0) {
      return relationships;
    }

    const sourceUuid = this.generateUuid(scope, relativePath);
    const seenTargets = new Set<string>(); // Avoid duplicates

    for (const ref of refs) {
      // Only process unknown references (not already classified as local_scope or import)
      if (ref.kind !== 'unknown') continue;

      const candidates = this.scopeMapping.get(ref.identifier) || [];

      if (candidates.length === 0) continue;

      // Don't reference ourselves
      const validCandidates = candidates.filter(c => {
        const candidateUuid = c.uuid;
        return candidateUuid !== sourceUuid;
      });

      if (validCandidates.length === 0) continue;

      // Pick the best candidate - prefer same file for inheritance/implementation
      let targetEntry: ScopeMappingEntry | undefined;

      // Check if this is an inheritance/implementation context
      const isInheritanceContext = ref.context?.includes('extends') || ref.context?.includes('implements');

      // Same-file candidates
      const sameFileCandidates = validCandidates.filter(c => c.file === relativePath);
      // Cross-file candidates
      const crossFileCandidates = validCandidates.filter(c => c.file !== relativePath);

      if (sameFileCandidates.length > 0) {
        // Prefer same-file for inheritance (Admin extends User in same file)
        if (sameFileCandidates.length === 1) {
          targetEntry = sameFileCandidates[0];
        } else {
          // Multiple same-file candidates - prioritize value types
          const valueTypes = ['class', 'interface', 'struct', 'trait', 'enum', 'function', 'constant', 'method', 'variable', 'namespace'];
          targetEntry =
            sameFileCandidates.find(c => valueTypes.includes(c.type)) || sameFileCandidates[0];
        }
      } else if (crossFileCandidates.length > 0) {
        // No same-file match, try cross-file
        if (crossFileCandidates.length === 1) {
          targetEntry = crossFileCandidates[0];
        } else {
          // Multiple candidates - prioritize value types
          const valueTypes = ['class', 'interface', 'struct', 'trait', 'enum', 'function', 'constant', 'method', 'variable', 'namespace'];
          targetEntry =
            crossFileCandidates.find(c => valueTypes.includes(c.type)) || crossFileCandidates[0];
        }
      }

      if (targetEntry && !seenTargets.has(targetEntry.uuid)) {
        seenTargets.add(targetEntry.uuid);
        const relType = this.detectRelationshipType(scope, targetEntry, ref.context);

        relationships.push({
          type: relType,
          fromUuid: sourceUuid,
          toUuid: targetEntry.uuid,
          fromFile: relativePath,
          toFile: targetEntry.file,
          fromName: scope.name,
          toName: targetEntry.name,
          fromType: scope.type,
          toType: targetEntry.type,
          metadata: {
            context: ref.context,
            viaImport: false,
            fallbackResolution: targetEntry.file !== relativePath, // Mark as fallback only for cross-file
          },
        });
      }
    }

    return relationships;
  }

  /**
   * Resolve import references (cross-file)
   */
  private async resolveImportReferences(
    scope: ScopeInfo,
    filePath: string,
    fileAnalysis?: ScopeFileAnalysis
  ): Promise<{ resolved: ResolvedRelationship[]; unresolved: UnresolvedReference[] }> {
    const resolved: ResolvedRelationship[] = [];
    const unresolved: UnresolvedReference[] = [];
    const relativePath = this.getRelativePath(filePath);
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.options.projectRoot, filePath);

    // Collect import references and identifier references
    let importRefs = scope.importReferences || [];
    let identifierRefs = scope.identifierReferences || [];

    // For class scopes, also include child method/constructor references
    // This allows class-level relationships like "UserService → User"
    if (fileAnalysis && scope.type === 'class') {
      const childScopes = fileAnalysis.scopes.filter(s =>
        s.parent === scope.name &&
        (s.type === 'method' || s.type === 'function')
      );
      for (const child of childScopes) {
        if (child.importReferences) {
          importRefs = [...importRefs, ...child.importReferences];
        }
        if (child.identifierReferences) {
          identifierRefs = [...identifierRefs, ...child.identifierReferences];
        }
      }
    }

    if (importRefs.length === 0 || identifierRefs.length === 0) {
      return { resolved, unresolved };
    }

    const resolver = this.getResolver(filePath);
    const sourceUuid = this.generateUuid(scope, relativePath);

    // Process ALL imports - we'll use fallback resolution if needed
    // This allows cross-file relationships even when import resolution fails
    // (e.g., missing Cargo.toml, go.mod, tsconfig.json, etc.)
    for (const imp of importRefs) {
      // Find identifier references that use this import
      // Match when:
      // 1. ref.identifier === imp.imported (direct usage like `User`)
      // 2. ref.qualifier === imp.imported (member access like `Status.Active`)
      const matchingRefs = identifierRefs.filter(
        ref =>
          ref.kind === 'import' &&
          ref.source === imp.source &&
          (ref.identifier === imp.imported || (ref as any).qualifier === imp.imported)
      );

      for (const ref of matchingRefs) {
        // Try to resolve import path to absolute file (if resolver available)
        let resolvedFile: string | undefined;

        if (resolver) {
          let resolvedPath = await resolver.resolveImport(imp.source, absolutePath);

          // Follow re-exports (TypeScript)
          if (resolvedPath && 'followReExports' in resolver) {
            resolvedPath = await (resolver as TypeScriptImportResolver).followReExports(
              resolvedPath,
              imp.imported
            );
          }

          resolvedFile = resolvedPath ? resolver.getRelativePath(resolvedPath) : undefined;
        }

        // Find target scope in global mapping
        const candidates = this.scopeMapping.get(imp.imported) || [];
        let targetEntry: ScopeMappingEntry | undefined;

        if (resolvedFile && candidates.length > 0) {
          // Filter by resolved file
          const fileCandidates = candidates.filter(c => c.file === resolvedFile);

          if (fileCandidates.length === 1) {
            targetEntry = fileCandidates[0];
          } else if (fileCandidates.length > 1) {
            // Multiple scopes with same name in same file
            // Prioritize value types over type-only definitions (interface, type_alias)
            const valueTypes = ['function', 'constant', 'class', 'method', 'variable', 'enum', 'namespace'];
            targetEntry =
              fileCandidates.find(c => valueTypes.includes(c.type)) || fileCandidates[0];
          }
        }

        // FALLBACK: If resolution failed, try global scope mapping
        // This enables cross-file relationships even without proper project config
        if (!targetEntry && candidates.length > 0) {
          // Filter to different file (cross-file only)
          const crossFileCandidates = candidates.filter(c => c.file !== relativePath);

          if (crossFileCandidates.length === 1) {
            // Only one candidate in other files - use it
            targetEntry = crossFileCandidates[0];
          } else if (crossFileCandidates.length > 1) {
            // Multiple candidates - prioritize value types
            const valueTypes = ['function', 'constant', 'class', 'method', 'variable', 'enum', 'namespace', 'struct', 'trait', 'interface'];
            targetEntry =
              crossFileCandidates.find(c => valueTypes.includes(c.type)) || crossFileCandidates[0];
          }
        }

        if (targetEntry) {
          const relType = this.detectRelationshipType(scope, targetEntry, ref.context);

          resolved.push({
            type: relType,
            fromUuid: sourceUuid,
            toUuid: targetEntry.uuid,
            fromFile: relativePath,
            toFile: targetEntry.file,
            fromName: scope.name,
            toName: targetEntry.name,
            fromType: scope.type,
            toType: targetEntry.type,
            metadata: {
              context: ref.context,
              viaImport: true,
              importPath: imp.source,
            },
          });
        } else {
          unresolved.push({
            fromScope: scope.name,
            fromType: scope.type,
            fromFile: relativePath,
            identifier: imp.imported,
            kind: 'import',
            reason:
              candidates.length === 0
                ? 'No scope found with this name'
                : `Multiple candidates (${candidates.length}) but no file match`,
            candidates: candidates.map(c => ({ file: c.file, type: c.type })),
          });
        }
      }
    }

    return { resolved, unresolved };
  }

  /**
   * Resolve PARENT_OF relationship (parent -> child)
   */
  private resolveContainsRelation(
    scope: ScopeInfo,
    filePath: string
  ): ResolvedRelationship | null {
    if (!scope.parent) return null;

    const relativePath = this.getRelativePath(filePath);
    const candidates = this.scopeMapping.get(scope.parent) || [];

    // Find parent in same file
    const parentEntry = candidates.find(c => c.file === relativePath);
    if (!parentEntry) return null;

    const childUuid = this.generateUuid(scope, relativePath);

    return {
      type: 'PARENT_OF',
      fromUuid: parentEntry.uuid,
      toUuid: childUuid,
      fromFile: relativePath,
      toFile: relativePath,
      fromName: parentEntry.name,
      toName: scope.name,
      fromType: parentEntry.type,
      toType: scope.type,
    };
  }

  /**
   * Resolve DECORATES relationships for decorators/attributes
   */
  private resolveDecoratorRelations(
    scope: ScopeInfo,
    filePath: string
  ): ResolvedRelationship[] {
    const relationships: ResolvedRelationship[] = [];
    const relativePath = this.getRelativePath(filePath);

    const targetUuid = this.generateUuid(scope, relativePath);

    // Use decoratorDetails if available (has name, arguments), otherwise use decorators (string[])
    const decoratorInfos: Array<{ name: string; arguments?: string }> = [];

    if (scope.decoratorDetails && scope.decoratorDetails.length > 0) {
      for (const d of scope.decoratorDetails) {
        decoratorInfos.push({ name: d.name, arguments: d.arguments });
      }
    } else if (scope.decorators && scope.decorators.length > 0) {
      // decorators is string[] - parse name from string
      for (const d of scope.decorators) {
        decoratorInfos.push({ name: d.replace(/^@/, '').split('(')[0] });
      }
    }

    for (const decorator of decoratorInfos) {
      // Try to find the decorator as a scope
      const decoratorName = decorator.name.replace(/^@/, '');
      const candidates = this.scopeMapping.get(decoratorName) || [];

      if (candidates.length > 0) {
        // Prefer decorator in same file, then any
        const decoratorEntry =
          candidates.find(c => c.file === relativePath) || candidates[0];

        relationships.push({
          type: 'DECORATES',
          fromUuid: decoratorEntry.uuid,
          toUuid: targetUuid,
          fromFile: decoratorEntry.file,
          toFile: relativePath,
          fromName: decoratorEntry.name,
          toName: scope.name,
          fromType: decoratorEntry.type,
          toType: scope.type,
          metadata: {
            decoratorArgs: decorator.arguments,
          },
        });
      }
    }

    return relationships;
  }

  /**
   * Detect relationship type: CONSUMES, INHERITS_FROM, or IMPLEMENTS
   */
  private detectRelationshipType(
    source: ScopeInfo,
    target: ScopeMappingEntry,
    context?: string
  ): RelationshipType {
    // Check context for "extends"
    if (context?.includes('extends')) {
      return 'INHERITS_FROM';
    }

    // Check context for "implements"
    if (context?.includes('implements')) {
      return 'IMPLEMENTS';
    }

    // Check signature for "extends"
    if (source.signature) {
      const sig = source.signature;

      // TypeScript/JavaScript: class X extends Y
      if (sig.includes('extends') && sig.includes(target.name)) {
        return 'INHERITS_FROM';
      }

      // TypeScript/JavaScript: class X implements Y
      if (sig.includes('implements') && sig.includes(target.name)) {
        return 'IMPLEMENTS';
      }

      // Rust: impl Trait for Struct
      if (sig.match(/impl\s+\w+\s+for/) && sig.includes(target.name)) {
        return 'IMPLEMENTS';
      }

      // C++/C#: class X : public Y or class X : Y
      if (sig.match(/:\s*(public|private|protected)?\s*/) && sig.includes(target.name)) {
        // Could be inheritance or interface implementation
        if (target.type === 'interface') {
          return 'IMPLEMENTS';
        }
        return 'INHERITS_FROM';
      }

      // Python: class X(Y):
      if (source.type === 'class' && sig.includes(`(${target.name}`)) {
        return 'INHERITS_FROM';
      }

      // Go: embedding (type A struct { B })
      // This is composition but often treated like inheritance
      // Note: Go structs are usually typed as 'class' or 'type_alias' in our parsers
      // Check signature for "struct" keyword
      if (sig.includes('struct') && sig.includes(target.name)) {
        // Check if target is embedded (appears as field without name in content)
        const content = source.content || '';
        if (content.includes(`\t${target.name}\n`) || content.includes(` ${target.name}\n`)) {
          return 'INHERITS_FROM';
        }
      }
    }

    // Check heritage clauses if available (TypeScript)
    const tsMetadata = (source as any).tsMetadata;
    if (tsMetadata?.heritageClauses) {
      for (const clause of tsMetadata.heritageClauses) {
        if (clause.types?.includes(target.name)) {
          return clause.clause === 'implements' ? 'IMPLEMENTS' : 'INHERITS_FROM';
        }
      }
    }

    // Default: CONSUMES
    return 'CONSUMES';
  }

  /**
   * Generate inverse relationships
   */
  private generateInverseRelationships(
    relationships: ResolvedRelationship[]
  ): ResolvedRelationship[] {
    const inverseMap: Record<RelationshipType, RelationshipType | null> = {
      CONSUMES: 'CONSUMED_BY',
      CONSUMED_BY: null, // Don't generate inverse of inverse
      INHERITS_FROM: null, // No inverse for inheritance (asymmetric)
      IMPLEMENTS: null, // No inverse for implements
      PARENT_OF: 'HAS_PARENT',
      HAS_PARENT: null,
      DECORATES: 'DECORATED_BY',
      DECORATED_BY: null,
    };

    const inverseRels: ResolvedRelationship[] = [];

    for (const rel of relationships) {
      const inverseType = inverseMap[rel.type];
      if (inverseType) {
        inverseRels.push({
          type: inverseType,
          fromUuid: rel.toUuid,
          toUuid: rel.fromUuid,
          fromFile: rel.toFile,
          toFile: rel.fromFile,
          fromName: rel.toName,
          toName: rel.fromName,
          fromType: rel.toType,
          toType: rel.fromType,
          metadata: rel.metadata,
        });
      }
    }

    return inverseRels;
  }

  /**
   * Generate deterministic UUID for a scope
   * Compatible with ragforge's UniqueIDHelper.GenerateDeterministicUUID
   */
  private generateUuid(scope: ScopeInfo, filePath: string): string {
    // Build signature hash for stability
    const signatureHash = this.getSignatureHash(scope);

    // Format: filePath:name:type:signatureHash
    const input = `${filePath}:${scope.name}:${scope.type}:${signatureHash}`;

    // SHA-256 hash, formatted as UUID
    const hash = createHash('sha256').update(input).digest('hex').substring(0, 32);

    // Format as UUID: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
    return (
      hash.substring(0, 8) +
      '-' +
      hash.substring(8, 12) +
      '-' +
      hash.substring(12, 16) +
      '-' +
      hash.substring(16, 20) +
      '-' +
      hash.substring(20, 32)
    ).toUpperCase();
  }

  /**
   * Get signature hash for UUID stability
   * Same scope = same hash even if line numbers change
   */
  private getSignatureHash(scope: ScopeInfo): string {
    const parentPrefix = scope.parent ? `${scope.parent}.` : '';

    // Use signature if available, otherwise build from name:type:content
    const baseInput =
      scope.signature || `${scope.name}:${scope.type}:${scope.contentDedented || scope.content || ''}`;

    let hashInput = `${parentPrefix}${baseInput}`;

    // For variables/constants: include line number to differentiate same-name vars
    if (scope.type === 'variable' || scope.type === 'constant') {
      hashInput += `:line${scope.startLine}`;
    }

    return createHash('sha256').update(hashInput).digest('hex').substring(0, 8);
  }

  /**
   * Get relative path from project root
   */
  private getRelativePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return path.relative(this.options.projectRoot, filePath);
    }
    return filePath;
  }

  /**
   * Calculate resolution statistics
   */
  private calculateStats(
    relationships: ResolvedRelationship[],
    unresolvedReferences: UnresolvedReference[],
    filesCount: number,
    timeMs: number
  ): ResolutionStats {
    const byType: Partial<Record<RelationshipType, number>> = {};

    for (const rel of relationships) {
      byType[rel.type] = (byType[rel.type] || 0) + 1;
    }

    return {
      totalScopes: this.uuidMapping.size,
      totalRelationships: relationships.length,
      byType,
      unresolvedCount: unresolvedReferences.length,
      filesAnalyzed: filesCount,
      resolutionTimeMs: timeMs,
    };
  }

  /**
   * Enrich parsed files with resolved relationships
   * Returns scopes with consumes, consumedBy, etc. arrays populated
   */
  enrichParsedFiles(
    parsedFiles: ParsedFilesMap,
    result: RelationshipResolutionResult
  ): Map<string, EnrichedFileAnalysis> {
    const enrichedFiles = new Map<string, EnrichedFileAnalysis>();

    // Build UUID -> relationships index
    const relsBySource = new Map<string, ResolvedRelationship[]>();
    const relsByTarget = new Map<string, ResolvedRelationship[]>();

    for (const rel of result.relationships) {
      if (!relsBySource.has(rel.fromUuid)) {
        relsBySource.set(rel.fromUuid, []);
      }
      relsBySource.get(rel.fromUuid)!.push(rel);

      if (!relsByTarget.has(rel.toUuid)) {
        relsByTarget.set(rel.toUuid, []);
      }
      relsByTarget.get(rel.toUuid)!.push(rel);
    }

    for (const [filePath, analysis] of parsedFiles) {
      const relativePath = this.getRelativePath(filePath);
      const enrichedScopes: EnrichedScope[] = [];

      for (const scope of analysis.scopes) {
        const uuid = this.generateUuid(scope, relativePath);
        const outgoing = relsBySource.get(uuid) || [];
        const incoming = relsByTarget.get(uuid) || [];

        const enriched: EnrichedScope = {
          ...scope,
          uuid,
          consumes: outgoing
            .filter(r => r.type === 'CONSUMES')
            .map(r => r.toUuid),
          consumedBy: incoming
            .filter(r => r.type === 'CONSUMES')
            .map(r => r.fromUuid),
          inheritsFrom: outgoing
            .filter(r => r.type === 'INHERITS_FROM' || r.type === 'IMPLEMENTS')
            .map(r => r.toUuid),
          inheritedBy: incoming
            .filter(r => r.type === 'INHERITS_FROM' || r.type === 'IMPLEMENTS')
            .map(r => r.fromUuid),
          parentOf: outgoing
            .filter(r => r.type === 'PARENT_OF')
            .map(r => r.toUuid),
          hasParent: incoming.find(r => r.type === 'PARENT_OF')?.fromUuid,
          decoratedBy: incoming
            .filter(r => r.type === 'DECORATES')
            .map(r => r.fromUuid),
        };

        enrichedScopes.push(enriched);
      }

      enrichedFiles.set(relativePath, {
        filePath: relativePath,
        scopes: enrichedScopes,
        imports: analysis.imports || [],
      });
    }

    return enrichedFiles;
  }

  /**
   * Get scope by UUID
   */
  getScopeByUuid(uuid: string): ScopeMappingEntry | undefined {
    return this.uuidMapping.get(uuid);
  }

  /**
   * Get all scopes by name
   */
  getScopesByName(name: string): ScopeMappingEntry[] {
    return this.scopeMapping.get(name) || [];
  }

  /**
   * Find consumers of a scope (what uses this scope)
   */
  findConsumers(
    uuid: string,
    result: RelationshipResolutionResult
  ): ScopeMappingEntry[] {
    const consumers: ScopeMappingEntry[] = [];

    for (const rel of result.relationships) {
      if (rel.toUuid === uuid && rel.type === 'CONSUMES') {
        const entry = this.uuidMapping.get(rel.fromUuid);
        if (entry) consumers.push(entry);
      }
    }

    return consumers;
  }

  /**
   * Find dependencies of a scope (what this scope uses)
   */
  findDependencies(
    uuid: string,
    result: RelationshipResolutionResult
  ): ScopeMappingEntry[] {
    const dependencies: ScopeMappingEntry[] = [];

    for (const rel of result.relationships) {
      if (rel.fromUuid === uuid && rel.type === 'CONSUMES') {
        const entry = this.uuidMapping.get(rel.toUuid);
        if (entry) dependencies.push(entry);
      }
    }

    return dependencies;
  }
}
