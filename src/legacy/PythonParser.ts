/**
 * Python Parser
 *
 * Parse Python code and extract rich metadata for LLM analysis.
 */

import { createRequire } from 'module';
import { PythonReferenceTracker } from './PythonReferenceTracker.js';

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

export interface PythonParameter {
  name: string;
  type?: string;
  defaultValue?: string;
}

export interface PythonIdentifierReference {
  identifier: string;
  line: number;
  column?: number;
  context: string;
  qualifier?: string;
  kind?: 'variable' | 'function_call' | 'attribute' | 'import';
}

export interface PythonScope {
  name: string;
  type: 'class' | 'function' | 'method' | 'lambda' | 'variable' | 'constant';
  startLine: number;
  endLine: number;
  filePath: string;
  signature: string;
  parameters: PythonParameter[];
  returnType?: string;
  decorators: string[];
  content: string;
  docstring?: string;
  parent?: string;
  depth: number;
  linesOfCode: number;
  identifierReferences?: PythonIdentifierReference[];
  value?: string; // For variables/constants: the assigned value
}

export interface PythonFileAnalysis {
  scopes: PythonScope[];
  imports: PythonImport[];
  filePath: string;
  totalLines: number;
}

export interface PythonImport {
  source: string;
  imported: string[];
  kind: 'import' | 'from';
  alias?: string;
}

export class PythonParser {
  private parser: ParserInstance | null = null;
  private initialized = false;
  private referenceTracker: PythonReferenceTracker;
  private enableReferenceTracking: boolean;

  constructor(options: { enableReferenceTracking?: boolean } = {}) {
    this.referenceTracker = new PythonReferenceTracker();
    this.enableReferenceTracking = options.enableReferenceTracking ?? true;
  }

  async initialize(): Promise<void> {
    if (this.initialized && this.parser) return;

    const { Parser, Language } = await loadWebTreeSitter();

    if (!this.parser) {
      await Parser.init();
      this.parser = new Parser();
      const Python = await Language.load(
        require.resolve('tree-sitter-wasms/out/tree-sitter-python.wasm')
      );
      this.parser.setLanguage(Python);
    }

    this.initialized = true;
    console.log('✅ Python Parser initialized');
  }

  async parseFile(filePath: string, content: string): Promise<PythonFileAnalysis> {
    if (!this.parser) {
      await this.initialize();
    }

    const tree = this.parser!.parse(content);
    const scopes: PythonScope[] = [];
    const scopeNodes: Map<PythonScope, SyntaxNode> = new Map();
    const imports = this.extractImports(tree.rootNode, content);

    this.extractScopes(tree.rootNode, scopes, content, 0, undefined, scopeNodes);

    // Set file paths
    for (const scope of scopes) {
      scope.filePath = filePath;
    }

    // Enrich scopes with identifier references if enabled
    if (this.enableReferenceTracking) {
      for (const scope of scopes) {
        const scopeNode = scopeNodes.get(scope);
        if (scopeNode) {
          scope.identifierReferences = this.referenceTracker.enrichScope(
            scope,
            scopeNode,
            content,
            scopes
          );
        }
      }

      // Add type references from parameter annotations
      this.attachParameterTypeReferences(scopes);
    }

    return {
      scopes,
      imports,
      filePath,
      totalLines: content.split('\n').length
    };
  }

  private extractScopes(
    node: SyntaxNode,
    scopes: PythonScope[],
    content: string,
    depth: number,
    parent: string | undefined,
    scopeNodes?: Map<PythonScope, SyntaxNode>
  ): void {
    if (node.type === 'class_definition') {
      const scope = this.extractClass(node, content, depth, parent);
      scopes.push(scope);
      if (scopeNodes) scopeNodes.set(scope, node);

      // Extract methods from class body
      const bodyNode = node.childForFieldName('body');
      if (bodyNode) {
        for (const child of bodyNode.children) {
          this.extractScopes(child, scopes, content, depth + 1, scope.name, scopeNodes);
        }
      }
    } else if (node.type === 'function_definition') {
      const isMethod = this.isInsideClass(node);
      const scope = isMethod
        ? this.extractMethod(node, content, depth, parent)
        : this.extractFunction(node, content, depth, parent);
      scopes.push(scope);
      if (scopeNodes) scopeNodes.set(scope, node);
    } else if (node.type === 'decorated_definition') {
      // Handle @decorator def foo(): ...
      const decorators = this.extractDecorators(node, content);
      const funcNode = node.children.find(c => c.type === 'function_definition');

      if (funcNode) {
        const isMethod = this.isInsideClass(node);
        const scope = isMethod
          ? this.extractMethod(funcNode, content, depth, parent)
          : this.extractFunction(funcNode, content, depth, parent);
        scope.decorators = decorators;
        scopes.push(scope);
        if (scopeNodes) scopeNodes.set(scope, funcNode);
      }
    } else if (node.type === 'assignment') {
      if (this.hasLambda(node)) {
        // Handle: square = lambda x: x ** 2
        const lambdaScope = this.extractLambdaAssignment(node, content, depth, parent);
        if (lambdaScope) {
          scopes.push(lambdaScope);
          if (scopeNodes) scopeNodes.set(lambdaScope, node);
        }
      } else if (depth === 0 && !parent) {
        // Handle global variable assignments: MAX_SIZE = 1024
        const variableScope = this.extractGlobalVariable(node, content);
        if (variableScope) {
          scopes.push(variableScope);
          if (scopeNodes) scopeNodes.set(variableScope, node);
        }
      }
    } else {
      // Recurse for other node types
      for (const child of node.children) {
        this.extractScopes(child, scopes, content, depth, parent, scopeNodes);
      }
    }
  }

  private extractClass(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined
  ): PythonScope {
    const nameNode = node.childForFieldName('name');
    const name = nameNode ? this.getNodeText(nameNode, content) : 'AnonymousClass';

    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;

    // Only capture class definition line (not the body)
    // Extract the first line: "class Foo(Base):" or "class Foo:"
    const lines = content.split('\n');
    const classDefLine = lines[startLine - 1];
    const nodeContent = classDefLine?.trim() || this.getNodeText(node, content);

    // Build signature with base classes if present
    const superclassesNode = node.childForFieldName('superclasses');
    let signature = `class ${name}`;
    if (superclassesNode) {
      signature += this.getNodeText(superclassesNode, content);
    }

    const parameters: PythonParameter[] = []; // Classes don't have direct params
    const docstring = this.extractDocstring(node, content);
    const linesOfCode = endLine - startLine + 1;

    return {
      name,
      type: 'class',
      startLine,
      endLine,
      filePath: '',
      signature,
      parameters,
      decorators: [],
      content: nodeContent,
      docstring,
      parent,
      depth,
      linesOfCode
    };
  }

  private extractFunction(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined
  ): PythonScope {
    const nameNode = node.childForFieldName('name');
    const name = nameNode ? this.getNodeText(nameNode, content) : 'anonymous';

    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);

    const parameters = this.extractParameters(node, content);
    const returnType = this.extractReturnType(node, content);
    const signature = this.buildSignature('def', name, parameters, returnType);
    const docstring = this.extractDocstring(node, content);
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
      decorators: [],
      content: nodeContent,
      docstring,
      parent,
      depth,
      linesOfCode
    };
  }

  private extractMethod(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined
  ): PythonScope {
    const scope = this.extractFunction(node, content, depth, parent);
    scope.type = 'method';
    return scope;
  }

  private extractLambdaAssignment(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined
  ): PythonScope | null {
    const leftNode = node.childForFieldName('left');
    const rightNode = node.childForFieldName('right');

    if (!leftNode || !rightNode || rightNode.type !== 'lambda') return null;

    const name = this.getNodeText(leftNode, content);
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);

    const parameters = this.extractLambdaParameters(rightNode, content);
    const signature = `${name} = lambda ${parameters.map(p => p.name).join(', ')}: ...`;
    const linesOfCode = endLine - startLine + 1;

    return {
      name,
      type: 'lambda',
      startLine,
      endLine,
      filePath: '',
      signature,
      parameters,
      decorators: [],
      content: nodeContent,
      parent,
      depth,
      linesOfCode
    };
  }

  private extractGlobalVariable(
    node: SyntaxNode,
    content: string
  ): PythonScope | null {
    const leftNode = node.childForFieldName('left');
    const rightNode = node.childForFieldName('right');

    if (!leftNode || !rightNode) return null;

    // Get variable name (support simple identifiers and type annotations)
    let name: string;
    if (leftNode.type === 'identifier') {
      name = this.getNodeText(leftNode, content);
    } else if (leftNode.type === 'pattern_list') {
      // Skip tuple unpacking for now (a, b = 1, 2)
      return null;
    } else {
      // Other patterns we don't support yet
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
    const linesOfCode = endLine - startLine + 1;

    return {
      name,
      type,
      startLine,
      endLine,
      filePath: '',
      signature,
      parameters: [],
      decorators: [],
      content: nodeContent,
      depth: 0,
      linesOfCode,
      value
    };
  }

  private extractParameters(node: SyntaxNode, content: string): PythonParameter[] {
    const parameters: PythonParameter[] = [];
    const paramsNode = node.childForFieldName('parameters');

    if (!paramsNode) return parameters;

    for (const child of paramsNode.children) {
      if (child.type === 'typed_parameter') {
        const nameNode = child.children.find(c => c.type === 'identifier');
        const typeNode = child.children.find(c => c.type === 'type');
        const name = nameNode ? this.getNodeText(nameNode, content) : '';
        const type = typeNode ? this.getNodeText(typeNode, content) : undefined;

        parameters.push({ name, type });
      } else if (child.type === 'identifier') {
        const name = this.getNodeText(child, content);
        parameters.push({ name });
      } else if (child.type === 'default_parameter') {
        const nameNode = child.childForFieldName('name');
        const valueNode = child.childForFieldName('value');
        const name = nameNode ? this.getNodeText(nameNode, content) : '';
        const defaultValue = valueNode ? this.getNodeText(valueNode, content) : undefined;

        parameters.push({ name, defaultValue });
      }
    }

    return parameters;
  }

  private extractLambdaParameters(lambdaNode: SyntaxNode, content: string): PythonParameter[] {
    const parameters: PythonParameter[] = [];
    const paramsNode = lambdaNode.childForFieldName('parameters');

    if (!paramsNode) return parameters;

    if (paramsNode.type === 'lambda_parameters') {
      for (const child of paramsNode.children) {
        if (child.type === 'identifier') {
          const name = this.getNodeText(child, content);
          parameters.push({ name });
        }
      }
    }

    return parameters;
  }

  private extractReturnType(node: SyntaxNode, content: string): string | undefined {
    const returnTypeNode = node.childForFieldName('return_type');
    return returnTypeNode ? this.getNodeText(returnTypeNode, content) : undefined;
  }

  private extractDecorators(node: SyntaxNode, content: string): string[] {
    const decorators: string[] = [];

    for (const child of node.children) {
      if (child.type === 'decorator') {
        decorators.push(this.getNodeText(child, content));
      }
    }

    return decorators;
  }

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

  private extractImports(node: SyntaxNode, content: string): PythonImport[] {
    const imports: PythonImport[] = [];

    function traverse(n: SyntaxNode) {
      if (n.type === 'import_statement') {
        // import foo, bar as baz
        const imported: string[] = [];
        let alias: string | undefined;

        for (const child of n.children) {
          if (child.type === 'dotted_name') {
            imported.push(content.substring(child.startIndex, child.endIndex));
          } else if (child.type === 'aliased_import') {
            const nameNode = child.childForFieldName('name');
            const aliasNode = child.childForFieldName('alias');

            if (nameNode) {
              const name = content.substring(nameNode.startIndex, nameNode.endIndex);
              imported.push(name);
            }
            if (aliasNode) {
              alias = content.substring(aliasNode.startIndex, aliasNode.endIndex);
            }
          }
        }

        if (imported.length > 0) {
          imports.push({
            source: imported[0],
            imported,
            kind: 'import',
            alias
          });
        }
      } else if (n.type === 'import_from_statement') {
        // from foo import bar, baz
        const moduleNode = n.children.find(c => c.type === 'dotted_name');
        const source = moduleNode ? content.substring(moduleNode.startIndex, moduleNode.endIndex) : '';
        const imported: string[] = [];

        for (const child of n.children) {
          if (child.type === 'dotted_name' && child !== moduleNode) {
            imported.push(content.substring(child.startIndex, child.endIndex));
          }
        }

        if (source) {
          imports.push({
            source,
            imported,
            kind: 'from'
          });
        }
      }

      for (const child of n.children) {
        traverse(child);
      }
    }

    traverse(node);
    return imports;
  }

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

  private hasLambda(node: SyntaxNode): boolean {
    for (const child of node.children) {
      if (child.type === 'lambda') return true;
    }
    return false;
  }

  private buildSignature(
    kind: string,
    name: string,
    parameters: PythonParameter[],
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
   * Attach type references from parameter annotations to scopes
   * Similar to TypeScript's attachClassFieldTypeReferences
   */
  private attachParameterTypeReferences(scopes: PythonScope[]): void {
    // Build scope index by name for lookup
    const scopeIndex = new Map<string, PythonScope[]>();
    for (const scope of scopes) {
      const bucket = scopeIndex.get(scope.name) ?? [];
      bucket.push(scope);
      scopeIndex.set(scope.name, bucket);
    }

    // First pass: Add type references from parameters to functions/methods
    for (const scope of scopes) {
      if (!scope.identifierReferences) {
        scope.identifierReferences = [];
      }

      // Extract type references from parameters
      if (scope.parameters && scope.parameters.length > 0) {
        for (const param of scope.parameters) {
          if (param.type) {
            const paramType = this.extractBaseTypeName(param.type);
            if (paramType) {
              const targets = scopeIndex.get(paramType);
              if (targets && targets.length > 0) {
                const target = targets[0];

                // Check if we already have this reference
                const existingRef = scope.identifierReferences.find(
                  ref => ref.identifier === paramType
                );

                if (!existingRef) {
                  scope.identifierReferences.push({
                    identifier: paramType,
                    line: scope.startLine,
                    context: scope.signature || `${scope.name}(${param.name}: ${paramType})`
                  });
                }
              }
            }
          }
        }
      }

      // Also handle return type
      if (scope.returnType) {
        const returnTypeName = this.extractBaseTypeName(scope.returnType);
        if (returnTypeName) {
          const targets = scopeIndex.get(returnTypeName);
          if (targets && targets.length > 0) {
            const existingRef = scope.identifierReferences.find(
              ref => ref.identifier === returnTypeName
            );

            if (!existingRef) {
              scope.identifierReferences.push({
                identifier: returnTypeName,
                line: scope.startLine,
                context: scope.signature || `${scope.name}() -> ${returnTypeName}`
              });
            }
          }
        }
      }
    }

    // Second pass: Aggregate type references from child methods to parent classes
    const classScopes = scopes.filter(s => s.type === 'class');
    for (const classScope of classScopes) {
      if (!classScope.identifierReferences) {
        classScope.identifierReferences = [];
      }

      const childScopes = scopes.filter(s => s.parent === classScope.name && s.filePath === classScope.filePath);

      // Collect all type references from children
      const typeReferences = new Map<string, { line: number; context: string }>();
      for (const child of childScopes) {
        if (child.identifierReferences) {
          for (const ref of child.identifierReferences) {
            const refName = ref.identifier;
            if (!typeReferences.has(refName)) {
              typeReferences.set(refName, {
                line: child.startLine,
                context: child.signature || `${child.name}(...)`
              });
            }
          }
        }
      }

      // Add type references to the class
      for (const [typeName, refInfo] of typeReferences) {
        const existingRef = classScope.identifierReferences.find(
          ref => ref.identifier === typeName
        );

        if (!existingRef) {
          classScope.identifierReferences.push({
            identifier: typeName,
            line: refInfo.line,
            context: refInfo.context
          });
        }
      }
    }
  }

  /**
   * Extract base type name from type annotation
   * e.g., "List[str]" -> "List", "Optional[MyClass]" -> "Optional", "MyClass" -> "MyClass"
   */
  private extractBaseTypeName(type: string): string | undefined {
    const cleaned = type.trim();
    if (!cleaned) return undefined;

    // Match the base type name (before [ or |)
    const match = cleaned.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    return match ? match[0] : undefined;
  }

  private getNodeText(node: SyntaxNode | null, content: string): string {
    if (!node) return '';
    return content.substring(node.startIndex, node.endIndex);
  }
}
