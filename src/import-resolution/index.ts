/**
 * Import Resolution module exports
 *
 * Provides import resolution for different programming languages.
 * Currently supports TypeScript/JavaScript, with extensibility for other languages.
 */

// Types
export type {
  BaseImportResolver,
  ImportType,
  ResolvedImport,
  TypeScriptConfig,
  CConfig,
  PythonConfig,
  RustConfig,
  GoConfig,
  CSharpConfig,
} from './types.js';

// Implementations
export { TypeScriptImportResolver } from './TypeScriptImportResolver.js';
export { PythonImportResolver } from './PythonImportResolver.js';
export { CImportResolver } from './CImportResolver.js';
export { RustImportResolver } from './RustImportResolver.js';
export { GoImportResolver } from './GoImportResolver.js';
export { CSharpImportResolver } from './CSharpImportResolver.js';

// Keep ImportResolver as alias for backward compatibility
export { TypeScriptImportResolver as ImportResolver } from './TypeScriptImportResolver.js';

// Path utilities
export { isLocalPath, isRelativePath, toUnixPath } from './path-utils.js';
