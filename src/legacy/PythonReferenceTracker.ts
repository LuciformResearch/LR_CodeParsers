/**
 * Python Reference Tracker
 *
 * Tracks identifier references within Python scopes.
 * Enriches PythonScope objects with identifierReferences.
 */

type SyntaxNode = any;
import type { PythonScope } from './PythonParser.js';

export interface PythonIdentifierReference {
  identifier: string;
  line: number;
  column?: number;
  context: string;
  qualifier?: string;
  kind?: 'variable' | 'function_call' | 'attribute' | 'import';
}

export interface PythonResolvedReference extends PythonIdentifierReference {
  // Add resolved info if needed
}

// Common Python builtins and keywords to exclude
const PYTHON_BUILTINS = new Set([
  // Keywords
  'and', 'as', 'assert', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else',
  'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda',
  'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
  'True', 'False', 'None',
  // Common builtins
  'print', 'len', 'range', 'str', 'int', 'float', 'bool', 'list', 'dict', 'tuple',
  'set', 'type', 'object', 'super', 'property', 'staticmethod', 'classmethod',
  'enumerate', 'zip', 'map', 'filter', 'sorted', 'reversed', 'sum', 'min', 'max',
  'abs', 'all', 'any', 'ascii', 'bin', 'callable', 'chr', 'compile', 'delattr',
  'dir', 'divmod', 'eval', 'exec', 'format', 'getattr', 'globals', 'hasattr',
  'hash', 'help', 'hex', 'id', 'input', 'isinstance', 'issubclass', 'iter',
  'locals', 'next', 'oct', 'open', 'ord', 'pow', 'repr', 'round', 'setattr', 'slice'
]);

export class PythonReferenceTracker {
  /**
   * Enrich a Python scope with identifier references
   */
  enrichScope(
    scope: PythonScope,
    scopeNode: SyntaxNode,
    content: string,
    fileScopes: PythonScope[]
  ): PythonIdentifierReference[] {
    const references = new Map<string, PythonIdentifierReference>();
    const exclude = this.buildExclusionSet(scope, fileScopes);

    this.visitNode(scopeNode, content, exclude, references);

    return Array.from(references.values());
  }

  /**
   * Build set of identifiers to exclude (locals, params, etc.)
   */
  private buildExclusionSet(scope: PythonScope, fileScopes: PythonScope[]): Set<string> {
    const exclude = new Set<string>();

    // Exclude the scope's own name
    exclude.add(scope.name);

    // Exclude parameters
    for (const param of scope.parameters) {
      exclude.add(param.name);
    }

    // Exclude 'self' and 'cls' for methods
    if (scope.type === 'method') {
      exclude.add('self');
      exclude.add('cls');
    }

    return exclude;
  }

  /**
   * Recursively visit AST nodes to find identifier references
   */
  private visitNode(
    node: SyntaxNode,
    content: string,
    exclude: Set<string>,
    references: Map<string, PythonIdentifierReference>
  ): void {
    // Handle function calls: foo(), bar.baz()
    if (node.type === 'call') {
      const functionNode = node.childForFieldName('function');
      if (functionNode) {
        this.handleCallExpression(functionNode, content, exclude, references);
      }
    }

    // Handle attribute access: obj.attribute
    else if (node.type === 'attribute') {
      this.handleAttribute(node, content, exclude, references);
    }

    // Handle plain identifiers
    else if (node.type === 'identifier') {
      // Skip if this is a definition (function/class name, assignment target)
      if (!this.isDefinition(node)) {
        this.handleIdentifier(node, content, exclude, references);
      }
    }

    // Recurse into children
    for (const child of node.children) {
      this.visitNode(child, content, exclude, references);
    }
  }

  /**
   * Handle function call references
   */
  private handleCallExpression(
    functionNode: SyntaxNode,
    content: string,
    exclude: Set<string>,
    references: Map<string, PythonIdentifierReference>
  ): void {
    if (functionNode.type === 'identifier') {
      const name = this.getNodeText(functionNode, content);
      if (this.shouldInclude(name, exclude)) {
        this.addReference(functionNode, name, content, references, 'function_call');
      }
    } else if (functionNode.type === 'attribute') {
      // Handle obj.method() calls
      this.handleAttribute(functionNode, content, exclude, references, 'function_call');
    }
  }

  /**
   * Handle attribute access (obj.attr or obj.method())
   */
  private handleAttribute(
    node: SyntaxNode,
    content: string,
    exclude: Set<string>,
    references: Map<string, PythonIdentifierReference>,
    kind?: 'function_call' | 'attribute'
  ): void {
    const objectNode = node.childForFieldName('object');
    const attributeNode = node.childForFieldName('attribute');

    if (attributeNode) {
      const attribute = this.getNodeText(attributeNode, content);
      const qualifier = objectNode ? this.getNodeText(objectNode, content) : undefined;

      if (this.shouldInclude(attribute, exclude)) {
        this.addReference(
          attributeNode,
          attribute,
          content,
          references,
          kind || 'attribute',
          qualifier
        );
      }
    }
  }

  /**
   * Handle plain identifier references
   */
  private handleIdentifier(
    node: SyntaxNode,
    content: string,
    exclude: Set<string>,
    references: Map<string, PythonIdentifierReference>
  ): void {
    const name = this.getNodeText(node, content);
    if (this.shouldInclude(name, exclude)) {
      this.addReference(node, name, content, references, 'variable');
    }
  }

  /**
   * Check if identifier is a definition (should be excluded from references)
   */
  private isDefinition(node: SyntaxNode): boolean {
    const parent = node.parent;
    if (!parent) return false;

    // Function/class definitions
    if (parent.type === 'function_definition' || parent.type === 'class_definition') {
      const nameNode = parent.childForFieldName('name');
      return nameNode === node;
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
    if (parent.type === 'parameters' || parent.type === 'typed_parameter' || parent.type === 'default_parameter') {
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
   * Check if identifier should be included
   */
  private shouldInclude(identifier: string, exclude: Set<string>): boolean {
    return (
      identifier.length > 0 &&
      !exclude.has(identifier) &&
      !PYTHON_BUILTINS.has(identifier) &&
      !identifier.startsWith('_') // Skip private identifiers for now
    );
  }

  /**
   * Add reference to the collection
   */
  private addReference(
    node: SyntaxNode,
    identifier: string,
    content: string,
    references: Map<string, PythonIdentifierReference>,
    kind: 'variable' | 'function_call' | 'attribute' | 'import',
    qualifier?: string
  ): void {
    const line = node.startPosition.row + 1;
    const column = node.startPosition.column;
    const key = `${identifier}:${line}:${column}:${qualifier ?? 'root'}`;

    if (!references.has(key)) {
      references.set(key, {
        identifier,
        line,
        column,
        context: this.getLineFromContent(content, line),
        qualifier,
        kind
      });
    }
  }

  /**
   * Extract a line from content
   */
  private getLineFromContent(content: string, lineNumber: number): string {
    const lines = content.split('\n');
    return lines[lineNumber - 1]?.trim() || '';
  }

  /**
   * Get text content of a node
   */
  private getNodeText(node: SyntaxNode | null, content: string): string {
    if (!node) return '';
    return content.substring(node.startIndex, node.endIndex);
  }
}
