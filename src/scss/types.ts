/**
 * Types for SCSS Parser
 *
 * Extends CSS types with SCSS-specific features:
 * - Variables ($var)
 * - Mixins (@mixin/@include)
 * - Nesting
 * - @use/@forward
 *
 * @since 2025-12-06
 */

import type {
  CSSSelector,
  CSSProperty,
  CSSRule,
  CSSAtRule,
  CSSRelationship,
  CSSParseOptions,
} from '../css/types.js';

// Re-export CSS types that are reused
export type { CSSSelector, CSSProperty, CSSRule, CSSAtRule, CSSRelationship };

/**
 * SCSS Variable ($variable)
 */
export interface SCSSVariable {
  /** Variable name (e.g., "$primary-color") */
  name: string;

  /** Variable value */
  value: string;

  /** Is default (!default) */
  isDefault: boolean;

  /** Is global (!global) */
  isGlobal: boolean;

  /** Line number */
  line: number;
}

/**
 * SCSS Mixin definition
 */
export interface SCSSMixin {
  /** Mixin name */
  name: string;

  /** Parameters */
  parameters: SCSSMixinParameter[];

  /** Content placeholder (@content) used */
  hasContent: boolean;

  /** Start line */
  startLine: number;

  /** End line */
  endLine: number;
}

/**
 * SCSS Mixin parameter
 */
export interface SCSSMixinParameter {
  /** Parameter name (without $) */
  name: string;

  /** Default value */
  defaultValue?: string;

  /** Is rest parameter (...) */
  isRest: boolean;
}

/**
 * SCSS Mixin include (@include)
 */
export interface SCSSInclude {
  /** Mixin name being included */
  mixinName: string;

  /** Arguments passed */
  arguments: string[];

  /** Has content block */
  hasContent: boolean;

  /** Line number */
  line: number;
}

/**
 * SCSS Function definition
 */
export interface SCSSFunction {
  /** Function name */
  name: string;

  /** Parameters */
  parameters: SCSSMixinParameter[];

  /** Start line */
  startLine: number;

  /** End line */
  endLine: number;
}

/**
 * SCSS @use statement
 */
export interface SCSSUse {
  /** Module path */
  path: string;

  /** Namespace (as alias) */
  namespace?: string;

  /** With configuration */
  withConfig?: Record<string, string>;

  /** Line number */
  line: number;
}

/**
 * SCSS @forward statement
 */
export interface SCSSForward {
  /** Module path */
  path: string;

  /** Show only these members */
  show?: string[];

  /** Hide these members */
  hide?: string[];

  /** Prefix to add */
  prefix?: string;

  /** Line number */
  line: number;
}

/**
 * SCSS Extend (@extend)
 */
export interface SCSSExtend {
  /** Selector being extended */
  selector: string;

  /** Is optional (!optional) */
  isOptional: boolean;

  /** Line number */
  line: number;
}

/**
 * SCSS Placeholder selector (%placeholder)
 */
export interface SCSSPlaceholder {
  /** Placeholder name (without %) */
  name: string;

  /** Properties */
  properties: CSSProperty[];

  /** Start line */
  startLine: number;

  /** End line */
  endLine: number;
}

/**
 * Stylesheet info for SCSS - persisted in Neo4j
 */
export interface SCSSStylesheetInfo {
  /** Unique identifier */
  uuid: string;

  /** File path (relative to project root) */
  file: string;

  /** Content hash for change detection */
  hash: string;

  /** Total lines */
  linesOfCode: number;

  /** Number of rules */
  ruleCount: number;

  /** Number of selectors */
  selectorCount: number;

  /** Number of properties */
  propertyCount: number;

  /** SCSS variables ($var) */
  variables: SCSSVariable[];

  /** Mixins defined */
  mixins: SCSSMixin[];

  /** Functions defined */
  functions: SCSSFunction[];

  /** Placeholders defined (%placeholder) */
  placeholders: SCSSPlaceholder[];

  /** @use statements */
  uses: SCSSUse[];

  /** @forward statements */
  forwards: SCSSForward[];

  /** @import URLs (legacy) */
  imports: string[];

  /** Mixin includes */
  includes: SCSSInclude[];

  /** @extend statements */
  extends: SCSSExtend[];

  /** Max nesting depth */
  maxNestingDepth: number;

  /** @font-face declarations count */
  fontFaceCount: number;

  /** @keyframes names */
  keyframeNames: string[];

  /** Media queries used */
  mediaQueries: string[];
}

/**
 * Result of parsing an SCSS file
 */
export interface SCSSParseResult {
  /** Stylesheet info for Neo4j storage */
  stylesheet: SCSSStylesheetInfo;

  /** All rules in the file (including nested) */
  rules: CSSRule[];

  /** All at-rules in the file */
  atRules: CSSAtRule[];

  /** Relationships to create */
  relationships: CSSRelationship[];
}

/**
 * Options for SCSS parsing
 */
export interface SCSSParseOptions extends CSSParseOptions {
  /** Max nesting depth to track (default: 10) */
  maxNestingDepth?: number;

  /** Resolve @use paths */
  resolveUses?: boolean;
}
