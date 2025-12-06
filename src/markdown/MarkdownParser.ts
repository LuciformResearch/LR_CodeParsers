/**
 * Markdown Parser
 *
 * Regex-based parser for Markdown documents.
 * Extracts sections, links, images, code blocks, tables, etc.
 *
 * @since 2025-12-06
 */

import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type {
  MarkdownSection,
  MarkdownLink,
  MarkdownImage,
  MarkdownCodeBlock,
  MarkdownList,
  MarkdownListItem,
  MarkdownTable,
  MarkdownBlockquote,
  MarkdownFrontMatter,
  MarkdownDocumentInfo,
  MarkdownParseResult,
  MarkdownRelationship,
  MarkdownParseOptions,
  ParsedCodeScope,
} from './types.js';
import { TypeScriptLanguageParser } from '../typescript/index.js';
import { PythonLanguageParser } from '../python/index.js';
import { GenericCodeParser } from '../generic/index.js';

/**
 * Language aliases mapping to parser types
 */
const LANGUAGE_MAP: Record<string, 'typescript' | 'python' | 'generic'> = {
  // TypeScript/JavaScript family
  typescript: 'typescript',
  ts: 'typescript',
  javascript: 'typescript',
  js: 'typescript',
  tsx: 'typescript',
  jsx: 'typescript',
  mjs: 'typescript',
  cjs: 'typescript',
  // Python
  python: 'python',
  py: 'python',
  python3: 'python',
  // Everything else → generic
};

/**
 * Markdown Parser
 */
export class MarkdownParser {
  private initialized = false;
  private tsParser?: TypeScriptLanguageParser;
  private pyParser?: PythonLanguageParser;
  private genericParser?: GenericCodeParser;

  /**
   * Initialize the parser (lazy initialization of sub-parsers)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    console.log('✅ MarkdownParser initialized (regex-based, code block parsing on demand)');
  }

  /**
   * Ensure TypeScript parser is ready
   */
  private async ensureTsParser(): Promise<TypeScriptLanguageParser | null> {
    if (!this.tsParser) {
      try {
        this.tsParser = new TypeScriptLanguageParser();
        await this.tsParser.initialize();
      } catch (e) {
        console.warn('⚠️ Failed to initialize TypeScript parser for code blocks');
        return null;
      }
    }
    return this.tsParser;
  }

  /**
   * Ensure Python parser is ready
   */
  private async ensurePyParser(): Promise<PythonLanguageParser | null> {
    if (!this.pyParser) {
      try {
        this.pyParser = new PythonLanguageParser();
        await this.pyParser.initialize();
      } catch (e) {
        console.warn('⚠️ Failed to initialize Python parser for code blocks');
        return null;
      }
    }
    return this.pyParser;
  }

  /**
   * Ensure Generic parser is ready
   */
  private async ensureGenericParser(): Promise<GenericCodeParser | null> {
    if (!this.genericParser) {
      try {
        this.genericParser = new GenericCodeParser();
        await this.genericParser.initialize();
      } catch (e) {
        console.warn('⚠️ Failed to initialize Generic parser for code blocks');
        return null;
      }
    }
    return this.genericParser;
  }

  /**
   * Parse a Markdown file
   */
  async parseFile(
    filePath: string,
    content: string,
    options: MarkdownParseOptions = {}
  ): Promise<MarkdownParseResult> {
    const opts: Required<MarkdownParseOptions> = {
      extractSections: options.extractSections ?? true,
      extractLinks: options.extractLinks ?? true,
      extractCodeBlocks: options.extractCodeBlocks ?? true,
      extractTables: options.extractTables ?? true,
      extractLists: options.extractLists ?? true,
      parseFrontMatter: options.parseFrontMatter ?? true,
      parseCodeBlocks: options.parseCodeBlocks ?? false, // Off by default (expensive)
    };

    const lines = content.split('\n');
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
    const docUuid = uuidv4();

    // Parse front matter first
    let frontMatter: MarkdownFrontMatter | undefined;
    let contentStartLine = 0;
    if (opts.parseFrontMatter) {
      const fm = this.parseFrontMatter(lines);
      if (fm) {
        frontMatter = fm;
        contentStartLine = fm.endLine;
      }
    }

    // Extract components
    const sections = opts.extractSections ? this.extractSections(lines, contentStartLine) : [];
    const links = opts.extractLinks ? this.extractLinks(lines) : [];
    const images = opts.extractLinks ? this.extractImages(lines) : [];
    let codeBlocks = opts.extractCodeBlocks ? this.extractCodeBlocks(lines) : [];
    const lists = opts.extractLists ? this.extractLists(lines) : [];
    const tables = opts.extractTables ? this.extractTables(lines) : [];
    const blockquotes = this.extractBlockquotes(lines);

    // Parse code blocks if enabled
    if (opts.parseCodeBlocks && codeBlocks.length > 0) {
      codeBlocks = await this.parseCodeBlockContents(codeBlocks);
    }

    // Get title and description
    const title = this.extractTitle(frontMatter, sections, lines);
    const description = this.extractDescription(frontMatter, lines, contentStartLine);

    // Calculate word count and reading time
    const textContent = this.getTextContent(content);
    const wordCount = this.countWords(textContent);
    const readingTime = Math.ceil(wordCount / 200); // ~200 words per minute

    const document: MarkdownDocumentInfo = {
      uuid: docUuid,
      file: filePath,
      hash,
      linesOfCode: lines.length,
      title,
      description,
      frontMatter,
      sections,
      links,
      images,
      codeBlocks,
      lists,
      tables,
      blockquotes,
      wordCount,
      readingTime,
    };

    // Build relationships
    const relationships = this.buildRelationships(docUuid, links, images, codeBlocks);

    return { document, relationships };
  }

  /**
   * Parse YAML/TOML front matter
   */
  private parseFrontMatter(lines: string[]): MarkdownFrontMatter | undefined {
    if (lines.length === 0) return undefined;

    const firstLine = lines[0].trim();

    // YAML front matter (---)
    if (firstLine === '---') {
      const endIdx = lines.slice(1).findIndex(l => l.trim() === '---');
      if (endIdx === -1) return undefined;

      const raw = lines.slice(1, endIdx + 1).join('\n');
      const data = this.parseYamlSimple(raw);
      return {
        raw,
        data,
        format: 'yaml',
        endLine: endIdx + 2, // +1 for opening, +1 for closing
      };
    }

    // TOML front matter (+++)
    if (firstLine === '+++') {
      const endIdx = lines.slice(1).findIndex(l => l.trim() === '+++');
      if (endIdx === -1) return undefined;

      const raw = lines.slice(1, endIdx + 1).join('\n');
      const data = this.parseTomlSimple(raw);
      return {
        raw,
        data,
        format: 'toml',
        endLine: endIdx + 2,
      };
    }

    // JSON front matter ({)
    if (firstLine.startsWith('{')) {
      let braceCount = 0;
      let endIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        for (const char of lines[i]) {
          if (char === '{') braceCount++;
          if (char === '}') braceCount--;
        }
        if (braceCount === 0) {
          endIdx = i;
          break;
        }
      }
      if (endIdx === -1) return undefined;

      const raw = lines.slice(0, endIdx + 1).join('\n');
      try {
        const data = JSON.parse(raw);
        return {
          raw,
          data,
          format: 'json',
          endLine: endIdx + 1,
        };
      } catch {
        return undefined;
      }
    }

    return undefined;
  }

  /**
   * Simple YAML parser (key: value pairs)
   */
  private parseYamlSimple(yaml: string): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    const lines = yaml.split('\n');

    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.*)$/);
      if (match) {
        const [, key, value] = match;
        // Try to parse as JSON for arrays/objects, otherwise keep as string
        const trimmed = value.trim();
        if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
          try {
            data[key] = JSON.parse(trimmed);
          } catch {
            data[key] = trimmed;
          }
        } else if (trimmed === 'true') {
          data[key] = true;
        } else if (trimmed === 'false') {
          data[key] = false;
        } else if (!isNaN(Number(trimmed)) && trimmed !== '') {
          data[key] = Number(trimmed);
        } else {
          // Remove quotes
          data[key] = trimmed.replace(/^["']|["']$/g, '');
        }
      }
    }

    return data;
  }

  /**
   * Simple TOML parser
   */
  private parseTomlSimple(toml: string): Record<string, unknown> {
    const data: Record<string, unknown> = {};
    const lines = toml.split('\n');

    for (const line of lines) {
      const match = line.match(/^(\w+)\s*=\s*(.*)$/);
      if (match) {
        const [, key, value] = match;
        const trimmed = value.trim();
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
          data[key] = trimmed.slice(1, -1);
        } else if (trimmed === 'true') {
          data[key] = true;
        } else if (trimmed === 'false') {
          data[key] = false;
        } else if (!isNaN(Number(trimmed))) {
          data[key] = Number(trimmed);
        } else {
          data[key] = trimmed;
        }
      }
    }

    return data;
  }

  /**
   * Extract sections based on headings
   */
  private extractSections(lines: string[], startLine: number): MarkdownSection[] {
    const sections: MarkdownSection[] = [];
    const headingPattern = /^(#{1,6})\s+(.+)$/;

    // Find all headings
    const headings: Array<{ level: number; title: string; line: number }> = [];
    for (let i = startLine; i < lines.length; i++) {
      const match = lines[i].match(headingPattern);
      if (match) {
        headings.push({
          level: match[1].length,
          title: match[2].trim(),
          line: i,
        });
      }
    }

    // Also check for setext-style headings (underlines)
    for (let i = startLine; i < lines.length - 1; i++) {
      const nextLine = lines[i + 1];
      if (/^=+\s*$/.test(nextLine) && lines[i].trim()) {
        headings.push({ level: 1, title: lines[i].trim(), line: i });
      } else if (/^-+\s*$/.test(nextLine) && lines[i].trim() && !lines[i].startsWith('-')) {
        headings.push({ level: 2, title: lines[i].trim(), line: i });
      }
    }

    // Sort by line number
    headings.sort((a, b) => a.line - b.line);

    // Build sections
    const stack: Array<{ level: number; title: string }> = [];

    for (let i = 0; i < headings.length; i++) {
      const h = headings[i];
      const nextH = headings[i + 1];
      const endLine = nextH ? nextH.line - 1 : lines.length - 1;

      // Determine parent
      while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
        stack.pop();
      }
      const parent = stack.length > 0 ? stack[stack.length - 1] : undefined;

      // Get content
      const sectionLines = lines.slice(h.line, endLine + 1);
      const content = sectionLines.join('\n');

      // Get own content (until next heading of any level)
      let ownEndLine = endLine;
      for (let j = i + 1; j < headings.length; j++) {
        if (headings[j].line > h.line) {
          ownEndLine = headings[j].line - 1;
          break;
        }
      }
      const ownContent = lines.slice(h.line, ownEndLine + 1).join('\n');

      sections.push({
        uuid: uuidv4(),
        title: h.title,
        level: h.level,
        content,
        ownContent,
        startLine: h.line + 1, // 1-indexed
        endLine: endLine + 1,
        parentTitle: parent?.title,
        slug: this.generateSlug(h.title),
      });

      stack.push({ level: h.level, title: h.title });
    }

    return sections;
  }

  /**
   * Generate a URL slug from heading text
   */
  private generateSlug(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special chars
      .replace(/\s+/g, '-') // Spaces to hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-|-$/g, ''); // Trim hyphens
  }

  /**
   * Extract links (excludes images)
   */
  private extractLinks(lines: string[]): MarkdownLink[] {
    const links: MarkdownLink[] = [];
    // [text](url "title") or [text](url) - but NOT images (![...])
    const linkPattern = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;
    // Also reference-style: [text][ref] and [ref]: url
    const refDefPattern = /^\[([^\]]+)\]:\s*(\S+)(?:\s+"([^"]*)")?$/;

    const references: Record<string, { url: string; title?: string }> = {};

    // First pass: collect reference definitions
    for (const line of lines) {
      const refMatch = line.match(refDefPattern);
      if (refMatch) {
        references[refMatch[1].toLowerCase()] = {
          url: refMatch[2],
          title: refMatch[3],
        };
      }
    }

    // Second pass: extract links
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match;

      // Inline links - skip if preceded by ! (image)
      while ((match = linkPattern.exec(line)) !== null) {
        // Check if this is an image (preceded by !)
        const charBefore = match.index > 0 ? line[match.index - 1] : '';
        if (charBefore === '!') continue; // Skip images

        const url = match[2];
        links.push({
          text: match[1],
          url,
          title: match[3],
          isInternal: this.isInternalLink(url),
          isExternal: this.isExternalLink(url),
          line: i + 1,
        });
      }

      // Reference-style links [text][ref] - skip if preceded by !
      const refLinkPattern = /\[([^\]]+)\]\[([^\]]*)\]/g;
      while ((match = refLinkPattern.exec(line)) !== null) {
        const charBefore = match.index > 0 ? line[match.index - 1] : '';
        if (charBefore === '!') continue; // Skip images

        const refKey = (match[2] || match[1]).toLowerCase();
        const ref = references[refKey];
        if (ref) {
          links.push({
            text: match[1],
            url: ref.url,
            title: ref.title,
            isInternal: this.isInternalLink(ref.url),
            isExternal: this.isExternalLink(ref.url),
            line: i + 1,
          });
        }
      }
    }

    return links;
  }

  /**
   * Check if URL is internal
   */
  private isInternalLink(url: string): boolean {
    return url.startsWith('#') || url.startsWith('./') || url.startsWith('../') ||
           (!url.includes('://') && !url.startsWith('//'));
  }

  /**
   * Check if URL is external
   */
  private isExternalLink(url: string): boolean {
    return url.includes('://') || url.startsWith('//');
  }

  /**
   * Extract images
   */
  private extractImages(lines: string[]): MarkdownImage[] {
    const images: MarkdownImage[] = [];
    // ![alt](url "title") or ![alt](url)
    const imagePattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g;

    for (let i = 0; i < lines.length; i++) {
      let match;
      while ((match = imagePattern.exec(lines[i])) !== null) {
        images.push({
          alt: match[1],
          url: match[2],
          title: match[3],
          line: i + 1,
        });
      }
    }

    return images;
  }

  /**
   * Extract code blocks
   */
  private extractCodeBlocks(lines: string[]): MarkdownCodeBlock[] {
    const blocks: MarkdownCodeBlock[] = [];
    let inFencedBlock = false;
    let fenceChar = '';
    let startLine = 0;
    let language = '';
    let infoString = '';
    let codeLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for fenced code block start/end
      const fenceMatch = line.match(/^(`{3,}|~{3,})(.*)$/);
      if (fenceMatch) {
        if (!inFencedBlock) {
          // Start of fenced block
          inFencedBlock = true;
          fenceChar = fenceMatch[1][0];
          startLine = i;
          const info = fenceMatch[2].trim();
          // Language is first word, rest is info string
          const langMatch = info.match(/^(\S+)\s*(.*)?$/);
          language = langMatch?.[1] || '';
          infoString = langMatch?.[2] || '';
          codeLines = [];
        } else if (line.startsWith(fenceChar.repeat(3))) {
          // End of fenced block
          blocks.push({
            language: language || undefined,
            code: codeLines.join('\n'),
            isFenced: true,
            startLine: startLine + 1,
            endLine: i + 1,
            infoString: infoString || undefined,
          });
          inFencedBlock = false;
          fenceChar = '';
          language = '';
          infoString = '';
          codeLines = [];
        } else {
          codeLines.push(line);
        }
      } else if (inFencedBlock) {
        codeLines.push(line);
      }
    }

    // Also extract indented code blocks (4 spaces or 1 tab)
    let indentedStart = -1;
    let indentedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isIndented = /^(?:    |\t)/.test(line);
      const isBlank = line.trim() === '';

      if (isIndented) {
        if (indentedStart === -1) {
          // Check previous line isn't part of a list or something
          if (i === 0 || lines[i - 1].trim() === '') {
            indentedStart = i;
          }
        }
        if (indentedStart !== -1) {
          indentedLines.push(line.replace(/^(?:    |\t)/, ''));
        }
      } else if (isBlank && indentedStart !== -1) {
        // Blank line might be part of indented block
        indentedLines.push('');
      } else if (indentedStart !== -1) {
        // End of indented block
        // Trim trailing blank lines
        while (indentedLines.length > 0 && indentedLines[indentedLines.length - 1] === '') {
          indentedLines.pop();
        }
        if (indentedLines.length > 0) {
          blocks.push({
            code: indentedLines.join('\n'),
            isFenced: false,
            startLine: indentedStart + 1,
            endLine: i,
          });
        }
        indentedStart = -1;
        indentedLines = [];
      }
    }

    return blocks;
  }

  /**
   * Extract tables
   */
  private extractTables(lines: string[]): MarkdownTable[] {
    const tables: MarkdownTable[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Check if this looks like a table header (has pipes)
      if (line.includes('|') && i + 1 < lines.length) {
        const separatorLine = lines[i + 1];

        // Check if next line is separator (|---|---|)
        if (/^\|?\s*:?-+:?\s*\|/.test(separatorLine) || /\|\s*:?-+:?\s*\|?$/.test(separatorLine)) {
          const headers = this.parseTableRow(line);
          const alignments = this.parseAlignments(separatorLine);

          const rows: string[][] = [];
          let endLine = i + 1;

          // Collect rows
          for (let j = i + 2; j < lines.length; j++) {
            if (lines[j].includes('|')) {
              rows.push(this.parseTableRow(lines[j]));
              endLine = j;
            } else {
              break;
            }
          }

          tables.push({
            headers,
            rows,
            alignments,
            startLine: i + 1,
            endLine: endLine + 1,
          });

          i = endLine + 1;
          continue;
        }
      }

      i++;
    }

    return tables;
  }

  /**
   * Parse a table row
   */
  private parseTableRow(line: string): string[] {
    // Remove leading/trailing pipes and split
    return line
      .replace(/^\||\|$/g, '')
      .split('|')
      .map(cell => cell.trim());
  }

  /**
   * Parse table alignments
   */
  private parseAlignments(line: string): ('left' | 'center' | 'right' | null)[] {
    return line
      .replace(/^\||\|$/g, '')
      .split('|')
      .map(cell => {
        const trimmed = cell.trim();
        const left = trimmed.startsWith(':');
        const right = trimmed.endsWith(':');
        if (left && right) return 'center';
        if (right) return 'right';
        if (left) return 'left';
        return null;
      });
  }

  /**
   * Extract blockquotes
   */
  private extractBlockquotes(lines: string[]): MarkdownBlockquote[] {
    const quotes: MarkdownBlockquote[] = [];
    let inQuote = false;
    let startLine = 0;
    let quoteLines: string[] = [];
    let maxLevel = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const quoteMatch = line.match(/^(>+)\s?(.*)$/);

      if (quoteMatch) {
        if (!inQuote) {
          inQuote = true;
          startLine = i;
          quoteLines = [];
          maxLevel = 0;
        }
        const level = quoteMatch[1].length;
        maxLevel = Math.max(maxLevel, level);
        quoteLines.push(quoteMatch[2]);
      } else if (inQuote) {
        // End of blockquote
        quotes.push({
          content: quoteLines.join('\n'),
          level: maxLevel,
          startLine: startLine + 1,
          endLine: i,
        });
        inQuote = false;
        quoteLines = [];
        maxLevel = 0;
      }
    }

    // Handle blockquote at end of file
    if (inQuote && quoteLines.length > 0) {
      quotes.push({
        content: quoteLines.join('\n'),
        level: maxLevel,
        startLine: startLine + 1,
        endLine: lines.length,
      });
    }

    return quotes;
  }

  /**
   * Extract lists (ordered, unordered, task lists)
   */
  private extractLists(lines: string[]): MarkdownList[] {
    const lists: MarkdownList[] = [];
    let currentList: MarkdownList | null = null;
    let currentItems: MarkdownListItem[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Unordered list: - or * or +
      const unorderedMatch = line.match(/^(\s*)([-*+])\s+(.*)$/);
      // Ordered list: 1. or 1)
      const orderedMatch = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
      // Task list: - [ ] or - [x]
      const taskMatch = line.match(/^(\s*)([-*+])\s+\[([ xX])\]\s+(.*)$/);

      if (taskMatch) {
        const indent = taskMatch[1].length;
        const level = Math.floor(indent / 2);
        const checked = taskMatch[3].toLowerCase() === 'x';
        const text = taskMatch[4];

        if (!currentList || currentList.type !== 'task') {
          // Start new task list
          if (currentList && currentItems.length > 0) {
            currentList.items = currentItems;
            currentList.endLine = i;
            lists.push(currentList);
          }
          currentList = {
            type: 'task',
            items: [],
            startLine: i + 1,
            endLine: i + 1,
          };
          currentItems = [];
        }

        currentItems.push({ text, checked, level, line: i + 1 });
      } else if (unorderedMatch) {
        const indent = unorderedMatch[1].length;
        const level = Math.floor(indent / 2);
        const text = unorderedMatch[3];

        if (!currentList || currentList.type !== 'unordered') {
          if (currentList && currentItems.length > 0) {
            currentList.items = currentItems;
            currentList.endLine = i;
            lists.push(currentList);
          }
          currentList = {
            type: 'unordered',
            items: [],
            startLine: i + 1,
            endLine: i + 1,
          };
          currentItems = [];
        }

        currentItems.push({ text, level, line: i + 1 });
      } else if (orderedMatch) {
        const indent = orderedMatch[1].length;
        const level = Math.floor(indent / 2);
        const text = orderedMatch[3];

        if (!currentList || currentList.type !== 'ordered') {
          if (currentList && currentItems.length > 0) {
            currentList.items = currentItems;
            currentList.endLine = i;
            lists.push(currentList);
          }
          currentList = {
            type: 'ordered',
            items: [],
            startLine: i + 1,
            endLine: i + 1,
          };
          currentItems = [];
        }

        currentItems.push({ text, level, line: i + 1 });
      } else if (line.trim() === '' && currentList) {
        // Blank line might end list or be part of multi-paragraph item
        // For simplicity, end the list
        currentList.items = currentItems;
        currentList.endLine = i;
        lists.push(currentList);
        currentList = null;
        currentItems = [];
      } else if (currentList && /^\s{2,}/.test(line)) {
        // Continuation of previous item (indented)
        if (currentItems.length > 0) {
          currentItems[currentItems.length - 1].text += '\n' + line.trim();
        }
      } else if (currentList) {
        // Non-list content, end current list
        currentList.items = currentItems;
        currentList.endLine = i;
        lists.push(currentList);
        currentList = null;
        currentItems = [];
      }
    }

    // Handle list at end of file
    if (currentList && currentItems.length > 0) {
      currentList.items = currentItems;
      currentList.endLine = lines.length;
      lists.push(currentList);
    }

    return lists;
  }

  /**
   * Parse code block contents with appropriate parsers
   */
  private async parseCodeBlockContents(blocks: MarkdownCodeBlock[]): Promise<MarkdownCodeBlock[]> {
    const result: MarkdownCodeBlock[] = [];

    for (const block of blocks) {
      const parsedScopes = await this.parseCodeContent(block.language, block.code);
      result.push({
        ...block,
        parsedScopes: parsedScopes.length > 0 ? parsedScopes : undefined,
      });
    }

    return result;
  }

  /**
   * Parse code content with the appropriate parser
   */
  private async parseCodeContent(
    language: string | undefined,
    code: string
  ): Promise<ParsedCodeScope[]> {
    if (!code.trim()) return [];

    const lang = language?.toLowerCase() || '';
    const parserType = LANGUAGE_MAP[lang] || 'generic';

    try {
      if (parserType === 'typescript') {
        const parser = await this.ensureTsParser();
        if (parser) {
          const result = await parser.parseFile('inline.ts', code);
          return result.scopes.map(s => ({
            name: s.name,
            type: s.type,
            parameters: s.signature, // Use signature as parameters string
            line: s.startLine,
            source: s.source,
          }));
        }
      }

      if (parserType === 'python') {
        const parser = await this.ensurePyParser();
        if (parser) {
          const result = await parser.parseFile('inline.py', code);
          return result.scopes.map(s => ({
            name: s.name,
            type: s.type,
            parameters: s.signature,
            line: s.startLine,
            source: s.source,
          }));
        }
      }

      // Generic parser for unknown languages
      const genericParser = await this.ensureGenericParser();
      if (genericParser) {
        const result = await genericParser.parseFile('inline.txt', code);
        return result.scopes
          .filter(s => s.type !== 'chunk') // Only real scopes, not chunks
          .map(s => ({
            name: s.name,
            type: s.type,
            parameters: s.parameters,
            line: s.startLine,
            source: s.source,
          }));
      }
    } catch {
      // Parsing failed, return empty
    }

    return [];
  }

  /**
   * Extract document title
   */
  private extractTitle(
    frontMatter: MarkdownFrontMatter | undefined,
    sections: MarkdownSection[],
    lines: string[]
  ): string | undefined {
    // Check front matter first
    if (frontMatter?.data.title) {
      return String(frontMatter.data.title);
    }

    // Look for first h1
    const h1 = sections.find(s => s.level === 1);
    if (h1) {
      return h1.title;
    }

    // Check first non-empty line that could be a title
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('---') && !trimmed.startsWith('+++')) {
        const headingMatch = trimmed.match(/^#\s+(.+)$/);
        if (headingMatch) {
          return headingMatch[1];
        }
      }
    }

    return undefined;
  }

  /**
   * Extract document description
   */
  private extractDescription(
    frontMatter: MarkdownFrontMatter | undefined,
    lines: string[],
    startLine: number
  ): string | undefined {
    // Check front matter
    if (frontMatter?.data.description) {
      return String(frontMatter.data.description);
    }

    // Look for first paragraph after any heading
    let foundHeading = false;
    let paragraphLines: string[] = [];

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('#')) {
        foundHeading = true;
        continue;
      }

      if (foundHeading && line) {
        // Start collecting paragraph
        paragraphLines.push(line);
        // Keep collecting until blank line
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j].trim();
          if (!nextLine) break;
          if (nextLine.startsWith('#')) break;
          paragraphLines.push(nextLine);
        }
        break;
      }
    }

    if (paragraphLines.length > 0) {
      const desc = paragraphLines.join(' ');
      // Truncate to ~160 chars
      return desc.length > 160 ? desc.slice(0, 157) + '...' : desc;
    }

    return undefined;
  }

  /**
   * Get plain text content (strips markdown)
   */
  private getTextContent(content: string): string {
    return content
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`]+`/g, '')
      // Remove images
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      // Remove links but keep text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove headings markers
      .replace(/^#{1,6}\s+/gm, '')
      // Remove emphasis
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      // Remove strikethrough
      .replace(/~~([^~]+)~~/g, '$1')
      // Remove blockquote markers
      .replace(/^>\s*/gm, '')
      // Remove list markers
      .replace(/^[\s]*[-*+]\s+/gm, '')
      .replace(/^[\s]*\d+\.\s+/gm, '')
      // Remove horizontal rules
      .replace(/^[-*_]{3,}$/gm, '')
      // Remove HTML tags
      .replace(/<[^>]+>/g, '');
  }

  /**
   * Count words in text
   */
  private countWords(text: string): number {
    return text
      .split(/\s+/)
      .filter(word => word.length > 0)
      .length;
  }

  /**
   * Build relationships from extracted elements
   */
  private buildRelationships(
    docUuid: string,
    links: MarkdownLink[],
    images: MarkdownImage[],
    codeBlocks: MarkdownCodeBlock[]
  ): MarkdownRelationship[] {
    const relationships: MarkdownRelationship[] = [];

    // Links
    for (const link of links) {
      relationships.push({
        type: 'LINKS_TO',
        from: docUuid,
        to: link.url,
        properties: {
          text: link.text,
          isExternal: link.isExternal,
          line: link.line,
        },
      });
    }

    // Images
    for (const image of images) {
      relationships.push({
        type: 'EMBEDS_IMAGE',
        from: docUuid,
        to: image.url,
        properties: {
          alt: image.alt,
          line: image.line,
        },
      });
    }

    // Code blocks
    for (const block of codeBlocks) {
      if (block.language) {
        relationships.push({
          type: 'CONTAINS_CODE',
          from: docUuid,
          to: block.language,
          properties: {
            startLine: block.startLine,
            endLine: block.endLine,
          },
        });
      }
    }

    return relationships;
  }
}
