/**
 * Svelte Parser
 *
 * Parses Svelte components using tree-sitter-svelte.
 * Extracts script, style, and markup with Svelte-specific features.
 *
 * @since 2025-12-06
 */

export { SvelteParser } from './SvelteParser.js';
export type {
  SvelteComponentInfo,
  SvelteParseResult,
  SvelteParseOptions,
  SvelteBlock,
  SvelteRelationship,
  SvelteProp,
  SvelteReactive,
  SvelteStore,
  SvelteDispatcher,
  SvelteSlot,
  SvelteComponentUsage,
  SvelteAction,
  SvelteTransition,
} from './types.js';
