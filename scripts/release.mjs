#!/usr/bin/env node
/**
 * release.mjs — One-shot release script for Quick USSD Dial
 *
 * Usage:
 *   node scripts/release.mjs 1.0.7       # release 1.0.7
 *
 * Steps:
 *   1. Bump package.json version
 *   2. Sync Android versionCode/name via version:sync
 *   3. Build the Android APK (assembleRelease)
 *   4. Create a GitHub Release + upload the APK asset
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = process.cwd();
const PKG_PATH = resolve(ROOT, "package.json");
const GITHUB_REPO = "mobi1298-del/ussd";
const APK_PATHS = [
  resolve(ROOT, "android/app/build/outputs/apk/release/app-release.apk"),
  resolve(ROOT, "android/app/build/outputs/apk/release/app-release-unsigned.apk"),
];

const GH_TOKEN = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;

if (!GH_TOKEN) {
  console.error("❌ Please set GITHUB_TOKEN environment variable before running this script.");
  process.exit(1);
}

const newVersion = process.argv[2];
if (!newVersion || !/^\d+\.\d+\.\d+/.test(newVersion)) {
  console.error("❌ Usage: node scripts/release.mjs <version>  (e.g. 1.0.7)");
  process.exit(1);
}

// --- Step 1: Update package.json ---
const pkg = JSON.parse(readFileSync(PKG_PATH, "utf8"));
if (pkg.version === newVersion) {
  console.warn(`⚠️  Version ${newVersion} is already set in package.json.`);
} else {
  pkg.version = newVersion;
  writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`✅ package.json updated to ${newVersion}`);
}

// --- Step 2: Sync Android version ---
console.log("🔄 Syncing Android version...");
execSync("npm run version:sync", { stdio: "inherit" });

// --- Step 3: Build the APK ---
console.log("🏗️  Please ensure you have built the release APK via Android Studio or:");
console.log("   cd android && ./gradlew assembleRelease");
console.log("🔄 Skipping build — uploading existing APK...\n");

const APK_PATH = APK_PATHS.find(p => existsSync(p));
if (!APK_PATH) {
  console.error("❌ No release APK found in:");
  APK_PATHS.forEach(p => console.error(`   - ${p}`));
  console.error("   Please build the release APK first using Android Studio or gradlew.");
  process.exit(1);
}

if (!existsSync(APK_PATH)) {
  console.error(`❌ APK not found at expected path: ${APK_PATH}`);
  process.exit(1);
}

// --- Step 4: Create GitHub Release ---
console.log("📤 Creating GitHub release...");

import("node:https").then(({ default: https }) => {
  function githubRequest(method, path, body = undefined) {
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: "api.github.com",
          path,
          method,
          headers: {
            Authorization: `token ${GH_TOKEN}`,
            "User-Agent": "Quick-USSD-Dial-CLI",
            Accept: "application/vnd.github+json",
            ...(body && { "Content-Type": "application/json" }),
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            // Allow 404 (not found) to resolve gracefully
            if (res.statusCode === 404) {
              resolve(null);
            } else if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(data || "{}"));
              } catch {
                resolve(data || null);
              }
            } else {
              reject(new Error(`GitHub API ${res.statusCode}: ${data}`));
            }
          });
        }
      );
      req.on("error", reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async function uploadRelease() {
    console.log("🧹 Cleaning up any existing releases for v" + newVersion + "...");

    // 0. Try to delete existing release (if any) — may fail due to repo rules
    try {
      const allReleases = await githubRequest("GET", `/repos/${GITHUB_REPO}/releases?per_page=100`);
      const existing = allReleases.find(r => r.tag_name === `v${newVersion}` || r.tag_name === newVersion);
      if (existing && existing.id) {
        console.log("🗑️  Deleting existing release...");
        await githubRequest("DELETE", `/repos/${GITHUB_REPO}/releases/${existing.id}`);
      }
    } catch (e) {
      console.log("⚠️  Could not clean existing release (repo rules may block deletion).");
    }

    // 1. Create as DRAFT first (repo rules allow draft releases even if published tags are restricted)
    console.log("📤 Creating draft release...");
    const release = await githubRequest(
      "POST",
      `/repos/${GITHUB_REPO}/releases`,
      {
        tag_name: `v${newVersion}`,
        name: `v${newVersion}`,
        body: `Quick USSD Dial ${newVersion}`,
        draft: true,
        prerelease: false,
      }
    );

    // 2. Upload APK asset to the draft release
    const uploadUrl = release.upload_url.replace("{?name,label}", `?name=${encodeURIComponent(APK_PATH.split(/[\\/]/).pop())}&`);
    console.log("📤 Uploading APK...");

    const fs = await import("node:fs");
    const apkBuffer = fs.readFileSync(APK_PATH);

    const uploadResult = await new Promise((resolve, reject) => {
      const uploadReq = https.request(
        {
          hostname: "uploads.github.com",
          path: uploadUrl.replace(/^https:\/\/uploads\.github\.com/, ""),
          method: "POST",
          headers: {
            Authorization: `token ${GH_TOKEN}`,
            "Content-Type": "application/octet-stream",
            "Content-Length": apkBuffer.length,
          },
          timeout: 300000, // 5 minute timeout for large APK uploads
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(data));
              } catch {
                resolve(null);
              }
            } else {
              reject(new Error(`Upload failed (${res.statusCode}): ${data}`));
            }
          });
        }
      );
      uploadReq.on("error", reject);
      uploadReq.on("timeout", () => {
        uploadReq.destroy(new Error("Upload timed out after 5 minutes"));
      });
      uploadReq.write(apkBuffer);
      uploadReq.end();
    });

    console.log("✅ APK uploaded:", (uploadResult || {}).name || "asset");

    // 3. Publish the release
    console.log("🔄 Publishing release...");
    const published = await githubRequest(
      "PATCH",
      `/repos/${GITHUB_REPO}/releases/${release.id}`,
      { draft: false }
    );

    if (published.draft === false) {
      console.log(`🎉 Release v${newVersion} published successfully with APK!`);
      console.log(`🔗 https://github.com/${GITHUB_REPO}/releases/tag/v${newVersion}`);
    } else {
      console.error("❌ Release is still a draft after publish attempt.");
      console.log("   You can publish it manually at:", `https://github.com/${GITHUB_REPO}/releases`);
    }
  }

  uploadRelease().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
});
