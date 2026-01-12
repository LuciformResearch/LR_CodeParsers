/**
 * Test nested generics and complex type scenarios
 */
import * as fs from 'fs/promises';
import * as path from 'path';

const { 
  ScopeExtractionParser,
  PythonScopeExtractionParser,
  CppScopeExtractionParser,
  GoScopeExtractionParser,
  RustScopeExtractionParser,
  CSharpScopeExtractionParser,
  RelationshipResolver
} = await import('./dist/esm/index.js');

const TEST_CASES = {
  typescript_nested: {
    name: 'TypeScript - Nested Generics',
    parser: () => new ScopeExtractionParser(),
    files: {
      'types.ts': `
export interface User { id: string; }
export interface Error { message: string; }
export interface Result<T, E> { value?: T; error?: E; }
export interface List<T> { items: T[]; }
export interface Map<K, V> { get(key: K): V; }
export interface Cache<T> { data: T; }
export type Callback<T> = (item: T) => void;
`,
      'service.ts': `
import { User, Error, Result, List, Map, Cache, Callback } from './types';

// Nested generics
class UserService {
  // Result with nested List
  getUsers(): Result<List<User>, Error> { return {}; }
  
  // Map with nested Result
  cache: Map<string, Result<User, Error>>;
  
  // Triple nesting
  getGroupedUsers(): Map<string, List<Result<User, Error>>> { return {} as any; }
  
  // Callback with nested type
  onUpdate: Callback<List<User>>;
  
  // Cache of Map
  fullCache: Cache<Map<string, User>>;
}

// Function with nested generics
function processResults<T>(
  results: List<Result<T, Error>>,
  callback: Callback<Result<T, Error>>
): Map<string, T> {
  return {} as any;
}
`
    },
    expected: [
      'UserService → Result',
      'UserService → List', 
      'UserService → User',
      'UserService → Error',
      'UserService → Map',
      'UserService → Cache',
      'UserService → Callback',
      'processResults → List',
      'processResults → Result',
      'processResults → Error',
      'processResults → Callback',
      'processResults → Map',
    ]
  },

  typescript_constraints: {
    name: 'TypeScript - Generic Constraints',
    parser: () => new ScopeExtractionParser(),
    files: {
      'types.ts': `
export interface Entity { id: string; }
export interface Serializable { serialize(): string; }
export interface Repository<T> { find(id: string): T; }
export interface Comparable<T> { compareTo(other: T): number; }
`,
      'service.ts': `
import { Entity, Serializable, Repository, Comparable } from './types';

// Constraint with single interface
function save<T extends Entity>(item: T): void {}

// Multiple constraints  
function process<T extends Entity & Serializable>(item: T): void {}

// Constraint referencing other generic
class SortedRepo<T extends Comparable<T>> implements Repository<T> {
  find(id: string): T { return {} as T; }
}

// Nested constraint
function transform<T extends Repository<Entity>>(repo: T): void {}
`
    },
    expected: [
      'save → Entity',
      'process → Entity',
      'process → Serializable',
      'SortedRepo → Comparable',
      'SortedRepo → Repository',
      'transform → Repository',
      'transform → Entity',
    ]
  },

  typescript_advanced: {
    name: 'TypeScript - Union/Intersection/Conditional',
    parser: () => new ScopeExtractionParser(),
    files: {
      'types.ts': `
export interface User { name: string; }
export interface Admin { role: string; }
export interface Guest { temp: boolean; }
export interface Error { msg: string; }
`,
      'service.ts': `
import { User, Admin, Guest, Error } from './types';

// Union types
type Person = User | Admin | Guest;

// Intersection
type SuperUser = User & Admin;

// Conditional (simplified)
type MaybeUser = User | null;

// Function with union param
function handlePerson(p: User | Admin): void {}

// Function with intersection return
function createSuper(): User & Admin { return {} as any; }

// Array of union
function getAll(): (User | Guest)[] { return []; }
`
    },
    expected: [
      'handlePerson → User',
      'handlePerson → Admin',
      'createSuper → User',
      'createSuper → Admin',
      'getAll → User',
      'getAll → Guest',
    ]
  },

  cpp_templates: {
    name: 'C++ - Nested Templates',
    parser: () => new CppScopeExtractionParser(),
    files: {
      'types.hpp': `
template<typename T> class vector { public: T* data; };
template<typename K, typename V> class map { public: V get(K key); };
template<typename T> class optional { public: T value; };
class User { public: std::string name; };
class Error { public: std::string msg; };
`,
      'service.cpp': `
#include "types.hpp"

// Nested templates
class UserService {
public:
    // vector of pointers
    vector<User*> users;
    
    // map with vector value
    map<std::string, vector<User>> groupedUsers;
    
    // optional of pointer
    optional<User*> currentUser;
    
    // Triple nesting
    map<std::string, vector<optional<User>>> cache;
    
    // Method returning nested template
    vector<optional<Error>> getErrors();
    
    // Template method
    template<typename T>
    optional<T> find(const std::string& id);
};

// Function with nested templates
template<typename T>
map<std::string, vector<T>> groupBy(vector<T>& items);
`
    },
    expected: [
      'UserService → vector',
      'UserService → User',
      'UserService → map',
      'UserService → optional',
      'UserService → Error',
    ]
  },

  rust_generics: {
    name: 'Rust - Nested Generics & Traits',
    parser: () => new RustScopeExtractionParser(),
    files: {
      'types.rs': `
pub struct User { pub name: String }
pub struct Error { pub msg: String }
pub enum Option<T> { Some(T), None }
pub enum Result<T, E> { Ok(T), Err(E) }
pub struct Vec<T> { data: *mut T }
pub struct HashMap<K, V> { data: Vec<(K, V)> }
pub trait Repository<T> { fn find(&self, id: &str) -> Option<T>; }
pub trait Serialize { fn serialize(&self) -> String; }
`,
      'service.rs': `
use crate::types::*;

// Nested generics
pub struct UserService {
    // Result with Option
    cache: HashMap<String, Result<Option<User>, Error>>,
    
    // Vec of Results
    history: Vec<Result<User, Error>>,
}

impl UserService {
    // Method with nested return
    pub fn get_all(&self) -> Vec<Option<User>> {
        Vec { data: std::ptr::null_mut() }
    }
    
    // Complex params
    pub fn process(&self, data: HashMap<String, Vec<User>>) -> Result<(), Error> {
        Ok(())
    }
}

// Trait with associated type bounds
impl Repository<User> for UserService {
    fn find(&self, id: &str) -> Option<User> { None }
}

// Generic function with trait bounds
pub fn save<T: Serialize>(item: &T) -> Result<(), Error> {
    Ok(())
}
`
    },
    expected: [
      'UserService → HashMap',
      'UserService → Result',
      'UserService → Option',
      'UserService → User',
      'UserService → Error',
      'UserService → Vec',
      'save → Serialize',
      'save → Result',
      'save → Error',
    ]
  },

  go_generics: {
    name: 'Go - Nested Type Parameters',
    parser: () => new GoScopeExtractionParser(),
    files: {
      'types.go': `
package main

type User struct { Name string }
type Error struct { Msg string }
type Result[T any] struct { Value T; Err error }
type List[T any] struct { Items []T }
type Map[K comparable, V any] struct { Data map[K]V }
type Cache[T any] interface { Get(key string) T }
`,
      'service.go': `
package main

// Nested generics
type UserService struct {
    // Result with List
    Users Result[List[User]]
    
    // Map with Result
    Cache Map[string, Result[User]]
}

// Function with nested type params
func ProcessResults[T any](results List[Result[T, Error]]) Map[string, T] {
    return Map[string, T]{}
}

// Method with nested return
func (s *UserService) GetGrouped() Map[string, List[User]] {
    return Map[string, List[User]]{}
}
`
    },
    expected: [
      'UserService → Result',
      'UserService → List',
      'UserService → User',
      'UserService → Map',
      'ProcessResults → List',
      'ProcessResults → Result',
      'ProcessResults → Map',
      'GetGrouped → Map',
      'GetGrouped → List',
      'GetGrouped → User',
    ]
  },

  csharp_generics: {
    name: 'C# - Nested Generics & Constraints',
    parser: () => new CSharpScopeExtractionParser(),
    files: {
      'Types.cs': `
namespace App {
    public class User { public string Name; }
    public class Error { public string Msg; }
    public class Result<T, E> { public T Value; public E Err; }
    public class List<T> { public T[] Items; }
    public interface IRepository<T> { T Find(string id); }
    public interface ISerializable { string Serialize(); }
}
`,
      'Service.cs': `
using App;

namespace App {
    public class UserService {
        // Nested generics
        public Result<List<User>, Error> GetUsers() { return null; }
        
        // Dictionary with nested value
        public Dictionary<string, Result<User, Error>> Cache;
        
        // Triple nesting
        public Dictionary<string, List<Result<User, Error>>> GroupedResults;
    }
    
    // Generic class with constraint
    public class Repository<T> : IRepository<T> where T : class, ISerializable {
        public T Find(string id) { return default; }
    }
    
    // Method with multiple constraints
    public class Processor {
        public void Process<T, E>(Result<T, E> result) 
            where T : User 
            where E : Error { }
    }
}
`
    },
    expected: [
      'UserService → Result',
      'UserService → List',
      'UserService → User',
      'UserService → Error',
      'Repository → IRepository',
      'Repository → ISerializable',
      'Process → Result',
      'Process → User',
      'Process → Error',
    ]
  },

  python_generics: {
    name: 'Python - Nested Type Hints',
    parser: () => new PythonScopeExtractionParser(),
    files: {
      'types.py': `
from typing import TypeVar, Generic, Protocol

T = TypeVar('T')
E = TypeVar('E')

class User:
    name: str

class Error:
    msg: str

class Result(Generic[T, E]):
    value: T
    error: E

class Repository(Protocol[T]):
    def find(self, id: str) -> T: ...
`,
      'service.py': `
from typing import List, Dict, Optional, Callable, Union
from types import User, Error, Result, Repository

class UserService:
    # Nested generics
    def get_users(self) -> Result[List[User], Error]:
        pass
    
    # Dict with nested value
    cache: Dict[str, Result[User, Error]]
    
    # Triple nesting
    grouped: Dict[str, List[Result[User, Error]]]
    
    # Optional of generic
    current: Optional[Result[User, Error]]
    
    # Callback with nested type
    on_update: Callable[[List[User]], None]

# Function with nested generics
def process_all(
    data: Dict[str, List[User]],
    callback: Callable[[User], Result[User, Error]]
) -> List[Result[User, Error]]:
    pass

# Union with generics
def handle(item: Union[Result[User, Error], User]) -> Optional[User]:
    pass
`
    },
    expected: [
      'UserService → Result',
      'UserService → List',
      'UserService → User',
      'UserService → Error',
      'process_all → Dict',
      'process_all → List',
      'process_all → User',
      'process_all → Result',
      'process_all → Error',
      'handle → Result',
      'handle → User',
      'handle → Error',
    ]
  },
};

async function runTest(testKey, testCase) {
  const testDir = `/tmp/codeparsers-nested-generics/${testKey}`;
  await fs.rm(testDir, { recursive: true, force: true });
  await fs.mkdir(testDir, { recursive: true });

  const parser = testCase.parser();
  await parser.initialize();

  const parsedFiles = new Map();
  for (const [filename, content] of Object.entries(testCase.files)) {
    const filePath = path.join(testDir, filename);
    await fs.writeFile(filePath, content.trim());
    const analysis = await parser.parseFile(filePath, content.trim());
    parsedFiles.set(filePath, analysis);
  }

  const resolver = new RelationshipResolver({
    projectRoot: testDir,
    defaultLanguage: testKey.split('_')[0],
    includeInverse: true
  });

  const result = await resolver.resolveRelationships(parsedFiles);

  // Check expected relationships
  let passed = 0;
  let failed = 0;
  const notFound = [];

  for (const exp of testCase.expected) {
    const [from, to] = exp.split(' → ');
    const found = result.relationships.some(r =>
      r.fromName === from && r.toName === to
    );
    if (found) {
      passed++;
    } else {
      failed++;
      notFound.push(exp);
    }
  }

  return { name: testCase.name, passed, failed, total: testCase.expected.length, notFound };
}

async function main() {
  console.log('Nested Generics & Complex Type Tests');
  console.log('═'.repeat(70));

  const results = [];
  for (const [key, testCase] of Object.entries(TEST_CASES)) {
    console.log('\n' + '─'.repeat(70));
    console.log(testCase.name);
    console.log('─'.repeat(70));

    try {
      const result = await runTest(key, testCase);
      results.push(result);

      if (result.failed === 0) {
        console.log(`   ✓ ${result.passed}/${result.total} relationships found`);
      } else {
        console.log(`   ✗ ${result.passed}/${result.total} - Missing:`);
        for (const nf of result.notFound) {
          console.log(`     - ${nf}`);
        }
      }
    } catch (err) {
      console.log(`   ✗ Error: ${err.message}`);
      results.push({ name: testCase.name, passed: 0, failed: 1, total: 1, error: err.message });
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('SUMMARY');
  console.log('═'.repeat(70));

  let totalPassed = 0;
  let totalFailed = 0;

  for (const r of results) {
    const status = r.failed === 0 ? '✓' : '✗';
    console.log(`${status} ${r.name}: ${r.passed}/${r.total}`);
    totalPassed += r.passed;
    totalFailed += r.failed;
  }

  console.log('─'.repeat(70));
  console.log(`TOTAL: ${totalPassed}/${totalPassed + totalFailed}`);

  if (totalFailed > 0) {
    console.log(`\n⚠️  ${totalFailed} relationships not found`);
  } else {
    console.log('\n✓ All nested generic tests passed!');
  }
}

main().catch(console.error);
