/**
 * Path utilities for import resolution
 */

import path from 'path';

/**
 * Regex to match both Unix and Windows path separators
 */
export const PATH_SEP_REGEX = /[\\/]/;

/**
 * Check if a path/import is local (relative or absolute file path)
 *
 * @example
 * isLocalPath('./utils')          // true (relative)
 * isLocalPath('../lib')           // true (relative parent)
 * isLocalPath('/home/user/lib')   // true (absolute Unix)
 * isLocalPath('C:\\lib')          // true (absolute Windows)
 * isLocalPath('lodash')           // false (package)
 * isLocalPath('@scope/package')   // false (scoped package)
 */
export function isLocalPath(p: string): boolean {
  return p.startsWith('.') || path.isAbsolute(p);
}

/**
 * Check if a path looks like a relative path (starts with . or ..)
 */
export function isRelativePath(p: string): boolean {
  return p.startsWith('./') || p.startsWith('../') || p === '.' || p === '..';
}

/**
 * Normalize path separators to Unix style (forward slashes)
 */
export function toUnixPath(p: string): string {
  return p.split(PATH_SEP_REGEX).join('/');
}
