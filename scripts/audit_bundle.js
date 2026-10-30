#!/usr/bin/env node

/**
 * GitShow Performance & Packaging Audit Script
 * Validates bundle sizes, release optimizations, and performance thresholds.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const MAX_GZIP_JS_BYTES = 1.5 * 1024 * 1024; // 1.5MB
const MAX_RELEASE_BINARY_BYTES = 20 * 1024 * 1024; // 20MB

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function main() {
  console.log('='.repeat(60));
  console.log(' GitShow Packaging & Performance Audit');
  console.log('='.repeat(60));

  let passed = true;

  // 1. Audit Cargo.toml release profile optimizations
  console.log('\n[1/3] Checking Rust release profile optimizations...');
  const cargoPath = path.join(ROOT_DIR, 'src-tauri', 'Cargo.toml');
  if (!fs.existsSync(cargoPath)) {
    console.error('FAIL: src-tauri/Cargo.toml not found');
    passed = false;
  } else {
    const cargoContent = fs.readFileSync(cargoPath, 'utf-8');
    const hasProfile = cargoContent.includes('[profile.release]');
    const hasOptLevel = /opt-level\s*=\s*["'](?:z|s)["']/.test(cargoContent);
    const hasLto = /lto\s*=\s*true/.test(cargoContent);
    const hasCodegenUnits = /codegen-units\s*=\s*1/.test(cargoContent);
    const hasStrip = /strip\s*=\s*true/.test(cargoContent);

    if (hasProfile && hasOptLevel && hasLto && hasCodegenUnits && hasStrip) {
      console.log('PASS: [profile.release] configured with opt-level="z", lto=true, codegen-units=1, strip=true');
    } else {
      console.error('FAIL: [profile.release] missing required size optimization settings');
      passed = false;
    }
  }

  // 2. Audit Frontend JS bundle size (gzipped)
  console.log('\n[2/3] Checking Frontend bundle size (dist/assets)...');
  const distDir = path.join(ROOT_DIR, 'dist', 'assets');
  if (!fs.existsSync(distDir)) {
    console.log('INFO: dist/assets not found, compiling production bundle with `pnpm build`...');
    try {
      execSync('pnpm build', { cwd: ROOT_DIR, stdio: 'ignore' });
    } catch {
      console.error('FAIL: dist/assets not found and `pnpm build` failed.');
      passed = false;
    }
  }

  if (fs.existsSync(distDir)) {
    const files = fs.readdirSync(distDir);
    const jsFiles = files.filter((f) => f.endsWith('.js'));

    let totalRawBytes = 0;
    let totalGzipBytes = 0;

    for (const file of jsFiles) {
      const filePath = path.join(distDir, file);
      const content = fs.readFileSync(filePath);
      const gzipped = zlib.gzipSync(content);
      totalRawBytes += content.length;
      totalGzipBytes += gzipped.length;
    }

    console.log(`  Total JS files: ${jsFiles.length}`);
    console.log(`  Raw JS size:    ${formatBytes(totalRawBytes)}`);
    console.log(`  Gzip JS size:   ${formatBytes(totalGzipBytes)} (Limit: ${formatBytes(MAX_GZIP_JS_BYTES)})`);

    if (totalGzipBytes < MAX_GZIP_JS_BYTES) {
      console.log(`PASS: Frontend JS gzip bundle size is within budget (${formatBytes(totalGzipBytes)} < 1.5MB)`);
    } else {
      console.error(`FAIL: Frontend JS bundle exceeded 1.5MB limit (${formatBytes(totalGzipBytes)})`);
      passed = false;
    }
  }

  // 3. Audit Release binary size if present
  console.log('\n[3/3] Checking Release binary size (if compiled)...');
  const binaryCandidates = [
    path.join(ROOT_DIR, 'src-tauri', 'target', 'release', 'gitshow.exe'),
    path.join(ROOT_DIR, 'src-tauri', 'target', 'release', 'gitshow'),
  ];
  let foundBinary = null;
  for (const bin of binaryCandidates) {
    if (fs.existsSync(bin)) {
      foundBinary = bin;
      break;
    }
  }

  if (foundBinary) {
    const stats = fs.statSync(foundBinary);
    console.log(`  Found binary: ${foundBinary}`);
    console.log(`  Binary size:  ${formatBytes(stats.size)} (Limit: ${formatBytes(MAX_RELEASE_BINARY_BYTES)})`);
    if (stats.size < MAX_RELEASE_BINARY_BYTES) {
      console.log(`PASS: Release binary size is within 20MB budget`);
    } else {
      console.error(`FAIL: Release binary exceeded 20MB limit (${formatBytes(stats.size)})`);
      passed = false;
    }
  } else {
    console.log('INFO: Release binary not compiled yet. Binary size budget is < 20MB.');
  }

  console.log('\n' + '='.repeat(60));
  if (passed) {
    console.log('PASS: Audit completed successfully. All performance thresholds satisfied.');
    console.log('='.repeat(60));
    process.exit(0);
  } else {
    console.error('FAIL: Audit failed. Resolve size or configuration issues above.');
    console.log('='.repeat(60));
    process.exit(1);
  }
}

main();
