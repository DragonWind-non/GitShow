# GitShow Bilingual (VI/EN) i18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add seamless bilingual support (Vietnamese 🇻🇳 & English 🇬🇧) to GitShow with an instant 1-click toggle next to the theme toggle in the TopBar, strictly preserving standard Git technical terms while localizing all UI copy, tooltips, dialogs, and guidance.

**Architecture:** Zero-dependency type-safe dictionary pattern (~3KB gzip) integrated into the Zustand store with `localStorage` persistence. A lightweight `useTranslation()` hook supplies reactive translations across all studio components.

**Tech Stack:** React 19, TypeScript, Zustand, Tailwind CSS, Lucide Icons, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-bilingual-i18n-design.md`

## Global Constraints
- **Preserve Git Terminology**: Technical terms (`commit`, `branch`, `checkout`, `merge`, `rebase`, `stash`, `cherry-pick`, `HEAD`, `diff`, `stage/unstage`, `pull request`) must remain in English in both language modes.
- **Strict TypeScript**: 100% type safety — every key in English must exist in Vietnamese and vice-versa with TypeScript compile-time checking.
- **Zero Heavy i18n Dependencies**: Do not install external libraries like `i18next` or `react-intl`; use the internal Zustand-backed dictionary.
- **TopBar Placement**: Place the language toggle directly adjacent to the Dark/Light theme toggle button in `TopBar.tsx`.
- **Zero Regressions**: All 112 existing frontend tests and 61 backend tests must continue passing.

## Review Focus
1. **Missing key runtime fallback**: If a key is missing or undefined in a translation object, fallback gracefully to the English string; verified by dictionary test.
2. **Reactivity without canvas lag**: Toggling language must update React components without causing unnecessary Canvas redraws or resetting Canvas dimensions.
3. **Persistence in localStorage**: Switching language must write to `localStorage['gitshow_language']` and restore upon next app launch; verified by unit test.
4. **HTML test ID stability**: Retain all existing `data-testid` attributes so existing E2E and component tests never break.
5. **No awkward Vietnamese translations**: Ensure terms like `amend`, `hunk`, `fork`, `upstream` are translated contextually without loss of technical meaning.

---

### Task 1: Type-Safe Translation Dictionary & Store

**Files:**
- Create: `src/i18n/translations.ts`
- Create: `src/i18n/useTranslation.ts`
- Modify: `src/store/gitStore.ts`
- Test: `tests/i18n.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Language = 'en' | 'vi';
  export type TranslationKey = keyof typeof translations.en;
  export function useTranslation(): {
    t: (key: TranslationKey) => string;
    language: Language;
    setLanguage: (lang: Language) => void;
  };
  ```

- [ ] **Step 1: Write test for translations and store in `tests/i18n.test.ts`**
  Asserts that `translations.en` and `translations.vi` have identical keys, `useTranslation().t` returns expected strings, and `setLanguage` updates store and `localStorage`.
- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm test tests/i18n.test.ts` -> Expected: FAIL (files missing).
- [ ] **Step 3: Implement `src/i18n/translations.ts` and `src/i18n/useTranslation.ts`**
  Define complete dictionary with keys covering TopBar, Sidebar, Banner, Staging, Diff, ContextMenu, Rebase, Undo, PR Studio, and CLI Bridge.
- [ ] **Step 4: Update `src/store/gitStore.ts`**
  Add `language: Language` and `setLanguage` method to `GitStoreState`.
- [ ] **Step 5: Run test to verify it passes**
  Run: `pnpm test tests/i18n.test.ts` -> Expected: PASS.
- [ ] **Step 6: Commit**
  `git add src/ tests/ && git commit -m "feat(i18n): add type-safe translation dictionary and zustand language store"`

---

### Task 2: Language Switch Component & TopBar Integration

**Files:**
- Create: `src/components/layout/LanguageToggle.tsx`
- Modify: `src/components/layout/TopBar.tsx`
- Test: `tests/languageToggle.test.tsx`

**Interfaces:**
- Consumes: `useTranslation()`
- Produces: Segmented switch `[ 🇻🇳 VI | 🇬🇧 EN ]` with active pill highlight placed next to Sun/Moon button.

- [ ] **Step 1: Write test for `LanguageToggle` in `tests/languageToggle.test.tsx`**
  Verify clicking "VI" switches language to Vietnamese; clicking "EN" switches to English. Verify placement in `TopBar`.
- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm test tests/languageToggle.test.tsx` -> Expected: FAIL.
- [ ] **Step 3: Implement `LanguageToggle.tsx` and integrate into `TopBar.tsx`**
  Render button next to theme toggle button. Translate tooltips (Fetch, Pull, Push, New Branch, Stash, Search placeholder).
- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm test tests/languageToggle.test.tsx` -> Expected: PASS.
- [ ] **Step 5: Commit**
  `git add src/ tests/ && git commit -m "feat(i18n): implement language switch toggle in topbar"`

---

### Task 3: Sidebar, App Header & Repository Banner Localization

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Test: `tests/sidebarI18n.test.tsx`

**Interfaces:**
- Consumes: `useTranslation()`
- Produces: Localized navigation items, branch/tag sections, repo status badges, and open repo banner.

- [ ] **Step 1: Write test in `tests/sidebarI18n.test.tsx`**
  Verify Sidebar navigation labels change dynamically when language is toggled.
- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm test tests/sidebarI18n.test.tsx` -> Expected: FAIL.
- [ ] **Step 3: Update `Sidebar.tsx` and `App.tsx` with translations**
  Replace hardcoded text with `t(...)` calls. Retain exact `data-testid` values.
- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm test tests/sidebarI18n.test.tsx` -> Expected: PASS.
- [ ] **Step 5: Commit**
  `git add src/ tests/ && git commit -m "feat(i18n): localize sidebar navigation and repository banner"`

---

### Task 4: Staging Panel, Commit Box & Diff Viewer Localization

**Files:**
- Modify: `src/components/staging/StagingPanel.tsx`
- Modify: `src/components/diff/DiffViewer.tsx`
- Test: `tests/stagingI18n.test.tsx`

**Interfaces:**
- Consumes: `useTranslation()`
- Produces: Localized Staged/Unstaged headers, Stage All/Unstage All buttons, Commit Box placeholder, and Diff Viewer status.

- [ ] **Step 1: Write test in `tests/stagingI18n.test.tsx`**
  Verify Staging and Diff texts react to language toggle.
- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm test tests/stagingI18n.test.tsx` -> Expected: FAIL.
- [ ] **Step 3: Update `StagingPanel.tsx` and `DiffViewer.tsx`**
  Integrate `useTranslation()`. Ensure commit conventional commit pills and diff line rendering remain untouched.
- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm test tests/stagingI18n.test.tsx` -> Expected: PASS.
- [ ] **Step 5: Commit**
  `git add src/ tests/ && git commit -m "feat(i18n): localize staging panel, commit box, and diff viewer"`

---

### Task 5: DagCanvas Context Menu, Safe Undo, Rebase, PR Studio & CLI Bridge Localization

**Files:**
- Modify: `src/components/graph/DagCanvas.tsx`
- Modify: `src/components/undo/UndoModal.tsx`
- Modify: `src/components/undo/SimulationPrompt.tsx`
- Modify: `src/components/rebase/InteractiveRebaseModal.tsx`
- Modify: `src/components/github/PrStudio.tsx`
- Modify: `src/components/github/ForkSyncButton.tsx`
- Modify: `src/components/cli-bridge/CommandBridgeDrawer.tsx`
- Test: `tests/bilingual_e2e.test.tsx`

**Interfaces:**
- Consumes: `useTranslation()`
- Produces: 100% localized modals, interactive rebase drag guidance, Safe Undo reflog rollback actions, GitHub PR Studio review interface, and CLI Bridge tooltips.

- [ ] **Step 1: Write bilingual end-to-end integration test in `tests/bilingual_e2e.test.tsx`**
  Verify switching to Vietnamese changes all menus, modals, and drawers across the studio.
- [ ] **Step 2: Run test to verify it fails**
  Run: `pnpm test tests/bilingual_e2e.test.tsx` -> Expected: FAIL.
- [ ] **Step 3: Update DagCanvas, Undo, Rebase, PR Studio, and CLI Bridge components**
  Use `t(...)` for all user-facing strings while strictly preserving Git command lines and technical names.
- [ ] **Step 4: Run test to verify it passes**
  Run: `pnpm test tests/bilingual_e2e.test.tsx` -> Expected: PASS.
- [ ] **Step 5: Commit**
  `git add src/ tests/ && git commit -m "feat(i18n): localize canvas context menu, rebase, safe undo, and pr studio"`

---

### Task 6: Audit & Full Regression Suite Verification

**Files:**
- Test: Full Vitest suite & Rust suite

- [ ] **Step 1: Run all frontend tests**
  Run: `pnpm test` -> Expected: 100% PASS with zero regressions across all suites.
- [ ] **Step 2: Run all Rust backend tests**
  Run: `cargo test --manifest-path src-tauri/Cargo.toml` -> Expected: 61/61 PASS.
- [ ] **Step 3: Run packaging and bundle audit**
  Run: `pnpm audit:bundle` -> Expected: PASS (< 1.5MB gzip).
- [ ] **Step 4: Final commit & status check**
  `git status` clean, all changes committed.
