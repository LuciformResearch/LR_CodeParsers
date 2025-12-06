/**
 * HTML Document Parser
 *
 * Hybrid approach for HTML/Vue/Svelte files:
 * - Document metadata → persisted to Neo4j
 * - DOM tree → in-memory only (parsed on-demand)
 * - Scripts → parsed with TypeScript parser
 *
 * @since 2025-12-05
 */

export { HTMLDocumentParser } from './HTMLDocumentParser.js';
export { DOMTree, createDOMNode } from './DOMTree.js';
export type {
  DocumentInfo,
  DocumentType,
  DOMNode,
  HTMLParseResult,
  HTMLParseOptions,
  DocumentRelationship,
  ImageReference,
  ExternalScriptReference,
  ExternalStyleReference,
} from './types.js';
