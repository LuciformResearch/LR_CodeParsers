/**
 * C# Scope Extraction Parser
 *
 * Extends BaseScopeExtractionParser for C#-specific features:
 * - Namespaces
 * - Classes, structs, records, interfaces
 * - Properties with getters/setters
 * - Methods and constructors
 * - Enums
 * - Extension methods
 * - Generics
 * - Access modifiers
 */

import { BaseScopeExtractionParser, NodeTypeConfig, SyntaxNode, IDENTIFIER_STOP_WORDS, BUILTIN_IDENTIFIERS } from './BaseScopeExtractionParser.js';
import type { ScopeInfo, ImportReference } from './types.js';

/** C#-specific keywords */
export const CSHARP_STOP_WORDS = new Set([
  ...IDENTIFIER_STOP_WORDS,
  'namespace', 'using', 'class', 'struct', 'record', 'interface', 'enum',
  'public', 'private', 'protected', 'internal', 'static', 'readonly', 'const',
  'virtual', 'override', 'abstract', 'sealed', 'partial', 'async', 'await',
  'new', 'this', 'base', 'null', 'true', 'false', 'void', 'var', 'dynamic',
  'get', 'set', 'init', 'value', 'where', 'when', 'is', 'as', 'in', 'out', 'ref',
  'if', 'else', 'switch', 'case', 'default', 'for', 'foreach', 'while', 'do',
  'break', 'continue', 'return', 'throw', 'try', 'catch', 'finally',
  'lock', 'using', 'yield', 'params', 'typeof', 'sizeof', 'nameof',
  'checked', 'unchecked', 'fixed', 'unsafe', 'stackalloc',
]);

/** C#-specific builtins */
export const CSHARP_BUILTIN_IDENTIFIERS = new Set([
  ...BUILTIN_IDENTIFIERS,
  // Types
  'object', 'string', 'bool', 'byte', 'sbyte', 'char', 'decimal', 'double', 'float',
  'int', 'uint', 'long', 'ulong', 'short', 'ushort', 'nint', 'nuint',
  // Common types
  'String', 'Object', 'Boolean', 'Int32', 'Int64', 'Double', 'Decimal',
  'DateTime', 'TimeSpan', 'Guid', 'Type', 'Enum', 'Array',
  // Collections
  'List', 'Dictionary', 'HashSet', 'Queue', 'Stack', 'LinkedList',
  'IEnumerable', 'ICollection', 'IList', 'IDictionary', 'ISet',
  'IQueryable', 'IOrderedEnumerable', 'IGrouping',
  // Async
  'Task', 'ValueTask', 'CancellationToken', 'CancellationTokenSource',
  // Common interfaces
  'IDisposable', 'IAsyncDisposable', 'IComparable', 'IEquatable', 'ICloneable',
  // Nullable
  'Nullable',
  // Console/Debug
  'Console', 'Debug', 'Trace',
  // LINQ
  'Enumerable', 'Queryable',
]);

/** C# AST node type mappings */
export const CSHARP_NODE_TYPES: NodeTypeConfig = {
  classDeclaration: ['class_declaration', 'struct_declaration', 'record_declaration'],
  interfaceDeclaration: ['interface_declaration'],
  functionDeclaration: ['method_declaration', 'local_function_statement'],
  methodDefinition: ['method_declaration', 'constructor_declaration'],
  enumDeclaration: ['enum_declaration'],
  typeAliasDeclaration: ['type_parameter_constraint_clause'],
  namespaceDeclaration: ['namespace_declaration', 'file_scoped_namespace_declaration'],

  variableDeclaration: ['variable_declaration', 'field_declaration'],
  variableDeclarator: ['variable_declarator'],
  variableKind: [],

  arrowFunction: ['arrow_expression_clause'],
  functionExpression: ['lambda_expression', 'anonymous_method_expression'],

  parameter: ['parameter'],
  optionalParameter: ['parameter'], // C# uses default values
  restParameter: [], // C# uses params keyword

  accessibilityModifier: ['modifier'],
  staticModifier: ['modifier'],
  abstractModifier: ['modifier'],
  readonlyModifier: ['modifier'],
  asyncModifier: ['modifier'],
  overrideModifier: ['modifier'],

  propertyDeclaration: ['property_declaration', 'indexer_declaration'],
  methodSignature: ['method_declaration'],

  extendsClause: ['base_list'],
  implementsClause: ['base_list'],
  classHeritage: ['base_list'],

  typeIdentifier: ['identifier', 'predefined_type', 'generic_name', 'qualified_name', 'nullable_type'],
  genericType: ['generic_name', 'type_argument_list'],
  typeParameter: ['type_parameter'],

  identifier: ['identifier'],
  comment: ['comment'],
  decorator: ['attribute_list', 'attribute'],
  enumMember: ['enum_member_declaration'],
  exportStatement: [],
  callExpression: ['invocation_expression'],
  memberExpression: ['member_access_expression'],
  error: ['ERROR']
};

export class CSharpScopeExtractionParser extends BaseScopeExtractionParser {
  constructor() {
    super();
    this.language = 'csharp' as any;
    this.nodeTypes = CSHARP_NODE_TYPES;
    this.stopWords = CSHARP_STOP_WORDS;
    this.builtinIdentifiers = CSHARP_BUILTIN_IDENTIFIERS;
  }

  /**
   * Override extractScopes to handle C# specific constructs
   */
  protected extractScopes(
    node: SyntaxNode,
    scopes: ScopeInfo[],
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[],
    filePath: string
  ): void {
    // Handle namespace declarations
    if (node.type === 'namespace_declaration' || node.type === 'file_scoped_namespace_declaration') {
      const scope = this.extractNamespace(node, content, depth, parent, fileImports);
      scope.filePath = filePath;
      scopes.push(scope);

      // Extract children from declaration_list
      const declList = node.children.find((c: SyntaxNode) => c.type === 'declaration_list');
      if (declList) {
        for (const child of declList.children) {
          this.extractScopes(child, scopes, content, depth + 1, scope.name, fileImports, filePath);
        }
      }
      return;
    }

    // Handle class declarations
    if (node.type === 'class_declaration') {
      const scope = this.extractCSharpClass(node, content, depth, parent, fileImports);
      scope.filePath = filePath;
      scopes.push(scope);

      // Extract members
      const declList = node.children.find((c: SyntaxNode) => c.type === 'declaration_list');
      if (declList) {
        for (const child of declList.children) {
          this.extractCSharpMemberAsScope(child, scopes, content, depth + 1, scope.name, fileImports, filePath);
        }
      }
      return;
    }

    // Handle struct declarations
    if (node.type === 'struct_declaration') {
      const scope = this.extractCSharpStruct(node, content, depth, parent, fileImports);
      scope.filePath = filePath;
      scopes.push(scope);

      const declList = node.children.find((c: SyntaxNode) => c.type === 'declaration_list');
      if (declList) {
        for (const child of declList.children) {
          this.extractCSharpMemberAsScope(child, scopes, content, depth + 1, scope.name, fileImports, filePath);
        }
      }
      return;
    }

    // Handle record declarations
    if (node.type === 'record_declaration') {
      const scope = this.extractCSharpRecord(node, content, depth, parent, fileImports);
      scope.filePath = filePath;
      scopes.push(scope);

      const declList = node.children.find((c: SyntaxNode) => c.type === 'declaration_list');
      if (declList) {
        for (const child of declList.children) {
          this.extractCSharpMemberAsScope(child, scopes, content, depth + 1, scope.name, fileImports, filePath);
        }
      }
      return;
    }

    // Handle interface declarations
    if (node.type === 'interface_declaration') {
      const scope = this.extractCSharpInterface(node, content, depth, parent, fileImports);
      scope.filePath = filePath;
      scopes.push(scope);

      const declList = node.children.find((c: SyntaxNode) => c.type === 'declaration_list');
      if (declList) {
        for (const child of declList.children) {
          this.extractCSharpMemberAsScope(child, scopes, content, depth + 1, scope.name, fileImports, filePath);
        }
      }
      return;
    }

    // Handle enum declarations
    if (node.type === 'enum_declaration') {
      const scope = this.extractCSharpEnum(node, content, depth, parent, fileImports);
      scope.filePath = filePath;
      scopes.push(scope);
      return;
    }

    // Recurse into children for other node types
    for (const child of node.children) {
      this.extractScopes(child, scopes, content, depth, parent, fileImports, filePath);
    }
  }

  /**
   * Extract namespace information
   */
  protected extractNamespace(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): ScopeInfo {
    // Find the namespace name (qualified_name or identifier)
    const nameNode = node.children.find((c: SyntaxNode) =>
      c.type === 'qualified_name' || c.type === 'identifier'
    );
    const name = nameNode ? this.getNodeText(nameNode, content) : 'anonymous';

    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    const contentDedented = this.dedentContent(nodeContent);

    const isFileScoped = node.type === 'file_scoped_namespace_declaration';

    // Build reference exclusions and extract identifier references
    const referenceExclusions = this.buildReferenceExclusions(name, []);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));

    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

    return {
      name,
      type: 'namespace',
      startLine,
      endLine,
      filePath: '',
      signature: `namespace ${name}${isFileScoped ? ';' : ''}`,
      parameters: [],
      modifiers: isFileScoped ? ['file-scoped'] : [],
      content: nodeContent,
      contentDedented,
      children: [],
      dependencies: this.extractDependencies(nodeContent),
      exports: [name],
      imports: importReferences.length
        ? [...new Set(importReferences.map(ref => ref.source))]
        : [],
      importReferences,
      identifierReferences,
      complexity: 1,
      linesOfCode: endLine - startLine + 1,
      astValid: true,
      astIssues: [],
      astNotes: [],
      depth,
      parent,
    };
  }

  /**
   * Extract class information
   */
  protected extractCSharpClass(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): ScopeInfo {
    const nameNode = node.children.find((c: SyntaxNode) => c.type === 'identifier');
    const name = nameNode ? this.getNodeText(nameNode, content) : 'AnonymousClass';

    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    const contentDedented = this.dedentContent(nodeContent);

    // Extract modifiers
    const modifiers = this.extractCSharpModifiers(node, content);

    // Extract base classes/interfaces
    const heritageClauses = this.extractCSharpInheritance(node, content);

    // Extract generic parameters
    const genericParams = this.extractCSharpGenerics(node, content);

    // Extract members (properties, fields)
    const members = this.extractCSharpClassMembers(node, content);

    // Extract decorators/attributes
    const decoratorDetails = this.extractCSharpAttributes(node, content);

    // Build signature
    const modStr = modifiers.length > 0 ? modifiers.join(' ') + ' ' : '';
    const genericStr = genericParams.length > 0 ? `<${genericParams.map(p => p.name).join(', ')}>` : '';
    const signature = `${modStr}class ${name}${genericStr}`;

    // Build reference exclusions and extract identifier references
    const referenceExclusions = this.buildReferenceExclusions(name, []);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));

    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

    return {
      name,
      type: 'class',
      startLine,
      endLine,
      filePath: '',
      signature,
      parameters: [],
      modifiers,
      genericParameters: genericParams.length > 0 ? genericParams : undefined,
      heritageClauses: heritageClauses.length > 0 ? heritageClauses : undefined,
      decoratorDetails: decoratorDetails.length > 0 ? decoratorDetails : undefined,
      members,
      content: nodeContent,
      contentDedented,
      children: [],
      dependencies: this.extractDependencies(nodeContent),
      exports: modifiers.includes('public') ? [name] : [],
      imports: importReferences.length
        ? [...new Set(importReferences.map(ref => ref.source))]
        : [],
      importReferences,
      identifierReferences,
      complexity: 1,
      linesOfCode: endLine - startLine + 1,
      astValid: true,
      astIssues: [],
      astNotes: [],
      depth,
      parent,
    };
  }

  /**
   * Extract struct information
   */
  protected extractCSharpStruct(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): ScopeInfo {
    const scope = this.extractCSharpClass(node, content, depth, parent, fileImports);
    scope.signature = scope.signature.replace('class', 'struct');
    scope.modifiers = [...scope.modifiers, 'struct'];
    return scope;
  }

  /**
   * Extract record information
   */
  protected extractCSharpRecord(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): ScopeInfo {
    const nameNode = node.children.find((c: SyntaxNode) => c.type === 'identifier');
    const name = nameNode ? this.getNodeText(nameNode, content) : 'AnonymousRecord';

    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    const contentDedented = this.dedentContent(nodeContent);

    const modifiers = this.extractCSharpModifiers(node, content);

    // Record parameters (primary constructor)
    const paramList = node.children.find((c: SyntaxNode) => c.type === 'parameter_list');
    const parameters = paramList ? this.extractCSharpParameters(paramList, content) : [];

    const modStr = modifiers.length > 0 ? modifiers.join(' ') + ' ' : '';
    const paramStr = parameters.map(p => `${p.type || ''} ${p.name}`).join(', ');
    const signature = `${modStr}record ${name}(${paramStr})`;

    // Build reference exclusions and extract identifier references
    const referenceExclusions = this.buildReferenceExclusions(name, parameters);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));

    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

    return {
      name,
      type: 'class',
      startLine,
      endLine,
      filePath: '',
      signature,
      parameters,
      modifiers: [...modifiers, 'record'],
      content: nodeContent,
      contentDedented,
      children: [],
      dependencies: this.extractDependencies(nodeContent),
      exports: modifiers.includes('public') ? [name] : [],
      imports: importReferences.length
        ? [...new Set(importReferences.map(ref => ref.source))]
        : [],
      importReferences,
      identifierReferences,
      complexity: 1,
      linesOfCode: endLine - startLine + 1,
      astValid: true,
      astIssues: [],
      astNotes: [],
      depth,
      parent,
    };
  }

  /**
   * Extract interface information
   */
  protected extractCSharpInterface(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): ScopeInfo {
    const nameNode = node.children.find((c: SyntaxNode) => c.type === 'identifier');
    const name = nameNode ? this.getNodeText(nameNode, content) : 'AnonymousInterface';

    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    const contentDedented = this.dedentContent(nodeContent);

    const modifiers = this.extractCSharpModifiers(node, content);
    const genericParams = this.extractCSharpGenerics(node, content);
    const heritageClauses = this.extractCSharpInheritance(node, content);

    const modStr = modifiers.length > 0 ? modifiers.join(' ') + ' ' : '';
    const genericStr = genericParams.length > 0 ? `<${genericParams.map(p => p.name).join(', ')}>` : '';
    const signature = `${modStr}interface ${name}${genericStr}`;

    // Build reference exclusions and extract identifier references
    const referenceExclusions = this.buildReferenceExclusions(name, []);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));

    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

    return {
      name,
      type: 'interface',
      startLine,
      endLine,
      filePath: '',
      signature,
      parameters: [],
      modifiers,
      genericParameters: genericParams.length > 0 ? genericParams : undefined,
      heritageClauses: heritageClauses.length > 0 ? heritageClauses : undefined,
      content: nodeContent,
      contentDedented,
      children: [],
      dependencies: this.extractDependencies(nodeContent),
      exports: modifiers.includes('public') ? [name] : [],
      imports: importReferences.length
        ? [...new Set(importReferences.map(ref => ref.source))]
        : [],
      importReferences,
      identifierReferences,
      complexity: 1,
      linesOfCode: endLine - startLine + 1,
      astValid: true,
      astIssues: [],
      astNotes: [],
      depth,
      parent,
    };
  }

  /**
   * Extract enum information
   */
  protected extractCSharpEnum(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): ScopeInfo {
    const nameNode = node.children.find((c: SyntaxNode) => c.type === 'identifier');
    const name = nameNode ? this.getNodeText(nameNode, content) : 'AnonymousEnum';

    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    const contentDedented = this.dedentContent(nodeContent);

    const modifiers = this.extractCSharpModifiers(node, content);
    const enumMembers = this.extractCSharpEnumMembers(node, content);

    const modStr = modifiers.length > 0 ? modifiers.join(' ') + ' ' : '';
    const signature = `${modStr}enum ${name}`;

    // Build reference exclusions and extract identifier references
    const referenceExclusions = this.buildReferenceExclusions(name, []);
    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

    return {
      name,
      type: 'enum',
      startLine,
      endLine,
      filePath: '',
      signature,
      parameters: [],
      modifiers,
      enumMembers,
      content: nodeContent,
      contentDedented,
      children: [],
      dependencies: this.extractDependencies(nodeContent),
      exports: modifiers.includes('public') ? [name] : [],
      imports: importReferences.length
        ? [...new Set(importReferences.map(ref => ref.source))]
        : [],
      importReferences,
      identifierReferences,
      complexity: 1,
      linesOfCode: endLine - startLine + 1,
      astValid: true,
      astIssues: [],
      astNotes: [],
      depth,
      parent,
    };
  }

  /**
   * Extract member as a scope (methods, constructors)
   */
  protected extractCSharpMemberAsScope(
    node: SyntaxNode,
    scopes: ScopeInfo[],
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[],
    filePath: string
  ): void {
    if (node.type === 'method_declaration') {
      const scope = this.extractCSharpMethod(node, content, depth, parent, fileImports);
      scope.filePath = filePath;
      scopes.push(scope);
    } else if (node.type === 'constructor_declaration') {
      const scope = this.extractCSharpConstructor(node, content, depth, parent, fileImports);
      scope.filePath = filePath;
      scopes.push(scope);
    }
    // Properties and fields are extracted as members, not scopes
  }

  /**
   * Extract method information
   */
  protected extractCSharpMethod(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): ScopeInfo {
    // Find method name - it's the identifier right before parameter_list
    // (or right before type_parameter_list if generics are present)
    let nameNode: SyntaxNode | undefined;
    for (const child of node.children) {
      if (child.type === 'identifier') {
        const next = child.nextSibling;
        // Method name is immediately before parameter_list or type_parameter_list
        if (next?.type === 'parameter_list' || next?.type === 'type_parameter_list') {
          nameNode = child;
          break;
        }
      }
    }
    const name = nameNode ? this.getNodeText(nameNode, content) : 'anonymous';

    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    const contentDedented = this.dedentContent(nodeContent);

    const modifiers = this.extractCSharpModifiers(node, content);

    // Extract return type
    const returnTypeNode = node.children.find((c: SyntaxNode) =>
      c.type === 'predefined_type' || c.type === 'identifier' ||
      c.type === 'generic_name' || c.type === 'qualified_name' ||
      c.type === 'nullable_type'
    );
    const returnType = returnTypeNode ? this.getNodeText(returnTypeNode, content) : undefined;

    // Extract parameters
    const paramList = node.children.find((c: SyntaxNode) => c.type === 'parameter_list');
    const parameters = paramList ? this.extractCSharpParameters(paramList, content) : [];

    // Extract generic parameters
    const genericParams = this.extractCSharpGenerics(node, content);

    // Extract attributes
    const decoratorDetails = this.extractCSharpAttributes(node, content);

    // Build signature
    const modStr = modifiers.length > 0 ? modifiers.join(' ') + ' ' : '';
    const genericStr = genericParams.length > 0 ? `<${genericParams.map(p => p.name).join(', ')}>` : '';
    const paramStr = parameters.map(p => `${p.type || ''} ${p.name}`).join(', ');
    const signature = `${modStr}${returnType || 'void'} ${name}${genericStr}(${paramStr})`;

    // Build reference exclusions and extract identifier references
    const referenceExclusions = this.buildReferenceExclusions(name, parameters);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));

    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

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
      genericParameters: genericParams.length > 0 ? genericParams : undefined,
      decoratorDetails: decoratorDetails.length > 0 ? decoratorDetails : undefined,
      content: nodeContent,
      contentDedented,
      children: [],
      dependencies: this.extractDependencies(nodeContent),
      exports: [],
      imports: importReferences.length
        ? [...new Set(importReferences.map(ref => ref.source))]
        : [],
      importReferences,
      identifierReferences,
      complexity: this.calculateComplexity(node),
      linesOfCode: endLine - startLine + 1,
      astValid: true,
      astIssues: [],
      astNotes: [],
      depth,
      parent,
    };
  }

  /**
   * Extract constructor information
   */
  protected extractCSharpConstructor(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): ScopeInfo {
    const nameNode = node.children.find((c: SyntaxNode) => c.type === 'identifier');
    const name = nameNode ? this.getNodeText(nameNode, content) : parent || 'constructor';

    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    const contentDedented = this.dedentContent(nodeContent);

    const modifiers = this.extractCSharpModifiers(node, content);

    const paramList = node.children.find((c: SyntaxNode) => c.type === 'parameter_list');
    const parameters = paramList ? this.extractCSharpParameters(paramList, content) : [];

    const modStr = modifiers.length > 0 ? modifiers.join(' ') + ' ' : '';
    const paramStr = parameters.map(p => `${p.type || ''} ${p.name}`).join(', ');
    const signature = `${modStr}${name}(${paramStr})`;

    // Build reference exclusions and extract identifier references
    const referenceExclusions = this.buildReferenceExclusions(name, parameters);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));

    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

    return {
      name: 'constructor',
      type: 'method',
      startLine,
      endLine,
      filePath: '',
      signature,
      parameters,
      modifiers: [...modifiers, 'constructor'],
      content: nodeContent,
      contentDedented,
      children: [],
      dependencies: this.extractDependencies(nodeContent),
      exports: [],
      imports: importReferences.length
        ? [...new Set(importReferences.map(ref => ref.source))]
        : [],
      importReferences,
      identifierReferences,
      complexity: this.calculateComplexity(node),
      linesOfCode: endLine - startLine + 1,
      astValid: true,
      astIssues: [],
      astNotes: [],
      depth,
      parent,
    };
  }

  /**
   * Extract C# modifiers from node
   */
  protected extractCSharpModifiers(node: SyntaxNode, content: string): string[] {
    const modifiers: string[] = [];
    for (const child of node.children) {
      if (child.type === 'modifier') {
        modifiers.push(this.getNodeText(child, content));
      }
    }
    return modifiers;
  }

  /**
   * Extract C# inheritance (base classes and interfaces)
   */
  protected extractCSharpInheritance(node: SyntaxNode, content: string): any[] {
    const baseList = node.children.find((c: SyntaxNode) => c.type === 'base_list');
    if (!baseList) return [];

    const clauses: any[] = [];
    for (const child of baseList.children) {
      if (child.type === 'identifier' || child.type === 'generic_name' || child.type === 'qualified_name') {
        const typeName = this.getNodeText(child, content);
        // In C#, we can't easily tell if it's a class or interface from AST alone
        // Convention: interfaces start with 'I'
        const clause = typeName.startsWith('I') && typeName.length > 1 && typeName[1] === typeName[1].toUpperCase()
          ? 'implements'
          : 'extends';
        clauses.push({
          clause,
          types: [typeName],
        });
      }
    }
    return clauses;
  }

  /**
   * Extract C# class members (properties, fields)
   */
  protected extractCSharpClassMembers(node: SyntaxNode, content: string): any[] {
    const members: any[] = [];
    const declList = node.children.find((c: SyntaxNode) => c.type === 'declaration_list');
    if (!declList) return members;

    for (const child of declList.children) {
      if (child.type === 'field_declaration') {
        const modifiers = this.extractCSharpModifiers(child, content);
        const varDecl = child.children.find((c: SyntaxNode) => c.type === 'variable_declaration');
        if (varDecl) {
          const typeNode = varDecl.children.find((c: SyntaxNode) =>
            c.type === 'predefined_type' || c.type === 'identifier' ||
            c.type === 'generic_name' || c.type === 'qualified_name'
          );
          const declarators = varDecl.children.filter((c: SyntaxNode) => c.type === 'variable_declarator');

          for (const decl of declarators) {
            const nameNode = decl.children.find((c: SyntaxNode) => c.type === 'identifier');
            if (nameNode) {
              members.push({
                name: this.getNodeText(nameNode, content),
                type: typeNode ? this.getNodeText(typeNode, content) : undefined,
                kind: 'property',
                accessibility: this.getAccessibility(modifiers),
                isStatic: modifiers.includes('static'),
                isReadonly: modifiers.includes('readonly'),
                line: child.startPosition.row + 1,
              });
            }
          }
        }
      } else if (child.type === 'property_declaration') {
        const modifiers = this.extractCSharpModifiers(child, content);
        const typeNode = child.children.find((c: SyntaxNode) =>
          c.type === 'predefined_type' || c.type === 'identifier' ||
          c.type === 'generic_name' || c.type === 'qualified_name'
        );
        const nameNode = child.children.find((c: SyntaxNode) =>
          c.type === 'identifier' && c.previousSibling?.type !== 'modifier'
        );

        if (nameNode) {
          members.push({
            name: this.getNodeText(nameNode, content),
            type: typeNode ? this.getNodeText(typeNode, content) : undefined,
            kind: 'property',
            accessibility: this.getAccessibility(modifiers),
            isStatic: modifiers.includes('static'),
            isReadonly: !child.children.some((c: SyntaxNode) =>
              c.type === 'accessor_list' && this.getNodeText(c, content).includes('set')
            ),
            line: child.startPosition.row + 1,
          });
        }
      }
    }

    return members;
  }

  /**
   * Get accessibility from modifiers
   */
  private getAccessibility(modifiers: string[]): string {
    if (modifiers.includes('public')) return 'public';
    if (modifiers.includes('protected')) return 'protected';
    if (modifiers.includes('private')) return 'private';
    if (modifiers.includes('internal')) return 'internal';
    return 'private'; // Default in C#
  }

  /**
   * Extract C# enum members
   */
  protected extractCSharpEnumMembers(node: SyntaxNode, content: string): any[] {
    const members: any[] = [];
    const memberList = node.children.find((c: SyntaxNode) => c.type === 'enum_member_declaration_list');
    if (!memberList) return members;

    for (const child of memberList.children) {
      if (child.type === 'enum_member_declaration') {
        const nameNode = child.children.find((c: SyntaxNode) => c.type === 'identifier');
        if (nameNode) {
          // Check for explicit value
          const equalsValue = child.children.find((c: SyntaxNode) => c.type === 'equals_value_clause');
          let value: string | undefined;
          if (equalsValue) {
            const literal = equalsValue.children.find((c: SyntaxNode) =>
              c.type === 'integer_literal' || c.type === 'identifier'
            );
            value = literal ? this.getNodeText(literal, content) : undefined;
          }

          members.push({
            name: this.getNodeText(nameNode, content),
            value,
            line: child.startPosition.row + 1,
          });
        }
      }
    }

    return members;
  }

  /**
   * Extract C# parameters
   */
  protected extractCSharpParameters(paramList: SyntaxNode, content: string): any[] {
    const params: any[] = [];

    for (const child of paramList.children) {
      if (child.type === 'parameter') {
        const typeNode = child.children.find((c: SyntaxNode) =>
          c.type === 'predefined_type' || c.type === 'identifier' ||
          c.type === 'generic_name' || c.type === 'qualified_name' ||
          c.type === 'nullable_type'
        );
        const nameNode = child.children.find((c: SyntaxNode) => c.type === 'identifier');

        // Skip if this identifier is the type
        const actualName = nameNode && typeNode && nameNode !== typeNode
          ? this.getNodeText(nameNode, content)
          : nameNode ? this.getNodeText(nameNode, content) : '_';

        // Check for 'this' modifier (extension method)
        const hasThis = child.children.some((c: SyntaxNode) =>
          c.type === 'modifier' && this.getNodeText(c, content) === 'this'
        );

        // Check for default value
        const defaultClause = child.children.find((c: SyntaxNode) => c.type === 'equals_value_clause');
        const defaultValue = defaultClause
          ? this.getNodeText(defaultClause, content).replace(/^=\s*/, '')
          : undefined;

        params.push({
          name: actualName,
          type: typeNode ? this.getNodeText(typeNode, content) : undefined,
          optional: !!defaultValue,
          defaultValue,
          isExtension: hasThis,
          line: child.startPosition.row + 1,
          column: child.startPosition.column,
        });
      }
    }

    return params;
  }

  /**
   * Extract C# generic parameters
   */
  protected extractCSharpGenerics(node: SyntaxNode, content: string): any[] {
    const params: any[] = [];
    const typeParamList = node.children.find((c: SyntaxNode) => c.type === 'type_parameter_list');
    if (!typeParamList) return params;

    for (const child of typeParamList.children) {
      if (child.type === 'type_parameter') {
        const nameNode = child.children.find((c: SyntaxNode) => c.type === 'identifier');
        if (nameNode) {
          params.push({
            name: this.getNodeText(nameNode, content),
          });
        }
      }
    }

    // Look for constraints
    const constraintClauses = node.children.filter((c: SyntaxNode) =>
      c.type === 'type_parameter_constraints_clause'
    );

    for (const clause of constraintClauses) {
      const paramName = clause.children.find((c: SyntaxNode) => c.type === 'identifier');
      if (paramName) {
        const name = this.getNodeText(paramName, content);
        const param = params.find(p => p.name === name);
        if (param) {
          // Extract constraints
          const constraints = clause.children.filter((c: SyntaxNode) =>
            c.type === 'type_constraint' || c.type === 'constructor_constraint' ||
            c.type === 'class_constraint' || c.type === 'struct_constraint'
          );
          param.constraint = constraints.map(c => this.getNodeText(c, content)).join(', ');
        }
      }
    }

    return params;
  }

  /**
   * Extract C# attributes
   */
  protected extractCSharpAttributes(node: SyntaxNode, content: string): any[] {
    const attrs: any[] = [];

    for (const child of node.children) {
      if (child.type === 'attribute_list') {
        for (const attr of child.children) {
          if (attr.type === 'attribute') {
            const nameNode = attr.children.find((c: SyntaxNode) =>
              c.type === 'identifier' || c.type === 'qualified_name'
            );
            if (nameNode) {
              const argList = attr.children.find((c: SyntaxNode) => c.type === 'attribute_argument_list');
              attrs.push({
                name: this.getNodeText(nameNode, content),
                arguments: argList ? this.getNodeText(argList, content) : undefined,
                line: attr.startPosition.row + 1,
              });
            }
          }
        }
      }
    }

    return attrs;
  }
}
