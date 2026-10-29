import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT_DIR = path.resolve(__dirname, '..');

describe('Project Scaffolding & Tauri v2 Shell Setup', () => {
  it('verifies package.json exists and has required dependencies', () => {
    const pkgPath = path.join(ROOT_DIR, 'package.json');
    expect(fs.existsSync(pkgPath), 'package.json must exist').toBe(true);

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    const requiredDeps = [
      '@tauri-apps/api',
      '@tauri-apps/plugin-shell',
      'react',
      'react-dom',
      'zustand',
      'lucide-react',
      'tailwindcss',
      'shiki',
      '@tanstack/react-virtual',
      '@xterm/xterm',
    ];

    for (const dep of requiredDeps) {
      expect(allDeps[dep], `package.json missing dependency: ${dep}`).toBeDefined();
    }
  });

  it('verifies src-tauri/Cargo.toml exists and has required dependencies', () => {
    const cargoPath = path.join(ROOT_DIR, 'src-tauri', 'Cargo.toml');
    expect(fs.existsSync(cargoPath), 'src-tauri/Cargo.toml must exist').toBe(true);

    const cargoContent = fs.readFileSync(cargoPath, 'utf-8');
    const requiredCrates = [
      'tauri',
      'git2',
      'tokio',
      'serde',
      'serde_json',
      'keyring',
      'portable-pty',
      'notify',
      'reqwest',
    ];

    for (const crate of requiredCrates) {
      expect(cargoContent).toContain(crate);
    }
  });

  it('verifies CLAUDE.md exists in project root', () => {
    const claudePath = path.join(ROOT_DIR, 'CLAUDE.md');
    expect(fs.existsSync(claudePath), 'CLAUDE.md must exist').toBe(true);
  });
});
