/**
 * Import Resolution Types
 *
 * Defines the interface for language-specific import resolvers.
 */

/**
 * Result of resolving an import
 */
export interface ResolvedImport {
  /** Absolute path to the resolved file (null if external/not found) */
  absolutePath: string | null;
  /** Whether this is a local project file vs external dependency */
  isLocal: boolean;
  /** The module/package name for external imports */
  packageName?: string;
  /** Original import specifier */
  originalSpecifier: string;
}

/**
 * Import type classification
 */
export type ImportType =
  | 'relative'    // ./foo, ../bar
  | 'absolute'    // /path/to/file
  | 'alias'       // @/foo, ~/bar (path aliases)
  | 'package'     // lodash, react
  | 'builtin'     // fs, path (Node.js), os (Python)
  | 'unknown';

/**
 * Base interface for language-specific import resolvers.
 *
 * Each language has different import systems:
 * - TypeScript/JS: tsconfig.json paths, node_modules, package.json
 * - Python: sys.path, PYTHONPATH, pyproject.toml
 * - C/C++: #include paths, -I flags, pkg-config
 * - Rust: Cargo.toml, crate::, mod.rs
 * - Go: go.mod, GOPATH, vendor
 * - C#: .csproj, NuGet packages, namespaces
 */
export interface BaseImportResolver {
  /**
   * Load language-specific configuration from the project root.
   * For TypeScript: tsconfig.json
   * For Python: pyproject.toml, setup.py
   * For C/C++: compile_commands.json, Makefile
   * For Rust: Cargo.toml
   * For Go: go.mod
   */
  loadConfig(projectRoot: string, configPath?: string): Promise<void>;

  /**
   * Check if an import path is local to the project.
   * This helps distinguish between:
   * - Local files: ./utils, ../lib, @/components (aliases)
   * - External packages: lodash, react, numpy
   * - Built-in modules: fs, os, fmt
   */
  isLocalImport(importPath: string): boolean;

  /**
   * Classify the type of import.
   */
  getImportType(importPath: string): ImportType;

  /**
   * Resolve an import specifier to an absolute file path.
   *
   * @param importPath - The import specifier (e.g., "./utils", "lodash", "#include <stdio.h>")
   * @param currentFile - Absolute path of the file containing the import
   * @returns Absolute path to resolved file, or null if external/not found
   */
  resolveImport(importPath: string, currentFile: string): Promise<string | null>;

  /**
   * Resolve an import with full details.
   */
  resolveImportFull(importPath: string, currentFile: string): Promise<ResolvedImport>;

  /**
   * Get the relative path from project root.
   */
  getRelativePath(absolutePath: string): string;

  /**
   * Check if a module is a built-in module for this language.
   * Examples:
   * - Node.js: fs, path, http
   * - Python: os, sys, json
   * - Go: fmt, io, net
   */
  isBuiltinModule(moduleName: string): boolean;
}

/**
 * Configuration for TypeScript/JavaScript import resolution
 */
export interface TypeScriptConfig {
  compilerOptions?: {
    baseUrl?: string;
    paths?: { [pattern: string]: string[] };
    rootDir?: string;
    outDir?: string;
    moduleResolution?: string;
  };
}

/**
 * Configuration for C/C++ import resolution
 */
export interface CConfig {
  /** Include directories (-I flags) */
  includePaths: string[];
  /** System include directories */
  systemIncludePaths: string[];
  /** Defines (-D flags) */
  defines: { [key: string]: string };
}

/**
 * Configuration for Python import resolution
 */
export interface PythonConfig {
  /** Python path entries */
  pythonPath: string[];
  /** Virtual environment path */
  venvPath?: string;
  /** Package source directories */
  srcDirs: string[];
}

/**
 * Configuration for Rust import resolution
 */
export interface RustConfig {
  /** Crate name from Cargo.toml */
  crateName: string;
  /** Dependencies from Cargo.toml */
  dependencies: { [name: string]: string };
  /** Dev dependencies from Cargo.toml */
  devDependencies: { [name: string]: string };
  /** Rust edition (2015, 2018, 2021) */
  edition: string;
}

/**
 * Configuration for Go import resolution
 */
export interface GoConfig {
  /** Module name from go.mod */
  moduleName: string;
  /** Go version */
  goVersion: string;
  /** Dependencies from go.mod */
  dependencies: { [path: string]: string };
}

/**
 * Configuration for C# import resolution
 */
export interface CSharpConfig {
  /** Root namespace from .csproj */
  rootNamespace: string;
  /** Assembly name */
  assemblyName: string;
  /** Target framework */
  targetFramework: string;
  /** NuGet package references */
  packageReferences: { [name: string]: string };
  /** Project references */
  projectReferences: string[];
}
