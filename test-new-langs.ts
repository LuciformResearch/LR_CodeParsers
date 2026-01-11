import { WasmLoader } from './src/wasm/index.js';

const languages = ['c', 'cpp', 'rust', 'csharp', 'go'] as const;

async function test() {
  for (const lang of languages) {
    try {
      const { parser } = await WasmLoader.loadParser(lang);
      console.log(`✓ ${lang}: loaded successfully`);

      const testCode: Record<string, string> = {
        c: 'int main() { return 0; }',
        cpp: 'class Foo { public: void bar(); };',
        rust: 'fn main() { println!("hello"); }',
        csharp: 'class Program { static void Main() {} }',
        go: 'package main\nfunc main() {}'
      };

      const tree = parser.parse(testCode[lang]);
      console.log(`  └─ Root: ${tree.rootNode.type}, children: ${tree.rootNode.childCount}`);
    } catch (err: any) {
      console.log(`✗ ${lang}: ${err.message}`);
    }
  }
}

test();
