/**
 * Types for Syntax Highlighting Parser
 */

export interface HighlightToken {
  type: 'keyword' | 'identifier' | 'type' | 'string' | 'number' |
        'comment' | 'operator' | 'punctuation' | 'function' | 'class' |
        'parameter' | 'property' | 'whitespace';
  text: string;
  start: number;
  end: number;
}
