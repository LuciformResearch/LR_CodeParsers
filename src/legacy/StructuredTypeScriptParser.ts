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

export interface TypeScriptScope {
  // Métadonnées de base
  name: string;
  type: 'class' | 'interface' | 'function' | 'method' | 'enum' | 'type_alias' | 'namespace' | 'module';
  startLine: number;
  endLine: number;
  
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
  exports: string[];
  dependencies: string[];
  astValid: boolean;
  astIssues: string[];
}

export class StructuredTypeScriptParser {
  private parser: ParserInstance | null = null;
  private initialized: boolean = false;

  constructor() {
    // Parser will be created in initialize()
  }

  /**
   * Initialize the parser with TypeScript language
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const { Parser, Language } = await loadWebTreeSitter();
      await Parser.init();

      // Create parser after init
      this.parser = new Parser();

      // Load TypeScript language
      const TypeScript = await Language.load(
        require.resolve('tree-sitter-typescript/tree-sitter-typescript.wasm')
      );

      this.parser.setLanguage(TypeScript);
      this.initialized = true;

      console.log('✅ Structured TypeScript Parser initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Structured TypeScript Parser:', error);
      throw error;
    }
  }

  /**
   * Parse a TypeScript file and extract structured scopes
   */
  async parseFile(filePath: string, content: string): Promise<FileAnalysis> {
    if (!this.initialized || !this.parser) {
      await this.initialize();
    }

    console.log(`⏳ Parsing ${filePath}...`);
    try {
      const tree = this.parser!.parse(content);
      const scopes: TypeScriptScope[] = [];

      // Extract all scopes with hierarchy
      this.extractScopes(tree.rootNode, scopes, content, 0);

      // Analyze file-level metadata
      const imports = this.extractImports(content);
      const exports = this.extractExports(content);
      const dependencies = this.extractDependencies(content);
      const astValid = this.validateAST(tree.rootNode);
      const astIssues = this.extractASTIssues(tree.rootNode);

      const analysis: FileAnalysis = {
        filePath,
        scopes,
        totalLines: content.split('\n').length,
        totalScopes: scopes.length,
        imports,
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
    parent?: string
  ): void {
    // Extract different types of scopes
    if (node.type === 'class_declaration') {
      const scope = this.extractClass(node, content, depth, parent);
      scopes.push(scope);
      
      // Recursively extract children
      for (const child of node.children) {
        this.extractScopes(child, scopes, content, depth + 1, scope.name);
      }
    } else if (node.type === 'interface_declaration') {
      const scope = this.extractInterface(node, content, depth, parent);
      scopes.push(scope);
    } else if (node.type === 'function_declaration') {
      const scope = this.extractFunction(node, content, depth, parent);
      scopes.push(scope);
    } else if (node.type === 'method_definition') {
      const scope = this.extractMethod(node, content, depth, parent);
      scopes.push(scope);
    } else if (node.type === 'enum_declaration') {
      const scope = this.extractEnum(node, content, depth, parent);
      scopes.push(scope);
    } else if (node.type === 'type_alias_declaration') {
      const scope = this.extractTypeAlias(node, content, depth, parent);
      scopes.push(scope);
    } else if (node.type === 'namespace_declaration') {
      const scope = this.extractNamespace(node, content, depth, parent);
      scopes.push(scope);
      
      // Recursively extract children
      for (const child of node.children) {
        this.extractScopes(child, scopes, content, depth + 1, scope.name);
      }
    } else {
      // Recursively process other children
      for (const child of node.children) {
        this.extractScopes(child, scopes, content, depth, parent);
      }
    }
  }

  /**
   * Extract class information with rich metadata
   */
  private extractClass(node: SyntaxNode, content: string, depth: number, parent?: string): TypeScriptScope {
    const name = this.getNodeText(node.childForFieldName('name'), content) || 'AnonymousClass';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    
    const modifiers = this.extractModifiers(node, content);
    const parameters = this.extractParameters(node, content);
    const returnType = this.extractReturnType(node, content);
    const signature = this.buildSignature('class', name, parameters, returnType, modifiers);
    const contentDedented = this.dedentContent(nodeContent);
    
    const dependencies = this.extractDependencies(nodeContent);
    const exports = [name];
    const imports = this.extractImports(nodeContent);
    const complexity = this.calculateComplexity(node);
    const linesOfCode = endLine - startLine + 1;

    return {
      name,
      type: 'class',
      startLine,
      endLine,
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
  private extractInterface(node: SyntaxNode, content: string, depth: number, parent?: string): TypeScriptScope {
    const name = this.getNodeText(node.childForFieldName('name'), content) || 'AnonymousInterface';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    
    const modifiers = this.extractModifiers(node, content);
    const signature = this.buildSignature('interface', name, [], undefined, modifiers);
    const contentDedented = this.dedentContent(nodeContent);
    
    const dependencies = this.extractDependencies(nodeContent);
    const exports = [name];
    const imports = this.extractImports(nodeContent);
    const complexity = this.calculateComplexity(node);
    const linesOfCode = endLine - startLine + 1;

    return {
      name,
      type: 'interface',
      startLine,
      endLine,
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
  private extractFunction(node: SyntaxNode, content: string, depth: number, parent?: string): TypeScriptScope {
    const name = this.getNodeText(node.childForFieldName('name'), content) || 'AnonymousFunction';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    
    const modifiers = this.extractModifiers(node, content);
    const parameters = this.extractParameters(node, content);
    const returnType = this.extractReturnType(node, content);
    const signature = this.buildSignature('function', name, parameters, returnType, modifiers);
    const contentDedented = this.dedentContent(nodeContent);
    
    const dependencies = this.extractDependencies(nodeContent);
    const exports = [name];
    const imports = this.extractImports(nodeContent);
    const complexity = this.calculateComplexity(node);
    const linesOfCode = endLine - startLine + 1;

    return {
      name,
      type: 'function',
      startLine,
      endLine,
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
  private extractMethod(node: SyntaxNode, content: string, depth: number, parent?: string): TypeScriptScope {
    const name = this.getNodeText(node.childForFieldName('name'), content) || 'AnonymousMethod';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    
    const modifiers = this.extractModifiers(node, content);
    const parameters = this.extractParameters(node, content);
    const returnType = this.extractReturnType(node, content);
    const signature = this.buildSignature('method', name, parameters, returnType, modifiers);
    const contentDedented = this.dedentContent(nodeContent);
    
    const dependencies = this.extractDependencies(nodeContent);
    const exports = [name];
    const imports = this.extractImports(nodeContent);
    const complexity = this.calculateComplexity(node);
    const linesOfCode = endLine - startLine + 1;

    return {
      name,
      type: 'method',
      startLine,
      endLine,
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
  private extractEnum(node: SyntaxNode, content: string, depth: number, parent?: string): TypeScriptScope {
    const name = this.getNodeText(node.childForFieldName('name'), content) || 'AnonymousEnum';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    
    const modifiers = this.extractModifiers(node, content);
    const signature = this.buildSignature('enum', name, [], undefined, modifiers);
    const contentDedented = this.dedentContent(nodeContent);
    
    const dependencies = this.extractDependencies(nodeContent);
    const exports = [name];
    const imports = this.extractImports(nodeContent);
    const complexity = this.calculateComplexity(node);
    const linesOfCode = endLine - startLine + 1;

    return {
      name,
      type: 'enum',
      startLine,
      endLine,
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
  private extractTypeAlias(node: SyntaxNode, content: string, depth: number, parent?: string): TypeScriptScope {
    const name = this.getNodeText(node.childForFieldName('name'), content) || 'AnonymousType';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    
    const modifiers = this.extractModifiers(node, content);
    const signature = this.buildSignature('type_alias', name, [], undefined, modifiers);
    const contentDedented = this.dedentContent(nodeContent);
    
    const dependencies = this.extractDependencies(nodeContent);
    const exports = [name];
    const imports = this.extractImports(nodeContent);
    const complexity = this.calculateComplexity(node);
    const linesOfCode = endLine - startLine + 1;

    return {
      name,
      type: 'type_alias',
      startLine,
      endLine,
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
  private extractNamespace(node: SyntaxNode, content: string, depth: number, parent?: string): TypeScriptScope {
    const name = this.getNodeText(node.childForFieldName('name'), content) || 'AnonymousNamespace';
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    
    const modifiers = this.extractModifiers(node, content);
    const signature = this.buildSignature('namespace', name, [], undefined, modifiers);
    const contentDedented = this.dedentContent(nodeContent);
    
    const dependencies = this.extractDependencies(nodeContent);
    const exports = [name];
    const imports = this.extractImports(nodeContent);
    const complexity = this.calculateComplexity(node);
    const linesOfCode = endLine - startLine + 1;

    return {
      name,
      type: 'namespace',
      startLine,
      endLine,
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
          const type = typeNode ? this.getNodeText(typeNode, content) : undefined;
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
    return returnTypeNode ? this.getNodeText(returnTypeNode, content) : undefined;
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
}