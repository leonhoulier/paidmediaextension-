import fs from 'fs';
import path from 'path';

/**
 * Global teardown for the Playwright test suite.
 *
 * Clean up the patched test extension directory and runtime data file.
 */
export default async function globalTeardown(): Promise<void> {
  console.log('\n=== E2E Global Teardown ===\n');

  const TEST_EXT_DIR = path.resolve(__dirname, '.test-extension');
  const RUNTIME_DATA = path.resolve(__dirname, '.runtime-data.json');

  if (fs.existsSync(TEST_EXT_DIR)) {
    fs.rmSync(TEST_EXT_DIR, { recursive: true, force: true });
    console.log('[OK]   Removed .test-extension/');
  }

  if (fs.existsSync(RUNTIME_DATA)) {
    fs.unlinkSync(RUNTIME_DATA);
    console.log('[OK]   Removed .runtime-data.json');
  }

  console.log('\n=== Global Teardown Complete ===\n');
}
