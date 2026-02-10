import React, { useState } from 'react';
import { ProcessLibrary } from './pages/ProcessLibrary';
import { Editor } from './pages/Editor';
import { Process } from './services/api';
import './App.css';

function App() {
  const [selectedProcess, setSelectedProcess] = useState<Process | null>(null);

  return (
    <div className="h-screen w-screen bg-gray-50">
      {selectedProcess ? (
        <Editor process={selectedProcess} onBack={() => setSelectedProcess(null)} />
      ) : (
        <ProcessLibrary onSelectProcess={setSelectedProcess} />
      )}
    </div>
  );
}

export default App;
