export type ListDisplayMode = 'paged' | 'all'

const STORAGE_KEY = 'gift-ledger-list-display-mode'

export function getListDisplayMode(): ListDisplayMode {
  return wx.getStorageSync(STORAGE_KEY) === 'all' ? 'all' : 'paged'
}

export function setListDisplayMode(mode: ListDisplayMode): void {
  wx.setStorageSync(STORAGE_KEY, mode)
}
