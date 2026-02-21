import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  getCategories: () => ipcRenderer.invoke('excel:get-categories'),
  saveCategories: (data) => ipcRenderer.invoke('excel:save-categories', data),

  getTransactions: () => ipcRenderer.invoke('excel:get-transactions'),
  addTransaction: (data) => ipcRenderer.invoke('excel:add-transaction', data),
  editTransaction: (data) => ipcRenderer.invoke('excel:edit-transaction', data),
  deleteTransaction: (data) => ipcRenderer.invoke('excel:delete-transaction', data),

  getYearChart: (data) => ipcRenderer.invoke('excel:get-year-chart', data),
  ensureYearSheet: (data) => ipcRenderer.invoke('excel:ensure-year-sheet', data),
  getYears: () => ipcRenderer.invoke('excel:get-years'),

  getExpectations: (data) => ipcRenderer.invoke('excel:get-expectations', data),
  saveExpectations: (data) => ipcRenderer.invoke('excel:save-expectations', data),

  pickFile: () => ipcRenderer.invoke('excel:pick-file')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (e) {
    console.error(e)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
