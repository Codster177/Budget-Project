import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  getCategories: () => ipcRenderer.invoke('db:get-categories'),
  saveCategories: (data) => ipcRenderer.invoke('db:save-categories', data),

  getTransactions: () => ipcRenderer.invoke('db:get-transactions'),
  addTransaction: (data) => ipcRenderer.invoke('db:add-transaction', data),
  editTransaction: (data) => ipcRenderer.invoke('db:edit-transaction', data),
  deleteTransaction: (data) => ipcRenderer.invoke('db:delete-transaction', data),

  getYearChart: (data) => ipcRenderer.invoke('db:get-year-chart', data),
  getYears: () => ipcRenderer.invoke('db:get-years'),

  getExpectations: (data) => ipcRenderer.invoke('db:get-expectations', data),
  saveExpectations: (data) => ipcRenderer.invoke('db:save-expectations', data),

  getProfiles:       ()     => ipcRenderer.invoke('auth:get-profiles'),
  login:             (data) => ipcRenderer.invoke('auth:login', data),
  logout:            ()     => ipcRenderer.invoke('auth:logout'),
  createProfile:     (data) => ipcRenderer.invoke('auth:create-profile', data),
  getCurrentProfile: ()     => ipcRenderer.invoke('auth:get-current-profile'),
  deleteAccount:          ()     => ipcRenderer.invoke('auth:delete-account'),

  getDefaultCategories:   ()     => ipcRenderer.invoke('settings:get-default-categories'),
  saveDefaultCategories:  (data) => ipcRenderer.invoke('settings:save-default-categories', data),

  openPlaidLink:   ()     => ipcRenderer.invoke('plaid:open-link'),
  getPlaidItems:   ()     => ipcRenderer.invoke('plaid:get-items'),
  removePlaidItem: (data) => ipcRenderer.invoke('plaid:remove-item', data),
  syncPlaidItem:   (data) => ipcRenderer.invoke('plaid:sync', data),
  getAutoSync:     ()     => ipcRenderer.invoke('plaid:get-auto-sync'),
  setAutoSync:     (data) => ipcRenderer.invoke('plaid:set-auto-sync', data),
  setLookback:     (data) => ipcRenderer.invoke('plaid:set-lookback', data),
  onSyncComplete:  (cb)   => ipcRenderer.on('plaid:sync-complete', cb)
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
