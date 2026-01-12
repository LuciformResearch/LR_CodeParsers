import { WasmLoader } from './src/wasm/index.js';

const csharpCode = `
using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace MyApp.Services
{
    public interface IUserService
    {
        User GetUser(int id);
        Task<List<User>> GetAllUsersAsync();
    }

    public class UserService : IUserService
    {
        private readonly ILogger<UserService> _logger;
        private readonly DbContext _context;

        public UserService(ILogger<UserService> logger, DbContext context)
        {
            _logger = logger;
            _context = context;
        }

        public User GetUser(int id)
        {
            return _context.Users.Find(id);
        }

        public async Task<List<User>> GetAllUsersAsync()
        {
            return await _context.Users.ToListAsync();
        }

        private void LogMessage(string message) => _logger.LogInfo(message);
    }

    public record UserDto(string Name, string Email);

    public enum UserRole
    {
        Admin,
        User,
        Guest
    }

    public struct Point
    {
        public int X { get; set; }
        public int Y { get; set; }
    }

    public static class Extensions
    {
        public static string ToJson<T>(this T obj) => JsonConvert.SerializeObject(obj);
    }
}
`;

function printTree(node: any, content: string, indent = 0, maxDepth = 6) {
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
  console.log('='.repeat(70));
  console.log('C# AST Analysis');
  console.log('='.repeat(70));

  try {
    const { parser } = await WasmLoader.loadParser('csharp');
    const tree = parser.parse(csharpCode);
    printTree(tree.rootNode, csharpCode);
  } catch (err: any) {
    console.log('Error: ' + err.message);
  }
}

test();
