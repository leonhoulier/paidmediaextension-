import * as esbuild from 'esbuild';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const isProduction = args.includes('--production');
const isWatch = args.includes('--watch');
const shouldZip = args.includes('--zip');

// ── Parse --manifest flag ──────────────────────────────────────────────────────
// Usage: --manifest=manifest.prod.json
// Falls back to manifest.json when not specified.
const manifestFlag = args.find((a) => a.startsWith('--manifest='));
const manifestFile = manifestFlag ? manifestFlag.split('=')[1] : 'manifest.json';

// ── Parse --env flag ───────────────────────────────────────────────────────────
// Usage: --env=production
// Loads .env.production when set to "production", otherwise no env file is loaded.
const envFlag = args.find((a) => a.startsWith('--env='));
const envName = envFlag ? envFlag.split('=')[1] : null;

/**
 * Parse a simple .env file and return a key-value map.
 * Ignores blank lines and lines starting with #.
 */
function loadEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) {
    console.warn(`[esbuild] Warning: env file not found: ${filePath}`);
    return env;
  }
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    env[key] = value;
  }
  return env;
}

// Load environment variables if --env flag was provided
const envVars = envName ? loadEnvFile(`.env.${envName}`) : {};

const distDir = 'dist';

/**
 * Copy static assets to dist directory
 */
function copyAssets() {
  // Ensure dist directories exist
  const dirs = [
    distDir,
    path.join(distDir, 'popup'),
    path.join(distDir, 'icons'),
    path.join(distDir, 'styles'),
    path.join(distDir, 'content-scripts'),
    path.join(distDir, 'fonts'),
    path.join(distDir, 'utils'),
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Copy manifest (from the specified manifest file)
  if (!fs.existsSync(manifestFile)) {
    console.error(`[esbuild] Manifest file not found: ${manifestFile}`);
    process.exit(1);
  }
  fs.copyFileSync(manifestFile, path.join(distDir, 'manifest.json'));
  console.log(`[esbuild] Using manifest: ${manifestFile}`);

  // Copy popup HTML
  if (fs.existsSync('src/popup/popup.html')) {
    fs.copyFileSync('src/popup/popup.html', path.join(distDir, 'popup/popup.html'));
  }

  // Copy icons
  if (fs.existsSync('src/icons')) {
    const icons = fs.readdirSync('src/icons');
    for (const icon of icons) {
      fs.copyFileSync(
        path.join('src/icons', icon),
        path.join(distDir, 'icons', icon)
      );
    }
  }

  // Copy styles
  if (fs.existsSync('src/styles')) {
    const styles = fs.readdirSync('src/styles');
    for (const style of styles) {
      if (style.endsWith('.css')) {
        fs.copyFileSync(
          path.join('src/styles', style),
          path.join(distDir, 'styles', style)
        );
      }
    }
  }

  console.log('[esbuild] Assets copied to dist/');
}

/**
 * Create a .zip file for Chrome Web Store submission
 */
function createZip() {
  try {
    // Remove any existing zip first
    if (fs.existsSync('dist.zip')) {
      fs.unlinkSync('dist.zip');
    }
    execSync(`cd ${distDir} && zip -r ../dist.zip .`, { stdio: 'inherit' });

    // Report zip size
    const stats = fs.statSync('dist.zip');
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`[esbuild] Created dist.zip (${sizeMB} MB)`);

    // Check against Chrome Web Store limit (20 MB uncompressed)
    const uncompressedSize = getDirectorySize(distDir);
    const uncompressedMB = (uncompressedSize / (1024 * 1024)).toFixed(2);
    console.log(`[esbuild] Uncompressed dist/ size: ${uncompressedMB} MB`);
    if (uncompressedSize > 20 * 1024 * 1024) {
      console.warn('[esbuild] WARNING: Uncompressed size exceeds Chrome Web Store 20 MB limit!');
    } else {
      console.log('[esbuild] Size check passed (under 20 MB limit)');
    }
  } catch {
    console.error('[esbuild] Failed to create zip. Make sure zip is installed.');
    process.exit(1);
  }
}

/**
 * Recursively calculate total size of a directory in bytes.
 */
function getDirectorySize(dirPath) {
  let totalSize = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      totalSize += getDirectorySize(fullPath);
    } else {
      totalSize += fs.statSync(fullPath).size;
    }
  }
  return totalSize;
}

// ── Build esbuild define map for environment variable injection ─────────────

// Build a `define` map so that references like `process.env.VITE_API_BASE_URL`
// get replaced at build time with their values from the .env file.
const define = {};
for (const [key, value] of Object.entries(envVars)) {
  define[`process.env.${key}`] = JSON.stringify(value);
}

// Always inject instrumentation env vars (from system env or .env file)
// These are used by Sentry, PostHog, and Split.io in the extension.
const instrumentationKeys = ['SENTRY_DSN', 'POSTHOG_API_KEY', 'POSTHOG_HOST', 'SPLITIO_API_KEY', 'NODE_ENV'];
for (const key of instrumentationKeys) {
  const defineKey = `process.env.${key}`;
  if (!define[defineKey]) {
    define[defineKey] = JSON.stringify(process.env[key] ?? '');
  }
}

/**
 * Shared esbuild options
 */
const commonOptions = {
  bundle: true,
  minify: isProduction,
  sourcemap: isProduction ? false : 'inline',
  target: 'chrome120',
  logLevel: 'info',
  define,
};

/**
 * Build the service worker (ES module format for MV3)
 */
const serviceWorkerConfig = {
  ...commonOptions,
  entryPoints: ['src/service-worker.ts'],
  outfile: path.join(distDir, 'service-worker.js'),
  format: 'esm',
};

/**
 * Build content scripts (IIFE for injection into page context)
 */
const contentScriptsConfig = {
  ...commonOptions,
  entryPoints: [
    'src/content-scripts/injector.ts',
    'src/content-scripts/eval-bridge.ts',
  ],
  outdir: path.join(distDir, 'content-scripts'),
  format: 'iife',
};

/**
 * Build popup script
 */
const popupConfig = {
  ...commonOptions,
  entryPoints: ['src/popup/popup.ts'],
  outfile: path.join(distDir, 'popup/popup.js'),
  format: 'iife',
};

/**
 * Build utilities (for dynamic imports from popup)
 */
const utilsConfig = {
  ...commonOptions,
  entryPoints: ['src/utils/telemetry.ts'],
  outfile: path.join(distDir, 'utils/telemetry.js'),
  format: 'esm', // ESM format for dynamic imports
};

async function build() {
  // Clean dist
  fs.rmSync(distDir, { recursive: true, force: true });

  // Copy static assets first
  copyAssets();

  if (isWatch) {
    // Watch mode for development
    const contexts = await Promise.all([
      esbuild.context(serviceWorkerConfig),
      esbuild.context(contentScriptsConfig),
      esbuild.context(popupConfig),
      esbuild.context(utilsConfig),
    ]);

    await Promise.all(contexts.map((ctx) => ctx.watch()));
    console.log('[esbuild] Watching for changes...');
  } else {
    // Production build
    await Promise.all([
      esbuild.build(serviceWorkerConfig),
      esbuild.build(contentScriptsConfig),
      esbuild.build(popupConfig),
      esbuild.build(utilsConfig),
    ]);

    console.log(`[esbuild] Build complete (${isProduction ? 'production' : 'development'})`);

    if (shouldZip) {
      createZip();
    }
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
