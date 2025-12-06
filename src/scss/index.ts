/**
 * SCSS Parser
 *
 * Parses SCSS/Sass files using tree-sitter-scss.
 * Extracts variables, mixins, functions, nesting, and standard CSS features.
 *
 * @since 2025-12-06
 */

export { SCSSParser } from './SCSSParser.js';
export type {
  SCSSStylesheetInfo,
  SCSSParseResult,
  SCSSParseOptions,
  SCSSVariable,
  SCSSMixin,
  SCSSMixinParameter,
  SCSSInclude,
  SCSSFunction,
  SCSSUse,
  SCSSForward,
  SCSSExtend,
  SCSSPlaceholder,
  // Re-exported from CSS
  CSSSelector,
  CSSProperty,
  CSSRule,
  CSSAtRule,
  CSSRelationship,
} from './types.js';
