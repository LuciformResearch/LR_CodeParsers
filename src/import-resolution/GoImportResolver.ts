/**
 * Go Import Resolver
 *
 * Implements BaseImportResolver for Go projects.
 *
 * Handles:
 * - import declarations
 * - go.mod for module name and dependencies
 * - Standard library packages
 * - Local packages relative to module root
 * - vendor/ directory
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { BaseImportResolver, ImportType, ResolvedImport, GoConfig } from './types.js';

/** Go standard library packages (common ones) */
const GO_STDLIB_PACKAGES = new Set([
  // Core
  'fmt', 'io', 'os', 'bufio', 'bytes', 'strings', 'strconv',
  'errors', 'log', 'flag', 'context', 'time', 'math', 'sort',
  'sync', 'atomic', 'runtime', 'reflect', 'unsafe',
  // IO and files
  'io/ioutil', 'io/fs', 'os/exec', 'os/signal', 'path', 'path/filepath',
  // Net and HTTP
  'net', 'net/http', 'net/url', 'net/http/httptest', 'net/http/httputil',
  // Encoding
  'encoding', 'encoding/json', 'encoding/xml', 'encoding/base64',
  'encoding/binary', 'encoding/csv', 'encoding/gob', 'encoding/hex',
  // Crypto
  'crypto', 'crypto/md5', 'crypto/sha1', 'crypto/sha256', 'crypto/sha512',
  'crypto/rand', 'crypto/tls', 'crypto/x509', 'crypto/aes', 'crypto/cipher',
  // Text and regex
  'text/template', 'html/template', 'regexp',
  // Data structures
  'container/heap', 'container/list', 'container/ring',
  // Testing
  'testing', 'testing/quick', 'testing/iotest',
  // Misc
  'compress/gzip', 'compress/zlib', 'archive/zip', 'archive/tar',
  'database/sql', 'database/sql/driver',
  'embed', 'go/ast', 'go/parser', 'go/token', 'go/format',
  'unicode', 'unicode/utf8', 'unicode/utf16',
  'image', 'image/png', 'image/jpeg', 'image/gif',
  'debug/dwarf', 'debug/elf', 'debug/pe',
]);

/**
 * Parse import declaration
 */
interface ImportInfo {
  path: string;
  alias?: string;
  isStdlib: boolean;
}

export class GoImportResolver implements BaseImportResolver {
  protected projectRoot: string;
  protected config: GoConfig = {
    moduleName: '',
    goVersion: '',
    dependencies: {},
  };

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  /**
   * Load configuration from go.mod (implements BaseImportResolver)
   */
  async loadConfig(projectRoot: string, configPath?: string): Promise<void> {
    this.projectRoot = projectRoot;

    const goModPath = configPath || path.join(projectRoot, 'go.mod');

    try {
      const content = await fs.readFile(goModPath, 'utf8');
      this.parseGoMod(content);
    } catch {
      console.warn('No go.mod found, using defaults');
    }
  }

  /**
   * Parse go.mod to extract module name and dependencies
   */
  private parseGoMod(content: string): void {
    const lines = content.split('\n');
    let inRequireBlock = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Module name
      if (trimmed.startsWith('module ')) {
        this.config.moduleName = trimmed.replace('module ', '').trim();
      }

      // Go version
      if (trimmed.startsWith('go ')) {
        this.config.goVersion = trimmed.replace('go ', '').trim();
      }

      // Require block
      if (trimmed === 'require (') {
        inRequireBlock = true;
        continue;
      }
      if (trimmed === ')') {
        inRequireBlock = false;
        continue;
      }

      // Single require or in require block
      if (trimmed.startsWith('require ') || inRequireBlock) {
        const depLine = trimmed.replace('require ', '');
        const match = depLine.match(/^([^\s]+)\s+([^\s]+)/);
        if (match) {
          this.config.dependencies[match[1]] = match[2];
        }
      }
    }
  }

  /**
   * Parse an import declaration
   */
  parseImport(importLine: string): ImportInfo | null {
    // Match: import "path" or import alias "path" or just "path"
    let match = importLine.match(/import\s+(?:(\w+)\s+)?"([^"]+)"/);
    if (!match) {
      // Try just the path in quotes
      match = importLine.match(/"([^"]+)"/);
      if (match) {
        return {
          path: match[1],
          isStdlib: this.isStdlibPackage(match[1]),
        };
      }
      return null;
    }

    return {
      path: match[2],
      alias: match[1],
      isStdlib: this.isStdlibPackage(match[2]),
    };
  }

  /**
   * Check if a package path is from the standard library
   */
  private isStdlibPackage(pkgPath: string): boolean {
    // Standard library packages don't contain dots in first segment
    const firstSegment = pkgPath.split('/')[0];
    if (!firstSegment.includes('.')) {
      // Check against known stdlib packages
      return GO_STDLIB_PACKAGES.has(pkgPath) ||
             GO_STDLIB_PACKAGES.has(firstSegment);
    }
    return false;
  }

  /**
   * Check if an import is local (implements BaseImportResolver)
   */
  isLocalImport(importPath: string): boolean {
    const info = this.parseImport(importPath);
    const pkgPath = info?.path || importPath;

    // Local if it starts with the module name
    if (this.config.moduleName && pkgPath.startsWith(this.config.moduleName)) {
      return true;
    }

    // Relative imports (rare in Go but possible)
    if (pkgPath.startsWith('./') || pkgPath.startsWith('../')) {
      return true;
    }

    return false;
  }

  /**
   * Classify the type of import (implements BaseImportResolver)
   */
  getImportType(importPath: string): ImportType {
    const info = this.parseImport(importPath);
    const pkgPath = info?.path || importPath;

    if (info?.isStdlib || this.isStdlibPackage(pkgPath)) {
      return 'builtin';
    }

    if (this.isLocalImport(pkgPath)) {
      return 'relative';
    }

    // Check if it's a known dependency
    const rootPkg = this.getRootPackage(pkgPath);
    if (this.config.dependencies[rootPkg]) {
      return 'package';
    }

    // External package (not stdlib, not local)
    if (pkgPath.includes('.')) {
      return 'package';
    }

    return 'unknown';
  }

  /**
   * Get the root package from a full import path
   * e.g., "github.com/user/repo/pkg" -> "github.com/user/repo"
   */
  private getRootPackage(pkgPath: string): string {
    const parts = pkgPath.split('/');

    // GitHub/GitLab/etc format: domain/user/repo
    if (parts[0].includes('.') && parts.length >= 3) {
      return parts.slice(0, 3).join('/');
    }

    return pkgPath;
  }

  /**
   * Check if a package is a standard library package (implements BaseImportResolver)
   */
  isBuiltinModule(moduleName: string): boolean {
    return this.isStdlibPackage(moduleName);
  }

  /**
   * Resolve an import to an absolute file path (implements BaseImportResolver)
   */
  async resolveImport(importPath: string, currentFile: string): Promise<string | null> {
    const info = this.parseImport(importPath);
    const pkgPath = info?.path || importPath;

    // Skip standard library
    if (this.isBuiltinModule(pkgPath)) {
      return null;
    }

    // Handle local module imports
    if (this.config.moduleName && pkgPath.startsWith(this.config.moduleName)) {
      const relativePath = pkgPath.replace(this.config.moduleName, '').replace(/^\//, '');
      return this.resolveLocalPackage(relativePath);
    }

    // Handle relative imports
    if (pkgPath.startsWith('./') || pkgPath.startsWith('../')) {
      const currentDir = path.dirname(currentFile);
      return this.resolveRelativePackage(currentDir, pkgPath);
    }

    // Check vendor directory
    const vendorPath = await this.resolveVendorPackage(pkgPath);
    if (vendorPath) {
      return vendorPath;
    }

    // External package - not resolvable to local file
    return null;
  }

  /**
   * Resolve a local package (within the same module)
   */
  private async resolveLocalPackage(relativePath: string): Promise<string | null> {
    const pkgDir = path.join(this.projectRoot, relativePath);

    // Check if directory exists
    if (await this.directoryExists(pkgDir)) {
      // Return first .go file (excluding test files)
      return this.findMainGoFile(pkgDir);
    }

    return null;
  }

  /**
   * Resolve a relative package
   */
  private async resolveRelativePackage(currentDir: string, relativePath: string): Promise<string | null> {
    const pkgDir = path.resolve(currentDir, relativePath);

    if (await this.directoryExists(pkgDir)) {
      return this.findMainGoFile(pkgDir);
    }

    return null;
  }

  /**
   * Resolve a package from vendor directory
   */
  private async resolveVendorPackage(pkgPath: string): Promise<string | null> {
    const vendorDir = path.join(this.projectRoot, 'vendor', pkgPath);

    if (await this.directoryExists(vendorDir)) {
      return this.findMainGoFile(vendorDir);
    }

    return null;
  }

  /**
   * Find the main .go file in a package directory
   */
  private async findMainGoFile(pkgDir: string): Promise<string | null> {
    try {
      const files = await fs.readdir(pkgDir);
      const goFiles = files.filter(f =>
        f.endsWith('.go') && !f.endsWith('_test.go')
      );

      if (goFiles.length > 0) {
        // Prefer file with same name as directory
        const dirName = path.basename(pkgDir);
        const mainFile = goFiles.find(f => f === `${dirName}.go`);

        return path.join(pkgDir, mainFile || goFiles[0]);
      }
    } catch {
      // Directory read failed
    }

    return null;
  }

  /**
   * Resolve an import with full details (implements BaseImportResolver)
   */
  async resolveImportFull(importPath: string, currentFile: string): Promise<ResolvedImport> {
    const absolutePath = await this.resolveImport(importPath, currentFile);
    const info = this.parseImport(importPath);
    const pkgPath = info?.path || importPath;

    return {
      absolutePath,
      isLocal: this.isLocalImport(pkgPath),
      packageName: this.isLocalImport(pkgPath) ? undefined : this.getRootPackage(pkgPath),
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
