import { getLedger, getPeopleSummary, money, totals } from '../../services/ledger'

interface PersonRow {
  key: string
  name: string
  initial: string
  income: string
  expense: string
  balance: string
  balanceClass: string
}

Page({
  data: {
    keyword: '',
    received: '0.00',
    sent: '0.00',
    balance: '0.00',
    rows: [] as PersonRow[],
  },
  onShow() { this.refresh() },
  search(e: WechatMiniprogram.Input) { this.setData({ keyword: e.detail.value }, () => this.refresh()) },
  refresh() {
    const totalsValue = totals(getLedger())
    const keyword = this.data.keyword.trim().toLocaleLowerCase()
    const rows = getPeopleSummary()
      .filter((person) => !keyword || person.name.toLocaleLowerCase().includes(keyword))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      .map((person) => ({
        key: person.name.toLocaleLowerCase(),
        name: person.name,
        initial: person.name.slice(0, 1),
        income: money(person.income),
        expense: money(person.expense),
        balance: money(person.balance),
        balanceClass: person.balance < 0 ? 'person-balance-negative' : 'person-balance-positive',
      }))
    this.setData({ received: money(totalsValue.received), sent: money(totalsValue.sent), balance: money(totalsValue.balance), rows })
  },
  openPerson(e: WechatMiniprogram.TouchEvent) {
    const name = String(e.currentTarget.dataset.name || '')
    if (!name) return
    wx.navigateTo({ url: `/pages/person-detail/person-detail?name=${encodeURIComponent(name)}` })
  },
})
