/**
 * Vue SFC Parser
 *
 * Parses Vue Single File Components using tree-sitter-vue.
 * Extracts template, script, and style sections with their metadata.
 *
 * @since 2025-12-06
 */

export { VueParser } from './VueParser.js';
export type {
  VueSFCInfo,
  VueSFCParseResult,
  VueSFCParseOptions,
  VueSFCBlock,
  VueSFCRelationship,
  VueProp,
  VueEmit,
  VueSlot,
  VueComponentUsage,
  VueComposable,
  VueDirective,
} from './types.js';
