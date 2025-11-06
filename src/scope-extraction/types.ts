/**
 * Types for Scope Extraction Parser
 */

export interface ParameterInfo {
  name: string;
  type?: string;
  optional: boolean;
  defaultValue?: string;
  line: number;
  column: number;
}

export interface ImportReference {
  source: string;
  imported: string;
  alias?: string;
  kind: 'default' | 'named' | 'namespace' | 'side-effect';
  isLocal: boolean;
}

export interface IdentifierReference {
  identifier: string;
  line: number;
  column?: number;
  context?: string;
  qualifier?: string;
  kind?: 'import' | 'local_scope' | 'builtin' | 'unknown';
  source?: string;
  targetScope?: string;
  isLocalImport?: boolean;
}

export interface VariableInfo {
  name: string;
  type?: string;
  kind: 'const' | 'let' | 'var';
  line: number;
  scope: string; // Parent scope name
}

export interface ClassMemberInfo {
  name: string;
  type?: string;
  memberType: 'property' | 'method' | 'getter' | 'setter' | 'constructor';
  accessibility?: 'public' | 'private' | 'protected';
  isStatic: boolean;
  isReadonly: boolean;
  line: number;
  signature?: string;
}

export interface ReturnTypeInfo {
  type: string;
  line: number;
  column: number;
}

export interface ScopeInfo {
  // Basic metadata
  name: string;
  type: 'class' | 'interface' | 'function' | 'method' | 'enum' | 'type_alias' | 'namespace' | 'module' | 'variable' | 'lambda' | 'constant';
  startLine: number;
  endLine: number;
  filePath: string;

  // Signature and interface
  signature: string;
  parameters: ParameterInfo[];
  returnType?: string; // For backward compatibility
  returnTypeInfo?: ReturnTypeInfo; // Detailed return type info
  modifiers: string[];

  // Content and structure
  content: string;
  contentDedented: string;
  children: ScopeInfo[];

  // Class-specific information
  members?: ClassMemberInfo[];

  // Variables declared in this scope
  variables?: VariableInfo[];

  // Dependencies and context
  dependencies: string[];
  exports: string[];
  imports: string[];
  importReferences: ImportReference[];
  identifierReferences: IdentifierReference[];

  // AST metadata
  astValid: boolean;
  astIssues: string[];
  astNotes: string[];

  // Metrics
  complexity: number;
  linesOfCode: number;

  // Parent context
  parent?: string;
  depth: number;

  // Python-specific fields
  decorators?: string[]; // Python decorators (@decorator)
  docstring?: string; // Python docstrings
  value?: string; // For variables/constants: the assigned value
}

export interface ScopeFileAnalysis {
  filePath: string;
  scopes: ScopeInfo[];
  totalLines: number;
  totalScopes: number;
  imports: string[];
  exports: string[];
  dependencies: string[];
  importReferences: ImportReference[];
  astValid: boolean;
  astIssues: string[];
}
