/**
 * Types for Generic Code Parser
 *
 * Heuristic-based parser for unsupported languages.
 * Extracts code blocks based on brace matching and pattern detection.
 *
 * @since 2025-12-06
 */

/**
 * Generic code scope/block
 */
export interface GenericScope {
  /** Unique identifier */
  uuid: string;

  /** Scope name (function name, class name, or chunk identifier) */
  name: string;

  /** Detected type */
  type: 'function' | 'class' | 'method' | 'block' | 'chunk' | 'module' | 'unknown';

  /** The keyword that preceded this scope (def, function, class, etc.) */
  keyword?: string;

  /** Modifiers detected (public, private, async, static, etc.) */
  modifiers: string[];

  /** Parameters if detected */
  parameters?: string;

  /** Full source code */
  source: string;

  /** Start line */
  startLine: number;

  /** End line */
  endLine: number;

  /** Nesting depth */
  depth: number;

  /** Parent scope name */
  parentName?: string;

  /** Confidence score (0-1) - how confident we are this is a real scope */
  confidence: number;
}

/**
 * Detected import/include statement
 */
export interface GenericImport {
  /** Import statement type (import, require, use, include, etc.) */
  keyword: string;

  /** What's being imported */
  target: string;

  /** Full statement */
  statement: string;

  /** Line number */
  line: number;
}

/**
 * Generic file analysis result
 */
export interface GenericFileAnalysis {
  /** File path */
  file: string;

  /** Content hash */
  hash: string;

  /** Total lines */
  linesOfCode: number;

  /** Detected language hint (from extension or patterns) */
  languageHint?: string;

  /** Extracted scopes */
  scopes: GenericScope[];

  /** Detected imports */
  imports: GenericImport[];

  /** Brace style detected */
  braceStyle: 'curly' | 'indent' | 'mixed' | 'unknown';

  /** Comment style detected */
  commentStyle: string[];
}

/**
 * Parser options
 */
export interface GenericParseOptions {
  /** Minimum lines for a chunk to be considered a scope */
  minChunkLines?: number;

  /** Maximum lines for a single chunk (split if larger) */
  maxChunkLines?: number;

  /** Known function keywords for this file (auto-detected if not provided) */
  functionKeywords?: string[];

  /** Known class keywords for this file */
  classKeywords?: string[];

  /** Try to detect language from content */
  detectLanguage?: boolean;
}

/**
 * Language detection result
 */
export interface LanguageHints {
  /** Likely language */
  language?: string;

  /** Function keywords to look for */
  functionKeywords: string[];

  /** Class keywords to look for */
  classKeywords: string[];

  /** Module keywords */
  moduleKeywords: string[];

  /** Uses indentation for blocks (like Python) */
  indentBased: boolean;

  /** Comment prefixes */
  commentPrefixes: string[];
}
