/**
 * @luciformresearch/codeparsers
 *
 * Unified code parsers for TypeScript and Python with tree-sitter WASM bindings
 */

// Base infrastructure
export * from './base/index.js';

// WASM loader (unified Node.js + Browser)
export * from './wasm/index.js';

// Syntax highlighting parser
export * from './syntax-highlighting/index.js';

// Scope extraction parser
export * from './scope-extraction/index.js';

// Language-specific parsers
export * from './typescript/index.js';
export * from './python/index.js';

// HTML Document parser (hybrid approach)
export * from './html/index.js';

// CSS parser
export * from './css/index.js';

// SCSS parser
export * from './scss/index.js';

// Vue SFC parser
export * from './vue/index.js';

// Svelte parser
export * from './svelte/index.js';

// Legacy TypeScript parsers (deprecated, use ScopeExtractionParser instead)
/**
 * @deprecated Use ScopeExtractionParser from './scope-extraction' instead
 */
export { StructuredTypeScriptParser } from './legacy/TypeScriptParser.js';
export type {
  TypeScriptScope,
  ParameterInfo,
  ImportReference,
  IdentifierReference
} from './legacy/TypeScriptParser.js';

/**
 * @deprecated Use ScopeExtractionParser from './scope-extraction' instead
 */
export { StructuredTypeScriptParser as StructuredParser } from './legacy/StructuredTypeScriptParser.js';

// Legacy Python parser (deprecated, use PythonScopeExtractionParser instead)
/**
 * @deprecated Use PythonScopeExtractionParser from './scope-extraction' instead
 */
export { PythonParser } from './legacy/PythonParser.js';
export type {
  PythonScope,
  PythonParameter,
  PythonImport,
  PythonFileAnalysis
} from './legacy/PythonParser.js';

/**
 * @deprecated Use PythonScopeExtractionParser from './scope-extraction' instead
 */
export { PythonReferenceTracker } from './legacy/PythonReferenceTracker.js';
export type { PythonResolvedReference } from './legacy/PythonReferenceTracker.js';

