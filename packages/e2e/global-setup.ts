import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import net from 'net';

/**
 * Global setup for the Playwright test suite.
 *
 * 1. Verify PostgreSQL (port 5432), Backend (3000), and Admin Portal (5173)
 *    are reachable.
 * 2. Copy extension/dist to .test-extension and patch manifest + service
 *    worker so the extension recognises localhost:8080 mock fixtures.
 * 3. Write runtime test-data (e.g. buyer extension token) to a JSON file
 *    readable by tests.
 */

const ROOT = path.resolve(__dirname, '../..');
const EXTENSION_DIST = path.resolve(ROOT, 'packages/extension/dist');
const TEST_EXT_DIR = path.resolve(__dirname, '.test-extension');
const RUNTIME_DATA = path.resolve(__dirname, '.runtime-data.json');

/** Check whether a TCP port is listening */
async function isPortOpen(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(2000);
    sock.on('connect', () => { sock.destroy(); resolve(true); });
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
    sock.on('error', () => { sock.destroy(); resolve(false); });
    sock.connect(port, host);
  });
}

export default async function globalSetup(): Promise<void> {
  console.log('\n=== E2E Global Setup ===\n');

  // ── 1. Service health checks ──────────────────────────────────────
  const checks: Array<{ name: string; port: number }> = [
    { name: 'PostgreSQL', port: 5432 },
    { name: 'Backend API', port: 3000 },
    { name: 'Admin Portal', port: 5173 },
  ];

  for (const { name, port } of checks) {
    const up = await isPortOpen(port);
    if (!up) {
      console.warn(`[WARN] ${name} (port ${port}) is NOT reachable. Tests that depend on it will fail.`);
    } else {
      console.log(`[OK]   ${name} (port ${port}) is up.`);
    }
  }

  // ── 2. Prepare test extension ─────────────────────────────────────
  if (fs.existsSync(TEST_EXT_DIR)) {
    fs.rmSync(TEST_EXT_DIR, { recursive: true, force: true });
  }

  // Copy dist directory
  fs.cpSync(EXTENSION_DIST, TEST_EXT_DIR, { recursive: true });
  console.log(`[OK]   Copied extension dist -> .test-extension/`);

  // Patch manifest.json – add localhost to host_permissions and web_accessible_resources
  const manifestPath = path.join(TEST_EXT_DIR, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  manifest.host_permissions = [
    ...(manifest.host_permissions ?? []),
    'http://localhost:8080/*',
    'http://localhost:3000/*',
  ];
  manifest.optional_host_permissions = [
    ...(manifest.optional_host_permissions ?? []),
    'http://localhost:8080/*',
  ];

  // Allow content scripts + CSS to be injected on localhost
  if (manifest.web_accessible_resources?.[0]) {
    manifest.web_accessible_resources[0].matches = [
      ...manifest.web_accessible_resources[0].matches,
      'http://localhost:8080/*',
    ];
  }

  // Allow connect-src to localhost in CSP
  if (manifest.content_security_policy?.extension_pages) {
    manifest.content_security_policy.extension_pages =
      manifest.content_security_policy.extension_pages.replace(
        'connect-src https://*',
        'connect-src https://* http://localhost:*'
      );
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('[OK]   Patched manifest.json for localhost testing');

  // Patch service-worker.js – add localhost platform patterns
  const swPath = path.join(TEST_EXT_DIR, 'service-worker.js');
  let sw = fs.readFileSync(swPath, 'utf-8');

  // The bundled service worker contains the PLATFORM_PATTERNS array. We
  // prepend two extra patterns that match our localhost fixture server.
  // The patterns are injected right after the existing array declaration.
  const patchCode = `
// === E2E TEST PATCH: localhost platform detection ===
(function patchPlatformPatterns() {
  // Find and extend the PLATFORM_PATTERNS array via globalThis
  if (typeof PLATFORM_PATTERNS !== 'undefined' && Array.isArray(PLATFORM_PATTERNS)) {
    PLATFORM_PATTERNS.unshift(
      { pattern: /^http:\\/\\/localhost:8080\\/meta/, platform: "meta" },
      { pattern: /^http:\\/\\/localhost:8080\\/google/, platform: "google_ads" }
    );
  }
})();
// === END E2E TEST PATCH ===
`;

  // Also override the detectPlatform function to handle localhost
  const detectPatch = `
// === E2E TEST PATCH: localhost detectPlatform override ===
var _origDetectPlatform = typeof detectPlatform === 'function' ? detectPlatform : null;
function detectPlatformPatched(url) {
  if (!url) return null;
  if (/^http:\\/\\/localhost:8080\\/meta/.test(url)) return "meta";
  if (/^http:\\/\\/localhost:8080\\/google/.test(url)) return "google_ads";
  if (_origDetectPlatform) return _origDetectPlatform(url);
  return null;
}
// === END E2E TEST PATCH ===
`;

  // Append the patches at the end of the service worker
  sw += '\n' + patchCode + '\n' + detectPatch;

  // Replace all calls to detectPlatform( with detectPlatformPatched(
  // but only in the tab listener context - use a targeted replacement
  sw = sw.replace(/detectPlatform\(tab\.url\)/g, 'detectPlatformPatched(tab.url)');
  sw = sw.replace(/detectPlatform\(url\)/g, 'detectPlatformPatched(url)');

  fs.writeFileSync(swPath, sw);
  console.log('[OK]   Patched service-worker.js for localhost platform detection');

  // ── 3. Query runtime test data ────────────────────────────────────
  // Try to find the buyer extension token from the database using a
  // simple REST call to the backend. If the backend isn't up, write
  // placeholder data; extension tests will skip gracefully.
  const runtimeData: Record<string, string> = {
    testExtensionDir: TEST_EXT_DIR,
  };

  try {
    const adminPayload = JSON.stringify({ uid: 'local-dev-user', email: 'admin1@dlg.com' });
    const adminToken = Buffer.from(adminPayload).toString('base64');

    // Fetch users to find a buyer with an extension token
    const resp = await fetch('http://localhost:3000/api/v1/admin/users', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    if (resp.ok) {
      const users = await resp.json();
      const buyer = users.find((u: { role: string; extensionToken?: string }) =>
        u.role === 'buyer' && u.extensionToken
      );
      if (buyer) {
        runtimeData.buyerExtensionToken = buyer.extensionToken;
        runtimeData.buyerEmail = buyer.email;
        runtimeData.buyerName = buyer.name;
        console.log(`[OK]   Found buyer extension token for ${buyer.email}`);
      }

      // Fetch org ID
      const orgResp = await fetch('http://localhost:3000/api/v1/admin/organizations', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (orgResp.ok) {
        const orgs = await orgResp.json();
        const acme = orgs.find((o: { slug: string }) => o.slug === 'dlg');
        if (acme) {
          runtimeData.orgId = acme.id;
          console.log(`[OK]   Found DLG org ID: ${acme.id}`);
        }
      }

      // Fetch accounts to get UUIDs
      const accResp = await fetch('http://localhost:3000/api/v1/admin/accounts', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (accResp.ok) {
        const accounts = await accResp.json();
        const metaAcc = accounts.find((a: { platformAccountId: string }) =>
          a.platformAccountId === 'act_123456'
        );
        if (metaAcc) {
          runtimeData.metaAccountId = metaAcc.id;
          console.log(`[OK]   Found Meta account UUID: ${metaAcc.id}`);
        }
      }

      // Fetch a rule set ID for CRUD tests
      const rsResp = await fetch('http://localhost:3000/api/v1/admin/rule-sets', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (rsResp.ok) {
        const ruleSets = await rsResp.json();
        if (ruleSets.length > 0) {
          runtimeData.ruleSetId = ruleSets[0].id;
          console.log(`[OK]   Found rule set UUID: ${ruleSets[0].id}`);
        }
      }
    } else {
      console.warn(`[WARN] Backend returned ${resp.status} fetching users. Extension tests may be limited.`);
    }
  } catch (err) {
    console.warn('[WARN] Could not query backend for runtime data:', (err as Error).message);
  }

  fs.writeFileSync(RUNTIME_DATA, JSON.stringify(runtimeData, null, 2));
  console.log(`[OK]   Wrote runtime data to .runtime-data.json`);

  console.log('\n=== Global Setup Complete ===\n');
}
