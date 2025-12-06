/**
 * Types for Markdown Parser
 *
 * Extracts structure from Markdown documents:
 * - Sections (by headings)
 * - Links and images
 * - Code blocks
 * - Lists, tables, etc.
 *
 * @since 2025-12-06
 */

/**
 * Markdown section (heading-based scope)
 */
export interface MarkdownSection {
  /** Unique identifier */
  uuid: string;

  /** Section title (heading text) */
  title: string;

  /** Heading level (1-6) */
  level: number;

  /** Full content including subsections */
  content: string;

  /** Content without subsections */
  ownContent: string;

  /** Start line */
  startLine: number;

  /** End line */
  endLine: number;

  /** Parent section title */
  parentTitle?: string;

  /** Anchor slug for linking */
  slug: string;
}

/**
 * Markdown link
 */
export interface MarkdownLink {
  /** Link text */
  text: string;

  /** Link URL */
  url: string;

  /** Link title (optional) */
  title?: string;

  /** Is internal link (starts with # or relative path) */
  isInternal: boolean;

  /** Is external link */
  isExternal: boolean;

  /** Line number */
  line: number;
}

/**
 * Markdown image
 */
export interface MarkdownImage {
  /** Alt text */
  alt: string;

  /** Image URL */
  url: string;

  /** Title (optional) */
  title?: string;

  /** Line number */
  line: number;
}

/**
 * Markdown code block
 */
export interface MarkdownCodeBlock {
  /** Language identifier */
  language?: string;

  /** Code content */
  code: string;

  /** Is fenced (```) or indented */
  isFenced: boolean;

  /** Start line */
  startLine: number;

  /** End line */
  endLine: number;

  /** Info string (everything after language on fence line) */
  infoString?: string;

  /** Parsed scopes from the code (if parseCodeBlocks enabled) */
  parsedScopes?: ParsedCodeScope[];
}

/**
 * Parsed scope from code block content
 */
export interface ParsedCodeScope {
  /** Scope name */
  name: string;

  /** Scope type (function, class, method, etc.) */
  type: string;

  /** Parameters if applicable */
  parameters?: string;

  /** Line within the code block (1-indexed) */
  line: number;

  /** Source code */
  source: string;
}

/**
 * Markdown list
 */
export interface MarkdownList {
  /** List type */
  type: 'ordered' | 'unordered' | 'task';

  /** List items */
  items: MarkdownListItem[];

  /** Start line */
  startLine: number;

  /** End line */
  endLine: number;
}

/**
 * Markdown list item
 */
export interface MarkdownListItem {
  /** Item text */
  text: string;

  /** Is checked (for task lists) */
  checked?: boolean;

  /** Nesting level */
  level: number;

  /** Line number */
  line: number;
}

/**
 * Markdown table
 */
export interface MarkdownTable {
  /** Table headers */
  headers: string[];

  /** Table rows */
  rows: string[][];

  /** Column alignments */
  alignments: ('left' | 'center' | 'right' | null)[];

  /** Start line */
  startLine: number;

  /** End line */
  endLine: number;
}

/**
 * Markdown blockquote
 */
export interface MarkdownBlockquote {
  /** Quote content */
  content: string;

  /** Nesting level */
  level: number;

  /** Start line */
  startLine: number;

  /** End line */
  endLine: number;
}

/**
 * Front matter (YAML/TOML at start of document)
 */
export interface MarkdownFrontMatter {
  /** Raw content */
  raw: string;

  /** Parsed key-value pairs */
  data: Record<string, unknown>;

  /** Format */
  format: 'yaml' | 'toml' | 'json';

  /** End line */
  endLine: number;
}

/**
 * Markdown document info
 */
export interface MarkdownDocumentInfo {
  /** Unique identifier */
  uuid: string;

  /** File path */
  file: string;

  /** Content hash */
  hash: string;

  /** Total lines */
  linesOfCode: number;

  /** Document title (from h1 or front matter) */
  title?: string;

  /** Document description (from front matter or first paragraph) */
  description?: string;

  /** Front matter if present */
  frontMatter?: MarkdownFrontMatter;

  /** All sections */
  sections: MarkdownSection[];

  /** All links */
  links: MarkdownLink[];

  /** All images */
  images: MarkdownImage[];

  /** All code blocks */
  codeBlocks: MarkdownCodeBlock[];

  /** All lists */
  lists: MarkdownList[];

  /** All tables */
  tables: MarkdownTable[];

  /** All blockquotes */
  blockquotes: MarkdownBlockquote[];

  /** Word count */
  wordCount: number;

  /** Reading time in minutes */
  readingTime: number;
}

/**
 * Parse result
 */
export interface MarkdownParseResult {
  /** Document info */
  document: MarkdownDocumentInfo;

  /** Relationships */
  relationships: MarkdownRelationship[];
}

/**
 * Markdown relationship
 */
export interface MarkdownRelationship {
  /** Relationship type */
  type: 'LINKS_TO' | 'EMBEDS_IMAGE' | 'CONTAINS_CODE' | 'REFERENCES';

  /** Source UUID */
  from: string;

  /** Target URL or identifier */
  to: string;

  /** Additional properties */
  properties?: Record<string, unknown>;
}

/**
 * Parse options
 */
export interface MarkdownParseOptions {
  /** Extract sections */
  extractSections?: boolean;

  /** Extract links */
  extractLinks?: boolean;

  /** Extract code blocks */
  extractCodeBlocks?: boolean;

  /** Extract tables */
  extractTables?: boolean;

  /** Extract lists */
  extractLists?: boolean;

  /** Parse front matter */
  parseFrontMatter?: boolean;

  /** Parse code blocks with appropriate language parsers */
  parseCodeBlocks?: boolean;
}
