/**
 * Browser-compatible TypeScript Parser
 *
 * Uses web-tree-sitter in a way that works in the browser environment.
 * WASM files are loaded from CDN or bundled assets.
 */

export interface BrowserParseResult {
  tree: any;
  rootNode: any;
}

export interface TokenInfo {
  type: string;
  text: string;
  startIndex: number;
  endIndex: number;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
}

export class BrowserTypeScriptParser {
  private parser: any = null;
  private initialized: boolean = false;

  constructor() {
    // Parser will be created in initialize()
  }

  /**
   * Initialize the parser with TypeScript language
   * Uses CDN for WASM files by default
   */
  async initialize(wasmPath?: string): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamically import web-tree-sitter
      const Parser: any = (await import('web-tree-sitter')).default;

      // Initialize web-tree-sitter
      // Use provided WASM path or default CDN
      const treeSitterWasmPath = wasmPath || 'https://cdn.jsdelivr.net/npm/web-tree-sitter@0.25.10/tree-sitter.wasm';

      await Parser.init({
        locateFile(scriptName: string, scriptDirectory: string) {
          return treeSitterWasmPath;
        },
      });

      // Create parser
      this.parser = new Parser();

      // Load TypeScript language from CDN
      const TypeScript = await Parser.Language.load(
        'https://cdn.jsdelivr.net/npm/tree-sitter-wasms@0.1.13/out/tree-sitter-typescript.wasm'
      );

      this.parser.setLanguage(TypeScript);
      this.initialized = true;

      console.log('✅ Browser TypeScript Parser initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Browser TypeScript Parser:', error);
      throw error;
    }
  }

  /**
   * Parse TypeScript code and return the syntax tree
   */
  parse(code: string): BrowserParseResult | null {
    if (!this.parser) {
      console.error('Parser not initialized. Call initialize() first.');
      return null;
    }

    const tree = this.parser.parse(code);
    return {
      tree,
      rootNode: tree.rootNode
    };
  }

  /**
   * Get all tokens from a parse tree
   * Useful for syntax highlighting
   */
  getTokens(code: string): TokenInfo[] {
    const result = this.parse(code);
    if (!result) return [];

    const tokens: TokenInfo[] = [];
    const { rootNode } = result;

    // Traverse the tree and collect all leaf nodes (tokens)
    const traverse = (node: any) => {
      if (node.childCount === 0) {
        // It's a leaf node (token)
        tokens.push({
          type: node.type,
          text: code.substring(node.startIndex, node.endIndex),
          startIndex: node.startIndex,
          endIndex: node.endIndex,
          startPosition: node.startPosition,
          endPosition: node.endPosition
        });
      } else {
        // Traverse children
        for (let i = 0; i < node.childCount; i++) {
          traverse(node.child(i));
        }
      }
    };

    traverse(rootNode);
    return tokens;
  }

  /**
   * Get syntax highlighting information for code
   * Returns tokens categorized by their syntactic role
   * Uses tree-sitter's native node types instead of manual keyword lists
   */
  getHighlightTokens(code: string): Array<{
    type: 'keyword' | 'identifier' | 'type' | 'string' | 'number' | 'comment' | 'operator' | 'punctuation' | 'function' | 'class' | 'parameter' | 'property';
    text: string;
    start: number;
    end: number;
  }> {
    const result = this.parse(code);
    if (!result) return [];

    const highlightTokens: Array<any> = [];
    const { rootNode } = result;

    // Traverse and categorize tokens based on tree-sitter node types
    const traverse = (node: any) => {
      const nodeType = node.type;
      const text = code.substring(node.startIndex, node.endIndex);

      // Categorize based on tree-sitter's native node type
      let category: any = 'identifier';

      // Tree-sitter already categorizes keywords for us!
      if (nodeType === 'if' || nodeType === 'else' || nodeType === 'for' ||
          nodeType === 'while' || nodeType === 'return' || nodeType === 'const' ||
          nodeType === 'let' || nodeType === 'var' || nodeType === 'function' ||
          nodeType === 'class' || nodeType === 'interface' || nodeType === 'type' ||
          nodeType === 'export' || nodeType === 'import' || nodeType === 'from' ||
          nodeType === 'as' || nodeType === 'async' || nodeType === 'await' ||
          nodeType === 'try' || nodeType === 'catch' || nodeType === 'throw' ||
          nodeType === 'new' || nodeType === 'this' || nodeType === 'extends' ||
          nodeType === 'implements' || nodeType === 'public' || nodeType === 'private' ||
          nodeType === 'protected' || nodeType === 'static' || nodeType === 'readonly' ||
          nodeType === 'break' || nodeType === 'continue' || nodeType === 'case' ||
          nodeType === 'switch' || nodeType === 'default' || nodeType === 'do' ||
          nodeType === 'in' || nodeType === 'of' || nodeType === 'typeof' ||
          nodeType === 'instanceof' || nodeType === 'void' || nodeType === 'delete' ||
          nodeType === 'yield' || nodeType === 'super' || nodeType === 'debugger' ||
          nodeType === 'with' || nodeType === 'enum' || nodeType === 'namespace' ||
          nodeType === 'module' || nodeType === 'declare' || nodeType === 'abstract' ||
          nodeType === 'get' || nodeType === 'set' || nodeType === 'is' ||
          nodeType === 'keyof' || nodeType === 'infer' || nodeType === 'readonly' ||
          nodeType === 'unique' || nodeType === 'require' || nodeType === 'global' ||
          nodeType === 'any' || nodeType === 'unknown' || nodeType === 'never' ||
          nodeType === 'object' || nodeType === 'boolean' || nodeType === 'number' ||
          nodeType === 'bigint' || nodeType === 'string' || nodeType === 'symbol' ||
          nodeType === 'undefined' || nodeType === 'null' || nodeType === 'true' || nodeType === 'false') {
        category = 'keyword';
      } else if (nodeType === 'string' || nodeType === 'template_string' || nodeType === 'string_fragment') {
        category = 'string';
      } else if (nodeType === 'number' || nodeType === 'numeric_literal') {
        category = 'number';
      } else if (nodeType === 'comment' || nodeType === 'line_comment' || nodeType === 'block_comment') {
        category = 'comment';
      } else if (nodeType === 'type_identifier' || nodeType === 'predefined_type' || nodeType === 'generic_type') {
        category = 'type';
      } else if (nodeType === 'identifier') {
        // Check parent context to determine the role of this identifier
        const parent = node.parent;
        if (parent) {
          const parentType = parent.type;
          if (parentType === 'function_declaration' || parentType === 'function_expression' ||
              parentType === 'arrow_function' || parentType === 'method_definition' ||
              parentType === 'function_signature' || parentType === 'call_expression') {
            category = 'function';
          } else if (parentType === 'class_declaration' || parentType === 'class_expression' ||
                     parentType === 'new_expression') {
            category = 'class';
          } else if (parentType === 'required_parameter' || parentType === 'optional_parameter' ||
                     parentType === 'rest_parameter') {
            category = 'parameter';
          } else if (parentType === 'property_identifier' || parentType === 'public_field_definition' ||
                     parentType === 'property_signature') {
            category = 'property';
          }
        }
      } else if (nodeType === '+' || nodeType === '-' || nodeType === '*' || nodeType === '/' ||
                 nodeType === '=' || nodeType === '==' || nodeType === '===' ||
                 nodeType === '!=' || nodeType === '!==' || nodeType === '<' ||
                 nodeType === '>' || nodeType === '<=' || nodeType === '>=' ||
                 nodeType === '&&' || nodeType === '||' || nodeType === '!' ||
                 nodeType === '%' || nodeType === '**' || nodeType === '&' ||
                 nodeType === '|' || nodeType === '^' || nodeType === '~' ||
                 nodeType === '<<' || nodeType === '>>' || nodeType === '>>>' ||
                 nodeType === '+=' || nodeType === '-=' || nodeType === '*=' ||
                 nodeType === '/=' || nodeType === '%=' || nodeType === '**=' ||
                 nodeType === '&=' || nodeType === '|=' || nodeType === '^=' ||
                 nodeType === '<<=' || nodeType === '>>=' || nodeType === '>>>=' ||
                 nodeType === '++' || nodeType === '--' || nodeType === '??' ||
                 nodeType === '?.' || nodeType === '...') {
        category = 'operator';
      } else if (nodeType === '(' || nodeType === ')' || nodeType === '{' ||
                 nodeType === '}' || nodeType === '[' || nodeType === ']' ||
                 nodeType === ';' || nodeType === ',' || nodeType === '.' ||
                 nodeType === ':' || nodeType === '?' || nodeType === '=>') {
        category = 'punctuation';
      }

      // Only add leaf nodes (actual tokens) with non-empty text
      if (node.childCount === 0 && text.trim()) {
        highlightTokens.push({
          type: category,
          text,
          start: node.startIndex,
          end: node.endIndex
        });
      }

      // Traverse children
      for (let i = 0; i < node.childCount; i++) {
        traverse(node.child(i));
      }
    };

    traverse(rootNode);
    return highlightTokens;
  }

  /**
   * Query the syntax tree using tree-sitter queries
   * Useful for finding specific patterns
   */
  query(code: string, queryString: string): any[] {
    const result = this.parse(code);
    if (!result || !this.parser) return [];

    try {
      const query = this.parser.getLanguage().query(queryString);
      const matches = query.matches(result.rootNode);
      return matches;
    } catch (error) {
      console.error('Query failed:', error);
      return [];
    }
  }
}
