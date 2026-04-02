#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

// When run as an npm version lifecycle hook, npm has already updated package.json
// and will create the commit itself — we just need to update the other files and stage them.
const isLifecycleHook = !!process.env.npm_lifecycle_event;
const version = process.argv[2] || process.env.npm_package_version;

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Usage: node scripts/version.mjs <major.minor.patch>");
  process.exit(1);
}

if (!isLifecycleHook) {
  // package.json (only when run standalone — npm handles it otherwise)
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  pkg.version = version;
  writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
}

// src-tauri/Cargo.toml
let cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
cargo = cargo.replace(/^version = ".*"/m, `version = "${version}"`);
writeFileSync("src-tauri/Cargo.toml", cargo);

// src-tauri/tauri.conf.json
const tauri = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
tauri.version = version;
writeFileSync("src-tauri/tauri.conf.json", JSON.stringify(tauri, null, 2) + "\n");

console.log(`Bumped to ${version}`);

if (isLifecycleHook) {
  // Stage the extra files so npm includes them in its version commit
  execSync(`git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json`);
} else {
  execSync(`git add package.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json`);
  execSync(`git commit -m "chore: bump version to ${version}"`);

  console.log(`Commit created. After merging to main:`);
  console.log(`  git checkout main && git pull`);
  console.log(`  git tag v${version} && git push origin v${version}`);
}
