/**
 * HTMLDocumentParser
 *
 * Parses HTML/Vue/Svelte files using tree-sitter-html.
 * Implements hybrid approach:
 * - Document metadata → persisted to Neo4j
 * - DOM tree → in-memory only
 * - Scripts → parsed with TypeScript parser, persisted as Scopes
 *
 * @since 2025-12-05
 */

import { WasmLoader } from '../wasm/WasmLoader.js';
import { ScopeExtractionParser } from '../scope-extraction/ScopeExtractionParser.js';
import { DOMTree, createDOMNode } from './DOMTree.js';
import { createHash } from 'crypto';
import { basename, extname } from 'path';
import type {
  DocumentInfo,
  DocumentType,
  DOMNode,
  HTMLParseResult,
  HTMLParseOptions,
  DocumentRelationship,
  ImageReference,
  ExternalScriptReference,
  ExternalStyleReference,
} from './types.js';
import type { ScopeInfo } from '../scope-extraction/types.js';

type SyntaxNode = any;

/**
 * HTMLDocumentParser - Main parser for HTML documents
 */
export class HTMLDocumentParser {
  private parser: any = null;
  private tsParser: ScopeExtractionParser | null = null;
  private initialized = false;

  /**
   * Initialize the parser
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const { parser } = await WasmLoader.loadParser('html', {
        environment: 'node',
      });
      this.parser = parser;

      // Initialize TypeScript parser for <script> content
      this.tsParser = new ScopeExtractionParser('typescript');
      await this.tsParser.initialize();

      this.initialized = true;
      console.log('✅ HTMLDocumentParser initialized');
    } catch (error) {
      console.error('❌ Failed to initialize HTMLDocumentParser:', error);
      throw error;
    }
  }

  /**
   * Parse an HTML/Vue file
   */
  async parseFile(
    filePath: string,
    content: string,
    options: HTMLParseOptions = {}
  ): Promise<HTMLParseResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const tree = this.parser!.parse(content);
    const domTree = this.buildDOMTree(tree.rootNode, content);
    const dom = new DOMTree(domTree);

    // Determine document type
    const docType = this.detectDocumentType(filePath, dom);

    // Extract metadata
    const document = this.extractDocumentInfo(filePath, content, dom, docType);

    // Extract and parse scripts
    const scopes: ScopeInfo[] = [];
    const relationships: DocumentRelationship[] = [];

    if (options.parseScripts !== false) {
      const scripts = dom.findScripts();
      for (const script of scripts) {
        if (script.content && !script.src) {
          const scriptScopes = await this.parseScriptContent(
            filePath,
            script.content,
            script.lang,
            document.uuid
          );
          scopes.push(...scriptScopes);

          // Create DEFINES relationships
          for (const scope of scriptScopes) {
            relationships.push({
              type: 'DEFINES',
              from: document.uuid,
              to: scope.name, // Will be resolved to UUID later
            });
          }
        }
      }
    }

    // Extract component usages
    const componentUsages = dom.findComponentUsages();
    document.usedComponents = componentUsages.map((c) => c.name);

    // Create USES_COMPONENT relationships
    for (const comp of componentUsages) {
      relationships.push({
        type: 'USES_COMPONENT',
        from: document.uuid,
        to: comp.name,
        properties: {
          props: Object.fromEntries(comp.props),
        },
      });
    }

    // Extract images
    const images = dom.findImages();
    document.images = images.map((img): ImageReference => ({
      src: img.src,
      alt: img.alt,
      line: img.node.startLine,
    }));

    // Create CONTAINS_IMAGE relationships
    for (const img of document.images) {
      relationships.push({
        type: 'CONTAINS_IMAGE',
        from: document.uuid,
        to: img.src,
        properties: {
          alt: img.alt,
          line: img.line,
        },
      });
    }

    // Extract external scripts
    const scripts = dom.findScripts();
    document.externalScripts = scripts
      .filter((s) => s.src) // Only external scripts
      .map((s): ExternalScriptReference => ({
        src: s.src!,
        type: s.lang,
        async: s.node.attributes.has('async'),
        defer: s.node.attributes.has('defer'),
        line: s.node.startLine,
      }));

    // Create REFERENCES_SCRIPT relationships
    for (const script of document.externalScripts) {
      relationships.push({
        type: 'REFERENCES_SCRIPT',
        from: document.uuid,
        to: script.src,
        properties: {
          type: script.type,
          async: script.async,
          defer: script.defer,
          line: script.line,
        },
      });
    }

    // Extract external stylesheets
    const stylesheets = dom.findExternalStylesheets();
    document.externalStyles = stylesheets.map((s): ExternalStyleReference => ({
      href: s.href,
      media: s.media,
      line: s.node.startLine,
    }));

    // Create REFERENCES_STYLESHEET relationships
    for (const style of document.externalStyles) {
      relationships.push({
        type: 'REFERENCES_STYLESHEET',
        from: document.uuid,
        to: style.href,
        properties: {
          media: style.media,
          line: style.line,
        },
      });
    }

    return {
      document,
      scopes,
      relationships,
      domTree: options.includeDOMTree !== false ? domTree : createDOMNode('element'),
    };
  }

  /**
   * Parse only the DOM tree (lightweight, for on-demand queries)
   */
  parseDOMTree(content: string): DOMTree {
    if (!this.initialized) {
      throw new Error('Parser not initialized. Call initialize() first.');
    }

    const tree = this.parser!.parse(content);
    const domTree = this.buildDOMTree(tree.rootNode, content);
    return new DOMTree(domTree);
  }

  /**
   * Build DOMTree from tree-sitter AST
   */
  private buildDOMTree(node: SyntaxNode, content: string, parent: DOMNode | null = null): DOMNode {
    let domNode: DOMNode;

    switch (node.type) {
      case 'document':
      case 'fragment':
        // Root node
        domNode = createDOMNode('element', {
          tagName: 'root',
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          startColumn: node.startPosition.column,
          endColumn: node.endPosition.column,
        });
        break;

      case 'element':
      case 'self_closing_tag':
        domNode = this.buildElementNode(node, content);
        break;

      // Special handling for script and style elements
      case 'script_element':
      case 'style_element':
        domNode = this.buildScriptOrStyleNode(node, content);
        break;

      case 'raw_text':
        // Raw text inside script/style tags
        const rawText = this.getNodeText(node, content);
        domNode = createDOMNode('text', {
          textContent: rawText,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          startColumn: node.startPosition.column,
          endColumn: node.endPosition.column,
        });
        break;

      case 'text':
        const text = this.getNodeText(node, content).trim();
        if (!text) {
          // Skip empty text nodes
          return createDOMNode('text');
        }
        domNode = createDOMNode('text', {
          textContent: text,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          startColumn: node.startPosition.column,
          endColumn: node.endPosition.column,
        });
        break;

      case 'comment':
        domNode = createDOMNode('comment', {
          textContent: this.getNodeText(node, content),
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          startColumn: node.startPosition.column,
          endColumn: node.endPosition.column,
        });
        break;

      case 'doctype':
        domNode = createDOMNode('doctype', {
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          startColumn: node.startPosition.column,
          endColumn: node.endPosition.column,
        });
        break;

      default:
        // For other node types, create element and recurse
        domNode = createDOMNode('element', {
          tagName: node.type,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          startColumn: node.startPosition.column,
          endColumn: node.endPosition.column,
        });
    }

    domNode.parent = parent;

    // Process children
    for (const child of node.children || []) {
      const childNode = this.buildDOMTree(child, content, domNode);
      if (childNode.nodeType !== 'text' || childNode.textContent) {
        domNode.children.push(childNode);
      }
    }

    return domNode;
  }

  /**
   * Build script or style element node
   */
  private buildScriptOrStyleNode(node: SyntaxNode, content: string): DOMNode {
    const tagName = node.type === 'script_element' ? 'script' : 'style';
    const attributes = new Map<string, string>();

    // Find start_tag to extract attributes
    const startTag = node.children?.find((c: SyntaxNode) => c.type === 'start_tag');
    if (startTag) {
      for (const attrChild of startTag.children || []) {
        if (attrChild.type === 'attribute') {
          const nameNode = attrChild.children?.find((c: SyntaxNode) => c.type === 'attribute_name');
          const valueNode = attrChild.children?.find(
            (c: SyntaxNode) => c.type === 'attribute_value' || c.type === 'quoted_attribute_value'
          );

          if (nameNode) {
            const name = this.getNodeText(nameNode, content);
            let value = '';
            if (valueNode) {
              value = this.getNodeText(valueNode, content);
              // Remove quotes if present
              if ((value.startsWith('"') && value.endsWith('"')) ||
                  (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
              }
            }
            attributes.set(name, value);
          }
        }
      }
    }

    const domNode = createDOMNode('element', {
      tagName,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      startColumn: node.startPosition.column,
      endColumn: node.endPosition.column,
    });

    // Copy attributes
    for (const [key, value] of attributes) {
      domNode.attributes.set(key, value);
    }

    return domNode;
  }

  /**
   * Build element node from tree-sitter node
   */
  private buildElementNode(node: SyntaxNode, content: string): DOMNode {
    let tagName = '';
    const attributes = new Map<string, string>();

    for (const child of node.children || []) {
      if (child.type === 'start_tag' || child.type === 'self_closing_tag') {
        // Extract tag name
        const tagNode = child.children?.find((c: SyntaxNode) => c.type === 'tag_name');
        if (tagNode) {
          tagName = this.getNodeText(tagNode, content);
        }

        // Extract attributes
        for (const attrChild of child.children || []) {
          if (attrChild.type === 'attribute') {
            const nameNode = attrChild.children?.find((c: SyntaxNode) => c.type === 'attribute_name');
            const valueNode = attrChild.children?.find(
              (c: SyntaxNode) => c.type === 'attribute_value' || c.type === 'quoted_attribute_value'
            );

            if (nameNode) {
              const name = this.getNodeText(nameNode, content);
              let value = '';
              if (valueNode) {
                value = this.getNodeText(valueNode, content);
                // Remove quotes if present
                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                  value = value.slice(1, -1);
                }
              }
              attributes.set(name, value);
            }
          }
        }
      }
    }

    const domNode = createDOMNode('element', {
      tagName,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      startColumn: node.startPosition.column,
      endColumn: node.endPosition.column,
    });

    // Copy attributes
    for (const [key, value] of attributes) {
      domNode.attributes.set(key, value);
    }

    return domNode;
  }

  /**
   * Detect document type from file extension and content
   */
  private detectDocumentType(filePath: string, dom: DOMTree): DocumentType {
    const ext = extname(filePath).toLowerCase();

    switch (ext) {
      case '.vue':
        return 'vue-sfc';
      case '.svelte':
        return 'svelte';
      case '.astro':
        return 'astro';
      default:
        return 'html';
    }
  }

  /**
   * Extract document info for Neo4j storage
   */
  private extractDocumentInfo(
    filePath: string,
    content: string,
    dom: DOMTree,
    docType: DocumentType
  ): DocumentInfo {
    const lines = content.split('\n');
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);

    // Extract component name from filename
    const fileName = basename(filePath, extname(filePath));
    const componentName = this.toPascalCase(fileName);

    // Check for template, script, style
    const hasTemplate = dom.findTemplate() !== null || docType === 'html';
    const scripts = dom.findScripts();
    const hasScript = scripts.length > 0;
    const hasStyle = dom.findStyles().length > 0;

    // Extract script language
    let scriptLang: string | undefined;
    let isScriptSetup = false;
    for (const script of scripts) {
      if (script.lang) {
        scriptLang = script.lang.replace('text/', '');
      }
      if (script.node.attributes.has('setup')) {
        isScriptSetup = true;
      }
    }

    // Extract imports from script content
    const imports: string[] = [];
    const exports: string[] = [];
    for (const script of scripts) {
      const scriptImports = this.extractImportsFromScript(script.content);
      imports.push(...scriptImports);
    }

    // Extract title
    const titleElements = dom.findElements('title');
    const title = titleElements.length > 0 ? dom.getTextContent(titleElements[0]) : undefined;

    // Extract meta description
    const metaDescs = dom.findElementsWithAttribute('name', 'description');
    const description = metaDescs.length > 0 ? metaDescs[0].attributes.get('content') : undefined;

    // Extract lang
    const htmlElements = dom.findElements('html');
    const lang = htmlElements.length > 0 ? htmlElements[0].attributes.get('lang') : undefined;

    return {
      uuid: this.generateUUID(),
      file: filePath,
      type: docType,
      hash,
      startLine: 1,
      endLine: lines.length,
      linesOfCode: lines.length,
      hasTemplate,
      hasScript,
      hasStyle,
      componentName,
      scriptLang,
      isScriptSetup,
      exports,
      imports,
      usedComponents: [], // Will be filled later
      images: [], // Will be filled later
      externalScripts: [], // Will be filled later
      externalStyles: [], // Will be filled later
      title,
      description,
      lang,
    };
  }

  /**
   * Parse script content with TypeScript parser
   */
  private async parseScriptContent(
    filePath: string,
    scriptContent: string,
    lang: string | undefined,
    documentUuid: string
  ): Promise<ScopeInfo[]> {
    if (!this.tsParser) {
      return [];
    }

    try {
      // Create a virtual file path for the script
      const virtualPath = `${filePath}#script`;

      const analysis = await this.tsParser.parseFile(virtualPath, scriptContent);
      return analysis.scopes;
    } catch (error) {
      console.warn(`Failed to parse script in ${filePath}:`, error);
      return [];
    }
  }

  /**
   * Extract imports from script content using regex
   */
  private extractImportsFromScript(content: string): string[] {
    const imports: string[] = [];
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    return imports;
  }

  /**
   * Convert string to PascalCase
   */
  private toPascalCase(str: string): string {
    return str
      .split(/[-_\s]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
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

  /**
   * Get text content of a tree-sitter node
   */
  private getNodeText(node: SyntaxNode, content: string): string {
    if (!node) return '';
    return content.slice(node.startIndex, node.endIndex);
  }
}
