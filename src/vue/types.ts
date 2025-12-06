/**
 * Types for Vue SFC Parser
 *
 * Extracts template, script, and style sections from Vue Single File Components.
 *
 * @since 2025-12-06
 */

/**
 * Vue SFC Block (template, script, or style)
 */
export interface VueSFCBlock {
  /** Block type */
  type: 'template' | 'script' | 'style' | 'custom';

  /** Block content */
  content: string;

  /** Block attributes (lang, scoped, setup, etc.) */
  attrs: Record<string, string | boolean>;

  /** Start line */
  startLine: number;

  /** End line */
  endLine: number;

  /** Language (from lang attribute or inferred) */
  lang?: string;
}

/**
 * Vue template directive
 */
export interface VueDirective {
  /** Directive name (v-if, v-for, @click, :class, etc.) */
  name: string;

  /** Directive argument (v-bind:class -> class) */
  argument?: string;

  /** Directive modifiers (.prevent, .stop, etc.) */
  modifiers: string[];

  /** Expression value */
  expression?: string;

  /** Line number */
  line: number;
}

/**
 * Vue component usage in template
 */
export interface VueComponentUsage {
  /** Component name (PascalCase or kebab-case) */
  name: string;

  /** Props passed */
  props: string[];

  /** Events listened to */
  events: string[];

  /** Has slot content */
  hasSlot: boolean;

  /** Line number */
  line: number;
}

/**
 * Vue prop definition
 */
export interface VueProp {
  /** Prop name */
  name: string;

  /** Prop type */
  type?: string;

  /** Default value */
  default?: string;

  /** Is required */
  required: boolean;

  /** Line number */
  line: number;
}

/**
 * Vue emit definition
 */
export interface VueEmit {
  /** Event name */
  name: string;

  /** Payload type */
  payloadType?: string;

  /** Line number */
  line: number;
}

/**
 * Vue slot definition
 */
export interface VueSlot {
  /** Slot name (default for unnamed) */
  name: string;

  /** Slot props */
  props: string[];

  /** Line number */
  line: number;
}

/**
 * Vue composable usage
 */
export interface VueComposable {
  /** Composable name (useXxx) */
  name: string;

  /** Arguments */
  arguments: string[];

  /** Returned variables */
  returns: string[];

  /** Line number */
  line: number;
}

/**
 * Vue SFC info - persisted in Neo4j
 */
export interface VueSFCInfo {
  /** Unique identifier */
  uuid: string;

  /** File path */
  file: string;

  /** Content hash */
  hash: string;

  /** Total lines */
  linesOfCode: number;

  /** Component name (from filename or name option) */
  componentName: string;

  /** Has template */
  hasTemplate: boolean;

  /** Has script */
  hasScript: boolean;

  /** Has script setup */
  hasScriptSetup: boolean;

  /** Has style */
  hasStyle: boolean;

  /** Style scoped */
  styleScoped: boolean;

  /** Template language */
  templateLang?: string;

  /** Script language */
  scriptLang?: string;

  /** Style language */
  styleLang?: string;

  /** Props defined */
  props: VueProp[];

  /** Emits defined */
  emits: VueEmit[];

  /** Slots defined */
  slots: VueSlot[];

  /** Components used in template */
  componentUsages: VueComponentUsage[];

  /** Composables used */
  composables: VueComposable[];

  /** Directives used */
  directives: VueDirective[];

  /** Imports */
  imports: string[];
}

/**
 * Vue SFC parse result
 */
export interface VueSFCParseResult {
  /** SFC info for Neo4j */
  sfc: VueSFCInfo;

  /** Parsed blocks */
  blocks: VueSFCBlock[];

  /** Relationships */
  relationships: VueSFCRelationship[];
}

/**
 * Vue SFC relationship
 */
export interface VueSFCRelationship {
  /** Relationship type */
  type: 'IMPORTS' | 'USES_COMPONENT' | 'USES_COMPOSABLE';

  /** Source UUID */
  from: string;

  /** Target identifier */
  to: string;

  /** Additional properties */
  properties?: Record<string, unknown>;
}

/**
 * Vue SFC parse options
 */
export interface VueSFCParseOptions {
  /** Parse template directives */
  parseDirectives?: boolean;

  /** Parse component usages */
  parseComponents?: boolean;

  /** Extract composables */
  extractComposables?: boolean;
}
