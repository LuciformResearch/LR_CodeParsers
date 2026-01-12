/**
 * Go Language Parser
 *
 * Adapter that wraps GoScopeExtractionParser
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
  GoScopeExtractionParser,
  type ScopeFileAnalysis,
  type ScopeInfo,
  type ImportReference
} from '../scope-extraction/index.js';

export class GoLanguageParser extends BaseLanguageParser {
  readonly language: Language = 'go';
  readonly extensions = ['.go'];
  readonly capabilities: ParserCapabilities = {
    scopeExtraction: true,
    importResolution: true,
    typeInference: true,
    crossFileReferences: true
  };

  private parser: GoScopeExtractionParser;

  constructor() {
    super();
    this.parser = new GoScopeExtractionParser();
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
        go: {
          modifiers: scope.modifiers,
          complexity: scope.complexity,
          contentDedented: scope.contentDedented,
          astValid: scope.astValid,
          astIssues: scope.astIssues,
          astNotes: scope.astNotes,
          exports: scope.exports,
          dependencies: scope.dependencies,
          genericParameters: scope.genericParameters
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
