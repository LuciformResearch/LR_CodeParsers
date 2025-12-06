/**
 * WASM loader for tree-sitter parsers in Node.js
 * Note: Browser environments are not currently supported
 */

import type { WasmLoaderConfig, LoadedParser, SupportedLanguage } from './types.js';

/**
 * WASM loader for Node.js environments
 */
export class WasmLoader {
  private static parserInstances = new Map<string, LoadedParser>();

  /**
   * Load tree-sitter and a language grammar
   * Only supports Node.js environment
   */
  static async loadParser(
    language: SupportedLanguage,
    config: WasmLoaderConfig
  ): Promise<LoadedParser> {
    const cacheKey = `${language}-node`;

    if (this.parserInstances.has(cacheKey)) {
      return this.parserInstances.get(cacheKey)!;
    }

    const parser = await this.loadNodeParser(language, config);
    this.parserInstances.set(cacheKey, parser);
    return parser;
  }

  /**
   * Load a parser for Node.js environment
   * Uses WASM files from node_modules
   */
  private static async loadNodeParser(
    language: SupportedLanguage,
    config: WasmLoaderConfig
  ): Promise<LoadedParser> {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);

    const WebTreeSitter: any = await import('web-tree-sitter');
    await WebTreeSitter.Parser.init();

    const parser = new WebTreeSitter.Parser();

    // Charge depuis node_modules
    let wasmPath: string;
    if (language === 'typescript') {
      wasmPath = require.resolve('tree-sitter-typescript/tree-sitter-typescript.wasm');
    } else if (language === 'python') {
      wasmPath = require.resolve('tree-sitter-python/tree-sitter-python.wasm');
    } else if (language === 'html') {
      wasmPath = require.resolve('tree-sitter-html/tree-sitter-html.wasm');
    } else if (language === 'css') {
      wasmPath = require.resolve('tree-sitter-css/tree-sitter-css.wasm');
    } else if (language === 'scss') {
      wasmPath = require.resolve('tree-sitter-scss/tree-sitter-scss.wasm');
    } else if (language === 'vue') {
      wasmPath = require.resolve('tree-sitter-vue/tree-sitter-vue.wasm');
    } else if (language === 'svelte') {
      wasmPath = require.resolve('tree-sitter-svelte/tree-sitter-svelte.wasm');
    } else {
      throw new Error(`Unsupported language: ${language}`);
    }

    const languageInstance = await WebTreeSitter.Language.load(wasmPath);
    parser.setLanguage(languageInstance);

    return { parser, language: languageInstance };
  }

  /**
   * Clear the parser cache
   * Useful for tests or reloading
   */
  static clearCache(): void {
    this.parserInstances.clear();
  }

  /**
   * Check if a parser is already cached
   */
  static isCached(language: SupportedLanguage): boolean {
    const cacheKey = `${language}-node`;
    return this.parserInstances.has(cacheKey);
  }
}
