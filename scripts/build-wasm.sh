#!/bin/bash
# Build WASM grammars using tree-sitter CLI with Docker
# Run this script when updating tree-sitter grammar versions

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PACKAGE_DIR/src/wasm/grammars"

mkdir -p "$OUTPUT_DIR"

echo "Building WASM grammars..."
echo "Output directory: $OUTPUT_DIR"

# List of grammars to build
GRAMMARS=(
  "tree-sitter-typescript/typescript:tree-sitter-typescript.wasm"
  "tree-sitter-python:tree-sitter-python.wasm"
  "tree-sitter-html:tree-sitter-html.wasm"
  "tree-sitter-css:tree-sitter-css.wasm"
)

for grammar in "${GRAMMARS[@]}"; do
  IFS=':' read -r src dest <<< "$grammar"
  echo "Building $dest..."
  tree-sitter build --wasm --docker "$PACKAGE_DIR/node_modules/$src" -o "$OUTPUT_DIR/$dest"
  echo "  ✓ $dest ($(du -h "$OUTPUT_DIR/$dest" | cut -f1))"
done

echo ""
echo "All WASM grammars built successfully!"
ls -lh "$OUTPUT_DIR"
