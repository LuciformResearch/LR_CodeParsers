/**
 * Universal types for multi-language code analysis
 *
 * These types provide a common abstraction layer that works across
 * TypeScript, Python, Java, Go, Rust, C#, and other languages.
 */

import type { ParameterInfo } from '../scope-extraction/types.js';

export type Language =
  | 'typescript' | 'javascript'
  | 'python' | 'java' | 'kotlin'
  | 'go' | 'rust' | 'c' | 'cpp'
  | 'ruby' | 'php' | 'csharp';

export type ScopeType =
  | 'function' | 'method' | 'constructor'
  | 'class' | 'interface' | 'trait' | 'struct'
  | 'module' | 'namespace' | 'package'
  | 'enum' | 'type_alias'
  | 'variable' | 'constant' | 'lambda';

/**
 * Universal reference to an identifier (variable, function call, etc.)
 */
export interface UniversalReference {
  identifier: string;
  line: number;
  column?: number;
  context?: string;
  qualifier?: string;
  kind?: 'import' | 'local_scope' | 'builtin' | 'unknown';
  source?: string;
  targetScope?: string;
  isLocalImport?: boolean;
}

/**
 * Universal import information
 */
export interface UniversalImport {
  source: string;
  imported: string;
  alias?: string;
  kind: 'named' | 'namespace' | 'default' | 'wildcard';
  isLocal: boolean; // Whether this is a local/relative import (starts with . or /)
  line?: number;
  column?: number;
}

/**
 * Universal export information
 */
export interface UniversalExport {
  exported: string;
  source?: string;
  kind: 'named' | 'default' | 'wildcard';
  line?: number;
  column?: number;
}

/**
 * Universal scope metadata
 */
export interface UniversalScope {
  // Core metadata
  uuid: string;
  name: string;
  type: ScopeType;

  // Location
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn?: number;
  endColumn?: number;

  // Code
  source: string;
  language: Language;

  // Signature and types (when available)
  signature?: string;
  returnType?: string;
  parameters?: ParameterInfo[];

  // Value (for variables and constants)
  value?: string;

  // Decorators/Annotations (Python decorators, TypeScript decorators, Java annotations, etc.)
  decorators?: string[];

  // Documentation strings (Python docstrings, JSDoc, etc.)
  docstring?: string;

  // Hierarchy
  parentName?: string;
  parentUUID?: string;
  depth: number;

  // References
  references: UniversalReference[];
  imports: UniversalImport[];

  // Language-specific extensions (optional)
  languageSpecific?: Record<string, any>;
}

/**
 * Result of parsing a file
 */
export interface FileAnalysis {
  language: Language;
  filePath: string;
  scopes: UniversalScope[];
  imports: UniversalImport[];
  exports: UniversalExport[];

  // Metadata
  linesOfCode: number;
  parseTime?: number;
  errors?: Array<{ message: string; line?: number }>;
}

/**
 * Parser capabilities
 */
export interface ParserCapabilities {
  scopeExtraction: boolean;
  importResolution: boolean;
  typeInference: boolean;
  crossFileReferences: boolean;
}
