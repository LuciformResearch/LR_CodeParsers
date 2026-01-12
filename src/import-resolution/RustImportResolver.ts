/**
 * Rust Import Resolver
 *
 * Implements BaseImportResolver for Rust projects.
 *
 * Handles:
 * - use declarations: use std::collections::HashMap;
 * - Crate paths: crate::, self::, super::
 * - External crates from Cargo.toml
 * - Module paths (mod.rs, module files)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { BaseImportResolver, ImportType, ResolvedImport, RustConfig } from './types.js';

/** Rust standard library crates */
const RUST_STD_CRATES = new Set([
  'std', 'core', 'alloc', 'proc_macro', 'test',
]);

/** Common Rust crates (not stdlib but very common) */
const RUST_COMMON_CRATES = new Set([
  'serde', 'serde_json', 'tokio', 'async_std', 'futures',
  'log', 'env_logger', 'tracing', 'anyhow', 'thiserror',
  'clap', 'structopt', 'regex', 'lazy_static', 'once_cell',
  'chrono', 'uuid', 'rand', 'reqwest', 'hyper', 'actix',
  'diesel', 'sqlx', 'rusqlite', 'syn', 'quote', 'proc_macro2',
]);

/**
 * Parse use declaration to extract path components
 */
interface UseInfo {
  fullPath: string;
  crateName: string;
  isStdlib: boolean;
  isRelative: boolean; // crate::, self::, super::
  importedNames: string[];
}

export class RustImportResolver implements BaseImportResolver {
  protected projectRoot: string;
  protected config: RustConfig = {
    crateName: '',
    dependencies: {},
    devDependencies: {},
    edition: '2021',
  };

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  /**
   * Load configuration from Cargo.toml (implements BaseImportResolver)
   */
  async loadConfig(projectRoot: string, configPath?: string): Promise<void> {
    this.projectRoot = projectRoot;

    const cargoPath = configPath || path.join(projectRoot, 'Cargo.toml');

    try {
      const content = await fs.readFile(cargoPath, 'utf8');
      this.parseCargoToml(content);
    } catch {
      console.warn('No Cargo.toml found, using defaults');
    }
  }

  /**
   * Parse Cargo.toml to extract dependencies
   * Note: This is a simple parser, not a full TOML parser
   */
  private parseCargoToml(content: string): void {
    const lines = content.split('\n');
    let currentSection = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Section headers
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        currentSection = trimmed.slice(1, -1);
        continue;
      }

      // Package name
      if (currentSection === 'package' && trimmed.startsWith('name')) {
        const match = trimmed.match(/name\s*=\s*"([^"]+)"/);
        if (match) {
          this.config.crateName = match[1].replace(/-/g, '_');
        }
      }

      // Edition
      if (currentSection === 'package' && trimmed.startsWith('edition')) {
        const match = trimmed.match(/edition\s*=\s*"([^"]+)"/);
        if (match) {
          this.config.edition = match[1];
        }
      }

      // Dependencies
      if (currentSection === 'dependencies' && trimmed.includes('=')) {
        const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=/);
        if (match) {
          const depName = match[1].replace(/-/g, '_');
          this.config.dependencies[depName] = trimmed;
        }
      }

      // Dev dependencies
      if (currentSection === 'dev-dependencies' && trimmed.includes('=')) {
        const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=/);
        if (match) {
          const depName = match[1].replace(/-/g, '_');
          this.config.devDependencies[depName] = trimmed;
        }
      }
    }
  }

  /**
   * Parse a use declaration
   */
  parseUseDeclaration(useLine: string): UseInfo | null {
    // Match: use path::to::module; or use path::to::{A, B};
    const match = useLine.match(/use\s+([^;{]+)(?:\s*::\s*\{([^}]+)\})?/);
    if (!match) return null;

    let fullPath = match[1].trim();
    const braceContent = match[2];

    // Handle glob imports
    fullPath = fullPath.replace(/::$/, '');

    // Extract imported names
    let importedNames: string[] = [];
    if (braceContent) {
      importedNames = braceContent.split(',').map(s => s.trim());
    } else {
      // Single import, name is the last segment
      const segments = fullPath.split('::');
      importedNames = [segments[segments.length - 1]];
    }

    // Determine crate name and type
    const segments = fullPath.split('::');
    const firstSegment = segments[0];

    const isRelative = ['crate', 'self', 'super'].includes(firstSegment);
    const isStdlib = RUST_STD_CRATES.has(firstSegment);

    let crateName = firstSegment;
    if (firstSegment === 'crate') {
      crateName = this.config.crateName || 'crate';
    }

    return {
      fullPath,
      crateName,
      isStdlib,
      isRelative,
      importedNames,
    };
  }

  /**
   * Check if an import is local (implements BaseImportResolver)
   */
  isLocalImport(importPath: string): boolean {
    const info = this.parseUseDeclaration(importPath);
    if (!info) {
      // Treat as raw path
      return importPath.startsWith('crate::') ||
             importPath.startsWith('self::') ||
             importPath.startsWith('super::');
    }

    return info.isRelative;
  }

  /**
   * Classify the type of import (implements BaseImportResolver)
   */
  getImportType(importPath: string): ImportType {
    const info = this.parseUseDeclaration(importPath);

    if (!info) {
      // Raw path analysis
      if (importPath.startsWith('crate::')) return 'relative';
      if (importPath.startsWith('self::')) return 'relative';
      if (importPath.startsWith('super::')) return 'relative';
      return 'unknown';
    }

    if (info.isStdlib) return 'builtin';
    if (info.isRelative) return 'relative';

    // Check if it's a known dependency
    if (this.config.dependencies[info.crateName] ||
        this.config.devDependencies[info.crateName]) {
      return 'package';
    }

    // Check common crates
    if (RUST_COMMON_CRATES.has(info.crateName)) {
      return 'package';
    }

    return 'unknown';
  }

  /**
   * Check if a crate is a standard library crate (implements BaseImportResolver)
   */
  isBuiltinModule(moduleName: string): boolean {
    // Extract crate name from path
    const crateName = moduleName.split('::')[0];
    return RUST_STD_CRATES.has(crateName);
  }

  /**
   * Resolve an import to an absolute file path (implements BaseImportResolver)
   */
  async resolveImport(importPath: string, currentFile: string): Promise<string | null> {
    const info = this.parseUseDeclaration(importPath);
    const pathToResolve = info?.fullPath || importPath;

    // Skip stdlib
    if (this.isBuiltinModule(pathToResolve)) {
      return null;
    }

    // Handle relative paths
    const segments = pathToResolve.split('::');
    const firstSegment = segments[0];

    if (firstSegment === 'crate') {
      // Resolve from crate root (src/)
      return this.resolveFromCrateRoot(segments.slice(1));
    }

    if (firstSegment === 'self') {
      // Resolve from current module
      return this.resolveFromCurrentModule(segments.slice(1), currentFile);
    }

    if (firstSegment === 'super') {
      // Resolve from parent module
      return this.resolveFromParentModule(segments.slice(1), currentFile);
    }

    // External crate - not resolvable to local file
    return null;
  }

  /**
   * Resolve path from crate root (src/)
   */
  private async resolveFromCrateRoot(segments: string[]): Promise<string | null> {
    const srcDir = path.join(this.projectRoot, 'src');
    return this.resolveModulePath(srcDir, segments);
  }

  /**
   * Resolve path from current module directory
   */
  private async resolveFromCurrentModule(segments: string[], currentFile: string): Promise<string | null> {
    const currentDir = path.dirname(currentFile);
    return this.resolveModulePath(currentDir, segments);
  }

  /**
   * Resolve path from parent module directory
   */
  private async resolveFromParentModule(segments: string[], currentFile: string): Promise<string | null> {
    const parentDir = path.dirname(path.dirname(currentFile));
    return this.resolveModulePath(parentDir, segments);
  }

  /**
   * Resolve module path to file
   */
  private async resolveModulePath(baseDir: string, segments: string[]): Promise<string | null> {
    if (segments.length === 0) return null;

    let currentPath = baseDir;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isLast = i === segments.length - 1;

      if (isLast) {
        // Try as file: segment.rs
        const filePath = path.join(currentPath, `${segment}.rs`);
        if (await this.fileExists(filePath)) {
          return filePath;
        }

        // Try as directory with mod.rs: segment/mod.rs
        const modPath = path.join(currentPath, segment, 'mod.rs');
        if (await this.fileExists(modPath)) {
          return modPath;
        }
      } else {
        // Intermediate segment - must be a directory
        const dirPath = path.join(currentPath, segment);
        if (await this.directoryExists(dirPath)) {
          currentPath = dirPath;
        } else {
          return null;
        }
      }
    }

    return null;
  }

  /**
   * Resolve an import with full details (implements BaseImportResolver)
   */
  async resolveImportFull(importPath: string, currentFile: string): Promise<ResolvedImport> {
    const absolutePath = await this.resolveImport(importPath, currentFile);
    const info = this.parseUseDeclaration(importPath);

    return {
      absolutePath,
      isLocal: this.isLocalImport(importPath),
      packageName: info?.isRelative ? undefined : info?.crateName,
      originalSpecifier: importPath,
    };
  }

  /**
   * Get the relative path from project root (implements BaseImportResolver)
   */
  getRelativePath(absolutePath: string): string {
    return path.relative(this.projectRoot, absolutePath);
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(filePath);
      return stat.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Check if a directory exists
   */
  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stat = await fs.stat(dirPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }
}
