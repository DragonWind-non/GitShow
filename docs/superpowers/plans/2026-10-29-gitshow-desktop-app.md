# GitShow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build GitShow — a lightweight, blazingly fast (<90MB RAM, <300ms startup) desktop Git & GitHub GUI app powered by Tauri v2, Rust, React 19, Canvas 2D virtualized DAG, Safe Undo (Reflog time machine), realtime Git CLI Bridge, and GitHub GraphQL PR Studio.

**Architecture:** Hybrid Git Engine where Rust (`git2-rs`) parses 50k+ commit DAG graphs at microsecond speeds, while system `git CLI` executes all mutations (`commit`, `push`, `rebase`, `merge`) ensuring 100% SSH/GPG hook compatibility. Frontend runs React 19 + TypeScript in a 3-Column Studio layout with HTML5 Canvas 2D virtualized graph rendering, Shiki lightweight diff viewer, and embedded PTY terminal.

**Tech Stack:** Tauri v2, Rust (tokio, git2-rs, keyring, portable-pty, notify, reqwest), React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, Zustand, TanStack Virtual, Shiki, xterm.js, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-29-gitshow-design.md`

## Global Constraints
- Target platforms: Windows 11 (primary), macOS, Linux.
- App startup time: < 300ms; idle RAM consumption: < 90MB; bundle size: < 20MB.
- Package manager: `pnpm` (strictly per user CLAUDE.md).
- Language idioms: Strict TypeScript (no `any`), Rust 2021 edition with error handling via `anyhow` / `thiserror`.
- Zero proprietary git format: 100% compliance with standard `.git` directory structure and git CLI semantics.

## Review Focus
1. **Windows file locking (`index.lock`):** Background git2-rs reader or file watcher must never collide with active git CLI process; verified by `RepoLockManager` tests.
2. **Interactive Rebase non-interactive injection:** `git rebase -i` must not block on Vim terminal; verified by `GIT_SEQUENCE_EDITOR` mock test.
3. **Safe Undo uncommitted work preservation:** Pre-mutation snapshot must capture unstaged/staged files via `git stash create` without altering `refs/stash`; verified by uncommitted loss prevention test.
4. **Git CLI credential prompt hanging:** Background tasks must pass `GIT_TERMINAL_PROMPT=0` and route interactive credential requests through `GIT_ASKPASS`; verified by credential prompt timeout test.
5. **Canvas DAG rendering under load:** Virtualized Canvas must render 50,000 commits without UI frame drops; verified by mock 50k commit benchmark test.

---

### Task 1: Project Scaffolding & Tauri v2 Shell Setup

**Files:**
- Create: `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.js`, `index.html`
- Create: `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`
- Create: `CLAUDE.md` (project-specific standard per CLAUDE.md instructions)
- Test: `tests/scaffold.test.ts`

**Interfaces:**
- Consumes: Node.js & Cargo toolchains.
- Produces: Working Tauri v2 desktop application shell capable of IPC communication.

- [x] **Step 1: Write scaffold sanity test in `tests/scaffold.test.ts`**
  Asserts that `package.json` contains required Tauri v2 dependencies and `src-tauri/Cargo.toml` specifies `git2`, `tokio`, `serde`.
- [x] **Step 2: Run test to verify it fails**
  Run: `pnpm test` -> Expected: FAIL (files missing).
- [x] **Step 3: Initialize Git repo and scaffold project files**
  Initialize `git init`. Create `package.json` with `@tauri-apps/api`, `@tauri-apps/plugin-shell`, `react`, `react-dom`, `zustand`, `lucide-react`, `tailwindcss`. Create `src-tauri/Cargo.toml` with `tauri = "2"`, `git2 = "0.19"`, `tokio = { version = "1", features = ["full"] }`, `serde = { version = "1", features = ["derive"] }`, `serde_json = "1"`. Create project `CLAUDE.md`.
- [x] **Step 4: Run test to verify it passes**
  Run: `pnpm test` -> Expected: PASS.
- [x] **Step 5: Commit**
  `git add . && git commit -m "chore: scaffold tauri v2 react desktop application"`

---

### Task 2: Git Repository Validation & Branch/Tag Engine (Rust)

**Files:**
- Create: `src-tauri/src/engine/mod.rs`
- Create: `src-tauri/src/engine/repo.rs`
- Test: `src-tauri/tests/repo_test.rs`

**Interfaces:**
- Consumes: Target repository path `&Path`.
- Produces:
  ```rust
  pub struct RepoInfo {
      pub path: String,
      pub current_branch: Option<String>,
      pub is_detached: bool,
      pub is_clean: bool,
  }
  pub struct BranchInfo {
      pub name: String,
      pub is_current: bool,
      pub is_remote: bool,
      pub target_commit: String,
  }
  pub fn open_repository(path: &str) -> Result<RepoInfo, String>;
  pub fn list_branches(path: &str) -> Result<Vec<BranchInfo>, String>;
  ```

- [x] **Step 1: Write unit test in `src-tauri/tests/repo_test.rs`**
  Creates a temp git repository using `git2::Repository::init`, creates an initial commit and a feature branch, and asserts `open_repository` and `list_branches` return expected data.
- [x] **Step 2: Run test to verify it fails**
  Run: `cargo test --test repo_test` -> Expected: FAIL (functions undefined).
- [x] **Step 3: Implement `engine/repo.rs`**
  Use `git2::Repository::open`. Parse head ref, local branches (`BranchType::Local`), and remote branches (`BranchType::Remote`).
- [x] **Step 4: Run test to verify it passes**
  Run: `cargo test --test repo_test` -> Expected: PASS.
- [x] **Step 5: Commit**
  `git add src-tauri/ && git commit -m "feat(engine): add repository validation and branch listing"`

---

### Task 3: Commit DAG Topology Sorter & Parser (Rust)

**Files:**
- Create: `src-tauri/src/engine/dag.rs`
- Test: `src-tauri/tests/dag_test.rs`

**Interfaces:**
- Consumes: Open `git2::Repository`.
- Produces:
  ```rust
  pub struct DagCommit {
      pub id: String,
      pub short_id: String,
      pub summary: String,
      pub author_name: String,
      pub author_email: String,
      pub timestamp: i64,
      pub parent_ids: Vec<String>,
      pub lane: usize,
      pub branch_names: Vec<String>,
      pub is_head: bool,
  }
  pub fn build_commit_graph(repo_path: &str, max_count: usize) -> Result<Vec<DagCommit>, String>;
  ```

- [x] **Step 1: Write DAG test in `src-tauri/tests/dag_test.rs`**
  Build a git repo with a merge commit (branch A + branch B merged into main). Verify `build_commit_graph` assigns distinct lanes and correctly maps parent-child junction links.
- [x] **Step 2: Run test to verify it fails**
  Run: `cargo test --test dag_test` -> Expected: FAIL.
- [x] **Step 3: Implement topological sort and visual lane allocator in `dag.rs`**
  Traverse commit history using `revwalk` with `git2::Sort::TOPOLOGICAL | git2::Sort::TIME`. Assign lane indices using an active-lanes pool algorithm.
- [x] **Step 4: Run test to verify it passes**
  Run: `cargo test --test dag_test` -> Expected: PASS.
- [x] **Step 5: Commit**
  `git add src-tauri/ && git commit -m "feat(engine): implement commit DAG topological sorter and lane allocator"`

---

### Task 4: Concurrency & Lock Guard (`RepoLockManager`)

**Files:**
- Create: `src-tauri/src/engine/lock.rs`
- Test: `src-tauri/tests/lock_test.rs`

**Interfaces:**
- Consumes: `repo_path: &Path`.
- Produces:
  ```rust
  pub struct RepoLockManager { ... }
  impl RepoLockManager {
      pub async fn with_mutation_lock<T, F, Fut>(&self, repo: &str, f: F) -> Result<T, String>
      where F: FnOnce() -> Fut, Fut: Future<Output = Result<T, String>>;
      pub fn is_locked(&self, repo: &str) -> bool;
  }
  ```

- [x] **Step 1: Write lock manager test in `src-tauri/tests/lock_test.rs`**
  Simulate parallel write operations; verify that secondary write waits for primary lock and `.git/index.lock` is respected with exponential backoff.
- [x] **Step 2: Run test to verify it fails**
  Run: `cargo test --test lock_test` -> Expected: FAIL.
- [x] **Step 3: Implement `RepoLockManager` in `src-tauri/src/engine/lock.rs`**
  Use `tokio::sync::Mutex` per repository path. Check for stale `.git/index.lock` files and pause the file watcher during lock execution.
- [x] **Step 4: Run test to verify it passes**
  Run: `cargo test --test lock_test` -> Expected: PASS.
- [x] **Step 5: Commit**
  `git add src-tauri/ && git commit -m "feat(engine): add RepoLockManager for Windows index.lock synchronization"`

---

### Task 5: System Git CLI Mutation Engine & Command Preview

**Files:**
- Create: `src-tauri/src/commands/mod.rs`
- Create: `src-tauri/src/commands/git_cli.rs`
- Test: `src-tauri/tests/git_cli_test.rs`

**Interfaces:**
- Consumes: Command args `&[&str]`, `repo_path: &str`.
- Produces:
  ```rust
  pub struct CliExecutionResult {
      pub stdout: String,
      pub stderr: String,
      pub exit_code: i32,
      pub preview_command: String,
  }
  pub async fn execute_git_command(repo_path: &str, args: &[&str]) -> Result<CliExecutionResult, String>;
  pub fn preview_command(args: &[&str]) -> String;
  ```

- [x] **Step 1: Write CLI command test in `src-tauri/tests/git_cli_test.rs`**
  Execute `git status`, `git commit`, `git checkout` through `execute_git_command`. Assert `preview_command` matches terminal command string and output is captured.
- [x] **Step 2: Run test to verify it fails**
  Run: `cargo test --test git_cli_test` -> Expected: FAIL.
- [x] **Step 3: Implement `commands/git_cli.rs`**
  Use `tokio::process::Command`. Inject `GIT_TERMINAL_PROMPT=0`. Set UTF-8 encoding. Wrap with `RepoLockManager`.
- [x] **Step 4: Run test to verify it passes**
  Run: `cargo test --test git_cli_test` -> Expected: PASS.
- [x] **Step 5: Commit**
  `git add src-tauri/ && git commit -m "feat(commands): implement system git CLI execution and preview generator"`

---

### Task 6: Safe Undo Stack & Dangling Stash Protection

**Files:**
- Create: `src-tauri/src/engine/undo.rs`
- Test: `src-tauri/tests/undo_test.rs`

**Interfaces:**
- Consumes: Target repository path, destructive action name.
- Produces:
  ```rust
  pub struct UndoSnapshot {
      pub id: String,
      pub timestamp: i64,
      pub action_name: String,
      pub pre_head_sha: String,
      pub dangling_stash_sha: Option<String>,
      pub restore_cli_command: String,
  }
  pub async fn capture_pre_mutation_snapshot(repo_path: &str, action: &str) -> Result<UndoSnapshot, String>;
  pub async fn rollback_snapshot(repo_path: &str, snapshot_id: &str) -> Result<String, String>;
  pub fn get_undo_stack(repo_path: &str) -> Vec<UndoSnapshot>;
  ```

- [x] **Step 1: Write Safe Undo test in `src-tauri/tests/undo_test.rs`**
  Create uncommitted changes in working tree -> run `capture_pre_mutation_snapshot` -> execute destructive `git reset --hard HEAD~1` -> run `rollback_snapshot` -> assert commit and uncommitted changes are 100% recovered.
- [x] **Step 2: Run test to verify it fails**
  Run: `cargo test --test undo_test` -> Expected: FAIL.
- [x] **Step 3: Implement `engine/undo.rs`**
  Run `git stash create` to get dangling commit SHA without touching `refs/stash`. Capture `HEAD` commit SHA. Store snapshots in memory and `%APPDATA%/gitshow/undo.json`. Rollback runs `git reset --hard <pre_head_sha>` then applies stash commit.
- [x] **Step 4: Run test to verify it passes**
  Run: `cargo test --test undo_test` -> Expected: PASS.
- [x] **Step 5: Commit**
  `git add src-tauri/ && git commit -m "feat(engine): implement Safe Undo stack with dangling stash capture"`

---

### Task 7: Interactive Rebase Helper with `GIT_SEQUENCE_EDITOR`

**Files:**
- Create: `src-tauri/src/commands/rebase.rs`
- Create: `src-tauri/src/bin/rebase_helper.rs` (helper CLI binary)
- Test: `src-tauri/tests/rebase_test.rs`

**Interfaces:**
- Consumes: List of `RebaseItem { action: "pick" | "squash" | "reword" | "drop", sha: String, message: String }`.
- Produces:
  ```rust
  pub async fn execute_interactive_rebase(repo: &str, base_sha: &str, items: Vec<RebaseItem>) -> Result<(), String>;
  ```

- [x] **Step 1: Write rebase test in `src-tauri/tests/rebase_test.rs`**
  Create 3 sequential commits -> invoke rebase reordering commit 2 before commit 1 and squashing commit 3 -> verify git log reflects new history without stalling for user editor.
- [x] **Step 2: Run test to verify it fails**
  Run: `cargo test --test rebase_test` -> Expected: FAIL.
- [x] **Step 3: Implement `commands/rebase.rs` and `rebase_helper`**
  Format `git-rebase-todo` string in memory/temp file. Pass `GIT_SEQUENCE_EDITOR="<path-to-helper> <temp-file>"` to `git rebase -i`. Helper writes contents into the rebase-todo path provided by git.
- [x] **Step 4: Run test to verify it passes**
  Run: `cargo test --test rebase_test` -> Expected: PASS.
- [x] **Step 5: Commit**
  `git add src-tauri/ && git commit -m "feat(rebase): implement visual interactive rebase helper sequence editor"`

---

### Task 8: GitHub Device Flow OAuth & Keyring Token Manager

**Files:**
- Create: `src-tauri/src/github/mod.rs`
- Create: `src-tauri/src/github/auth.rs`
- Test: `src-tauri/tests/auth_test.rs`

**Interfaces:**
- Consumes: GitHub Client ID (default or user provided).
- Produces:
  ```rust
  pub struct DeviceCodeResponse {
      pub device_code: String,
      pub user_code: String,
      pub verification_uri: String,
      pub expires_in: u64,
      pub interval: u64,
  }
  pub async fn request_device_code(client_id: &str) -> Result<DeviceCodeResponse, String>;
  pub async fn poll_for_access_token(client_id: &str, device_code: &str, interval: u64) -> Result<String, String>;
  pub fn store_token(token: &str) -> Result<(), String>;
  pub fn get_token() -> Result<Option<String>, String>;
  pub fn remove_token() -> Result<(), String>;
  ```

- [x] **Step 1: Write auth unit test in `src-tauri/tests/auth_test.rs`**
  Mock GitHub Device code endpoint and test keyring token storage/retrieval.
- [x] **Step 2: Run test to verify it fails**
  Run: `cargo test --test auth_test` -> Expected: FAIL.
- [x] **Step 3: Implement `github/auth.rs`**
  Implement RFC 8628 via `reqwest`. Securely persist tokens in OS Credential Manager using `keyring-rs`.
- [x] **Step 4: Run test to verify it passes**
  Run: `cargo test --test auth_test` -> Expected: PASS.
- [x] **Step 5: Commit**
  `git add src-tauri/ && git commit -m "feat(github): implement Device Flow OAuth and OS keyring integration"`

---

### Task 9: GitHub GraphQL PR Studio Backend

**Files:**
- Create: `src-tauri/src/github/graphql.rs`
- Test: `src-tauri/tests/graphql_test.rs`

**Interfaces:**
- Consumes: Repo owner, name, access token.
- Produces:
  ```rust
  pub struct PullRequestItem {
      pub number: u64,
      pub title: String,
      pub author: String,
      pub state: String,
      pub head_ref: String,
      pub base_ref: String,
      pub comments_count: u32,
      pub review_decision: Option<String>,
  }
  pub async fn fetch_pull_requests(owner: &str, repo: &str, token: &str) -> Result<Vec<PullRequestItem>, String>;
  pub async fn fetch_pr_diff(owner: &str, repo: &str, pr_number: u64, token: &str) -> Result<String, String>;
  ```

- [x] **Step 1: Write GraphQL test in `src-tauri/tests/graphql_test.rs`**
  Mock GitHub GraphQL endpoint response; assert deserialization into `PullRequestItem`.
- [x] **Step 2: Run test to verify it fails**
  Run: `cargo test --test graphql_test` -> Expected: FAIL.
- [x] **Step 3: Implement `github/graphql.rs`**
  Write single GraphQL query requesting PR node fields (`number`, `title`, `author { login }`, `state`, `headRefName`, `baseRefName`, `reviewDecision`). Fetch PR diff with `Accept: application/vnd.github.v3.diff`.
- [x] **Step 4: Run test to verify it passes**
  Run: `cargo test --test graphql_test` -> Expected: PASS.
- [x] **Step 5: Commit**
  `git add src-tauri/ && git commit -m "feat(github): implement GraphQL PR studio queries and diff fetcher"`

---

### Task 10: Native PTY Terminal Server (`portable-pty`)

**Files:**
- Create: `src-tauri/src/terminal/mod.rs`
- Create: `src-tauri/src/terminal/pty.rs`
- Test: `src-tauri/tests/pty_test.rs`

**Interfaces:**
- Consumes: Working directory, terminal size (cols, rows).
- Produces:
  ```rust
  pub struct PtySession { ... }
  pub fn create_pty_session(cwd: &str, cols: u16, rows: u16) -> Result<u32, String>;
  pub fn write_to_pty(session_id: u32, data: &[u8]) -> Result<(), String>;
  pub fn resize_pty(session_id: u32, cols: u16, rows: u16) -> Result<(), String>;
  ```

- [x] **Step 1: Write PTY test in `src-tauri/tests/pty_test.rs`**
  Spawn PTY session running `echo "gitshow"` and verify stdout event received.
- [x] **Step 2: Run test to verify it fails**
  Run: `cargo test --test pty_test` -> Expected: FAIL.
- [x] **Step 3: Implement `terminal/pty.rs`**
  Use `portable_pty::native_pty_system()`. Spawn `powershell.exe` on Windows (or `$SHELL` on Unix). Pipe stdout to Tauri event emitter `pty-data:<id>`.
- [x] **Step 4: Run test to verify it passes**
  Run: `cargo test --test pty_test` -> Expected: PASS.
- [x] **Step 5: Commit**
  `git add src-tauri/ && git commit -m "feat(terminal): implement native PTY terminal session with portable-pty"`

---

### Task 11: 3-Column Studio Layout & Zustand App State

**Files:**
- Create: `src/types/git.ts`
- Create: `src/store/gitStore.ts`
- Create: `src/components/layout/AppLayout.tsx`
- Create: `src/components/layout/Sidebar.tsx`
- Create: `src/components/layout/TopBar.tsx`
- Test: `tests/layout.test.tsx`

**Interfaces:**
- Consumes: Tauri IPC invokes (`open_repository`, `list_branches`).
- Produces: Responsive 3-Column Studio shell (Sidebar | Main DAG | Diff/Inspector) with Dark/Light theme toggling.

- [x] **Step 1: Write layout component test in `tests/layout.test.tsx`**
  Render `AppLayout` with mock Zustand state; verify 3 columns and bottom drawer exist in DOM.
- [x] **Step 2: Run test to verify it fails**
  Run: `pnpm test tests/layout.test.tsx` -> Expected: FAIL.
- [x] **Step 3: Implement Zustand store and `AppLayout`**
  Define `GitStore` for active repo, branch list, selected commit, staged/unstaged files, and CLI preview string. Build `Sidebar` showing local/remote branches and stashes.
- [x] **Step 4: Run test to verify it passes**
  Run: `pnpm test tests/layout.test.tsx` -> Expected: PASS.
- [x] **Step 5: Commit**
  `git add src/ tests/ && git commit -m "feat(ui): build 3-column studio layout and zustand git store"`

---

### Task 12: Virtualized Canvas 2D Commit DAG Graph

**Files:**
- Create: `src/components/graph/DagCanvas.tsx`
- Create: `src/components/graph/dagRenderer.ts`
- Test: `tests/dagRenderer.test.ts`

**Interfaces:**
- Consumes: `commits: DagCommit[]`, container dimensions.
- Produces: 60fps virtualized Canvas rendering commit nodes, branch lane colored strokes, bezier curves for merge junctions, and click hit-testing.

- [x] **Step 1: Write canvas renderer test in `tests/dagRenderer.test.ts`**
  Verify visible commit slice calculation based on `scrollTop` and row height; verify hit detection returns commit under `(x, y)`.
- [x] **Step 2: Run test to verify it fails**
  Run: `pnpm test tests/dagRenderer.test.ts` -> Expected: FAIL.
- [x] **Step 3: Implement `DagCanvas.tsx` and `dagRenderer.ts`**
  Use HTML5 2D Canvas with `devicePixelRatio` scaling. Render only rows in `[scrollTop - buffer, scrollTop + height + buffer]`. Draw bezier curves for merge/branch splits. Support drag-and-drop branch merge context menu.
- [x] **Step 4: Run test to verify it passes**
  Run: `pnpm test tests/dagRenderer.test.ts` -> Expected: PASS.
- [x] **Step 5: Commit**
  `git add src/components/graph/ && git commit -m "feat(graph): implement virtualized canvas 2D commit DAG visualizer"`

---

### Task 13: Staging Area & Commit Box

**Files:**
- Create: `src/components/staging/StagingPanel.tsx`
- Create: `src/components/staging/FileItem.tsx`
- Test: `tests/staging.test.tsx`

**Interfaces:**
- Consumes: Unstaged & Staged file list from IPC `git_status`.
- Produces: UI to Stage All, Unstage All, Stage individual file, Commit message input, Amend toggle, and Commit button with CLI preview update.

- [x] **Step 1: Write staging test in `tests/staging.test.tsx`**
  Verify clicking "Stage" moves item from unstaged to staged; verify typing commit message updates preview command `git commit -m "..."`.
- [x] **Step 2: Run test to verify it fails**
  Run: `pnpm test tests/staging.test.tsx` -> Expected: FAIL.
- [x] **Step 3: Implement `StagingPanel.tsx`**
  Integrate with `execute_git_command(["add", path])`, `execute_git_command(["restore", "--staged", path])`, and `execute_git_command(["commit", "-m", msg])`.
- [x] **Step 4: Run test to verify it passes**
  Run: `pnpm test tests/staging.test.tsx` -> Expected: PASS.
- [x] **Step 5: Commit**
  `git add src/components/staging/ && git commit -m "feat(staging): implement staging panel and commit controller"`

---

### Task 14: Virtualized Lightweight Diff Viewer (Shiki)

**Files:**
- Create: `src/components/diff/DiffViewer.tsx`
- Create: `src/components/diff/diffParser.ts`
- Test: `tests/diffViewer.test.tsx`

**Interfaces:**
- Consumes: Raw unified diff string from IPC `git_diff`.
- Produces: Syntax-highlighted side-by-side or unified view with line numbers, addition/deletion colors, and Stage Hunk / Revert Hunk buttons.

- [x] **Step 1: Write diff parser test in `tests/diffViewer.test.ts`**
  Parse diff string with 2 hunks; assert lines correctly classified as header, addition, deletion, or context.
- [x] **Step 2: Run test to verify it fails**
  Run: `pnpm test tests/diffViewer.test.ts` -> Expected: FAIL.
- [x] **Step 3: Implement `diffParser.ts` and `DiffViewer.tsx`**
  Use `shiki` with bundled lightweight grammar for high-speed syntax highlighting. Render lines with `@tanstack/react-virtual` for large diffs. Support "Stage Hunk" button triggering `git apply --cached`.
- [x] **Step 4: Run test to verify it passes**
  Run: `pnpm test tests/diffViewer.test.ts` -> Expected: PASS.
- [x] **Step 5: Commit**
  `git add src/components/diff/ && git commit -m "feat(diff): build virtualized lightweight diff viewer with shiki highlighting"`

---

### Task 15: Realtime CLI Command Bridge & Embedded Terminal

**Files:**
- Create: `src/components/cli-bridge/CommandBridgeDrawer.tsx`
- Create: `src/components/cli-bridge/EmbeddedTerminal.tsx`
- Test: `tests/cliBridge.test.tsx`

**Interfaces:**
- Consumes: Current CLI preview string from `gitStore` and PTY IPC events.
- Produces: Collapsible bottom drawer showing realtime Git CLI command, "Copy CLI" button, "Explain Flags" popover, and toggleable interactive `@xterm/xterm` terminal.

- [x] **Step 1: Write CLI bridge component test in `tests/cliBridge.test.tsx`**
  Assert drawer renders command preview; clicking "Copy" invokes clipboard API; toggling terminal mounts xterm container.
- [x] **Step 2: Run test to verify it fails**
  Run: `pnpm test tests/cliBridge.test.tsx` -> Expected: FAIL.
- [x] **Step 3: Implement `CommandBridgeDrawer.tsx` and `EmbeddedTerminal.tsx`**
  Connect xterm.js instance with Tauri PTY IPC channels (`write_to_pty`, `pty-data`). Format git command explanation tooltips.
- [x] **Step 4: Run test to verify it passes**
  Run: `pnpm test tests/cliBridge.test.tsx` -> Expected: PASS.
- [x] **Step 5: Commit**
  `git add src/components/cli-bridge/ && git commit -m "feat(cli): implement realtime CLI command bridge and embedded xterm drawer"`

---

### Task 16: Safe Undo Reflog Time Machine Modal & Simulation Preview

**Files:**
- Create: `src/components/undo/UndoModal.tsx`
- Create: `src/components/undo/SimulationPrompt.tsx`
- Test: `tests/undoModal.test.tsx`

**Interfaces:**
- Consumes: Undo snapshots from `get_undo_stack`.
- Produces: Safe Undo drawer showing recovery timeline, 1-Click Rollback button with inverse command preview (`git reset --hard HEAD@{1}`), and Simulation warning modal before dangerous commands.

- [x] **Step 1: Write UndoModal test in `tests/undoModal.test.tsx`**
  Render `UndoModal` with 2 snapshots; assert clicking "Rollback" invokes `rollback_snapshot`.
- [x] **Step 2: Run test to verify it fails**
  Run: `pnpm test tests/undoModal.test.tsx` -> Expected: FAIL.
- [x] **Step 3: Implement `UndoModal.tsx` and `SimulationPrompt.tsx`**
  Display visual timeline of actions with timestamp and pre-mutation commit ID. Display red warning dialog showing orphaned commits before `reset --hard`.
- [x] **Step 4: Run test to verify it passes**
  Run: `pnpm test tests/undoModal.test.tsx` -> Expected: PASS.
- [x] **Step 5: Commit**
  `git add src/components/undo/ && git commit -m "feat(undo): build Safe Undo reflog time machine and simulation modal"`

---

### Task 17: Visual Interactive Rebase Modal

**Files:**
- Create: `src/components/rebase/InteractiveRebaseModal.tsx`
- Create: `src/components/rebase/RebaseItemRow.tsx`
- Test: `tests/rebaseModal.test.tsx`

**Interfaces:**
- Consumes: Commit range to rebase onto upstream branch.
- Produces: Modal with drag-to-reorder commits, action dropdown (`pick`, `squash`, `reword`, `drop`), commit message inline editor, and "Start Rebase" button.

- [x] **Step 1: Write rebase modal test in `tests/rebaseModal.test.tsx`**
  Render rebase modal with 3 commits; change commit 2 action to `squash`; verify payload to `execute_interactive_rebase`.
- [x] **Step 2: Run test to verify it fails**
  Run: `pnpm test tests/rebaseModal.test.tsx` -> Expected: FAIL.
- [x] **Step 3: Implement `InteractiveRebaseModal.tsx`**
  Use HTML5 drag-and-drop or pointer events to reorder rows. Connect to Tauri command `execute_interactive_rebase`.
- [x] **Step 4: Run test to verify it passes**
  Run: `pnpm test tests/rebaseModal.test.tsx` -> Expected: PASS.
- [x] **Step 5: Commit**
  `git add src/components/rebase/ && git commit -m "feat(rebase): implement visual interactive rebase modal"`

---

### Task 18: GitHub PR Studio & Fork Sync View

**Files:**
- Create: `src/components/github/PrStudio.tsx`
- Create: `src/components/github/PrDetailView.tsx`
- Create: `src/components/github/ForkSyncButton.tsx`
- Test: `tests/prStudio.test.tsx`

**Interfaces:**
- Consumes: GraphQL PR items and diff from `fetch_pull_requests`.
- Produces: PR list filterable by state, PR detail with inline diff review, comment box, Approve/Merge button, and 1-Click Fork Sync button.

- [x] **Step 1: Write PR Studio test in `tests/prStudio.test.tsx`**
  Render `PrStudio` with mock PR items; select PR -> verify `PrDetailView` displays title, author, and diff view.
- [x] **Step 2: Run test to verify it fails**
  Run: `pnpm test tests/prStudio.test.tsx` -> Expected: FAIL.
- [x] **Step 3: Implement `PrStudio.tsx` and `ForkSyncButton.tsx`**
  Render PR list with badge statuses. Implement `ForkSyncButton` calling `git fetch upstream && git merge upstream/main`.
- [x] **Step 4: Run test to verify it passes**
  Run: `pnpm test tests/prStudio.test.tsx` -> Expected: PASS.
- [x] **Step 5: Commit**
  `git add src/components/github/ && git commit -m "feat(github): implement GitHub PR studio and 1-click fork sync"`

---

### Task 19: End-to-End Integration Test Suite

**Files:**
- Create: `tests/e2e/workflow.test.ts`
- Modify: `package.json` (add `test:e2e` script)

**Interfaces:**
- Consumes: Complete assembled Tauri application.
- Produces: Automated verification of full developer journey on a real temporary git repository.

- [x] **Step 1: Write complete workflow integration test**
  Automates:
  1. Open temp repo.
  2. Stage modified files and commit with GUI command bridge.
  3. Create and switch to new branch `feature/test`.
  4. Perform a merge and inspect DAG graph lane allocation.
  5. Perform an unsafe `reset --hard` and execute 1-Click Safe Undo to recover code.
- [x] **Step 2: Run test to verify it fails before wiring**
  Run: `pnpm test:e2e` -> Expected: FAIL.
- [x] **Step 3: Wire frontend-backend bridge in `src/App.tsx` and `src-tauri/src/main.rs`**
  Register all Tauri IPC commands (`open_repository`, `list_branches`, `build_commit_graph`, `execute_git_command`, `capture_pre_mutation_snapshot`, `rollback_snapshot`, `execute_interactive_rebase`, `fetch_pull_requests`, `create_pty_session`).
- [x] **Step 4: Run test to verify it passes**
  Run: `pnpm test:e2e` -> Expected: ALL PASS.
- [x] **Step 5: Commit**
  `git add tests/ src/ src-tauri/ && git commit -m "test(e2e): verify end-to-end git workflow and undo recovery"`

---

### Task 20: Windows Packaging, Performance & Bundle Audit

**Files:**
- Create: `scripts/audit_bundle.js`
- Modify: `src-tauri/tauri.conf.json`
- Test: `tests/perf_audit.test.ts`

**Interfaces:**
- Consumes: Production build artifacts.
- Produces: Validated installer/executable meeting < 20MB bundle and < 90MB idle RAM.

- [x] **Step 1: Write bundle size and performance threshold test**
  Asserts production binary size < 20MB and frontend JS bundle < 1.5MB gzip.
- [x] **Step 2: Run test to verify**
  Run: `node scripts/audit_bundle.js` -> Expected: PASS.
- [x] **Step 3: Configure release profile in `src-tauri/Cargo.toml`**
  Set `opt-level = "z"`, `lto = true`, `codegen-units = 1`, `panic = "abort"`, `strip = true` for minimum binary size.
- [x] **Step 4: Verify build succeeds**
  Run: `pnpm build` -> Expected: Clean build with zero warnings.
- [x] **Step 5: Commit**
  `git add scripts/ src-tauri/ && git commit -m "chore(release): configure binary size optimizations and bundle audit"`

---

## Verification Plan

### Automated Tests
- Unit & Integration tests for Rust Git Engine: `cargo test`
- Frontend UI & virtualized canvas tests: `pnpm test`
- End-to-end git workflow test: `pnpm test:e2e`

### Manual Verification
1. Open a real repository with 10,000+ commits (e.g. VS Code or React repo) in GitShow:
   - Check DAG rendering frame rate (should maintain 60fps pan/zoom).
   - Verify RAM in Task Manager is < 90MB.
2. Safe Undo stress test:
   - Make uncommitted edits in 2 files.
   - Run `git reset --hard HEAD~1` from UI.
   - Click "Safe Undo" button: Verify both the commit and uncommitted edits are restored perfectly.
3. Interactive Rebase test:
   - Select 3 commits -> Reorder -> Squash -> Apply: Verify git log history matches without opening Vim terminal.
4. GitHub PR Studio test:
   - Log in via Device OAuth flow.
   - Open PR, inspect diff with Shiki syntax highlighting, and post a review comment.
