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
} from './scope-extraction/index.js';

/**
 * @internal WASM loader utilities
 */
export { WasmLoader } from './wasm/index.js';
export type { SupportedLanguage } from './wasm/index.js';

