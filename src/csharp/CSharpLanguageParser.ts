/**
 * C# Language Parser
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
  CSharpScopeExtractionParser,
  type ScopeFileAnalysis,
  type ScopeInfo,
  type ImportReference
} from '../scope-extraction/index.js';

export class CSharpLanguageParser extends BaseLanguageParser {
  readonly language: Language = 'csharp';
  readonly extensions = ['.cs'];
  readonly capabilities: ParserCapabilities = {
    scopeExtraction: true,
    importResolution: true,
    typeInference: true,
    crossFileReferences: true
  };

  private parser: CSharpScopeExtractionParser;

  constructor() {
    super();
    this.parser = new CSharpScopeExtractionParser();
  }

  async initialize(): Promise<void> {
    await this.parser.initialize();
  }

  async parseFile(filePath: string, content: string): Promise<UniversalFileAnalysis> {
    const scopeAnalysis: ScopeFileAnalysis = await this.parser.parseFile(filePath, content);

    return {
      language: this.language,
      filePath,
      scopes: scopeAnalysis.scopes.map(scope => this.convertToUniversalScope(scope)),
      imports: scopeAnalysis.importReferences.map(imp => this.convertToUniversalImport(imp)),
      exports: scopeAnalysis.exports.map(exp => ({ exported: exp, kind: 'named' as const })),
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
      languageSpecific: { csharp: { modifiers: scope.modifiers, complexity: scope.complexity, genericParameters: scope.genericParameters } }
    };
  }

  private convertToUniversalImport(imp: ImportReference): UniversalImport {
    return {
      source: imp.source,
      imported: imp.imported,
      alias: imp.alias,
      kind: imp.kind === 'namespace' ? 'namespace' : imp.kind === 'default' ? 'default' : 'named',
      isLocal: imp.isLocal
    };
  }
}
