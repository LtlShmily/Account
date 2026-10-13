export interface Banquet {
  id: string
  name: string
  date: string
  location: string
  note: string
  guests: GuestGift[]
}

export interface GuestGift {
  id: string
  name: string
  amount: number
  address: string
  date: string
}

export interface OutgoingGift {
  id: string
  name: string
  amount: number
  address: string
  date: string
  note: string
}

export interface LedgerData {
  version: 1
  banquets: Banquet[]
  outgoing: OutgoingGift[]
}

const STORAGE_KEY = 'gift-ledger-v1'

export function ensureStore(): LedgerData {
  const value = wx.getStorageSync(STORAGE_KEY) as Partial<LedgerData> | undefined
  if (value && value.version === 1 && Array.isArray(value.banquets) && Array.isArray(value.outgoing)) {
    return value as LedgerData
  }
  const fresh: LedgerData = { version: 1, banquets: [], outgoing: [] }
  wx.setStorageSync(STORAGE_KEY, fresh)
  return fresh
}

export function getLedger(): LedgerData {
  return ensureStore()
}

export function saveLedger(data: LedgerData): void {
  wx.setStorageSync(STORAGE_KEY, data)
}

export function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function today(): string {
  const date = new Date()
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function currentMonth(): string {
  return today().slice(0, 7)
}

export function money(cents: number): string {
  return (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function parseAmount(value: string): number | null {
  const normalized = value.trim().replace(/，/g, '.').replace(/,/g, '.')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null
  const amount = Math.round(Number(normalized) * 100)
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null
}

export function banquetTotal(banquet: Banquet): number {
  return banquet.guests.reduce((sum, guest) => sum + guest.amount, 0)
}

export function totals(data: LedgerData): { received: number; sent: number; balance: number } {
  const received = data.banquets.reduce((sum, banquet) => sum + banquetTotal(banquet), 0)
  const sent = data.outgoing.reduce((sum, gift) => sum + gift.amount, 0)
  return { received, sent, balance: received - sent }
}

export function formatDate(date: string): string {
  return date.replace(/-/g, '.')
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}
