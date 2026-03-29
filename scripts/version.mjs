#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";

const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Usage: node scripts/version.mjs <major.minor.patch>");
  process.exit(1);
}

// package.json
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
pkg.version = version;
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

// src-tauri/Cargo.toml
let cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
cargo = cargo.replace(/^version = ".*"/m, `version = "${version}"`);
writeFileSync("src-tauri/Cargo.toml", cargo);

// src-tauri/tauri.conf.json
const tauri = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
tauri.version = version;
writeFileSync(
  "src-tauri/tauri.conf.json",
  JSON.stringify(tauri, null, 2) + "\n",
);

console.log(`Bumped to ${version}`);

execSync(`git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json`);
execSync(`git commit -m "chore: bump version to ${version}"`);

console.log(`Commit created. After merging to main:`);
console.log(`  git checkout main && git pull`);
console.log(`  git tag v${version} && git push origin v${version}`);
