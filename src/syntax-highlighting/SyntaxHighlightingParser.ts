/**
 * Parser optimized for syntax highlighting
 * Lightweight and fast, used in the browser visualizer
 */

import { WasmLoader } from '../wasm/WasmLoader.js';
import type { SupportedLanguage } from '../wasm/types.js';
import type { HighlightToken } from './types.js';

export class SyntaxHighlightingParser {
  private parser: any = null;
  private language: SupportedLanguage;
  private environment: 'node' | 'browser';

  constructor(
    language: SupportedLanguage,
    environment: 'node' | 'browser' = 'browser'
  ) {
    this.language = language;
    this.environment = environment;
  }

  /**
   * Initialize the parser using WasmLoader
   */
  async initialize(wasmConfig?: { treeSitterUrl?: string; languageUrl?: string }): Promise<void> {
    const { parser } = await WasmLoader.loadParser(this.language, {
      environment: this.environment,
      treeSitterWasmUrl: wasmConfig?.treeSitterUrl,
      languageWasmUrl: wasmConfig?.languageUrl
    });
    this.parser = parser;
  }

  /**
   * Parse code and return the syntax tree
   */
  parse(code: string): any {
    if (!this.parser) {
      throw new Error('Parser not initialized. Call initialize() first.');
    }
    return this.parser.parse(code);
  }

  /**
   * Tokenize code for syntax highlighting
   * Returns a list of categorized tokens
   */
  getHighlightTokens(code: string): HighlightToken[] {
    const tree = this.parse(code);
    const tokens: HighlightToken[] = [];

    this.traverseForTokens(tree.rootNode, code, tokens);

    // Fill gaps with whitespace tokens (tree-sitter doesn't create nodes for whitespace)
    return this.fillWhitespaceGaps(tokens, code);
  }

  /**
   * Fill gaps between tokens with whitespace
   * Tree-sitter doesn't create nodes for whitespace, so we need to add them manually
   */
  private fillWhitespaceGaps(tokens: HighlightToken[], code: string): HighlightToken[] {
    const result: HighlightToken[] = [];
    let lastEnd = 0;

    for (const token of tokens) {
      // Add whitespace before this token if there's a gap
      if (token.start > lastEnd) {
        const whitespace = code.substring(lastEnd, token.start);
        result.push({
          type: 'whitespace',
          text: whitespace,
          start: lastEnd,
          end: token.start
        });
      }

      result.push(token);
      lastEnd = token.end;
    }

    // Add trailing whitespace if any
    if (lastEnd < code.length) {
      const whitespace = code.substring(lastEnd);
      result.push({
        type: 'whitespace',
        text: whitespace,
        start: lastEnd,
        end: code.length
      });
    }

    return result;
  }

  /**
   * Traverse the AST and categorize tokens for highlighting
   */
  private traverseForTokens(node: any, code: string, tokens: HighlightToken[]): void {
    const nodeType = node.type;
    const text = code.substring(node.startIndex, node.endIndex);

    // Categorize based on tree-sitter's native node type
    let category: HighlightToken['type'] = 'identifier';

    // Tree-sitter already categorizes keywords for us!
    if (this.isKeyword(nodeType)) {
      category = 'keyword';
    } else if (nodeType === 'string' || nodeType === 'template_string' || nodeType === 'string_fragment' ||
               nodeType === 'string_literal' || nodeType === 'string_content') {
      category = 'string';
    } else if (nodeType === 'number' || nodeType === 'numeric_literal' ||
               nodeType === 'integer' || nodeType === 'float') {
      category = 'number';
    } else if (nodeType === 'comment' || nodeType === 'line_comment' || nodeType === 'block_comment') {
      category = 'comment';
    } else if (nodeType === 'type_identifier' || nodeType === 'predefined_type' || nodeType === 'generic_type') {
      category = 'type';
    } else if (nodeType === 'identifier') {
      // Check parent context to determine the role of this identifier
      category = this.categorizeIdentifier(node);
    } else if (this.isOperator(nodeType)) {
      category = 'operator';
    } else if (this.isPunctuation(nodeType)) {
      category = 'punctuation';
    }

    // Only add leaf nodes (actual tokens) with non-whitespace content
    // Whitespace will be filled in later by fillWhitespaceGaps
    if (node.childCount === 0 && text.trim().length > 0) {
      tokens.push({
        type: category,
        text,
        start: node.startIndex,
        end: node.endIndex
      });
    }

    // Traverse children
    for (let i = 0; i < node.childCount; i++) {
      this.traverseForTokens(node.child(i), code, tokens);
    }
  }

  /**
   * Check if node type is a keyword
   */
  private isKeyword(nodeType: string): boolean {
    // TypeScript/JavaScript keywords
    const tsKeywords = [
      'if', 'else', 'for', 'while', 'return', 'const', 'let', 'var',
      'function', 'class', 'interface', 'type', 'export', 'import', 'from',
      'as', 'async', 'await', 'try', 'catch', 'throw', 'new', 'this',
      'extends', 'implements', 'public', 'private', 'protected', 'static',
      'readonly', 'break', 'continue', 'case', 'switch', 'default', 'do',
      'in', 'of', 'typeof', 'instanceof', 'void', 'delete', 'yield', 'super',
      'debugger', 'with', 'enum', 'namespace', 'module', 'declare', 'abstract',
      'get', 'set', 'is', 'keyof', 'infer', 'unique', 'require', 'global',
      'any', 'unknown', 'never', 'object', 'boolean', 'number', 'bigint',
      'string', 'symbol', 'undefined', 'null', 'true', 'false'
    ];

    // Python keywords
    const pythonKeywords = [
      'def', 'class', 'if', 'elif', 'else', 'for', 'while', 'return',
      'import', 'from', 'as', 'try', 'except', 'finally', 'raise', 'with',
      'async', 'await', 'lambda', 'yield', 'break', 'continue', 'pass',
      'assert', 'del', 'global', 'nonlocal', 'and', 'or', 'not', 'in',
      'is', 'True', 'False', 'None', 'self', 'cls'
    ];

    if (this.language === 'python') {
      return pythonKeywords.includes(nodeType);
    } else {
      return tsKeywords.includes(nodeType);
    }
  }

  /**
   * Check if node type is an operator
   */
  private isOperator(nodeType: string): boolean {
    const operators = [
      '+', '-', '*', '/', '=', '==', '===', '!=', '!==', '<', '>', '<=', '>=',
      '&&', '||', '!', '%', '**', '&', '|', '^', '~', '<<', '>>', '>>>',
      '+=', '-=', '*=', '/=', '%=', '**=', '&=', '|=', '^=', '<<=', '>>=', '>>>=',
      '++', '--', '??', '?.', '...'
    ];
    return operators.includes(nodeType);
  }

  /**
   * Check if node type is punctuation
   */
  private isPunctuation(nodeType: string): boolean {
    const punctuation = [
      '(', ')', '{', '}', '[', ']', ';', ',', '.', ':', '?', '=>'
    ];
    return punctuation.includes(nodeType);
  }

  /**
   * Categorize an identifier based on its parent context
   */
  private categorizeIdentifier(node: any): HighlightToken['type'] {
    const parent = node.parent;
    if (!parent) return 'identifier';

    const parentType = parent.type;

    // TypeScript/JavaScript patterns
    if (parentType === 'function_declaration' || parentType === 'function_expression' ||
        parentType === 'arrow_function' || parentType === 'method_definition' ||
        parentType === 'function_signature' || parentType === 'call_expression') {
      return 'function';
    } else if (parentType === 'class_declaration' || parentType === 'class_expression' ||
               parentType === 'new_expression') {
      return 'class';
    } else if (parentType === 'required_parameter' || parentType === 'optional_parameter' ||
               parentType === 'rest_parameter') {
      return 'parameter';
    } else if (parentType === 'property_identifier' || parentType === 'public_field_definition' ||
               parentType === 'property_signature') {
      return 'property';
    }

    // Python patterns
    if (this.language === 'python') {
      if (parentType === 'function_definition' || parentType === 'call') {
        return 'function';
      } else if (parentType === 'class_definition') {
        return 'class';
      } else if (parentType === 'parameter' || parentType === 'parameters') {
        return 'parameter';
      } else if (parentType === 'attribute') {
        return 'property';
      }
    }

    return 'identifier';
  }
}
