/**
 * Language Parser Interface
 *
 * Common interface that all language-specific parsers must implement.
 * This enables the system to work uniformly across TypeScript, Python,
 * Java, Go, Rust, C#, and other languages.
 */

import type {
  Language,
  FileAnalysis,
  ParserCapabilities
} from './UniversalTypes.js';

export interface LanguageParser {
  /**
   * The language this parser handles
   */
  readonly language: Language;

  /**
   * File extensions this parser can handle (e.g., ['.ts', '.tsx'])
   */
  readonly extensions: string[];

  /**
   * Parser capabilities
   */
  readonly capabilities: ParserCapabilities;

  /**
   * Initialize the parser (load grammar, setup tree-sitter, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Parse a file and extract scopes, imports, exports
   *
   * @param filePath - Absolute path to the file
   * @param content - File content as string
   * @returns File analysis with scopes and metadata
   */
  parseFile(filePath: string, content: string): Promise<FileAnalysis>;

  /**
   * Check if this parser can handle a given file
   *
   * @param filePath - File path to check
   * @returns true if parser can handle this file
   */
  canHandle(filePath: string): boolean;

  /**
   * Cleanup resources (optional)
   */
  dispose?(): Promise<void>;
}

/**
 * Abstract base class providing common functionality
 */
export abstract class BaseLanguageParser implements LanguageParser {
  abstract readonly language: Language;
  abstract readonly extensions: string[];
  abstract readonly capabilities: ParserCapabilities;

  abstract initialize(): Promise<void>;
  abstract parseFile(filePath: string, content: string): Promise<FileAnalysis>;

  /**
   * Default implementation checks file extension
   */
  canHandle(filePath: string): boolean {
    const ext = filePath.substring(filePath.lastIndexOf('.'));
    return this.extensions.includes(ext);
  }

  /**
   * Default dispose does nothing
   */
  async dispose(): Promise<void> {
    // Override if needed
  }
}
