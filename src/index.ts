/**
 * @luciformresearch/codeparsers
 *
 * Unified code parsers for TypeScript, Python, and more with tree-sitter WASM bindings
 *
 * ## Recommended API (use these):
 * - TypeScriptLanguageParser, PythonLanguageParser - Main language parsers
 * - HTMLDocumentParser, CSSParser, SCSSParser - Web parsers
 * - VueParser, SvelteParser - Framework parsers
 * - GenericCodeParser - Fallback for unknown languages
 * - MarkdownParser - Documentation parser
 * - ParserRegistry - Auto-detect and use appropriate parser
 *
 * ## Universal Types:
 * - UniversalScope, FileAnalysis, UniversalImport, etc. from './base'
 */

// =============================================================================
// PUBLIC API - Recommended for external use
// =============================================================================

// Base infrastructure (universal types, registry)
export * from './base/index.js';

// Language-specific parsers (recommended)
export * from './typescript/index.js';
export * from './python/index.js';
export * from './rust/index.js';
export * from './go/index.js';
export * from './c/index.js';
export * from './cpp/index.js';
export * from './csharp/index.js';

// Web parsers
export * from './html/index.js';
export * from './css/index.js';
export * from './scss/index.js';

// Framework parsers
export * from './vue/index.js';
export * from './svelte/index.js';

// Utility parsers
export * from './generic/index.js';
export * from './markdown/index.js';

// Syntax highlighting (utility)
export * from './syntax-highlighting/index.js';

// =============================================================================
// INTERNAL API - Used internally, exported for backward compatibility
// =============================================================================

/**
 * @internal Low-level scope extraction (prefer TypeScriptLanguageParser/PythonLanguageParser)
 * Exported for backward compatibility with existing code
 */
export {
  ScopeExtractionParser,
  PythonScopeExtractionParser,
  CScopeExtractionParser,
  CppScopeExtractionParser,
  RustScopeExtractionParser,
  GoScopeExtractionParser,
  CSharpScopeExtractionParser,
  BaseScopeExtractionParser,
  TYPESCRIPT_NODE_TYPES,
  C_NODE_TYPES,
  CPP_NODE_TYPES,
  RUST_NODE_TYPES,
  GO_NODE_TYPES,
  CSHARP_NODE_TYPES,
  IDENTIFIER_STOP_WORDS,
  BUILTIN_IDENTIFIERS,
} from './scope-extraction/index.js';

export type {
  ScopeInfo,
  ScopeFileAnalysis,
  ParameterInfo,
  VariableInfo,
  ClassMemberInfo,
  ReturnTypeInfo,
  ImportReference,
  IdentifierReference,
  NodeTypeConfig,
} from './scope-extraction/index.js';

/**
 * Import resolution utilities
 */
export {
  ImportResolver,
  TypeScriptImportResolver,
  PythonImportResolver,
  CImportResolver,
  RustImportResolver,
  GoImportResolver,
  CSharpImportResolver,
  isLocalPath,
  isRelativePath,
  toUnixPath
} from './import-resolution/index.js';

export type {
  BaseImportResolver,
  ImportType,
  ResolvedImport,
} from './import-resolution/index.js';

/**
 * Relationship resolution - CONSUMES/CONSUMED_BY between scopes
 * Use this to resolve cross-file dependencies without a database
 */
export { RelationshipResolver } from './relationship-resolution/index.js';

export type {
  RelationshipType,
  ResolvedRelationship,
  RelationshipMetadata,
  ScopeMappingEntry,
  GlobalScopeMapping,
  UuidToScopeMapping,
  RelationshipResolverOptions,
  RelationshipResolutionResult,
  ResolutionStats,
  UnresolvedReference,
  ParsedFilesMap,
  EnrichedScope,
  EnrichedFileAnalysis,
  SupportedLanguage as RelationshipSupportedLanguage,
} from './relationship-resolution/index.js';

/**
 * @internal WASM loader utilities
 */
export { WasmLoader } from './wasm/index.js';
export type { SupportedLanguage } from './wasm/index.js';

