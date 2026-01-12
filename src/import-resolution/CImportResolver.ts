/**
 * C/C++ Import Resolver
 *
 * Implements BaseImportResolver for C and C++ projects.
 *
 * Handles:
 * - System includes: #include <stdio.h>
 * - Local includes: #include "myheader.h"
 * - Include paths from compile_commands.json or manual config
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { isLocalPath } from './path-utils.js';
import type { BaseImportResolver, ImportType, ResolvedImport, CConfig } from './types.js';

/** Standard C library headers */
const C_STDLIB_HEADERS = new Set([
  'assert.h', 'complex.h', 'ctype.h', 'errno.h', 'fenv.h', 'float.h',
  'inttypes.h', 'iso646.h', 'limits.h', 'locale.h', 'math.h', 'setjmp.h',
  'signal.h', 'stdalign.h', 'stdarg.h', 'stdatomic.h', 'stdbool.h',
  'stddef.h', 'stdint.h', 'stdio.h', 'stdlib.h', 'stdnoreturn.h',
  'string.h', 'tgmath.h', 'threads.h', 'time.h', 'uchar.h', 'wchar.h', 'wctype.h'
]);

/** Standard C++ library headers (without .h extension) */
const CPP_STDLIB_HEADERS = new Set([
  'algorithm', 'any', 'array', 'atomic', 'bitset', 'cassert', 'cctype',
  'cerrno', 'cfenv', 'cfloat', 'chrono', 'cinttypes', 'climits', 'clocale',
  'cmath', 'codecvt', 'complex', 'condition_variable', 'csetjmp', 'csignal',
  'cstdarg', 'cstddef', 'cstdint', 'cstdio', 'cstdlib', 'cstring', 'ctime',
  'cuchar', 'cwchar', 'cwctype', 'deque', 'exception', 'execution',
  'filesystem', 'forward_list', 'fstream', 'functional', 'future',
  'initializer_list', 'iomanip', 'ios', 'iosfwd', 'iostream', 'istream',
  'iterator', 'limits', 'list', 'locale', 'map', 'memory', 'memory_resource',
  'mutex', 'new', 'numeric', 'optional', 'ostream', 'queue', 'random',
  'ratio', 'regex', 'scoped_allocator', 'set', 'shared_mutex', 'span',
  'sstream', 'stack', 'stdexcept', 'streambuf', 'string', 'string_view',
  'syncstream', 'system_error', 'thread', 'tuple', 'type_traits', 'typeindex',
  'typeinfo', 'unordered_map', 'unordered_set', 'utility', 'valarray',
  'variant', 'vector', 'version'
]);

/**
 * Parse #include directive to extract path and type
 */
interface IncludeInfo {
  path: string;
  isSystem: boolean; // <...> vs "..."
}

export class CImportResolver implements BaseImportResolver {
  protected projectRoot: string;
  protected config: CConfig = {
    includePaths: [],
    systemIncludePaths: [],
    defines: {}
  };

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  /**
   * Load configuration (implements BaseImportResolver)
   */
  async loadConfig(projectRoot: string, configPath?: string): Promise<void> {
    this.projectRoot = projectRoot;

    // Try to load compile_commands.json
    const compileCommandsPath = configPath || path.join(projectRoot, 'compile_commands.json');

    try {
      const content = await fs.readFile(compileCommandsPath, 'utf8');
      const commands = JSON.parse(content);
      this.parseCompileCommands(commands);
    } catch {
      // No compile_commands.json, use defaults
      console.warn('No compile_commands.json found, using default include paths');
      this.config.includePaths = [projectRoot];
    }
  }

  /**
   * Parse compile_commands.json to extract include paths
   */
  private parseCompileCommands(commands: any[]): void {
    const includePaths = new Set<string>();

    for (const cmd of commands) {
      const args = cmd.command?.split(' ') || cmd.arguments || [];

      for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        // Handle -I/path or -I /path
        if (arg.startsWith('-I')) {
          const includePath = arg.length > 2 ? arg.slice(2) : args[i + 1];
          if (includePath && !includePath.startsWith('-')) {
            const fullPath = path.isAbsolute(includePath)
              ? includePath
              : path.resolve(cmd.directory || this.projectRoot, includePath);
            includePaths.add(fullPath);
          }
        }
      }
    }

    this.config.includePaths = [...includePaths];
  }

  /**
   * Add include paths manually
   */
  addIncludePath(includePath: string): void {
    const fullPath = path.isAbsolute(includePath)
      ? includePath
      : path.resolve(this.projectRoot, includePath);

    if (!this.config.includePaths.includes(fullPath)) {
      this.config.includePaths.push(fullPath);
    }
  }

  /**
   * Parse #include directive
   */
  parseInclude(includeLine: string): IncludeInfo | null {
    // Match #include <...> or #include "..."
    const systemMatch = includeLine.match(/#include\s*<([^>]+)>/);
    if (systemMatch) {
      return { path: systemMatch[1], isSystem: true };
    }

    const localMatch = includeLine.match(/#include\s*"([^"]+)"/);
    if (localMatch) {
      return { path: localMatch[1], isSystem: false };
    }

    return null;
  }

  /**
   * Check if an import is local (implements BaseImportResolver)
   */
  isLocalImport(importPath: string): boolean {
    const info = this.parseInclude(importPath);
    if (!info) {
      // Treat as local include path directly
      return !this.isBuiltinModule(importPath);
    }

    // System includes with <> are typically not local
    if (info.isSystem) {
      return !this.isBuiltinModule(info.path);
    }

    // Local includes with "" are local
    return true;
  }

  /**
   * Classify the type of import (implements BaseImportResolver)
   */
  getImportType(importPath: string): ImportType {
    const info = this.parseInclude(importPath);
    const headerPath = info?.path || importPath;

    if (this.isBuiltinModule(headerPath)) {
      return 'builtin';
    }

    if (info?.isSystem) {
      return 'package'; // System headers from external libraries
    }

    if (headerPath.startsWith('./') || headerPath.startsWith('../')) {
      return 'relative';
    }

    if (path.isAbsolute(headerPath)) {
      return 'absolute';
    }

    return 'relative'; // Default for local includes
  }

  /**
   * Check if a header is a standard library header (implements BaseImportResolver)
   */
  isBuiltinModule(moduleName: string): boolean {
    // Remove any path prefix
    const basename = path.basename(moduleName);
    return C_STDLIB_HEADERS.has(basename) || CPP_STDLIB_HEADERS.has(basename);
  }

  /**
   * Resolve an import to an absolute file path (implements BaseImportResolver)
   */
  async resolveImport(importPath: string, currentFile: string): Promise<string | null> {
    const info = this.parseInclude(importPath);
    const headerPath = info?.path || importPath;

    // Skip standard library headers
    if (this.isBuiltinModule(headerPath)) {
      return null;
    }

    // For local includes ("..."), first try relative to current file
    if (!info?.isSystem) {
      const currentDir = path.dirname(currentFile);
      const relativePath = path.resolve(currentDir, headerPath);

      if (await this.fileExists(relativePath)) {
        return relativePath;
      }
    }

    // Search in include paths
    for (const includePath of this.config.includePaths) {
      const fullPath = path.resolve(includePath, headerPath);

      if (await this.fileExists(fullPath)) {
        return fullPath;
      }
    }

    return null;
  }

  /**
   * Resolve an import with full details (implements BaseImportResolver)
   */
  async resolveImportFull(importPath: string, currentFile: string): Promise<ResolvedImport> {
    const absolutePath = await this.resolveImport(importPath, currentFile);
    const info = this.parseInclude(importPath);

    return {
      absolutePath,
      isLocal: this.isLocalImport(importPath),
      packageName: info?.isSystem ? info.path : undefined,
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
}
