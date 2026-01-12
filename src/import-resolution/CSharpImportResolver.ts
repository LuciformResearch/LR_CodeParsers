/**
 * C# Import Resolver
 *
 * Implements BaseImportResolver for C# projects.
 *
 * Handles:
 * - using directives (using System.Collections.Generic;)
 * - .csproj files for project configuration
 * - NuGet package references
 * - Project references
 * - .NET standard library namespaces
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { BaseImportResolver, ImportType, ResolvedImport, CSharpConfig } from './types.js';

/** .NET BCL (Base Class Library) namespaces */
const DOTNET_BCL_NAMESPACES = new Set([
  // System namespaces
  'System', 'System.Collections', 'System.Collections.Generic', 'System.Collections.Concurrent',
  'System.Collections.Immutable', 'System.Collections.ObjectModel', 'System.Collections.Specialized',
  'System.ComponentModel', 'System.ComponentModel.DataAnnotations',
  'System.Configuration', 'System.Data', 'System.Diagnostics',
  'System.Drawing', 'System.Dynamic', 'System.Globalization',
  'System.IO', 'System.IO.Compression', 'System.IO.Pipes',
  'System.Linq', 'System.Linq.Expressions',
  'System.Net', 'System.Net.Http', 'System.Net.Sockets', 'System.Net.WebSockets',
  'System.Numerics', 'System.Reflection', 'System.Resources',
  'System.Runtime', 'System.Runtime.CompilerServices', 'System.Runtime.InteropServices',
  'System.Runtime.Serialization', 'System.Security', 'System.Security.Cryptography',
  'System.Text', 'System.Text.Json', 'System.Text.RegularExpressions',
  'System.Threading', 'System.Threading.Tasks', 'System.Threading.Channels',
  'System.Timers', 'System.Transactions', 'System.Web', 'System.Xml',
  'System.Xml.Linq', 'System.Xml.Serialization',
  // Microsoft namespaces
  'Microsoft.Extensions', 'Microsoft.Extensions.DependencyInjection',
  'Microsoft.Extensions.Logging', 'Microsoft.Extensions.Configuration',
  'Microsoft.Extensions.Hosting', 'Microsoft.Extensions.Options',
  'Microsoft.AspNetCore', 'Microsoft.AspNetCore.Mvc', 'Microsoft.AspNetCore.Http',
  'Microsoft.EntityFrameworkCore', 'Microsoft.Data',
]);

/** Common NuGet packages (not BCL but very common) */
const COMMON_NUGET_PACKAGES = new Set([
  'Newtonsoft.Json', 'AutoMapper', 'FluentValidation', 'MediatR',
  'Serilog', 'NLog', 'log4net', 'Polly', 'Dapper', 'Moq', 'xunit',
  'NUnit', 'FluentAssertions', 'Bogus', 'Swashbuckle', 'Hangfire',
]);

/**
 * Parse using directive
 */
interface UsingInfo {
  namespace: string;
  alias?: string;
  isStatic: boolean;
}

export class CSharpImportResolver implements BaseImportResolver {
  protected projectRoot: string;
  protected config: CSharpConfig = {
    rootNamespace: '',
    assemblyName: '',
    targetFramework: '',
    packageReferences: {},
    projectReferences: [],
  };

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
  }

  /**
   * Load configuration from .csproj (implements BaseImportResolver)
   */
  async loadConfig(projectRoot: string, configPath?: string): Promise<void> {
    this.projectRoot = projectRoot;

    // Find .csproj file
    let csprojPath = configPath;
    if (!csprojPath) {
      csprojPath = await this.findCsprojFile(projectRoot);
    }

    if (csprojPath) {
      try {
        const content = await fs.readFile(csprojPath, 'utf8');
        this.parseCsproj(content);
      } catch {
        console.warn('Failed to parse .csproj file');
      }
    }
  }

  /**
   * Find .csproj file in project root
   */
  private async findCsprojFile(dir: string): Promise<string | null> {
    try {
      const files = await fs.readdir(dir);
      const csproj = files.find(f => f.endsWith('.csproj'));
      return csproj ? path.join(dir, csproj) : null;
    } catch {
      return null;
    }
  }

  /**
   * Parse .csproj XML to extract configuration
   * Note: This is a simple regex-based parser, not a full XML parser
   */
  private parseCsproj(content: string): void {
    // Extract RootNamespace
    const rootNsMatch = content.match(/<RootNamespace>([^<]+)<\/RootNamespace>/);
    if (rootNsMatch) {
      this.config.rootNamespace = rootNsMatch[1];
    }

    // Extract AssemblyName
    const assemblyMatch = content.match(/<AssemblyName>([^<]+)<\/AssemblyName>/);
    if (assemblyMatch) {
      this.config.assemblyName = assemblyMatch[1];
    }

    // Extract TargetFramework
    const tfmMatch = content.match(/<TargetFramework>([^<]+)<\/TargetFramework>/);
    if (tfmMatch) {
      this.config.targetFramework = tfmMatch[1];
    }

    // Extract PackageReferences
    const packageRefs = content.matchAll(/<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"/g);
    for (const match of packageRefs) {
      this.config.packageReferences[match[1]] = match[2];
    }

    // Also handle self-closing format
    const packageRefs2 = content.matchAll(/<PackageReference\s+Include="([^"]+)"\s*\/>/g);
    for (const match of packageRefs2) {
      this.config.packageReferences[match[1]] = '*';
    }

    // Extract ProjectReferences
    const projectRefs = content.matchAll(/<ProjectReference\s+Include="([^"]+)"/g);
    for (const match of projectRefs) {
      this.config.projectReferences.push(match[1]);
    }
  }

  /**
   * Parse a using directive
   */
  parseUsingDirective(usingLine: string): UsingInfo | null {
    // Match: using static Type; or using Alias = Namespace; or using Namespace;
    const staticMatch = usingLine.match(/using\s+static\s+([^;]+);?/);
    if (staticMatch) {
      return {
        namespace: staticMatch[1].trim(),
        isStatic: true,
      };
    }

    const aliasMatch = usingLine.match(/using\s+(\w+)\s*=\s*([^;]+);?/);
    if (aliasMatch) {
      return {
        namespace: aliasMatch[2].trim(),
        alias: aliasMatch[1].trim(),
        isStatic: false,
      };
    }

    const simpleMatch = usingLine.match(/using\s+([^;]+);?/);
    if (simpleMatch) {
      return {
        namespace: simpleMatch[1].trim(),
        isStatic: false,
      };
    }

    return null;
  }

  /**
   * Check if a namespace is from the BCL
   */
  private isBclNamespace(namespace: string): boolean {
    // Check exact match
    if (DOTNET_BCL_NAMESPACES.has(namespace)) {
      return true;
    }

    // Check if it starts with a known BCL root
    const parts = namespace.split('.');
    if (parts[0] === 'System' || parts[0] === 'Microsoft') {
      return true;
    }

    return false;
  }

  /**
   * Check if an import is local (implements BaseImportResolver)
   */
  isLocalImport(importPath: string): boolean {
    const info = this.parseUsingDirective(importPath);
    const namespace = info?.namespace || importPath;

    // Check if it starts with the project's root namespace
    if (this.config.rootNamespace && namespace.startsWith(this.config.rootNamespace)) {
      return true;
    }

    // Check if it's a project reference
    for (const projRef of this.config.projectReferences) {
      const refName = path.basename(projRef, '.csproj');
      if (namespace.startsWith(refName)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Classify the type of import (implements BaseImportResolver)
   */
  getImportType(importPath: string): ImportType {
    const info = this.parseUsingDirective(importPath);
    const namespace = info?.namespace || importPath;

    if (this.isBclNamespace(namespace)) {
      return 'builtin';
    }

    if (this.isLocalImport(namespace)) {
      return 'relative';
    }

    // Check if it's a known NuGet package
    const rootPackage = namespace.split('.')[0];
    if (this.config.packageReferences[rootPackage] || this.config.packageReferences[namespace]) {
      return 'package';
    }

    // Check common NuGet packages
    if (COMMON_NUGET_PACKAGES.has(rootPackage) || COMMON_NUGET_PACKAGES.has(namespace)) {
      return 'package';
    }

    return 'unknown';
  }

  /**
   * Check if a namespace is a built-in (.NET BCL) namespace (implements BaseImportResolver)
   */
  isBuiltinModule(moduleName: string): boolean {
    return this.isBclNamespace(moduleName);
  }

  /**
   * Resolve an import to an absolute file path (implements BaseImportResolver)
   */
  async resolveImport(importPath: string, currentFile: string): Promise<string | null> {
    const info = this.parseUsingDirective(importPath);
    const namespace = info?.namespace || importPath;

    // Skip BCL namespaces
    if (this.isBuiltinModule(namespace)) {
      return null;
    }

    // Skip external packages
    if (this.getImportType(namespace) === 'package') {
      return null;
    }

    // Try to resolve local namespace to file
    return this.resolveLocalNamespace(namespace);
  }

  /**
   * Resolve a local namespace to a file path
   */
  private async resolveLocalNamespace(namespace: string): Promise<string | null> {
    // Convert namespace to potential file paths
    // e.g., MyApp.Services.UserService -> MyApp/Services/UserService.cs

    const parts = namespace.split('.');

    // Try different combinations
    for (let i = parts.length; i > 0; i--) {
      const relativePath = parts.slice(0, i).join('/');

      // Try as a .cs file
      const filePath = path.join(this.projectRoot, `${relativePath}.cs`);
      if (await this.fileExists(filePath)) {
        return filePath;
      }

      // Try in common source directories
      for (const srcDir of ['src', 'Source', 'Sources', '']) {
        const srcPath = path.join(this.projectRoot, srcDir, `${relativePath}.cs`);
        if (await this.fileExists(srcPath)) {
          return srcPath;
        }
      }
    }

    // Try to find by searching for files with matching namespace
    // This is expensive so we skip it for now

    return null;
  }

  /**
   * Resolve an import with full details (implements BaseImportResolver)
   */
  async resolveImportFull(importPath: string, currentFile: string): Promise<ResolvedImport> {
    const absolutePath = await this.resolveImport(importPath, currentFile);
    const info = this.parseUsingDirective(importPath);
    const namespace = info?.namespace || importPath;

    return {
      absolutePath,
      isLocal: this.isLocalImport(namespace),
      packageName: this.isLocalImport(namespace) ? undefined : namespace.split('.')[0],
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
