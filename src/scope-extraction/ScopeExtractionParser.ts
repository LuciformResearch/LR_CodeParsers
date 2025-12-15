/**
 * Scope Extraction Parser (Low-Level API)
 *
 * Parse TypeScript code and extract rich metadata for XML generation.
 * Optimized for scope extraction with full metadata collection.
 *
 * **Note**: This is a low-level API. For most use cases, prefer using:
 * - `TypeScriptLanguageParser` for TypeScript/JavaScript
 * - `PythonLanguageParser` for Python (use `PythonScopeExtractionParser` instead)
 *
 * The language-specific parsers implement a universal interface and are the recommended API.
 */

import { WasmLoader } from '../wasm/WasmLoader.js';
import type { SupportedLanguage } from '../wasm/types.js';
import type {
  ScopeInfo,
  ParameterInfo,
  VariableInfo,
  ClassMemberInfo,
  ReturnTypeInfo,
  ScopeFileAnalysis,
  ImportReference,
  IdentifierReference,
  HeritageClause,
  GenericParameter,
  DecoratorInfo,
  EnumMemberInfo
} from './types.js';

type SyntaxNode = any;

// Keywords and builtins to exclude from identifier references
const IDENTIFIER_STOP_WORDS = new Set([
  'if', 'for', 'while', 'return', 'const', 'let', 'var', 'function', 'class',
  'extends', 'implements', 'import', 'from', 'export', 'default', 'new', 'this',
  'super', 'await', 'async', 'switch', 'case', 'break', 'continue', 'try',
  'catch', 'finally', 'throw', 'true', 'false', 'null', 'undefined', 'typeof',
  'instanceof', 'in', 'of'
]);

const BUILTIN_IDENTIFIERS = new Set([
  'Number', 'String', 'Boolean', 'Object', 'Array', 'Map', 'Set',
  'Promise', 'Date', 'Error', 'console', 'Math', 'JSON', 'RegExp',
  'Symbol', 'isNaN'
]);

export class ScopeExtractionParser {
  private parser: any = null;
  private language: SupportedLanguage;
  private initialized: boolean = false;

  constructor(language: SupportedLanguage = 'typescript') {
    this.language = language;
  }

  /**
   * Initialize the parser using WasmLoader
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const { parser } = await WasmLoader.loadParser(this.language, {
        environment: 'node'
      });
      this.parser = parser;
      this.initialized = true;

      console.log(`✅ Scope Extraction Parser initialized (${this.language})`);
    } catch (error) {
      console.error(`❌ Failed to initialize Scope Extraction Parser:`, error);
      throw error;
    }
  }

  /**
   * Parse a file and extract structured scopes
   * @param resolver - Optional ImportResolver to properly detect path aliases from tsconfig
   */
  async parseFile(
    filePath: string,
    content: string,
    resolver?: { isPathAlias: (path: string) => boolean }
  ): Promise<ScopeFileAnalysis> {
    if (!this.initialized || !this.parser) {
      await this.initialize();
    }

    try {
      const tree = this.parser!.parse(content);
      const scopes: ScopeInfo[] = [];

      // Extract structured imports first
      const structuredImports = this.extractStructuredImports(content, resolver);

      // Extract all scopes with hierarchy
      this.extractScopes(tree.rootNode, scopes, content, 0, undefined, structuredImports, filePath);

      // Extract file-level scopes (code outside of defined scopes)
      const fileScopes = this.extractFileScopes(content, scopes, filePath, structuredImports);
      scopes.push(...fileScopes);

      // Sort scopes by start line to maintain order
      scopes.sort((a, b) => a.startLine - b.startLine);

      // Classify scope references (link identifiers to imports/local scopes)
      const scopeIndex = this.classifyScopeReferences(scopes, structuredImports);

      // Attach signature references (link return types to local scopes)
      this.attachSignatureReferences(scopes, scopeIndex);

      // Analyze file-level metadata
      const imports = structuredImports.length
        ? [...new Set(structuredImports.map(ref => ref.source))]
        : this.extractImports(content);
      const exports = this.extractExports(content);
      const dependencies = this.extractDependencies(content);
      const astValid = this.validateAST(tree.rootNode);
      const astIssues = this.extractASTIssues(tree.rootNode);

      const analysis: ScopeFileAnalysis = {
        filePath,
        scopes,
        totalLines: content.split('\n').length,
        totalScopes: scopes.length,
        imports,
        exports,
        dependencies,
        importReferences: structuredImports,
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
    scopes: ScopeInfo[],
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
        this.extractScopes(child, scopes, content, depth + 1, scope.name, fileImports, filePath);
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
        this.extractScopes(child, scopes, content, depth + 1, scope.name, fileImports, filePath);
      }
    } else if (node.type === 'lexical_declaration' || node.type === 'variable_declaration') {
      // Handle const/let/var declarations that might contain functions
      const constScopes = this.extractConstFunctions(node, content, depth, parent, fileImports);
      const globalVarScopes = this.extractGlobalVariables(node, content, depth, parent, fileImports);

      const extractedScopes = [...constScopes, ...globalVarScopes];

      if (extractedScopes.length === 0) {
        for (const child of node.children) {
          this.extractScopes(child, scopes, content, depth, parent, fileImports, filePath);
        }
      } else {
        for (const scope of extractedScopes) {
          scope.filePath = filePath;
          scopes.push(scope);
        }
      }
    } else {
      // Recursively process other children
      for (const child of node.children) {
        this.extractScopes(child, scopes, content, depth, parent, fileImports, filePath);
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
  ): ScopeInfo {
    const name = this.getNodeText(node.childForFieldName('name'), content) || 'AnonymousClass';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;

    // Only capture class definition line, not the entire body
    const lines = content.split('\n');
    const classDefLine = lines[startLine - 1];
    const nodeContent = classDefLine?.trim() || this.getNodeText(node, content);

    const modifiers = this.extractModifiers(node, content);
    const parameters = this.extractParameters(node, content);
    const returnType = this.extractReturnType(node, content);
    const returnTypeInfo = this.extractReturnTypeInfo(node, content);
    const signature = this.buildSignature('class', name, parameters, returnType, modifiers);
    const contentDedented = nodeContent; // Already a single line

    // Extract NEW metadata (Phase 3 improvements)
    const genericParameters = this.extractGenericParameters(node, content);
    const heritageClauses = this.extractHeritageClauses(node, content);
    const decoratorDetails = this.extractDecoratorDetails(node, content);

    // Build reference exclusions
    const referenceExclusions = this.buildReferenceExclusions(name, parameters);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));

    // Extract identifier references
    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

    // Extract class members (properties, methods, etc.)
    const members = this.extractClassMembers(node, content);

    // Extract variables in class scope
    const variables = this.extractVariables(node, content, name);

    const dependencies = this.extractDependencies(nodeContent);
    const exports = [name];
    const imports = importReferences.length
      ? [...new Set(importReferences.map(ref => ref.source))]
      : this.extractImports(nodeContent);
    const complexity = this.calculateComplexity(node);
    const linesOfCode = endLine - startLine + 1;
    const docstring = this.extractJSDoc(node, content);

    return {
      name,
      type: 'class',
      startLine,
      endLine,
      filePath: '',
      signature,
      parameters,
      returnType,
      returnTypeInfo,
      modifiers,
      genericParameters,
      heritageClauses,
      decoratorDetails,
      content: nodeContent,
      contentDedented,
      children: [], // Will be populated by recursive extraction
      members,
      variables,
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
      depth,
      docstring
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
  ): ScopeInfo {
    const name = this.getNodeText(node.childForFieldName('name'), content) || 'AnonymousInterface';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);

    const modifiers = this.extractModifiers(node, content);
    const parameters: ParameterInfo[] = [];
    const signature = this.buildSignature('interface', name, parameters, undefined, modifiers);
    const contentDedented = this.dedentContent(nodeContent);

    // Extract NEW metadata (Phase 3 improvements)
    const genericParameters = this.extractGenericParameters(node, content);
    const heritageClauses = this.extractHeritageClauses(node, content);
    const decoratorDetails = this.extractDecoratorDetails(node, content);

    // Build reference exclusions
    const referenceExclusions = this.buildReferenceExclusions(name, parameters);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));

    // Extract identifier references
    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

    const dependencies = this.extractDependencies(nodeContent);
    const exports = [name];
    const imports = importReferences.length
      ? [...new Set(importReferences.map(ref => ref.source))]
      : this.extractImports(nodeContent);
    const complexity = this.calculateComplexity(node);
    const linesOfCode = endLine - startLine + 1;
    const docstring = this.extractJSDoc(node, content);

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
      genericParameters,
      heritageClauses,
      decoratorDetails,
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
      depth,
      docstring
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
  ): ScopeInfo {
    const name = this.getNodeText(node.childForFieldName('name'), content) || 'AnonymousFunction';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);

    const modifiers = this.extractModifiers(node, content);
    const parameters = this.extractParameters(node, content);
    const returnType = this.extractReturnType(node, content);
    const returnTypeInfo = this.extractReturnTypeInfo(node, content);
    const signature = this.buildSignature('function', name, parameters, returnType, modifiers);
    const contentDedented = this.dedentContent(nodeContent);

    // Extract NEW metadata (Phase 3 improvements)
    const genericParameters = this.extractGenericParameters(node, content);
    const decoratorDetails = this.extractDecoratorDetails(node, content);

    // Build reference exclusions
    const referenceExclusions = this.buildReferenceExclusions(name, parameters);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));

    // Extract identifier references
    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

    // Extract variables in function scope
    const variables = this.extractVariables(node, content, name);

    const dependencies = this.extractDependencies(nodeContent);
    const exports = [name];
    const imports = importReferences.length
      ? [...new Set(importReferences.map(ref => ref.source))]
      : this.extractImports(nodeContent);
    const complexity = this.calculateComplexity(node);
    const linesOfCode = endLine - startLine + 1;
    const docstring = this.extractJSDoc(node, content);

    return {
      name,
      type: 'function',
      startLine,
      endLine,
      filePath: '',
      signature,
      parameters,
      returnTypeInfo,
      returnType,
      modifiers,
      genericParameters,
      decoratorDetails,
      content: nodeContent,
      contentDedented,
      children: [],
      variables,
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
      depth,
      docstring
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
  ): ScopeInfo {
    const name = this.getNodeText(node.childForFieldName('name'), content) || 'AnonymousMethod';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);

    const modifiers = this.extractModifiers(node, content);
    const parameters = this.extractParameters(node, content);
    const returnType = this.extractReturnType(node, content);
    const returnTypeInfo = this.extractReturnTypeInfo(node, content);
    const signature = this.buildSignature('method', name, parameters, returnType, modifiers);
    const contentDedented = this.dedentContent(nodeContent);

    // Extract NEW metadata (Phase 3 improvements)
    const genericParameters = this.extractGenericParameters(node, content);
    const decoratorDetails = this.extractDecoratorDetails(node, content);

    // Build reference exclusions
    const referenceExclusions = this.buildReferenceExclusions(name, parameters);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));

    // Extract identifier references
    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

    // Extract variables in method scope
    const variables = this.extractVariables(node, content, name);

    const dependencies = this.extractDependencies(nodeContent);
    const exports = [name];
    const imports = importReferences.length
      ? [...new Set(importReferences.map(ref => ref.source))]
      : this.extractImports(nodeContent);
    const complexity = this.calculateComplexity(node);
    const linesOfCode = endLine - startLine + 1;
    const docstring = this.extractJSDoc(node, content);

    return {
      name,
      type: 'method',
      startLine,
      endLine,
      filePath: '',
      signature,
      parameters,
      returnType,
      returnTypeInfo,
      modifiers,
      genericParameters,
      decoratorDetails,
      content: nodeContent,
      contentDedented,
      children: [],
      variables,
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
      depth,
      docstring
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
  ): ScopeInfo {
    const name = this.getNodeText(node.childForFieldName('name'), content) || 'AnonymousEnum';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);

    const modifiers = this.extractModifiers(node, content);
    const parameters: ParameterInfo[] = [];
    const signature = this.buildSignature('enum', name, parameters, undefined, modifiers);
    const contentDedented = this.dedentContent(nodeContent);

    // Extract NEW metadata (Phase 3 improvements)
    const enumMembers = this.extractEnumMembers(node, content);

    // Build reference exclusions
    const referenceExclusions = this.buildReferenceExclusions(name, parameters);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));

    // Extract identifier references
    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

    const dependencies = this.extractDependencies(nodeContent);
    const exports = [name];
    const imports = importReferences.length
      ? [...new Set(importReferences.map(ref => ref.source))]
      : this.extractImports(nodeContent);
    const complexity = this.calculateComplexity(node);
    const linesOfCode = endLine - startLine + 1;
    const docstring = this.extractJSDoc(node, content);

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
      enumMembers,
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
      depth,
      docstring
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
  ): ScopeInfo {
    const name = this.getNodeText(node.childForFieldName('name'), content) || 'AnonymousType';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);

    const modifiers = this.extractModifiers(node, content);
    const parameters: ParameterInfo[] = [];
    const signature = this.buildSignature('type_alias', name, parameters, undefined, modifiers);
    const contentDedented = this.dedentContent(nodeContent);

    // Build reference exclusions
    const referenceExclusions = this.buildReferenceExclusions(name, parameters);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));

    // Extract identifier references
    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

    const dependencies = this.extractDependencies(nodeContent);
    const exports = [name];
    const imports = importReferences.length
      ? [...new Set(importReferences.map(ref => ref.source))]
      : this.extractImports(nodeContent);
    const complexity = this.calculateComplexity(node);
    const linesOfCode = endLine - startLine + 1;
    const docstring = this.extractJSDoc(node, content);

    return {
      name,
      type: 'type_alias',
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
      depth,
      docstring
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
  ): ScopeInfo {
    const name = this.getNodeText(node.childForFieldName('name'), content) || 'AnonymousNamespace';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);

    const modifiers = this.extractModifiers(node, content);
    const parameters: ParameterInfo[] = [];
    const signature = this.buildSignature('namespace', name, parameters, undefined, modifiers);
    const contentDedented = this.dedentContent(nodeContent);

    // Build reference exclusions
    const referenceExclusions = this.buildReferenceExclusions(name, parameters);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));

    // Extract identifier references
    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

    const dependencies = this.extractDependencies(nodeContent);
    const exports = [name];
    const imports = importReferences.length
      ? [...new Set(importReferences.map(ref => ref.source))]
      : this.extractImports(nodeContent);
    const complexity = this.calculateComplexity(node);
    const linesOfCode = endLine - startLine + 1;
    const docstring = this.extractJSDoc(node, content);

    return {
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
      depth,
      docstring
    };
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
  ): ScopeInfo[] {
    const scopes: ScopeInfo[] = [];

    // Find all variable_declarator nodes
    const findDeclarators = (n: SyntaxNode): SyntaxNode[] => {
      if (n.type === 'variable_declarator') return [n];
      const declarators: SyntaxNode[] = [];
      for (const child of n.children) {
        declarators.push(...findDeclarators(child));
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
      const returnType = returnTypeNode ? this.getNodeText(returnTypeNode, content).replace(/^:\s*/, '').trim() : undefined;

      // Build signature
      const modifiers = this.extractModifiers(node.parent || node, content);
      const signature = this.buildSignature('const', name, parameters, returnType, modifiers);

      const contentDedented = this.dedentContent(nodeContent);

      // Build reference exclusions
      const referenceExclusions = this.buildReferenceExclusions(name, parameters);
      const localSymbols = this.collectLocalSymbols(valueNode, content);
      localSymbols.forEach(symbol => referenceExclusions.add(symbol));

      // Extract identifier references
      const identifierReferences = this.extractIdentifierReferences(valueNode, content, referenceExclusions);
      const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

      const dependencies = this.extractDependencies(nodeContent);
      const exports = [name];
      const imports = importReferences.length
        ? [...new Set(importReferences.map(ref => ref.source))]
        : this.extractImports(nodeContent);
      const complexity = this.calculateComplexity(valueNode);
      const linesOfCode = endLine - startLine + 1;
      // For const functions, JSDoc is on the parent declaration node
      const docstring = this.extractJSDoc(node, content);

      const scope: ScopeInfo = {
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
        depth,
        docstring
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
  ): ScopeInfo[] {
    // Only extract at module level (depth 0) and no parent
    if (depth !== 0 || parent) return [];

    const scopes: ScopeInfo[] = [];

    // Find all variable_declarator nodes
    const findDeclarators = (n: SyntaxNode): SyntaxNode[] => {
      if (n.type === 'variable_declarator') return [n];
      const declarators: SyntaxNode[] = [];
      for (const child of n.children) {
        declarators.push(...findDeclarators(child));
      }
      return declarators;
    };

    const declarators = findDeclarators(node);

    // Determine variable kind (const, let, var)
    let variableKind = 'const';
    if (node.type === 'variable_declaration') {
      const kindNode = node.children.find(c => c.type === 'const' || c.type === 'let' || c.type === 'var');
      if (kindNode) variableKind = kindNode.type;
    } else if (node.type === 'lexical_declaration') {
      const kindNode = node.children.find(c => c.type === 'const' || c.type === 'let');
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
      let variableType = typeNode ? this.getNodeText(typeNode, content).replace(/^:\s*/, '').trim() : undefined;

      // Build signature
      const modifiers = this.extractModifiers(node.parent || node, content);
      let signature = `${variableKind} ${name}`;
      if (variableType) {
        signature += `: ${variableType}`;
      }

      const contentDedented = this.dedentContent(nodeContent);

      // Build reference exclusions
      const referenceExclusions = new Set([name]);

      // Extract identifier references
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
      const docstring = this.extractJSDoc(node, content);

      const scope: ScopeInfo = {
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
        depth,
        docstring
      };

      scopes.push(scope);
    }

    return scopes;
  }

  /**
   * Extract modifiers (public, private, static, async, etc.)
   */
  private extractModifiers(node: SyntaxNode, content: string): string[] {
    const modifiers: string[] = [];

    for (const child of node.children) {
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
          let type: string | undefined;
          if (typeNode) {
            // Clean up the type annotation (remove leading ':')
            const rawType = this.getNodeText(typeNode, content);
            type = rawType.replace(/^:\s*/, '').trim();
          }

          const optional = child.type === 'optional_parameter';
          const defaultValue = optional ? this.getNodeText(child.childForFieldName('value'), content) : undefined;
          const line = child.startPosition.row + 1;
          const column = child.startPosition.column;

          if (name) {
            parameters.push({
              name,
              type,
              optional,
              defaultValue,
              line,
              column
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
    if (!returnTypeNode) return undefined;

    // Clean up the return type (remove leading ':')
    const rawType = this.getNodeText(returnTypeNode, content);
    return rawType.replace(/^:\s*/, '').trim();
  }

  /**
   * Extract return type with position information
   */
  private extractReturnTypeInfo(node: SyntaxNode, content: string): ReturnTypeInfo | undefined {
    const returnTypeNode = node.childForFieldName('return_type');
    if (!returnTypeNode) return undefined;

    // Clean up the return type (remove leading ':')
    const rawType = this.getNodeText(returnTypeNode, content);
    const type = rawType.replace(/^:\s*/, '').trim();

    return {
      type,
      line: returnTypeNode.startPosition.row + 1,
      column: returnTypeNode.startPosition.column
    };
  }

  /**
   * Extract heritage clauses (extends/implements)
   * Works for both classes and interfaces
   */
  private extractHeritageClauses(node: SyntaxNode, content: string): HeritageClause[] {
    const clauses: HeritageClause[] = [];


    // Look for extends clause - class_heritage contains extends_clause as child
    let extendsClause = node.children.find(child => child.type === 'class_heritage');
    if (extendsClause) {
      // For classes: class_heritage > extends_clause
      extendsClause = extendsClause.children.find(c => c.type === 'extends_clause');
    } else {
      // For interfaces: direct extends_type_clause
      extendsClause = node.children.find(child => child.type === 'extends_type_clause');
    }

    if (extendsClause) {
      const types: string[] = [];
      for (const child of extendsClause.children) {
        // Skip 'extends' keyword
        if (child.type === 'extends' || child.text === 'extends') continue;

        // Capture type references
        if (child.type === 'type_identifier' || child.type === 'identifier' ||
            child.type === 'member_expression' || child.type === 'generic_type') {
          const typeText = this.getNodeText(child, content).trim();
          if (typeText && typeText !== ',') {
            types.push(typeText);
          }
        }
      }

      if (types.length > 0) {
        clauses.push({
          clause: 'extends',
          types
        });
      }
    }

    // Look for implements clause (interfaces)
    const implementsClause = node.children.find(
      child => child.type === 'implements_clause' || child.type === 'class_implements_clause'
    );

    if (implementsClause) {
      const types: string[] = [];
      for (const child of implementsClause.children) {
        // Skip 'implements' keyword
        if (child.type === 'implements' || child.text === 'implements') continue;

        // Capture type references
        if (child.type === 'type_identifier' || child.type === 'identifier' ||
            child.type === 'member_expression' || child.type === 'generic_type') {
          const typeText = this.getNodeText(child, content).trim();
          if (typeText && typeText !== ',') {
            types.push(typeText);
          }
        }
      }

      if (types.length > 0) {
        clauses.push({
          clause: 'implements',
          types
        });
      }
    }

    return clauses;
  }

  /**
   * Extract generic/type parameters
   * Examples: <T>, <T extends Base>, <K extends keyof T = string>
   */
  private extractGenericParameters(node: SyntaxNode, content: string): GenericParameter[] {
    const params: GenericParameter[] = [];

    // Find type_parameters node
    const typeParamsNode = node.childForFieldName('type_parameters');
    if (!typeParamsNode) return params;

    for (const child of typeParamsNode.children) {
      if (child.type === 'type_parameter') {
        const nameNode = child.childForFieldName('name');
        if (!nameNode) continue;

        const name = this.getNodeText(nameNode, content);

        // Extract constraint (extends clause)
        const constraintNode = child.childForFieldName('constraint');
        const constraint = constraintNode ? this.getNodeText(constraintNode, content) : undefined;

        // Extract default type
        const defaultNode = child.childForFieldName('default_type') || child.childForFieldName('default');
        const defaultType = defaultNode ? this.getNodeText(defaultNode, content) : undefined;

        params.push({
          name,
          constraint,
          defaultType
        });
      }
    }

    return params;
  }

  /**
   * Extract decorator details with arguments
   * Works for both TypeScript and Python decorators
   */
  private extractDecoratorDetails(node: SyntaxNode, content: string): DecoratorInfo[] {
    const decorators: DecoratorInfo[] = [];

    for (const child of node.children) {
      if (child.type === 'decorator') {
        const nameNode = child.children.find(
          n => n.type === 'identifier' || n.type === 'call_expression'
        );

        if (!nameNode) continue;

        let name: string;
        let args: string | undefined;

        if (nameNode.type === 'call_expression') {
          // Decorator with arguments: @Entity({ tableName: 'users' })
          const funcNode = nameNode.childForFieldName('function');
          name = funcNode ? this.getNodeText(funcNode, content) : '';

          const argsNode = nameNode.childForFieldName('arguments');
          args = argsNode ? this.getNodeText(argsNode, content) : undefined;
        } else {
          // Simple decorator: @Injectable
          name = this.getNodeText(nameNode, content);
        }

        decorators.push({
          name: name.replace(/^@/, ''), // Remove @ prefix
          arguments: args,
          line: child.startPosition.row + 1
        });
      }
    }

    return decorators;
  }

  /**
   * Extract enum members with values
   */
  private extractEnumMembers(enumNode: SyntaxNode, content: string): EnumMemberInfo[] {
    const members: EnumMemberInfo[] = [];

    const bodyNode = enumNode.childForFieldName('body');
    if (!bodyNode) return members;

    for (const child of bodyNode.children) {
      if (child.type === 'property_identifier' || child.type === 'enum_assignment') {
        const nameNode = child.type === 'enum_assignment'
          ? child.childForFieldName('name')
          : child;

        if (!nameNode) continue;

        const name = this.getNodeText(nameNode, content);

        // Extract value if present
        let value: string | number | undefined;
        if (child.type === 'enum_assignment') {
          const valueNode = child.childForFieldName('value');
          if (valueNode) {
            const valueText = this.getNodeText(valueNode, content);
            // Try to parse as number
            const numValue = Number(valueText);
            value = isNaN(numValue) ? valueText.replace(/['"]/g, '') : numValue;
          }
        }

        members.push({
          name,
          value,
          line: child.startPosition.row + 1
        });
      }
    }

    return members;
  }

  /**
   * Extract class members (properties, methods, constructors, getters, setters)
   */
  private extractClassMembers(classNode: SyntaxNode, content: string): ClassMemberInfo[] {
    const members: ClassMemberInfo[] = [];
    const bodyNode = classNode.childForFieldName('body');

    if (!bodyNode) return members;

    for (const child of bodyNode.children) {
      let member: ClassMemberInfo | null = null;

      if (child.type === 'public_field_definition' || child.type === 'property_declaration') {
        // Property
        const nameNode = child.childForFieldName('name');
        const name = nameNode ? this.getNodeText(nameNode, content) : 'unknown';
        const typeNode = child.childForFieldName('type');
        const type = typeNode ? this.getNodeText(typeNode, content).replace(/^:\s*/, '').trim() : undefined;

        const accessibility = this.extractAccessibility(child);
        const isStatic = this.hasModifier(child, 'static');
        const isReadonly = this.hasModifier(child, 'readonly');

        member = {
          name,
          type,
          memberType: 'property',
          accessibility,
          isStatic,
          isReadonly,
          line: child.startPosition.row + 1
        };
      } else if (child.type === 'method_definition') {
        // Method
        const nameNode = child.childForFieldName('name');
        const name = nameNode ? this.getNodeText(nameNode, content) : 'unknown';
        const parameters = this.extractParameters(child, content);
        const returnType = this.extractReturnType(child, content);
        const signature = this.buildMethodSignature(name, parameters, returnType);

        const accessibility = this.extractAccessibility(child);
        const isStatic = this.hasModifier(child, 'static');

        member = {
          name,
          type: returnType,
          memberType: 'method',
          accessibility,
          isStatic,
          isReadonly: false,
          line: child.startPosition.row + 1,
          signature
        };
      } else if (child.type === 'method_signature') {
        // Method signature (interface)
        const nameNode = child.childForFieldName('name');
        const name = nameNode ? this.getNodeText(nameNode, content) : 'unknown';
        const parameters = this.extractParameters(child, content);
        const returnType = this.extractReturnType(child, content);
        const signature = this.buildMethodSignature(name, parameters, returnType);

        member = {
          name,
          type: returnType,
          memberType: 'method',
          isStatic: false,
          isReadonly: false,
          line: child.startPosition.row + 1,
          signature
        };
      }

      if (member) {
        members.push(member);
      }
    }

    return members;
  }

  /**
   * Extract accessibility modifier from a node
   */
  private extractAccessibility(node: SyntaxNode): 'public' | 'private' | 'protected' | undefined {
    for (const child of node.children) {
      if (child.type === 'accessibility_modifier') {
        const text = child.text;
        if (text === 'public' || text === 'private' || text === 'protected') {
          return text;
        }
      }
    }
    return undefined;
  }

  /**
   * Check if node has a specific modifier
   */
  private hasModifier(node: SyntaxNode, modifier: string): boolean {
    for (const child of node.children) {
      if (child.type === modifier || child.text === modifier) {
        return true;
      }
    }
    return false;
  }

  /**
   * Build method signature string
   */
  private buildMethodSignature(name: string, parameters: ParameterInfo[], returnType?: string): string {
    const paramsStr = parameters.map(p => {
      let param = p.name;
      if (p.type) param += `: ${p.type}`;
      if (p.optional) param += '?';
      if (p.defaultValue) param += ` = ${p.defaultValue}`;
      return param;
    }).join(', ');

    const returnStr = returnType ? `: ${returnType}` : '';
    return `${name}(${paramsStr})${returnStr}`;
  }

  /**
   * Extract variables declared in a scope
   */
  private extractVariables(node: SyntaxNode, content: string, scopeName: string): VariableInfo[] {
    const variables: VariableInfo[] = [];

    const traverse = (n: SyntaxNode) => {
      if (n.type === 'variable_declaration') {
        const kind = this.getVariableKind(n);
        const declarators = this.findChildrenByType(n, 'variable_declarator');

        for (const declarator of declarators) {
          const nameNode = declarator.childForFieldName('name');
          const typeNode = declarator.childForFieldName('type');

          if (nameNode) {
            const name = this.getNodeText(nameNode, content);
            const type = typeNode ? this.getNodeText(typeNode, content).replace(/^:\s*/, '').trim() : undefined;

            variables.push({
              name,
              type,
              kind,
              line: declarator.startPosition.row + 1,
              scope: scopeName
            });
          }
        }
      }

      // Don't traverse into nested scopes (functions, classes, etc.)
      if (!this.isNestedScope(n)) {
        for (const child of n.children) {
          traverse(child);
        }
      }
    };

    traverse(node);
    return variables;
  }

  /**
   * Get variable kind (const, let, var)
   */
  private getVariableKind(node: SyntaxNode): 'const' | 'let' | 'var' {
    for (const child of node.children) {
      if (child.text === 'const') return 'const';
      if (child.text === 'let') return 'let';
      if (child.text === 'var') return 'var';
    }
    return 'let'; // default
  }

  /**
   * Check if node represents a nested scope
   */
  private isNestedScope(node: SyntaxNode): boolean {
    return [
      'class_declaration',
      'function_declaration',
      'method_definition',
      'arrow_function',
      'function_expression'
    ].includes(node.type);
  }

  /**
   * Find children by type
   */
  private findChildrenByType(node: SyntaxNode, type: string): SyntaxNode[] {
    const results: SyntaxNode[] = [];
    for (const child of node.children) {
      if (child.type === type) {
        results.push(child);
      }
    }
    return results;
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
    // Only include type keyword for: function, class, interface, enum, type, namespace, const
    const typeKeyword = type === 'method' ? '' : `${type} `;

    return `${modStr}${typeKeyword}${name}(${paramsStr})${returnStr}`;
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
    const imports: string[] = [];
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    return [...new Set(imports)];
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
        count += countNodes(child);
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

  /**
   * Build reference exclusions set for identifier extraction
   */
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

  /**
   * Collect local symbols (definitions) from a node
   */
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

  /**
   * Get property access parts (object and property nodes)
   */
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

  /**
   * Extract identifier references from a node
   */
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

  /**
   * Check if an identifier node is a definition (not a reference)
   */
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

  /**
   * Resolve imports for a scope based on identifier references
   */
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

  /**
   * Extract structured imports from content
   */
  private extractStructuredImports(
    content: string,
    resolver?: { isPathAlias: (path: string) => boolean }
  ): ImportReference[] {
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

  /**
   * Split import specification by comma (respecting braces)
   */
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

  /**
   * Get a specific line from content
   */
  private getLineFromContent(content: string, lineNumber: number): string | undefined {
    const lines = content.split('\n');
    return lines[lineNumber - 1]?.trim();
  }

  /**
   * Classify scope references (link identifiers to imports/local scopes)
   */
  private classifyScopeReferences(
    scopes: ScopeInfo[],
    fileImports: ImportReference[]
  ): Map<string, ScopeInfo[]> {
    const aliasMap = new Map<string, ImportReference>();
    for (const imp of fileImports) {
      const key = imp.alias ?? imp.imported;
      if (key) {
        aliasMap.set(key, imp);
      }
    }

    const scopeIndex = new Map<string, ScopeInfo[]>();
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

  /**
   * Attach signature references (link return types to local scopes)
   */
  private attachSignatureReferences(
    scopes: ScopeInfo[],
    scopeIndex: Map<string, ScopeInfo[]>
  ): void {
    for (const scope of scopes) {
      const returnType = this.extractBaseTypeIdentifier(scope.returnType);
      if (!returnType) continue;
      const targets = scopeIndex.get(returnType);
      if (!targets || !targets.length) continue;
      const target = targets[0];
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
    scopes: ScopeInfo[],
    scopeIndex: Map<string, ScopeInfo[]>
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

  /**
   * Extract base type identifier from a type string
   */
  private extractBaseTypeIdentifier(type?: string): string | undefined {
    if (!type) return undefined;
    const cleaned = type.trim();
    if (!cleaned) return undefined;
    const match = cleaned.match(/^[A-Za-z0-9_]+/);
    return match ? match[0] : undefined;
  }

  /**
   * Extract JSDoc comment preceding a node (TypeScript/JavaScript)
   * Looks for JSDoc comments (starting with slash-star-star) immediately before the node
   */
  private extractJSDoc(node: SyntaxNode, content: string): string | undefined {
    // Get the previous sibling or check parent's children
    let prevSibling = node.previousSibling;

    // Skip over decorators to find the JSDoc
    while (prevSibling && prevSibling.type === 'decorator') {
      prevSibling = prevSibling.previousSibling;
    }

    // Check if previous sibling is a comment
    if (prevSibling && prevSibling.type === 'comment') {
      const commentText = this.getNodeText(prevSibling, content);
      // Check if it's a JSDoc comment (starts with /**)
      if (commentText.startsWith('/**')) {
        return this.cleanJSDoc(commentText);
      }
    }

    // Also check the content before the node for inline JSDoc
    const startPos = node.startPosition;
    const lines = content.split('\n');

    // Look at previous lines for JSDoc
    let jsdocLines: string[] = [];
    let inJSDoc = false;

    for (let i = startPos.row - 1; i >= 0 && i >= startPos.row - 20; i--) {
      const line = lines[i]?.trim() || '';

      if (line.endsWith('*/')) {
        inJSDoc = true;
        jsdocLines.unshift(line);
      } else if (inJSDoc) {
        jsdocLines.unshift(line);
        if (line.startsWith('/**')) {
          // Found the start of JSDoc
          return this.cleanJSDoc(jsdocLines.join('\n'));
        }
      } else if (line && !line.startsWith('@') && !line.startsWith('export') && !line.startsWith('//')) {
        // Non-empty non-decorator line before JSDoc, stop looking
        break;
      }
    }

    return undefined;
  }

  /**
   * Clean JSDoc comment by removing comment markers and formatting
   */
  private cleanJSDoc(jsdoc: string): string {
    return jsdoc
      .replace(/^\/\*\*\s*/, '')  // Remove opening /**
      .replace(/\s*\*\/$/, '')     // Remove closing */
      .split('\n')
      .map(line => line.replace(/^\s*\*\s?/, '')) // Remove leading * from each line
      .join('\n')
      .trim();
  }

  /**
   * Extract file-level scopes (code outside of defined scopes like functions, classes, etc.)
   * This captures top-level code, variable declarations, object literals, etc.
   */
  private extractFileScopes(
    content: string,
    existingScopes: ScopeInfo[],
    filePath: string,
    fileImports: ImportReference[]
  ): ScopeInfo[] {
    const fileScopes: ScopeInfo[] = [];
    const lines = content.split('\n');
    const totalLines = lines.length;

    // Sort existing scopes by start line
    const sortedScopes = [...existingScopes].sort((a, b) => a.startLine - b.startLine);

    // Find gaps between scopes
    let currentLine = 1;
    let fileScopeIndex = 1;

    for (const scope of sortedScopes) {
      // If there's a gap before this scope, extract it
      if (scope.startLine > currentLine) {
        const gapStart = currentLine;
        const gapEnd = scope.startLine - 1;

        // Extract the code in this gap
        const gapContent = lines.slice(gapStart - 1, gapEnd).join('\n').trim();

        // Only create a file scope if there's meaningful content (not just whitespace/comments)
        if (this.hasMeaningfulContent(gapContent)) {
          const fileScope = this.createFileScope(
            gapContent,
            gapStart,
            gapEnd,
            filePath,
            fileScopeIndex++,
            fileImports
          );
          fileScopes.push(fileScope);
        }
      }

      // Move to after this scope
      currentLine = Math.max(currentLine, scope.endLine + 1);
    }

    // Check for code after the last scope
    if (currentLine <= totalLines) {
      const gapContent = lines.slice(currentLine - 1).join('\n').trim();
      if (this.hasMeaningfulContent(gapContent)) {
        const fileScope = this.createFileScope(
          gapContent,
          currentLine,
          totalLines,
          filePath,
          fileScopeIndex++,
          fileImports
        );
        fileScopes.push(fileScope);
      }
    }

    return fileScopes;
  }

  /**
   * Check if content has meaningful code (not just whitespace/comments)
   */
  private hasMeaningfulContent(content: string): boolean {
    const trimmed = content.trim();
    if (!trimmed) return false;

    // Remove comments and whitespace
    const withoutComments = trimmed
      .replace(/\/\/.*$/gm, '') // Remove single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
      .trim();

    return withoutComments.length > 0;
  }

  /**
   * Create a file scope from code content
   */
  private createFileScope(
    content: string,
    startLine: number,
    endLine: number,
    filePath: string,
    index: number,
    fileImports: ImportReference[]
  ): ScopeInfo {
    const name = `file_scope_${String(index).padStart(2, '0')}`;
    const linesOfCode = endLine - startLine + 1;

    // Extract variables declared in this scope
    const variables = this.extractTopLevelVariables(content, startLine);

    // Extract identifier references
    const referenceExclusions = new Set<string>();
    const identifierReferences = this.extractIdentifierReferencesFromText(content, referenceExclusions, startLine);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

    // Extract dependencies
    const dependencies = this.extractDependencies(content);
    const imports = importReferences.length
      ? [...new Set(importReferences.map(ref => ref.source))]
      : this.extractImports(content);

    // Build signature (first meaningful line)
    const firstLine = content.split('\n')[0]?.trim() || '';
    const signature = firstLine.length > 80 ? firstLine.substring(0, 77) + '...' : firstLine;

    return {
      name,
      type: 'module', // Use 'module' type for file-level code
      startLine,
      endLine,
      filePath,
      signature,
      parameters: [],
      modifiers: [],
      content,
      contentDedented: content,
      children: [],
      variables,
      dependencies,
      exports: [],
      imports,
      importReferences,
      identifierReferences,
      astValid: true,
      astIssues: [],
      astNotes: [],
      complexity: 1,
      linesOfCode,
      parent: undefined,
      depth: 0,
      docstring: undefined
    };
  }

  /**
   * Extract top-level variables from content
   */
  private extractTopLevelVariables(content: string, baseLine: number): VariableInfo[] {
    const variables: VariableInfo[] = [];
    const lines = content.split('\n');

    // Match const/let/var declarations
    const varPattern = /^\s*(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/;
    
    lines.forEach((line, index) => {
      const match = line.match(varPattern);
      if (match) {
        variables.push({
          name: match[2],
          kind: match[1] as 'const' | 'let' | 'var',
          line: baseLine + index,
          scope: 'file_scope'
        });
      }
    });

    return variables;
  }

  /**
   * Extract identifier references from text (simplified version)
   */
  private extractIdentifierReferencesFromText(
    content: string,
    exclusions: Set<string>,
    baseLine: number
  ): IdentifierReference[] {
    const references: IdentifierReference[] = [];
    const lines = content.split('\n');

    // Simple identifier extraction (can be improved)
    const identifierPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;

    lines.forEach((line, lineIndex) => {
      let match;
      while ((match = identifierPattern.exec(line)) !== null) {
        const identifier = match[1];
        
        // Skip if excluded or is a keyword
        if (exclusions.has(identifier) || IDENTIFIER_STOP_WORDS.has(identifier)) {
          continue;
        }

        references.push({
          identifier,
          line: baseLine + lineIndex,
          column: match.index,
          kind: 'unknown'
        });
      }
    });

    return references;
  }
}
