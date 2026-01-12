/**
 * Cross-file relationship tests for ALL supported languages
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const {
  ScopeExtractionParser,
  PythonScopeExtractionParser,
  CScopeExtractionParser,
  CppScopeExtractionParser,
  RustScopeExtractionParser,
  GoScopeExtractionParser,
  CSharpScopeExtractionParser,
  RelationshipResolver
} = await import('./dist/esm/index.js');

const TEST_DIR = '/tmp/codeparsers-all-lang-tests';

// ============================================================================
// Test cases for each language
// ============================================================================

const TESTS = {
  typescript: {
    parser: () => new ScopeExtractionParser('typescript'),
    files: {
      'models.ts': `
export interface User {
  id: string;
  name: string;
}

export class BaseEntity {
  id: string;
  createdAt: Date;
}

export interface Repository<T> {
  find(id: string): T | undefined;
  findAll(): T[];
}
`,
      'service.ts': `
import { User, BaseEntity, Repository } from './models';

export function getUser(repo: Repository<User>): User | undefined {
  return repo.find('1');
}

export class UserService {
  constructor(private repo: Repository<User>) {}

  findUser(id: string): User | undefined {
    return this.repo.find(id);
  }
}
`
    },
    expected: [
      'getUser → User',
      'getUser → Repository',
      'UserService → Repository',
      'UserService → User',
      'findUser → User',
    ]
  },

  python: {
    parser: () => new PythonScopeExtractionParser(),
    files: {
      'models.py': `
from dataclasses import dataclass
from typing import Generic, TypeVar
from abc import ABC

T = TypeVar('T')

@dataclass
class User:
    id: str
    name: str

class BaseEntity(ABC):
    id: str

class Repository(Generic[T]):
    def find(self, id: str) -> T:
        pass
`,
      'service.py': `
from typing import Optional
from models import User, BaseEntity, Repository

def get_user(repo: Repository[User]) -> Optional[User]:
    return repo.find('1')

class UserService:
    def __init__(self, repo: Repository[User]):
        self.repo = repo

    def find_user(self, id: str) -> Optional[User]:
        return self.repo.find(id)
`
    },
    expected: [
      'get_user → User',
      'get_user → Repository',
      'UserService → Repository',
      'UserService → User',
      'find_user → User',
    ]
  },

  rust: {
    parser: () => new RustScopeExtractionParser(),
    files: {
      'models.rs': `
pub struct User {
    pub id: String,
    pub name: String,
}

pub trait Entity {
    fn id(&self) -> &str;
}

impl Entity for User {
    fn id(&self) -> &str {
        &self.id
    }
}

pub trait Repository<T: Entity> {
    fn find(&self, id: &str) -> Option<&T>;
    fn find_all(&self) -> Vec<&T>;
}
`,
      'service.rs': `
use crate::models::{User, Entity, Repository};

pub fn get_user<R: Repository<User>>(repo: &R) -> Option<&User> {
    repo.find("1")
}

pub struct UserService<R: Repository<User>> {
    repo: R,
}

impl<R: Repository<User>> UserService<R> {
    pub fn new(repo: R) -> Self {
        Self { repo }
    }

    pub fn find_user(&self, id: &str) -> Option<&User> {
        self.repo.find(id)
    }
}
`
    },
    expected: [
      'get_user → User',
      'get_user → Repository',
      'UserService → Repository',
      'UserService → User',
    ]
  },

  go: {
    parser: () => new GoScopeExtractionParser(),
    files: {
      'models.go': `
package models

type User struct {
    ID   string
    Name string
}

type Entity interface {
    GetID() string
}

func (u *User) GetID() string {
    return u.ID
}

type Repository[T Entity] interface {
    Find(id string) (T, error)
    FindAll() ([]T, error)
}
`,
      'service.go': `
package service

import "myapp/models"

func GetUser(repo models.Repository[models.User]) (*models.User, error) {
    return repo.Find("1")
}

type UserService struct {
    repo models.Repository[models.User]
}

func NewUserService(repo models.Repository[models.User]) *UserService {
    return &UserService{repo: repo}
}

func (s *UserService) FindUser(id string) (*models.User, error) {
    return s.repo.Find(id)
}
`
    },
    expected: [
      'GetUser → User',
      'GetUser → Repository',
      'UserService → Repository',
      'UserService → User',
    ]
  },

  c: {
    parser: () => new CScopeExtractionParser(),
    files: {
      'models.h': `
#ifndef MODELS_H
#define MODELS_H

typedef struct {
    char* id;
    char* name;
} User;

typedef struct {
    char* id;
} BaseEntity;

typedef struct {
    User** users;
    int count;
} UserRepository;

User* create_user(const char* id, const char* name);
void free_user(User* user);

#endif
`,
      'service.c': `
#include "models.h"
#include <stdlib.h>
#include <string.h>

User* get_user_by_id(const char* id) {
    return create_user(id, "John");
}

UserRepository* create_repository() {
    UserRepository* repo = malloc(sizeof(UserRepository));
    repo->users = NULL;
    repo->count = 0;
    return repo;
}

User* find_user(UserRepository* repo, const char* id) {
    for (int i = 0; i < repo->count; i++) {
        if (strcmp(repo->users[i]->id, id) == 0) {
            return repo->users[i];
        }
    }
    return NULL;
}
`
    },
    expected: [
      'get_user_by_id → User',
      'find_user → User',
      'find_user → UserRepository',
    ]
  },

  cpp: {
    parser: () => new CppScopeExtractionParser(),
    files: {
      'models.hpp': `
#pragma once
#include <string>
#include <vector>
#include <optional>

struct User {
    std::string id;
    std::string name;
};

class BaseEntity {
public:
    virtual std::string getId() const = 0;
};

template<typename T>
class Repository {
public:
    virtual std::optional<T> find(const std::string& id) = 0;
    virtual std::vector<T> findAll() = 0;
};
`,
      'service.cpp': `
#include "models.hpp"

std::optional<User> getUser(Repository<User>& repo) {
    return repo.find("1");
}

class UserService {
private:
    Repository<User>& repo;

public:
    UserService(Repository<User>& r) : repo(r) {}

    std::optional<User> findUser(const std::string& id) {
        return repo.find(id);
    }
};
`
    },
    expected: [
      'getUser → User',
      'getUser → Repository',
      'UserService → Repository',
      'UserService → User',
      'findUser → User',
    ]
  },

  csharp: {
    parser: () => new CSharpScopeExtractionParser(),
    files: {
      'Models.cs': `
namespace MyApp.Models
{
    public class User
    {
        public string Id { get; set; }
        public string Name { get; set; }
    }

    public abstract class BaseEntity
    {
        public string Id { get; set; }
    }

    public interface IRepository<T> where T : class
    {
        T Find(string id);
        IEnumerable<T> FindAll();
    }
}
`,
      'Service.cs': `
using MyApp.Models;

namespace MyApp.Services
{
    public class UserService
    {
        private readonly IRepository<User> _repo;

        public UserService(IRepository<User> repo)
        {
            _repo = repo;
        }

        public User FindUser(string id)
        {
            return _repo.Find(id);
        }
    }

    public static class UserHelper
    {
        public static User GetUser(IRepository<User> repo)
        {
            return repo.Find("1");
        }
    }
}
`
    },
    expected: [
      'UserService → IRepository',
      'UserService → User',
      'FindUser → User',
      'GetUser → User',
      'GetUser → IRepository',
    ]
  }
};

// ============================================================================
// Test runner
// ============================================================================

async function runLanguageTest(langName, config) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${langName.toUpperCase()} - Cross-file relationships`);
  console.log('='.repeat(70));

  const langDir = path.join(TEST_DIR, langName);

  // Setup files
  console.log('\n1. Setting up test files...');
  await fs.mkdir(langDir, { recursive: true });

  for (const [filename, content] of Object.entries(config.files)) {
    const filePath = path.join(langDir, filename);
    await fs.writeFile(filePath, content.trim());
    console.log(`   Created: ${filename}`);
  }

  // Parse files
  console.log('\n2. Parsing files...');
  const parser = config.parser();
  await parser.initialize();

  const parsedFiles = new Map();
  for (const filename of Object.keys(config.files)) {
    const filePath = path.join(langDir, filename);
    const content = await fs.readFile(filePath, 'utf8');
    const analysis = await parser.parseFile(filePath, content);
    parsedFiles.set(filePath, analysis);
    console.log(`   ${filename}: ${analysis.scopes.length} scopes`);
  }

  // Resolve relationships
  console.log('\n3. Resolving relationships...');
  const resolver = new RelationshipResolver({
    projectRoot: langDir,
    defaultLanguage: langName,
    includeContains: false,
    includeInverse: false,
  });

  const result = await resolver.resolveRelationships(parsedFiles);

  // Count cross-file relationships
  const crossFile = result.relationships.filter(r => r.fromFile !== r.toFile);
  console.log(`   Cross-file relationships: ${crossFile.length}`);

  // Check expected relationships
  console.log('\n4. Expected relationships check:');
  let passed = 0;
  let failed = 0;

  for (const expected of config.expected) {
    const [from, to] = expected.split(' → ');
    const found = result.relationships.some(r =>
      r.fromName === from && r.toName === to && r.fromFile !== r.toFile
    );

    if (found) {
      console.log(`   ✓ ${expected}`);
      passed++;
    } else {
      console.log(`   ✗ ${expected} (NOT FOUND)`);
      failed++;
    }
  }

  console.log(`\n   Result: ${passed}/${config.expected.length} expected relationships found`);

  return { passed, failed, total: config.expected.length };
}

async function main() {
  console.log('All Languages - Cross-file Relationship Tests');
  console.log('='.repeat(70));

  // Clean up
  await fs.rm(TEST_DIR, { recursive: true, force: true });
  await fs.mkdir(TEST_DIR, { recursive: true });

  const results = {};

  for (const [lang, config] of Object.entries(TESTS)) {
    try {
      results[lang] = await runLanguageTest(lang, config);
    } catch (error) {
      console.error(`\n❌ ${lang} failed with error:`, error.message);
      results[lang] = { passed: 0, failed: config.expected.length, total: config.expected.length, error: true };
    }
  }

  // Summary
  console.log(`\n${'='.repeat(70)}`);
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log('\n| Language   | Passed | Failed | Total |');
  console.log('|------------|--------|--------|-------|');

  let totalPassed = 0;
  let totalFailed = 0;
  let totalTests = 0;

  for (const [lang, res] of Object.entries(results)) {
    const status = res.failed === 0 ? '✓' : '✗';
    console.log(`| ${lang.padEnd(10)} | ${String(res.passed).padStart(6)} | ${String(res.failed).padStart(6)} | ${String(res.total).padStart(5)} | ${status}`);
    totalPassed += res.passed;
    totalFailed += res.failed;
    totalTests += res.total;
  }

  console.log('|------------|--------|--------|-------|');
  console.log(`| ${'TOTAL'.padEnd(10)} | ${String(totalPassed).padStart(6)} | ${String(totalFailed).padStart(6)} | ${String(totalTests).padStart(5)} |`);

  if (totalFailed === 0) {
    console.log('\n✓ All expected relationships were found!');
  } else {
    console.log(`\n⚠️  ${totalFailed} expected relationships were NOT found.`);
  }
}

main().catch(console.error);
