import { WasmLoader } from './src/wasm/index.js';

const testCodes: Record<string, string> = {
  c: `
#include <stdio.h>

typedef struct {
    int x;
    int y;
} Point;

enum Color { RED, GREEN, BLUE };

int add(int a, int b) {
    return a + b;
}

int main() {
    Point p = {1, 2};
    printf("Hello %d\\n", add(p.x, p.y));
    return 0;
}
`,
  cpp: `
#include <iostream>
#include <vector>

namespace MyLib {

template<typename T>
class Container {
private:
    std::vector<T> items;
public:
    Container() = default;
    void add(T item) { items.push_back(item); }
    T get(int idx) const { return items[idx]; }
};

struct Point {
    int x, y;
};

enum class Color { Red, Green, Blue };

}  // namespace MyLib
`,
  rust: `
use std::collections::HashMap;

pub struct Point {
    x: i32,
    y: i32,
}

impl Point {
    pub fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }

    fn distance(&self) -> f64 {
        ((self.x.pow(2) + self.y.pow(2)) as f64).sqrt()
    }
}

pub trait Drawable {
    fn draw(&self);
}

impl Drawable for Point {
    fn draw(&self) {
        println!("Point({}, {})", self.x, self.y);
    }
}

enum Shape {
    Circle(f64),
    Rectangle(f64, f64),
}

fn main() {
    let p = Point::new(3, 4);
    p.draw();
}
`,
  csharp: `
using System;
using System.Collections.Generic;

namespace MyApp
{
    public interface IDrawable
    {
        void Draw();
    }

    public class Point : IDrawable
    {
        public int X { get; set; }
        public int Y { get; set; }

        public Point(int x, int y)
        {
            X = x;
            Y = y;
        }

        public void Draw()
        {
            Console.WriteLine($"Point({X}, {Y})");
        }
    }

    public struct Vector
    {
        public float X, Y, Z;
    }

    public enum Color { Red, Green, Blue }
}
`,
  go: `
package main

import (
    "fmt"
    "math"
)

type Point struct {
    X, Y int
}

func (p Point) Distance() float64 {
    return math.Sqrt(float64(p.X*p.X + p.Y*p.Y))
}

type Drawable interface {
    Draw()
}

func (p Point) Draw() {
    fmt.Printf("Point(%d, %d)\\n", p.X, p.Y)
}

func NewPoint(x, y int) *Point {
    return &Point{X: x, Y: y}
}

func main() {
    p := NewPoint(3, 4)
    fmt.Println(p.Distance())
}
`
};

function printTree(node: any, content: string, indent = 0, maxDepth = 4) {
  if (indent > maxDepth) return;

  const prefix = '  '.repeat(indent);
  const text = content.slice(node.startIndex, node.endIndex);
  const shortText = text.length > 50 ? text.slice(0, 50).replace(/\n/g, '\\n') + '...' : text.replace(/\n/g, '\\n');

  // Only show named nodes or important types
  if (node.isNamed || indent === 0) {
    console.log(`${prefix}${node.type} [${node.startPosition.row}:${node.startPosition.column}] "${shortText}"`);
  }

  for (let i = 0; i < node.childCount; i++) {
    printTree(node.child(i), content, indent + 1, maxDepth);
  }
}

async function test() {
  for (const [lang, code] of Object.entries(testCodes)) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Language: ${lang.toUpperCase()}`);
    console.log('='.repeat(60));

    try {
      const { parser } = await WasmLoader.loadParser(lang as any);
      const tree = parser.parse(code);
      printTree(tree.rootNode, code);
    } catch (err: any) {
      console.log(`Error: ${err.message}`);
    }
  }
}

test();
