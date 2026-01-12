/**
 * Rust Scope Extraction Parser
 *
 * Extends BaseScopeExtractionParser for Rust-specific features:
 * - Structs with impl blocks
 * - Traits and trait implementations
 * - Modules and mod.rs
 * - Enums with variants
 * - Pattern matching
 * - Lifetimes and generics
 */

import { BaseScopeExtractionParser, NodeTypeConfig, SyntaxNode, IDENTIFIER_STOP_WORDS, BUILTIN_IDENTIFIERS } from './BaseScopeExtractionParser.js';
import type { ScopeInfo, ImportReference } from './types.js';

/** Rust-specific keywords */
export const RUST_STOP_WORDS = new Set([
  ...IDENTIFIER_STOP_WORDS,
  'fn', 'let', 'mut', 'const', 'static', 'struct', 'enum', 'trait', 'impl',
  'type', 'mod', 'use', 'pub', 'crate', 'self', 'super', 'where',
  'if', 'else', 'match', 'loop', 'while', 'for', 'in', 'break', 'continue',
  'return', 'async', 'await', 'move', 'ref', 'dyn', 'unsafe', 'extern',
  'as', 'true', 'false', 'Some', 'None', 'Ok', 'Err',
]);

/** Rust-specific builtins
 * Note: We do NOT spread from BUILTIN_IDENTIFIERS because those are JS builtins
 * like Error, Promise, console which don't exist in Rust */
export const RUST_BUILTIN_IDENTIFIERS = new Set([
  // Standard library types
  'Self', 'Option', 'Result', 'Vec', 'String', 'Box', 'Rc', 'Arc',
  'HashMap', 'HashSet', 'BTreeMap', 'BTreeSet', 'VecDeque',
  'Cell', 'RefCell', 'Mutex', 'RwLock', 'Cow',
  // Common traits
  'Clone', 'Copy', 'Debug', 'Default', 'Display', 'Eq', 'Hash',
  'Ord', 'PartialEq', 'PartialOrd', 'Send', 'Sync', 'Sized',
  'Iterator', 'IntoIterator', 'FromIterator', 'Extend',
  'From', 'Into', 'TryFrom', 'TryInto', 'AsRef', 'AsMut',
  'Drop', 'Deref', 'DerefMut', 'Fn', 'FnMut', 'FnOnce',
  // Macros and common identifiers
  'println', 'print', 'eprintln', 'eprint', 'format', 'panic', 'assert',
  'vec', 'dbg', 'todo', 'unimplemented', 'unreachable',
  // Primitive types
  'bool', 'char', 'str', 'i8', 'i16', 'i32', 'i64', 'i128', 'isize',
  'u8', 'u16', 'u32', 'u64', 'u128', 'usize', 'f32', 'f64',
]);

/** Rust AST node type mappings */
export const RUST_NODE_TYPES: NodeTypeConfig = {
  classDeclaration: ['struct_item'],
  interfaceDeclaration: ['trait_item'],
  functionDeclaration: ['function_item'],
  methodDefinition: ['function_item'], // Methods are function_item inside impl
  enumDeclaration: ['enum_item'],
  typeAliasDeclaration: ['type_item'],
  namespaceDeclaration: ['mod_item'],

  variableDeclaration: ['let_declaration', 'const_item', 'static_item'],
  variableDeclarator: ['identifier'],
  variableKind: [],

  arrowFunction: ['closure_expression'],
  functionExpression: ['closure_expression'],

  parameter: ['parameter'],
  optionalParameter: [],
  restParameter: [],

  accessibilityModifier: ['visibility_modifier'],
  staticModifier: [],
  abstractModifier: [],
  readonlyModifier: [],
  asyncModifier: ['async'],
  overrideModifier: [],

  propertyDeclaration: ['field_declaration'],
  methodSignature: ['function_signature_item'],

  extendsClause: [],
  implementsClause: [],
  classHeritage: ['trait_bounds'],

  typeIdentifier: ['type_identifier', 'primitive_type', 'scoped_type_identifier'],
  genericType: ['generic_type'],
  typeParameter: ['type_parameter'],

  identifier: ['identifier'],
  comment: ['line_comment', 'block_comment'],
  decorator: ['attribute_item'],
  enumMember: ['enum_variant'],
  exportStatement: [],
  callExpression: ['call_expression'],
  memberExpression: ['field_expression', 'scoped_identifier'],
  error: ['ERROR']
};

export class RustScopeExtractionParser extends BaseScopeExtractionParser {
  constructor() {
    super();
    this.language = 'rust' as any;
    this.nodeTypes = RUST_NODE_TYPES;
    this.stopWords = RUST_STOP_WORDS;
    this.builtinIdentifiers = RUST_BUILTIN_IDENTIFIERS;
  }

  /**
   * Override extractScopes to handle Rust specific constructs
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
    // Handle mod declarations
    if (node.type === 'mod_item') {
      const scope = this.extractModule(node, content, depth, parent, fileImports);
      scope.filePath = filePath;
      scopes.push(scope);

      // Extract children from declaration_list (if inline module)
      const declList = node.children.find((c: SyntaxNode) => c.type === 'declaration_list');
      if (declList) {
        for (const child of declList.children) {
          this.extractScopes(child, scopes, content, depth + 1, scope.name, fileImports, filePath);
        }
      }
      return;
    }

    // Handle impl blocks
    if (node.type === 'impl_item') {
      const scope = this.extractImpl(node, content, depth, parent, fileImports);
      scope.filePath = filePath;
      scopes.push(scope);

      // Extract methods from declaration_list
      const declList = node.children.find((c: SyntaxNode) => c.type === 'declaration_list');
      if (declList) {
        for (const child of declList.children) {
          if (child.type === 'function_item') {
            const methodScope = this.extractRustMethod(child, content, depth + 1, scope.name, fileImports);
            methodScope.filePath = filePath;
            scopes.push(methodScope);
          }
        }
      }
      return;
    }

    // Handle struct definitions
    if (node.type === 'struct_item') {
      const scope = this.extractRustStruct(node, content, depth, parent, fileImports);
      scope.filePath = filePath;
      scopes.push(scope);
      return;
    }

    // Handle trait definitions
    if (node.type === 'trait_item') {
      const scope = this.extractTrait(node, content, depth, parent, fileImports);
      scope.filePath = filePath;
      scopes.push(scope);

      // Extract method signatures from declaration_list
      const declList = node.children.find((c: SyntaxNode) => c.type === 'declaration_list');
      if (declList) {
        for (const child of declList.children) {
          if (child.type === 'function_item' || child.type === 'function_signature_item') {
            const methodScope = this.extractRustMethod(child, content, depth + 1, scope.name, fileImports);
            methodScope.filePath = filePath;
            scopes.push(methodScope);
          }
        }
      }
      return;
    }

    // Handle enum definitions
    if (node.type === 'enum_item') {
      const scope = this.extractRustEnum(node, content, depth, parent, fileImports);
      scope.filePath = filePath;
      scopes.push(scope);
      return;
    }

    // Handle standalone functions
    if (node.type === 'function_item' && !parent) {
      const scope = this.extractRustFunction(node, content, depth, parent, fileImports);
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
   * Extract module information
   */
  protected extractModule(
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

    // Check if it's a pub module
    const modifiers: string[] = [];
    if (node.children.some((c: SyntaxNode) => c.type === 'visibility_modifier')) {
      modifiers.push('pub');
    }

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
      signature: `${modifiers.length > 0 ? 'pub ' : ''}mod ${name}`,
      parameters: [],
      modifiers,
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
   * Extract impl block information
   */
  protected extractImpl(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): ScopeInfo {
    // Find all type identifiers in the impl block
    // For `impl Trait for Type`: first = Trait, second = Type
    // For `impl Type`: only one = Type
    const typeNodes = node.children.filter((c: SyntaxNode) =>
      c.type === 'type_identifier' || c.type === 'generic_type' || c.type === 'scoped_type_identifier'
    );

    let name: string;
    let signature: string;
    let traitName: string | undefined;
    let targetTypeName: string | undefined;

    if (typeNodes.length >= 2) {
      // Trait implementation: impl Trait for Type
      traitName = this.getNodeText(typeNodes[0], content);
      targetTypeName = this.getNodeText(typeNodes[1], content);
      name = targetTypeName; // Use the target type as the scope name for relationship resolution
      signature = `impl ${traitName} for ${targetTypeName}`;
    } else if (typeNodes.length === 1) {
      // Inherent impl: impl Type
      name = this.getNodeText(typeNodes[0], content);
      signature = `impl ${name}`;
    } else {
      name = 'Unknown';
      signature = 'impl Unknown';
    }

    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    const contentDedented = this.dedentContent(nodeContent);

    // Extract generic parameters
    const genericParams = this.extractRustGenerics(node, content);

    // Build reference exclusions and extract identifier references
    const referenceExclusions = this.buildReferenceExclusions(name, []);
    const localSymbols = this.collectLocalSymbols(node, content);
    localSymbols.forEach(symbol => referenceExclusions.add(symbol));

    const identifierReferences = this.extractIdentifierReferences(node, content, referenceExclusions);

    // For trait implementations, add an identifier reference to the trait
    // This creates an IMPLEMENTS relationship from the type to the trait
    if (traitName) {
      // Extract the base trait name (without generics like Repository<User> -> Repository)
      const baseTraitName = traitName.split('<')[0].trim();
      identifierReferences.push({
        identifier: baseTraitName,
        line: startLine,
        column: 0,
        context: `impl ${traitName} for ${targetTypeName}`,
        kind: 'unknown' as const, // Will be resolved by RelationshipResolver
      });
    }

    const importReferences = this.resolveImportsForScope(identifierReferences, fileImports);

    return {
      name,
      type: 'class', // impl blocks are like class implementations
      startLine,
      endLine,
      filePath: '',
      signature,
      parameters: [],
      modifiers: [],
      genericParameters: genericParams.length > 0 ? genericParams : undefined,
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
  protected extractRustStruct(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): ScopeInfo {
    const nameNode = node.children.find((c: SyntaxNode) => c.type === 'type_identifier');
    const name = nameNode ? this.getNodeText(nameNode, content) : 'AnonymousStruct';

    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    const contentDedented = this.dedentContent(nodeContent);

    // Check visibility
    const modifiers: string[] = [];
    if (node.children.some((c: SyntaxNode) => c.type === 'visibility_modifier')) {
      modifiers.push('pub');
    }

    // Extract fields
    const members = this.extractRustStructFields(node, content);

    // Extract generic parameters
    const genericParams = this.extractRustGenerics(node, content);

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
      signature: `${modifiers.includes('pub') ? 'pub ' : ''}struct ${name}`,
      parameters: [],
      modifiers,
      genericParameters: genericParams.length > 0 ? genericParams : undefined,
      members,
      content: nodeContent,
      contentDedented,
      children: [],
      dependencies: this.extractDependencies(nodeContent),
      exports: modifiers.includes('pub') ? [name] : [],
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
  protected extractRustStructFields(node: SyntaxNode, content: string): any[] {
    const members: any[] = [];
    const fieldList = node.children.find((c: SyntaxNode) => c.type === 'field_declaration_list');

    if (fieldList) {
      for (const child of fieldList.children) {
        if (child.type === 'field_declaration') {
          const nameNode = child.children.find((c: SyntaxNode) => c.type === 'field_identifier');
          const typeNode = child.children.find((c: SyntaxNode) =>
            c.type === 'type_identifier' || c.type === 'primitive_type' || c.type === 'generic_type'
          );

          const isPub = child.children.some((c: SyntaxNode) => c.type === 'visibility_modifier');

          if (nameNode) {
            members.push({
              name: this.getNodeText(nameNode, content),
              type: typeNode ? this.getNodeText(typeNode, content) : undefined,
              kind: 'property',
              accessibility: isPub ? 'pub' : 'private',
              line: child.startPosition.row + 1,
            });
          }
        }
      }
    }

    return members;
  }

  /**
   * Extract trait information
   */
  protected extractTrait(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): ScopeInfo {
    const nameNode = node.children.find((c: SyntaxNode) => c.type === 'type_identifier');
    const name = nameNode ? this.getNodeText(nameNode, content) : 'AnonymousTrait';

    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const nodeContent = this.getNodeText(node, content);
    const contentDedented = this.dedentContent(nodeContent);

    // Check visibility
    const modifiers: string[] = [];
    if (node.children.some((c: SyntaxNode) => c.type === 'visibility_modifier')) {
      modifiers.push('pub');
    }

    // Extract generic parameters
    const genericParams = this.extractRustGenerics(node, content);

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
      signature: `${modifiers.includes('pub') ? 'pub ' : ''}trait ${name}`,
      parameters: [],
      modifiers,
      genericParameters: genericParams.length > 0 ? genericParams : undefined,
      content: nodeContent,
      contentDedented,
      children: [],
      dependencies: this.extractDependencies(nodeContent),
      exports: modifiers.includes('pub') ? [name] : [],
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
  protected extractRustEnum(
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
    const contentDedented = this.dedentContent(nodeContent);

    // Check visibility
    const modifiers: string[] = [];
    if (node.children.some((c: SyntaxNode) => c.type === 'visibility_modifier')) {
      modifiers.push('pub');
    }

    // Extract enum variants
    const enumMembers = this.extractRustEnumVariants(node, content);

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
      signature: `${modifiers.includes('pub') ? 'pub ' : ''}enum ${name}`,
      parameters: [],
      modifiers,
      enumMembers,
      content: nodeContent,
      contentDedented,
      children: [],
      dependencies: this.extractDependencies(nodeContent),
      exports: modifiers.includes('pub') ? [name] : [],
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
   * Extract enum variants
   */
  protected extractRustEnumVariants(node: SyntaxNode, content: string): any[] {
    const variants: any[] = [];
    const variantList = node.children.find((c: SyntaxNode) => c.type === 'enum_variant_list');

    if (variantList) {
      for (const child of variantList.children) {
        if (child.type === 'enum_variant') {
          const nameNode = child.children.find((c: SyntaxNode) => c.type === 'identifier');
          if (nameNode) {
            const variantName = this.getNodeText(nameNode, content);

            // Check if variant has associated data
            const tupleFields = child.children.find((c: SyntaxNode) => c.type === 'ordered_field_declaration_list');
            const structFields = child.children.find((c: SyntaxNode) => c.type === 'field_declaration_list');

            let value: string | undefined;
            if (tupleFields) {
              value = this.getNodeText(tupleFields, content);
            } else if (structFields) {
              value = this.getNodeText(structFields, content);
            }

            variants.push({
              name: variantName,
              value,
              line: child.startPosition.row + 1,
            });
          }
        }
      }
    }

    return variants;
  }

  /**
   * Extract Rust function
   */
  protected extractRustFunction(
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

    // Check visibility and other modifiers
    const modifiers: string[] = [];
    if (node.children.some((c: SyntaxNode) => c.type === 'visibility_modifier')) {
      modifiers.push('pub');
    }
    if (node.children.some((c: SyntaxNode) => this.getNodeText(c, content) === 'async')) {
      modifiers.push('async');
    }
    if (node.children.some((c: SyntaxNode) => this.getNodeText(c, content) === 'unsafe')) {
      modifiers.push('unsafe');
    }

    // Extract parameters
    const parameters = this.extractRustParameters(node, content);

    // Extract return type
    const returnTypeNode = node.children.find((c: SyntaxNode) => c.type === 'return_type');
    const returnType = returnTypeNode ? this.getNodeText(returnTypeNode, content).replace(/^->\s*/, '') : undefined;

    // Build signature
    const paramStr = parameters.map(p => `${p.name}: ${p.type || '?'}`).join(', ');
    const signature = `fn ${name}(${paramStr})${returnType ? ` -> ${returnType}` : ''}`;

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
      modifiers,
      content: nodeContent,
      contentDedented,
      children: [],
      dependencies: this.extractDependencies(nodeContent),
      exports: modifiers.includes('pub') ? [name] : [],
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
   * Extract Rust method
   */
  protected extractRustMethod(
    node: SyntaxNode,
    content: string,
    depth: number,
    parent: string | undefined,
    fileImports: ImportReference[]
  ): ScopeInfo {
    const scope = this.extractRustFunction(node, content, depth, parent, fileImports);
    scope.type = 'method';
    return scope;
  }

  /**
   * Extract Rust parameters
   */
  protected extractRustParameters(node: SyntaxNode, content: string): any[] {
    const params: any[] = [];
    const paramList = node.children.find((c: SyntaxNode) => c.type === 'parameters');

    if (paramList) {
      for (const child of paramList.children) {
        if (child.type === 'parameter') {
          // Check for self parameter
          const selfParam = child.children.find((c: SyntaxNode) =>
            c.type === 'self' || c.type === 'self_parameter'
          );
          if (selfParam) {
            const isMut = child.children.some((c: SyntaxNode) => c.type === 'mutable_specifier');
            const isRef = this.getNodeText(child, content).includes('&');
            params.push({
              name: 'self',
              type: isRef ? (isMut ? '&mut self' : '&self') : 'self',
              isSelf: true,
            });
            continue;
          }

          // Regular parameter
          const patternNode = child.children.find((c: SyntaxNode) => c.type === 'identifier');
          const typeNode = child.children.find((c: SyntaxNode) =>
            c.type === 'type_identifier' || c.type === 'primitive_type' ||
            c.type === 'generic_type' || c.type === 'reference_type'
          );

          if (patternNode) {
            params.push({
              name: this.getNodeText(patternNode, content),
              type: typeNode ? this.getNodeText(typeNode, content) : undefined,
            });
          }
        }
      }
    }

    return params;
  }

  /**
   * Extract generic/type parameters
   */
  protected extractRustGenerics(node: SyntaxNode, content: string): any[] {
    const params: any[] = [];
    const typeParams = node.children.find((c: SyntaxNode) => c.type === 'type_parameters');

    if (typeParams) {
      for (const child of typeParams.children) {
        if (child.type === 'type_parameter' || child.type === 'lifetime') {
          const name = this.getNodeText(child, content);

          // Look for trait bounds
          const boundsNode = child.children.find((c: SyntaxNode) => c.type === 'trait_bounds');
          const constraint = boundsNode ? this.getNodeText(boundsNode, content) : undefined;

          params.push({
            name,
            constraint,
          });
        }
      }
    }

    return params;
  }

  /**
   * Override extractIdentifierReferences to handle Rust-specific type references.
   * Rust uses type_identifier for types like User, Vec, Option, Result, etc.
   * Also handles generic_type for Vec<User>, Option<T>, Result<T, E>, etc.
   */
  protected extractIdentifierReferences(
    node: SyntaxNode,
    content: string,
    exclude: Set<string>
  ): import('./types.js').IdentifierReference[] {
    // Call parent implementation first
    const references = super.extractIdentifierReferences(node, content, exclude);
    const seen = new Set(references.map(r => `${r.identifier}:${r.line}:${r.column}`));

    // Visit all nodes to find Rust-specific type references
    const visit = (current: SyntaxNode | null) => {
      if (!current) return;

      // Handle type_identifier (User, Vec, Option, Result, etc.)
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

      // Handle scoped_identifier (crate::module::Type, std::vec::Vec)
      if (current.type === 'scoped_identifier') {
        // Get the last identifier in the path (the actual type name)
        const ids = current.children.filter((c: SyntaxNode) => c.type === 'identifier' || c.type === 'type_identifier');
        if (ids.length > 0) {
          const lastId = ids[ids.length - 1];
          const identifier = this.getNodeText(lastId, content);
          if (
            identifier &&
            !exclude.has(identifier) &&
            !this.stopWords.has(identifier) &&
            !this.builtinIdentifiers.has(identifier)
          ) {
            const key = `${identifier}:${lastId.startPosition.row + 1}:${lastId.startPosition.column}`;
            if (!seen.has(key)) {
              seen.add(key);
              references.push({
                identifier,
                line: lastId.startPosition.row + 1,
                column: lastId.startPosition.column,
                context: this.getLineFromContent(content, lastId.startPosition.row + 1),
                kind: 'unknown'
              });
            }
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
