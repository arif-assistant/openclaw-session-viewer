import { contextBridge, ipcRenderer } from 'electron';

/**
 * Expose a safe API to the renderer process via contextBridge.
 * No nodeIntegration — all IPC goes through this bridge.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
});
