# GitShow Bilingual (VI/EN) i18n Specification & Design

## 1. Intent & The Why
GitShow is targeted at both Vietnamese developers and global developers. To provide an intuitive, friction-free onboarding experience while respecting established developer habits:
- Technical Git terms (`commit`, `branch`, `checkout`, `merge`, `rebase`, `stash`, `cherry-pick`, `HEAD`, `diff`, `stage/unstage`, `pull request`) remain in international English.
- All descriptive UI copy, action labels, explanations, dialogs, warnings, and tooltips are localized seamlessly between Vietnamese (`vi`) and English (`en`).
- The user can switch between languages instantly with a 1-click toggle in the TopBar without page reload.

## 2. Goals, Non-Goals, and Anti-Goals
### Goals:
- **Zero Heavy Dependencies**: Implement lightweight, zero-dependency type-safe dictionary pattern (~3KB gzip). No `i18next` or heavy runtime formatters that inflate bundle size.
- **Persistence**: Save user's language preference in `localStorage` under key `gitshow_language` with fallback to browser language (`vi` if `navigator.language` starts with `vi`, otherwise `en`).
- **Strict Git Terminology Invariant**: Never translate standard Git keywords into awkward Vietnamese words (e.g., do NOT translate "commit" to "cam kết", "branch" to "nhánh cây", or "checkout" to "thanh toán").
- **TopBar Placement**: Place language switch pill `[ 🇻🇳 VI | 🇬🇧 EN ]` directly adjacent to the Sun/Moon theme toggle in `TopBar.tsx`.
- **Comprehensive Coverage**: Localize:
  1. TopBar (tooltips, search placeholder, repo clean/dirty status).
  2. Sidebar (views: History & DAG, Interactive Rebase, Pull Requests, Undo & Reflog; sections: Local Branches, Remote Branches, Tags, Stashes).
  3. App Header & Banner (No repository opened, Open Repository button, error messages).
  4. DAG Canvas & Context Menu (Checkout this commit, Merge into current HEAD, Rebase current branch onto this, Cherry-pick commit, empty state).
  5. Staging Panel & Commit Box (Staged Changes, Unstaged Changes, Stage All, Unstage All, Commit message placeholder, Amend, Commit button).
  6. Diff Viewer (Changes in commit, working copy diff, additions/deletions counter).
  7. CLI Bridge & Drawer (CLI preview, Copy CLI, Explain flags, Open terminal).
  8. Safe Undo Modal (Snapshot timeline, 1-Click Rollback, dangerous operation warning).
  9. Interactive Rebase Modal (Drag to reorder instructions, action dropdowns, Start Rebase).
  10. GitHub PR Studio & Fork Sync (PR state filters, Fork Sync button, Device OAuth login status).

### Non-Goals:
- Supporting arbitrary number of languages (focus exclusively on Vietnamese and English).
- Translating git command outputs returned verbatim from `git CLI` (stdout/stderr remains system git output).

### Anti-Goals:
- Breaking existing tests or changing component test IDs (`data-testid`).
- Adding runtime overhead or re-render lag to the 60fps Canvas DAG.

## 3. Architecture & Data Flow
1. **Types & Dictionary**:
   - `src/i18n/translations.ts`:
     - `export type Language = 'en' | 'vi';`
     - `export type TranslationKey = keyof typeof translations.en;`
     - Strongly typed dictionary ensuring compile-time check that `vi` and `en` have identical keys.
2. **Zustand Store Integration**:
   - Add `language: Language` to `GitStoreState` in `src/store/gitStore.ts`.
   - Add `setLanguage: (lang: Language) => void`.
   - Initialize from `localStorage.getItem('gitshow_language') || (navigator.language.startsWith('vi') ? 'vi' : 'en')`.
   - Update `localStorage` upon calling `setLanguage`.
3. **Translation Hook**:
   - `export function useTranslation() { ... }` or typed helper `t(key: TranslationKey): string`.

## 4. Review Focus & Quality Safeguards
- All 112 existing frontend tests must continue to pass.
- Add dedicated test suite `tests/i18n.test.ts` verifying translation completeness, persistence, and reactive switching.
- Bundle size must remain well within the 1.5MB budget (audit script must pass).
