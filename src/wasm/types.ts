/**
 * Types for WASM loader module
 */

/**
 * Configuration for WasmLoader
 * @deprecated Use WasmLoaderOptions instead
 */
export interface WasmLoaderConfig {
  environment: 'node' | 'browser';
  treeSitterWasmUrl?: string;
  languageWasmUrl?: string;
}

/**
 * Options for loading WASM parsers
 */
export interface WasmLoaderOptions {
  /**
   * Base URL for WASM files (browser only)
   * Example: 'https://cdn.example.com/wasm' or '/assets/wasm'
   * Language files will be loaded from: `${wasmBaseUrl}/tree-sitter-${language}.wasm`
   */
  wasmBaseUrl?: string;

  /**
   * Force a specific environment instead of auto-detection
   * - 'node': Use file system paths (default in Node.js)
   * - 'browser': Use fetch/URL loading (default in browser)
   */
  forceEnvironment?: 'node' | 'browser';
}

export interface LoadedParser {
  parser: any; // web-tree-sitter Parser instance
  language: any; // Language instance
}

export type SupportedLanguage = 'typescript' | 'python' | 'html' | 'css' | 'scss' | 'svelte';
// Note: 'vue' is not supported via tree-sitter WASM (external scanner incompatible)
// VueParser uses regex-based parsing instead
