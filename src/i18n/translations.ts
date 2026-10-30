export type Language = 'en' | 'vi';

export const translations = {
  en: {
    // TopBar
    brandTitle: 'GitShow Studio',
    detachedHead: 'Detached HEAD',
    noBranch: 'No branch',
    topbarFetchTooltip: 'Fetch all remotes and prune',
    topbarPullTooltip: 'Pull with rebase',
    topbarPushTooltip: 'Push commits to remote',
    topbarNewBranchTooltip: 'Create new branch',
    topbarStashTooltip: 'Stash uncommitted changes',
    topbarSearchPlaceholder: 'Search commits, branches, tags...',
    toggleTheme: 'Toggle theme',
    toggleTerminal: 'Toggle embedded terminal',
    toggleLanguage: 'Switch language',

    // Banner / App Header
    bannerNoRepo: 'No repository opened',
    bannerInputPlaceholder: 'Enter local repo path...',
    bannerOpenBtn: 'Open Repository',
    bannerOpening: 'Opening...',

    // Sidebar
    repoHeader: 'Repository',
    statusClean: 'Clean',
    statusDirty: 'Dirty',
    navHistory: 'History & DAG',
    navRebase: 'Interactive Rebase',
    navPullRequests: 'Pull Requests',
    navUndo: 'Undo & Reflog',
    sectionLocalBranches: 'Local Branches',
    sectionRemoteBranches: 'Remote Branches',
    sectionTags: 'Tags',
    sectionStashes: 'Stashes',
    emptyBranches: 'No branches found',
    emptyTags: 'No tags',
    emptyStashes: 'No stashes',

    // DAG Canvas Context Menu & Empty
    dagEmpty: 'No commits found in current branch',
    menuCommitPrefix: 'Commit',
    menuCheckout: 'Checkout this commit',
    menuMerge: 'Merge into current HEAD',
    menuRebase: 'Rebase current branch onto this',
    menuCherryPick: 'Cherry-pick commit',

    // Staging & Commit Box
    stagingTitle: 'Changes & Staging',
    stagingStaged: 'Staged Changes',
    stagingUnstaged: 'Changes',
    stagingStageAll: 'Stage All',
    stagingUnstageAll: 'Unstage All',
    stagingCommitPlaceholder: 'Commit message (e.g. feat: add new feature)...',
    stagingAmend: 'Amend previous commit',
    stagingCommitBtn: 'Commit',
    stagingEmptyWorkingTree: 'Working tree clean, no changes detected',

    // Diff Viewer
    diffChangesIn: 'Changes in',
    diffWorkingCopy: 'Working Copy Diff',
    diffNoChanges: 'No changes detected',
    diffSelectFile: 'Select a modified file to view diff',
    diffNoFiles: 'No files modified in this commit',
    diffStageHunk: 'Stage Hunk',
    diffRevertHunk: 'Revert Hunk',

    // CLI Bridge Drawer
    cliBridgeTitle: 'Realtime Git CLI Bridge',
    cliCopyBtn: 'Copy CLI',
    cliCopied: 'Copied!',
    cliExplainFlags: 'Explain Flags',
    cliOpenTerminal: 'Open Terminal',
    cliCloseTerminal: 'Close Terminal',

    // Safe Undo Modal
    undoModalTitle: 'Reflog Time Machine (Safe Undo)',
    undoModalDesc: 'Pre-mutation snapshots capturing HEAD and uncommitted work',
    undoRollbackBtn: 'Rollback',
    undoRollingBack: 'Rolling back...',
    undoEmpty: 'No undo snapshots available for this repository',
    undoWarningTitle: 'Simulation Preview — Destructive Action',
    undoWarningConfirm: 'Proceed with mutation',
    undoWarningCancel: 'Cancel operation',

    // Interactive Rebase
    rebaseTitle: 'Interactive Rebase Studio',
    rebaseDesc: 'Drag to reorder commits, choose actions, or squash without Vim prompts',
    rebaseStartBtn: 'Start Rebase',
    rebaseExecuting: 'Rebasing...',
    rebaseCancelBtn: 'Cancel',

    // GitHub PR Studio
    prTitle: 'GitHub PR Studio',
    prSyncFork: 'Sync Fork',
    prSyncing: 'Syncing...',
    prLoginBtn: 'Login with GitHub',
    prStateOpen: 'Open',
    prStateClosed: 'Closed',
    prStateMerged: 'Merged',
    prNoReviews: 'No pull requests found',
  },

  vi: {
    // TopBar
    brandTitle: 'GitShow Studio',
    detachedHead: 'Detached HEAD',
    noBranch: 'Không có branch',
    topbarFetchTooltip: 'Fetch tất cả remote và dọn dẹp',
    topbarPullTooltip: 'Pull kèm rebase',
    topbarPushTooltip: 'Push commit lên remote',
    topbarNewBranchTooltip: 'Tạo branch mới',
    topbarStashTooltip: 'Lưu tạm stash thay đổi',
    topbarSearchPlaceholder: 'Tìm kiếm commit, branch, tag...',
    toggleTheme: 'Đổi giao diện Sáng / Tối',
    toggleTerminal: 'Bật/tắt terminal tích hợp',
    toggleLanguage: 'Chuyển đổi ngôn ngữ',

    // Banner / App Header
    bannerNoRepo: 'Chưa mở repository',
    bannerInputPlaceholder: 'Nhập đường dẫn repo local...',
    bannerOpenBtn: 'Mở Repository',
    bannerOpening: 'Đang mở...',

    // Sidebar
    repoHeader: 'Repository',
    statusClean: 'Sạch',
    statusDirty: 'Có thay đổi',
    navHistory: 'Lịch sử & Đồ thị DAG',
    navRebase: 'Interactive Rebase',
    navPullRequests: 'Pull Requests',
    navUndo: 'Undo & Reflog',
    sectionLocalBranches: 'Nhánh Local',
    sectionRemoteBranches: 'Nhánh Remote',
    sectionTags: 'Thẻ Tags',
    sectionStashes: 'Bản lưu Stash',
    emptyBranches: 'Không tìm thấy branch nào',
    emptyTags: 'Chưa có tag nào',
    emptyStashes: 'Chưa có stash nào',

    // DAG Canvas Context Menu & Empty
    dagEmpty: 'Không có commit nào trong branch hiện tại',
    menuCommitPrefix: 'Commit',
    menuCheckout: 'Checkout commit này',
    menuMerge: 'Merge vào nhánh HEAD hiện tại',
    menuRebase: 'Rebase nhánh hiện tại lên commit này',
    menuCherryPick: 'Cherry-pick commit này',

    // Staging & Commit Box
    stagingTitle: 'Thay đổi & Staging',
    stagingStaged: 'Thay đổi đã Stage',
    stagingUnstaged: 'Thay đổi chưa Stage',
    stagingStageAll: 'Stage tất cả',
    stagingUnstageAll: 'Unstage tất cả',
    stagingCommitPlaceholder: 'Thông điệp commit (VD: feat: thêm tính năng mới)...',
    stagingAmend: 'Amend vào commit trước',
    stagingCommitBtn: 'Commit',
    stagingEmptyWorkingTree: 'Thư mục làm việc sạch, không có thay đổi',

    // Diff Viewer
    diffChangesIn: 'Thay đổi trong',
    diffWorkingCopy: 'Diff thư mục làm việc',
    diffNoChanges: 'Không phát hiện thay đổi nào',
    diffSelectFile: 'Chọn một file để xem diff',
    diffNoFiles: 'Không có file nào bị sửa đổi trong commit này',
    diffStageHunk: 'Stage Hunk này',
    diffRevertHunk: 'Revert Hunk này',

    // CLI Bridge Drawer
    cliBridgeTitle: 'Cầu nối Git CLI thời gian thực',
    cliCopyBtn: 'Sao chép CLI',
    cliCopied: 'Đã sao chép!',
    cliExplainFlags: 'Giải thích cờ lệnh',
    cliOpenTerminal: 'Mở Terminal',
    cliCloseTerminal: 'Đóng Terminal',

    // Safe Undo Modal
    undoModalTitle: 'Reflog Time Machine (Safe Undo)',
    undoModalDesc: 'Các snapshot lưu trước mỗi thao tác, bảo toàn cả thay đổi chưa commit',
    undoRollbackBtn: 'Rollback',
    undoRollingBack: 'Đang khôi phục...',
    undoEmpty: 'Chưa có snapshot nào cho repository này',
    undoWarningTitle: 'Cảnh báo mô phỏng',
    undoWarningConfirm: 'Xác nhận tiếp tục',
    undoWarningCancel: 'Hủy thao tác',

    // Interactive Rebase
    rebaseTitle: 'Interactive Rebase Studio',
    rebaseDesc: 'Kéo thả đổi thứ tự commit, chọn thao tác hoặc squash không cần Vim',
    rebaseStartBtn: 'Bắt đầu Rebase',
    rebaseExecuting: 'Đang thực thi Rebase...',
    rebaseCancelBtn: 'Hủy',

    // GitHub PR Studio
    prTitle: 'GitHub PR Studio',
    prSyncFork: 'Sync Fork',
    prSyncing: 'Đang đồng bộ...',
    prLoginBtn: 'Đăng nhập GitHub',
    prStateOpen: 'Đang mở',
    prStateClosed: 'Đã đóng',
    prStateMerged: 'Đã merge',
    prNoReviews: 'Không tìm thấy pull request nào',
  },
} as const;

export type TranslationKey = keyof typeof translations.en;
