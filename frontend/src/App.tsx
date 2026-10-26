import React, { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { App as AntdApp } from 'antd';
import { ThemedApp } from './theme';
import { Home } from './pages/Home';
import { Settings } from './pages/Settings';
import './styles.css';

const App: React.FC = () => {
  useEffect(() => {
    document.title = 'Cowan Panel';
  }, []);
  return (
    <ThemedApp>
      <AntdApp>
        <HashRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </AntdApp>
    </ThemedApp>
  );
};

export default App;
