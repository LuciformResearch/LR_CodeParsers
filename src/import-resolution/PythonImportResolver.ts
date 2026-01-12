/**
 * Python Import Resolver
 *
 * Implements BaseImportResolver for Python projects.
 *
 * Handles:
 * - Relative imports (from .foo import x, from ..bar import y)
 * - Absolute imports (from models import User)
 * - Package imports (import os, from typing import List)
 * - pyproject.toml and setup.py configuration
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { BaseImportResolver, ImportType, ResolvedImport, PythonConfig } from './types.js';


export class PythonImportResolver implements BaseImportResolver {
  private config: PythonConfig | null = null;
  protected projectRoot: string;
  private srcDirs: string[] = [];

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  /**
   * Load configuration (implements BaseImportResolver)
   */
  async loadConfig(projectRoot: string, configPath?: string): Promise<void> {
    this.projectRoot = projectRoot;
    await this.loadPythonConfig(configPath);
  }

  /**
   * Load Python project configuration from pyproject.toml or setup.py
   */
  async loadPythonConfig(configPath?: string): Promise<void> {
    // Try pyproject.toml first
    const pyprojectPath = configPath || path.join(this.projectRoot, 'pyproject.toml');

    try {
      const content = await fs.readFile(pyprojectPath, 'utf8');
      this.config = this.parsePyprojectToml(content);
      this.srcDirs = this.config.srcDirs;
    } catch {
      // No pyproject.toml, try to detect src directories
      this.srcDirs = await this.detectSrcDirs();
      this.config = {
        pythonPath: [],
        srcDirs: this.srcDirs,
      };
    }
  }

  /**
   * Parse pyproject.toml to extract Python configuration
   */
  private parsePyprojectToml(content: string): PythonConfig {
    const config: PythonConfig = {
      pythonPath: [],
      srcDirs: [],
    };

    // Simple TOML parsing for relevant fields
    // Look for [tool.setuptools.packages.find] or [tool.poetry.packages]
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Look for package-dir or src layout
      if (line.includes('where') || line.includes('src')) {
        const match = line.match(/["']([^"']+)["']/);
        if (match && match[1]) {
          const srcDir = path.join(this.projectRoot, match[1]);
          config.srcDirs.push(srcDir);
        }
      }
    }

    // Default: check for common Python project structures
    if (config.srcDirs.length === 0) {
      config.srcDirs = [this.projectRoot];
    }

    return config;
  }

  /**
   * Detect common Python source directories
   */
  private async detectSrcDirs(): Promise<string[]> {
    const dirs: string[] = [];

    // Common Python project structures
    const candidates = [
      'src',           // src layout
      'lib',           // library layout
      '.',             // flat layout
    ];

    for (const candidate of candidates) {
      const dirPath = path.join(this.projectRoot, candidate);
      try {
        const stat = await fs.stat(dirPath);
        if (stat.isDirectory()) {
          dirs.push(dirPath);
        }
      } catch {
        // Directory doesn't exist
      }
    }

    // Always include project root as fallback
    if (!dirs.includes(this.projectRoot)) {
      dirs.push(this.projectRoot);
    }

    return dirs;
  }

  /**
   * Check if an import is local to the project (implements BaseImportResolver)
   *
   * For Python, we use an optimistic approach: mark everything as potentially local
   * and let the actual file resolution determine if it exists.
   * This avoids hardcoding stdlib modules.
   */
  isLocalImport(importPath: string): boolean {
    // Optimistic: try to resolve everything, let file system determine locality
    return true;
  }

  /**
   * Classify the type of import (implements BaseImportResolver)
   */
  getImportType(importPath: string): ImportType {
    // Relative imports
    if (importPath.startsWith('.')) {
      return 'relative';
    }

    // Absolute path (rare in Python)
    if (path.isAbsolute(importPath)) {
      return 'absolute';
    }

    // For Python, we can't easily distinguish stdlib from local without resolution
    return 'unknown';
  }

  /**
   * Check if a module is a Python built-in (implements BaseImportResolver)
   *
   * We don't hardcode stdlib modules. Instead, we let resolution fail
   * for modules that don't exist in the project.
   */
  isBuiltinModule(_moduleName: string): boolean {
    // Don't hardcode - let resolution determine if file exists
    return false;
  }

  /**
   * Resolve an import with full details (implements BaseImportResolver)
   */
  async resolveImportFull(importPath: string, currentFile: string): Promise<ResolvedImport> {
    const absolutePath = await this.resolveImport(importPath, currentFile);
    const importType = this.getImportType(importPath);

    return {
      absolutePath,
      isLocal: this.isLocalImport(importPath) || absolutePath !== null,
      packageName: importType === 'package' ? importPath.split('.')[0] : undefined,
      originalSpecifier: importPath,
    };
  }

  /**
   * Resolve an import specifier to an absolute file path
   *
   * @param importPath - The import specifier (e.g., "models", ".models", "..base")
   * @param currentFile - The absolute path of the file containing the import
   * @returns The absolute path to the resolved source file, or null if not found
   */
  async resolveImport(importPath: string, currentFile: string): Promise<string | null> {
    // Handle relative imports
    if (importPath.startsWith('.')) {
      return this.resolveRelativeImport(importPath, currentFile);
    }

    // Handle absolute imports
    return this.resolveAbsoluteImport(importPath);
  }

  /**
   * Resolve a relative import (from .foo import x, from ..bar import y)
   */
  private async resolveRelativeImport(importPath: string, currentFile: string): Promise<string | null> {
    const currentDir = path.dirname(currentFile);

    // Count leading dots to determine relative depth
    let dots = 0;
    for (const char of importPath) {
      if (char === '.') {
        dots++;
      } else {
        break;
      }
    }

    // Get the module name after the dots
    const moduleName = importPath.substring(dots);

    // Calculate the base directory
    let baseDir = currentDir;
    for (let i = 1; i < dots; i++) {
      baseDir = path.dirname(baseDir);
    }

    // Convert module path to file path
    const modulePath = moduleName.replace(/\./g, path.sep);
    const candidates = await this.getCandidatePaths(path.join(baseDir, modulePath));

    for (const candidate of candidates) {
      if (await this.fileExists(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Resolve an absolute import (import foo, from bar import x)
   */
  private async resolveAbsoluteImport(importPath: string): Promise<string | null> {
    // Convert module path to file path
    const modulePath = importPath.replace(/\./g, path.sep);

    // Search in all source directories
    for (const srcDir of this.srcDirs) {
      const candidates = await this.getCandidatePaths(path.join(srcDir, modulePath));

      for (const candidate of candidates) {
        if (await this.fileExists(candidate)) {
          return candidate;
        }
      }
    }

    return null;
  }

  /**
   * Get all candidate file paths for a given import
   * Handles Python's module/package resolution
   */
  private async getCandidatePaths(basePath: string): Promise<string[]> {
    const candidates: string[] = [];

    // Try as a module file
    candidates.push(`${basePath}.py`);

    // Try as a package (directory with __init__.py)
    candidates.push(path.join(basePath, '__init__.py'));

    // Try as-is (might already have .py extension)
    if (basePath.endsWith('.py')) {
      candidates.push(basePath);
    }

    return candidates;
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
   * Get relative path from project root (implements BaseImportResolver)
   */
  getRelativePath(absolutePath: string): string {
    return path.relative(this.projectRoot, absolutePath);
  }
}
