/**
 * SvelteParser
 *
 * Parses Svelte components using tree-sitter-svelte.
 * Extracts script, style, and markup with Svelte-specific features.
 *
 * @since 2025-12-06
 */

import { WasmLoader } from '../wasm/WasmLoader.js';
import { createHash } from 'crypto';
import path from 'path';
import type {
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

type SyntaxNode = any;

/**
 * SvelteParser - Main parser for Svelte component files
 */
export class SvelteParser {
  private parser: any = null;
  private initialized = false;

  /**
   * Initialize the parser
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const { parser } = await WasmLoader.loadParser('svelte', {
        environment: 'node',
      });
      this.parser = parser;
      this.initialized = true;
      console.log('✅ SvelteParser initialized');
    } catch (error) {
      console.error('❌ Failed to initialize SvelteParser:', error);
      throw error;
    }
  }

  /**
   * Parse a Svelte component file
   */
  async parseFile(
    filePath: string,
    content: string,
    options: SvelteParseOptions = {}
  ): Promise<SvelteParseResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    console.log(`⏳ Parsing ${filePath}...`);
    const tree = this.parser!.parse(content);
    const lines = content.split('\n');
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);

    const blocks: SvelteBlock[] = [];
    const props: SvelteProp[] = [];
    const reactives: SvelteReactive[] = [];
    const stores: SvelteStore[] = [];
    const dispatchers: SvelteDispatcher[] = [];
    const slots: SvelteSlot[] = [];
    const componentUsages: SvelteComponentUsage[] = [];
    const actions: SvelteAction[] = [];
    const transitions: SvelteTransition[] = [];
    const imports: string[] = [];

    let hasScript = false;
    let hasModuleScript = false;
    let hasStyle = false;
    let scriptLang: string | undefined;
    let styleLang: string | undefined;
    let markupContent = '';

    // Traverse the AST
    this.traverseNode(tree.rootNode, content, (node, nodeType) => {
      if (nodeType === 'script' || nodeType === 'module') {
        const block = this.parseScriptBlock(node, content);
        if (block) {
          blocks.push(block);
          if (block.type === 'module') {
            hasModuleScript = true;
          } else {
            hasScript = true;
            scriptLang = block.lang;
          }

          // Extract from script
          this.extractFromScript(block.content, block.startLine, {
            props,
            reactives,
            stores,
            dispatchers,
            imports,
          }, options);
        }
      } else if (nodeType === 'style') {
        const block = this.parseStyleBlock(node, content);
        if (block) {
          blocks.push(block);
          hasStyle = true;
          styleLang = block.lang;
        }
      } else if (nodeType === 'markup') {
        markupContent = this.getNodeText(node, content);
      }
    });

    // Extract from markup
    if (markupContent || !hasScript) {
      // If no explicit markup node, the whole file minus script/style is markup
      if (!markupContent) {
        markupContent = this.extractMarkup(content, blocks);
      }

      if (options.extractComponents !== false) {
        componentUsages.push(...this.extractComponentUsages(markupContent, 1));
      }

      actions.push(...this.extractActions(markupContent, 1));
      transitions.push(...this.extractTransitions(markupContent, 1));
      slots.push(...this.extractSlots(markupContent, 1));

      blocks.push({
        type: 'markup',
        content: markupContent,
        attrs: {},
        startLine: 1,
        endLine: lines.length,
      });
    }

    // Derive component name from filename
    const componentName = this.deriveComponentName(filePath);

    const component: SvelteComponentInfo = {
      uuid: this.generateUUID(),
      file: filePath,
      hash,
      linesOfCode: lines.length,
      componentName,
      hasScript,
      hasModuleScript,
      hasStyle,
      scriptLang,
      styleLang,
      props,
      reactives,
      stores,
      dispatchers,
      slots,
      componentUsages,
      actions,
      transitions,
      imports,
    };

    // Create relationships
    const relationships: SvelteRelationship[] = [];

    // IMPORTS relationships
    for (const imp of imports) {
      relationships.push({
        type: 'IMPORTS',
        from: component.uuid,
        to: imp,
      });
    }

    // USES_COMPONENT relationships
    for (const usage of componentUsages) {
      relationships.push({
        type: 'USES_COMPONENT',
        from: component.uuid,
        to: usage.name,
      });
    }

    // USES_STORE relationships
    for (const store of stores) {
      relationships.push({
        type: 'USES_STORE',
        from: component.uuid,
        to: store.name,
      });
    }

    // USES_ACTION relationships
    for (const action of actions) {
      relationships.push({
        type: 'USES_ACTION',
        from: component.uuid,
        to: action.name,
      });
    }

    console.log(`📊 Parsed ${filePath}: ${blocks.length} blocks, ${relationships.length} relationships`);
    return {
      component,
      blocks,
      relationships,
    };
  }

  /**
   * Traverse the Svelte AST
   */
  private traverseNode(
    node: SyntaxNode,
    content: string,
    onBlock: (node: SyntaxNode, type: 'script' | 'module' | 'style' | 'markup') => void
  ): void {
    if (node.type === 'script_element') {
      const isModule = this.hasContextModule(node, content);
      onBlock(node, isModule ? 'module' : 'script');
    } else if (node.type === 'style_element') {
      onBlock(node, 'style');
    } else if (node.type === 'element' || node.type === 'fragment') {
      // Could be markup or a specific tag
      const tagName = this.getTagName(node, content);
      if (tagName === 'script') {
        const isModule = this.hasContextModule(node, content);
        onBlock(node, isModule ? 'module' : 'script');
      } else if (tagName === 'style') {
        onBlock(node, 'style');
      }
    }

    // Recurse
    for (const child of node.children || []) {
      this.traverseNode(child, content, onBlock);
    }
  }

  /**
   * Check if script has context="module"
   */
  private hasContextModule(node: SyntaxNode, content: string): boolean {
    for (const child of node.children || []) {
      if (child.type === 'start_tag') {
        for (const attrChild of child.children || []) {
          if (attrChild.type === 'attribute') {
            const text = this.getNodeText(attrChild, content);
            if (text.includes('context') && text.includes('module')) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  /**
   * Parse a script block
   */
  private parseScriptBlock(node: SyntaxNode, content: string): SvelteBlock | null {
    const attrs: Record<string, string | boolean> = {};
    let blockContent = '';
    let lang: string | undefined;
    const isModule = this.hasContextModule(node, content);

    for (const child of node.children || []) {
      if (child.type === 'start_tag') {
        for (const attrChild of child.children || []) {
          if (attrChild.type === 'attribute') {
            const { name, value } = this.parseAttribute(attrChild, content);
            if (name) {
              attrs[name] = value ?? true;
              if (name === 'lang') {
                lang = value as string;
              }
            }
          }
        }
      } else if (child.type === 'raw_text' || child.type === 'text') {
        blockContent = this.getNodeText(child, content);
      }
    }

    return {
      type: isModule ? 'module' : 'script',
      content: blockContent.trim(),
      attrs,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      lang,
    };
  }

  /**
   * Parse a style block
   */
  private parseStyleBlock(node: SyntaxNode, content: string): SvelteBlock | null {
    const attrs: Record<string, string | boolean> = {};
    let blockContent = '';
    let lang: string | undefined;

    for (const child of node.children || []) {
      if (child.type === 'start_tag') {
        for (const attrChild of child.children || []) {
          if (attrChild.type === 'attribute') {
            const { name, value } = this.parseAttribute(attrChild, content);
            if (name) {
              attrs[name] = value ?? true;
              if (name === 'lang') {
                lang = value as string;
              }
            }
          }
        }
      } else if (child.type === 'raw_text' || child.type === 'text') {
        blockContent = this.getNodeText(child, content);
      }
    }

    return {
      type: 'style',
      content: blockContent.trim(),
      attrs,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      lang,
    };
  }

  /**
   * Extract markup from content (everything except script/style)
   */
  private extractMarkup(content: string, blocks: SvelteBlock[]): string {
    let markup = content;

    // Remove script and style blocks
    for (const block of blocks) {
      if (block.type === 'script' || block.type === 'module' || block.type === 'style') {
        const tagName = block.type === 'style' ? 'style' : 'script';
        const regex = new RegExp(`<${tagName}[^>]*>[\\s\\S]*?</${tagName}>`, 'gi');
        markup = markup.replace(regex, '');
      }
    }

    return markup.trim();
  }

  /**
   * Get tag name from element
   */
  private getTagName(node: SyntaxNode, content: string): string {
    for (const child of node.children || []) {
      if (child.type === 'start_tag' || child.type === 'self_closing_tag') {
        for (const tagChild of child.children || []) {
          if (tagChild.type === 'tag_name') {
            return this.getNodeText(tagChild, content);
          }
        }
      }
    }
    return '';
  }

  /**
   * Parse an attribute node
   */
  private parseAttribute(node: SyntaxNode, content: string): { name: string; value?: string } {
    let name = '';
    let value: string | undefined;

    for (const child of node.children || []) {
      if (child.type === 'attribute_name') {
        name = this.getNodeText(child, content);
      } else if (child.type === 'quoted_attribute_value' || child.type === 'attribute_value') {
        value = this.getNodeText(child, content).replace(/^["']|["']$/g, '');
      }
    }

    return { name, value };
  }

  /**
   * Extract props, reactives, stores, dispatchers from script
   */
  private extractFromScript(
    scriptContent: string,
    startLine: number,
    result: {
      props: SvelteProp[];
      reactives: SvelteReactive[];
      stores: SvelteStore[];
      dispatchers: SvelteDispatcher[];
      imports: string[];
    },
    options: SvelteParseOptions
  ): void {
    const lines = scriptContent.split('\n');

    // Extract imports
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(scriptContent)) !== null) {
      result.imports.push(match[1]);
    }

    // Extract props (export let xxx)
    const propRegex = /export\s+let\s+(\w+)(?:\s*:\s*([^=;]+))?(?:\s*=\s*([^;]+))?/g;
    while ((match = propRegex.exec(scriptContent)) !== null) {
      const propLine = scriptContent.slice(0, match.index).split('\n').length;
      result.props.push({
        name: match[1],
        type: match[2]?.trim(),
        default: match[3]?.trim(),
        line: startLine + propLine - 1,
      });
    }

    // Extract reactive statements ($:)
    if (options.parseReactives !== false) {
      const reactiveRegex = /\$:\s*(?:(\w+)\s*=\s*)?(.+)/g;
      while ((match = reactiveRegex.exec(scriptContent)) !== null) {
        const reactiveLine = scriptContent.slice(0, match.index).split('\n').length;
        const expression = match[2].trim();

        // Extract dependencies (simple heuristic: identifiers in expression)
        const deps: string[] = (expression.match(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g) || [])
          .filter(d => !['if', 'else', 'for', 'while', 'const', 'let', 'var', 'function', 'return', 'true', 'false'].includes(d));

        result.reactives.push({
          label: match[1],
          dependencies: [...new Set<string>(deps)],
          expression,
          line: startLine + reactiveLine - 1,
        });
      }
    }

    // Extract store usages ($storeName)
    if (options.parseStores !== false) {
      const storeRegex = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g;
      const storeNames = new Set<string>();
      while ((match = storeRegex.exec(scriptContent)) !== null) {
        const storeName = match[1];
        // Skip if it's a reactive statement marker
        if (storeName === ':') continue;
        if (!storeNames.has(storeName)) {
          storeNames.add(storeName);
          const storeLine = scriptContent.slice(0, match.index).split('\n').length;
          result.stores.push({
            name: storeName,
            isAutoSubscribed: true,
            line: startLine + storeLine - 1,
          });
        }
      }
    }

    // Extract event dispatchers
    const dispatcherRegex = /createEventDispatcher\s*\(\s*\)/g;
    const dispatchRegex = /dispatch\s*\(\s*['"]([^'"]+)['"]/g;
    while ((match = dispatchRegex.exec(scriptContent)) !== null) {
      const dispatchLine = scriptContent.slice(0, match.index).split('\n').length;
      result.dispatchers.push({
        eventName: match[1],
        line: startLine + dispatchLine - 1,
      });
    }
  }

  /**
   * Extract component usages from markup
   */
  private extractComponentUsages(markup: string, startLine: number): SvelteComponentUsage[] {
    const usages: SvelteComponentUsage[] = [];

    // Match PascalCase components
    const componentRegex = /<([A-Z][a-zA-Z0-9]*)([^>]*)>/g;

    let match;
    while ((match = componentRegex.exec(markup)) !== null) {
      const tagName = match[1];
      const attrs = match[2];

      const upToMatch = markup.slice(0, match.index);
      const lineIndex = upToMatch.split('\n').length - 1;

      // Extract props and events
      const props: string[] = [];
      const events: string[] = [];

      // Props: xxx={...} or xxx="..."
      const propRegex = /(\w+)(?:=(?:\{[^}]*\}|"[^"]*"))?/g;
      let propMatch;
      while ((propMatch = propRegex.exec(attrs)) !== null) {
        const propName = propMatch[1];
        if (propName.startsWith('on:')) {
          events.push(propName.slice(3));
        } else if (!['bind', 'use', 'transition', 'in', 'out', 'animate', 'class', 'style'].some(d => propName.startsWith(d + ':'))) {
          props.push(propName);
        }
      }

      // Events: on:xxx
      const eventRegex = /on:(\w+)/g;
      let eventMatch;
      while ((eventMatch = eventRegex.exec(attrs)) !== null) {
        events.push(eventMatch[1]);
      }

      // Check for slot content
      const hasSlot = new RegExp(`<${tagName}[^>]*>[\\s\\S]*?</${tagName}>`).test(markup);

      usages.push({
        name: tagName,
        props,
        events,
        hasSlot,
        line: startLine + lineIndex,
      });
    }

    return usages;
  }

  /**
   * Extract actions (use:xxx)
   */
  private extractActions(markup: string, startLine: number): SvelteAction[] {
    const actions: SvelteAction[] = [];

    const actionRegex = /use:(\w+)(?:=\{([^}]+)\})?/g;
    let match;
    while ((match = actionRegex.exec(markup)) !== null) {
      const upToMatch = markup.slice(0, match.index);
      const lineIndex = upToMatch.split('\n').length - 1;

      actions.push({
        name: match[1],
        parameters: match[2],
        line: startLine + lineIndex,
      });
    }

    return actions;
  }

  /**
   * Extract transitions/animations
   */
  private extractTransitions(markup: string, startLine: number): SvelteTransition[] {
    const transitions: SvelteTransition[] = [];

    const transitionRegex = /(transition|in|out|animate):(\w+)(?:=\{([^}]+)\})?/g;
    let match;
    while ((match = transitionRegex.exec(markup)) !== null) {
      const upToMatch = markup.slice(0, match.index);
      const lineIndex = upToMatch.split('\n').length - 1;

      transitions.push({
        type: match[1] as SvelteTransition['type'],
        name: match[2],
        parameters: match[3],
        line: startLine + lineIndex,
      });
    }

    return transitions;
  }

  /**
   * Extract slot definitions
   */
  private extractSlots(markup: string, startLine: number): SvelteSlot[] {
    const slots: SvelteSlot[] = [];

    const slotRegex = /<slot(?:\s+name="([^"]+)")?([^>]*)>/g;
    let match;
    while ((match = slotRegex.exec(markup)) !== null) {
      const upToMatch = markup.slice(0, match.index);
      const lineIndex = upToMatch.split('\n').length - 1;

      const name = match[1] || 'default';
      const attrs = match[2];

      // Extract slot props
      const props: string[] = [];
      const propRegex = /(\w+)=\{/g;
      let propMatch;
      while ((propMatch = propRegex.exec(attrs)) !== null) {
        props.push(propMatch[1]);
      }

      slots.push({
        name,
        props,
        line: startLine + lineIndex,
      });
    }

    return slots;
  }

  /**
   * Derive component name from file path
   */
  private deriveComponentName(filePath: string): string {
    return path.basename(filePath, path.extname(filePath));
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
