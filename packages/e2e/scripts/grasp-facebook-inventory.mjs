import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_EXTENSION_ROOT = path.join(
  process.env.HOME ?? '',
  'Library/Application Support/Google/Chrome/Default/Extensions/gnncjalmnfmdilagegplkkckngolohof',
);

const configuredPath = process.env.GRASP_EXTENSION_DIR || process.argv[2] || DEFAULT_EXTENSION_ROOT;
const extensionDir = resolveExtensionDir(configuredPath);
const manifestPath = path.join(extensionDir, 'manifest.json');
const facebookBundlePath = path.join(extensionDir, 'js/virtual_world-content_facebook.js');
const ourMetaFieldsPath = path.join(
  ROOT,
  'packages/extension/src/adapters/meta/meta-fields.ts',
);

if (!fs.existsSync(manifestPath)) {
  throw new Error(`Manifest not found at ${manifestPath}`);
}

if (!fs.existsSync(facebookBundlePath)) {
  throw new Error(`Facebook bundle not found at ${facebookBundlePath}`);
}

if (!fs.existsSync(ourMetaFieldsPath)) {
  throw new Error(`Our Meta field list not found at ${ourMetaFieldsPath}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const bundle = fs.readFileSync(facebookBundlePath, 'utf8');
const ourMetaFieldsSource = fs.readFileSync(ourMetaFieldsPath, 'utf8');

const inventory = {
  extensionDir,
  version: manifest.version ?? null,
  routes: extractRoutes(bundle),
  fieldRefs: extractFieldRefs(bundle),
  getters: extractSignals(bundle, 'get'),
  mutations: extractSignals(bundle, 'set'),
  ourMetaFieldPaths: extractOurMetaFieldPaths(ourMetaFieldsSource),
};

console.log(JSON.stringify(inventory, null, 2));

function resolveExtensionDir(inputPath) {
  if (!inputPath) {
    throw new Error('Missing Grasp extension directory path.');
  }

  const stats = fs.statSync(inputPath, { throwIfNoEntry: false });
  if (!stats) {
    throw new Error(`Path does not exist: ${inputPath}`);
  }

  if (stats.isFile()) {
    return path.dirname(inputPath);
  }

  const manifestCandidate = path.join(inputPath, 'manifest.json');
  if (fs.existsSync(manifestCandidate)) {
    return inputPath;
  }

  const versionDirs = fs
    .readdirSync(inputPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareVersionish)
    .reverse();

  const versionDir = versionDirs.find((name) =>
    fs.existsSync(path.join(inputPath, name, 'manifest.json')),
  );

  if (!versionDir) {
    throw new Error(`Could not find a versioned Grasp extension directory inside ${inputPath}`);
  }

  return path.join(inputPath, versionDir);
}

function compareVersionish(a, b) {
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function extractRoutes(source) {
  const routes = [];
  for (const match of source.matchAll(/path:`([^`]+adsmanager[^`]+)`/g)) {
    routes.push(match[1]);
  }

  return uniqueSorted(routes);
}

function extractFieldRefs(source) {
  const refs = [];
  for (const match of source.matchAll(
    /(?:Campaigns|Adsets|Ads|Audiences|InstantForms|Report)\.[A-Za-z0-9_]+/g,
  )) {
    refs.push(match[0]);
  }

  return uniqueSorted(refs);
}

function extractSignals(source, prefix) {
  const raw = [];
  const pattern = new RegExp(`${prefix}([A-Z][A-Za-z0-9]+)`, 'g');

  for (const match of source.matchAll(pattern)) {
    raw.push(`${prefix}${match[1]}`);
  }

  return uniqueSorted(
    raw.filter((value) =>
      /Campaign|Adset|Ad[A-Z]|Audience|Budget|Objective|Placement|Page|Instagram|Url|ViewTags|Locale|Language|Gender|Age|Frequency|Schedule|PerformanceGoal|Geo|Targeting|Cta|Creative|Status|SpendCap|BuyingType|ProductSet|PostType|PromoCode|Beneficiary|Partnership|Pixel|Name/.test(
        value,
      ),
    ),
  );
}

function extractOurMetaFieldPaths(source) {
  const match = source.match(
    /const FIELD_GETTERS: Record<string, \(\) => unknown> = \{([\s\S]*?)\n\};/,
  );

  if (!match) {
    throw new Error('Could not locate FIELD_GETTERS in our Meta field source.');
  }

  const fields = [];
  for (const fieldMatch of match[1].matchAll(/'([^']+)':/g)) {
    fields.push(fieldMatch[1]);
  }

  return uniqueSorted(fields);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
