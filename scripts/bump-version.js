/**
 * Bump the app version and propagate it to the visible footer.
 *
 * package.json is the single source of truth; this script also updates the
 * "Training plan calendar generator vX.Y.Z" footer in index.html / calendar.html.
 *
 * Usage:
 *   node scripts/bump-version.js            # patch bump (1.0.0 -> 1.0.1)
 *   node scripts/bump-version.js minor      # 1.0.0 -> 1.1.0
 *   node scripts/bump-version.js major      # 1.0.0 -> 2.0.0
 *   node scripts/bump-version.js 2.4.1      # set an exact version
 *
 * Called automatically before each commit by scripts/git-hooks/pre-commit.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PKG = path.join(ROOT, 'package.json');
const HTML_FILES = [
  path.join(ROOT, 'webapp', 'index.html'),
  path.join(ROOT, 'webapp', 'calendar.html')
];

function nextVersion(current, arg) {
  const parts = current.split('.').map(n => parseInt(n, 10));
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Unparseable version in package.json: ${current}`);
  }
  if (!arg || arg === 'patch') return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  if (arg === 'minor') return `${parts[0]}.${parts[1] + 1}.0`;
  if (arg === 'major') return `${parts[0] + 1}.0.0`;
  if (/^\d+\.\d+\.\d+$/.test(arg)) return arg;
  throw new Error(`Unknown bump argument: ${arg}`);
}

const arg = process.argv[2] || 'patch';
const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
const oldVersion = pkg.version;
const newVersion = nextVersion(oldVersion, arg);

if (newVersion === oldVersion) {
  console.log(`Version unchanged: ${oldVersion}`);
  process.exit(0);
}

pkg.version = newVersion;
fs.writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n');

const footerRe = /Training plan calendar generator(?: v\d+\.\d+\.\d+)?/g;
for (const file of HTML_FILES) {
  const rel = path.relative(ROOT, file);
  const html = fs.readFileSync(file, 'utf8');
  const next = html.replace(footerRe, `Training plan calendar generator v${newVersion}`);
  if (next === html) {
    console.warn(`WARN: footer string not found in ${rel}`);
  } else {
    fs.writeFileSync(file, next);
  }
}

console.log(`Version ${oldVersion} -> ${newVersion}`);
