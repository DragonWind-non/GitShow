import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { Sidebar } from '../src/components/layout/Sidebar';
import { App } from '../src/App';
import { useGitStore } from '../src/store/gitStore';

describe('Task 3: Sidebar and App Banner Localization', () => {
  beforeEach(() => {
    act(() => {
      useGitStore.setState({
        language: 'en',
        repoInfo: null,
        branches: [],
        tags: [],
        stashes: [],
        activeView: 'history',
      });
    });
  });

  it('renders Sidebar navigation labels in English by default and switches to Vietnamese', () => {
    render(<Sidebar />);

    const navHistory = screen.getByTestId('nav-history');
    expect(navHistory.textContent).toContain('History & DAG');

    const navRebase = screen.getByTestId('nav-rebase');
    expect(navRebase.textContent).toContain('Interactive Rebase');

    const navPr = screen.getByTestId('nav-pull-requests');
    expect(navPr.textContent).toContain('Pull Requests');

    const navUndo = screen.getByTestId('nav-undo');
    expect(navUndo.textContent).toContain('Undo & Reflog');

    // Switch to Vietnamese
    act(() => {
      useGitStore.getState().setLanguage('vi');
    });

    expect(navHistory.textContent).toContain('Lịch sử & Đồ thị DAG');
    // Git technical terms remain in English
    expect(navRebase.textContent).toContain('Interactive Rebase');
    expect(navPr.textContent).toContain('Pull Requests');
    expect(navUndo.textContent).toContain('Undo & Reflog');
  });

  it('localizes branch/tag/stash section headers in Sidebar', () => {
    render(<Sidebar />);

    expect(screen.getByText('Local Branches')).toBeDefined();
    expect(screen.getByText('Remote Branches')).toBeDefined();
    expect(screen.getByText('Tags')).toBeDefined();
    expect(screen.getByText('Stashes')).toBeDefined();

    act(() => {
      useGitStore.getState().setLanguage('vi');
    });

    expect(screen.getByText('Nhánh Local')).toBeDefined();
    expect(screen.getByText('Nhánh Remote')).toBeDefined();
    expect(screen.getByText('Thẻ Tags')).toBeDefined();
    expect(screen.getByText('Bản lưu Stash')).toBeDefined();
  });

  it('localizes App open repository banner and placeholder', () => {
    render(<App />);

    const banner = screen.getByTestId('open-repo-banner');
    expect(banner.textContent).toContain('No repository opened');
    expect(banner.textContent).toContain('Open Repository');
    expect(screen.getByPlaceholderText('Enter local repo path...')).toBeDefined();

    act(() => {
      useGitStore.getState().setLanguage('vi');
    });

    expect(banner.textContent).toContain('Chưa mở repository');
    expect(banner.textContent).toContain('Mở Repository');
    expect(screen.getByPlaceholderText('Nhập đường dẫn repo local...')).toBeDefined();
  });
});
