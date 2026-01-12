/**
 * Scope Extraction Parser module exports
 */

export {
  BaseScopeExtractionParser,
  IDENTIFIER_STOP_WORDS,
  BUILTIN_IDENTIFIERS,
  TYPESCRIPT_NODE_TYPES
} from './BaseScopeExtractionParser.js';
export type { SyntaxNode, NodeTypeConfig } from './BaseScopeExtractionParser.js';
export { ScopeExtractionParser } from './ScopeExtractionParser.js';
export { PythonScopeExtractionParser } from './PythonScopeExtractionParser.js';
export { CScopeExtractionParser, C_NODE_TYPES, C_STOP_WORDS, C_BUILTIN_IDENTIFIERS } from './CScopeExtractionParser.js';
export { CppScopeExtractionParser, CPP_NODE_TYPES, CPP_STOP_WORDS, CPP_BUILTIN_IDENTIFIERS } from './CppScopeExtractionParser.js';
export { RustScopeExtractionParser, RUST_NODE_TYPES, RUST_STOP_WORDS, RUST_BUILTIN_IDENTIFIERS } from './RustScopeExtractionParser.js';
export { GoScopeExtractionParser, GO_NODE_TYPES, GO_STOP_WORDS, GO_BUILTIN_IDENTIFIERS } from './GoScopeExtractionParser.js';
export { CSharpScopeExtractionParser, CSHARP_NODE_TYPES, CSHARP_STOP_WORDS, CSHARP_BUILTIN_IDENTIFIERS } from './CSharpScopeExtractionParser.js';
export type {
  ScopeInfo,
  ParameterInfo,
  VariableInfo,
  ClassMemberInfo,
  ReturnTypeInfo,
  ScopeFileAnalysis,
  ImportReference,
  IdentifierReference,
  HeritageClause,
  GenericParameter,
  DecoratorInfo,
  EnumMemberInfo
} from './types.js';
