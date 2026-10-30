import React from 'react';
import { useTranslation } from '../../i18n/useTranslation';

export function LanguageToggle() {
  const { language, setLanguage, t } = useTranslation();

  return (
    <div
      data-testid="language-toggle"
      title={t('toggleLanguage')}
      className="inline-flex items-center p-0.5 rounded-md bg-slate-800/80 border border-slate-700/60 text-[11px] font-medium select-none"
    >
      <button
        type="button"
        data-testid="lang-vi-btn"
        onClick={() => setLanguage('vi')}
        className={`px-1.5 py-0.5 rounded transition-all duration-150 flex items-center gap-1 ${
          language === 'vi'
            ? 'bg-emerald-600 text-white font-semibold shadow-sm'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
        }`}
      >
        <span>🇻🇳</span>
        <span>VI</span>
      </button>
      <button
        type="button"
        data-testid="lang-en-btn"
        onClick={() => setLanguage('en')}
        className={`px-1.5 py-0.5 rounded transition-all duration-150 flex items-center gap-1 ${
          language === 'en'
            ? 'bg-blue-600 text-white font-semibold shadow-sm'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
        }`}
      >
        <span>🇬🇧</span>
        <span>EN</span>
      </button>
    </div>
  );
}

export default LanguageToggle;
