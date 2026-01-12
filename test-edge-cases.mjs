/**
 * Edge Cases Test for Cross-file Relationship Resolution
 *
 * Tests more complex scenarios:
 * - Inheritance (extends/implements)
 * - Complex generics (nested, multiple params)
 * - Aliased imports
 * - Nullable/Optional types
 * - Static members
 * - Enums
 * - Decorators/Attributes
 */

import * as path from 'path';
import * as fs from 'fs/promises';

const {
  ScopeExtractionParser,
  PythonScopeExtractionParser,
  GoScopeExtractionParser,
  CScopeExtractionParser,
  CppScopeExtractionParser,
  CSharpScopeExtractionParser,
  RustScopeExtractionParser,
  RelationshipResolver
} = await import('./dist/esm/index.js');

const TEST_DIR = '/tmp/codeparsers-edge-case-tests';

// ============================================================================
// Edge Case Tests by Language
// ============================================================================

const EDGE_CASE_TESTS = {
  // ==========================================================================
  // TypeScript Edge Cases
  // ==========================================================================
  typescript_inheritance: {
    name: 'TypeScript - Inheritance & Implements',
    parser: () => new ScopeExtractionParser('typescript'),
    files: {
      'base.ts': `
export interface Serializable {
  serialize(): string;
}

export interface Identifiable {
  getId(): string;
}

export abstract class BaseEntity implements Identifiable {
  abstract getId(): string;
}

export class AuditableEntity extends BaseEntity implements Serializable {
  getId(): string { return ''; }
  serialize(): string { return ''; }
}
`,
      'models.ts': `
import { BaseEntity, Serializable, AuditableEntity } from './base';

export class User extends AuditableEntity {
  name: string = '';
}

export class Admin extends User implements Serializable {
  role: string = 'admin';
  serialize(): string { return JSON.stringify(this); }
}
`
    },
    expected: [
      'User → AuditableEntity',      // extends
      'Admin → User',                 // extends
      'Admin → Serializable',         // implements
    ]
  },

  typescript_generics: {
    name: 'TypeScript - Complex Generics',
    parser: () => new ScopeExtractionParser('typescript'),
    files: {
      'types.ts': `
export interface Result<T, E = Error> {
  data?: T;
  error?: E;
}

export interface Repository<T> {
  find(id: string): Promise<T | null>;
  findAll(): Promise<T[]>;
}

export type Callback<T> = (item: T) => void;
`,
      'service.ts': `
import { Result, Repository, Callback } from './types';

interface User { id: string; name: string; }
interface ValidationError { field: string; message: string; }

export class UserService {
  constructor(private repo: Repository<User>) {}

  async getUser(id: string): Promise<Result<User, ValidationError>> {
    const user = await this.repo.find(id);
    return { data: user ?? undefined };
  }

  onUserChange(callback: Callback<User>): void {
    // ...
  }
}

// Nested generics
export function processResults<T>(results: Result<T[], Error>): T[] {
  return results.data ?? [];
}
`
    },
    expected: [
      'UserService → Repository',
      'UserService → Result',
      'UserService → Callback',
      'processResults → Result',
    ]
  },

  typescript_aliased: {
    name: 'TypeScript - Aliased Imports',
    parser: () => new ScopeExtractionParser('typescript'),
    files: {
      'models.ts': `
export class UserModel {
  id: string = '';
  name: string = '';
}

export class ProductModel {
  id: string = '';
  price: number = 0;
}
`,
      'service.ts': `
import { UserModel as User, ProductModel as Product } from './models';

export function createUser(): User {
  return new User();
}

export function getProduct(): Product {
  return new Product();
}

export class OrderService {
  processOrder(user: User, product: Product): void {
    // ...
  }
}
`
    },
    expected: [
      'createUser → UserModel',
      'getProduct → ProductModel',
      'OrderService → UserModel',
      'OrderService → ProductModel',
    ]
  },

  typescript_enums: {
    name: 'TypeScript - Enums',
    parser: () => new ScopeExtractionParser('typescript'),
    files: {
      'enums.ts': `
export enum Status {
  Active = 'active',
  Inactive = 'inactive',
  Pending = 'pending'
}

export enum Role {
  Admin,
  User,
  Guest
}
`,
      'service.ts': `
import { Status, Role } from './enums';

export interface User {
  status: Status;
  role: Role;
}

export function isActive(user: User): boolean {
  return user.status === Status.Active;
}

export function isAdmin(user: User): boolean {
  return user.role === Role.Admin;
}
`
    },
    expected: [
      'isActive → Status',
      'isAdmin → Role',
    ]
  },

  // ==========================================================================
  // Python Edge Cases
  // ==========================================================================
  python_inheritance: {
    name: 'Python - Inheritance & Mixins',
    parser: () => new PythonScopeExtractionParser(),
    files: {
      'base.py': `
from abc import ABC, abstractmethod
from typing import Protocol

class Serializable(Protocol):
    def serialize(self) -> str: ...

class Identifiable(ABC):
    @abstractmethod
    def get_id(self) -> str:
        pass

class TimestampMixin:
    created_at: str = ""
    updated_at: str = ""
`,
      'models.py': `
from base import Identifiable, TimestampMixin, Serializable

class User(Identifiable, TimestampMixin):
    def __init__(self, name: str):
        self.name = name

    def get_id(self) -> str:
        return self.name

class Admin(User, Serializable):
    role: str = "admin"

    def serialize(self) -> str:
        return f"{self.name}:{self.role}"
`
    },
    expected: [
      'User → Identifiable',
      'User → TimestampMixin',
      'Admin → User',
      'Admin → Serializable',
    ]
  },

  python_generics: {
    name: 'Python - Generic Types',
    parser: () => new PythonScopeExtractionParser(),
    files: {
      'types.py': `
from typing import Generic, TypeVar, Optional, List, Dict

T = TypeVar('T')
K = TypeVar('K')
V = TypeVar('V')

class Result(Generic[T]):
    def __init__(self, value: Optional[T] = None, error: Optional[str] = None):
        self.value = value
        self.error = error

class Repository(Generic[T]):
    def find(self, id: str) -> Optional[T]:
        pass

    def find_all(self) -> List[T]:
        pass

class Cache(Generic[K, V]):
    def get(self, key: K) -> Optional[V]:
        pass

    def set(self, key: K, value: V) -> None:
        pass
`,
      'service.py': `
from typing import List, Dict
from types import Result, Repository, Cache

class User:
    id: str
    name: str

class UserService:
    def __init__(self, repo: Repository[User], cache: Cache[str, User]):
        self.repo = repo
        self.cache = cache

    def get_user(self, id: str) -> Result[User]:
        cached = self.cache.get(id)
        if cached:
            return Result(value=cached)
        return Result(value=self.repo.find(id))
`
    },
    expected: [
      'UserService → Repository',
      'UserService → Cache',
      'UserService → Result',
    ]
  },

  python_decorators: {
    name: 'Python - Decorators',
    parser: () => new PythonScopeExtractionParser(),
    files: {
      'decorators.py': `
from functools import wraps
from typing import Callable, TypeVar, Any

T = TypeVar('T')

def logged(func: Callable[..., T]) -> Callable[..., T]:
    @wraps(func)
    def wrapper(*args: Any, **kwargs: Any) -> T:
        print(f"Calling {func.__name__}")
        return func(*args, **kwargs)
    return wrapper

def cached(func: Callable[..., T]) -> Callable[..., T]:
    cache: dict = {}
    @wraps(func)
    def wrapper(*args: Any) -> T:
        if args not in cache:
            cache[args] = func(*args)
        return cache[args]
    return wrapper

class inject:
    def __init__(self, service_name: str):
        self.service_name = service_name

    def __call__(self, func: Callable[..., T]) -> Callable[..., T]:
        return func
`,
      'service.py': `
from decorators import logged, cached, inject

class User:
    id: str
    name: str

class UserService:
    @logged
    def get_user(self, id: str) -> User:
        return User()

    @cached
    def get_all_users(self) -> list:
        return []

    @inject("database")
    def save_user(self, user: User) -> None:
        pass
`
    },
    expected: [
      'get_user → logged',
      'get_all_users → cached',
      'save_user → inject',
    ]
  },

  // ==========================================================================
  // Go Edge Cases
  // ==========================================================================
  go_interfaces: {
    name: 'Go - Interface Embedding',
    parser: () => new GoScopeExtractionParser(),
    files: {
      'interfaces.go': `
package interfaces

type Reader interface {
    Read(p []byte) (n int, err error)
}

type Writer interface {
    Write(p []byte) (n int, err error)
}

type ReadWriter interface {
    Reader
    Writer
}

type Closer interface {
    Close() error
}

type ReadWriteCloser interface {
    ReadWriter
    Closer
}
`,
      'impl.go': `
package impl

import "myapp/interfaces"

type FileHandler struct {
    path string
}

func (f *FileHandler) Read(p []byte) (int, error) {
    return 0, nil
}

func (f *FileHandler) Write(p []byte) (int, error) {
    return len(p), nil
}

func (f *FileHandler) Close() error {
    return nil
}

func ProcessStream(rw interfaces.ReadWriter) error {
    return nil
}

func ProcessFile(rwc interfaces.ReadWriteCloser) error {
    return rwc.Close()
}
`
    },
    expected: [
      'ProcessStream → ReadWriter',
      'ProcessFile → ReadWriteCloser',
    ]
  },

  go_generics: {
    name: 'Go - Generics (1.18+)',
    parser: () => new GoScopeExtractionParser(),
    files: {
      'types.go': `
package types

type Ordered interface {
    ~int | ~float64 | ~string
}

type Result[T any] struct {
    Value T
    Error error
}

type Pair[K comparable, V any] struct {
    Key   K
    Value V
}

type Repository[T any] interface {
    Find(id string) (T, error)
    Save(entity T) error
}
`,
      'service.go': `
package service

import "myapp/types"

type User struct {
    ID   string
    Name string
}

type UserRepo struct{}

func (r *UserRepo) Find(id string) (User, error) {
    return User{}, nil
}

func (r *UserRepo) Save(entity User) error {
    return nil
}

func GetUserResult(repo types.Repository[User]) types.Result[User] {
    user, err := repo.Find("1")
    return types.Result[User]{Value: user, Error: err}
}

func CreatePair[K comparable, V any](key K, value V) types.Pair[K, V] {
    return types.Pair[K, V]{Key: key, Value: value}
}
`
    },
    expected: [
      'GetUserResult → Repository',
      'GetUserResult → Result',
      'CreatePair → Pair',
    ]
  },

  // ==========================================================================
  // Rust Edge Cases
  // ==========================================================================
  rust_traits: {
    name: 'Rust - Traits & Implementations',
    parser: () => new RustScopeExtractionParser(),
    files: {
      'traits.rs': `
pub trait Serialize {
    fn serialize(&self) -> String;
}

pub trait Deserialize: Sized {
    fn deserialize(data: &str) -> Result<Self, String>;
}

pub trait Entity: Serialize + Deserialize {
    fn id(&self) -> &str;
}

pub trait Repository<T: Entity> {
    fn find(&self, id: &str) -> Option<T>;
    fn save(&mut self, entity: T) -> Result<(), String>;
}
`,
      'models.rs': `
use crate::traits::{Serialize, Deserialize, Entity, Repository};

pub struct User {
    pub id: String,
    pub name: String,
}

impl Serialize for User {
    fn serialize(&self) -> String {
        format!("{}:{}", self.id, self.name)
    }
}

impl Deserialize for User {
    fn deserialize(data: &str) -> Result<Self, String> {
        Ok(User { id: String::new(), name: String::new() })
    }
}

impl Entity for User {
    fn id(&self) -> &str {
        &self.id
    }
}

pub struct UserRepository {
    users: Vec<User>,
}

impl Repository<User> for UserRepository {
    fn find(&self, id: &str) -> Option<User> {
        None
    }

    fn save(&mut self, entity: User) -> Result<(), String> {
        Ok(())
    }
}
`
    },
    expected: [
      'User → Serialize',
      'User → Deserialize',
      'User → Entity',
      'UserRepository → Repository',
      'UserRepository → User',
    ]
  },

  // ==========================================================================
  // C++ Edge Cases
  // ==========================================================================
  cpp_inheritance: {
    name: 'C++ - Multiple Inheritance',
    parser: () => new CppScopeExtractionParser(),
    files: {
      'base.hpp': `
#pragma once
#include <string>

class Serializable {
public:
    virtual std::string serialize() const = 0;
    virtual ~Serializable() = default;
};

class Identifiable {
public:
    virtual std::string getId() const = 0;
    virtual ~Identifiable() = default;
};

class Loggable {
public:
    virtual void log(const std::string& message) const {}
    virtual ~Loggable() = default;
};

class Entity : public Identifiable, public Serializable {
public:
    virtual ~Entity() = default;
};
`,
      'models.hpp': `
#pragma once
#include "base.hpp"

class User : public Entity, public Loggable {
public:
    std::string id;
    std::string name;

    std::string getId() const override { return id; }
    std::string serialize() const override { return id + ":" + name; }
};

class Admin : public User {
public:
    std::string role = "admin";

    std::string serialize() const override {
        return User::serialize() + ":" + role;
    }
};
`
    },
    expected: [
      'User → Entity',
      'User → Loggable',
      'Admin → User',
    ]
  },

  cpp_templates: {
    name: 'C++ - Templates',
    parser: () => new CppScopeExtractionParser(),
    files: {
      'types.hpp': `
#pragma once
#include <optional>
#include <vector>
#include <memory>

template<typename T, typename E = std::string>
struct Result {
    std::optional<T> value;
    std::optional<E> error;
};

template<typename T>
class Repository {
public:
    virtual std::optional<T> find(const std::string& id) = 0;
    virtual std::vector<T> findAll() = 0;
    virtual void save(const T& entity) = 0;
    virtual ~Repository() = default;
};

template<typename K, typename V>
class Cache {
public:
    virtual std::optional<V> get(const K& key) = 0;
    virtual void set(const K& key, const V& value) = 0;
    virtual ~Cache() = default;
};
`,
      'service.cpp': `
#include "types.hpp"
#include <string>

struct User {
    std::string id;
    std::string name;
};

class UserService {
private:
    Repository<User>* repo;
    Cache<std::string, User>* cache;

public:
    UserService(Repository<User>* r, Cache<std::string, User>* c)
        : repo(r), cache(c) {}

    Result<User> getUser(const std::string& id) {
        auto cached = cache->get(id);
        if (cached) {
            return Result<User>{cached, std::nullopt};
        }
        return Result<User>{repo->find(id), std::nullopt};
    }
};
`
    },
    expected: [
      'UserService → Repository',
      'UserService → Cache',
      'UserService → Result',
    ]
  },

  // ==========================================================================
  // C# Edge Cases
  // ==========================================================================
  csharp_inheritance: {
    name: 'C# - Inheritance & Interfaces',
    parser: () => new CSharpScopeExtractionParser(),
    files: {
      'Base.cs': `
namespace MyApp.Base
{
    public interface ISerializable
    {
        string Serialize();
    }

    public interface IIdentifiable
    {
        string GetId();
    }

    public interface IEntity : IIdentifiable, ISerializable
    {
    }

    public abstract class BaseEntity : IEntity
    {
        public abstract string GetId();
        public abstract string Serialize();
    }
}
`,
      'Models.cs': `
using MyApp.Base;

namespace MyApp.Models
{
    public class User : BaseEntity
    {
        public string Id { get; set; }
        public string Name { get; set; }

        public override string GetId() => Id;
        public override string Serialize() => Id + ":" + Name;
    }

    public class Admin : User, ISerializable
    {
        public string Role { get; set; } = "admin";

        public override string Serialize() => base.Serialize() + ":" + Role;
    }
}
`
    },
    expected: [
      'User → BaseEntity',
      'Admin → User',
      'Admin → ISerializable',
    ]
  },

  csharp_generics: {
    name: 'C# - Generic Constraints',
    parser: () => new CSharpScopeExtractionParser(),
    files: {
      'Types.cs': `
namespace MyApp.Types
{
    public class Result<T, TError> where TError : class
    {
        public T Value { get; set; }
        public TError Error { get; set; }
    }

    public interface IRepository<T> where T : class, new()
    {
        T Find(string id);
        void Save(T entity);
    }

    public interface ICache<TKey, TValue>
    {
        TValue Get(TKey key);
        void Set(TKey key, TValue value);
    }
}
`,
      'Service.cs': `
using MyApp.Types;

namespace MyApp.Services
{
    public class User
    {
        public string Id { get; set; }
        public string Name { get; set; }
    }

    public class ValidationError
    {
        public string Field { get; set; }
        public string Message { get; set; }
    }

    public class UserService
    {
        private readonly IRepository<User> _repo;
        private readonly ICache<string, User> _cache;

        public UserService(IRepository<User> repo, ICache<string, User> cache)
        {
            _repo = repo;
            _cache = cache;
        }

        public Result<User, ValidationError> GetUser(string id)
        {
            var cached = _cache.Get(id);
            if (cached != null)
                return new Result<User, ValidationError> { Value = cached };
            return new Result<User, ValidationError> { Value = _repo.Find(id) };
        }
    }
}
`
    },
    expected: [
      'UserService → IRepository',
      'UserService → ICache',
      'UserService → Result',
    ]
  },

  // ==========================================================================
  // C Edge Cases
  // ==========================================================================
  c_function_pointers: {
    name: 'C - Function Pointers & Callbacks',
    parser: () => new CScopeExtractionParser(),
    files: {
      'types.h': `
#ifndef TYPES_H
#define TYPES_H

typedef struct {
    char* id;
    char* name;
} User;

typedef struct {
    char* message;
    int code;
} Error;

typedef void (*UserCallback)(User* user, void* context);
typedef int (*Comparator)(const void* a, const void* b);
typedef User* (*UserFactory)(const char* id);

#endif
`,
      'service.c': `
#include "types.h"
#include <stdlib.h>

void process_users(User** users, int count, UserCallback callback, void* ctx) {
    for (int i = 0; i < count; i++) {
        callback(users[i], ctx);
    }
}

void sort_users(User** users, int count, Comparator cmp) {
    qsort(users, count, sizeof(User*), cmp);
}

User* create_with_factory(UserFactory factory, const char* id) {
    return factory(id);
}

Error* validate_user(User* user) {
    if (!user->name) {
        Error* err = malloc(sizeof(Error));
        err->message = "Name required";
        err->code = 1;
        return err;
    }
    return NULL;
}
`
    },
    expected: [
      'process_users → User',
      'process_users → UserCallback',
      'sort_users → User',
      'sort_users → Comparator',
      'create_with_factory → User',
      'create_with_factory → UserFactory',
      'validate_user → User',
      'validate_user → Error',
    ]
  },
};

// ============================================================================
// Test Runner
// ============================================================================

async function runEdgeCaseTest(testId, config) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`${config.name}`);
  console.log('─'.repeat(70));

  const testDir = path.join(TEST_DIR, testId);

  try {
    // Setup files
    await fs.mkdir(testDir, { recursive: true });

    for (const [filename, content] of Object.entries(config.files)) {
      const filePath = path.join(testDir, filename);
      await fs.writeFile(filePath, content.trim());
    }

    // Parse files
    const parser = config.parser();
    await parser.initialize();

    const parsedFiles = new Map();
    for (const filename of Object.keys(config.files)) {
      const filePath = path.join(testDir, filename);
      const content = await fs.readFile(filePath, 'utf8');
      const analysis = await parser.parseFile(filePath, content);
      parsedFiles.set(filePath, analysis);
    }

    // Resolve relationships
    const resolver = new RelationshipResolver({
      projectRoot: testDir,
      includeContains: false,
      includeInverse: true, // Enable inverse relationships (DECORATED_BY, CONSUMED_BY, etc.)
    });

    const result = await resolver.resolveRelationships(parsedFiles);

    // Check expected relationships (both same-file AND cross-file)
    let passed = 0;
    let failed = 0;

    for (const expected of config.expected) {
      const [from, to] = expected.split(' → ');

      // Check all relationships (same-file or cross-file)
      const found = result.relationships.some(r =>
        r.fromName === from && r.toName === to
      );

      if (found) {
        // Show if it's same-file or cross-file
        const rel = result.relationships.find(r => r.fromName === from && r.toName === to);
        const sameFile = rel?.fromFile === rel?.toFile;
        console.log(`   ✓ ${expected}${sameFile ? ' (same-file)' : ''}`);
        passed++;
      } else {
        console.log(`   ✗ ${expected} (NOT FOUND)`);
        failed++;

        // Debug: show what relationships exist for this fromName
        const existing = result.relationships.filter(r => r.fromName === from);
        if (existing.length > 0) {
          console.log(`     Found for ${from}: ${existing.map(r => r.toName).join(', ')}`);
        }
      }
    }

    console.log(`\n   Result: ${passed}/${config.expected.length}`);

    return { passed, failed, total: config.expected.length };
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return { passed: 0, failed: config.expected.length, total: config.expected.length, error: true };
  }
}

async function main() {
  console.log('Edge Case Tests - Cross-file Relationship Resolution');
  console.log('═'.repeat(70));

  // Clean up
  await fs.rm(TEST_DIR, { recursive: true, force: true });
  await fs.mkdir(TEST_DIR, { recursive: true });

  const results = {};
  let totalPassed = 0;
  let totalFailed = 0;
  let totalTests = 0;

  for (const [testId, config] of Object.entries(EDGE_CASE_TESTS)) {
    const result = await runEdgeCaseTest(testId, config);
    results[testId] = result;
    totalPassed += result.passed;
    totalFailed += result.failed;
    totalTests += result.total;
  }

  // Summary
  console.log(`\n${'═'.repeat(70)}`);
  console.log('SUMMARY');
  console.log('═'.repeat(70));

  const byLanguage = {};
  for (const [testId, result] of Object.entries(results)) {
    const lang = testId.split('_')[0];
    if (!byLanguage[lang]) {
      byLanguage[lang] = { passed: 0, failed: 0, total: 0 };
    }
    byLanguage[lang].passed += result.passed;
    byLanguage[lang].failed += result.failed;
    byLanguage[lang].total += result.total;
  }

  console.log('\n| Language   | Passed | Failed | Total |');
  console.log('|------------|--------|--------|-------|');

  for (const [lang, stats] of Object.entries(byLanguage)) {
    const status = stats.failed === 0 ? '✓' : '✗';
    console.log(`| ${lang.padEnd(10)} | ${String(stats.passed).padStart(6)} | ${String(stats.failed).padStart(6)} | ${String(stats.total).padStart(5)} | ${status}`);
  }

  console.log('|------------|--------|--------|-------|');
  console.log(`| ${'TOTAL'.padEnd(10)} | ${String(totalPassed).padStart(6)} | ${String(totalFailed).padStart(6)} | ${String(totalTests).padStart(5)} |`);

  if (totalFailed === 0) {
    console.log('\n✓ All edge case tests passed!');
  } else {
    console.log(`\n⚠️  ${totalFailed}/${totalTests} edge case tests failed.`);
  }

  // Detailed test results
  console.log('\n\nDetailed Results:');
  console.log('─'.repeat(70));
  for (const [testId, result] of Object.entries(results)) {
    const config = EDGE_CASE_TESTS[testId];
    const status = result.failed === 0 ? '✓' : '✗';
    console.log(`${status} ${config.name}: ${result.passed}/${result.total}`);
  }
}

main().catch(console.error);
