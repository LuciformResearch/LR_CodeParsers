/**
 * CSS Parser
 *
 * Parses CSS files using tree-sitter-css.
 * Extracts selectors, properties, variables, and structure.
 *
 * @since 2025-12-06
 */

export { CSSParser } from './CSSParser.js';
export type {
  StylesheetInfo,
  CSSParseResult,
  CSSParseOptions,
  CSSRule,
  CSSAtRule,
  CSSSelector,
  CSSProperty,
  CSSVariable,
  CSSRelationship,
} from './types.js';
