/**
 * DOMTree - In-memory DOM representation
 *
 * Parsed on-demand by tree-sitter, NOT persisted to Neo4j.
 * Provides query methods for finding elements.
 *
 * @since 2025-12-05
 */

import type { DOMNode } from './types.js';

/**
 * Create a new DOM node
 */
export function createDOMNode(
  nodeType: DOMNode['nodeType'],
  options: Partial<Omit<DOMNode, 'nodeType' | 'children' | 'parent' | 'attributes'>> & {
    tagName?: string;
    textContent?: string;
    attributes?: Record<string, string>;
  } = {}
): DOMNode {
  return {
    nodeType,
    tagName: options.tagName,
    textContent: options.textContent,
    attributes: new Map(Object.entries(options.attributes || {})),
    children: [],
    parent: null,
    startLine: options.startLine ?? 0,
    endLine: options.endLine ?? 0,
    startColumn: options.startColumn ?? 0,
    endColumn: options.endColumn ?? 0,
  };
}

/**
 * DOMTree class for querying the in-memory DOM
 */
export class DOMTree {
  constructor(public readonly root: DOMNode) {}

  /**
   * Find all elements matching a tag name
   */
  findElements(tagName: string): DOMNode[] {
    const results: DOMNode[] = [];
    this.traverse(this.root, (node) => {
      if (node.nodeType === 'element' && node.tagName?.toLowerCase() === tagName.toLowerCase()) {
        results.push(node);
      }
    });
    return results;
  }

  /**
   * Find element by ID
   */
  getElementById(id: string): DOMNode | null {
    let result: DOMNode | null = null;
    this.traverse(this.root, (node) => {
      if (node.nodeType === 'element' && node.attributes.get('id') === id) {
        result = node;
        return false; // Stop traversal
      }
    });
    return result;
  }

  /**
   * Find elements by class name
   */
  getElementsByClassName(className: string): DOMNode[] {
    const results: DOMNode[] = [];
    this.traverse(this.root, (node) => {
      if (node.nodeType === 'element') {
        const classes = node.attributes.get('class')?.split(/\s+/) || [];
        if (classes.includes(className)) {
          results.push(node);
        }
      }
    });
    return results;
  }

  /**
   * Find elements that have a specific attribute
   */
  findElementsWithAttribute(attrName: string, attrValue?: string): DOMNode[] {
    const results: DOMNode[] = [];
    this.traverse(this.root, (node) => {
      if (node.nodeType === 'element' && node.attributes.has(attrName)) {
        if (attrValue === undefined || node.attributes.get(attrName) === attrValue) {
          results.push(node);
        }
      }
    });
    return results;
  }

  /**
   * Find elements matching a CSS-like selector (simplified)
   * Supports: tagName, #id, .class, [attr], [attr=value]
   */
  querySelector(selector: string): DOMNode | null {
    const results = this.querySelectorAll(selector);
    return results[0] || null;
  }

  /**
   * Find all elements matching a CSS-like selector (simplified)
   */
  querySelectorAll(selector: string): DOMNode[] {
    const parsed = this.parseSelector(selector);
    const results: DOMNode[] = [];

    this.traverse(this.root, (node) => {
      if (node.nodeType === 'element' && this.matchesSelector(node, parsed)) {
        results.push(node);
      }
    });

    return results;
  }

  /**
   * Get all text content from a subtree
   */
  getTextContent(node: DOMNode = this.root): string {
    const texts: string[] = [];
    this.traverse(node, (n) => {
      if (n.nodeType === 'text' && n.textContent) {
        texts.push(n.textContent);
      }
    });
    return texts.join(' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Find all <img> elements with src attribute
   */
  findImages(): { src: string; alt?: string; node: DOMNode }[] {
    const images: { src: string; alt?: string; node: DOMNode }[] = [];
    this.traverse(this.root, (node) => {
      if (node.nodeType === 'element' && node.tagName?.toLowerCase() === 'img') {
        const src = node.attributes.get('src');
        if (src) {
          images.push({
            src,
            alt: node.attributes.get('alt'),
            node,
          });
        }
      }
    });
    return images;
  }

  /**
   * Find all <script> elements
   */
  findScripts(): { content: string; lang?: string; src?: string; node: DOMNode }[] {
    const scripts: { content: string; lang?: string; src?: string; node: DOMNode }[] = [];
    this.traverse(this.root, (node) => {
      if (node.nodeType === 'element' && node.tagName?.toLowerCase() === 'script') {
        const textContent = this.getTextContent(node);
        scripts.push({
          content: textContent,
          lang: node.attributes.get('lang') || node.attributes.get('type'),
          src: node.attributes.get('src'),
          node,
        });
      }
    });
    return scripts;
  }

  /**
   * Find all <style> elements
   */
  findStyles(): { content: string; scoped: boolean; lang?: string; node: DOMNode }[] {
    const styles: { content: string; scoped: boolean; lang?: string; node: DOMNode }[] = [];
    this.traverse(this.root, (node) => {
      if (node.nodeType === 'element' && node.tagName?.toLowerCase() === 'style') {
        styles.push({
          content: this.getTextContent(node),
          scoped: node.attributes.has('scoped'),
          lang: node.attributes.get('lang'),
          node,
        });
      }
    });
    return styles;
  }

  /**
   * Find <template> element (Vue/Svelte)
   */
  findTemplate(): DOMNode | null {
    let template: DOMNode | null = null;
    this.traverse(this.root, (node) => {
      if (node.nodeType === 'element' && node.tagName?.toLowerCase() === 'template') {
        template = node;
        return false; // Stop at first template
      }
    });
    return template;
  }

  /**
   * Find Vue/React component usages in template
   * Components are PascalCase or kebab-case custom elements
   */
  findComponentUsages(): { name: string; props: Map<string, string>; node: DOMNode }[] {
    const components: { name: string; props: Map<string, string>; node: DOMNode }[] = [];
    const htmlTags = new Set([
      'html', 'head', 'body', 'div', 'span', 'p', 'a', 'img', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'footer', 'nav', 'main',
      'section', 'article', 'aside', 'form', 'input', 'button', 'label',
      'textarea', 'select', 'option', 'table', 'tr', 'td', 'th', 'thead', 'tbody',
      'script', 'style', 'template', 'slot', 'link', 'meta', 'title', 'br', 'hr',
      'strong', 'em', 'code', 'pre', 'blockquote', 'iframe', 'video', 'audio',
      'canvas', 'svg', 'path', 'circle', 'rect', 'line', 'polygon', 'g', 'defs',
      'use', 'symbol', 'text', 'tspan', 'image', 'clipPath', 'mask', 'filter',
    ]);

    this.traverse(this.root, (node) => {
      if (node.nodeType === 'element' && node.tagName) {
        const tagLower = node.tagName.toLowerCase();
        // Check if it's a custom component (not a standard HTML tag)
        // PascalCase or contains hyphen (kebab-case)
        const isPascalCase = /^[A-Z]/.test(node.tagName);
        const isKebabCase = node.tagName.includes('-');

        if ((isPascalCase || isKebabCase) && !htmlTags.has(tagLower)) {
          components.push({
            name: node.tagName,
            props: new Map(node.attributes),
            node,
          });
        }
      }
    });

    return components;
  }

  /**
   * Find all <link rel="stylesheet"> elements
   */
  findExternalStylesheets(): { href: string; media?: string; node: DOMNode }[] {
    const stylesheets: { href: string; media?: string; node: DOMNode }[] = [];
    this.traverse(this.root, (node) => {
      if (node.nodeType === 'element' && node.tagName?.toLowerCase() === 'link') {
        const rel = node.attributes.get('rel');
        const href = node.attributes.get('href');
        if (rel === 'stylesheet' && href) {
          stylesheets.push({
            href,
            media: node.attributes.get('media'),
            node,
          });
        }
      }
    });
    return stylesheets;
  }

  /**
   * Find Vue event handlers (@click, @submit, etc.)
   */
  findVueEventHandlers(): { event: string; handler: string; node: DOMNode }[] {
    const handlers: { event: string; handler: string; node: DOMNode }[] = [];
    this.traverse(this.root, (node) => {
      if (node.nodeType === 'element') {
        for (const [attr, value] of node.attributes) {
          if (attr.startsWith('@') || attr.startsWith('v-on:')) {
            const event = attr.startsWith('@') ? attr.slice(1) : attr.slice(5);
            handlers.push({ event, handler: value, node });
          }
        }
      }
    });
    return handlers;
  }

  /**
   * Find Vue v-model bindings
   */
  findVueModels(): { model: string; node: DOMNode }[] {
    const models: { model: string; node: DOMNode }[] = [];
    this.traverse(this.root, (node) => {
      if (node.nodeType === 'element') {
        const vModel = node.attributes.get('v-model');
        if (vModel) {
          models.push({ model: vModel, node });
        }
      }
    });
    return models;
  }

  /**
   * Traverse the DOM tree
   * @param node Starting node
   * @param callback Called for each node. Return false to stop traversal.
   */
  private traverse(node: DOMNode, callback: (node: DOMNode) => boolean | void): boolean {
    const result = callback(node);
    if (result === false) return false;

    for (const child of node.children) {
      const shouldContinue = this.traverse(child, callback);
      if (!shouldContinue) return false;
    }

    return true;
  }

  /**
   * Parse a simplified CSS selector
   */
  private parseSelector(selector: string): ParsedSelector {
    const parsed: ParsedSelector = {};

    // Match tag name
    const tagMatch = selector.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
    if (tagMatch) {
      parsed.tagName = tagMatch[1];
    }

    // Match ID
    const idMatch = selector.match(/#([a-zA-Z][a-zA-Z0-9_-]*)/);
    if (idMatch) {
      parsed.id = idMatch[1];
    }

    // Match classes
    const classMatches = selector.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g);
    const classes: string[] = [];
    for (const match of classMatches) {
      classes.push(match[1]);
    }
    if (classes.length > 0) {
      parsed.classes = classes;
    }

    // Match attributes [attr] or [attr=value]
    const attrMatches = selector.matchAll(/\[([a-zA-Z][a-zA-Z0-9_-]*)(?:=["']?([^"'\]]+)["']?)?\]/g);
    const attrs: { name: string; value?: string }[] = [];
    for (const match of attrMatches) {
      attrs.push({ name: match[1], value: match[2] });
    }
    if (attrs.length > 0) {
      parsed.attributes = attrs;
    }

    return parsed;
  }

  /**
   * Check if a node matches a parsed selector
   */
  private matchesSelector(node: DOMNode, selector: ParsedSelector): boolean {
    if (selector.tagName && node.tagName?.toLowerCase() !== selector.tagName.toLowerCase()) {
      return false;
    }

    if (selector.id && node.attributes.get('id') !== selector.id) {
      return false;
    }

    if (selector.classes) {
      const nodeClasses = node.attributes.get('class')?.split(/\s+/) || [];
      for (const cls of selector.classes) {
        if (!nodeClasses.includes(cls)) {
          return false;
        }
      }
    }

    if (selector.attributes) {
      for (const attr of selector.attributes) {
        if (!node.attributes.has(attr.name)) {
          return false;
        }
        if (attr.value !== undefined && node.attributes.get(attr.name) !== attr.value) {
          return false;
        }
      }
    }

    return true;
  }
}

interface ParsedSelector {
  tagName?: string;
  id?: string;
  classes?: string[];
  attributes?: { name: string; value?: string }[];
}
