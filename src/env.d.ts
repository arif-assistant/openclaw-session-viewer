/// <reference types="vite/client" />

interface ElectronAPI {
  getVersion: () => Promise<string>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
