/**
 * GenericCodeParser
 *
 * Heuristic-based parser for any code file.
 * Uses pattern matching and brace tracking to extract scopes.
 *
 * Strategy:
 * 1. Detect language hints from content/extension
 * 2. Find patterns: `[modifiers] keyword name(params) [block-start]`
 * 3. Track brace/indent nesting to find block boundaries
 * 4. Fall back to chunk-based extraction for unrecognized patterns
 *
 * @since 2025-12-06
 */

import { createHash } from 'crypto';
import path from 'path';
import type {
  GenericScope,
  GenericImport,
  GenericFileAnalysis,
  GenericParseOptions,
  LanguageHints,
} from './types.js';

/**
 * Known keywords that typically precede function definitions
 */
const KNOWN_FUNCTION_KEYWORDS = new Set([
  'function', 'func', 'fn', 'def', 'sub', 'proc', 'procedure',
  'method', 'fun', 'lambda', 'defun', 'defn', 'define',
]);

/**
 * Known keywords that typically precede class definitions
 */
const KNOWN_CLASS_KEYWORDS = new Set([
  'class', 'struct', 'interface', 'trait', 'enum', 'type',
  'record', 'object', 'module', 'namespace', 'package',
]);

/**
 * Known modifiers that can appear before definitions
 */
const KNOWN_MODIFIERS = new Set([
  'public', 'private', 'protected', 'internal',
  'static', 'const', 'final', 'abstract', 'virtual', 'override',
  'async', 'await', 'export', 'default', 'extern', 'inline',
  'pub', 'priv', 'mut', 'ref', 'readonly', 'sealed',
]);

/**
 * Import-like keywords
 */
const IMPORT_KEYWORDS = new Set([
  'import', 'require', 'use', 'include', 'from', 'load',
  'using', 'open', 'with', 'extern',
]);

/**
 * GenericCodeParser - Parses any code file using heuristics
 */
export class GenericCodeParser {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    console.log('✅ GenericCodeParser initialized');
  }

  /**
   * Parse a code file
   */
  async parseFile(
    filePath: string,
    content: string,
    options: GenericParseOptions = {}
  ): Promise<GenericFileAnalysis> {
    if (!this.initialized) {
      await this.initialize();
    }

    console.log(`⏳ Parsing ${filePath}...`);
    const lines = content.split('\n');
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
    const ext = path.extname(filePath).toLowerCase();

    // Detect language hints
    const hints = this.detectLanguageHints(content, ext, options);

    // Detect brace/comment style
    const braceStyle = this.detectBraceStyle(content);
    const commentStyle = this.detectCommentStyle(content);

    // Extract imports first
    const imports = this.extractImports(lines);

    // Extract scopes using pattern matching + brace tracking
    const scopes = this.extractScopes(content, lines, hints, options);

    console.log(`📊 Parsed ${filePath}: ${scopes.length} scopes, ${imports.length} imports`);
    return {
      file: filePath,
      hash,
      linesOfCode: lines.length,
      languageHint: hints.language,
      scopes,
      imports,
      braceStyle,
      commentStyle,
    };
  }

  /**
   * Detect language hints from content and extension
   */
  private detectLanguageHints(
    content: string,
    ext: string,
    options: GenericParseOptions
  ): LanguageHints {
    // Start with user-provided keywords or defaults
    let functionKeywords = options.functionKeywords || [...KNOWN_FUNCTION_KEYWORDS];
    let classKeywords = options.classKeywords || [...KNOWN_CLASS_KEYWORDS];
    let moduleKeywords = ['module', 'namespace', 'package'];
    let indentBased = false;
    let commentPrefixes = ['//'];
    let language: string | undefined;

    // Extension-based hints
    const extHints: Record<string, Partial<LanguageHints>> = {
      '.py': { language: 'python', indentBased: true, commentPrefixes: ['#'], functionKeywords: ['def', 'async def', 'lambda'], classKeywords: ['class'] },
      '.rb': { language: 'ruby', commentPrefixes: ['#'], functionKeywords: ['def', 'define_method'], classKeywords: ['class', 'module'] },
      '.lua': { language: 'lua', commentPrefixes: ['--'], functionKeywords: ['function', 'local function'] },
      '.pl': { language: 'perl', commentPrefixes: ['#'], functionKeywords: ['sub'] },
      '.php': { language: 'php', functionKeywords: ['function'], classKeywords: ['class', 'interface', 'trait'] },
      '.r': { language: 'r', commentPrefixes: ['#'], functionKeywords: ['function'] },
      '.jl': { language: 'julia', commentPrefixes: ['#'], functionKeywords: ['function', 'macro'], classKeywords: ['struct', 'abstract type', 'mutable struct'] },
      '.scala': { language: 'scala', functionKeywords: ['def'], classKeywords: ['class', 'object', 'trait', 'case class'] },
      '.kt': { language: 'kotlin', functionKeywords: ['fun'], classKeywords: ['class', 'object', 'interface', 'data class'] },
      '.swift': { language: 'swift', functionKeywords: ['func'], classKeywords: ['class', 'struct', 'protocol', 'enum'] },
      '.go': { language: 'go', functionKeywords: ['func'], classKeywords: ['type', 'struct', 'interface'] },
      '.rs': { language: 'rust', functionKeywords: ['fn', 'pub fn', 'async fn'], classKeywords: ['struct', 'enum', 'trait', 'impl'] },
      '.ex': { language: 'elixir', commentPrefixes: ['#'], functionKeywords: ['def', 'defp', 'defmacro'], classKeywords: ['defmodule'] },
      '.erl': { language: 'erlang', commentPrefixes: ['%'], functionKeywords: ['-spec', '-export'] },
      '.hs': { language: 'haskell', commentPrefixes: ['--'], functionKeywords: [], classKeywords: ['data', 'class', 'instance', 'type'] },
      '.clj': { language: 'clojure', commentPrefixes: [';'], functionKeywords: ['defn', 'defn-', 'fn'], classKeywords: ['defrecord', 'deftype'] },
      '.lisp': { language: 'lisp', commentPrefixes: [';'], functionKeywords: ['defun', 'defmacro', 'lambda'] },
      '.ml': { language: 'ocaml', commentPrefixes: ['(*'], functionKeywords: ['let', 'let rec'], classKeywords: ['type', 'module'] },
      '.fs': { language: 'fsharp', commentPrefixes: ['//'], functionKeywords: ['let', 'let rec', 'member'], classKeywords: ['type', 'module'] },
      '.nim': { language: 'nim', commentPrefixes: ['#'], functionKeywords: ['proc', 'func', 'method', 'template', 'macro'], classKeywords: ['type', 'object'] },
      '.zig': { language: 'zig', functionKeywords: ['fn', 'pub fn'], classKeywords: ['struct', 'enum', 'union'] },
      '.v': { language: 'vlang', functionKeywords: ['fn', 'pub fn'], classKeywords: ['struct', 'interface'] },
      '.d': { language: 'd', functionKeywords: ['void', 'auto'], classKeywords: ['class', 'struct', 'interface'] },
      '.cr': { language: 'crystal', commentPrefixes: ['#'], functionKeywords: ['def'], classKeywords: ['class', 'struct', 'module'] },
      '.groovy': { language: 'groovy', functionKeywords: ['def'], classKeywords: ['class', 'interface', 'trait'] },
      '.coffee': { language: 'coffeescript', commentPrefixes: ['#'], indentBased: true, functionKeywords: [], classKeywords: ['class'] },
    };

    if (extHints[ext]) {
      const hint = extHints[ext];
      language = hint.language;
      if (hint.functionKeywords) functionKeywords = hint.functionKeywords;
      if (hint.classKeywords) classKeywords = hint.classKeywords;
      if (hint.moduleKeywords) moduleKeywords = hint.moduleKeywords!;
      if (hint.indentBased !== undefined) indentBased = hint.indentBased;
      if (hint.commentPrefixes) commentPrefixes = hint.commentPrefixes;
    }

    // Content-based detection (if no extension match)
    if (!language && options.detectLanguage !== false) {
      // Shebang detection
      const shebang = content.match(/^#!.*\/(python|ruby|perl|node|php|bash|sh|lua)/m);
      if (shebang) {
        language = shebang[1];
      }

      // Pattern detection
      if (content.includes('def ') && content.includes(':') && !content.includes('{')) {
        language = 'python';
        indentBased = true;
      } else if (content.includes('fn ') && content.includes('->') && content.includes('let ')) {
        language = 'rust';
      } else if (content.includes('func ') && content.includes('package ')) {
        language = 'go';
      }
    }

    return {
      language,
      functionKeywords,
      classKeywords,
      moduleKeywords,
      indentBased,
      commentPrefixes,
    };
  }

  /**
   * Extract scopes from content
   */
  private extractScopes(
    content: string,
    lines: string[],
    hints: LanguageHints,
    options: GenericParseOptions
  ): GenericScope[] {
    const scopes: GenericScope[] = [];
    const minChunkLines = options.minChunkLines ?? 3;
    const maxChunkLines = options.maxChunkLines ?? 100;

    // Strategy: Find all potential scope starts, then determine their boundaries
    const scopeStarts = this.findScopeStarts(lines, hints);

    if (scopeStarts.length === 0) {
      // No patterns found, fall back to chunk-based extraction
      return this.extractChunks(content, lines, minChunkLines, maxChunkLines);
    }

    // Track last processed line to find gaps
    let lastEnd = 0;

    // For each scope start, find its end
    for (let i = 0; i < scopeStarts.length; i++) {
      const start = scopeStarts[i];
      const nextStart = scopeStarts[i + 1];

      // Check for gap before this scope - create chunk
      if (start.line > lastEnd + 1) {
        const gapStart = lastEnd + 1;
        const gapEnd = start.line - 1;
        const gapLines = lines.slice(gapStart - 1, gapEnd);
        const gapContent = gapLines.join('\n').trim();

        if (gapContent && gapEnd - gapStart + 1 >= minChunkLines) {
          scopes.push({
            uuid: this.generateUUID(),
            name: this.extractChunkName(gapLines[0]) || `chunk_before_${start.name}`,
            type: 'chunk',
            modifiers: [],
            source: gapContent,
            startLine: gapStart,
            endLine: gapEnd,
            depth: 0,
            confidence: 0.3,
          });
        }
      }

      let endLine: number;
      if (hints.indentBased) {
        // For Python-like: find where indentation returns to start level
        endLine = this.findIndentBasedEnd(lines, start.line, start.indent);
      } else {
        // For brace-based: find matching closing brace
        endLine = this.findBraceBasedEnd(lines, start.line);
      }

      // If we couldn't find the end, use next scope start or end of file
      if (endLine === -1) {
        endLine = nextStart ? nextStart.line - 1 : lines.length;
      }

      // Don't overlap with next scope
      if (nextStart && endLine >= nextStart.line) {
        endLine = nextStart.line - 1;
      }

      const source = lines.slice(start.line - 1, endLine).join('\n');

      scopes.push({
        uuid: this.generateUUID(),
        name: start.name,
        type: start.type,
        keyword: start.keyword,
        modifiers: start.modifiers,
        parameters: start.parameters,
        source,
        startLine: start.line,
        endLine,
        depth: 0, // TODO: track nesting
        confidence: start.confidence,
      });

      lastEnd = endLine;
    }

    // Check for trailing content after last scope
    if (lastEnd < lines.length) {
      const gapStart = lastEnd + 1;
      const gapEnd = lines.length;
      const gapLines = lines.slice(gapStart - 1, gapEnd);
      const gapContent = gapLines.join('\n').trim();

      if (gapContent && gapEnd - gapStart + 1 >= minChunkLines) {
        scopes.push({
          uuid: this.generateUUID(),
          name: this.extractChunkName(gapLines[0]) || 'trailing_chunk',
          type: 'chunk',
          modifiers: [],
          source: gapContent,
          startLine: gapStart,
          endLine: gapEnd,
          depth: 0,
          confidence: 0.3,
        });
      }
    }

    return scopes;
  }

  /**
   * Find potential scope starts (functions, classes, etc.)
   */
  private findScopeStarts(
    lines: string[],
    hints: LanguageHints
  ): Array<{
    line: number;
    name: string;
    type: GenericScope['type'];
    keyword?: string;
    modifiers: string[];
    parameters?: string;
    indent: number;
    confidence: number;
  }> {
    const starts: Array<{
      line: number;
      name: string;
      type: GenericScope['type'];
      keyword?: string;
      modifiers: string[];
      parameters?: string;
      indent: number;
      confidence: number;
    }> = [];

    // Pattern: [modifiers...] [keyword] name ( params ) [: or { or =>]
    // We look for: identifier followed by (
    const definitionPattern = /^(\s*)(.+?)\s+(\w+)\s*\(([^)]*)\)\s*[:{=>\-{]?/;

    // Simpler pattern: keyword name (params)
    const simplePattern = /^(\s*)(\w+)\s+(\w+)\s*\(([^)]*)\)/;

    // Class-like pattern: keyword Name [extends/implements/end or newline]
    const classPattern = /^(\s*)(\w+)\s+([A-Z]\w*)\s*(?:extends|implements|<|:|\{|\n|$)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || hints.commentPrefixes.some(p => trimmed.startsWith(p))) {
        continue;
      }

      // Try class pattern first
      const classMatch = line.match(classPattern);
      if (classMatch) {
        const [, indent, keyword, name] = classMatch;
        if (KNOWN_CLASS_KEYWORDS.has(keyword) || hints.classKeywords.includes(keyword)) {
          starts.push({
            line: i + 1,
            name,
            type: 'class',
            keyword,
            modifiers: this.extractModifiers(trimmed, keyword),
            indent: indent.length,
            confidence: 0.9,
          });
          continue;
        }
      }

      // Try definition pattern
      const defMatch = line.match(definitionPattern);
      if (defMatch) {
        const [, indent, prefix, name, params] = defMatch;
        const words = prefix.trim().split(/\s+/);

        // Find the keyword (last word before name that's a known keyword)
        let keyword: string | undefined;
        const modifiers: string[] = [];

        for (const word of words) {
          if (KNOWN_FUNCTION_KEYWORDS.has(word) || hints.functionKeywords.includes(word)) {
            keyword = word;
          } else if (KNOWN_CLASS_KEYWORDS.has(word) || hints.classKeywords.includes(word)) {
            keyword = word;
          } else if (KNOWN_MODIFIERS.has(word)) {
            modifiers.push(word);
          }
        }

        // If we found a known keyword, high confidence
        // If not but pattern looks like a definition, lower confidence
        if (keyword) {
          const type = KNOWN_CLASS_KEYWORDS.has(keyword) || hints.classKeywords.includes(keyword)
            ? 'class'
            : 'function';

          starts.push({
            line: i + 1,
            name,
            type,
            keyword,
            modifiers,
            parameters: params,
            indent: indent.length,
            confidence: 0.9,
          });
        } else if (words.length > 0 && /^[a-z]/.test(words[words.length - 1])) {
          // Possible unknown keyword - still extract with lower confidence
          // e.g., "my_decorator some_func(x)"
          starts.push({
            line: i + 1,
            name,
            type: 'function',
            keyword: words[words.length - 1],
            modifiers,
            parameters: params,
            indent: indent.length,
            confidence: 0.5,
          });
        }
        continue;
      }

      // Try simple pattern
      const simpleMatch = line.match(simplePattern);
      if (simpleMatch) {
        const [, indent, keyword, name, params] = simpleMatch;

        if (KNOWN_FUNCTION_KEYWORDS.has(keyword) || hints.functionKeywords.includes(keyword)) {
          starts.push({
            line: i + 1,
            name,
            type: 'function',
            keyword,
            modifiers: [],
            parameters: params,
            indent: indent.length,
            confidence: 0.85,
          });
        } else if (KNOWN_CLASS_KEYWORDS.has(keyword) || hints.classKeywords.includes(keyword)) {
          starts.push({
            line: i + 1,
            name,
            type: 'class',
            keyword,
            modifiers: [],
            indent: indent.length,
            confidence: 0.85,
          });
        }
      }
    }

    return starts;
  }

  /**
   * Extract modifiers from a line
   */
  private extractModifiers(line: string, stopAt: string): string[] {
    const modifiers: string[] = [];
    const words = line.split(/\s+/);

    for (const word of words) {
      if (word === stopAt) break;
      if (KNOWN_MODIFIERS.has(word)) {
        modifiers.push(word);
      }
    }

    return modifiers;
  }

  /**
   * Find end of scope for indent-based languages (Python, etc.)
   */
  private findIndentBasedEnd(lines: string[], startLine: number, startIndent: number): number {
    // Find the first line of the body (should be more indented)
    let bodyIndent = -1;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed) continue; // Skip empty lines

      const indent = line.length - line.trimStart().length;

      if (bodyIndent === -1) {
        if (indent > startIndent) {
          bodyIndent = indent;
        }
      } else {
        // Found body, now look for dedent
        if (indent <= startIndent && trimmed) {
          return i; // This line starts a new block at same or lower level
        }
      }
    }

    return lines.length; // End of file
  }

  /**
   * Find end of scope for brace-based languages
   */
  private findBraceBasedEnd(lines: string[], startLine: number): number {
    let braceCount = 0;
    let foundOpen = false;

    for (let i = startLine - 1; i < lines.length; i++) {
      const line = lines[i];

      // Simple brace counting (doesn't handle strings/comments perfectly)
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          foundOpen = true;
        } else if (char === '}') {
          braceCount--;
          if (foundOpen && braceCount === 0) {
            return i + 1;
          }
        }
      }
    }

    return -1; // Couldn't find matching brace
  }

  /**
   * Fall back to chunk-based extraction
   */
  private extractChunks(
    content: string,
    lines: string[],
    minLines: number,
    maxLines: number
  ): GenericScope[] {
    const scopes: GenericScope[] = [];

    // Split by double newlines (paragraph-like)
    const chunks: Array<{ start: number; end: number; content: string }> = [];
    let chunkStart = 0;
    let emptyCount = 0;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '') {
        emptyCount++;
        if (emptyCount >= 2 && i - chunkStart >= minLines) {
          chunks.push({
            start: chunkStart,
            end: i - emptyCount + 1,
            content: lines.slice(chunkStart, i - emptyCount + 1).join('\n'),
          });
          chunkStart = i + 1;
          emptyCount = 0;
        }
      } else {
        emptyCount = 0;
      }

      // Force split at max lines
      if (i - chunkStart >= maxLines) {
        chunks.push({
          start: chunkStart,
          end: i + 1,
          content: lines.slice(chunkStart, i + 1).join('\n'),
        });
        chunkStart = i + 1;
      }
    }

    // Last chunk
    if (chunkStart < lines.length) {
      chunks.push({
        start: chunkStart,
        end: lines.length,
        content: lines.slice(chunkStart).join('\n'),
      });
    }

    // Convert chunks to scopes
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (chunk.end - chunk.start < minLines) continue;

      // Try to find a name from first meaningful line
      const firstLine = lines.slice(chunk.start, chunk.end).find(l => l.trim());
      const name = firstLine
        ? this.extractChunkName(firstLine) || `chunk_${i + 1}`
        : `chunk_${i + 1}`;

      scopes.push({
        uuid: this.generateUUID(),
        name,
        type: 'chunk',
        modifiers: [],
        source: chunk.content,
        startLine: chunk.start + 1,
        endLine: chunk.end,
        depth: 0,
        confidence: 0.3,
      });
    }

    return scopes;
  }

  /**
   * Try to extract a meaningful name from a chunk's first line
   */
  private extractChunkName(line: string): string | undefined {
    const trimmed = line.trim();

    // Try common patterns
    const patterns = [
      /^(?:class|struct|interface|type)\s+(\w+)/,
      /^(?:def|function|fn|func|sub)\s+(\w+)/,
      /^(\w+)\s*=/,
      /^#\s*(.+)$/, // Comment header
    ];

    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match) return match[1];
    }

    return undefined;
  }

  /**
   * Extract imports from lines
   */
  private extractImports(lines: string[]): GenericImport[] {
    const imports: GenericImport[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      for (const keyword of IMPORT_KEYWORDS) {
        if (line.startsWith(keyword + ' ') || line.startsWith(keyword + '(')) {
          // Extract what's being imported
          const target = line.slice(keyword.length).trim()
            .replace(/['"`;()]/g, '')
            .split(/\s+/)[0];

          imports.push({
            keyword,
            target,
            statement: line,
            line: i + 1,
          });
          break;
        }
      }

      // Also check for #include
      if (line.startsWith('#include')) {
        const match = line.match(/#include\s*[<"]([^>"]+)[>"]/);
        if (match) {
          imports.push({
            keyword: '#include',
            target: match[1],
            statement: line,
            line: i + 1,
          });
        }
      }
    }

    return imports;
  }

  /**
   * Detect brace style from content
   */
  private detectBraceStyle(content: string): 'curly' | 'indent' | 'mixed' | 'unknown' {
    const hasCurly = content.includes('{') && content.includes('}');
    const hasIndentBlocks = /:\s*\n\s+\w/.test(content);

    if (hasCurly && !hasIndentBlocks) return 'curly';
    if (hasIndentBlocks && !hasCurly) return 'indent';
    if (hasCurly && hasIndentBlocks) return 'mixed';
    return 'unknown';
  }

  /**
   * Detect comment styles used in content
   */
  private detectCommentStyle(content: string): string[] {
    const styles: string[] = [];

    if (content.includes('//')) styles.push('//');
    if (content.includes('#') && !content.includes('#!/')) styles.push('#');
    if (content.includes('/*')) styles.push('/* */');
    if (content.includes('--')) styles.push('--');
    if (content.includes('"""')) styles.push('"""');
    if (content.includes("'''")) styles.push("'''");

    return styles;
  }

  /**
   * Generate UUID
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16).toUpperCase();
    });
  }
}
