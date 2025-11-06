/**
 * Parser Registry
 *
 * Central registry for all language parsers.
 * Manages parser lifecycle and provides lookup functionality.
 */

import type { Language } from './UniversalTypes.js';
import type { LanguageParser } from './LanguageParser.js';

export class ParserRegistry {
  private parsers = new Map<Language, LanguageParser>();
  private initialized = new Set<Language>();

  /**
   * Register a new parser
   */
  register(parser: LanguageParser): void {
    if (this.parsers.has(parser.language)) {
      console.warn(`Parser for ${parser.language} already registered, overwriting`);
    }
    this.parsers.set(parser.language, parser);
    // Remove from initialized set if re-registering
    this.initialized.delete(parser.language);
  }

  /**
   * Get parser for a specific language
   */
  getParser(language: Language): LanguageParser | null {
    return this.parsers.get(language) ?? null;
  }

  /**
   * Get parser that can handle a specific file
   */
  getParserForFile(filePath: string): LanguageParser | null {
    // First try by file extension
    const ext = filePath.substring(filePath.lastIndexOf('.'));

    for (const parser of this.parsers.values()) {
      if (parser.extensions.includes(ext)) {
        return parser;
      }
    }

    // Fallback: ask each parser if it can handle the file
    for (const parser of this.parsers.values()) {
      if (parser.canHandle(filePath)) {
        return parser;
      }
    }

    return null;
  }

  /**
   * Get all registered languages
   */
  getLanguages(): Language[] {
    return Array.from(this.parsers.keys());
  }

  /**
   * Get all registered parsers
   */
  getParsers(): LanguageParser[] {
    return Array.from(this.parsers.values());
  }

  /**
   * Initialize a specific parser
   */
  async initializeParser(language: Language): Promise<void> {
    const parser = this.parsers.get(language);
    if (!parser) {
      throw new Error(`No parser registered for language: ${language}`);
    }

    if (this.initialized.has(language)) {
      return; // Already initialized
    }

    await parser.initialize();
    this.initialized.add(language);
  }

  /**
   * Initialize all registered parsers
   */
  async initializeAll(): Promise<void> {
    const initPromises = Array.from(this.parsers.entries())
      .filter(([lang]) => !this.initialized.has(lang))
      .map(async ([lang, parser]) => {
        await parser.initialize();
        this.initialized.add(lang);
      });

    await Promise.all(initPromises);
  }

  /**
   * Check if a parser is initialized
   */
  isInitialized(language: Language): boolean {
    return this.initialized.has(language);
  }

  /**
   * Cleanup all parsers
   */
  async dispose(): Promise<void> {
    const disposePromises = Array.from(this.parsers.values())
      .filter(parser => parser.dispose)
      .map(parser => parser.dispose!());

    await Promise.all(disposePromises);
    this.initialized.clear();
  }

  /**
   * Get all supported file extensions
   */
  getSupportedExtensions(): string[] {
    const extensions = new Set<string>();
    for (const parser of this.parsers.values()) {
      parser.extensions.forEach(ext => extensions.add(ext));
    }
    return Array.from(extensions);
  }

  /**
   * Check if a file is supported by any parser
   */
  isSupported(filePath: string): boolean {
    return this.getParserForFile(filePath) !== null;
  }
}

/**
 * Global singleton registry instance
 */
export const globalRegistry = new ParserRegistry();
