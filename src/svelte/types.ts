/**
 * Types for Svelte Parser
 *
 * Extracts script, style, and markup from Svelte components.
 *
 * @since 2025-12-06
 */

/**
 * Svelte component block (script, style, or markup)
 */
export interface SvelteBlock {
  /** Block type */
  type: 'script' | 'module' | 'style' | 'markup';

  /** Block content */
  content: string;

  /** Block attributes */
  attrs: Record<string, string | boolean>;

  /** Start line */
  startLine: number;

  /** End line */
  endLine: number;

  /** Language (from lang attribute) */
  lang?: string;
}

/**
 * Svelte prop definition (export let)
 */
export interface SvelteProp {
  /** Prop name */
  name: string;

  /** Type annotation */
  type?: string;

  /** Default value */
  default?: string;

  /** Line number */
  line: number;
}

/**
 * Svelte reactive statement ($:)
 */
export interface SvelteReactive {
  /** Statement label (if any) */
  label?: string;

  /** Dependencies (variables used) */
  dependencies: string[];

  /** Expression/statement */
  expression: string;

  /** Line number */
  line: number;
}

/**
 * Svelte store usage ($store)
 */
export interface SvelteStore {
  /** Store name (without $) */
  name: string;

  /** Is subscribed (auto-subscription with $) */
  isAutoSubscribed: boolean;

  /** Line number */
  line: number;
}

/**
 * Svelte event dispatcher
 */
export interface SvelteDispatcher {
  /** Event name */
  eventName: string;

  /** Line number */
  line: number;
}

/**
 * Svelte slot definition
 */
export interface SvelteSlot {
  /** Slot name (default for unnamed) */
  name: string;

  /** Slot props */
  props: string[];

  /** Line number */
  line: number;
}

/**
 * Svelte component usage in markup
 */
export interface SvelteComponentUsage {
  /** Component name */
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
 * Svelte action usage (use:xxx)
 */
export interface SvelteAction {
  /** Action name */
  name: string;

  /** Action parameters */
  parameters?: string;

  /** Line number */
  line: number;
}

/**
 * Svelte transition/animation (transition:xxx, in:xxx, out:xxx, animate:xxx)
 */
export interface SvelteTransition {
  /** Directive type */
  type: 'transition' | 'in' | 'out' | 'animate';

  /** Transition/animation name */
  name: string;

  /** Parameters */
  parameters?: string;

  /** Line number */
  line: number;
}

/**
 * Svelte component info - persisted in Neo4j
 */
export interface SvelteComponentInfo {
  /** Unique identifier */
  uuid: string;

  /** File path */
  file: string;

  /** Content hash */
  hash: string;

  /** Total lines */
  linesOfCode: number;

  /** Component name (from filename) */
  componentName: string;

  /** Has script */
  hasScript: boolean;

  /** Has module script (context="module") */
  hasModuleScript: boolean;

  /** Has style */
  hasStyle: boolean;

  /** Script language */
  scriptLang?: string;

  /** Style language */
  styleLang?: string;

  /** Props defined */
  props: SvelteProp[];

  /** Reactive statements */
  reactives: SvelteReactive[];

  /** Stores used */
  stores: SvelteStore[];

  /** Event dispatchers */
  dispatchers: SvelteDispatcher[];

  /** Slots defined */
  slots: SvelteSlot[];

  /** Components used */
  componentUsages: SvelteComponentUsage[];

  /** Actions used */
  actions: SvelteAction[];

  /** Transitions/animations used */
  transitions: SvelteTransition[];

  /** Imports */
  imports: string[];
}

/**
 * Svelte parse result
 */
export interface SvelteParseResult {
  /** Component info for Neo4j */
  component: SvelteComponentInfo;

  /** Parsed blocks */
  blocks: SvelteBlock[];

  /** Relationships */
  relationships: SvelteRelationship[];
}

/**
 * Svelte relationship
 */
export interface SvelteRelationship {
  /** Relationship type */
  type: 'IMPORTS' | 'USES_COMPONENT' | 'USES_STORE' | 'USES_ACTION';

  /** Source UUID */
  from: string;

  /** Target identifier */
  to: string;

  /** Additional properties */
  properties?: Record<string, unknown>;
}

/**
 * Svelte parse options
 */
export interface SvelteParseOptions {
  /** Parse reactive statements */
  parseReactives?: boolean;

  /** Parse store usages */
  parseStores?: boolean;

  /** Extract component usages */
  extractComponents?: boolean;
}
