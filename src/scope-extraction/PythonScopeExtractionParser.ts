/**
 * Python Scope Extraction Parser (Low-Level API)
 *
 * Parse Python code and extract rich metadata for XML generation.
 * Optimized for scope extraction with full metadata collection.
 *
 * **Note**: This is a low-level API. For most use cases, prefer using:
 * - `PythonLanguageParser` - Implements the universal interface and is the recommended API
 *
 * The language-specific parser provides a consistent interface across languages.
 */

import { WasmLoader } from '../wasm/WasmLoader.js';
import type { SupportedLanguage } from '../wasm/types.js';
import type {
  ScopeInfo,
  ParameterInfo,
  VariableInfo,
  ReturnTypeInfo,
  ScopeFileAnalysis,
  ImportReference,
  IdentifierReference
} from './types.js';

type SyntaxNode = any;

// Python keywords and builtins to exclude from identifier references
const IDENTIFIER_STOP_WORDS = new Set([
  'and', 'as', 'assert', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else',
  'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda',
  'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
  'True', 'False', 'None', 'async', 'await', 'match', 'case'
]);

const BUILTIN_IDENTIFIERS = new Set([
  'print', 'len', 'range', 'str', 'int', 'float', 'bool', 'list', 'dict', 'tuple',
  'set', 'frozenset', 'type', 'object', 'super', 'property', 'staticmethod', 'classmethod',
  'enumerate', 'zip', 'map', 'filter', 'sorted', 'reversed', 'sum', 'min', 'max',
  'abs', 'all', 'any', 'ascii', 'bin', 'callable', 'chr', 'compile', 'delattr',
  'dir', 'divmod', 'eval', 'exec', 'format', 'getattr', 'globals', 'hasattr',
  'hash', 'help', 'hex', 'id', 'input', 'isinstance', 'issubclass', 'iter',
  'locals', 'next', 'oct', 'open', 'ord', 'pow', 'repr', 'round', 'setattr', 'slice',
  'bytes', 'bytearray', 'memoryview', 'complex', 'Exception', 'ValueError', 'TypeError',
  'KeyError', 'IndexError', 'AttributeError', 'ImportError', 'ModuleNotFoundError'
]);


export class PythonScopeExtractionParser {
  private parser: any = null;
  private language: SupportedLanguage;
  private initialized: boolean = false;

  constructor(language: SupportedLanguage = 'python') {
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
   */
  async parseFile(
    filePath: string,
    content: string
  ): Promise<ScopeFileAnalysis> {
    if (!this.initialized || !this.parser) {
      await this.initialize();
    }

    console.log(`⏳ Parsing ${filePath}...`);
    try {
      const tree = this.parser!.parse(content);
      const scopes: ScopeInfo[] = [];

      // Extract structured imports first
      const structuredImports = this.extractStructuredImports(content);

      // Extract TypeVar bounds (T = TypeVar('T', bound=SomeClass))
      const typeVarBounds = this.extractTypeVarBounds(content);

      // Extract all scopes with hierarchy
      this.extractScopes(tree.rootNode, scopes, content, 0, undefined, structuredImports, filePath);

      // Classify scope references (link identifiers to imports/local scopes)
      const scopeIndex = this.classifyScopeReferences(scopes, structuredImports, typeVarBounds);

      // Attach signature references (link return types/params to local scopes AND imports)
      this.attachSignatureReferences(scopes, scopeIndex, structuredImports);

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
    if (node.type === 'class_definition') {
      const scope = this.extractClass(node, content, depth, parent, fileImports);
      scope.filePath = filePath;
      scopes.push(scope);

      // Extract methods from class body
      const bodyNode = node.childForFieldName('body');
      if (bodyNode) {
        for (const child of bodyNode.children) {
          this.extractScopes(child, scopes, content, depth + 1, scope.name, fileImports, filePath);
        }
      }
    } else if (node.type === 'function_definition') {
      const isMethod = this.isInsideClass(node);
      const scope = isMethod
        ? this.extractMethod(node, content, depth, parent, fileImports)
        : this.extractFunction(node, content, depth, parent, fileImports);
      scope.filePath = filePath;
      scopes.push(scope);
    } else if (node.type === 'decorated_definition') {
      // Handle @decorator def foo(): ...
      const decorators = this.extractDecorators(node, content);
      const funcNode = node.children.find(c => c.type === 'function_definition');
      const classNode = node.children.find(c => c.type === 'class_definition');

      if (funcNode) {
        const isMethod = this.isInsideClass(node);
        const scope = isMethod
          ? this.extractMethod(funcNode, content, depth, parent, fileImports)
          : this.extractFunction(funcNode, content, depth, parent, fileImports);
        scope.decorators = decorators;
        scope.filePath = filePath;
        scopes.push(scope);
      } else if (classNode) {
        const scope = this.extractClass(classNode, content, depth, parent, fileImports);
        scope.decorators = decorators;
        scope.filePath = filePath;
        scopes.push(scope);

        // Extract methods from class body
        const bodyNode = classNode.childForFieldName('body');
        if (bodyNode) {
          for (const child of bodyNode.children) {
            this.extractScopes(child, scopes, content, depth + 1, scope.name, fileImports, filePath);
          }
        }
      }
    } else if (node.type === 'expression_statement') {
      // Check for lambda assignments: square = lambda x: x ** 2
      const assignmentNode = node.children.find(c => c.type === 'assignment');
      if (assignmentNode && this.hasLambda(assignmentNode)) {
        const lambdaScope = this.extractLambdaAssignment(assignmentNode, content, depth, parent, fileImports);
        if (lambdaScope) {
          lambdaScope.filePath = filePath;
          scopes.push(lambdaScope);
        }
      } else if (assignmentNode && depth === 0 && !parent) {
        // Handle global variable assignments
        const variableScope = this.extractGlobalVariable(assignmentNode, content, fileImports);
        if (variableScope) {
          variableScope.filePath = filePath;
          scopes.push(variableScope);
        }
      } else {
        // Recurse for other node types
        for (const child of node.children) {
          this.extractScopes(child, scopes, content, depth, parent, fileImports, filePath);
        }
      }
    } else {
      // Recurse for other node types
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
    const nameNode = node.childForFieldName('name');
    const name = nameNode ? this.getNodeText(nameNode, content) : 'AnonymousClass';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;

    // Only capture class definition line, not the entire body
    const lines = content.split('\n');
    const classDefLine = lines[startLine - 1];
    const nodeContent = classDefLine?.trim() || this.getNodeText(node, content);

    // Build signature with base classes if present
    const superclassesNode = node.childForFieldName('superclasses');
    let signature = `class ${name}`;
    if (superclassesNode) {
      signature += this.getNodeText(superclassesNode, content);
    }

    const parameters: ParameterInfo[] = [];
    const modifiers: string[] = [];
    const contentDedented = nodeContent; // Already a single line
    const docstring = this.extractDocstring(node, content);

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

    return {
      name,
      type: 'class',
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
      decorators: [],
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
    const nameNode = node.childForFieldName('name');
    const name = nameNode ? this.getNodeText(nameNode, content) : 'anonymous';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);

    const modifiers: string[] = [];
    const parameters = this.extractParameters(node, content);
    const returnType = this.extractReturnType(node, content);
    const signature = this.buildSignature('def', name, parameters, returnType);
    const contentDedented = this.dedentContent(nodeContent);
    const docstring = this.extractDocstring(node, content);

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
      decorators: [],
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
    const scope = this.extractFunction(node, content, depth, parent, fileImports);
    scope.type = 'method';
    return scope;
  }

  /**
   * Extract lambda assignment information
   */
  private extractLambdaAssignment(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): ScopeInfo | null {
    const leftNode = node.childForFieldName('left');
    const rightNode = node.childForFieldName('right');

    if (!leftNode || !rightNode || rightNode.type !== 'lambda') return null;

    const name = this.getNodeText(leftNode, content);
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);

    const parameters = this.extractLambdaParameters(rightNode, content);
    const signature = `${name} = lambda ${parameters.map(p => p.name).join(', ')}: ...`;
    const contentDedented = this.dedentContent(nodeContent);

    // Build reference exclusions
    const referenceExclusions = this.buildReferenceExclusions(name, parameters);

    // Extract identifier references
    const identifierReferences = this.extractIdentifierReferences(rightNode, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

    const dependencies = this.extractDependencies(nodeContent);
    const exports = [name];
    const imports = importReferences.length
      ? [...new Set(importReferences.map(ref => ref.source))]
      : this.extractImports(nodeContent);
    const complexity = 1;
    const linesOfCode = endLine - startLine + 1;

    return {
      name,
      type: 'lambda',
      startLine,
      endLine,
      filePath: '',
      signature,
      parameters,
      returnType: undefined,
      modifiers: [],
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
      decorators: []
    };
  }

  /**
   * Extract global variable/constant information
   */
  private extractGlobalVariable(
    node: SyntaxNode,
    content: string,
    fileImports: ImportReference[]
  ): ScopeInfo | null {
    const leftNode = node.childForFieldName('left');
    const rightNode = node.childForFieldName('right');

    if (!leftNode || !rightNode) return null;

    // Get variable name (support simple identifiers)
    let name: string;
    if (leftNode.type === 'identifier') {
      name = this.getNodeText(leftNode, content);
    } else {
      // Skip tuple unpacking and other patterns
      return null;
    }

    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    const value = this.getNodeText(rightNode, content);

    // Determine if it's a constant (ALL_CAPS convention) or variable
    const isConstant = name === name.toUpperCase() && name.includes('_');
    const type: 'variable' | 'constant' = isConstant ? 'constant' : 'variable';

    const signature = `${name} = ${value.length > 50 ? value.substring(0, 50) + '...' : value}`;
    const contentDedented = this.dedentContent(nodeContent);

    // Build reference exclusions
    const referenceExclusions = new Set([name]);

    // Extract identifier references
    const identifierReferences = this.extractIdentifierReferences(rightNode, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

    const dependencies = this.extractDependencies(nodeContent);
    const exports = [name];
    const imports = importReferences.length
      ? [...new Set(importReferences.map(ref => ref.source))]
      : this.extractImports(nodeContent);
    const linesOfCode = endLine - startLine + 1;

    return {
      name,
      type,
      startLine,
      endLine,
      filePath: '',
      signature,
      parameters: [],
      returnType: undefined,
      modifiers: [],
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
      complexity: 1,
      linesOfCode,
      parent: undefined,
      depth: 0,
      decorators: [],
      value
    };
  }

  /**
   * Extract function parameters with type information
   */
  private extractParameters(node: SyntaxNode, content: string): ParameterInfo[] {
    const parameters: ParameterInfo[] = [];
    const paramsNode = node.childForFieldName('parameters');

    if (!paramsNode) return parameters;

    for (const child of paramsNode.children) {
      if (child.type === 'typed_parameter') {
        const nameNode = child.children.find(c => c.type === 'identifier');
        const typeNode = child.children.find(c => c.type === 'type');
        const name = nameNode ? this.getNodeText(nameNode, content) : '';
        const type = typeNode ? this.getNodeText(typeNode, content) : undefined;

        if (name && name !== 'self' && name !== 'cls') {
          parameters.push({
            name,
            type,
            optional: false,
            line: child.startPosition.row + 1,
            column: child.startPosition.column
          });
        }
      } else if (child.type === 'identifier') {
        const name = this.getNodeText(child, content);
        if (name && name !== 'self' && name !== 'cls') {
          parameters.push({
            name,
            optional: false,
            line: child.startPosition.row + 1,
            column: child.startPosition.column
          });
        }
      } else if (child.type === 'default_parameter') {
        const nameNode = child.childForFieldName('name');
        const valueNode = child.childForFieldName('value');
        const name = nameNode ? this.getNodeText(nameNode, content) : '';
        const defaultValue = valueNode ? this.getNodeText(valueNode, content) : undefined;

        if (name && name !== 'self' && name !== 'cls') {
          parameters.push({
            name,
            optional: true,
            defaultValue,
            line: child.startPosition.row + 1,
            column: child.startPosition.column
          });
        }
      } else if (child.type === 'typed_default_parameter') {
        const nameNode = child.childForFieldName('name');
        const typeNode = child.childForFieldName('type');
        const valueNode = child.childForFieldName('value');
        const name = nameNode ? this.getNodeText(nameNode, content) : '';
        const type = typeNode ? this.getNodeText(typeNode, content) : undefined;
        const defaultValue = valueNode ? this.getNodeText(valueNode, content) : undefined;

        if (name && name !== 'self' && name !== 'cls') {
          parameters.push({
            name,
            type,
            optional: true,
            defaultValue,
            line: child.startPosition.row + 1,
            column: child.startPosition.column
          });
        }
      }
    }

    return parameters;
  }

  /**
   * Extract lambda parameters
   */
  private extractLambdaParameters(lambdaNode: SyntaxNode, content: string): ParameterInfo[] {
    const parameters: ParameterInfo[] = [];
    const paramsNode = lambdaNode.childForFieldName('parameters');

    if (!paramsNode) return parameters;

    if (paramsNode.type === 'lambda_parameters') {
      for (const child of paramsNode.children) {
        if (child.type === 'identifier') {
          const name = this.getNodeText(child, content);
          if (name) {
            parameters.push({
              name,
              optional: false,
              line: child.startPosition.row + 1,
              column: child.startPosition.column
            });
          }
        }
      }
    }

    return parameters;
  }

  /**
   * Extract return type from function definition
   */
  private extractReturnType(node: SyntaxNode, content: string): string | undefined {
    const returnTypeNode = node.childForFieldName('return_type');
    return returnTypeNode ? this.getNodeText(returnTypeNode, content) : undefined;
  }

  /**
   * Extract decorators from decorated definition
   */
  private extractDecorators(node: SyntaxNode, content: string): string[] {
    const decorators: string[] = [];

    for (const child of node.children) {
      if (child.type === 'decorator') {
        decorators.push(this.getNodeText(child, content));
      }
    }

    return decorators;
  }

  /**
   * Extract docstring from function/class body
   */
  private extractDocstring(node: SyntaxNode, content: string): string | undefined {
    const bodyNode = node.childForFieldName('body');
    if (!bodyNode) return undefined;

    const firstChild = bodyNode.children[0];
    if (firstChild?.type === 'expression_statement') {
      const stringNode = firstChild.children.find(c => c.type === 'string');
      if (stringNode) {
        const text = this.getNodeText(stringNode, content);
        // Remove quotes
        return text.replace(/^["']{1,3}|["']{1,3}$/g, '').trim();
      }
    }

    return undefined;
  }

  /**
   * Extract variables declared in a scope
   */
  private extractVariables(node: SyntaxNode, content: string, scopeName: string): VariableInfo[] {
    const variables: VariableInfo[] = [];

    const traverse = (n: SyntaxNode, inNestedScope: boolean = false) => {
      // Stop at nested function/class definitions
      if (inNestedScope || this.isNestedScope(n)) {
        return;
      }

      if (n.type === 'assignment') {
        const leftNode = n.childForFieldName('left');
        if (leftNode && leftNode.type === 'identifier') {
          const name = this.getNodeText(leftNode, content);
          if (name) {
            variables.push({
              name,
              kind: 'var', // Python doesn't have const/let, use 'var' as default
              line: n.startPosition.row + 1,
              scope: scopeName
            });
          }
        }
      }

      // Recurse into children
      for (const child of n.children) {
        traverse(child, inNestedScope);
      }
    };

    traverse(node);
    return variables;
  }

  /**
   * Check if node represents a nested scope
   */
  private isNestedScope(node: SyntaxNode): boolean {
    return [
      'class_definition',
      'function_definition',
      'lambda'
    ].includes(node.type);
  }

  /**
   * Build signature string
   */
  private buildSignature(
    kind: string,
    name: string,
    parameters: ParameterInfo[],
    returnType?: string
  ): string {
    const params = parameters.map(p => {
      let param = p.name;
      if (p.type) param += `: ${p.type}`;
      if (p.defaultValue) param += ` = ${p.defaultValue}`;
      return param;
    }).join(', ');

    let sig = `${kind} ${name}(${params})`;
    if (returnType) sig += ` -> ${returnType}`;

    return sig;
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
   * Extract dependencies from content (import statements)
   */
  private extractDependencies(content: string): string[] {
    const dependencies: string[] = [];

    // Match import patterns
    const importPatterns = [
      /^import\s+(\S+)/gm,
      /^from\s+(\S+)\s+import/gm
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
    const importRegex = /^(?:import\s+(\S+)|from\s+(\S+)\s+import)/gm;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1] || match[2]);
    }

    return [...new Set(imports)];
  }

  /**
   * Extract exports from content (Python doesn't have explicit exports like JS)
   */
  private extractExports(content: string): string[] {
    const exports: string[] = [];

    // In Python, __all__ defines public API
    const allRegex = /__all__\s*=\s*\[([\s\S]*?)\]/;
    const match = allRegex.exec(content);

    if (match) {
      const items = match[1].split(',').map(s => s.trim().replace(/['"]/g, ''));
      exports.push(...items.filter(Boolean));
    }

    return [...new Set(exports)];
  }

  /**
   * Calculate complexity score (simplified for Python)
   */
  private calculateComplexity(node: SyntaxNode): number {
    let complexity = 1; // Base complexity

    // Count control flow statements
    const controlFlowTypes = [
      'if_statement', 'for_statement', 'while_statement',
      'try_statement', 'except_clause', 'with_statement',
      'match_statement', 'case_clause'
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
    // Always exclude self and cls for Python
    exclusions.add('self');
    exclusions.add('cls');
    return exclusions;
  }

  /**
   * Collect local symbols (definitions) from a node
   */
  private collectLocalSymbols(node: SyntaxNode, content: string): Set<string> {
    const symbols = new Set<string>();
    const visit = (current: SyntaxNode | null) => {
      if (!current) return;

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

      // Handle function calls: foo(), bar.method()
      if (current.type === 'call') {
        const functionNode = current.childForFieldName('function');
        if (functionNode) {
          this.handleCallExpression(functionNode, content, exclude, references);
        }
      }

      // Handle attribute access: obj.attribute
      if (current.type === 'attribute') {
        this.handleAttribute(current, content, exclude, references);
      }

      // Handle plain identifiers
      if (current.type === 'identifier') {
        // Skip if this is a definition
        if (!this.isDefinitionIdentifier(current)) {
          const identifier = this.getNodeText(current, content);
          if (
            identifier &&
            !exclude.has(identifier) &&
            !IDENTIFIER_STOP_WORDS.has(identifier) &&
            !BUILTIN_IDENTIFIERS.has(identifier)
          ) {
            const key = `${identifier}:${current.startPosition.row}:${current.startPosition.column}:root`;
            if (!references.has(key)) {
              references.set(key, {
                identifier,
                line: current.startPosition.row + 1,
                column: current.startPosition.column,
                context: this.getLineFromContent(content, current.startPosition.row + 1),
                qualifier: undefined
              });
            }
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
   * Handle function call references
   */
  private handleCallExpression(
    functionNode: SyntaxNode,
    content: string,
    exclude: Set<string>,
    references: Map<string, IdentifierReference>
  ): void {
    if (functionNode.type === 'identifier') {
      const name = this.getNodeText(functionNode, content);
      if (
        name &&
        !exclude.has(name) &&
        !IDENTIFIER_STOP_WORDS.has(name) &&
        !BUILTIN_IDENTIFIERS.has(name)
      ) {
        const key = `${name}:${functionNode.startPosition.row}:${functionNode.startPosition.column}:call`;
        if (!references.has(key)) {
          references.set(key, {
            identifier: name,
            line: functionNode.startPosition.row + 1,
            column: functionNode.startPosition.column,
            context: this.getLineFromContent(content, functionNode.startPosition.row + 1),
            qualifier: undefined
          });
        }
      }
    } else if (functionNode.type === 'attribute') {
      this.handleAttribute(functionNode, content, exclude, references);
    }
  }

  /**
   * Handle attribute access (obj.attr or obj.method())
   */
  private handleAttribute(
    node: SyntaxNode,
    content: string,
    exclude: Set<string>,
    references: Map<string, IdentifierReference>
  ): void {
    const objectNode = node.childForFieldName('object');
    const attributeNode = node.childForFieldName('attribute');

    if (attributeNode) {
      const attribute = this.getNodeText(attributeNode, content);
      const qualifier = objectNode ? this.getNodeText(objectNode, content) : undefined;

      if (
        attribute &&
        !exclude.has(attribute) &&
        !IDENTIFIER_STOP_WORDS.has(attribute) &&
        !BUILTIN_IDENTIFIERS.has(attribute)
      ) {
        // Skip if qualifier is in exclusions (e.g., self.foo)
        if (qualifier && exclude.has(qualifier)) {
          return;
        }

        const key = `${attribute}:${attributeNode.startPosition.row}:${attributeNode.startPosition.column}:${qualifier ?? 'root'}`;
        if (!references.has(key)) {
          references.set(key, {
            identifier: attribute,
            line: attributeNode.startPosition.row + 1,
            column: attributeNode.startPosition.column,
            context: this.getLineFromContent(content, attributeNode.startPosition.row + 1),
            qualifier
          });
        }
      }
    }
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

    // Assignment targets: x = 5
    if (parent.type === 'assignment') {
      const leftNode = parent.childForFieldName('left');
      return leftNode === node || this.isDescendantOf(node, leftNode);
    }

    // For loop variables: for x in ...
    if (parent.type === 'for_statement') {
      const leftNode = parent.childForFieldName('left');
      return leftNode === node || this.isDescendantOf(node, leftNode);
    }

    // Parameters
    if (parent.type === 'parameters' || parent.type === 'typed_parameter' ||
        parent.type === 'default_parameter' || parent.type === 'typed_default_parameter') {
      return true;
    }

    return false;
  }

  /**
   * Check if node is a descendant of ancestor
   */
  private isDescendantOf(node: SyntaxNode | null, ancestor: SyntaxNode | null): boolean {
    if (!node || !ancestor) return false;
    let current: SyntaxNode | null = node;
    while (current) {
      if (current === ancestor) return true;
      current = current.parent;
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
  private extractStructuredImports(content: string): ImportReference[] {
    const refs: ImportReference[] = [];
    const seen = new Set<string>();

    const pushRef = (ref: ImportReference) => {
      const key = `${ref.source}|${ref.imported}|${ref.alias ?? ''}|${ref.kind}`;
      if (!seen.has(key)) {
        seen.add(key);
        refs.push(ref);
      }
    };

    // Match: import foo, import foo as bar
    const importRegex = /^import\s+(.+)$/gm;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const imports = match[1].split(',').map(s => s.trim());
      for (const imp of imports) {
        const parts = imp.split(/\s+as\s+/);
        const moduleName = parts[0].trim();
        const alias = parts[1]?.trim();

        // Be optimistic: mark all imports as potentially local
        // The actual file resolution will determine if it's a real local import
        const isLocal = true;

        pushRef({
          source: moduleName,
          imported: moduleName,
          alias: alias || undefined,
          kind: 'namespace',
          isLocal
        });
      }
    }

    // Match: from foo import bar, baz as qux
    const fromImportRegex = /^from\s+(\S+)\s+import\s+(.+)$/gm;
    while ((match = fromImportRegex.exec(content)) !== null) {
      const source = match[1];
      const imports = match[2].split(',').map(s => s.trim());

      // Be optimistic: mark all imports as potentially local
      // The actual file resolution will determine if it's a real local import
      const isLocal = true;

      for (const imp of imports) {
        if (imp === '*') {
          pushRef({
            source,
            imported: '*',
            kind: 'namespace',
            isLocal
          });
        } else {
          const parts = imp.split(/\s+as\s+/);
          const imported = parts[0].trim();
          const alias = parts[1]?.trim();

          pushRef({
            source,
            imported,
            alias: alias || undefined,
            kind: 'named',
            isLocal
          });
        }
      }
    }

    return refs;
  }

  /**
   * Extract TypeVar bounds from content
   * Parses patterns like: T = TypeVar('T', bound=BaseEntity)
   * Returns a map of TypeVar name → bound type name
   */
  private extractTypeVarBounds(content: string): Map<string, string> {
    const bounds = new Map<string, string>();

    // Match: T = TypeVar('T', bound=SomeClass) or T = TypeVar("T", bound=SomeClass)
    // Also handles: T = TypeVar('T', bound=module.SomeClass)
    const typeVarRegex = /(\w+)\s*=\s*TypeVar\s*\(\s*['"][^'"]+['"]\s*,\s*bound\s*=\s*([\w.]+)\s*\)/g;

    let match;
    while ((match = typeVarRegex.exec(content)) !== null) {
      const varName = match[1];
      const boundType = match[2];
      // Extract just the class name if it's qualified (e.g., module.Class -> Class)
      const simpleBound = boundType.includes('.') ? boundType.split('.').pop()! : boundType;
      bounds.set(varName, simpleBound);
    }

    return bounds;
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
   * Also handles TypeVar bounds - when a scope uses a TypeVar, add the bound type as a reference
   */
  private classifyScopeReferences(
    scopes: ScopeInfo[],
    fileImports: ImportReference[],
    typeVarBounds: Map<string, string> = new Map()
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
      // Track TypeVar bounds used in this scope to add as additional references
      const typeVarBoundsToAdd: IdentifierReference[] = [];

      scope.identifierReferences = scope.identifierReferences
        .map((ref) => {
          const aliasKey = ref.qualifier ?? ref.identifier;
          const importMatch = aliasKey ? aliasMap.get(aliasKey) : undefined;

          if (importMatch) {
            ref.kind = 'import';
            ref.source = importMatch.source;
            ref.isLocalImport = importMatch.isLocal;
            // Also add to importReferences if not already present
            if (!scope.importReferences.some(ir =>
              ir.source === importMatch.source &&
              ir.imported === importMatch.imported
            )) {
              scope.importReferences.push(importMatch);
            }
            return ref;
          }

          // Check if this is a TypeVar with a bound
          const boundType = typeVarBounds.get(ref.identifier);
          if (boundType) {
            // Check if the bound type is imported
            const boundImport = aliasMap.get(boundType);
            if (boundImport) {
              // Add the bound type as an additional reference
              typeVarBoundsToAdd.push({
                identifier: boundType,
                line: ref.line,
                column: ref.column,
                context: ref.context,
                kind: 'import',
                source: boundImport.source,
                isLocalImport: boundImport.isLocal
              });
              // Also add to importReferences if not already present
              if (!scope.importReferences.some(ir =>
                ir.source === boundImport.source &&
                ir.imported === boundImport.imported
              )) {
                scope.importReferences.push(boundImport);
              }
            }
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

      // Add TypeVar bound references
      if (typeVarBoundsToAdd.length > 0) {
        scope.identifierReferences.push(...typeVarBoundsToAdd);
      }
    }

    return scopeIndex;
  }

  /**
   * Attach signature references (link return types/params to local scopes AND imports)
   * Extracts ALL type identifiers from return types (e.g., Optional[MergeStats] → MergeStats)
   */
  private attachSignatureReferences(
    scopes: ScopeInfo[],
    scopeIndex: Map<string, ScopeInfo[]>,
    fileImports: ImportReference[]
  ): void {
    // Build import alias map for quick lookup
    const importMap = new Map<string, ImportReference>();
    for (const imp of fileImports) {
      const key = imp.alias ?? imp.imported;
      if (key) {
        importMap.set(key, imp);
      }
    }

    for (const scope of scopes) {
      // Extract ALL type identifiers from the return type
      const returnTypes = this.extractAllTypeIdentifiers(scope.returnType);

      for (const typeId of returnTypes) {
        // Check if we already have this reference
        const existingRef = scope.identifierReferences.find(
          ref => ref.identifier === typeId && (ref.kind === 'local_scope' || ref.kind === 'import')
        );
        if (existingRef) continue;

        // First check local scopes
        const targets = scopeIndex.get(typeId);
        if (targets && targets.length > 0) {
          const target = targets[0];
          const targetId = `${target.filePath ?? ''}::${target.name}:${target.startLine}-${target.endLine}`;
          scope.identifierReferences.push({
            identifier: typeId,
            line: scope.startLine,
            context: scope.signature,
            kind: 'local_scope',
            targetScope: targetId
          });
          continue;
        }

        // Then check imports
        const importMatch = importMap.get(typeId);
        if (importMatch) {
          scope.identifierReferences.push({
            identifier: typeId,
            line: scope.startLine,
            context: scope.signature,
            kind: 'import',
            source: importMatch.source,
            isLocalImport: importMatch.isLocal
          });
          // Also add to importReferences if not already present
          if (!scope.importReferences.some(ir =>
            ir.source === importMatch.source &&
            ir.imported === importMatch.imported
          )) {
            scope.importReferences.push(importMatch);
          }
        }
      }
    }

    // Also attach type references from parameters
    this.attachParameterTypeReferences(scopes, scopeIndex, importMap);
  }

  /**
   * Extract type references from parameters
   * Extracts ALL type identifiers from parameter types (e.g., Dict[str, MergeNode] → MergeNode)
   */
  private attachParameterTypeReferences(
    scopes: ScopeInfo[],
    scopeIndex: Map<string, ScopeInfo[]>,
    importMap: Map<string, ImportReference>
  ): void {
    // First pass: Add type references from parameters to methods
    for (const scope of scopes) {
      // Extract type references from parameters (for all scopes)
      if (scope.parameters && scope.parameters.length > 0) {
        for (const param of scope.parameters) {
          if (param.type) {
            // Extract ALL type identifiers from the parameter type
            const paramTypes = this.extractAllTypeIdentifiers(param.type);

            for (const typeId of paramTypes) {
              // Check if we already have this reference
              const existingRef = scope.identifierReferences.find(
                ref => ref.identifier === typeId && (ref.kind === 'local_scope' || ref.kind === 'import')
              );
              if (existingRef) continue;

              // First check local scopes
              const targets = scopeIndex.get(typeId);
              if (targets && targets.length > 0) {
                const target = targets[0];
                const targetId = `${target.filePath ?? ''}::${target.name}:${target.startLine}-${target.endLine}`;
                scope.identifierReferences.push({
                  identifier: typeId,
                  line: scope.startLine,
                  context: scope.signature,
                  kind: 'local_scope',
                  targetScope: targetId
                });
                continue;
              }

              // Then check imports
              const importMatch = importMap.get(typeId);
              if (importMatch) {
                scope.identifierReferences.push({
                  identifier: typeId,
                  line: scope.startLine,
                  context: scope.signature,
                  kind: 'import',
                  source: importMatch.source,
                  isLocalImport: importMatch.isLocal
                });
                // Also add to importReferences if not already present
                if (!scope.importReferences.some(ir =>
                  ir.source === importMatch.source &&
                  ir.imported === importMatch.imported
                )) {
                  scope.importReferences.push(importMatch);
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
   * Extract base type identifier from a type string (first identifier only)
   * @deprecated Use extractAllTypeIdentifiers for complete type extraction
   */
  private extractBaseTypeIdentifier(type?: string): string | undefined {
    const types = this.extractAllTypeIdentifiers(type);
    return types.length > 0 ? types[0] : undefined;
  }

  /**
   * Extract ALL type identifiers from a type string
   * Handles generics like Optional[MergeStats], Dict[str, MergeNode], Union types, etc.
   * Only returns PascalCase identifiers (user-defined types start with uppercase)
   * The scopeIndex lookup will naturally filter out types not defined in the project
   */
  private extractAllTypeIdentifiers(type?: string): string[] {
    if (!type) return [];
    const cleaned = type.trim();
    if (!cleaned) return [];

    // Match all identifiers that start with uppercase (PascalCase = likely user-defined types)
    // This naturally excludes: str, int, float, bool, None, etc.
    const allMatches = cleaned.match(/\b[A-Z][A-Za-z0-9_]*\b/g);
    if (!allMatches) return [];

    // Remove duplicates
    return [...new Set(allMatches)];
  }

  /**
   * Check if node is inside a class definition
   */
  private isInsideClass(node: SyntaxNode): boolean {
    let current = node.parent;
    while (current) {
      if (current.type === 'block') {
        if (current.parent?.type === 'class_definition') {
          return true;
        }
      }
      current = current.parent;
    }
    return false;
  }

  /**
   * Check if assignment has lambda
   */
  private hasLambda(node: SyntaxNode): boolean {
    for (const child of node.children) {
      if (child.type === 'lambda') return true;
    }
    return false;
  }
}
