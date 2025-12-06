/**
 * Types for HTML Document Parser
 *
 * Hybrid approach:
 * - Document: Persisted in Neo4j (lightweight metadata)
 * - DOMNode: In-memory only (parsed on-demand)
 *
 * @since 2025-12-05
 */

/**
 * Document type for HTML files
 * Persisted in Neo4j
 */
export type DocumentType = 'html' | 'vue-sfc' | 'svelte' | 'astro';

/**
 * Image reference found in document
 * OCR is handled by ragforge-runtime, not here
 */
export interface ImageReference {
  /** Path to the image file (relative or absolute) */
  src: string;

  /** Alt text from the img tag (if any) */
  alt?: string;

  /** Line number where the image is referenced */
  line: number;
}

/**
 * External script reference
 */
export interface ExternalScriptReference {
  /** Path to the script file */
  src: string;

  /** Script type (module, text/javascript, etc.) */
  type?: string;

  /** Whether script is async */
  async?: boolean;

  /** Whether script is deferred */
  defer?: boolean;

  /** Line number where the script is referenced */
  line: number;
}

/**
 * External stylesheet reference
 */
export interface ExternalStyleReference {
  /** Path to the stylesheet file */
  href: string;

  /** Media query (if any) */
  media?: string;

  /** Line number where the stylesheet is referenced */
  line: number;
}

/**
 * Document entity - persisted in Neo4j
 * Represents an HTML/Vue/Svelte file with extracted metadata
 */
export interface DocumentInfo {
  /** Unique identifier */
  uuid: string;

  /** File path (relative to project root) */
  file: string;

  /** Document type */
  type: DocumentType;

  /** Content hash for change detection */
  hash: string;

  /** Start line (always 1 for documents) */
  startLine: number;

  /** End line */
  endLine: number;

  /** Total lines of code */
  linesOfCode: number;

  // === Template metadata ===

  /** Has <template> section (Vue/Svelte) */
  hasTemplate: boolean;

  /** Has <script> section */
  hasScript: boolean;

  /** Has <style> section */
  hasStyle: boolean;

  // === Vue/Component specific ===

  /** Component name (from filename or export) */
  componentName?: string;

  /** Script language (ts, js, tsx) */
  scriptLang?: string;

  /** Is script setup (Vue 3) */
  isScriptSetup?: boolean;

  // === Extracted info ===

  /** Exported symbols */
  exports: string[];

  /** Imported modules/components */
  imports: string[];

  /** Components used in template */
  usedComponents: string[];

  // === Images and OCR ===

  /** Images found in document (src paths) */
  images: ImageReference[];

  // === External references ===

  /** External scripts referenced via <script src="..."> */
  externalScripts: ExternalScriptReference[];

  /** External stylesheets referenced via <link rel="stylesheet" href="..."> */
  externalStyles: ExternalStyleReference[];

  // === Metadata ===

  /** Title from <title> tag or first <h1> */
  title?: string;

  /** Meta description */
  description?: string;

  /** Language from html lang attribute */
  lang?: string;
}

/**
 * DOM Node - in-memory only, not persisted
 * Represents a single HTML element in the DOM tree
 */
export interface DOMNode {
  /** Node type (element, text, comment) */
  nodeType: 'element' | 'text' | 'comment' | 'doctype';

  /** Tag name (for elements) */
  tagName?: string;

  /** Text content (for text/comment nodes) */
  textContent?: string;

  /** Attributes map */
  attributes: Map<string, string>;

  /** Child nodes */
  children: DOMNode[];

  /** Parent node (null for root) */
  parent: DOMNode | null;

  /** Start line in source */
  startLine: number;

  /** End line in source */
  endLine: number;

  /** Start column */
  startColumn: number;

  /** End column */
  endColumn: number;
}

/**
 * Result of parsing an HTML/Vue file
 */
export interface HTMLParseResult {
  /** Document info for Neo4j storage */
  document: DocumentInfo;

  /** Scopes extracted from <script> tags */
  scopes: import('../scope-extraction/types.js').ScopeInfo[];

  /** Relationships to create */
  relationships: DocumentRelationship[];

  /** DOM tree (in-memory, not persisted) */
  domTree: DOMNode;
}

/**
 * Relationship between Document and other entities
 */
export interface DocumentRelationship {
  /** Relationship type */
  type: 'DEFINES' | 'IMPORTS' | 'USES_COMPONENT' | 'CONTAINS_IMAGE' | 'REFERENCES_SCRIPT' | 'REFERENCES_STYLESHEET';

  /** Source entity UUID */
  from: string;

  /** Target entity UUID or identifier */
  to: string;

  /** Additional properties */
  properties?: Record<string, unknown>;
}

/**
 * Options for HTML parsing
 */
export interface HTMLParseOptions {
  /** Extract text from images using OCR */
  extractImageText?: boolean;

  /** OCR provider to use */
  ocrProvider?: 'gemini' | 'deepseek' | 'tesseract';

  /** Parse script content with TypeScript parser */
  parseScripts?: boolean;

  /** Include DOM tree in result (memory-intensive for large files) */
  includeDOMTree?: boolean;

  /** Project root for resolving relative paths */
  projectRoot?: string;
}

