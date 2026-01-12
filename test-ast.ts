import { WasmLoader } from './src/wasm/index.js';

const cppCode = `
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
    void print() { std::cout << x << "," << y; }
};

enum class Color { Red, Green, Blue };

int helper(int x) { return x * 2; }

}  // namespace MyLib
`;

const rustCode = `
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
`;

const goCode = `
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
`;

function printTree(node: any, content: string, indent = 0, maxDepth = 5) {
  if (indent > maxDepth) return;

  const prefix = '  '.repeat(indent);
  const text = content.slice(node.startIndex, node.endIndex);
  const shortText = text.length > 60 ? text.slice(0, 60).replace(/\n/g, '\\n') + '...' : text.replace(/\n/g, '\\n');

  if (node.isNamed || indent === 0) {
    console.log(prefix + node.type + ' [L' + (node.startPosition.row + 1) + '] "' + shortText + '"');
  }

  for (let i = 0; i < node.childCount; i++) {
    printTree(node.child(i), content, indent + 1, maxDepth);
  }
}

async function test() {
  const langs = [
    { name: 'cpp', code: cppCode },
    { name: 'rust', code: rustCode },
    { name: 'go', code: goCode }
  ];

  for (const { name, code } of langs) {
    console.log('\n' + '='.repeat(70));
    console.log('Language: ' + name.toUpperCase());
    console.log('='.repeat(70));

    try {
      const { parser } = await WasmLoader.loadParser(name as any);
      const tree = parser.parse(code);
      printTree(tree.rootNode, code);
    } catch (err: any) {
      console.log('Error: ' + err.message);
    }
  }
}

test();
