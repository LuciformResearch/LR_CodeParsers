/**
 * Types for CSS Parser
 *
 * Extracts selectors, properties, and structure from CSS files
 *
 * @since 2025-12-06
 */

/**
 * CSS Selector info
 */
export interface CSSSelector {
  /** Full selector text (e.g., ".container > .item:hover") */
  selector: string;

  /** Selector type */
  type: 'class' | 'id' | 'element' | 'pseudo' | 'attribute' | 'combinator' | 'universal';

  /** Specificity score [inline, id, class, element] */
  specificity: [number, number, number, number];

  /** Line number */
  line: number;
}

/**
 * CSS Property info
 */
export interface CSSProperty {
  /** Property name (e.g., "background-color") */
  name: string;

  /** Property value (e.g., "#fff") */
  value: string;

  /** Is important */
  important: boolean;

  /** Line number */
  line: number;
}

/**
 * CSS Rule (selector + declarations)
 */
export interface CSSRule {
  /** Selectors for this rule */
  selectors: CSSSelector[];

  /** Properties/declarations */
  properties: CSSProperty[];

  /** Start line */
  startLine: number;

  /** End line */
  endLine: number;
}

/**
 * CSS At-Rule (media, keyframes, import, etc.)
 */
export interface CSSAtRule {
  /** At-rule name (media, keyframes, import, etc.) */
  name: string;

  /** Prelude/condition (e.g., "(min-width: 768px)" for @media) */
  prelude?: string;

  /** Nested rules (for @media, @supports, etc.) */
  rules: CSSRule[];

  /** For @import: the imported URL */
  importUrl?: string;

  /** Start line */
  startLine: number;

  /** End line */
  endLine: number;
}

/**
 * CSS Variable definition
 */
export interface CSSVariable {
  /** Variable name (e.g., "--primary-color") */
  name: string;

  /** Variable value */
  value: string;

  /** Scope selector (e.g., ":root") */
  scope: string;

  /** Line number */
  line: number;
}

/**
 * Stylesheet info - persisted in Neo4j
 */
export interface StylesheetInfo {
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

  /** CSS variables defined */
  variables: CSSVariable[];

  /** @import URLs */
  imports: string[];

  /** @font-face declarations count */
  fontFaceCount: number;

  /** @keyframes names */
  keyframeNames: string[];

  /** Media queries used */
  mediaQueries: string[];
}

/**
 * Result of parsing a CSS file
 */
export interface CSSParseResult {
  /** Stylesheet info for Neo4j storage */
  stylesheet: StylesheetInfo;

  /** All rules in the file */
  rules: CSSRule[];

  /** All at-rules in the file */
  atRules: CSSAtRule[];

  /** Relationships to create */
  relationships: CSSRelationship[];
}

/**
 * Relationship between CSS entities
 */
export interface CSSRelationship {
  /** Relationship type */
  type: 'IMPORTS' | 'DEFINES_VARIABLE' | 'USES_VARIABLE';

  /** Source entity UUID */
  from: string;

  /** Target entity UUID or identifier */
  to: string;

  /** Additional properties */
  properties?: Record<string, unknown>;
}

/**
 * Options for CSS parsing
 */
export interface CSSParseOptions {
  /** Include full rule details (memory-intensive) */
  includeRules?: boolean;

  /** Extract CSS variables */
  extractVariables?: boolean;

  /** Project root for resolving relative paths */
  projectRoot?: string;
}
