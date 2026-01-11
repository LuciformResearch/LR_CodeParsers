/**
 * WASM loader for tree-sitter parsers
 * Supports both Node.js and Browser environments
 *
 * Node.js: Uses pre-compiled WASM files from src/wasm/grammars/
 * Browser: Fetches WASM files from provided URL or relative path
 *
 * To rebuild WASM files, run: npm run build:wasm
 */

import type { WasmLoaderConfig, WasmLoaderOptions, LoadedParser, SupportedLanguage } from './types.js';

// Environment detection (works in both Node.js and Browser without type errors)
const isNode = typeof process !== 'undefined' &&
  process.versions != null &&
  process.versions.node != null;

// Use globalThis which is available in both environments
const isBrowser = typeof globalThis !== 'undefined' &&
  (typeof (globalThis as any).window !== 'undefined' ||
   typeof (globalThis as any).document !== 'undefined');

/**
 * WASM loader for both Node.js and Browser environments
 */
export class WasmLoader {
  private static parserInstances = new Map<string, LoadedParser>();
  private static parserInitPromise: Promise<void> | null = null;
  private static currentOptions: WasmLoaderOptions | null = null;

  /**
   * Configure the loader with options (call before loadParser)
   * @param options - Configuration options
   */
  static configure(options: WasmLoaderOptions): void {
    this.currentOptions = options;
  }

  /**
   * Initialize WebTreeSitter parser (called once globally)
   */
  private static async ensureParserInit(wasmBaseUrl?: string): Promise<void> {
    if (this.parserInitPromise) {
      return this.parserInitPromise;
    }

    this.parserInitPromise = (async () => {
      const WebTreeSitter: any = await import('web-tree-sitter');

      // In browser, we need to provide locateFile to find tree-sitter.wasm
      if (this.shouldUseBrowserMode()) {
        await WebTreeSitter.Parser.init({
          locateFile: (scriptName: string) => {
            if (wasmBaseUrl) {
              return `${wasmBaseUrl}/${scriptName}`;
            }
            // Default: assume wasm files are in the same directory or root
            return scriptName;
          }
        });
      } else {
        // Node.js mode - default initialization
        await WebTreeSitter.Parser.init();
      }
    })();

    return this.parserInitPromise;
  }

  /**
   * Check if we should use browser mode
   */
  private static shouldUseBrowserMode(): boolean {
    if (this.currentOptions?.forceEnvironment === 'browser') return true;
    if (this.currentOptions?.forceEnvironment === 'node') return false;
    return isBrowser && !isNode;
  }

  /**
   * Load tree-sitter and a language grammar
   * Automatically detects environment (Node.js vs Browser)
   *
   * @param language - The language to load
   * @param config - Legacy config (deprecated, use configure() instead)
   */
  static async loadParser(
    language: SupportedLanguage,
    config?: WasmLoaderConfig
  ): Promise<LoadedParser> {
    // Merge legacy config with current options
    const options = this.currentOptions || {};
    if (config?.treeSitterWasmUrl || config?.languageWasmUrl) {
      options.wasmBaseUrl = config.treeSitterWasmUrl || config.languageWasmUrl;
    }
    if (config?.environment) {
      options.forceEnvironment = config.environment;
    }

    const env = this.shouldUseBrowserMode() ? 'browser' : 'node';
    const cacheKey = `${language}-${env}`;

    if (this.parserInstances.has(cacheKey)) {
      return this.parserInstances.get(cacheKey)!;
    }

    try {
      const parser = this.shouldUseBrowserMode()
        ? await this.loadBrowserParser(language, options.wasmBaseUrl)
        : await this.loadNodeParser(language);

      this.parserInstances.set(cacheKey, parser);
      return parser;
    } catch (error) {
      console.error(`Failed to load parser for ${language}:`, error);
      throw error;
    }
  }

  /**
   * Load a parser for Node.js environment
   * Uses pre-compiled WASM files from grammars/ folder
   */
  private static async loadNodeParser(language: SupportedLanguage): Promise<LoadedParser> {
    // Dynamic imports for Node.js-only modules
    const { fileURLToPath } = await import('url');
    const { dirname, join } = await import('path');

    // Get the directory of this file to find local WASM grammars
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    await this.ensureParserInit();

    const WebTreeSitter: any = await import('web-tree-sitter');
    const parser = new WebTreeSitter.Parser();

    // Use pre-compiled WASM files from grammars/ folder
    const grammarsDir = join(__dirname, 'grammars');
    let wasmPath: string;

    // Map language to WASM file name
    const wasmFileMap: Record<string, string> = {
      typescript: 'tree-sitter-typescript.wasm',
      python: 'tree-sitter-python.wasm',
      html: 'tree-sitter-html.wasm',
      css: 'tree-sitter-css.wasm',
      c: 'tree-sitter-c.wasm',
      cpp: 'tree-sitter-cpp.wasm',
      rust: 'tree-sitter-rust.wasm',
      csharp: 'tree-sitter-c-sharp.wasm',
      go: 'tree-sitter-go.wasm',
    };

    if (wasmFileMap[language]) {
      wasmPath = join(grammarsDir, wasmFileMap[language]);
    } else if (language === 'scss') {
      // TODO: compile scss grammar with build:wasm script
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
      wasmPath = require.resolve('tree-sitter-scss/tree-sitter-scss.wasm');
    } else if (language === 'svelte') {
      // TODO: compile svelte grammar with build:wasm script
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
      wasmPath = require.resolve('tree-sitter-svelte/tree-sitter-svelte.wasm');
    } else {
      throw new Error(`Unsupported language: ${language}`);
    }

    const languageInstance = await WebTreeSitter.Language.load(wasmPath);
    parser.setLanguage(languageInstance);

    return { parser, language: languageInstance };
  }

  /**
   * Load a parser for Browser environment
   * Fetches WASM files from URL
   */
  private static async loadBrowserParser(
    language: SupportedLanguage,
    wasmBaseUrl?: string
  ): Promise<LoadedParser> {
    await this.ensureParserInit(wasmBaseUrl);

    const WebTreeSitter: any = await import('web-tree-sitter');
    const parser = new WebTreeSitter.Parser();

    // Build the URL for the language WASM file
    const wasmFileName = `tree-sitter-${language}.wasm`;
    const wasmUrl = wasmBaseUrl
      ? `${wasmBaseUrl}/${wasmFileName}`
      : wasmFileName;

    const languageInstance = await WebTreeSitter.Language.load(wasmUrl);
    parser.setLanguage(languageInstance);

    return { parser, language: languageInstance };
  }

  /**
   * Clear the parser cache
   * Useful for tests or reloading
   */
  static clearCache(): void {
    this.parserInstances.clear();
    this.parserInitPromise = null;
  }

  /**
   * Check if a parser is already cached
   */
  static isCached(language: SupportedLanguage): boolean {
    const env = this.shouldUseBrowserMode() ? 'browser' : 'node';
    const cacheKey = `${language}-${env}`;
    return this.parserInstances.has(cacheKey);
  }

  /**
   * Get the current detected environment
   */
  static getEnvironment(): 'node' | 'browser' {
    return this.shouldUseBrowserMode() ? 'browser' : 'node';
  }
}
