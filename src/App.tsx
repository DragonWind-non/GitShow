import React, { useEffect } from 'react';
import { AppLayout } from './components/layout/AppLayout';
import { useGitStore } from './store/gitStore';

export function App() {
  const theme = useGitStore((state) => state.theme);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [theme]);

  return <AppLayout />;
}

export default App;
