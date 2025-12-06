/**
 * CSSParser
 *
 * Parses CSS files using tree-sitter-css.
 * Extracts selectors, properties, variables, and structure.
 *
 * @since 2025-12-06
 */

import { WasmLoader } from '../wasm/WasmLoader.js';
import { createHash } from 'crypto';
import type {
  StylesheetInfo,
  CSSParseResult,
  CSSParseOptions,
  CSSRule,
  CSSAtRule,
  CSSSelector,
  CSSProperty,
  CSSVariable,
  CSSRelationship,
} from './types.js';

type SyntaxNode = any;

/**
 * CSSParser - Main parser for CSS files
 */
export class CSSParser {
  private parser: any = null;
  private initialized = false;

  /**
   * Initialize the parser
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const { parser } = await WasmLoader.loadParser('css', {
        environment: 'node',
      });
      this.parser = parser;
      this.initialized = true;
      console.log('✅ CSSParser initialized');
    } catch (error) {
      console.error('❌ Failed to initialize CSSParser:', error);
      throw error;
    }
  }

  /**
   * Parse a CSS file
   */
  async parseFile(
    filePath: string,
    content: string,
    options: CSSParseOptions = {}
  ): Promise<CSSParseResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const tree = this.parser!.parse(content);
    const lines = content.split('\n');
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);

    const rules: CSSRule[] = [];
    const atRules: CSSAtRule[] = [];
    const variables: CSSVariable[] = [];
    const imports: string[] = [];
    const keyframeNames: string[] = [];
    const mediaQueries: string[] = [];
    let fontFaceCount = 0;

    // Traverse the AST
    this.traverseNode(tree.rootNode, content, {
      onRule: (rule) => rules.push(rule),
      onAtRule: (atRule) => {
        atRules.push(atRule);
        if (atRule.name === 'import' && atRule.importUrl) {
          imports.push(atRule.importUrl);
        }
        if (atRule.name === 'font-face') {
          fontFaceCount++;
        }
        if (atRule.name === 'keyframes' && atRule.prelude) {
          keyframeNames.push(atRule.prelude);
        }
        if (atRule.name === 'media' && atRule.prelude) {
          mediaQueries.push(atRule.prelude);
        }
      },
      onVariable: (variable) => variables.push(variable),
    });

    // Count totals
    let selectorCount = 0;
    let propertyCount = 0;
    for (const rule of rules) {
      selectorCount += rule.selectors.length;
      propertyCount += rule.properties.length;
    }

    const stylesheet: StylesheetInfo = {
      uuid: this.generateUUID(),
      file: filePath,
      hash,
      linesOfCode: lines.length,
      ruleCount: rules.length,
      selectorCount,
      propertyCount,
      variables,
      imports,
      fontFaceCount,
      keyframeNames,
      mediaQueries,
    };

    // Create relationships
    const relationships: CSSRelationship[] = [];

    // IMPORTS relationships
    for (const importUrl of imports) {
      relationships.push({
        type: 'IMPORTS',
        from: stylesheet.uuid,
        to: importUrl,
      });
    }

    return {
      stylesheet,
      rules: options.includeRules !== false ? rules : [],
      atRules: options.includeRules !== false ? atRules : [],
      relationships,
    };
  }

  /**
   * Traverse the CSS AST
   */
  private traverseNode(
    node: SyntaxNode,
    content: string,
    callbacks: {
      onRule: (rule: CSSRule) => void;
      onAtRule: (atRule: CSSAtRule) => void;
      onVariable: (variable: CSSVariable) => void;
    }
  ): void {
    switch (node.type) {
      case 'rule_set':
        callbacks.onRule(this.parseRuleSet(node, content, callbacks.onVariable));
        break;

      case 'import_statement':
        callbacks.onAtRule(this.parseImportStatement(node, content));
        break;

      case 'media_statement':
        callbacks.onAtRule(this.parseMediaStatement(node, content, callbacks));
        break;

      case 'keyframes_statement':
        callbacks.onAtRule(this.parseKeyframesStatement(node, content));
        break;

      case 'at_rule':
        callbacks.onAtRule(this.parseAtRule(node, content, callbacks));
        break;

      case 'stylesheet':
        // Recurse into children
        for (const child of node.children || []) {
          this.traverseNode(child, content, callbacks);
        }
        break;

      default:
        // Recurse for other node types
        for (const child of node.children || []) {
          this.traverseNode(child, content, callbacks);
        }
    }
  }

  /**
   * Parse an import_statement node
   */
  private parseImportStatement(node: SyntaxNode, content: string): CSSAtRule {
    let importUrl = '';

    for (const child of node.children || []) {
      if (child.type === 'string_value') {
        // Direct string: @import 'file.css'
        importUrl = this.extractStringContent(child, content);
      } else if (child.type === 'call_expression') {
        // url() function: @import url('file.css')
        for (const callChild of child.children || []) {
          if (callChild.type === 'arguments') {
            for (const argChild of callChild.children || []) {
              if (argChild.type === 'string_value') {
                importUrl = this.extractStringContent(argChild, content);
              }
            }
          }
        }
      }
    }

    return {
      name: 'import',
      importUrl: importUrl || undefined,
      rules: [],
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  }

  /**
   * Parse a media_statement node
   */
  private parseMediaStatement(
    node: SyntaxNode,
    content: string,
    callbacks: {
      onRule: (rule: CSSRule) => void;
      onAtRule: (atRule: CSSAtRule) => void;
      onVariable: (variable: CSSVariable) => void;
    }
  ): CSSAtRule {
    let prelude = '';
    const rules: CSSRule[] = [];

    for (const child of node.children || []) {
      if (child.type === 'feature_query' || child.type === 'query_list') {
        prelude = this.getNodeText(child, content).trim();
      } else if (child.type === 'block') {
        // Parse nested rules
        for (const blockChild of child.children || []) {
          if (blockChild.type === 'rule_set') {
            rules.push(this.parseRuleSet(blockChild, content, callbacks.onVariable));
          }
        }
      }
    }

    return {
      name: 'media',
      prelude: prelude || undefined,
      rules,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  }

  /**
   * Parse a keyframes_statement node
   */
  private parseKeyframesStatement(node: SyntaxNode, content: string): CSSAtRule {
    let name = '';

    for (const child of node.children || []) {
      if (child.type === 'keyframes_name') {
        name = this.getNodeText(child, content).trim();
      }
    }

    return {
      name: 'keyframes',
      prelude: name || undefined,
      rules: [],
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  }

  /**
   * Extract string content from a string_value node (removes quotes)
   */
  private extractStringContent(node: SyntaxNode, content: string): string {
    for (const child of node.children || []) {
      if (child.type === 'string_content') {
        return this.getNodeText(child, content);
      }
    }
    // Fallback: get full text and remove quotes
    const text = this.getNodeText(node, content);
    return text.replace(/^['"]|['"]$/g, '');
  }

  /**
   * Parse a rule_set node
   */
  private parseRuleSet(
    node: SyntaxNode,
    content: string,
    onVariable: (variable: CSSVariable) => void
  ): CSSRule {
    const selectors: CSSSelector[] = [];
    const properties: CSSProperty[] = [];

    for (const child of node.children || []) {
      if (child.type === 'selectors') {
        // Parse selectors
        for (const selectorChild of child.children || []) {
          if (selectorChild.type !== ',') {
            const selectorText = this.getNodeText(selectorChild, content).trim();
            if (selectorText) {
              selectors.push({
                selector: selectorText,
                type: this.classifySelectorType(selectorText),
                specificity: this.calculateSpecificity(selectorText),
                line: selectorChild.startPosition.row + 1,
              });
            }
          }
        }
      } else if (child.type === 'block') {
        // Parse declarations
        for (const declChild of child.children || []) {
          if (declChild.type === 'declaration') {
            const prop = this.parseDeclaration(declChild, content);
            if (prop) {
              properties.push(prop);

              // Check for CSS variable definition
              if (prop.name.startsWith('--')) {
                const selectorText = selectors.map((s) => s.selector).join(', ');
                onVariable({
                  name: prop.name,
                  value: prop.value,
                  scope: selectorText || ':root',
                  line: prop.line,
                });
              }
            }
          }
        }
      }
    }

    return {
      selectors,
      properties,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  }

  /**
   * Parse an at_rule node
   */
  private parseAtRule(
    node: SyntaxNode,
    content: string,
    callbacks: {
      onRule: (rule: CSSRule) => void;
      onAtRule: (atRule: CSSAtRule) => void;
      onVariable: (variable: CSSVariable) => void;
    }
  ): CSSAtRule {
    let name = '';
    let prelude = '';
    let importUrl: string | undefined;
    const rules: CSSRule[] = [];

    for (const child of node.children || []) {
      if (child.type === 'at_keyword') {
        name = this.getNodeText(child, content).slice(1); // Remove @
      } else if (child.type === 'prelude' || child.type === 'media_query_list') {
        prelude = this.getNodeText(child, content).trim();
      } else if (child.type === 'string_value' || child.type === 'url_value') {
        // For @import
        importUrl = this.getNodeText(child, content).replace(/['"]/g, '');
      } else if (child.type === 'block') {
        // Parse nested rules
        for (const blockChild of child.children || []) {
          if (blockChild.type === 'rule_set') {
            rules.push(this.parseRuleSet(blockChild, content, callbacks.onVariable));
          } else if (blockChild.type === 'at_rule') {
            // Nested at-rule (not common but possible)
            callbacks.onAtRule(this.parseAtRule(blockChild, content, callbacks));
          }
        }
      }
    }

    return {
      name,
      prelude: prelude || undefined,
      rules,
      importUrl,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  }

  /**
   * Parse a declaration node
   */
  private parseDeclaration(node: SyntaxNode, content: string): CSSProperty | null {
    let name = '';
    let value = '';
    let important = false;

    for (const child of node.children || []) {
      if (child.type === 'property_name') {
        name = this.getNodeText(child, content);
      } else if (child.type === 'important') {
        important = true;
      } else if (
        child.type !== ':' &&
        child.type !== ';' &&
        child.type !== 'property_name'
      ) {
        // Accumulate value
        const text = this.getNodeText(child, content);
        if (text && text !== '!important') {
          value += (value ? ' ' : '') + text;
        }
      }
    }

    if (!name) return null;

    return {
      name,
      value: value.trim(),
      important,
      line: node.startPosition.row + 1,
    };
  }

  /**
   * Classify selector type
   */
  private classifySelectorType(selector: string): CSSSelector['type'] {
    if (selector.startsWith('#')) return 'id';
    if (selector.startsWith('.')) return 'class';
    if (selector.startsWith('*')) return 'universal';
    if (selector.startsWith('[')) return 'attribute';
    if (selector.startsWith(':')) return 'pseudo';
    if (selector.includes('>') || selector.includes('+') || selector.includes('~')) {
      return 'combinator';
    }
    return 'element';
  }

  /**
   * Calculate CSS specificity
   * Returns [inline, id, class, element]
   */
  private calculateSpecificity(selector: string): [number, number, number, number] {
    let inline = 0;
    let ids = 0;
    let classes = 0;
    let elements = 0;

    // Count IDs
    ids = (selector.match(/#[a-zA-Z][a-zA-Z0-9_-]*/g) || []).length;

    // Count classes, attributes, pseudo-classes
    classes = (selector.match(/\.[a-zA-Z][a-zA-Z0-9_-]*/g) || []).length;
    classes += (selector.match(/\[[^\]]+\]/g) || []).length;
    classes += (selector.match(/:[a-zA-Z][a-zA-Z0-9_-]*/g) || []).length;
    // Subtract pseudo-elements (they count as elements)
    const pseudoElements = (selector.match(/::[a-zA-Z][a-zA-Z0-9_-]*/g) || []).length;
    classes -= pseudoElements;

    // Count elements and pseudo-elements
    const stripped = selector
      .replace(/#[a-zA-Z][a-zA-Z0-9_-]*/g, '')
      .replace(/\.[a-zA-Z][a-zA-Z0-9_-]*/g, '')
      .replace(/\[[^\]]+\]/g, '')
      .replace(/:[a-zA-Z][a-zA-Z0-9_-]*/g, '');
    elements = (stripped.match(/[a-zA-Z][a-zA-Z0-9_-]*/g) || []).length;
    elements += pseudoElements;

    return [inline, ids, classes, elements];
  }

  /**
   * Get text content of a tree-sitter node
   */
  private getNodeText(node: SyntaxNode, content: string): string {
    if (!node) return '';
    return content.slice(node.startIndex, node.endIndex);
  }

  /**
   * Generate a UUID
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16).toUpperCase();
    });
  }
}
