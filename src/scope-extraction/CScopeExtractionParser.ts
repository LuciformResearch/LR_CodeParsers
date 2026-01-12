/**
 * C Scope Extraction Parser
 *
 * Extends BaseScopeExtractionParser with C-specific AST node type mappings.
 */

import { BaseScopeExtractionParser, NodeTypeConfig, IDENTIFIER_STOP_WORDS, SyntaxNode } from './BaseScopeExtractionParser.js';
import type { ScopeInfo, ImportReference, ParameterInfo } from './types.js';

/** C-specific keywords to exclude from identifier references */
export const C_STOP_WORDS = new Set([
  ...IDENTIFIER_STOP_WORDS,
  // C-specific keywords
  'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
  'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if',
  'inline', 'int', 'long', 'register', 'restrict', 'return', 'short',
  'signed', 'sizeof', 'static', 'struct', 'switch', 'typedef', 'union',
  'unsigned', 'void', 'volatile', 'while', '_Bool', '_Complex', '_Imaginary'
]);

/** C-specific builtins to exclude from references
 * Note: We do NOT spread from BUILTIN_IDENTIFIERS because those are JS/TS builtins
 * like Error, Promise, console which don't exist in C */
export const C_BUILTIN_IDENTIFIERS = new Set([
  // Standard C library functions
  'printf', 'scanf', 'malloc', 'free', 'calloc', 'realloc',
  'strlen', 'strcpy', 'strcat', 'strcmp', 'memcpy', 'memset',
  'fopen', 'fclose', 'fread', 'fwrite', 'fprintf', 'fscanf',
  'exit', 'abort', 'atoi', 'atof', 'rand', 'srand',
  // Standard C macros/constants
  'NULL', 'EOF', 'stdin', 'stdout', 'stderr',
  // Standard C types (from stdint.h, etc.)
  'size_t', 'ptrdiff_t', 'intptr_t', 'uintptr_t',
  'int8_t', 'int16_t', 'int32_t', 'int64_t',
  'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t',
  'bool', 'true', 'false'
]);

/** C AST node type mappings */
export const C_NODE_TYPES: NodeTypeConfig = {
  // C has function_definition instead of function_declaration
  classDeclaration: ['struct_specifier'], // structs are like classes in C
  interfaceDeclaration: [], // C doesn't have interfaces
  functionDeclaration: ['function_definition'],
  methodDefinition: [], // C doesn't have methods (just functions)
  enumDeclaration: ['enum_specifier'],
  typeAliasDeclaration: ['type_definition'], // typedef
  namespaceDeclaration: [], // C doesn't have namespaces

  variableDeclaration: ['declaration'],
  variableDeclarator: ['init_declarator'],
  variableKind: [], // C doesn't have const/let/var keywords for declarations

  arrowFunction: [], // C doesn't have arrow functions
  functionExpression: [], // C doesn't have function expressions

  parameter: ['parameter_declaration'],
  optionalParameter: [], // C doesn't have optional parameters
  restParameter: [], // C doesn't have rest parameters

  // C modifiers
  accessibilityModifier: [], // C doesn't have public/private
  staticModifier: ['storage_class_specifier'], // static keyword
  abstractModifier: [], // C doesn't have abstract
  readonlyModifier: ['type_qualifier'], // const qualifier
  asyncModifier: [], // C doesn't have async
  overrideModifier: [], // C doesn't have override

  propertyDeclaration: ['field_declaration'],
  methodSignature: [], // C doesn't have method signatures

  extendsClause: [], // C doesn't have inheritance
  implementsClause: [], // C doesn't have implements
  classHeritage: [], // C doesn't have class heritage

  typeIdentifier: ['type_identifier', 'primitive_type'],
  genericType: [], // C doesn't have generics
  typeParameter: [], // C doesn't have type parameters

  identifier: ['identifier'],
  comment: ['comment'],
  decorator: [], // C doesn't have decorators
  enumMember: ['enumerator'],
  exportStatement: [], // C doesn't have export statements
  callExpression: ['call_expression'],
  memberExpression: ['field_expression'], // a.b or a->b
  error: ['ERROR']
};

export class CScopeExtractionParser extends BaseScopeExtractionParser {
  constructor() {
    super('c');
    this.nodeTypes = C_NODE_TYPES;
    this.stopWords = C_STOP_WORDS;
    this.builtinIdentifiers = C_BUILTIN_IDENTIFIERS;
  }

  /**
   * Recursively find function_declarator inside declarator structures.
   * Handles: pointer_declarator (T*, T**), reference_declarator (T&), array_declarator (T[])
   */
  protected findFunctionDeclarator(node: SyntaxNode): SyntaxNode | null {
    const declaratorTypes = new Set([
      'pointer_declarator',
      'reference_declarator',
      'array_declarator',
      'parenthesized_declarator'
    ]);

    const search = (n: SyntaxNode): SyntaxNode | null => {
      for (const child of n.children) {
        if (child.type === 'function_declarator') {
          return child;
        }
        if (declaratorTypes.has(child.type)) {
          const found = search(child);
          if (found) return found;
        }
      }
      return null;
    };

    // First check direct children
    const direct = node.children.find((c: SyntaxNode) => c.type === 'function_declarator');
    if (direct) return direct;

    // Then search recursively in declarator structures
    for (const child of node.children) {
      if (declaratorTypes.has(child.type)) {
        const found = search(child);
        if (found) return found;
      }
    }

    return null;
  }

  /**
   * Extract function name from a function_declarator.
   * Handles:
   * - Direct identifier: func(...)
   * - Qualified identifier (C++): Class::method(...) or Namespace::Class::method(...)
   * - Field identifier: some C++ cases
   */
  protected extractFunctionName(declarator: SyntaxNode, content: string): string | null {
    // Look for direct identifier first (simple case)
    const directId = declarator.children.find((c: SyntaxNode) => c.type === 'identifier');
    if (directId) {
      return this.getNodeText(directId, content);
    }

    // Look for qualified_identifier (C++: Class::method or Namespace::Class::method)
    const qualifiedId = declarator.children.find((c: SyntaxNode) => c.type === 'qualified_identifier');
    if (qualifiedId) {
      // The actual function name is the last identifier in the qualified path
      const ids = qualifiedId.children.filter((c: SyntaxNode) => c.type === 'identifier');
      if (ids.length > 0) {
        return this.getNodeText(ids[ids.length - 1], content);
      }
    }

    // Look for field_identifier (some C++ method cases)
    const fieldId = declarator.children.find((c: SyntaxNode) => c.type === 'field_identifier');
    if (fieldId) {
      return this.getNodeText(fieldId, content);
    }

    return null;
  }

  /**
   * Extract function name from C's AST structure
   * In C: function_definition -> function_declarator -> identifier
   * Or for pointers: function_definition -> pointer_declarator+ -> function_declarator -> identifier
   */
  protected extractFunction(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): ScopeInfo {
    // Find function_declarator (may be nested in pointer/reference/array declarators)
    const declarator = this.findFunctionDeclarator(node);
    let name = 'AnonymousFunction';

    if (declarator) {
      name = this.extractFunctionName(declarator, content) || 'AnonymousFunction';
    }

    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);

    // Extract return type from primitive_type or type_identifier
    const returnTypeNode = node.children.find((c: SyntaxNode) =>
      c.type === 'primitive_type' || c.type === 'type_identifier'
    );
    const returnType = returnTypeNode ? this.getNodeText(returnTypeNode, content) : undefined;

    const parameters = this.extractCParameters(declarator, content);
    const signature = this.buildCSignature(name, parameters, returnType);
    const contentDedented = this.dedentContent(nodeContent);

    // Extract identifier references
    const referenceExclusions = this.buildReferenceExclusions(name, parameters);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));

    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

    const variables = this.extractVariables(node, content, name);
    const dependencies = this.extractDependencies(nodeContent);
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
      returnTypeInfo: returnType ? { type: returnType, line: startLine, column: 0 } : undefined,
      modifiers: [],
      content: nodeContent,
      contentDedented,
      children: [],
      variables,
      identifierReferences,
      importReferences,
      dependencies,
      exports: [name],
      imports: importReferences.length
        ? [...new Set(importReferences.map(ref => ref.source))]
        : this.extractImports(nodeContent),
      complexity,
      linesOfCode,
      astValid: true,
      astIssues: [],
      astNotes: [],
      depth,
      parent,
    };
  }

  /**
   * Extract parameters from C function declarator
   * In C: function_declarator -> parameter_list -> parameter_declaration
   */
  protected extractCParameters(declarator: SyntaxNode | undefined, content: string): ParameterInfo[] {
    if (!declarator) return [];

    const parameters: ParameterInfo[] = [];
    const paramList = declarator.children.find((c: SyntaxNode) => c.type === 'parameter_list');

    if (paramList) {
      for (const child of paramList.children) {
        if (child.type === 'parameter_declaration') {
          // In C parameter_declaration: type + declarator
          // e.g., "int a" where "int" is type and "a" is declarator
          const typeNode = child.children.find((c: SyntaxNode) =>
            c.type === 'primitive_type' || c.type === 'type_identifier'
          );
          const identifierNode = child.children.find((c: SyntaxNode) => c.type === 'identifier');

          const type = typeNode ? this.getNodeText(typeNode, content) : undefined;
          const name = identifierNode ? this.getNodeText(identifierNode, content) : '';

          if (name) {
            parameters.push({
              name,
              type,
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
   * Build C function signature
   */
  protected buildCSignature(name: string, parameters: ParameterInfo[], returnType?: string): string {
    const params = parameters.map(p => p.type ? `${p.type} ${p.name}` : p.name).join(', ');
    const ret = returnType || 'void';
    return `${ret} ${name}(${params})`;
  }

  /**
   * Extract struct (class) information from C's AST
   * In C: struct_specifier -> type_identifier, field_declaration_list
   */
  protected extractClass(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): ScopeInfo {
    // Find struct name
    const nameNode = node.children.find((c: SyntaxNode) => c.type === 'type_identifier');
    const name = nameNode ? this.getNodeText(nameNode, content) : 'AnonymousStruct';

    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);

    // Extract struct fields (members)
    const members = this.extractStructMembers(node, content);
    const signature = `struct ${name}`;
    const contentDedented = this.dedentContent(nodeContent);

    // Build reference exclusions and extract identifier references
    const referenceExclusions = this.buildReferenceExclusions(name, []);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));

    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

    return {
      name,
      type: 'class', // Use 'class' type for consistency
      startLine,
      endLine,
      filePath: '',
      signature,
      parameters: [],
      modifiers: [],
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
   * Extract struct members (fields)
   */
  protected extractStructMembers(node: SyntaxNode, content: string): any[] {
    const members: any[] = [];
    const fieldList = node.children.find((c: SyntaxNode) => c.type === 'field_declaration_list');

    if (fieldList) {
      for (const field of fieldList.children) {
        if (field.type === 'field_declaration') {
          const typeNode = field.children.find((c: SyntaxNode) =>
            c.type === 'primitive_type' || c.type === 'type_identifier'
          );
          const declarator = field.children.find((c: SyntaxNode) =>
            c.type === 'field_identifier' || c.type === 'identifier'
          );

          const type = typeNode ? this.getNodeText(typeNode, content) : undefined;
          const name = declarator ? this.getNodeText(declarator, content) : '';

          if (name) {
            members.push({
              name,
              type,
              kind: 'property',
              line: field.startPosition.row + 1,
            });
          }
        }
      }
    }

    return members;
  }

  /**
   * Extract enum information from C's AST
   * In C: enum_specifier -> type_identifier, enumerator_list
   */
  protected extractEnum(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): ScopeInfo {
    const nameNode = node.children.find((c: SyntaxNode) => c.type === 'type_identifier');
    const name = nameNode ? this.getNodeText(nameNode, content) : 'AnonymousEnum';

    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);

    // Extract enum members
    const enumMembers = this.extractCEnumMembers(node, content);
    const signature = `enum ${name}`;
    const contentDedented = this.dedentContent(nodeContent);

    // Build reference exclusions and extract identifier references
    const referenceExclusions = this.buildReferenceExclusions(name, []);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));

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
      modifiers: [],
      content: nodeContent,
      contentDedented,
      children: [],
      enumMembers,
      dependencies: [],
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
   * Extract enum members from enumerator_list
   */
  protected extractCEnumMembers(node: SyntaxNode, content: string): any[] {
    const members: any[] = [];
    const enumList = node.children.find((c: SyntaxNode) => c.type === 'enumerator_list');

    if (enumList) {
      for (const child of enumList.children) {
        if (child.type === 'enumerator') {
          const identifier = child.children.find((c: SyntaxNode) => c.type === 'identifier');
          const name = identifier ? this.getNodeText(identifier, content) : '';

          if (name) {
            members.push({
              name,
              line: child.startPosition.row + 1,
            });
          }
        }
      }
    }

    return members;
  }

  /**
   * Find the typedef name by recursively searching in declarator nodes.
   * Handles all typedef patterns:
   * - Simple: typedef int MyInt; (direct child)
   * - Pointer: typedef char* String; (pointer_declarator > type_identifier)
   * - Function ptr: typedef void (*Callback)(int); (function_declarator > parenthesized_declarator > ...)
   * - Array ptr: typedef int (*ArrayPtr)[10]; (array_declarator > parenthesized_declarator > ...)
   * - Complex: typedef int* (*Func)(void*); (pointer_declarator > function_declarator > ...)
   */
  protected findTypedefName(node: SyntaxNode, content: string): string | null {
    // Declarator types that can contain the typedef name
    const declaratorTypes = new Set([
      'function_declarator',
      'array_declarator',
      'pointer_declarator',
      'parenthesized_declarator'
    ]);

    // Recursive search for type_identifier in declarator nodes
    const findInDeclarator = (n: SyntaxNode): string | null => {
      for (const child of n.children) {
        // Found the name
        if (child.type === 'type_identifier') {
          return this.getNodeText(child, content);
        }
        // Recurse into nested declarators
        if (declaratorTypes.has(child.type)) {
          const found = findInDeclarator(child);
          if (found) return found;
        }
      }
      return null;
    };

    // First, look for name inside any declarator structure
    for (const child of node.children) {
      if (declaratorTypes.has(child.type)) {
        const found = findInDeclarator(child);
        if (found) return found;
      }
    }

    // Fall back to direct type_identifier children (simple typedefs)
    const typeIdentifiers = node.children.filter((c: SyntaxNode) => c.type === 'type_identifier');
    if (typeIdentifiers.length > 0) {
      // Last one is typically the name (first ones are the type being aliased)
      return this.getNodeText(typeIdentifiers[typeIdentifiers.length - 1], content);
    }

    return null;
  }

  /**
   * Extract typedef (type alias) from C's AST
   * In C: type_definition -> type_identifier (at the end)
   * For complex typedefs (function pointers, array pointers, etc.), the name is nested
   */
  protected extractTypeAlias(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): ScopeInfo {
    // Find typedef name by searching recursively in declarator nodes
    // The typedef name is in type_identifier inside declarator structures
    const name = this.findTypedefName(node, content) || 'AnonymousType';

    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);

    // Determine what this typedef refers to
    const structNode = node.children.find((c: SyntaxNode) => c.type === 'struct_specifier');
    const enumNode = node.children.find((c: SyntaxNode) => c.type === 'enum_specifier');

    let aliasOf: string | undefined;
    if (structNode) {
      aliasOf = 'struct';
    } else if (enumNode) {
      aliasOf = 'enum';
    }

    const signature = `typedef ${aliasOf || ''} ${name}`.trim();
    const contentDedented = this.dedentContent(nodeContent);

    // Build reference exclusions and extract identifier references
    const referenceExclusions = this.buildReferenceExclusions(name, []);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));

    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

    return {
      name,
      type: 'type_alias',
      startLine,
      endLine,
      filePath: '',
      signature,
      parameters: [],
      modifiers: [],
      content: nodeContent,
      contentDedented,
      children: [],
      dependencies: [],
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
   * Override extractIdentifierReferences to handle C-specific type references
   * (type_identifier in function signatures, struct fields, etc.)
   */
  protected extractIdentifierReferences(
    node: SyntaxNode,
    content: string,
    exclude: Set<string>
  ): import('./types.js').IdentifierReference[] {
    // Call parent implementation first
    const references = super.extractIdentifierReferences(node, content, exclude);
    const seen = new Set(references.map(r => `${r.identifier}:${r.line}:${r.column}`));

    // Visit all nodes to find C-specific type references
    const visit = (current: SyntaxNode | null) => {
      if (!current) return;

      // Handle type_identifier (user-defined types like User, MyStruct)
      if (current.type === 'type_identifier') {
        const identifier = this.getNodeText(current, content);
        if (
          identifier &&
          !exclude.has(identifier) &&
          !this.stopWords.has(identifier) &&
          !this.builtinIdentifiers.has(identifier)
        ) {
          const key = `${identifier}:${current.startPosition.row + 1}:${current.startPosition.column}`;
          if (!seen.has(key)) {
            seen.add(key);
            references.push({
              identifier,
              line: current.startPosition.row + 1,
              column: current.startPosition.column,
              context: this.getLineFromContent(content, current.startPosition.row + 1),
              kind: 'unknown'
            });
          }
        }
      }

      // Recurse into children
      const childNodes: SyntaxNode[] = (current as any).namedChildren ?? current.children;
      for (const child of childNodes) {
        visit(child);
      }
    };

    visit(node);
    return references;
  }
}
