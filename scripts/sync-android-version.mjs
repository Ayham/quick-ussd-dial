/**
 * Sync the Android versionCode / versionName from package.json version.
 *
 * versionCode formula (matches existing values, e.g. 1.0.6 -> 1000006):
 *   versionCode = major * 1_000_000 + minor * 1_000 + patch
 *
 * Usage:
 *   node scripts/sync-android-version.mjs            # sync from package.json
 *   node scripts/sync-android-version.mjs 1.0.7      # bump package.json then sync
 *   node scripts/sync-android-version.mjs --dry-run  # preview only
 *
 * Idempotent + safe to re-run: only rewrites the line when the value changes.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PACKAGE_JSON = resolve(ROOT, "package.json");
const BUILD_GRADLE = resolve(ROOT, "android", "app", "build.gradle");

const VERSION_RE = /^(\s*)versionName\s+"([^"]+)"(.*?)$/;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function computeVersionCode(version) {
  const [major, minor, patch] = version.split(".").map((n) => Number.parseInt(n, 10) || 0);
  return major * 1000000 + minor * 1000 + patch;
}

export function syncAndroidVersion({ bumpVersion, dryRun } = {}) {
  const pkg = readJson(PACKAGE_JSON);
  const version = bumpVersion ?? pkg.version;

  if (!/^\d+\.\d+\.\d+/.test(version)) {
    throw new Error(`Unsupported package.json version "${version}" (expected semver).`);
  }

  const versionCode = computeVersionCode(version);

  if (!existsSync(BUILD_GRADLE)) {
    throw new Error(`Could not find ${BUILD_GRADLE}`);
  }

  const original = readFileSync(BUILD_GRADLE, "utf8");
  const lines = original.split("\n");

  let changedLines = 0;
  const out = lines.map((line) => {
    if (/^\s*versionCode\s+\d+/.test(line)) {
      const next = line.replace(/^(\s*versionCode\s+)\d+/, (_m, indent) => `${indent}${versionCode}`);
      if (next !== line) changedLines++;
      return next;
    }
    if (VERSION_RE.test(line)) {
      const next = line.replace(VERSION_RE, (_m, indent, _old, rest) => `${indent}versionName "${version}"${rest}`);
      if (next !== line) changedLines++;
      return next;
    }
    return line;
  });

  const report = {
    version,
    versionCode,
    changedLines,
    packageJsonPath: PACKAGE_JSON,
    buildGradlePath: BUILD_GRADLE,
    dryRun,
  };

  if (changedLines > 0 && !dryRun) {
    writeFileSync(BUILD_GRADLE, out.join("\n"), "utf8");
  }

  if (bumpVersion !== undefined && bumpVersion !== pkg.version) {
    if (!dryRun) {
      pkg.version = version;
      writeFileSync(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + "\n", "utf8");
    }
    report.packageJsonBumped = true;
  }

  return report;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { bumpVersion: undefined, dryRun: false };
  for (const a of args) {
    if (a === "--dry-run" || a === "-n") opts.dryRun = true;
    else if (a.startsWith("--")) throw new Error(`Unknown flag ${a}`);
    else opts.bumpVersion = a;
  }
  return opts;
}

function main() {
  const { bumpVersion, dryRun } = parseArgs(process.argv);
  try {
    const result = syncAndroidVersion({ bumpVersion, dryRun });
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
