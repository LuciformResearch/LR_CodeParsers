/**
 * Go Scope Extraction Parser
 *
 * Extends BaseScopeExtractionParser for Go-specific features:
 * - Package declarations
 * - Structs and interfaces
 * - Methods with receivers
 * - Implicit interface implementation
 * - Multiple return values
 */

import { BaseScopeExtractionParser, NodeTypeConfig, SyntaxNode, IDENTIFIER_STOP_WORDS, BUILTIN_IDENTIFIERS } from './BaseScopeExtractionParser.js';
import type { ScopeInfo, ImportReference } from './types.js';

/** Go-specific keywords */
export const GO_STOP_WORDS = new Set([
  ...IDENTIFIER_STOP_WORDS,
  'package', 'import', 'func', 'var', 'const', 'type', 'struct', 'interface',
  'map', 'chan', 'range', 'go', 'select', 'case', 'default', 'defer',
  'if', 'else', 'switch', 'for', 'break', 'continue', 'return', 'goto',
  'fallthrough', 'nil', 'true', 'false', 'iota',
]);

/** Go-specific builtins */
export const GO_BUILTIN_IDENTIFIERS = new Set([
  ...BUILTIN_IDENTIFIERS,
  'append', 'cap', 'close', 'complex', 'copy', 'delete', 'imag', 'len',
  'make', 'new', 'panic', 'print', 'println', 'real', 'recover',
  'bool', 'byte', 'complex64', 'complex128', 'error', 'float32', 'float64',
  'int', 'int8', 'int16', 'int32', 'int64', 'rune', 'string',
  'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'uintptr',
  'any', 'comparable',
]);

/** Go AST node type mappings */
export const GO_NODE_TYPES: NodeTypeConfig = {
  classDeclaration: ['type_declaration'], // Structs are type declarations
  interfaceDeclaration: ['type_declaration'], // Interfaces are also type declarations
  functionDeclaration: ['function_declaration'],
  methodDefinition: ['method_declaration'],
  enumDeclaration: [], // Go uses const blocks with iota
  typeAliasDeclaration: ['type_declaration'],
  namespaceDeclaration: [], // Go uses packages, not namespaces

  variableDeclaration: ['var_declaration', 'const_declaration', 'short_var_declaration'],
  variableDeclarator: ['var_spec', 'const_spec'],
  variableKind: [],

  arrowFunction: ['func_literal'],
  functionExpression: ['func_literal'],

  parameter: ['parameter_declaration'],
  optionalParameter: [],
  restParameter: ['variadic_parameter_declaration'],

  accessibilityModifier: [], // Go uses capitalization for visibility
  staticModifier: [],
  abstractModifier: [],
  readonlyModifier: [],
  asyncModifier: [],
  overrideModifier: [],

  propertyDeclaration: ['field_declaration'],
  methodSignature: ['method_spec'],

  extendsClause: [],
  implementsClause: [],
  classHeritage: [], // Go has implicit interface implementation

  typeIdentifier: ['type_identifier'],
  genericType: ['generic_type'],
  typeParameter: ['type_parameter_declaration'],

  identifier: ['identifier', 'field_identifier'],
  comment: ['comment'],
  decorator: [],
  enumMember: [],
  exportStatement: [],
  callExpression: ['call_expression'],
  memberExpression: ['selector_expression'],
  error: ['ERROR']
};

export class GoScopeExtractionParser extends BaseScopeExtractionParser {
  constructor() {
    super();
    this.language = 'go' as any;
    this.nodeTypes = GO_NODE_TYPES;
    this.stopWords = GO_STOP_WORDS;
    this.builtinIdentifiers = GO_BUILTIN_IDENTIFIERS;
  }

  /**
   * Override extractScopes to handle Go specific constructs
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
    // Handle type declarations (struct, interface, type alias)
    if (node.type === 'type_declaration') {
      for (const child of node.children) {
        if (child.type === 'type_spec') {
          const scope = this.extractGoType(child, content, depth, parent, fileImports);
          scope.filePath = filePath;
          scopes.push(scope);
        }
      }
      return;
    }

    // Handle function declarations
    if (node.type === 'function_declaration') {
      const scope = this.extractGoFunction(node, content, depth, parent, fileImports);
      scope.filePath = filePath;
      scopes.push(scope);
      return;
    }

    // Handle method declarations
    if (node.type === 'method_declaration') {
      const scope = this.extractGoMethod(node, content, depth, parent, fileImports);
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
   * Extract Go type (struct, interface, or type alias)
   */
  protected extractGoType(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): ScopeInfo {
    const nameNode = node.children.find((c: SyntaxNode) => c.type === 'type_identifier');
    const name = nameNode ? this.getNodeText(nameNode, content) : 'AnonymousType';

    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    const contentDedented = this.dedentContent(nodeContent);

    // Determine type kind
    const structType = node.children.find((c: SyntaxNode) => c.type === 'struct_type');
    const interfaceType = node.children.find((c: SyntaxNode) => c.type === 'interface_type');

    let type: 'class' | 'interface' | 'type_alias' = 'type_alias';
    let signature = `type ${name}`;
    let members: any[] = [];

    if (structType) {
      type = 'class';
      signature = `type ${name} struct`;
      members = this.extractGoStructFields(structType, content);
    } else if (interfaceType) {
      type = 'interface';
      signature = `type ${name} interface`;
      members = this.extractGoInterfaceMethods(interfaceType, content);
    }

    // Check if exported (capitalized first letter)
    const isExported = name.length > 0 && name[0] === name[0].toUpperCase();

    // Extract generic parameters (Go 1.18+)
    const genericParams = this.extractGoGenerics(node, content);

    // Build reference exclusions and extract identifier references
    const referenceExclusions = this.buildReferenceExclusions(name, []);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));

    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

    return {
      name,
      type,
      startLine,
      endLine,
      filePath: '',
      signature,
      parameters: [],
      modifiers: isExported ? ['exported'] : [],
      genericParameters: genericParams.length > 0 ? genericParams : undefined,
      members,
      content: nodeContent,
      contentDedented,
      children: [],
      dependencies: this.extractDependencies(nodeContent),
      exports: isExported ? [name] : [],
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
   * Extract struct fields
   */
  protected extractGoStructFields(node: SyntaxNode, content: string): any[] {
    const members: any[] = [];
    const fieldList = node.children.find((c: SyntaxNode) => c.type === 'field_declaration_list');

    if (fieldList) {
      for (const child of fieldList.children) {
        if (child.type === 'field_declaration') {
          const nameNode = child.children.find((c: SyntaxNode) => c.type === 'field_identifier');
          const typeNode = child.children.find((c: SyntaxNode) =>
            c.type === 'type_identifier' || c.type === 'pointer_type' ||
            c.type === 'slice_type' || c.type === 'map_type' ||
            c.type === 'array_type' || c.type === 'qualified_type'
          );

          // Check for embedded field (no name, just type)
          if (!nameNode && typeNode) {
            members.push({
              name: this.getNodeText(typeNode, content),
              type: this.getNodeText(typeNode, content),
              kind: 'embedded',
              line: child.startPosition.row + 1,
            });
          } else if (nameNode) {
            const fieldName = this.getNodeText(nameNode, content);
            const isExported = fieldName.length > 0 && fieldName[0] === fieldName[0].toUpperCase();

            // Get struct tag if present
            const tagNode = child.children.find((c: SyntaxNode) => c.type === 'raw_string_literal');

            members.push({
              name: fieldName,
              type: typeNode ? this.getNodeText(typeNode, content) : undefined,
              kind: 'property',
              accessibility: isExported ? 'public' : 'private',
              tag: tagNode ? this.getNodeText(tagNode, content) : undefined,
              line: child.startPosition.row + 1,
            });
          }
        }
      }
    }

    return members;
  }

  /**
   * Extract interface methods
   */
  protected extractGoInterfaceMethods(node: SyntaxNode, content: string): any[] {
    const members: any[] = [];

    for (const child of node.children) {
      if (child.type === 'method_spec') {
        const nameNode = child.children.find((c: SyntaxNode) => c.type === 'field_identifier');
        if (nameNode) {
          const methodName = this.getNodeText(nameNode, content);

          // Extract parameters
          const params = this.extractGoParameters(child, content);

          // Extract return type
          const returnType = this.extractGoReturnType(child, content);

          members.push({
            name: methodName,
            kind: 'method',
            parameters: params,
            returnType,
            line: child.startPosition.row + 1,
          });
        }
      } else if (child.type === 'type_identifier' || child.type === 'qualified_type') {
        // Embedded interface
        members.push({
          name: this.getNodeText(child, content),
          kind: 'embedded',
          line: child.startPosition.row + 1,
        });
      }
    }

    return members;
  }

  /**
   * Extract Go function
   */
  protected extractGoFunction(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): ScopeInfo {
    const nameNode = node.children.find((c: SyntaxNode) => c.type === 'identifier');
    const name = nameNode ? this.getNodeText(nameNode, content) : 'anonymous';

    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    const contentDedented = this.dedentContent(nodeContent);

    // Check if exported (capitalized first letter)
    const isExported = name.length > 0 && name[0] === name[0].toUpperCase();

    // Extract parameters
    const parameters = this.extractGoParameters(node, content);

    // Extract return type
    const returnType = this.extractGoReturnType(node, content);

    // Build signature
    const paramStr = parameters.map(p => `${p.name} ${p.type || ''}`).join(', ');
    let signature = `func ${name}(${paramStr})`;
    if (returnType) {
      signature += ` ${returnType}`;
    }

    // Extract generic parameters
    const genericParams = this.extractGoGenerics(node, content);

    // Build reference exclusions and extract identifier references
    const referenceExclusions = this.buildReferenceExclusions(name, parameters);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));

    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);
    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

    return {
      name,
      type: 'function',
      startLine,
      endLine,
      filePath: '',
      signature,
      parameters,
      returnType,
      modifiers: isExported ? ['exported'] : [],
      genericParameters: genericParams.length > 0 ? genericParams : undefined,
      content: nodeContent,
      contentDedented,
      children: [],
      dependencies: this.extractDependencies(nodeContent),
      exports: isExported ? [name] : [],
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
   * Extract Go method (function with receiver)
   */
  protected extractGoMethod(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): ScopeInfo {
    const nameNode = node.children.find((c: SyntaxNode) => c.type === 'field_identifier');
    const name = nameNode ? this.getNodeText(nameNode, content) : 'anonymous';

    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    const contentDedented = this.dedentContent(nodeContent);

    // Extract receiver
    const receiverNode = node.children.find((c: SyntaxNode) => c.type === 'parameter_list');
    let receiverType = '';
    let receiverName = '';

    if (receiverNode) {
      const paramDecl = receiverNode.children.find((c: SyntaxNode) => c.type === 'parameter_declaration');
      if (paramDecl) {
        const recName = paramDecl.children.find((c: SyntaxNode) => c.type === 'identifier');
        const recType = paramDecl.children.find((c: SyntaxNode) =>
          c.type === 'type_identifier' || c.type === 'pointer_type'
        );
        receiverName = recName ? this.getNodeText(recName, content) : '';
        receiverType = recType ? this.getNodeText(recType, content) : '';
      }
    }

    // Check if exported (capitalized first letter)
    const isExported = name.length > 0 && name[0] === name[0].toUpperCase();

    // Extract parameters (skip receiver)
    const parameters = this.extractGoMethodParameters(node, content);

    // Extract return type
    const returnType = this.extractGoReturnType(node, content);

    // Build signature
    const paramStr = parameters.map(p => `${p.name} ${p.type || ''}`).join(', ');
    let signature = `func (${receiverName} ${receiverType}) ${name}(${paramStr})`;
    if (returnType) {
      signature += ` ${returnType}`;
    }

    // Use receiver type as parent if not specified
    const effectiveParent = parent || receiverType.replace(/^\*/, '');

    // Build reference exclusions and extract identifier references
    const referenceExclusions = this.buildReferenceExclusions(name, parameters);
    // Add receiver name to exclusions
    if (receiverName) {
      referenceExclusions.add(receiverName);
    }
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
      modifiers: isExported ? ['exported'] : [],
      content: nodeContent,
      contentDedented,
      children: [],
      dependencies: this.extractDependencies(nodeContent),
      exports: isExported ? [name] : [],
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
      parent: effectiveParent,
    };
  }

  /**
   * Extract Go parameters
   */
  protected extractGoParameters(node: SyntaxNode, content: string): any[] {
    const params: any[] = [];
    const paramList = node.children.find((c: SyntaxNode) => c.type === 'parameter_list');

    if (paramList) {
      for (const child of paramList.children) {
        if (child.type === 'parameter_declaration') {
          // Get all identifiers and the type
          const identifiers = child.children.filter((c: SyntaxNode) => c.type === 'identifier');
          const typeNode = child.children.find((c: SyntaxNode) =>
            c.type === 'type_identifier' || c.type === 'pointer_type' ||
            c.type === 'slice_type' || c.type === 'map_type' ||
            c.type === 'array_type' || c.type === 'qualified_type' ||
            c.type === 'func_type' || c.type === 'interface_type' ||
            c.type === 'channel_type'
          );

          const typeName = typeNode ? this.getNodeText(typeNode, content) : undefined;

          for (const id of identifiers) {
            params.push({
              name: this.getNodeText(id, content),
              type: typeName,
            });
          }

          // Handle case where type is directly in parameter_declaration without identifier
          if (identifiers.length === 0 && typeNode) {
            params.push({
              name: '_',
              type: typeName,
            });
          }
        } else if (child.type === 'variadic_parameter_declaration') {
          const idNode = child.children.find((c: SyntaxNode) => c.type === 'identifier');
          const typeNode = child.children.find((c: SyntaxNode) => c.type !== 'identifier');

          params.push({
            name: idNode ? this.getNodeText(idNode, content) : '_',
            type: typeNode ? `...${this.getNodeText(typeNode, content)}` : '...any',
            isRest: true,
          });
        }
      }
    }

    return params;
  }

  /**
   * Extract Go method parameters (skip first parameter_list which is receiver)
   */
  protected extractGoMethodParameters(node: SyntaxNode, content: string): any[] {
    const paramLists = node.children.filter((c: SyntaxNode) => c.type === 'parameter_list');

    // Methods have two parameter_list: receiver and parameters
    if (paramLists.length >= 2) {
      return this.extractGoParametersFromList(paramLists[1], content);
    }

    return [];
  }

  /**
   * Extract parameters from a parameter_list node
   */
  protected extractGoParametersFromList(paramList: SyntaxNode, content: string): any[] {
    const params: any[] = [];

    for (const child of paramList.children) {
      if (child.type === 'parameter_declaration') {
        const identifiers = child.children.filter((c: SyntaxNode) => c.type === 'identifier');
        const typeNode = child.children.find((c: SyntaxNode) =>
          c.type === 'type_identifier' || c.type === 'pointer_type' ||
          c.type === 'slice_type' || c.type === 'map_type' ||
          c.type === 'array_type' || c.type === 'qualified_type' ||
          c.type === 'func_type' || c.type === 'interface_type' ||
          c.type === 'channel_type'
        );

        const typeName = typeNode ? this.getNodeText(typeNode, content) : undefined;

        for (const id of identifiers) {
          params.push({
            name: this.getNodeText(id, content),
            type: typeName,
          });
        }
      }
    }

    return params;
  }

  /**
   * Extract Go return type (can be multiple)
   */
  protected extractGoReturnType(node: SyntaxNode, content: string): string | undefined {
    // Look for result node (contains return types)
    for (const child of node.children) {
      // Single return type
      if (child.type === 'type_identifier' || child.type === 'pointer_type' ||
          child.type === 'slice_type' || child.type === 'map_type' ||
          child.type === 'array_type' || child.type === 'qualified_type') {
        // Check it's after parameters
        const paramList = node.children.find((c: SyntaxNode) => c.type === 'parameter_list');
        if (paramList && child.startIndex > paramList.endIndex) {
          return this.getNodeText(child, content);
        }
      }

      // Multiple return types in parentheses
      if (child.type === 'parameter_list') {
        // This could be the return type list (after the regular parameter list)
        const allParamLists = node.children.filter((c: SyntaxNode) => c.type === 'parameter_list');

        // For functions: 1 param list (params)
        // For methods: 2 param lists (receiver + params)
        // Return types are in last position if there's an extra one
        const isMethod = node.type === 'method_declaration';
        const expectedParamLists = isMethod ? 2 : 1;

        if (allParamLists.indexOf(child) >= expectedParamLists) {
          // This is the return type list
          const types: string[] = [];
          for (const param of child.children) {
            if (param.type === 'parameter_declaration') {
              types.push(this.getNodeText(param, content));
            }
          }
          if (types.length > 0) {
            return `(${types.join(', ')})`;
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Extract generic/type parameters (Go 1.18+)
   */
  protected extractGoGenerics(node: SyntaxNode, content: string): any[] {
    const params: any[] = [];
    const typeParams = node.children.find((c: SyntaxNode) => c.type === 'type_parameter_list');

    if (typeParams) {
      for (const child of typeParams.children) {
        if (child.type === 'type_parameter_declaration') {
          const idNode = child.children.find((c: SyntaxNode) => c.type === 'identifier');
          const constraintNode = child.children.find((c: SyntaxNode) =>
            c.type === 'type_identifier' || c.type === 'type_elem'
          );

          if (idNode) {
            params.push({
              name: this.getNodeText(idNode, content),
              constraint: constraintNode ? this.getNodeText(constraintNode, content) : undefined,
            });
          }
        }
      }
    }

    return params;
  }

  /**
   * Override extractIdentifierReferences to handle Go-specific types
   * (qualified_type for models.User, selector_expression for method calls)
   */
  protected extractIdentifierReferences(
    node: SyntaxNode,
    content: string,
    exclude: Set<string>
  ): import('./types.js').IdentifierReference[] {
    // Call parent implementation first
    const references = super.extractIdentifierReferences(node, content, exclude);
    const seen = new Set(references.map(r => `${r.identifier}:${r.line}:${r.column}`));

    // Visit all nodes to find Go-specific type references
    const visit = (current: SyntaxNode | null) => {
      if (!current) return;

      // Handle qualified_type (e.g., models.User)
      if (current.type === 'qualified_type') {
        const packageNode = current.children.find((c: SyntaxNode) => c.type === 'package_identifier');
        const typeNode = current.children.find((c: SyntaxNode) => c.type === 'type_identifier');

        if (packageNode && typeNode) {
          const qualifier = this.getNodeText(packageNode, content);
          const identifier = this.getNodeText(typeNode, content);

          if (
            identifier &&
            !exclude.has(identifier) &&
            !this.stopWords.has(identifier) &&
            !this.builtinIdentifiers.has(identifier)
          ) {
            const key = `${identifier}:${typeNode.startPosition.row + 1}:${typeNode.startPosition.column}`;
            if (!seen.has(key)) {
              seen.add(key);
              references.push({
                identifier,
                line: typeNode.startPosition.row + 1,
                column: typeNode.startPosition.column,
                context: this.getLineFromContent(content, typeNode.startPosition.row + 1),
                qualifier,
                kind: 'unknown'
              });
            }
          }
        }
      }

      // Handle type_identifier (standalone type references)
      if (current.type === 'type_identifier') {
        // Skip if already inside a qualified_type (handled above)
        if (current.parent?.type === 'qualified_type') {
          // Already handled
        } else {
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
      }

      // Handle selector_expression (e.g., models.User in expressions, repo.Find())
      if (current.type === 'selector_expression') {
        const objectNode = current.children.find((c: SyntaxNode) => c.type === 'identifier');
        const fieldNode = current.children.find((c: SyntaxNode) => c.type === 'field_identifier');

        if (objectNode && fieldNode) {
          const qualifier = this.getNodeText(objectNode, content);
          const identifier = this.getNodeText(fieldNode, content);

          if (
            identifier &&
            !exclude.has(identifier) &&
            !this.stopWords.has(identifier) &&
            !this.builtinIdentifiers.has(identifier)
          ) {
            const key = `${identifier}:${fieldNode.startPosition.row + 1}:${fieldNode.startPosition.column}`;
            if (!seen.has(key)) {
              seen.add(key);
              references.push({
                identifier,
                line: fieldNode.startPosition.row + 1,
                column: fieldNode.startPosition.column,
                context: this.getLineFromContent(content, fieldNode.startPosition.row + 1),
                qualifier,
                kind: 'unknown'
              });
            }
          }
        }
      }

      // Handle generic_type (e.g., Repository[User])
      if (current.type === 'generic_type') {
        // The type name is a type_identifier child
        const typeNode = current.children.find((c: SyntaxNode) => c.type === 'type_identifier');
        const typeArgsNode = current.children.find((c: SyntaxNode) => c.type === 'type_arguments');

        if (typeNode) {
          const identifier = this.getNodeText(typeNode, content);
          if (
            identifier &&
            !exclude.has(identifier) &&
            !this.stopWords.has(identifier) &&
            !this.builtinIdentifiers.has(identifier)
          ) {
            const key = `${identifier}:${typeNode.startPosition.row + 1}:${typeNode.startPosition.column}`;
            if (!seen.has(key)) {
              seen.add(key);
              references.push({
                identifier,
                line: typeNode.startPosition.row + 1,
                column: typeNode.startPosition.column,
                context: this.getLineFromContent(content, typeNode.startPosition.row + 1),
                kind: 'unknown'
              });
            }
          }
        }

        // Also extract type arguments
        if (typeArgsNode) {
          for (const child of typeArgsNode.children) {
            visit(child);
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
