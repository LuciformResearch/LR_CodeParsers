/**
 * Test RelationshipResolver with all supported languages
 *
 * Tests: TypeScript, Python, Rust, Go, C, C++, C#
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import from compiled dist
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

// Test files directory
const TEST_DIR = '/tmp/codeparsers-relationship-tests';

// ============================================================================
// Test Files for each language
// ============================================================================

const TEST_FILES = {
  // TypeScript - Multiple files with cross-references
  typescript: {
    'base.ts': `
export interface Logger {
  log(message: string): void;
  error(message: string): void;
}

export abstract class BaseService {
  protected logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  abstract process(): void;
}

export function createLogger(): Logger {
  return {
    log: (msg) => console.log(msg),
    error: (msg) => console.error(msg)
  };
}
`,
    'user-service.ts': `
import { BaseService, Logger, createLogger } from './base';

export class UserService extends BaseService {
  private users: Map<string, User> = new Map();

  constructor(logger: Logger) {
    super(logger);
  }

  process(): void {
    this.logger.log('Processing users');
  }

  addUser(user: User): void {
    this.users.set(user.id, user);
  }
}

export interface User {
  id: string;
  name: string;
}

export class AdminService extends UserService {
  constructor() {
    super(createLogger());
  }

  process(): void {
    this.logger.log('Admin processing');
  }
}
`,
    'index.ts': `
export { UserService, AdminService, User } from './user-service';
export { BaseService, Logger, createLogger } from './base';
`
  },

  // Python - Multiple files with imports
  python: {
    'base.py': `
from abc import ABC, abstractmethod
from typing import Optional

class Logger:
    """Base logger class"""
    def log(self, message: str) -> None:
        print(f"LOG: {message}")

    def error(self, message: str) -> None:
        print(f"ERROR: {message}")

class BaseService(ABC):
    """Abstract base service"""
    def __init__(self, logger: Logger):
        self.logger = logger

    @abstractmethod
    def process(self) -> None:
        pass

def create_logger() -> Logger:
    return Logger()
`,
    'user_service.py': `
from base import BaseService, Logger, create_logger
from dataclasses import dataclass
from typing import Dict

@dataclass
class User:
    id: str
    name: str

class UserService(BaseService):
    """User management service"""
    def __init__(self, logger: Logger):
        super().__init__(logger)
        self.users: Dict[str, User] = {}

    def process(self) -> None:
        self.logger.log("Processing users")

    def add_user(self, user: User) -> None:
        self.users[user.id] = user

class AdminService(UserService):
    """Admin service with elevated privileges"""
    def __init__(self):
        super().__init__(create_logger())

    def process(self) -> None:
        self.logger.log("Admin processing")
`
  },

  // Rust - Multiple files with mod and use
  rust: {
    'lib.rs': `
pub mod base;
pub mod user_service;

pub use base::{Logger, BaseService};
pub use user_service::{User, UserService};
`,
    'base.rs': `
pub trait Logger {
    fn log(&self, message: &str);
    fn error(&self, message: &str);
}

pub struct ConsoleLogger;

impl Logger for ConsoleLogger {
    fn log(&self, message: &str) {
        println!("LOG: {}", message);
    }

    fn error(&self, message: &str) {
        eprintln!("ERROR: {}", message);
    }
}

pub trait BaseService {
    fn process(&self);
}

pub fn create_logger() -> impl Logger {
    ConsoleLogger
}
`,
    'user_service.rs': `
use crate::base::{Logger, BaseService, create_logger};
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct User {
    pub id: String,
    pub name: String,
}

pub struct UserService<L: Logger> {
    logger: L,
    users: HashMap<String, User>,
}

impl<L: Logger> UserService<L> {
    pub fn new(logger: L) -> Self {
        Self {
            logger,
            users: HashMap::new(),
        }
    }

    pub fn add_user(&mut self, user: User) {
        self.users.insert(user.id.clone(), user);
    }
}

impl<L: Logger> BaseService for UserService<L> {
    fn process(&self) {
        self.logger.log("Processing users");
    }
}
`
  },

  // Go - Multiple files with package imports
  go: {
    'base.go': `
package myapp

import "fmt"

type Logger interface {
	Log(message string)
	Error(message string)
}

type ConsoleLogger struct{}

func (l *ConsoleLogger) Log(message string) {
	fmt.Println("LOG:", message)
}

func (l *ConsoleLogger) Error(message string) {
	fmt.Println("ERROR:", message)
}

type BaseService interface {
	Process()
}

func CreateLogger() Logger {
	return &ConsoleLogger{}
}
`,
    'user_service.go': `
package myapp

type User struct {
	ID   string
	Name string
}

type UserService struct {
	logger Logger
	users  map[string]*User
}

func NewUserService(logger Logger) *UserService {
	return &UserService{
		logger: logger,
		users:  make(map[string]*User),
	}
}

func (s *UserService) Process() {
	s.logger.Log("Processing users")
}

func (s *UserService) AddUser(user *User) {
	s.users[user.ID] = user
}

type AdminService struct {
	UserService
}

func NewAdminService() *AdminService {
	return &AdminService{
		UserService: *NewUserService(CreateLogger()),
	}
}
`
  },

  // C - Multiple files with includes
  c: {
    'base.h': `
#ifndef BASE_H
#define BASE_H

typedef struct {
    void (*log)(const char* message);
    void (*error)(const char* message);
} Logger;

typedef struct {
    Logger* logger;
} BaseService;

Logger* create_logger(void);
void init_base_service(BaseService* service, Logger* logger);

#endif
`,
    'base.c': `
#include <stdio.h>
#include <stdlib.h>
#include "base.h"

static void console_log(const char* message) {
    printf("LOG: %s\\n", message);
}

static void console_error(const char* message) {
    fprintf(stderr, "ERROR: %s\\n", message);
}

Logger* create_logger(void) {
    Logger* logger = malloc(sizeof(Logger));
    logger->log = console_log;
    logger->error = console_error;
    return logger;
}

void init_base_service(BaseService* service, Logger* logger) {
    service->logger = logger;
}
`,
    'user_service.h': `
#ifndef USER_SERVICE_H
#define USER_SERVICE_H

#include "base.h"

typedef struct {
    char* id;
    char* name;
} User;

typedef struct {
    BaseService base;
    User** users;
    int user_count;
} UserService;

UserService* create_user_service(Logger* logger);
void add_user(UserService* service, User* user);
void process_users(UserService* service);

#endif
`,
    'user_service.c': `
#include <stdlib.h>
#include "user_service.h"

UserService* create_user_service(Logger* logger) {
    UserService* service = malloc(sizeof(UserService));
    init_base_service(&service->base, logger);
    service->users = NULL;
    service->user_count = 0;
    return service;
}

void add_user(UserService* service, User* user) {
    service->user_count++;
    service->users = realloc(service->users, sizeof(User*) * service->user_count);
    service->users[service->user_count - 1] = user;
}

void process_users(UserService* service) {
    service->base.logger->log("Processing users");
}
`
  },

  // C++ - Multiple files with classes
  cpp: {
    'base.hpp': `
#pragma once
#include <string>
#include <memory>

class Logger {
public:
    virtual ~Logger() = default;
    virtual void log(const std::string& message) = 0;
    virtual void error(const std::string& message) = 0;
};

class ConsoleLogger : public Logger {
public:
    void log(const std::string& message) override;
    void error(const std::string& message) override;
};

class BaseService {
protected:
    std::shared_ptr<Logger> logger;

public:
    explicit BaseService(std::shared_ptr<Logger> logger);
    virtual ~BaseService() = default;
    virtual void process() = 0;
};

std::shared_ptr<Logger> createLogger();
`,
    'base.cpp': `
#include "base.hpp"
#include <iostream>

void ConsoleLogger::log(const std::string& message) {
    std::cout << "LOG: " << message << std::endl;
}

void ConsoleLogger::error(const std::string& message) {
    std::cerr << "ERROR: " << message << std::endl;
}

BaseService::BaseService(std::shared_ptr<Logger> logger)
    : logger(std::move(logger)) {}

std::shared_ptr<Logger> createLogger() {
    return std::make_shared<ConsoleLogger>();
}
`,
    'user_service.hpp': `
#pragma once
#include "base.hpp"
#include <map>

struct User {
    std::string id;
    std::string name;
};

class UserService : public BaseService {
private:
    std::map<std::string, User> users;

public:
    explicit UserService(std::shared_ptr<Logger> logger);
    void process() override;
    void addUser(const User& user);
};

class AdminService : public UserService {
public:
    AdminService();
    void process() override;
};
`,
    'user_service.cpp': `
#include "user_service.hpp"

UserService::UserService(std::shared_ptr<Logger> logger)
    : BaseService(std::move(logger)) {}

void UserService::process() {
    logger->log("Processing users");
}

void UserService::addUser(const User& user) {
    users[user.id] = user;
}

AdminService::AdminService()
    : UserService(createLogger()) {}

void AdminService::process() {
    logger->log("Admin processing");
}
`
  },

  // C# - Multiple files with namespaces
  csharp: {
    'Base.cs': `
namespace MyApp.Core
{
    public interface ILogger
    {
        void Log(string message);
        void Error(string message);
    }

    public class ConsoleLogger : ILogger
    {
        public void Log(string message)
        {
            Console.WriteLine($"LOG: {message}");
        }

        public void Error(string message)
        {
            Console.Error.WriteLine($"ERROR: {message}");
        }
    }

    public abstract class BaseService
    {
        protected ILogger Logger { get; }

        protected BaseService(ILogger logger)
        {
            Logger = logger;
        }

        public abstract void Process();
    }

    public static class LoggerFactory
    {
        public static ILogger CreateLogger() => new ConsoleLogger();
    }
}
`,
    'UserService.cs': `
using MyApp.Core;
using System.Collections.Generic;

namespace MyApp.Services
{
    public record User(string Id, string Name);

    public class UserService : BaseService
    {
        private readonly Dictionary<string, User> _users = new();

        public UserService(ILogger logger) : base(logger)
        {
        }

        public override void Process()
        {
            Logger.Log("Processing users");
        }

        public void AddUser(User user)
        {
            _users[user.Id] = user;
        }
    }

    public class AdminService : UserService
    {
        public AdminService() : base(LoggerFactory.CreateLogger())
        {
        }

        public override void Process()
        {
            Logger.Log("Admin processing");
        }
    }
}
`
  }
};

// ============================================================================
// Test Runner
// ============================================================================

async function setupTestFiles() {
  console.log('Setting up test files...\n');

  // Create test directory
  await fs.mkdir(TEST_DIR, { recursive: true });

  // Create subdirectories and files for each language
  for (const [lang, files] of Object.entries(TEST_FILES)) {
    const langDir = path.join(TEST_DIR, lang);
    await fs.mkdir(langDir, { recursive: true });

    for (const [filename, content] of Object.entries(files)) {
      const filePath = path.join(langDir, filename);
      await fs.writeFile(filePath, content.trim());
      console.log(`  Created: ${lang}/${filename}`);
    }
  }

  console.log('\n');
}

function getParserForLanguage(lang) {
  switch (lang) {
    case 'typescript':
      return new ScopeExtractionParser();
    case 'python':
      return new PythonScopeExtractionParser();
    case 'rust':
      return new RustScopeExtractionParser();
    case 'go':
      return new GoScopeExtractionParser();
    case 'c':
      return new CScopeExtractionParser();
    case 'cpp':
      return new CppScopeExtractionParser();
    case 'csharp':
      return new CSharpScopeExtractionParser();
    default:
      throw new Error(`Unknown language: ${lang}`);
  }
}

async function testLanguage(lang, files) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${lang.toUpperCase()}`);
  console.log('='.repeat(60));

  const parser = getParserForLanguage(lang);
  const langDir = path.join(TEST_DIR, lang);
  const parsedFiles = new Map();

  // Parse all files
  console.log('\n1. Parsing files...');
  for (const filename of Object.keys(files)) {
    const filePath = path.join(langDir, filename);
    const content = await fs.readFile(filePath, 'utf8');

    try {
      // Note: parseFile signature is (filePath, content, resolver?)
      const analysis = await parser.parseFile(filePath, content);
      parsedFiles.set(filePath, analysis);
      console.log(`   ${filename}: ${analysis.scopes.length} scopes`);
    } catch (error) {
      console.error(`   ${filename}: ERROR - ${error.message}`);
    }
  }

  // Resolve relationships
  console.log('\n2. Resolving relationships...');
  const resolver = new RelationshipResolver({
    projectRoot: langDir,
    defaultLanguage: lang === 'cpp' ? 'cpp' : lang,
    includeContains: true,
    includeInverse: true,
    includeDecorators: true,
    debug: false,
  });

  const result = await resolver.resolveRelationships(parsedFiles);

  // Print statistics
  console.log('\n3. Statistics:');
  console.log(`   Total scopes: ${result.stats.totalScopes}`);
  console.log(`   Total relationships: ${result.stats.totalRelationships}`);
  console.log(`   Unresolved references: ${result.stats.unresolvedCount}`);
  console.log(`   Resolution time: ${result.stats.resolutionTimeMs}ms`);

  console.log('\n   By type:');
  for (const [type, count] of Object.entries(result.stats.byType)) {
    console.log(`     ${type}: ${count}`);
  }

  // Print relationships
  console.log('\n4. Relationships:');
  const relsByType = {};
  for (const rel of result.relationships) {
    if (!relsByType[rel.type]) relsByType[rel.type] = [];
    relsByType[rel.type].push(rel);
  }

  for (const [type, rels] of Object.entries(relsByType)) {
    console.log(`\n   ${type}:`);
    for (const rel of rels.slice(0, 10)) { // Limit to 10 per type
      const fromFile = path.basename(rel.fromFile);
      const toFile = path.basename(rel.toFile);
      console.log(`     ${rel.fromName} (${fromFile}) → ${rel.toName} (${toFile})`);
    }
    if (rels.length > 10) {
      console.log(`     ... and ${rels.length - 10} more`);
    }
  }

  // Print unresolved references
  if (result.unresolvedReferences.length > 0) {
    console.log('\n5. Unresolved references:');
    for (const unres of result.unresolvedReferences.slice(0, 5)) {
      console.log(`   ${unres.fromScope} → ${unres.identifier} (${unres.reason})`);
    }
    if (result.unresolvedReferences.length > 5) {
      console.log(`   ... and ${result.unresolvedReferences.length - 5} more`);
    }
  }

  return result;
}

async function main() {
  console.log('RelationshipResolver Test Suite');
  console.log('================================\n');

  // Setup test files
  await setupTestFiles();

  // Test each language
  const results = {};
  for (const [lang, files] of Object.entries(TEST_FILES)) {
    try {
      results[lang] = await testLanguage(lang, files);
    } catch (error) {
      console.error(`\nERROR testing ${lang}: ${error.message}`);
      console.error(error.stack);
    }
  }

  // Summary
  console.log('\n\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log('\n| Language   | Scopes | Relations | Unresolved | Time (ms) |');
  console.log('|------------|--------|-----------|------------|-----------|');

  for (const [lang, result] of Object.entries(results)) {
    if (result) {
      const s = result.stats;
      console.log(`| ${lang.padEnd(10)} | ${String(s.totalScopes).padStart(6)} | ${String(s.totalRelationships).padStart(9)} | ${String(s.unresolvedCount).padStart(10)} | ${String(s.resolutionTimeMs).padStart(9)} |`);
    } else {
      console.log(`| ${lang.padEnd(10)} | ERROR  |           |            |           |`);
    }
  }

  console.log('\n');
}

main().catch(console.error);
