# GitShow — System Design Specification
**Date:** 2026-10-29  
**Status:** Approved by Human Partner & Architect Review  
**Stack:** Tauri v2 + Rust + React 19 + TypeScript + Canvas Virtualization  

---

## 1. Intent & The "Why"
Git is the standard version control system, but developers frequently struggle with two extremes:
1. **Command Line (CLI):** Steep learning curve for beginners, terrifying syntax for non-trivial operations (`git rebase -i`, `git reset --hard`, reflog recovery), and difficult mental visualization of non-linear DAG branch histories.
2. **Existing GUIs:** 
   - *Electron-based tools (GitKraken, GitHub Desktop):* Resource-heavy (400MB+ RAM), slow startup, proprietary paywalls.
   - *Traditional tools (SourceTree):* Cluttered UI, slow multi-repo performance.
   - *Minimalist tools (Sublime Merge, Lazygit):* Fast, but lack visual interactive learning aids and deep GitHub PR workflows.

**GitShow** solves this by delivering a **lightweight, blazingly fast (<90MB RAM, <300ms startup) cross-platform desktop application** built on **Tauri v2 + Rust + React**. It bridges the gap between beginners and senior developers through an interactive visual DAG commit tree, 1-click Safe Undo (Reflog Time Machine), an educational Realtime CLI Bridge, and deep native GitHub integration.

---

## 2. Core Pillars & Value Proposition

### Pillar 1: Visual Commit DAG Tree (Interactive & Virtualized)
- **Virtualized Canvas 2D Engine:** Capable of rendering repositories with 50,000+ commits at continuous 60fps without DOM bloat.
- **Color-Coded Branch Tracks:** Distinct visual lanes for `main`, release, and feature branches with merge junction nodes.
- **Drag-and-Drop Git Mutations:** Drag branch A onto branch B opens a clear context modal:
  - *Merge A into B* (fast-forward or `--no-ff`)
  - *Rebase A onto B*
  - *Cherry-pick commit range*
- **Visual Interactive Rebase:** A drag-to-reorder list replacing the Vim editor during `rebase -i`. Users can toggle `pick`, `squash`, `reword`, `drop` with 1-click. Executed via `GIT_SEQUENCE_EDITOR` helper IPC.

### Pillar 2: Safe Undo & Reflog Time Machine
- **Zero-Panic Safety Net:** Every potentially destructive operation (`git reset --hard`, `git rebase`, `git branch -D`, `git checkout .`) automatically captures a pre-mutation snapshot into a local `GitShow Undo Stack`.
- **Uncommitted Changes Protection:** Before any reset or rebase, GitShow executes `git stash create` under the hood. This creates a dangling commit capturing both staged and unstaged changes without altering the user's manual `refs/stash` list.
- **1-Click Reflog Rollback:** If a user makes a mistake or loses work, clicking "Undo" restores the reflog pointer (`git reset --hard HEAD@{1}`) and merges back the dangling stash commit with zero data loss.
- **Dangerous Action Prompts:** High-risk actions are color-coded red with a simulation preview of what commits or files will be modified or orphaned.

### Pillar 3: Realtime CLI Command Bridge
- **Visual-to-Terminal Learning:** Every GUI action shows the exact Git CLI command in the bottom command drawer in real-time.
- **Copy & Explain:** Includes a "Copy CLI" button and a concise explanation of the flags (e.g., why `--force-with-lease` is safer than `--force`).
- **Interactive Terminal:** Senior developers can open the embedded terminal drawer (`portable-pty` + `@xterm/xterm`) to run arbitrary raw git commands with live two-way sync back to the GUI graph.

### Pillar 4: Deep GitHub Workflow
- **Device Flow OAuth:** Secure 1-click browser login via GitHub Device Flow (RFC 8628), storing encrypted tokens in the OS keychain via `keyring-rs`. Also supports custom Personal Access Token (PAT).
- **GraphQL PR Studio:**
  - Employs GitHub GraphQL API to fetch PR list, reviews, comments, checks, and metadata in a single query, eliminating REST rate-limit throttling.
  - Side-by-side and unified diff viewer.
  - Inline comment review, approve, request changes, and merge (merge commit, squash, rebase).
- **Fork & Upstream Sync:** 1-click sync between local forks and upstream repositories (`fetch upstream && merge upstream/main`).

---

## 3. Goals, Non-Goals & Anti-Goals

### Goals
- **Blazing Performance:** App launch in < 300ms; repo switch in < 150ms; smooth panning/zooming on large DAG graphs (50k+ commits); RAM < 90MB idle.
- **Dual-Audience Usability:** Default "Safe & Guided" experience for juniors; full keyboard navigation, Command Palette (`Ctrl+K`), and VIM shortcuts for seniors.
- **100% Config Compatibility:** Respects user's existing `~/.gitconfig`, global ignores, SSH keys, GPG/SSH commit signing, and local git hooks.

### Non-Goals
- Not a general code editor or IDE (will not provide LSP, code completion, or debugger).
- Not a Git hosting provider (relies on GitHub API and standard Git remotes).

### Anti-Goals
- No bloat: Avoid Chromium/Electron runtimes; keep bundle size < 20MB.
- No proprietary git state: Never modify git repositories in proprietary formats; strictly adhere to standard Git conventions and `.git` specifications.

---

## 4. Technical Architecture

### 4.1 System Topology
```
+-----------------------------------------------------------+
|                      REACT 19 FRONTEND                    |
|  - Layout: 3-Column Studio (Sidebar | Center | Diff/Meta) |
|  - Graph: HTML5 2D Canvas (Z-order virtualized DAG)       |
|  - Diff: Virtualized Lightweight Diff (Shiki highlighting)|
|  - State: Zustand + TanStack Query (GitHub GraphQL cache) |
+-----------------------------------------------------------+
                           ↕ Tauri IPC (JSON-RPC)
+-----------------------------------------------------------+
|                      RUST CORE (TAURI v2)                 |
|  - commands/git.rs: Invokes system `git` CLI process      |
|  - engine/dag.rs: Ultra-fast commit graph via `git2-rs`  |
|  - engine/reflog.rs: Undo Stack & dangling stash tracker  |
|  - engine/lock.rs: RepoLockManager for Windows index.lock |
|  - github/graphql.rs: GraphQL Client (Reqwest + Keychain) |
|  - terminal/pty.rs: Portable-pty integration              |
|  - watcher/repo.rs: Native file-system watcher (notify)   |
+-----------------------------------------------------------+
                           ↕ OS APIs / Processes
+---------------------------+-------------------------------+
|  Local System Git CLI     |  OS Keychain / GitHub GraphQL |
+---------------------------+-------------------------------+
```

### 4.2 Git Engine: Hybrid Model
1. **Mutation Engine (System Git CLI):** All mutating commands (`git commit`, `git push`, `git pull`, `git rebase`, `git merge`, `git cherry-pick`) are spawned as native processes via `tokio::process::Command`. This guarantees that user credential helpers, SSH agent keys, GPG signing, and pre-commit hooks execute identically to the terminal.
   - For interactive rebase: Sets `GIT_SEQUENCE_EDITOR="gitshow-helper rebase"` to inject GUI rebase-todo without opening terminal Vim.
   - For credential prompts: Defer to OS credential helper and GUI pinentry; fallback to `GIT_ASKPASS` helper modal.
2. **Read/Parse Engine (`git2-rs` + topological sorter):** High-volume read queries (traversing 50,000 commits, calculating branch ancestry, and constructing the DAG matrix) are executed in pure Rust via `git2-rs` directly against `.git/objects` and packed refs.
3. **Concurrency & Lock Guard (`RepoLockManager`):** Windows enforces strict file locking on `.git/index.lock`. `RepoLockManager` automatically pauses passive background watcher scans when an active mutating command or terminal PTY process runs, applying a 150ms debounce and exponential retry backoff.

### 4.3 3-Column Studio Layout
- **Left Column (220px - 280px):** Repositories, Branches (Local & Remote), Tags, Stashes, GitHub PRs / Issues status badges.
- **Center Column (Fluid):**
  - Top: Virtualized Canvas Commit DAG Tree & Timeline.
  - Bottom: Staging Area with Unstaged files, Staged files, Commit message input, Commit button, Amend checkbox.
- **Right Column (320px - 450px):** Virtualized Lightweight Diff Viewer (Shiki syntax highlighting, side-by-side or unified view), Hunk/Line staging, Commit Metadata Inspector.
- **Bottom Drawer (Collapsible):** Realtime CLI Bridge & Embedded Terminal (`portable-pty` + `@xterm/xterm`).

---

## 5. Security & Data Storage
- **GitHub Token Storage:** Encrypted using native OS credential manager via `keyring-rs` (Windows Credential Manager / macOS Keychain / Secret Service on Linux).
- **Local Application Data:** Stored in `~/.gitshow/` or `%APPDATA%/gitshow/`:
  - `recents.json`: List of recently opened repository paths.
  - `undo_history.json`: Per-repository snapshot references for the Safe Undo stack.
  - `preferences.json`: Theme (Dark/Light/System), keyboard layout, CLI verbosity settings.

---

## 6. Settle Summary (Decisions & Builder Calls)
1. **Interactive Rebase:** Resolved via `GIT_SEQUENCE_EDITOR` helper IPC.
2. **Safe Undo Working Copy:** Resolved via `git stash create` dangling commits + reflog tracking.
3. **Diff Viewer:** Virtualized Lightweight Diff with Shiki (User selected: keeps RAM < 90MB and bundle < 20MB).
4. **GitHub PR API:** GitHub GraphQL API with Device Flow OAuth (User selected: zero rate-limit throttling).
5. **Windows index.lock:** Resolved via centralized `RepoLockManager` with watcher pause and retry backoff.
6. **Scope:** Full Features All-in-One delivery.
