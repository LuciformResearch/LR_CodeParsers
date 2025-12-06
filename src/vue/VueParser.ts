/**
 * VueParser
 *
 * Parses Vue Single File Components using tree-sitter-vue.
 * Extracts template, script, and style sections with their metadata.
 *
 * @since 2025-12-06
 */

import { WasmLoader } from '../wasm/WasmLoader.js';
import { createHash } from 'crypto';
import path from 'path';
import type {
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

type SyntaxNode = any;

/**
 * VueParser - Main parser for Vue SFC files
 */
export class VueParser {
  private parser: any = null;
  private initialized = false;

  /**
   * Initialize the parser
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const { parser } = await WasmLoader.loadParser('vue', {
        environment: 'node',
      });
      this.parser = parser;
      this.initialized = true;
      console.log('✅ VueParser initialized');
    } catch (error) {
      console.error('❌ Failed to initialize VueParser:', error);
      throw error;
    }
  }

  /**
   * Parse a Vue SFC file
   */
  async parseFile(
    filePath: string,
    content: string,
    options: VueSFCParseOptions = {}
  ): Promise<VueSFCParseResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const tree = this.parser!.parse(content);
    const lines = content.split('\n');
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);

    const blocks: VueSFCBlock[] = [];
    const props: VueProp[] = [];
    const emits: VueEmit[] = [];
    const slots: VueSlot[] = [];
    const componentUsages: VueComponentUsage[] = [];
    const composables: VueComposable[] = [];
    const directives: VueDirective[] = [];
    const imports: string[] = [];

    let hasTemplate = false;
    let hasScript = false;
    let hasScriptSetup = false;
    let hasStyle = false;
    let styleScoped = false;
    let templateLang: string | undefined;
    let scriptLang: string | undefined;
    let styleLang: string | undefined;

    // Traverse the AST
    this.traverseNode(tree.rootNode, content, (node) => {
      const block = this.parseBlock(node, content);
      if (block) {
        blocks.push(block);

        switch (block.type) {
          case 'template':
            hasTemplate = true;
            templateLang = block.lang;
            if (options.parseDirectives !== false) {
              directives.push(...this.extractDirectives(block.content, block.startLine));
            }
            if (options.parseComponents !== false) {
              componentUsages.push(...this.extractComponentUsages(block.content, block.startLine));
            }
            break;

          case 'script':
            hasScript = true;
            if (block.attrs['setup']) {
              hasScriptSetup = true;
            }
            scriptLang = block.lang || (block.attrs['lang'] === 'ts' ? 'typescript' : undefined);

            // Extract from script content
            this.extractFromScript(block.content, block.startLine, {
              props,
              emits,
              composables,
              imports,
            });
            break;

          case 'style':
            hasStyle = true;
            if (block.attrs['scoped']) {
              styleScoped = true;
            }
            styleLang = block.lang;
            break;
        }
      }
    });

    // Derive component name from filename
    const componentName = this.deriveComponentName(filePath);

    const sfc: VueSFCInfo = {
      uuid: this.generateUUID(),
      file: filePath,
      hash,
      linesOfCode: lines.length,
      componentName,
      hasTemplate,
      hasScript,
      hasScriptSetup,
      hasStyle,
      styleScoped,
      templateLang,
      scriptLang,
      styleLang,
      props,
      emits,
      slots,
      componentUsages,
      composables,
      directives,
      imports,
    };

    // Create relationships
    const relationships: VueSFCRelationship[] = [];

    // IMPORTS relationships
    for (const imp of imports) {
      relationships.push({
        type: 'IMPORTS',
        from: sfc.uuid,
        to: imp,
      });
    }

    // USES_COMPONENT relationships
    for (const usage of componentUsages) {
      relationships.push({
        type: 'USES_COMPONENT',
        from: sfc.uuid,
        to: usage.name,
        properties: {
          props: usage.props,
          events: usage.events,
        },
      });
    }

    // USES_COMPOSABLE relationships
    for (const composable of composables) {
      relationships.push({
        type: 'USES_COMPOSABLE',
        from: sfc.uuid,
        to: composable.name,
      });
    }

    return {
      sfc,
      blocks,
      relationships,
    };
  }

  /**
   * Traverse the Vue AST
   */
  private traverseNode(
    node: SyntaxNode,
    content: string,
    onBlock: (node: SyntaxNode) => void
  ): void {
    // Vue SFC root nodes
    if (
      node.type === 'template_element' ||
      node.type === 'script_element' ||
      node.type === 'style_element' ||
      node.type === 'element' // Custom blocks
    ) {
      onBlock(node);
    }

    // Recurse
    for (const child of node.children || []) {
      this.traverseNode(child, content, onBlock);
    }
  }

  /**
   * Parse a block (template, script, style)
   */
  private parseBlock(node: SyntaxNode, content: string): VueSFCBlock | null {
    let type: VueSFCBlock['type'] = 'custom';
    let blockContent = '';
    const attrs: Record<string, string | boolean> = {};
    let lang: string | undefined;

    // Determine block type
    if (node.type === 'template_element') {
      type = 'template';
    } else if (node.type === 'script_element') {
      type = 'script';
    } else if (node.type === 'style_element') {
      type = 'style';
    } else if (node.type === 'element') {
      const tagName = this.getTagName(node, content);
      if (tagName === 'template') type = 'template';
      else if (tagName === 'script') type = 'script';
      else if (tagName === 'style') type = 'style';
    }

    // Extract attributes and content
    for (const child of node.children || []) {
      if (child.type === 'start_tag' || child.type === 'self_closing_tag') {
        // Parse attributes
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

    // For some grammars, content might be in a different location
    if (!blockContent) {
      // Try to get content between tags
      const fullText = this.getNodeText(node, content);
      const match = fullText.match(/<[^>]+>([\s\S]*)<\/[^>]+>/);
      if (match) {
        blockContent = match[1];
      }
    }

    return {
      type,
      content: blockContent.trim(),
      attrs,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      lang,
    };
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
   * Extract Vue directives from template content
   */
  private extractDirectives(templateContent: string, startLine: number): VueDirective[] {
    const directives: VueDirective[] = [];

    // Match Vue directives: v-xxx, @xxx, :xxx, #xxx
    const directiveRegex = /(v-[a-z-]+|[@:#][a-z-]+)(?::([a-z-]+))?(?:\.([a-z.]+))?(?:="([^"]*)")?/g;
    const lines = templateContent.split('\n');

    for (let i = 0; i < lines.length; i++) {
      let match;
      while ((match = directiveRegex.exec(lines[i])) !== null) {
        const fullName = match[1];
        let name = fullName;
        let argument = match[2];
        const modifiersStr = match[3];
        const expression = match[4];

        // Normalize shorthand
        if (fullName.startsWith('@')) {
          name = 'v-on';
          argument = fullName.slice(1);
        } else if (fullName.startsWith(':')) {
          name = 'v-bind';
          argument = fullName.slice(1);
        } else if (fullName.startsWith('#')) {
          name = 'v-slot';
          argument = fullName.slice(1);
        }

        const modifiers = modifiersStr ? modifiersStr.split('.').filter(Boolean) : [];

        directives.push({
          name,
          argument,
          modifiers,
          expression,
          line: startLine + i,
        });
      }
    }

    return directives;
  }

  /**
   * Extract component usages from template content
   */
  private extractComponentUsages(templateContent: string, startLine: number): VueComponentUsage[] {
    const usages: VueComponentUsage[] = [];

    // Match PascalCase or kebab-case components (excluding HTML tags)
    const componentRegex = /<([A-Z][a-zA-Z0-9]*|[a-z]+-[a-z-]+)([^>]*)>/g;
    const htmlTags = new Set([
      'div', 'span', 'p', 'a', 'button', 'input', 'form', 'img', 'ul', 'li', 'ol',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'footer', 'nav', 'main', 'section',
      'article', 'aside', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'label',
      'select', 'option', 'textarea', 'pre', 'code', 'template', 'slot',
    ]);

    const lines = templateContent.split('\n');
    let lineIndex = 0;

    let match;
    while ((match = componentRegex.exec(templateContent)) !== null) {
      const tagName = match[1];
      const attrs = match[2];

      // Skip HTML tags
      if (htmlTags.has(tagName.toLowerCase())) continue;

      // Calculate line number
      const upToMatch = templateContent.slice(0, match.index);
      lineIndex = upToMatch.split('\n').length - 1;

      // Extract props and events
      const props: string[] = [];
      const events: string[] = [];

      const attrRegex = /(?::([a-z-]+)|([a-z-]+))(?:="[^"]*")?|@([a-z-]+)/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(attrs)) !== null) {
        if (attrMatch[1]) props.push(attrMatch[1]); // v-bind shorthand
        if (attrMatch[2] && !attrMatch[2].startsWith('v-')) props.push(attrMatch[2]); // Regular props
        if (attrMatch[3]) events.push(attrMatch[3]); // Events
      }

      // Check for slot content
      const hasSlot = new RegExp(`<${tagName}[^>]*>[\\s\\S]*?</${tagName}>`).test(templateContent);

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
   * Extract props, emits, composables from script content
   */
  private extractFromScript(
    scriptContent: string,
    startLine: number,
    result: {
      props: VueProp[];
      emits: VueEmit[];
      composables: VueComposable[];
      imports: string[];
    }
  ): void {
    const lines = scriptContent.split('\n');

    // Extract imports
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(scriptContent)) !== null) {
      result.imports.push(match[1]);
    }

    // Extract defineProps
    const propsMatch = scriptContent.match(/defineProps(?:<[^>]+>)?\s*\(\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*\)/);
    if (propsMatch) {
      const propsLine = scriptContent.slice(0, propsMatch.index!).split('\n').length;
      this.parseDefineProps(propsMatch[1], startLine + propsLine - 1, result.props);
    }

    // Extract defineEmits
    const emitsMatch = scriptContent.match(/defineEmits(?:<[^>]+>)?\s*\(\s*(\[[\s\S]*?\])\s*\)/);
    if (emitsMatch) {
      const emitsLine = scriptContent.slice(0, emitsMatch.index!).split('\n').length;
      this.parseDefineEmits(emitsMatch[1], startLine + emitsLine - 1, result.emits);
    }

    // Extract composables (useXxx functions)
    const composableRegex = /(?:const|let)\s+(\{[^}]+\}|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(use[A-Z][a-zA-Z0-9]*)\s*\(/g;
    while ((match = composableRegex.exec(scriptContent)) !== null) {
      const returns = match[1].startsWith('{')
        ? match[1].slice(1, -1).split(',').map(s => s.trim())
        : [match[1]];
      const composableLine = scriptContent.slice(0, match.index).split('\n').length;

      result.composables.push({
        name: match[2],
        arguments: [],
        returns,
        line: startLine + composableLine - 1,
      });
    }
  }

  /**
   * Parse defineProps content
   */
  private parseDefineProps(propsStr: string, line: number, props: VueProp[]): void {
    // Simple object syntax: { foo: String, bar: { type: Number, required: true } }
    if (propsStr.startsWith('{')) {
      const propRegex = /(\w+)\s*:\s*(?:(\w+)|(\{[^}]+\}))/g;
      let match;
      while ((match = propRegex.exec(propsStr)) !== null) {
        const name = match[1];
        const simpleType = match[2];
        const complexDef = match[3];

        if (simpleType) {
          props.push({
            name,
            type: simpleType,
            required: false,
            line,
          });
        } else if (complexDef) {
          const typeMatch = complexDef.match(/type\s*:\s*(\w+)/);
          const requiredMatch = complexDef.match(/required\s*:\s*(true|false)/);
          const defaultMatch = complexDef.match(/default\s*:\s*([^,}]+)/);

          props.push({
            name,
            type: typeMatch?.[1],
            required: requiredMatch?.[1] === 'true',
            default: defaultMatch?.[1]?.trim(),
            line,
          });
        }
      }
    }
    // Array syntax: ['foo', 'bar']
    else if (propsStr.startsWith('[')) {
      const arrayMatch = propsStr.match(/['"](\w+)['"]/g);
      if (arrayMatch) {
        for (const prop of arrayMatch) {
          props.push({
            name: prop.replace(/['"]/g, ''),
            required: false,
            line,
          });
        }
      }
    }
  }

  /**
   * Parse defineEmits content
   */
  private parseDefineEmits(emitsStr: string, line: number, emits: VueEmit[]): void {
    const arrayMatch = emitsStr.match(/['"]([^'"]+)['"]/g);
    if (arrayMatch) {
      for (const emit of arrayMatch) {
        emits.push({
          name: emit.replace(/['"]/g, ''),
          line,
        });
      }
    }
  }

  /**
   * Derive component name from file path
   */
  private deriveComponentName(filePath: string): string {
    const basename = path.basename(filePath, path.extname(filePath));
    // Convert kebab-case to PascalCase
    return basename
      .split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
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
