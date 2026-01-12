/**
 * C++ Scope Extraction Parser
 *
 * Extends CScopeExtractionParser with C++-specific features:
 * - Classes and structs with methods
 * - Namespaces
 * - Templates
 * - Access modifiers (public, private, protected)
 */

import { CScopeExtractionParser, C_STOP_WORDS, C_BUILTIN_IDENTIFIERS } from './CScopeExtractionParser.js';
import { NodeTypeConfig, SyntaxNode } from './BaseScopeExtractionParser.js';
import type { ScopeInfo, ImportReference } from './types.js';

/** C++-specific keywords */
export const CPP_STOP_WORDS = new Set([
  ...C_STOP_WORDS,
  'class', 'namespace', 'template', 'typename', 'public', 'private', 'protected',
  'virtual', 'override', 'final', 'explicit', 'inline', 'constexpr', 'consteval',
  'mutable', 'friend', 'operator', 'new', 'delete', 'this', 'nullptr',
  'try', 'catch', 'throw', 'noexcept', 'using', 'decltype', 'auto',
  'static_cast', 'dynamic_cast', 'const_cast', 'reinterpret_cast',
  'true', 'false', 'bool', 'wchar_t', 'char16_t', 'char32_t'
]);

/** C++-specific builtins */
export const CPP_BUILTIN_IDENTIFIERS = new Set([
  ...C_BUILTIN_IDENTIFIERS,
  'std', 'cout', 'cin', 'cerr', 'endl', 'string', 'vector', 'map', 'set',
  'unordered_map', 'unordered_set', 'list', 'deque', 'array', 'pair',
  'tuple', 'optional', 'variant', 'any', 'shared_ptr', 'unique_ptr',
  'weak_ptr', 'make_shared', 'make_unique', 'move', 'forward'
]);

/** C++ AST node type mappings */
export const CPP_NODE_TYPES: NodeTypeConfig = {
  classDeclaration: ['class_specifier', 'struct_specifier'],
  interfaceDeclaration: [], // C++ uses abstract classes, not interfaces
  functionDeclaration: ['function_definition'],
  methodDefinition: ['function_definition'], // Methods are function_definition inside class
  enumDeclaration: ['enum_specifier'],
  typeAliasDeclaration: ['type_definition', 'alias_declaration', 'using_declaration'],
  namespaceDeclaration: ['namespace_definition'],

  variableDeclaration: ['declaration'],
  variableDeclarator: ['init_declarator'],
  variableKind: [],

  arrowFunction: [], // C++ lambdas are different
  functionExpression: ['lambda_expression'],

  parameter: ['parameter_declaration'],
  optionalParameter: ['optional_parameter_declaration'],
  restParameter: ['variadic_parameter_declaration'],

  accessibilityModifier: ['access_specifier'],
  staticModifier: ['storage_class_specifier'],
  abstractModifier: [], // C++ uses 'virtual' and '= 0'
  readonlyModifier: ['type_qualifier'],
  asyncModifier: [],
  overrideModifier: ['virtual_specifier'],

  propertyDeclaration: ['field_declaration'],
  methodSignature: [],

  extendsClause: ['base_class_clause'],
  implementsClause: [],
  classHeritage: ['base_class_clause'],

  typeIdentifier: ['type_identifier', 'primitive_type', 'qualified_identifier'],
  genericType: ['template_type'],
  typeParameter: ['type_parameter_declaration'],

  identifier: ['identifier', 'namespace_identifier'],
  comment: ['comment'],
  decorator: [], // C++ uses attributes [[...]]
  enumMember: ['enumerator'],
  exportStatement: [],
  callExpression: ['call_expression'],
  memberExpression: ['field_expression', 'qualified_identifier'],
  error: ['ERROR']
};

export class CppScopeExtractionParser extends CScopeExtractionParser {
  constructor() {
    super();
    this.language = 'cpp' as any;
    this.nodeTypes = CPP_NODE_TYPES;
    this.stopWords = CPP_STOP_WORDS;
    this.builtinIdentifiers = CPP_BUILTIN_IDENTIFIERS;
  }

  /**
   * Override extractScopes to handle C++ specific constructs
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
    // Handle namespace definitions
    if (node.type === 'namespace_definition') {
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

    // Handle template declarations
    if (node.type === 'template_declaration') {
      // Get the actual declaration inside the template
      const innerDecl = node.children.find((c: SyntaxNode) =>
        c.type === 'class_specifier' ||
        c.type === 'struct_specifier' ||
        c.type === 'function_definition'
      );
      if (innerDecl) {
        this.extractScopes(innerDecl, scopes, content, depth, parent, fileImports, filePath);
        // Mark as template
        const lastScope = scopes[scopes.length - 1];
        if (lastScope) {
          lastScope.genericParameters = this.extractTemplateParameters(node, content);
        }
      }
      return;
    }

    // Handle class/struct with methods
    if (node.type === 'class_specifier' || node.type === 'struct_specifier') {
      const scope = this.extractCppClass(node, content, depth, parent, fileImports);
      scope.filePath = filePath;
      scopes.push(scope);

      // Extract methods from field_declaration_list
      const fieldList = node.children.find((c: SyntaxNode) => c.type === 'field_declaration_list');
      if (fieldList) {
        for (const child of fieldList.children) {
          if (child.type === 'function_definition') {
            const methodScope = this.extractCppMethod(child, content, depth + 1, scope.name, fileImports);
            methodScope.filePath = filePath;
            scopes.push(methodScope);
          }
        }
      }
      return;
    }

    // Delegate to parent for other cases
    super.extractScopes(node, scopes, content, depth, parent, fileImports, filePath);
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
    const nameNode = node.children.find((c: SyntaxNode) => c.type === 'namespace_identifier');
    const name = nameNode ? this.getNodeText(nameNode, content) : 'anonymous';

    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    const contentDedented = this.dedentContent(nodeContent);

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
      signature: `namespace ${name}`,
      parameters: [],
      modifiers: [],
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
   * Extract C++ class/struct with inheritance
   */
  protected extractCppClass(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): ScopeInfo {
    const nameNode = node.children.find((c: SyntaxNode) => c.type === 'type_identifier');
    const name = nameNode ? this.getNodeText(nameNode, content) : 'AnonymousClass';
    const isStruct = node.type === 'struct_specifier';

    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    const contentDedented = this.dedentContent(nodeContent);

    // Extract base classes
    const heritageClauses = this.extractCppInheritance(node, content);
    const members = this.extractCppMembers(node, content);

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
      signature: `${isStruct ? 'struct' : 'class'} ${name}`,
      parameters: [],
      modifiers: isStruct ? ['struct'] : [],
      heritageClauses,
      content: nodeContent,
      contentDedented,
      children: [],
      members,
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
   * Extract C++ inheritance (base classes)
   */
  protected extractCppInheritance(node: SyntaxNode, content: string): any[] {
    const baseClause = node.children.find((c: SyntaxNode) => c.type === 'base_class_clause');
    if (!baseClause) return [];

    const clauses: any[] = [];
    for (const child of baseClause.children) {
      if (child.type === 'type_identifier' || child.type === 'qualified_identifier') {
        clauses.push({
          type: 'extends',
          name: this.getNodeText(child, content),
        });
      }
    }
    return clauses;
  }

  /**
   * Extract C++ class members (fields)
   */
  protected extractCppMembers(node: SyntaxNode, content: string): any[] {
    const members: any[] = [];
    const fieldList = node.children.find((c: SyntaxNode) => c.type === 'field_declaration_list');

    if (fieldList) {
      let currentAccess = node.type === 'struct_specifier' ? 'public' : 'private';

      for (const child of fieldList.children) {
        // Track access specifiers
        if (child.type === 'access_specifier') {
          const text = this.getNodeText(child, content).replace(':', '').trim();
          currentAccess = text;
          continue;
        }

        // Field declarations
        if (child.type === 'field_declaration') {
          const typeNode = child.children.find((c: SyntaxNode) =>
            c.type === 'primitive_type' || c.type === 'type_identifier' || c.type === 'qualified_identifier'
          );
          const declarator = child.children.find((c: SyntaxNode) =>
            c.type === 'field_identifier' || c.type === 'identifier'
          );

          if (declarator) {
            members.push({
              name: this.getNodeText(declarator, content),
              type: typeNode ? this.getNodeText(typeNode, content) : undefined,
              kind: 'property',
              accessibility: currentAccess,
              line: child.startPosition.row + 1,
            });
          }
        }
      }
    }

    return members;
  }

  /**
   * Extract C++ method
   */
  protected extractCppMethod(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): ScopeInfo {
    // Use recursive search to handle pointer/reference return types (T*, T&, T**)
    const declarator = this.findFunctionDeclarator(node);
    let name = 'AnonymousMethod';

    if (declarator) {
      // Use extractFunctionName to handle qualified names (Class::method), field_identifier, etc.
      name = this.extractFunctionName(declarator, content) || 'AnonymousMethod';
    }

    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    const contentDedented = this.dedentContent(nodeContent);

    const returnTypeNode = node.children.find((c: SyntaxNode) =>
      c.type === 'primitive_type' || c.type === 'type_identifier'
    );
    const returnType = returnTypeNode ? this.getNodeText(returnTypeNode, content) : undefined;

    const parameters = this.extractCParameters(declarator, content);
    const signature = this.buildCSignature(name, parameters, returnType);

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
      modifiers: [],
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
   * Extract template parameters
   */
  protected extractTemplateParameters(node: SyntaxNode, content: string): any[] {
    const templateParams = node.children.find((c: SyntaxNode) => c.type === 'template_parameter_list');
    if (!templateParams) return [];

    const params: any[] = [];
    for (const child of templateParams.children) {
      if (child.type === 'type_parameter_declaration') {
        const name = child.children.find((c: SyntaxNode) => c.type === 'type_identifier');
        if (name) {
          params.push({
            name: this.getNodeText(name, content),
            constraint: undefined,
          });
        }
      }
    }
    return params;
  }
}
