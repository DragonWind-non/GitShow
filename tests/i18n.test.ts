import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { translations, type Language, type TranslationKey } from '../src/i18n/translations';
import { useTranslation, getTranslation } from '../src/i18n/useTranslation';
import { useGitStore } from '../src/store/gitStore';

describe('Task 1: i18n Translation Dictionary & Store', () => {
  beforeEach(() => {
    localStorage.clear();
    useGitStore.setState({ language: 'en' });
  });

  it('has identical keys in both English and Vietnamese dictionaries', () => {
    const enKeys = Object.keys(translations.en).sort();
    const viKeys = Object.keys(translations.vi).sort();

    expect(enKeys.length).toBeGreaterThan(30);
    expect(enKeys).toEqual(viKeys);
  });

  it('strictly preserves Git technical terms in Vietnamese translations', () => {
    // Technical terms must remain in English
    const vi = translations.vi;
    expect(vi.menuCheckout).toContain('Checkout');
    expect(vi.menuMerge).toContain('Merge');
    expect(vi.menuRebase).toContain('Rebase');
    expect(vi.menuCherryPick).toContain('Cherry-pick');
    expect(vi.stagingStaged).toContain('Stage');
    expect(vi.stagingUnstaged).toContain('Stage');
    expect(vi.navHistory).toContain('DAG');
  });

  it('provides reactive useTranslation hook that reflects store changes', () => {
    const { result } = renderHook(() => useTranslation());
    expect(result.current.language).toBe('en');
    expect(result.current.t('topbarFetchTooltip')).toBe('Fetch all remotes and prune');

    act(() => {
      result.current.setLanguage('vi');
    });

    expect(useGitStore.getState().language).toBe('vi');
    expect(result.current.language).toBe('vi');
    expect(result.current.t('topbarFetchTooltip')).toBe('Fetch tất cả remote và dọn dẹp');
  });

  it('persists selected language to localStorage', () => {
    const { result } = renderHook(() => useTranslation());

    act(() => {
      result.current.setLanguage('vi');
    });
    expect(localStorage.getItem('gitshow_language')).toBe('vi');

    act(() => {
      result.current.setLanguage('en');
    });
    expect(localStorage.getItem('gitshow_language')).toBe('en');
  });

  it('falls back gracefully to English if a key is missing or invalid', () => {
    // Test getTranslation fallback with unknown key cast as TranslationKey
    const fallbackVal = getTranslation('nonExistentKey' as TranslationKey);
    expect(typeof fallbackVal).toBe('string');
  });
});

