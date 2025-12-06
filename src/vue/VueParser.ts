/**
 * VueParser
 *
 * Parses Vue Single File Components using regex-based extraction.
 * tree-sitter-vue is not WASM-compatible (has external scanner).
 * Extracts template, script, and style sections with their metadata.
 *
 * @since 2025-12-06
 */

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

/**
 * VueParser - Main parser for Vue SFC files
 * Uses regex-based parsing (tree-sitter-vue not WASM compatible)
 */
export class VueParser {
  private initialized = false;

  /**
   * Initialize the parser (no-op for regex-based parser)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    console.log('✅ VueParser initialized (regex-based)');
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

    // Extract blocks using regex
    const extractedBlocks = this.extractBlocks(content);

    for (const block of extractedBlocks) {
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
   * Extract SFC blocks using regex
   */
  private extractBlocks(content: string): VueSFCBlock[] {
    const blocks: VueSFCBlock[] = [];

    // Extract template block
    const templateMatch = content.match(/<template([^>]*)>([\s\S]*?)<\/template>/i);
    if (templateMatch) {
      const attrs = this.parseAttributes(templateMatch[1]);
      const startLine = content.slice(0, templateMatch.index!).split('\n').length;
      const endLine = startLine + templateMatch[0].split('\n').length - 1;
      blocks.push({
        type: 'template',
        content: templateMatch[2].trim(),
        attrs,
        startLine,
        endLine,
        lang: attrs['lang'] as string | undefined,
      });
    }

    // Extract script blocks (may have multiple: setup and regular)
    const scriptRegex = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
    let scriptMatch;
    while ((scriptMatch = scriptRegex.exec(content)) !== null) {
      const attrs = this.parseAttributes(scriptMatch[1]);
      const startLine = content.slice(0, scriptMatch.index).split('\n').length;
      const endLine = startLine + scriptMatch[0].split('\n').length - 1;
      blocks.push({
        type: 'script',
        content: scriptMatch[2].trim(),
        attrs,
        startLine,
        endLine,
        lang: attrs['lang'] as string | undefined,
      });
    }

    // Extract style blocks (may have multiple)
    const styleRegex = /<style([^>]*)>([\s\S]*?)<\/style>/gi;
    let styleMatch;
    while ((styleMatch = styleRegex.exec(content)) !== null) {
      const attrs = this.parseAttributes(styleMatch[1]);
      const startLine = content.slice(0, styleMatch.index).split('\n').length;
      const endLine = startLine + styleMatch[0].split('\n').length - 1;
      blocks.push({
        type: 'style',
        content: styleMatch[2].trim(),
        attrs,
        startLine,
        endLine,
        lang: attrs['lang'] as string | undefined,
      });
    }

    return blocks;
  }

  /**
   * Parse HTML-style attributes from a string
   */
  private parseAttributes(attrString: string): Record<string, string | boolean> {
    const attrs: Record<string, string | boolean> = {};

    // Match key="value", key='value', or standalone key
    const attrRegex = /(\w+)(?:=["']([^"']*)["'])?/g;
    let match;
    while ((match = attrRegex.exec(attrString)) !== null) {
      const name = match[1];
      const value = match[2];
      attrs[name] = value !== undefined ? value : true;
    }

    return attrs;
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

    let match;
    while ((match = componentRegex.exec(templateContent)) !== null) {
      const tagName = match[1];
      const attrs = match[2];

      // Skip HTML tags
      if (htmlTags.has(tagName.toLowerCase())) continue;

      // Calculate line number
      const upToMatch = templateContent.slice(0, match.index);
      const lineIndex = upToMatch.split('\n').length - 1;

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
