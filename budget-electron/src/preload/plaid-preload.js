import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('plaidBridge', {
  sendResult: (data) => ipcRenderer.send('plaid:popup-result', data)
})
