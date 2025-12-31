/**
 * SCSSParser
 *
 * Parses SCSS/Sass files using tree-sitter-scss.
 * Extracts variables, mixins, functions, nesting, and standard CSS features.
 *
 * @since 2025-12-06
 */

import { WasmLoader } from '../wasm/WasmLoader.js';
import { createHash } from 'crypto';
import type {
  SCSSStylesheetInfo,
  SCSSParseResult,
  SCSSParseOptions,
  SCSSVariable,
  SCSSMixin,
  SCSSMixinParameter,
  SCSSInclude,
  SCSSFunction,
  SCSSUse,
  SCSSForward,
  SCSSExtend,
  SCSSPlaceholder,
  CSSRule,
  CSSAtRule,
  CSSSelector,
  CSSProperty,
  CSSRelationship,
} from './types.js';

type SyntaxNode = any;

/**
 * SCSSParser - Main parser for SCSS files
 */
export class SCSSParser {
  private parser: any = null;
  private initialized = false;

  /**
   * Initialize the parser
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const { parser } = await WasmLoader.loadParser('scss', {
        environment: 'node',
      });
      this.parser = parser;
      this.initialized = true;
      console.log('✅ SCSSParser initialized');
    } catch (error) {
      console.error('❌ Failed to initialize SCSSParser:', error);
      throw error;
    }
  }

  /**
   * Parse an SCSS file
   */
  async parseFile(
    filePath: string,
    content: string,
    options: SCSSParseOptions = {}
  ): Promise<SCSSParseResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    console.log(`⏳ Parsing ${filePath}...`);
    const tree = this.parser!.parse(content);
    const lines = content.split('\n');
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);

    const rules: CSSRule[] = [];
    const atRules: CSSAtRule[] = [];
    const variables: SCSSVariable[] = [];
    const mixins: SCSSMixin[] = [];
    const functions: SCSSFunction[] = [];
    const placeholders: SCSSPlaceholder[] = [];
    const uses: SCSSUse[] = [];
    const forwards: SCSSForward[] = [];
    const imports: string[] = [];
    const includes: SCSSInclude[] = [];
    const extends_: SCSSExtend[] = [];
    const keyframeNames: string[] = [];
    const mediaQueries: string[] = [];
    let fontFaceCount = 0;
    let maxNestingDepth = 0;

    // Traverse the AST
    this.traverseNode(tree.rootNode, content, 0, {
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
      onMixin: (mixin) => mixins.push(mixin),
      onFunction: (fn) => functions.push(fn),
      onPlaceholder: (ph) => placeholders.push(ph),
      onUse: (use) => uses.push(use),
      onForward: (fwd) => forwards.push(fwd),
      onInclude: (inc) => includes.push(inc),
      onExtend: (ext) => extends_.push(ext),
      onNesting: (depth) => {
        if (depth > maxNestingDepth) maxNestingDepth = depth;
      },
    });

    // Count totals
    let selectorCount = 0;
    let propertyCount = 0;
    for (const rule of rules) {
      selectorCount += rule.selectors.length;
      propertyCount += rule.properties.length;
    }

    const stylesheet: SCSSStylesheetInfo = {
      uuid: this.generateUUID(),
      file: filePath,
      hash,
      linesOfCode: lines.length,
      ruleCount: rules.length,
      selectorCount,
      propertyCount,
      variables,
      mixins,
      functions,
      placeholders,
      uses,
      forwards,
      imports,
      includes,
      extends: extends_,
      maxNestingDepth,
      fontFaceCount,
      keyframeNames,
      mediaQueries,
    };

    // Create relationships
    const relationships: CSSRelationship[] = [];

    // IMPORTS relationships (legacy @import)
    for (const importUrl of imports) {
      relationships.push({
        type: 'IMPORTS',
        from: stylesheet.uuid,
        to: importUrl,
      });
    }

    // USES relationships (@use)
    for (const use of uses) {
      relationships.push({
        type: 'IMPORTS',
        from: stylesheet.uuid,
        to: use.path,
        properties: { type: 'use', namespace: use.namespace },
      });
    }

    // FORWARDS relationships (@forward)
    for (const forward of forwards) {
      relationships.push({
        type: 'IMPORTS',
        from: stylesheet.uuid,
        to: forward.path,
        properties: { type: 'forward', prefix: forward.prefix },
      });
    }

    console.log(`📊 Parsed ${filePath}: ${rules.length} rules, ${mixins.length} mixins, ${variables.length} variables`);
    return {
      stylesheet,
      rules: options.includeRules !== false ? rules : [],
      atRules: options.includeRules !== false ? atRules : [],
      relationships,
    };
  }

  /**
   * Traverse the SCSS AST
   */
  private traverseNode(
    node: SyntaxNode,
    content: string,
    depth: number,
    callbacks: {
      onRule: (rule: CSSRule) => void;
      onAtRule: (atRule: CSSAtRule) => void;
      onVariable: (variable: SCSSVariable) => void;
      onMixin: (mixin: SCSSMixin) => void;
      onFunction: (fn: SCSSFunction) => void;
      onPlaceholder: (ph: SCSSPlaceholder) => void;
      onUse: (use: SCSSUse) => void;
      onForward: (fwd: SCSSForward) => void;
      onInclude: (inc: SCSSInclude) => void;
      onExtend: (ext: SCSSExtend) => void;
      onNesting: (depth: number) => void;
    }
  ): void {
    switch (node.type) {
      case 'stylesheet':
        for (const child of node.children || []) {
          this.traverseNode(child, content, depth, callbacks);
        }
        break;

      case 'rule_set':
        callbacks.onNesting(depth);
        callbacks.onRule(this.parseRuleSet(node, content, depth, callbacks));
        break;

      case 'declaration':
        // Top-level variable declaration
        const varDecl = this.parseVariableDeclaration(node, content);
        if (varDecl) {
          callbacks.onVariable(varDecl);
        }
        break;

      case 'mixin_statement':
        callbacks.onMixin(this.parseMixinStatement(node, content));
        break;

      case 'function_statement':
        callbacks.onFunction(this.parseFunctionStatement(node, content));
        break;

      case 'include_statement':
        callbacks.onInclude(this.parseIncludeStatement(node, content));
        break;

      case 'extend_statement':
        callbacks.onExtend(this.parseExtendStatement(node, content));
        break;

      case 'use_statement':
        callbacks.onUse(this.parseUseStatement(node, content));
        break;

      case 'forward_statement':
        callbacks.onForward(this.parseForwardStatement(node, content));
        break;

      case 'import_statement':
        callbacks.onAtRule(this.parseImportStatement(node, content));
        break;

      case 'media_statement':
        callbacks.onAtRule(this.parseMediaStatement(node, content, depth, callbacks));
        break;

      case 'keyframes_statement':
        callbacks.onAtRule(this.parseKeyframesStatement(node, content));
        break;

      case 'placeholder':
        callbacks.onPlaceholder(this.parsePlaceholder(node, content));
        break;

      case 'at_rule':
        callbacks.onAtRule(this.parseAtRule(node, content, depth, callbacks));
        break;

      default:
        // Recurse for unknown node types
        for (const child of node.children || []) {
          this.traverseNode(child, content, depth, callbacks);
        }
    }
  }

  /**
   * Parse a rule_set node (handles nesting)
   */
  private parseRuleSet(
    node: SyntaxNode,
    content: string,
    depth: number,
    callbacks: {
      onRule: (rule: CSSRule) => void;
      onAtRule: (atRule: CSSAtRule) => void;
      onVariable: (variable: SCSSVariable) => void;
      onMixin: (mixin: SCSSMixin) => void;
      onFunction: (fn: SCSSFunction) => void;
      onPlaceholder: (ph: SCSSPlaceholder) => void;
      onUse: (use: SCSSUse) => void;
      onForward: (fwd: SCSSForward) => void;
      onInclude: (inc: SCSSInclude) => void;
      onExtend: (ext: SCSSExtend) => void;
      onNesting: (depth: number) => void;
    }
  ): CSSRule {
    const selectors: CSSSelector[] = [];
    const properties: CSSProperty[] = [];

    for (const child of node.children || []) {
      if (child.type === 'selectors') {
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
        for (const blockChild of child.children || []) {
          if (blockChild.type === 'declaration') {
            const varDecl = this.parseVariableDeclaration(blockChild, content);
            if (varDecl) {
              callbacks.onVariable(varDecl);
            } else {
              const prop = this.parseDeclaration(blockChild, content);
              if (prop) {
                properties.push(prop);
              }
            }
          } else if (blockChild.type === 'rule_set') {
            // Nested rule
            callbacks.onNesting(depth + 1);
            callbacks.onRule(this.parseRuleSet(blockChild, content, depth + 1, callbacks));
          } else if (blockChild.type === 'include_statement') {
            callbacks.onInclude(this.parseIncludeStatement(blockChild, content));
          } else if (blockChild.type === 'extend_statement') {
            callbacks.onExtend(this.parseExtendStatement(blockChild, content));
          } else if (blockChild.type === 'media_statement') {
            callbacks.onAtRule(this.parseMediaStatement(blockChild, content, depth + 1, callbacks));
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
   * Parse a variable declaration ($var: value)
   */
  private parseVariableDeclaration(node: SyntaxNode, content: string): SCSSVariable | null {
    let name = '';
    let value = '';
    let isDefault = false;
    let isGlobal = false;

    for (const child of node.children || []) {
      if (child.type === 'variable_name' || child.type === 'variable') {
        name = this.getNodeText(child, content);
        if (!name.startsWith('$')) return null; // Not an SCSS variable
      } else if (child.type === 'default') {
        isDefault = true;
      } else if (child.type === 'global') {
        isGlobal = true;
      } else if (child.type !== ':' && child.type !== ';' && child.type !== 'variable_name' && child.type !== 'variable') {
        const text = this.getNodeText(child, content).trim();
        if (text && text !== '!default' && text !== '!global') {
          value += (value ? ' ' : '') + text;
        }
      }
    }

    // Check if name starts with $ (SCSS variable)
    if (!name || !name.startsWith('$')) return null;

    // Also check for !default and !global in value
    if (value.includes('!default')) {
      isDefault = true;
      value = value.replace('!default', '').trim();
    }
    if (value.includes('!global')) {
      isGlobal = true;
      value = value.replace('!global', '').trim();
    }

    return {
      name,
      value: value.trim(),
      isDefault,
      isGlobal,
      line: node.startPosition.row + 1,
    };
  }

  /**
   * Parse a @mixin statement
   */
  private parseMixinStatement(node: SyntaxNode, content: string): SCSSMixin {
    let name = '';
    const parameters: SCSSMixinParameter[] = [];
    let hasContent = false;

    for (const child of node.children || []) {
      if (child.type === 'name' || child.type === 'identifier') {
        name = this.getNodeText(child, content);
      } else if (child.type === 'parameters' || child.type === 'arguments') {
        parameters.push(...this.parseParameters(child, content));
      } else if (child.type === 'block') {
        // Check for @content
        hasContent = this.getNodeText(child, content).includes('@content');
      }
    }

    return {
      name,
      parameters,
      hasContent,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  }

  /**
   * Parse a @function statement
   */
  private parseFunctionStatement(node: SyntaxNode, content: string): SCSSFunction {
    let name = '';
    const parameters: SCSSMixinParameter[] = [];

    for (const child of node.children || []) {
      if (child.type === 'name' || child.type === 'identifier') {
        name = this.getNodeText(child, content);
      } else if (child.type === 'parameters' || child.type === 'arguments') {
        parameters.push(...this.parseParameters(child, content));
      }
    }

    return {
      name,
      parameters,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  }

  /**
   * Parse parameters for mixin/function
   */
  private parseParameters(node: SyntaxNode, content: string): SCSSMixinParameter[] {
    const params: SCSSMixinParameter[] = [];

    for (const child of node.children || []) {
      if (child.type === 'parameter' || child.type === 'argument') {
        let name = '';
        let defaultValue: string | undefined;
        let isRest = false;

        for (const paramChild of child.children || []) {
          if (paramChild.type === 'variable_name' || paramChild.type === 'variable') {
            name = this.getNodeText(paramChild, content).replace(/^\$/, '');
          } else if (paramChild.type === 'rest') {
            isRest = true;
          } else if (paramChild.type === 'default_value') {
            defaultValue = this.getNodeText(paramChild, content).replace(/^:\s*/, '');
          }
        }

        if (name) {
          params.push({ name, defaultValue, isRest });
        }
      } else if (child.type === 'variable_name' || child.type === 'variable') {
        const name = this.getNodeText(child, content).replace(/^\$/, '');
        if (name) {
          params.push({ name, isRest: false });
        }
      }
    }

    return params;
  }

  /**
   * Parse an @include statement
   */
  private parseIncludeStatement(node: SyntaxNode, content: string): SCSSInclude {
    let mixinName = '';
    const args: string[] = [];
    let hasContent = false;

    for (const child of node.children || []) {
      if (child.type === 'name' || child.type === 'identifier' || child.type === 'function_name') {
        mixinName = this.getNodeText(child, content);
      } else if (child.type === 'arguments' || child.type === 'call_expression') {
        const argsText = this.getNodeText(child, content);
        // Parse arguments (simplified)
        const matches = argsText.match(/\((.*)\)/);
        if (matches && matches[1]) {
          args.push(...matches[1].split(',').map(a => a.trim()).filter(Boolean));
        }
      } else if (child.type === 'block') {
        hasContent = true;
      }
    }

    return {
      mixinName,
      arguments: args,
      hasContent,
      line: node.startPosition.row + 1,
    };
  }

  /**
   * Parse an @extend statement
   */
  private parseExtendStatement(node: SyntaxNode, content: string): SCSSExtend {
    let selector = '';
    let isOptional = false;

    for (const child of node.children || []) {
      if (child.type === 'selector' || child.type === 'value') {
        selector = this.getNodeText(child, content).trim();
      } else if (child.type === 'optional') {
        isOptional = true;
      }
    }

    // Check for !optional in selector
    if (selector.includes('!optional')) {
      isOptional = true;
      selector = selector.replace('!optional', '').trim();
    }

    return {
      selector,
      isOptional,
      line: node.startPosition.row + 1,
    };
  }

  /**
   * Parse a @use statement
   */
  private parseUseStatement(node: SyntaxNode, content: string): SCSSUse {
    let path = '';
    let namespace: string | undefined;
    const withConfig: Record<string, string> = {};

    for (const child of node.children || []) {
      if (child.type === 'string_value' || child.type === 'string') {
        path = this.extractStringContent(child, content);
      } else if (child.type === 'as_clause') {
        for (const asChild of child.children || []) {
          if (asChild.type === 'identifier' || asChild.type === 'namespace') {
            namespace = this.getNodeText(asChild, content);
          }
        }
      } else if (child.type === 'with_clause') {
        // Parse with configuration
        const withText = this.getNodeText(child, content);
        const matches = withText.matchAll(/\$([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*([^,)]+)/g);
        for (const match of matches) {
          withConfig[match[1]] = match[2].trim();
        }
      }
    }

    return {
      path,
      namespace,
      withConfig: Object.keys(withConfig).length > 0 ? withConfig : undefined,
      line: node.startPosition.row + 1,
    };
  }

  /**
   * Parse a @forward statement
   */
  private parseForwardStatement(node: SyntaxNode, content: string): SCSSForward {
    let path = '';
    let show: string[] | undefined;
    let hide: string[] | undefined;
    let prefix: string | undefined;

    for (const child of node.children || []) {
      if (child.type === 'string_value' || child.type === 'string') {
        path = this.extractStringContent(child, content);
      } else if (child.type === 'show_clause') {
        show = [];
        for (const showChild of child.children || []) {
          if (showChild.type === 'identifier' || showChild.type === 'variable_name') {
            show.push(this.getNodeText(showChild, content));
          }
        }
      } else if (child.type === 'hide_clause') {
        hide = [];
        for (const hideChild of child.children || []) {
          if (hideChild.type === 'identifier' || hideChild.type === 'variable_name') {
            hide.push(this.getNodeText(hideChild, content));
          }
        }
      } else if (child.type === 'as_clause') {
        for (const asChild of child.children || []) {
          if (asChild.type === 'identifier') {
            prefix = this.getNodeText(asChild, content);
          }
        }
      }
    }

    return {
      path,
      show: show?.length ? show : undefined,
      hide: hide?.length ? hide : undefined,
      prefix,
      line: node.startPosition.row + 1,
    };
  }

  /**
   * Parse a placeholder selector (%placeholder)
   */
  private parsePlaceholder(node: SyntaxNode, content: string): SCSSPlaceholder {
    let name = '';
    const properties: CSSProperty[] = [];

    for (const child of node.children || []) {
      if (child.type === 'placeholder_selector' || child.type === 'selectors') {
        name = this.getNodeText(child, content).replace(/^%/, '');
      } else if (child.type === 'block') {
        for (const blockChild of child.children || []) {
          if (blockChild.type === 'declaration') {
            const prop = this.parseDeclaration(blockChild, content);
            if (prop) {
              properties.push(prop);
            }
          }
        }
      }
    }

    return {
      name,
      properties,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  }

  /**
   * Parse an import_statement node
   */
  private parseImportStatement(node: SyntaxNode, content: string): CSSAtRule {
    let importUrl = '';

    for (const child of node.children || []) {
      if (child.type === 'string_value' || child.type === 'string') {
        importUrl = this.extractStringContent(child, content);
      } else if (child.type === 'call_expression') {
        for (const callChild of child.children || []) {
          if (callChild.type === 'arguments') {
            for (const argChild of callChild.children || []) {
              if (argChild.type === 'string_value' || argChild.type === 'string') {
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
    depth: number,
    callbacks: {
      onRule: (rule: CSSRule) => void;
      onAtRule: (atRule: CSSAtRule) => void;
      onVariable: (variable: SCSSVariable) => void;
      onMixin: (mixin: SCSSMixin) => void;
      onFunction: (fn: SCSSFunction) => void;
      onPlaceholder: (ph: SCSSPlaceholder) => void;
      onUse: (use: SCSSUse) => void;
      onForward: (fwd: SCSSForward) => void;
      onInclude: (inc: SCSSInclude) => void;
      onExtend: (ext: SCSSExtend) => void;
      onNesting: (depth: number) => void;
    }
  ): CSSAtRule {
    let prelude = '';
    const rules: CSSRule[] = [];

    for (const child of node.children || []) {
      if (child.type === 'feature_query' || child.type === 'query_list' || child.type === 'media_query_list') {
        prelude = this.getNodeText(child, content).trim();
      } else if (child.type === 'block') {
        for (const blockChild of child.children || []) {
          if (blockChild.type === 'rule_set') {
            rules.push(this.parseRuleSet(blockChild, content, depth, callbacks));
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
      if (child.type === 'keyframes_name' || child.type === 'identifier') {
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
   * Parse an at_rule node (generic)
   */
  private parseAtRule(
    node: SyntaxNode,
    content: string,
    depth: number,
    callbacks: {
      onRule: (rule: CSSRule) => void;
      onAtRule: (atRule: CSSAtRule) => void;
      onVariable: (variable: SCSSVariable) => void;
      onMixin: (mixin: SCSSMixin) => void;
      onFunction: (fn: SCSSFunction) => void;
      onPlaceholder: (ph: SCSSPlaceholder) => void;
      onUse: (use: SCSSUse) => void;
      onForward: (fwd: SCSSForward) => void;
      onInclude: (inc: SCSSInclude) => void;
      onExtend: (ext: SCSSExtend) => void;
      onNesting: (depth: number) => void;
    }
  ): CSSAtRule {
    let name = '';
    let prelude = '';
    const rules: CSSRule[] = [];

    for (const child of node.children || []) {
      if (child.type === 'at_keyword') {
        name = this.getNodeText(child, content).slice(1); // Remove @
      } else if (child.type === 'prelude' || child.type === 'query_list') {
        prelude = this.getNodeText(child, content).trim();
      } else if (child.type === 'block') {
        for (const blockChild of child.children || []) {
          if (blockChild.type === 'rule_set') {
            rules.push(this.parseRuleSet(blockChild, content, depth, callbacks));
          }
        }
      }
    }

    return {
      name,
      prelude: prelude || undefined,
      rules,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
  }

  /**
   * Parse a declaration node (property: value)
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
        const text = this.getNodeText(child, content);
        if (text && text !== '!important') {
          value += (value ? ' ' : '') + text;
        }
      }
    }

    if (!name || name.startsWith('$')) return null; // Skip SCSS variables

    return {
      name,
      value: value.trim(),
      important,
      line: node.startPosition.row + 1,
    };
  }

  /**
   * Extract string content from a string_value node
   */
  private extractStringContent(node: SyntaxNode, content: string): string {
    for (const child of node.children || []) {
      if (child.type === 'string_content') {
        return this.getNodeText(child, content);
      }
    }
    const text = this.getNodeText(node, content);
    return text.replace(/^['"]|['"]$/g, '');
  }

  /**
   * Classify selector type
   */
  private classifySelectorType(selector: string): CSSSelector['type'] {
    if (selector.startsWith('%')) return 'pseudo'; // Placeholder
    if (selector.startsWith('#')) return 'id';
    if (selector.startsWith('.')) return 'class';
    if (selector.startsWith('*')) return 'universal';
    if (selector.startsWith('[')) return 'attribute';
    if (selector.startsWith(':')) return 'pseudo';
    if (selector.startsWith('&')) return 'combinator'; // Parent selector
    if (selector.includes('>') || selector.includes('+') || selector.includes('~')) {
      return 'combinator';
    }
    return 'element';
  }

  /**
   * Calculate CSS specificity
   */
  private calculateSpecificity(selector: string): [number, number, number, number] {
    let inline = 0;
    let ids = 0;
    let classes = 0;
    let elements = 0;

    ids = (selector.match(/#[a-zA-Z][a-zA-Z0-9_-]*/g) || []).length;
    classes = (selector.match(/\.[a-zA-Z][a-zA-Z0-9_-]*/g) || []).length;
    classes += (selector.match(/\[[^\]]+\]/g) || []).length;
    classes += (selector.match(/:[a-zA-Z][a-zA-Z0-9_-]*/g) || []).length;

    const pseudoElements = (selector.match(/::[a-zA-Z][a-zA-Z0-9_-]*/g) || []).length;
    classes -= pseudoElements;

    const stripped = selector
      .replace(/#[a-zA-Z][a-zA-Z0-9_-]*/g, '')
      .replace(/\.[a-zA-Z][a-zA-Z0-9_-]*/g, '')
      .replace(/\[[^\]]+\]/g, '')
      .replace(/:[a-zA-Z][a-zA-Z0-9_-]*/g, '')
      .replace(/&/g, ''); // Remove parent selector
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
