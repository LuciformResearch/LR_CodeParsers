/**
 * Rust Language Parser
 *
 * Adapter that wraps RustScopeExtractionParser
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
  RustScopeExtractionParser,
  type ScopeFileAnalysis,
  type ScopeInfo,
  type ImportReference
} from '../scope-extraction/index.js';

export class RustLanguageParser extends BaseLanguageParser {
  readonly language: Language = 'rust';
  readonly extensions = ['.rs'];
  readonly capabilities: ParserCapabilities = {
    scopeExtraction: true,
    importResolution: true,
    typeInference: true,
    crossFileReferences: true
  };

  private parser: RustScopeExtractionParser;

  constructor() {
    super();
    this.parser = new RustScopeExtractionParser();
  }

  async initialize(): Promise<void> {
    await this.parser.initialize();
  }

  async parseFile(filePath: string, content: string): Promise<UniversalFileAnalysis> {
    const scopeAnalysis: ScopeFileAnalysis = await this.parser.parseFile(filePath, content);

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

  private convertToUniversalScope(scope: ScopeInfo): UniversalScope {
    return {
      uuid: '',
      name: scope.name,
      type: scope.type,
      filePath: scope.filePath,
      startLine: scope.startLine,
      endLine: scope.endLine,
      source: scope.content,
      language: this.language,
      signature: scope.signature,
      returnType: scope.returnType,
      parameters: scope.parameters,
      docstring: scope.docstring,
      parentName: scope.parent,
      depth: scope.depth,
      references: scope.identifierReferences,
      imports: scope.importReferences.map(imp => this.convertToUniversalImport(imp)),
      languageSpecific: {
        rust: {
          modifiers: scope.modifiers,
          complexity: scope.complexity,
          contentDedented: scope.contentDedented,
          astValid: scope.astValid,
          astIssues: scope.astIssues,
          astNotes: scope.astNotes,
          exports: scope.exports,
          dependencies: scope.dependencies,
          genericParameters: scope.genericParameters,
          heritageClauses: scope.heritageClauses
        }
      }
    };
  }

  private convertToUniversalImport(imp: ImportReference): UniversalImport {
    let kind: 'named' | 'namespace' | 'default' | 'wildcard';
    switch (imp.kind) {
      case 'named': kind = 'named'; break;
      case 'namespace': kind = 'namespace'; break;
      case 'default': kind = 'default'; break;
      case 'side-effect': kind = 'wildcard'; break;
      default: kind = 'named';
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
