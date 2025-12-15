/**
 * Structured TypeScript Parser
 * 
 * Parse TypeScript code and extract rich metadata for LLM analysis.
 * Based on the original CodeInsight vision: pre-structure code before sending to LLM.
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);

type ParserInstance = any;
type Language = any;
type Tree = any;
type SyntaxNode = any;

let webTreeSitterModule: any = null;

const IDENTIFIER_STOP_WORDS = new Set([
  'if', 'for', 'while', 'return', 'const', 'let', 'var', 'function', 'class',
  'extends', 'implements', 'import', 'from', 'export', 'default', 'new', 'this',
  'super', 'await', 'async', 'switch', 'case', 'break', 'continue', 'try',
  'catch', 'finally', 'throw', 'true', 'false', 'null', 'undefined', 'typeof',
  'instanceof', 'in', 'of'
]);

const BUILTIN_IDENTIFIERS = new Set([
  'Number',
  'String',
  'Boolean',
  'Object',
  'Array',
  'Map',
  'Set',
  'Promise',
  'Date',
  'Error',
  'console',
  'Math',
  'JSON',
  'RegExp',
  'Symbol',
  'isNaN'
]);

async function loadWebTreeSitter(): Promise<any> {
  if (!webTreeSitterModule) {
    webTreeSitterModule = await import('web-tree-sitter');
  }
  return webTreeSitterModule;
}

export interface ParameterInfo {
  name: string;
  type?: string;
  optional: boolean;
  defaultValue?: string;
}

export interface ImportReference {
  source: string;
  imported: string;
  alias?: string;
  kind: 'default' | 'named' | 'namespace' | 'side-effect';
  isLocal: boolean;
}

export interface IdentifierReference {
  identifier: string;
  line: number;
  column?: number;  // 0-based column position
  context?: string;
  qualifier?: string;
  kind?: 'import' | 'local_scope' | 'builtin' | 'unknown';
  source?: string;
  targetScope?: string;
  isLocalImport?: boolean;
}

export interface TypeScriptScope {
  // Métadonnées de base
  name: string;
  type: 'class' | 'interface' | 'function' | 'method' | 'enum' | 'type_alias' | 'namespace' | 'module' | 'variable';
  startLine: number;
  endLine: number;
  filePath: string;
  
  // Signature et interface
  signature: string;
  parameters: ParameterInfo[];
  returnType?: string;
  modifiers: string[];
  
  // Contenu et structure
  content: string;
  contentDedented: string;
  children: TypeScriptScope[];
  
  // Dépendances et contexte
  dependencies: string[];
  exports: string[];
  imports: string[];
  importReferences: ImportReference[];
  identifierReferences: IdentifierReference[];
  
  // Métadonnées AST
  astValid: boolean;
  astIssues: string[];
  astNotes: string[];
  
  // Métriques
  complexity: number;
  linesOfCode: number;
  
  // Contexte parent
  parent?: string;
  depth: number;
}

export interface FileAnalysis {
  filePath: string;
  scopes: TypeScriptScope[];
  totalLines: number;
  totalScopes: number;
  imports: string[];
  importReferences: ImportReference[];
  exports: string[];
  dependencies: string[];
  astValid: boolean;
  astIssues: string[];
}

export class StructuredTypeScriptParser {
  private tsParser: ParserInstance | null = null;
  private tsxParser: ParserInstance | null = null;
  private tsInitialized: boolean = false;
  private tsxInitialized: boolean = false;

  constructor() {
    // Parsers will be created on demand
  }

  /**
   * Initialize the TypeScript parser (.ts files)
   */
  private async initializeTS(): Promise<void> {
    if (this.tsInitialized && this.tsParser) return;

    const { Parser, Language } = await loadWebTreeSitter();
    if (!this.tsParser) {
      await Parser.init();
      this.tsParser = new Parser();
      const TypeScript = await Language.load(
        require.resolve('tree-sitter-wasms/out/tree-sitter-typescript.wasm')
      );
      this.tsParser.setLanguage(TypeScript);
    }
    this.tsInitialized = true;
  }

  /**
   * Initialize the TSX parser (.tsx/.jsx files)
   */
  private async initializeTSX(): Promise<void> {
    if (this.tsxInitialized && this.tsxParser) return;

    const { Parser, Language } = await loadWebTreeSitter();
    if (!this.tsxParser) {
      await Parser.init();
      this.tsxParser = new Parser();
      const TSX = await Language.load(
        require.resolve('tree-sitter-wasms/out/tree-sitter-tsx.wasm')
      );
      this.tsxParser.setLanguage(TSX);
    }
    this.tsxInitialized = true;
  }

  /**
   * Initialize the parser (backwards compatibility)
   */
  async initialize(): Promise<void> {
    // Only initialize TS parser by default for speed
    // TSX will be initialized on-demand
    await this.initializeTS();
    console.log('✅ Structured TypeScript Parser initialized');
  }

  /**
   * Parse a TypeScript file and extract structured scopes
   * @param resolver - Optional ImportResolver to properly detect path aliases from tsconfig
   */
  async parseFile(
    filePath: string,
    content: string,
    resolver?: { isPathAlias: (path: string) => boolean }
  ): Promise<FileAnalysis> {
    // Determine if this is a TSX/JSX file
    const isTSX = filePath.endsWith('.tsx') || filePath.endsWith('.jsx');

    // Initialize the appropriate parser on-demand
    if (isTSX) {
      await this.initializeTSX();
    } else {
      await this.initializeTS();
    }

    try {
      // Choose the right parser based on file extension
      const parser = isTSX ? this.tsxParser : this.tsParser;

      if (!parser) throw new Error('Parser not initialized');
      const tree = parser.parse(content);
      const scopes: TypeScriptScope[] = [];
      const structuredImports = this.extractStructuredImports(content, resolver);

      // Extract all scopes with hierarchy
      const root = tree?.rootNode;
      if (root) {
        this.extractScopes(root, scopes, content, 0, undefined, structuredImports, filePath);
      }

      const scopeIndex = this.classifyScopeReferences(scopes, structuredImports);
      this.attachSignatureReferences(scopes, scopeIndex);

      // Analyze file-level metadata
      const imports = structuredImports.length
        ? [...new Set(structuredImports.map(ref => ref.source))]
        : this.extractImports(content);
      const exports = this.extractExports(content);
      const dependencies = this.extractDependencies(content);
      const astValid = root ? this.validateAST(root) : false;
      const astIssues = root ? this.extractASTIssues(root) : ['AST root missing'];

      const analysis: FileAnalysis = {
        filePath,
        scopes,
        totalLines: content.split('\n').length,
        totalScopes: scopes.length,
        imports,
        importReferences: structuredImports,
        exports,
        dependencies,
        astValid,
        astIssues
      };

      console.log(`📊 Parsed ${filePath}: ${scopes.length} scopes, ${analysis.totalLines} lines`);
      return analysis;
    } catch (error) {
      console.error(`❌ Failed to parse ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Extract scopes from AST node with hierarchy
   */
  private extractScopes(
    node: SyntaxNode, 
    scopes: TypeScriptScope[], 
    content: string, 
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[],
    filePath: string
  ): void {
    // Extract different types of scopes
    if (node.type === 'class_declaration' || node.type === 'abstract_class_declaration') {
      const scope = this.extractClass(node, content, depth, parent, fileImports);
      scope.filePath = filePath;
      scopes.push(scope);

      // Recursively extract children
      for (const child of node.children) {
        if (child) this.extractScopes(child, scopes, content, depth + 1, scope.name, fileImports, filePath);
      }
    } else if (node.type === 'interface_declaration') {
      const scope = this.extractInterface(node, content, depth, parent, fileImports);
      scope.filePath = filePath;
      scopes.push(scope);
    } else if (node.type === 'function_declaration') {
      const scope = this.extractFunction(node, content, depth, parent, fileImports);
      scope.filePath = filePath;
      scopes.push(scope);
    } else if (node.type === 'method_definition') {
      const scope = this.extractMethod(node, content, depth, parent, fileImports);
      scope.filePath = filePath;
      scopes.push(scope);
    } else if (node.type === 'enum_declaration') {
      const scope = this.extractEnum(node, content, depth, parent, fileImports);
      scope.filePath = filePath;
      scopes.push(scope);
    } else if (node.type === 'type_alias_declaration') {
      const scope = this.extractTypeAlias(node, content, depth, parent, fileImports);
      scope.filePath = filePath;
      scopes.push(scope);
    } else if (node.type === 'namespace_declaration') {
      const scope = this.extractNamespace(node, content, depth, parent, fileImports);
      scope.filePath = filePath;
      scopes.push(scope);

      // Recursively extract children
      for (const child of node.children) {
        if (child) this.extractScopes(child, scopes, content, depth + 1, scope.name, fileImports, filePath);
      }
    } else if (node.type === 'lexical_declaration' || node.type === 'variable_declaration') {
      // Handle const/let/var declarations that might contain functions
      // e.g., export const myFunc = () => {...}
      const constScopes = this.extractConstFunctions(node, content, depth, parent, fileImports);

      // Also extract global variables (non-function variables at module level)
      const globalVarScopes = this.extractGlobalVariables(node, content, depth, parent, fileImports);

      // Combine all extracted scopes
      const extractedScopes = [...constScopes, ...globalVarScopes];

      // Only recurse if we didn't extract any scopes
      // (to avoid duplicate processing)
      if (extractedScopes.length === 0) {
        for (const child of node.children) {
          if (child) this.extractScopes(child, scopes, content, depth, parent, fileImports, filePath);
        }
      } else {
        // Add the extracted scopes
        for (const scope of extractedScopes) {
          scope.filePath = filePath;
          scopes.push(scope);
        }
      }
    } else {
      // Recursively process other children
      for (const child of node.children) {
        if (child) this.extractScopes(child, scopes, content, depth, parent, fileImports, filePath);
      }
    }
  }

  /**
   * Extract class information with rich metadata
   */
  private extractClass(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): TypeScriptScope {
    const nameNode = node.childForFieldName('name');
    const name = this.getNodeText(nameNode, content) || 'AnonymousClass';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;

    // Only capture class definition line, not the entire body
    const lines = content.split('\n');
    const classDefLine = lines[startLine - 1];
    const nodeContent = classDefLine?.trim() || this.getNodeText(node, content);

    const modifiers = this.extractModifiers(node, content);
    const parameters = this.extractParameters(node, content);
    const returnType = this.extractReturnType(node, content);
    const signature = this.buildSignature('class', name, parameters, returnType, modifiers);
    const contentDedented = nodeContent; // Already a single line, no need to dedent
    const referenceExclusions = this.buildReferenceExclusions(name, parameters);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));
    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);
    
    const dependencies = this.extractDependencies(nodeContent);
    const exports = [name];
    const imports = importReferences.length
      ? [...new Set(importReferences.map(ref => ref.source))]
      : this.extractImports(nodeContent);
    const complexity = this.calculateComplexity(node);
    const linesOfCode = endLine - startLine + 1;

    return {
      name,
      type: 'class',
      startLine,
      endLine,
      filePath: '',
      signature,
      parameters,
      returnType,
      modifiers,
      content: nodeContent,
      contentDedented,
      children: [], // Will be populated by recursive extraction
      dependencies,
      exports,
      imports,
      importReferences,
      identifierReferences,
      astValid: this.validateNode(node),
      astIssues: this.extractNodeIssues(node),
      astNotes: this.extractNodeNotes(node),
      complexity,
      linesOfCode,
      parent,
      depth
    };
  }

  /**
   * Extract interface information
   */
  private extractInterface(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): TypeScriptScope {
    const nameNode = node.childForFieldName('name');
    const name = this.getNodeText(nameNode, content) || 'AnonymousInterface';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    
    const modifiers = this.extractModifiers(node, content);
    const signature = this.buildSignature('interface', name, [], undefined, modifiers);
    const contentDedented = this.dedentContent(nodeContent);
    const parameters: ParameterInfo[] = [];
    const referenceExclusions = this.buildReferenceExclusions(name, parameters);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));
    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);
    
    const dependencies = this.extractDependencies(nodeContent);
    const exports = [name];
    const imports = importReferences.length
      ? [...new Set(importReferences.map(ref => ref.source))]
      : this.extractImports(nodeContent);
    const complexity = this.calculateComplexity(node);
    const linesOfCode = endLine - startLine + 1;

    return {
      name,
      type: 'interface',
      startLine,
      endLine,
      filePath: '',
      signature,
      parameters,
      returnType: undefined,
      modifiers,
      content: nodeContent,
      contentDedented,
      children: [],
      dependencies,
      exports,
      imports,
      importReferences,
      identifierReferences,
      astValid: this.validateNode(node),
      astIssues: this.extractNodeIssues(node),
      astNotes: this.extractNodeNotes(node),
      complexity,
      linesOfCode,
      parent,
      depth
    };
  }

  /**
   * Extract function information
   */
  private extractFunction(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): TypeScriptScope {
    const nameNode = node.childForFieldName('name');
    const name = this.getNodeText(nameNode, content) || 'AnonymousFunction';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    
    const modifiers = this.extractModifiers(node, content);
    const parameters = this.extractParameters(node, content);
    const returnType = this.extractReturnType(node, content);
    const signature = this.buildSignature('function', name, parameters, returnType, modifiers);
    const contentDedented = this.dedentContent(nodeContent);
    const referenceExclusions = this.buildReferenceExclusions(name, parameters);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));
    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);
    
    const dependencies = this.extractDependencies(nodeContent);
    const exports = [name];
    const imports = importReferences.length
      ? [...new Set(importReferences.map(ref => ref.source))]
      : this.extractImports(nodeContent);
    const complexity = this.calculateComplexity(node);
    const linesOfCode = endLine - startLine + 1;

    return {
      name,
      type: 'function',
      startLine,
      endLine,
      filePath: '',
      signature,
      parameters,
      returnType,
      modifiers,
      content: nodeContent,
      contentDedented,
      children: [],
      dependencies,
      exports,
      imports,
      importReferences,
      identifierReferences,
      astValid: this.validateNode(node),
      astIssues: this.extractNodeIssues(node),
      astNotes: this.extractNodeNotes(node),
      complexity,
      linesOfCode,
      parent,
      depth
    };
  }

  /**
   * Extract method information
   */
  private extractMethod(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): TypeScriptScope {
    const nameNode = node.childForFieldName('name');
    const name = this.getNodeText(nameNode, content) || 'AnonymousMethod';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    
    const modifiers = this.extractModifiers(node, content);
    const parameters = this.extractParameters(node, content);
    const returnType = this.extractReturnType(node, content);
    const signature = this.buildSignature('method', name, parameters, returnType, modifiers);
    const contentDedented = this.dedentContent(nodeContent);
    const referenceExclusions = this.buildReferenceExclusions(name, parameters);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));
    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);
    
    const dependencies = this.extractDependencies(nodeContent);
    const exports = [name];
    const imports = importReferences.length
      ? [...new Set(importReferences.map(ref => ref.source))]
      : this.extractImports(nodeContent);
    const complexity = this.calculateComplexity(node);
    const linesOfCode = endLine - startLine + 1;

    return {
      name,
      type: 'method',
      startLine,
      endLine,
      filePath: '',
      signature,
      parameters,
      returnType,
      modifiers,
      content: nodeContent,
      contentDedented,
      children: [],
      dependencies,
      exports,
      imports,
      importReferences,
      identifierReferences,
      astValid: this.validateNode(node),
      astIssues: this.extractNodeIssues(node),
      astNotes: this.extractNodeNotes(node),
      complexity,
      linesOfCode,
      parent,
      depth
    };
  }

  /**
   * Extract enum information
   */
  private extractEnum(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): TypeScriptScope {
    const nameNode = node.childForFieldName('name');
    const name = this.getNodeText(nameNode, content) || 'AnonymousEnum';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    
    const modifiers = this.extractModifiers(node, content);
    const signature = this.buildSignature('enum', name, [], undefined, modifiers);
    const contentDedented = this.dedentContent(nodeContent);
    const parameters: ParameterInfo[] = [];
    const referenceExclusions = this.buildReferenceExclusions(name, parameters);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));
    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);
    
    const dependencies = this.extractDependencies(nodeContent);
    const exports = [name];
    const imports = importReferences.length
      ? [...new Set(importReferences.map(ref => ref.source))]
      : this.extractImports(nodeContent);
    const complexity = this.calculateComplexity(node);
    const linesOfCode = endLine - startLine + 1;

    return {
      name,
      type: 'enum',
      startLine,
      endLine,
      filePath: '',
      signature,
      parameters,
      returnType: undefined,
      modifiers,
      content: nodeContent,
      contentDedented,
      children: [],
      dependencies,
      exports,
      imports,
      importReferences,
      identifierReferences,
      astValid: this.validateNode(node),
      astIssues: this.extractNodeIssues(node),
      astNotes: this.extractNodeNotes(node),
      complexity,
      linesOfCode,
      parent,
      depth
    };
  }

  /**
   * Extract type alias information
   */
  private extractTypeAlias(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): TypeScriptScope {
    const nameNode = node.childForFieldName('name');
    const name = this.getNodeText(nameNode, content) || 'AnonymousType';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    
    const modifiers = this.extractModifiers(node, content);
    const signature = this.buildSignature('type_alias', name, [], undefined, modifiers);
    const contentDedented = this.dedentContent(nodeContent);
    const parameters: ParameterInfo[] = [];
    const referenceExclusions = this.buildReferenceExclusions(name, parameters);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));
    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);
    
    const dependencies = this.extractDependencies(nodeContent);
    const exports = [name];
    const imports = importReferences.length
      ? [...new Set(importReferences.map(ref => ref.source))]
      : this.extractImports(nodeContent);
    const complexity = this.calculateComplexity(node);
    const linesOfCode = endLine - startLine + 1;

    return {
      name,
      type: 'type_alias',
      startLine,
      endLine,
      filePath: '',
      signature,
      parameters: [],
      returnType: undefined,
      modifiers,
      content: nodeContent,
      contentDedented,
      children: [],
      dependencies,
      exports,
      imports,
      importReferences,
      identifierReferences,
      astValid: this.validateNode(node),
      astIssues: this.extractNodeIssues(node),
      astNotes: this.extractNodeNotes(node),
      complexity,
      linesOfCode,
      parent,
      depth
    };
  }

  /**
   * Extract namespace information
   */
  private extractNamespace(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): TypeScriptScope {
    const nameNode = node.childForFieldName('name');
    const name = this.getNodeText(nameNode, content) || 'AnonymousNamespace';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    
    const modifiers = this.extractModifiers(node, content);
    const signature = this.buildSignature('namespace', name, [], undefined, modifiers);
    const contentDedented = this.dedentContent(nodeContent);
    const parameters: ParameterInfo[] = [];
    const referenceExclusions = this.buildReferenceExclusions(name, parameters);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));
    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);
    
    const dependencies = this.extractDependencies(nodeContent);
    const exports = [name];
    const imports = importReferences.length
      ? [...new Set(importReferences.map(ref => ref.source))]
      : this.extractImports(nodeContent);
    const complexity = this.calculateComplexity(node);
    const linesOfCode = endLine - startLine + 1;

    const scope: TypeScriptScope = {
      name,
      type: 'namespace',
      startLine,
      endLine,
      filePath: '',
      signature,
      parameters,
      returnType: undefined,
      modifiers,
      content: nodeContent,
      contentDedented,
      children: [],
      dependencies,
      exports,
      imports,
      importReferences,
      identifierReferences,
      astValid: this.validateNode(node),
      astIssues: this.extractNodeIssues(node),
      astNotes: this.extractNodeNotes(node),
      complexity,
      linesOfCode,
      parent,
      depth
    };

    return scope;
  }

  /**
   * Extract const/let/var declarations that contain functions
   * Handles: export const myFunc = () => {...}, export const fn = function() {...}, etc.
   */
  private extractConstFunctions(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): TypeScriptScope[] {
    const scopes: TypeScriptScope[] = [];

    // Find all variable_declarator nodes
    const findDeclarators = (n: SyntaxNode): SyntaxNode[] => {
      if (n.type === 'variable_declarator') return [n];
      const declarators: SyntaxNode[] = [];
      for (const child of n.children) {
        if (child) declarators.push(...findDeclarators(child));
      }
      return declarators;
    };

    const declarators = findDeclarators(node);

    for (const declarator of declarators) {
      const nameNode = declarator.childForFieldName('name');
      const valueNode = declarator.childForFieldName('value');

      if (!nameNode || !valueNode) continue;

      // Check if the value is a function (arrow_function, function, function_expression)
      const isFunctionValue =
        valueNode.type === 'arrow_function' ||
        valueNode.type === 'function' ||
        valueNode.type === 'function_expression';

      if (!isFunctionValue) continue;

      const name = this.getNodeText(nameNode, content) || 'anonymous';
      const startLine = declarator.startPosition.row + 1;
      const endLine = declarator.endPosition.row + 1;
      const nodeContent = this.getNodeText(declarator, content);

      // Extract parameters from the function value
      const parameters = this.extractParameters(valueNode, content);

      // Extract return type
      const returnTypeNode = valueNode.childForFieldName('return_type');
      const returnType = returnTypeNode ? this.getNodeText(returnTypeNode, content) : undefined;

      // Build signature
      const modifiers = this.extractModifiers(node.parent || node, content);
      const signature = this.buildSignature('const', name, parameters, returnType, modifiers);

      const contentDedented = this.dedentContent(nodeContent);
      const referenceExclusions = this.buildReferenceExclusions(name, parameters);
      const localSymbols = this.collectLocalSymbols(valueNode, content);
      localSymbols.forEach(symbol => referenceExclusions.add(symbol));
      const identifierReferences = this.extractIdentifierReferences(valueNode, content, referenceExclusions);
      const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

      const dependencies = this.extractDependencies(nodeContent);
      const exports = [name];
      const imports = importReferences.length
        ? [...new Set(importReferences.map(ref => ref.source))]
        : this.extractImports(nodeContent);
      const complexity = this.calculateComplexity(valueNode);
      const linesOfCode = endLine - startLine + 1;

      const scope: TypeScriptScope = {
        name,
        type: 'function',
        startLine,
        endLine,
        filePath: '',
        signature,
        parameters,
        returnType,
        modifiers,
        content: nodeContent,
        contentDedented,
        children: [],
        dependencies,
        exports,
        imports,
        importReferences,
        identifierReferences,
        astValid: this.validateNode(declarator),
        astIssues: this.extractNodeIssues(declarator),
        astNotes: this.extractNodeNotes(declarator),
        complexity,
        linesOfCode,
        parent,
        depth
      };

      scopes.push(scope);
    }

    return scopes;
  }

  /**
   * Extract global variables (non-function const/let/var at module level)
   */
  private extractGlobalVariables(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): TypeScriptScope[] {
    // Only extract at module level (depth 0) and no parent
    if (depth !== 0 || parent) return [];

    const scopes: TypeScriptScope[] = [];

    // Find all variable_declarator nodes
    const findDeclarators = (n: SyntaxNode): SyntaxNode[] => {
      if (n.type === 'variable_declarator') return [n];
      const declarators: SyntaxNode[] = [];
      for (const child of n.children) {
        if (child) declarators.push(...findDeclarators(child));
      }
      return declarators;
    };

    const declarators = findDeclarators(node);

    // Determine variable kind (const, let, var)
    let variableKind = 'const';
    if (node.type === 'variable_declaration') {
      const kindNode = node.children.find(c => c && (c.type === 'const' || c.type === 'let' || c.type === 'var'));
      if (kindNode) variableKind = kindNode.type;
    } else if (node.type === 'lexical_declaration') {
      const kindNode = node.children.find(c => c && (c.type === 'const' || c.type === 'let'));
      if (kindNode) variableKind = kindNode.type;
    }

    for (const declarator of declarators) {
      const nameNode = declarator.childForFieldName('name');
      const valueNode = declarator.childForFieldName('value');
      const typeNode = declarator.childForFieldName('type');

      if (!nameNode) continue;

      // Skip if the value is a function (already handled by extractConstFunctions)
      if (valueNode) {
        const isFunctionValue =
          valueNode.type === 'arrow_function' ||
          valueNode.type === 'function' ||
          valueNode.type === 'function_expression';

        if (isFunctionValue) continue;
      }

      const name = this.getNodeText(nameNode, content) || 'anonymous';
      const startLine = declarator.startPosition.row + 1;
      const endLine = declarator.endPosition.row + 1;
      const nodeContent = this.getNodeText(declarator, content);

      // Extract type if present
      let variableType = typeNode ? this.getNodeText(typeNode, content) : undefined;

      // Build signature
      const modifiers = this.extractModifiers(node.parent || node, content);
      let signature = `${variableKind} ${name}`;
      if (variableType) {
        // Remove leading colon if present (type annotation format is ": Type")
        variableType = variableType.replace(/^:\s*/, '');
        signature += `: ${variableType}`;
      }

      const contentDedented = this.dedentContent(nodeContent);
      const referenceExclusions = new Set([name]);
      const identifierReferences = valueNode
        ? this.extractIdentifierReferences(valueNode, content, referenceExclusions)
        : [];
      const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

      const dependencies = this.extractDependencies(nodeContent);
      const exports = [name];
      const imports = importReferences.length
        ? [...new Set(importReferences.map(ref => ref.source))]
        : this.extractImports(nodeContent);
      const linesOfCode = endLine - startLine + 1;

      const scope: TypeScriptScope = {
        name,
        type: 'variable',
        startLine,
        endLine,
        filePath: '',
        signature,
        parameters: [],
        returnType: variableType,
        modifiers,
        content: nodeContent,
        contentDedented,
        children: [],
        dependencies,
        exports,
        imports,
        importReferences,
        identifierReferences,
        astValid: this.validateNode(declarator),
        astIssues: this.extractNodeIssues(declarator),
        astNotes: this.extractNodeNotes(declarator),
        complexity: 1,
        linesOfCode,
        parent,
        depth
      };

      scopes.push(scope);
    }

    return scopes;
  }

  /**
   * Extract modifiers (public, private, static, etc.)
   */
  private extractModifiers(node: SyntaxNode, content: string): string[] {
    const modifiers: string[] = [];

    for (const child of node.children) {
      if (!child) continue;
      if (child.type === 'accessibility_modifier' ||
          child.type === 'static' ||
          child.type === 'abstract' ||
          child.type === 'override' ||
          child.type === 'readonly' ||
          child.type === 'async') {
        // Use actual text, not node type (e.g., "private" not "accessibility_modifier")
        modifiers.push(this.getNodeText(child, content));
      }
    }

    return modifiers;
  }

  /**
   * Extract function parameters with type information
   */
  private extractParameters(node: SyntaxNode, content: string): ParameterInfo[] {
    const parameters: ParameterInfo[] = [];
    const paramsNode = node.childForFieldName('parameters');
    
    if (paramsNode) {
      for (const child of paramsNode.children) {
        if (!child) continue;
        if (child.type === 'required_parameter' || 
            child.type === 'optional_parameter' ||
            child.type === 'rest_parameter') {
          
          // Extract name from pattern (could be identifier or destructuring)
          let name = '';
          const patternNode = child.childForFieldName('pattern');
          if (patternNode) {
            if (patternNode.type === 'identifier') {
              name = this.getNodeText(patternNode, content);
            } else {
              // For destructuring patterns, use the pattern as name
              name = this.getNodeText(patternNode, content);
            }
          }
          
          const typeNode = child.childForFieldName('type');
          const type = typeNode ? this.getNodeText(typeNode, content)?.replace(/^:\s*/, '') : undefined;
          const optional = child.type === 'optional_parameter';
          const defaultValue = optional ? this.getNodeText(child.childForFieldName('value'), content) : undefined;
          
          if (name) {
            parameters.push({
              name,
              type,
              optional,
              defaultValue
            });
          }
        }
      }
    }
    
    return parameters;
  }

  /**
   * Extract return type
   */
  private extractReturnType(node: SyntaxNode, content: string): string | undefined {
    const returnTypeNode = node.childForFieldName('return_type');
    if (!returnTypeNode) {
      const typeNode = node.childForFieldName('type');
      if (!typeNode) return undefined;
      return this.getNodeText(typeNode, content)?.replace(/^:\s*/, '');
    }
    return this.getNodeText(returnTypeNode, content)?.replace(/^:\s*/, '');
  }

  /**
   * Build signature string
   * Note: In TypeScript, methods don't have a "method" keyword, so we omit the type for methods.
   */
  private buildSignature(
    type: string,
    name: string,
    parameters: ParameterInfo[],
    returnType?: string,
    modifiers: string[] = []
  ): string {
    const modStr = modifiers.length > 0 ? modifiers.join(' ') + ' ' : '';
    const paramsStr = parameters.map(p => {
      let param = p.name;
      if (p.type) param += `: ${p.type}`;
      if (p.optional) param += '?';
      if (p.defaultValue) param += ` = ${p.defaultValue}`;
      return param;
    }).join(', ');

    const returnStr = returnType ? `: ${returnType}` : '';

    // In TypeScript: methods don't have a keyword, functions use "function", classes use "class"
    const typeKeyword = type === 'method' ? '' : `${type} `;

    return `${modStr}${typeKeyword}${name}(${paramsStr})${returnStr}`;
  }

  private buildReferenceExclusions(name: string, parameters: ParameterInfo[]): Set<string> {
    const exclusions = new Set<string>();
    if (name) {
      exclusions.add(name);
    }
    for (const param of parameters) {
      if (param.name) {
        exclusions.add(param.name);
      }
    }
    return exclusions;
  }

  private collectLocalSymbols(node: SyntaxNode, content: string): Set<string> {
    const symbols = new Set<string>();
    const visit = (current: SyntaxNode | null) => {
      if (!current) return;

      // Skip JSX elements - they are USAGE not DEFINITIONS
      if (current.type === 'jsx_opening_element' ||
          current.type === 'jsx_self_closing_element' ||
          current.type === 'jsx_closing_element') {
        // Don't collect JSX component names as local symbols
        const children: SyntaxNode[] = (current as any).namedChildren ?? current.children;
        for (const child of children) {
          visit(child);
        }
        return;
      }

      const nameNode = current.childForFieldName?.('name');
      if (nameNode && nameNode.type === 'identifier') {
        const text = this.getNodeText(nameNode, content);
        if (text) {
          symbols.add(text);
        }
      }

      if (current.type === 'identifier' && this.isDefinitionIdentifier(current)) {
        const text = this.getNodeText(current, content);
        if (text) {
          symbols.add(text);
        }
        return;
      }

      const children: SyntaxNode[] = (current as any).namedChildren ?? current.children;
      for (const child of children) {
        visit(child);
      }
    };

    visit(node);
    return symbols;
  }

  private getPropertyAccessParts(node: SyntaxNode): {
    objectNode?: SyntaxNode | null;
    propertyNode?: SyntaxNode | null;
  } {
    if (node.type !== 'member_expression' && node.type !== 'property_access_expression') {
      return {};
    }
    const named = (node as any).namedChildren as SyntaxNode[];
    if (!named || named.length === 0) {
      return {};
    }
    const objectNode = named[0];
    const propertyNode = named[named.length - 1];
    return { objectNode, propertyNode };
  }

  private extractIdentifierReferences(
    node: SyntaxNode,
    content: string,
    exclude: Set<string>
  ): IdentifierReference[] {
    const references = new Map<string, IdentifierReference>();

    const visit = (current: SyntaxNode | null) => {
      if (!current) return;

      // Handle JSX component references (e.g., <SessionSidebar />)
      if (current.type === 'jsx_opening_element' || current.type === 'jsx_self_closing_element') {
        const nameNode = current.childForFieldName('name');
        if (nameNode) {
          const identifier = this.getNodeText(nameNode, content);
          if (
            identifier &&
            !exclude.has(identifier) &&
            !IDENTIFIER_STOP_WORDS.has(identifier) &&
            !BUILTIN_IDENTIFIERS.has(identifier)
          ) {
            const key = `${identifier}:${nameNode.startPosition.row}:${nameNode.startPosition.column}:jsx`;
            if (!references.has(key)) {
              references.set(key, {
                identifier,
                line: nameNode.startPosition.row + 1,
                column: nameNode.startPosition.column,
                context: this.getLineFromContent(content, nameNode.startPosition.row + 1),
                qualifier: undefined
              });
            }
          }
        }
      }

      if (current.type === 'identifier' || current.type === 'property_identifier') {
        const parent = current.parent;
        if (this.isDefinitionIdentifier(current)) {
          return;
        }

        if (parent?.type === 'pair') {
          const named = (parent as any).namedChildren as SyntaxNode[];
          if (named && named.length && named[0] === current) {
            return;
          }
        }

        if (parent && (parent.type === 'member_expression' || parent.type === 'property_access_expression')) {
          const { objectNode } = this.getPropertyAccessParts(parent);
          if (objectNode && objectNode.startIndex === current.startIndex && objectNode.endIndex === current.endIndex) {
            return;
          }
        }

        const identifier = this.getNodeText(current, content);
        if (
          identifier &&
          !exclude.has(identifier) &&
          !IDENTIFIER_STOP_WORDS.has(identifier) &&
          !BUILTIN_IDENTIFIERS.has(identifier)
        ) {
          let qualifier: string | undefined;
          if (parent && (parent.type === 'member_expression' || parent.type === 'property_access_expression')) {
            const { objectNode, propertyNode } = this.getPropertyAccessParts(parent);
            if (
              propertyNode &&
              objectNode &&
              propertyNode.startIndex === current.startIndex &&
              propertyNode.endIndex === current.endIndex
            ) {
              qualifier = this.getNodeText(objectNode, content);
            }
          }

          if (qualifier && exclude.has(qualifier)) {
            return;
          }

          const key = `${identifier}:${current.startPosition.row}:${current.startPosition.column}:${qualifier ?? 'root'}`;
          if (!references.has(key)) {
            references.set(key, {
              identifier,
              line: current.startPosition.row + 1,
              column: current.startPosition.column,
              context: this.getLineFromContent(content, current.startPosition.row + 1),
              qualifier
            });
          }
        }
      }

      const childNodes: SyntaxNode[] = (current as any).namedChildren ?? current.children;
      for (const child of childNodes) {
        visit(child);
      }
    };

    visit(node);
    return Array.from(references.values());
  }

  private isDefinitionIdentifier(node: SyntaxNode): boolean {
    const parent = node.parent;
    if (!parent) return false;
    const nameField = parent.childForFieldName?.('name');
    if (nameField === node) {
      return true;
    }

    const definitionParentTypes = new Set([
      'shorthand_property_identifier',
      'shorthand_property_identifier_pattern',
      'property_signature',
      'enum_member',
      'type_identifier',
      'method_signature',
      'required_parameter',
      'optional_parameter',
      'rest_parameter'
    ]);

    if (definitionParentTypes.has(parent.type)) {
      return true;
    }

    if (
      parent.type === 'variable_declarator' ||
      parent.type === 'lexical_declaration' ||
      parent.type === 'variable_declaration'
    ) {
      return true;
    }

    return false;
  }

  private classifyScopeReferences(
    scopes: TypeScriptScope[],
    fileImports: ImportReference[]
  ): Map<string, TypeScriptScope[]> {
    const aliasMap = new Map<string, ImportReference>();
    for (const imp of fileImports) {
      const key = imp.alias ?? imp.imported;
      if (key) {
        aliasMap.set(key, imp);
      }
    }

    const scopeIndex = new Map<string, TypeScriptScope[]>();
    for (const scope of scopes) {
      const bucket = scopeIndex.get(scope.name) ?? [];
      bucket.push(scope);
      scopeIndex.set(scope.name, bucket);
    }

    for (const scope of scopes) {
      scope.identifierReferences = scope.identifierReferences
        .map((ref) => {
          const aliasKey = ref.qualifier ?? ref.identifier;
          const importMatch = aliasKey ? aliasMap.get(aliasKey) : undefined;

          if (importMatch) {
            ref.kind = 'import';
            ref.source = importMatch.source;
            ref.isLocalImport = importMatch.isLocal;
            return ref;
          }

          const localTargets = scopeIndex.get(ref.identifier);
          if (localTargets && localTargets.length) {
            ref.kind = 'local_scope';
            const target = localTargets[0];
            ref.targetScope = `${target.filePath ?? ''}::${target.name}:${target.startLine}-${target.endLine}`;
            return ref;
          }

          ref.kind = 'unknown';
          return ref;
        })
        .filter((ref) => ref.kind !== 'builtin');
    }

    return scopeIndex;
  }

  private attachSignatureReferences(
    scopes: TypeScriptScope[],
    scopeIndex: Map<string, TypeScriptScope[]>
  ): void {
    for (const scope of scopes) {
      const returnType = this.extractBaseTypeIdentifier(scope.returnType);
      if (!returnType) continue;
      const targets = scopeIndex.get(returnType);
      if (!targets || !targets.length) continue;
      const target = targets[0];
      // console.error('returnType link', scope.name, '->', returnType);
      const targetId = `${target.filePath ?? ''}::${target.name}:${target.startLine}-${target.endLine}`;
      scope.identifierReferences.push({
        identifier: returnType,
        line: scope.startLine,
        context: scope.signature,
        kind: 'local_scope',
        targetScope: targetId
      });
    }

    // Also attach type references from class fields and method parameters
    this.attachClassFieldTypeReferences(scopes, scopeIndex);
  }

  /**
   * Extract type references from class fields and method parameters
   */
  private attachClassFieldTypeReferences(
    scopes: TypeScriptScope[],
    scopeIndex: Map<string, TypeScriptScope[]>
  ): void {
    // First pass: Add type references from parameters to methods
    for (const scope of scopes) {
      // Extract type references from parameters (for all scopes)
      if (scope.parameters && scope.parameters.length > 0) {
        for (const param of scope.parameters) {
          if (param.type) {
            const paramType = this.extractBaseTypeIdentifier(param.type);
            if (paramType) {
              const targets = scopeIndex.get(paramType);
              if (targets && targets.length > 0) {
                const target = targets[0];
                const targetId = `${target.filePath ?? ''}::${target.name}:${target.startLine}-${target.endLine}`;

                // Check if we already have this reference
                const existingRef = scope.identifierReferences.find(
                  ref => ref.identifier === paramType && ref.kind === 'local_scope'
                );

                if (!existingRef) {
                  scope.identifierReferences.push({
                    identifier: paramType,
                    line: scope.startLine,
                    context: scope.signature,
                    kind: 'local_scope',
                    targetScope: targetId
                  });
                }
              }
            }
          }
        }
      }
    }

    // Second pass: Aggregate type references from child methods to parent classes
    const classScopes = scopes.filter(s => s.type === 'class');
    for (const classScope of classScopes) {
      const childScopes = scopes.filter(s => s.parent === classScope.name && s.filePath === classScope.filePath);

      // Collect all type references from children
      const typeReferences = new Map<string, { targetScope: string; line: number; context: string }>();
      for (const child of childScopes) {
        for (const ref of child.identifierReferences) {
          if (ref.kind === 'local_scope' && ref.targetScope) {
            const refName = ref.identifier;
            if (!typeReferences.has(refName)) {
              typeReferences.set(refName, {
                targetScope: ref.targetScope,
                line: child.startLine,
                context: `${child.signature}`
              });
            }
          }
        }
      }

      // Add type references to the class
      for (const [typeName, refInfo] of typeReferences) {
        const existingRef = classScope.identifierReferences.find(
          ref => ref.identifier === typeName && ref.kind === 'local_scope'
        );

        if (!existingRef) {
          classScope.identifierReferences.push({
            identifier: typeName,
            line: refInfo.line,
            context: refInfo.context,
            kind: 'local_scope',
            targetScope: refInfo.targetScope
          });
        }
      }
    }
  }

  private extractBaseTypeIdentifier(type?: string): string | undefined {
    if (!type) return undefined;
    const cleaned = type.trim();
    if (!cleaned) return undefined;
    const match = cleaned.match(/^[A-Za-z0-9_]+/);
    return match ? match[0] : undefined;
  }

  private resolveImportsForScope(
    references: IdentifierReference[],
    fileImports: ImportReference[]
  ): ImportReference[] {
    const linked = new Map<string, ImportReference>();

    for (const ref of references) {
      const match = fileImports.find(imp => {
        const alias = imp.alias ?? imp.imported;
        if (!alias) return false;
        if (ref.qualifier) {
          return alias === ref.qualifier;
        }
        return alias === ref.identifier;
      });

      if (match) {
        const key = `${match.source}|${match.imported}|${match.alias ?? ''}|${match.kind}`;
        if (!linked.has(key)) {
          linked.set(key, match);
        }
      }
    }

    return Array.from(linked.values());
  }

  private extractStructuredImports(content: string, resolver?: { isPathAlias: (path: string) => boolean }): ImportReference[] {
    const refs: ImportReference[] = [];
    const seen = new Set<string>();

    const pushRef = (ref: ImportReference) => {
      const key = `${ref.source}|${ref.imported}|${ref.alias ?? ''}|${ref.kind}`;
      if (!seen.has(key)) {
        seen.add(key);
        refs.push(ref);
      }
    };

    const importRegex = /import\s+([^;]+?)\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const rawSpec = match[1].trim();
      const source = match[2];

      // Determine if import is local:
      // 1. Relative/absolute paths: ./foo, ../bar, /abs
      // 2. Path aliases from tsconfig (if resolver available): @/foo, ~/bar, etc.
      // 3. Fallback for common patterns: @/ (but not @scope/package)
      let isLocal = source.startsWith('.') || source.startsWith('/');

      if (!isLocal && resolver) {
        // Use tsconfig to check if it's a path alias
        isLocal = resolver.isPathAlias(source);
      } else if (!isLocal && source.startsWith('@/')) {
        // Fallback: assume @/ is a path alias
        // (in case resolver is not available)
        isLocal = true;
      }

      const cleanedSpec = rawSpec.replace(/^type\s+/, '').trim();

    const parts = this.splitImportSpec(cleanedSpec);

      for (const part of parts) {
        if (part.startsWith('{')) {
          const inner = part.replace(/^{|}$/g, '');
          inner.split(',')
            .map(val => val.trim())
            .filter(Boolean)
            .forEach(entry => {
              const [symbol, alias] = entry.split(/\s+as\s+/).map(token => token.trim());
              if (symbol) {
                pushRef({
                  source,
                  imported: symbol,
                  alias: alias || undefined,
                  kind: 'named',
                  isLocal
                });
              }
            });
        } else if (part.startsWith('*')) {
          const aliasMatch = part.match(/\*\s+as\s+(.+)/);
          if (aliasMatch) {
            pushRef({
              source,
              imported: '*',
              alias: aliasMatch[1].trim(),
              kind: 'namespace',
              isLocal
            });
          }
        } else if (part.length) {
          pushRef({
            source,
            imported: 'default',
            alias: part,
            kind: 'default',
            isLocal
          });
        }
      }
    }

    const sideEffectRegex = /import\s+['"]([^'"]+)['"]/g;
    while ((match = sideEffectRegex.exec(content)) !== null) {
      const source = match[1];

      // Determine if import is local (same logic as above)
      let isLocal = source.startsWith('.') || source.startsWith('/');

      if (!isLocal && resolver) {
        isLocal = resolver.isPathAlias(source);
      } else if (!isLocal && source.startsWith('@/')) {
        isLocal = true;
      }

      pushRef({
        source,
        imported: '*',
        kind: 'side-effect',
        isLocal
      });
    }

    return refs;
  }

  private splitImportSpec(spec: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;
    for (const char of spec) {
      if (char === '{') {
        depth++;
        current += char;
        continue;
      }
      if (char === '}') {
        depth = Math.max(0, depth - 1);
        current += char;
        continue;
      }
      if (char === ',' && depth === 0) {
        if (current.trim()) {
          parts.push(current.trim());
        }
        current = '';
        continue;
      }
      current += char;
    }
    if (current.trim()) {
      parts.push(current.trim());
    }
    return parts;
  }

  private getLineFromContent(content: string, lineNumber: number): string | undefined {
    const lines = content.split('\n');
    return lines[lineNumber - 1]?.trim();
  }

  /**
   * Dedent content (remove leading whitespace)
   */
  private dedentContent(content: string): string {
    const lines = content.split('\n');
    if (lines.length === 0) return content;
    
    // Find minimum indentation (excluding empty lines)
    let minIndent = Infinity;
    for (const line of lines) {
      if (line.trim()) {
        const indent = line.length - line.trimStart().length;
        minIndent = Math.min(minIndent, indent);
      }
    }
    
    if (minIndent === Infinity) return content;
    
    // Remove minimum indentation from all lines
    return lines.map(line => 
      line.length > minIndent ? line.substring(minIndent) : line
    ).join('\n');
  }

  /**
   * Extract dependencies from content
   */
  private extractDependencies(content: string): string[] {
    const dependencies: string[] = [];
    
    // Match various import patterns
    const importPatterns = [
      /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
      /import\s+['"]([^'"]+)['"]/g,
      /require\(['"]([^'"]+)['"]\)/g,
      /from\s+['"]([^'"]+)['"]/g
    ];
    
    for (const pattern of importPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        dependencies.push(match[1]);
      }
    }
    
    return [...new Set(dependencies)]; // Remove duplicates
  }

  /**
   * Extract imports from content
   */
  private extractImports(content: string): string[] {
    return [...new Set(this.extractStructuredImports(content).map(ref => ref.source))];
  }

  /**
   * Extract exports from content
   */
  private extractExports(content: string): string[] {
    const exports: string[] = [];
    const exportRegex = /export\s+(?:default\s+)?(?:function|class|interface|enum|type|const|let|var)\s+(\w+)/g;
    
    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }
    
    return [...new Set(exports)];
  }

  /**
   * Calculate complexity score
   */
  private calculateComplexity(node: SyntaxNode): number {
    let complexity = 1; // Base complexity
    
    // Count control flow statements
    const controlFlowTypes = [
      'if_statement', 'for_statement', 'while_statement', 
      'switch_statement', 'try_statement', 'catch_clause',
      'conditional_expression', 'for_in_statement', 'for_of_statement'
    ];
    
    const countNodes = (n: SyntaxNode): number => {
      let count = 0;
      if (controlFlowTypes.includes(n.type)) {
        count++;
      }
      for (const child of n.children) {
        if (child) count += countNodes(child);
      }
      return count;
    };
    
    complexity += countNodes(node);
    return complexity;
  }

  /**
   * Validate AST node
   */
  private validateNode(node: SyntaxNode): boolean {
    // Basic validation - could be enhanced
    return node.type !== 'ERROR';
  }

  /**
   * Extract AST issues
   */
  private extractNodeIssues(node: SyntaxNode): string[] {
    const issues: string[] = [];
    
    if (node.type === 'ERROR') {
      issues.push('Syntax error detected');
    }
    
    // Could add more specific issue detection
    return issues;
  }

  /**
   * Extract AST notes
   */
  private extractNodeNotes(node: SyntaxNode): string[] {
    const notes: string[] = [];
    
    // Could add specific notes based on node analysis
    return notes;
  }

  /**
   * Validate entire AST
   */
  private validateAST(rootNode: SyntaxNode): boolean {
    return this.validateNode(rootNode);
  }

  /**
   * Extract AST issues from root
   */
  private extractASTIssues(rootNode: SyntaxNode): string[] {
    return this.extractNodeIssues(rootNode);
  }

  /**
   * Get text content of a node
   */
  private getNodeText(node: SyntaxNode | null, content: string): string {
    if (!node) return '';
    return content.slice(node.startIndex, node.endIndex);
  }
}
