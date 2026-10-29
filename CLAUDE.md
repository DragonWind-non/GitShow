# GitShow — Project Instructions & Guidelines

GitShow is a high-performance desktop Git & GitHub client built with Tauri v2, Rust backend, and React 19 + TypeScript frontend.

## Architecture Principles
- **Hybrid Git Engine**:
  - `git2-rs` for ultra-fast, read-only DAG traversal, commit history queries, and branch listing.
  - System Git CLI for all mutating operations (`commit`, `rebase`, `merge`, `push`, `stash`) to guarantee 100% compatibility with user hooks, SSH, and GPG keys.
- **Concurrency & Locking**: Background readers and file watchers must avoid `index.lock` collisions with running Git CLI processes.
- **Frontend**: React 19 + TypeScript, Vite, Tailwind CSS, Canvas 2D virtualized DAG rendering, and embedded PTY terminal.

## Tech Stack & Tooling
- **Package Manager**: `pnpm` (strictly)
- **Frontend**: React 19, TypeScript (strict mode, no `any`), Vite, Tailwind CSS, Zustand, Lucide React, Shiki, @tanstack/react-virtual, @xterm/xterm
- **Backend**: Rust 2021 edition, Tauri v2 (`git2`, `tokio`, `serde`, `serde_json`, `anyhow`, `thiserror`, `keyring`, `portable-pty`, `notify`, `reqwest`)
- **Test Runner**: Vitest (`pnpm test` or `npx vitest run`) for TypeScript, `cargo test` for Rust

## Common Commands
- **Install dependencies**: `pnpm install`
- **Frontend dev server**: `pnpm dev`
- **Tauri desktop dev**: `pnpm tauri dev`
- **Build frontend**: `pnpm build`
- **Run frontend tests**: `pnpm test`
- **Rust check & tests**:
  - `cargo check --manifest-path src-tauri/Cargo.toml`
  - `cargo test --manifest-path src-tauri/Cargo.toml`

## Git & Collaboration Conventions
- **Branches**: `feature/*`, `fix/*`, `chore/*`
- **Commit Messages**: Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`) in English.
- **Attribution**: Include `Co-Authored-By: Claude Code <noreply@anthropic.com>` in all commit messages.
