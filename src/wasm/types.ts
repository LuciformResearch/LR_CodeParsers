/**
 * Types for WASM loader module
 */

export interface WasmLoaderConfig {
  environment: 'node' | 'browser';
  treeSitterWasmUrl?: string;
  languageWasmUrl?: string;
}

export interface LoadedParser {
  parser: any; // web-tree-sitter Parser instance
  language: any; // Language instance
}

export type SupportedLanguage = 'typescript' | 'python';
