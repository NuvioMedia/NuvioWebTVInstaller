const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nuvioInstaller", {
  getConfig: () => ipcRenderer.invoke("installer:getConfig"),
  run: (request) => ipcRenderer.invoke("installer:run", request),
  onLog: (callback) => {
    ipcRenderer.on("installer:log", (_event, payload) => callback(payload));
  }
});
