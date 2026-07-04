import React, { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import './App.css';
import Brand from './components/Brand';
import { RemoteProvider } from './context/RemoteContext';
import PackageListPage from './pages/PackageListPage';
import PackageBinariesPage from './pages/PackageBinariesPage';
import PackageConfigurationPage from './pages/PackageConfigurationPage';
import CleanupPage from './pages/CleanupPage';
import { checkConfiguration } from './services/api';

function ConfigurationErrorPage() {
  return (
    <div className="App">
      <header className="App-header">
        <Brand />
        <div className="error">
          Conan API is not configured properly. Please ensure:
          <ul>
            <li>Conan is installed and configured</li>
            <li>Your Conan remotes are set up correctly</li>
            <li>The backend server can access the Conan API</li>
          </ul>
        </div>
      </header>
    </div>
  );
}

function App() {
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAppConfiguration = async () => {
      try {
        const config = await checkConfiguration();
        setIsConfigured(config.conan_api_available);
      } catch (err) {
        setIsConfigured(false);
      }
    };
    checkAppConfiguration();
  }, []);

  if (isConfigured === null) {
    return <div className="loading">Checking configuration...</div>;
  }

  if (isConfigured === false) {
    return <ConfigurationErrorPage />;
  }

  return (
    <RemoteProvider>
      <Routes>
        {/* Remote is a ?repo= query param; the path holds only package context */}
        <Route path="/" element={<PackageListPage />} />
        {/* Static segment declared before the dynamic :packageName route */}
        <Route path="/cleanup" element={<CleanupPage />} />
        <Route path="/:packageName" element={<PackageBinariesPage />} />
        <Route path="/:packageName/configuration" element={<PackageConfigurationPage />} />
      </Routes>
    </RemoteProvider>
  );
}

export default App;
