/**
 * TypeScript Language Parser
 *
 * Adapter that wraps ScopeExtractionParser
 * to implement the universal LanguageParser interface.
 */

import {
  BaseLanguageParser,
  type FileAnalysis as UniversalFileAnalysis,
  type UniversalScope,
  type UniversalImport,
  type UniversalExport,
  type Language,
  type ParserCapabilities
} from '../base/index.js';

import {
  ScopeExtractionParser,
  type ScopeFileAnalysis,
  type ScopeInfo,
  type ImportReference
} from '../scope-extraction/index.js';

export class TypeScriptLanguageParser extends BaseLanguageParser {
  readonly language: Language = 'typescript';
  readonly extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'];
  readonly capabilities: ParserCapabilities = {
    scopeExtraction: true,
    importResolution: true,
    typeInference: true,
    crossFileReferences: true
  };

  private parser: ScopeExtractionParser;

  constructor() {
    super();
    this.parser = new ScopeExtractionParser();
  }

  async initialize(): Promise<void> {
    await this.parser.initialize();
  }

  async parseFile(filePath: string, content: string): Promise<UniversalFileAnalysis> {
    // Use the new ScopeExtractionParser
    const scopeAnalysis: ScopeFileAnalysis = await this.parser.parseFile(filePath, content);

    // Convert to universal format
    const universalScopes: UniversalScope[] = scopeAnalysis.scopes.map(scope =>
      this.convertToUniversalScope(scope)
    );

    const universalImports: UniversalImport[] = scopeAnalysis.importReferences.map(imp =>
      this.convertToUniversalImport(imp)
    );

    const universalExports: UniversalExport[] = scopeAnalysis.exports.map(exp => ({
      exported: exp,
      kind: 'named' as const
    }));

    return {
      language: this.language,
      filePath,
      scopes: universalScopes,
      imports: universalImports,
      exports: universalExports,
      linesOfCode: scopeAnalysis.totalLines,
      errors: scopeAnalysis.astValid ? undefined : scopeAnalysis.astIssues.map(msg => ({ message: msg }))
    };
  }

  /**
   * Convert ScopeInfo to UniversalScope
   */
  private convertToUniversalScope(scope: ScopeInfo): UniversalScope {
    return {
      // Core metadata
      uuid: '', // Will be assigned during build
      name: scope.name,
      type: scope.type,

      // Location
      filePath: scope.filePath,
      startLine: scope.startLine,
      endLine: scope.endLine,

      // Code
      source: scope.content,
      language: this.language,

      // Signature and types
      signature: scope.signature,
      returnType: scope.returnType,
      parameters: scope.parameters,

      // Hierarchy
      parentName: scope.parent,
      depth: scope.depth,

      // References
      references: scope.identifierReferences,
      imports: scope.importReferences.map(imp => this.convertToUniversalImport(imp)),

      // Language-specific (preserve TypeScript metadata)
      languageSpecific: {
        typescript: {
          modifiers: scope.modifiers,
          complexity: scope.complexity,
          contentDedented: scope.contentDedented,
          astValid: scope.astValid,
          astIssues: scope.astIssues,
          astNotes: scope.astNotes,
          exports: scope.exports,
          dependencies: scope.dependencies
        }
      }
    };
  }

  /**
   * Convert ImportReference to UniversalImport
   */
  private convertToUniversalImport(imp: ImportReference): UniversalImport {
    let kind: 'named' | 'namespace' | 'default' | 'wildcard';

    switch (imp.kind) {
      case 'named':
        kind = 'named';
        break;
      case 'namespace':
        kind = 'namespace';
        break;
      case 'default':
        kind = 'default';
        break;
      case 'side-effect':
        kind = 'wildcard'; // Map side-effect to wildcard
        break;
      default:
        kind = 'named';
    }

    return {
      source: imp.source,
      imported: imp.imported,
      alias: imp.alias,
      kind,
      isLocal: imp.isLocal,
      line: undefined,
      column: undefined
    };
  }
}
