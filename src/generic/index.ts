/**
 * Generic Code Parser
 *
 * Heuristic-based parser for any code file.
 * Falls back to chunk-based extraction when patterns aren't recognized.
 *
 * @since 2025-12-06
 */

export { GenericCodeParser } from './GenericCodeParser.js';
export type {
  GenericScope,
  GenericImport,
  GenericFileAnalysis,
  GenericParseOptions,
  LanguageHints,
} from './types.js';
