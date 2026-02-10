import React, { useState } from 'react';
import { ProcessLibrary } from './pages/ProcessLibrary';
import { Editor } from './pages/Editor';
import { Process } from './services/api';
import './App.css';

type ThemeMode = 'light' | 'dark';
const THEME_STORAGE_KEY = 'tottal_bpm_theme_mode';

function App() {
  const [selectedProcess, setSelectedProcess] = useState<Process | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'light';
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return storedTheme === 'dark' ? 'dark' : 'light';
  });

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'));
  };

  return (
    <div className="app-shell">
      {selectedProcess ? (
        <Editor
          process={selectedProcess}
          onBack={() => setSelectedProcess(null)}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      ) : (
        <ProcessLibrary onSelectProcess={setSelectedProcess} theme={theme} onToggleTheme={toggleTheme} />
      )}
    </div>
  );
}

export default App;
