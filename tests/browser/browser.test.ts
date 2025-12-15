/**
 * Browser test for WasmLoader using Playwright
 *
 * Run with: npx tsx tests/browser/browser.test.ts
 */
import { chromium, Browser, Page } from 'playwright';
import { createServer, Server } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = join(__dirname, '../..');

// MIME types for serving files
const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.wasm': 'application/wasm',
  '.css': 'text/css',
  '.json': 'application/json',
};

// Create a simple HTTP server to serve test files
function createTestServer(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = req.url || '/';
      let filePath: string;

      if (url === '/') {
        filePath = join(__dirname, 'test-page.html');
      } else {
        // Serve files from project root
        filePath = join(projectRoot, url);
      }

      try {
        const content = await readFile(filePath);
        const ext = extname(filePath);
        const contentType = mimeTypes[ext] || 'application/octet-stream';

        res.writeHead(200, {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*'
        });
        res.end(content);
      } catch (error) {
        console.error(`404: ${url} (${filePath})`);
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(port, () => {
      console.log(`Test server running on http://localhost:${port}`);
      resolve(server);
    });

    server.on('error', reject);
  });
}

async function runBrowserTests(): Promise<boolean> {
  let server: Server | null = null;
  let browser: Browser | null = null;

  try {
    // Start test server
    const port = 3456;
    server = await createTestServer(port);

    // Launch browser
    console.log('Launching browser...');
    browser = await chromium.launch({ headless: true });
    const page: Page = await browser.newPage();

    // Enable console logging from browser
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error') {
        console.error('[Browser]', text);
      } else {
        console.log('[Browser]', text);
      }
    });

    // Navigate to test page
    console.log('Loading test page...');
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' });

    // Wait for tests to complete (max 30 seconds)
    console.log('Waiting for tests to complete...');
    await page.waitForFunction(
      () => document.body.dataset.testComplete === 'true',
      { timeout: 30000 }
    );

    // Get results
    const testsPassed = await page.evaluate(() => document.body.dataset.testsPassed === 'true');
    const testResults = await page.evaluate(() => {
      try {
        return JSON.parse(document.body.dataset.testResults || '[]');
      } catch {
        return [];
      }
    });
    const testError = await page.evaluate(() => document.body.dataset.testError);

    // Display results
    console.log('\n--- Browser Test Results ---');
    if (testError) {
      console.error('Error:', testError);
    }

    for (const result of testResults as Array<{ message: string; success: boolean }>) {
      console.log(result.success ? '✓' : '✗', result.message);
    }

    console.log('\n' + (testsPassed ? '✓ All browser tests passed!' : '✗ Some browser tests failed'));

    return testsPassed;

  } finally {
    // Cleanup
    if (browser) {
      await browser.close();
    }
    if (server) {
      server.close();
    }
  }
}

// Run tests
runBrowserTests()
  .then(passed => {
    process.exit(passed ? 0 : 1);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
