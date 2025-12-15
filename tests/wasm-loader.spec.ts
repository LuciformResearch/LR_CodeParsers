/**
 * Tests for WasmLoader in Node.js environment
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { WasmLoader } from '../src/wasm/WasmLoader.js';

describe('WasmLoader (Node.js)', () => {
  beforeEach(() => {
    WasmLoader.clearCache();
  });

  it('should detect Node.js environment', () => {
    expect(WasmLoader.getEnvironment()).toBe('node');
  });

  it('should load TypeScript parser', async () => {
    const { parser, language } = await WasmLoader.loadParser('typescript');

    expect(parser).toBeDefined();
    expect(language).toBeDefined();

    // Test parsing some TypeScript code
    const code = `function hello(name: string): string { return "Hello " + name; }`;
    const tree = parser.parse(code);

    expect(tree).toBeDefined();
    expect(tree.rootNode).toBeDefined();
    expect(tree.rootNode.type).toBe('program');
  });

  it('should load Python parser', async () => {
    const { parser, language } = await WasmLoader.loadParser('python');

    expect(parser).toBeDefined();
    expect(language).toBeDefined();

    // Test parsing some Python code
    const code = `def hello(name):\n    return "Hello " + name`;
    const tree = parser.parse(code);

    expect(tree).toBeDefined();
    expect(tree.rootNode).toBeDefined();
    expect(tree.rootNode.type).toBe('module');
  });

  it('should load HTML parser', async () => {
    const { parser, language } = await WasmLoader.loadParser('html');

    expect(parser).toBeDefined();
    expect(language).toBeDefined();

    const code = `<div class="container"><p>Hello</p></div>`;
    const tree = parser.parse(code);

    expect(tree).toBeDefined();
    expect(tree.rootNode.type).toBe('document');
  });

  it('should load CSS parser', async () => {
    const { parser, language } = await WasmLoader.loadParser('css');

    expect(parser).toBeDefined();
    expect(language).toBeDefined();

    const code = `.container { color: red; }`;
    const tree = parser.parse(code);

    expect(tree).toBeDefined();
    expect(tree.rootNode.type).toBe('stylesheet');
  });

  it('should cache parser instances', async () => {
    expect(WasmLoader.isCached('typescript')).toBe(false);

    await WasmLoader.loadParser('typescript');
    expect(WasmLoader.isCached('typescript')).toBe(true);

    // Loading again should return cached instance
    const { parser: parser1 } = await WasmLoader.loadParser('typescript');
    const { parser: parser2 } = await WasmLoader.loadParser('typescript');

    expect(parser1).toBe(parser2);
  });

  it('should clear cache', async () => {
    await WasmLoader.loadParser('typescript');
    expect(WasmLoader.isCached('typescript')).toBe(true);

    WasmLoader.clearCache();
    expect(WasmLoader.isCached('typescript')).toBe(false);
  });

  it('should respect forceEnvironment option', () => {
    WasmLoader.configure({ forceEnvironment: 'browser' });
    expect(WasmLoader.getEnvironment()).toBe('browser');

    WasmLoader.configure({ forceEnvironment: 'node' });
    expect(WasmLoader.getEnvironment()).toBe('node');

    // Reset
    WasmLoader.configure({});
  });
});
