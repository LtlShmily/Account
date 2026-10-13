import { getLedger, getPeopleSummary, money, totals } from '../../services/ledger'
import { pinyinInitial, pinyinSortKey } from '../../services/pinyin'

interface PersonRow {
  key: string
  name: string
  initial: string
  anchorId: string
  income: string
  expense: string
  balance: string
  balanceClass: string
}

interface IndexLetter { letter: string; active: boolean }

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const INDEX_ORDER = `${ALPHABET}#`

function compareText(first: string, second: string): number {
  if (first < second) return -1
  if (first > second) return 1
  return 0
}

Page({
  data: {
    keyword: '',
    received: '0.00',
    sent: '0.00',
    balance: '0.00',
    rows: [] as PersonRow[],
    indexLetters: [] as IndexLetter[],
  },
  onShow() { this.refresh() },
  search(e: WechatMiniprogram.Input) { this.setData({ keyword: e.detail.value }, () => this.refresh()) },
  refresh() {
    const totalsValue = totals(getLedger())
    const keyword = this.data.keyword.trim().toLocaleLowerCase()
    const rowsWithInitial = getPeopleSummary()
      .filter((person) => !keyword || person.name.toLocaleLowerCase().includes(keyword))
      .map((person) => ({ person, initial: pinyinInitial(person.name), sortKey: pinyinSortKey(person.name) }))
      .sort((a, b) => INDEX_ORDER.indexOf(a.initial) - INDEX_ORDER.indexOf(b.initial)
        || compareText(a.sortKey, b.sortKey)
        || compareText(a.person.name, b.person.name))
    let previousInitial = ''
    const rows = rowsWithInitial.map(({ person, initial }) => {
      const anchorId = initial === previousInitial ? '' : `person-index-${initial === '#' ? 'other' : initial}`
      previousInitial = initial
      return {
        key: person.name.toLocaleLowerCase(),
        name: person.name,
        initial,
        anchorId,
        income: money(person.income),
        expense: money(person.expense),
        balance: money(person.balance),
        balanceClass: person.balance < 0 ? 'person-balance-negative' : 'person-balance-positive',
      }
    })
    const activeLetters = new Set(rows.map((row) => row.initial))
    const indexLetters = [...ALPHABET, '#'].map((letter) => ({ letter, active: activeLetters.has(letter) }))
    this.setData({ received: money(totalsValue.received), sent: money(totalsValue.sent), balance: money(totalsValue.balance), rows, indexLetters })
  },
  jumpToLetter(e: WechatMiniprogram.TouchEvent) {
    const letter = String(e.currentTarget.dataset.letter || '')
    const anchorId = letter === '#' ? 'person-index-other' : `person-index-${letter}`
    if (!this.data.rows.some((row) => row.initial === letter)) return
    wx.pageScrollTo({ selector: `#${anchorId}`, duration: 300 })
  },
  openPerson(e: WechatMiniprogram.TouchEvent) {
    const name = String(e.currentTarget.dataset.name || '')
    if (!name) return
    wx.navigateTo({ url: `/pages/person-detail/person-detail?name=${encodeURIComponent(name)}` })
  },
})
