/**
 * Relationship Resolution module exports
 *
 * Provides CONSUMES/CONSUMED_BY relationship resolution between scopes
 * across multiple files without needing a database.
 */

// Main class
export { RelationshipResolver } from './RelationshipResolver.js';

// Types
export type {
  // Core types
  RelationshipType,
  ResolvedRelationship,
  RelationshipMetadata,
  ScopeMappingEntry,
  GlobalScopeMapping,
  UuidToScopeMapping,

  // Options and results
  RelationshipResolverOptions,
  RelationshipResolutionResult,
  ResolutionStats,
  UnresolvedReference,

  // Language support
  SupportedLanguage,
  ParsedFilesMap,

  // Enriched types
  EnrichedScope,
  EnrichedFileAnalysis,
} from './types.js';
