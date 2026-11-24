const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mascot', {
  dragStart: () => ipcRenderer.send('drag:start'),
  dragEnd: () => ipcRenderer.send('drag:end'),
  showMenu: () => ipcRenderer.send('menu:show'),
  setInteractive: (value) => ipcRenderer.send('window:interactive', value),
});
