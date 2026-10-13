import { getLedger, getPeopleSummary, money, totals } from '../../services/ledger'

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

const PINYIN_LOCALE = 'zh-CN-u-co-pinyin'
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const INDEX_ORDER = `${ALPHABET}#`
const PINYIN_BOUNDARIES: Array<{ character: string; initial: string }> = [
  { character: '阿', initial: 'A' }, { character: '八', initial: 'B' }, { character: '擦', initial: 'C' },
  { character: '搭', initial: 'D' }, { character: '蛾', initial: 'E' }, { character: '发', initial: 'F' },
  { character: '噶', initial: 'G' }, { character: '哈', initial: 'H' }, { character: '击', initial: 'J' },
  { character: '喀', initial: 'K' }, { character: '垃', initial: 'L' }, { character: '妈', initial: 'M' },
  { character: '拿', initial: 'N' }, { character: '哦', initial: 'O' }, { character: '啪', initial: 'P' },
  { character: '期', initial: 'Q' }, { character: '然', initial: 'R' }, { character: '撒', initial: 'S' },
  { character: '塌', initial: 'T' }, { character: '挖', initial: 'W' }, { character: '昔', initial: 'X' },
  { character: '压', initial: 'Y' }, { character: '匝', initial: 'Z' },
]

function pinyinInitial(name: string): string {
  const first = Array.from(name.trim())[0] || ''
  const latin = first.toUpperCase()
  if (latin >= 'A' && latin <= 'Z') return latin
  const codePoint = first.codePointAt(0) || 0
  const isHan = (codePoint >= 0x3400 && codePoint <= 0x4dbf)
    || (codePoint >= 0x4e00 && codePoint <= 0x9fff)
    || (codePoint >= 0xf900 && codePoint <= 0xfaff)
    || (codePoint >= 0x20000 && codePoint <= 0x323af)
  if (!isHan) return '#'
  let initial = '#'
  for (const boundary of PINYIN_BOUNDARIES) {
    if (first.localeCompare(boundary.character, PINYIN_LOCALE, { sensitivity: 'base' }) < 0) break
    initial = boundary.initial
  }
  return initial
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
      .map((person) => ({ person, initial: pinyinInitial(person.name) }))
      .sort((a, b) => INDEX_ORDER.indexOf(a.initial) - INDEX_ORDER.indexOf(b.initial)
        || a.person.name.localeCompare(b.person.name, PINYIN_LOCALE, { sensitivity: 'base' }))
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
