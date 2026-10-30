import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { LanguageToggle } from '../src/components/layout/LanguageToggle';
import { TopBar } from '../src/components/layout/TopBar';
import { useGitStore } from '../src/store/gitStore';

describe('Task 2: Language Switch Component & TopBar Integration', () => {
  beforeEach(() => {
    act(() => {
      useGitStore.setState({ language: 'en', theme: 'dark', repoInfo: null, cliPreview: '' });
    });
  });

  it('renders LanguageToggle with VI and EN buttons', () => {
    render(<LanguageToggle />);

    const toggle = screen.getByTestId('language-toggle');
    expect(toggle).toBeDefined();

    const btnVi = screen.getByTestId('lang-vi-btn');
    const btnEn = screen.getByTestId('lang-en-btn');

    expect(btnVi).toBeDefined();
    expect(btnEn).toBeDefined();
  });

  it('switches language when clicking VI or EN buttons', () => {
    render(<LanguageToggle />);

    const btnVi = screen.getByTestId('lang-vi-btn');
    fireEvent.click(btnVi);

    expect(useGitStore.getState().language).toBe('vi');

    const btnEn = screen.getByTestId('lang-en-btn');
    fireEvent.click(btnEn);

    expect(useGitStore.getState().language).toBe('en');
  });

  it('renders LanguageToggle in TopBar next to the theme toggle', () => {
    render(<TopBar />);

    expect(screen.getByTestId('language-toggle')).toBeDefined();
    expect(screen.getByTestId('topbar')).toBeDefined();
  });

  it('localizes TopBar tooltips and placeholders reactively when language changes', () => {
    render(<TopBar />);

    const searchInput = screen.getByPlaceholderText('Search commits, branches, tags...');
    expect(searchInput).toBeDefined();

    act(() => {
      useGitStore.getState().setLanguage('vi');
    });

    const searchInputVi = screen.getByPlaceholderText('Tìm kiếm commit, branch, tag...');
    expect(searchInputVi).toBeDefined();
  });
});
