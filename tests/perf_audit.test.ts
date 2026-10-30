import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { execSync } from 'child_process';

const ROOT_DIR = path.resolve(__dirname, '..');
const MAX_GZIP_JS_BYTES = 1.5 * 1024 * 1024; // 1.5MB (1,572,864 bytes)
const MAX_RELEASE_BINARY_BYTES = 20 * 1024 * 1024; // 20MB (20,971,520 bytes)

describe('Task 20: Performance & Packaging Audit', () => {
  it('verifies src-tauri/Cargo.toml has release profile size optimizations', () => {
    const cargoTomlPath = path.join(ROOT_DIR, 'src-tauri', 'Cargo.toml');
    expect(fs.existsSync(cargoTomlPath)).toBe(true);

    const content = fs.readFileSync(cargoTomlPath, 'utf-8');
    expect(content).toContain('[profile.release]');
    expect(content).toMatch(/opt-level\s*=\s*["'](?:z|s)["']/);
    expect(content).toMatch(/lto\s*=\s*true/);
    expect(content).toMatch(/codegen-units\s*=\s*1/);
    expect(content).toMatch(/strip\s*=\s*true/);
  });

  it('verifies frontend JS bundle total gzipped size is under 1.5MB', () => {
    const distAssetsDir = path.join(ROOT_DIR, 'dist', 'assets');
    expect(fs.existsSync(distAssetsDir)).toBe(true);

    const files = fs.readdirSync(distAssetsDir);
    const jsFiles = files.filter((f) => f.endsWith('.js'));
    expect(jsFiles.length).toBeGreaterThan(0);

    let totalGzipBytes = 0;
    for (const file of jsFiles) {
      const buffer = fs.readFileSync(path.join(distAssetsDir, file));
      const gzipped = zlib.gzipSync(buffer);
      totalGzipBytes += gzipped.length;
    }

    expect(totalGzipBytes).toBeLessThan(MAX_GZIP_JS_BYTES);
  });

  it('verifies scripts/audit_bundle.js exists and runs successfully with exit code 0', () => {
    const scriptPath = path.join(ROOT_DIR, 'scripts', 'audit_bundle.js');
    expect(fs.existsSync(scriptPath)).toBe(true);

    const output = execSync(`node "${scriptPath}"`, {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    expect(output).toContain('PASS');
    expect(output).toContain('Audit completed successfully');
  });
});
