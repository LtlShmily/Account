import { formatDate, getLedger, getPersonTransactions, money } from '../../services/ledger'

interface TransactionRow {
  key: string
  id: string
  type: 'income' | 'expense'
  typeLabel: string
  typeMark: string
  amountPrefix: string
  date: string
  amount: string
  context: string
  address: string
  gift: string
  sourceId: string
}

Page({
  data: {
    name: '',
    initial: '',
    income: '0.00',
    expense: '0.00',
    balance: '0.00',
    balanceClass: 'person-balance-positive',
    rows: [] as TransactionRow[],
  },
  onLoad(query: Record<string, string | undefined>) {
    let name = query.name || ''
    try { name = decodeURIComponent(name) } catch (_) { /* Keep the route value if decoding fails. */ }
    this.setData({ name, initial: name.slice(0, 1) })
  },
  onReady() { wx.setNavigationBarTitle({ title: `${this.data.name} 统计详情` }) },
  onShow() { this.refresh() },
  refresh() {
    const name = this.data.name
    if (!name) return
    const transactions = getPersonTransactions(name)
    const income = transactions.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount, 0)
    const expense = transactions.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0)
    const rows = transactions.map((item) => ({
      key: `${item.type}-${item.id}`,
      id: item.id,
      type: item.type,
      typeLabel: item.type === 'income' ? '收取礼金' : '送出礼金',
      typeMark: item.type === 'income' ? '收' : '支',
      amountPrefix: item.type === 'income' ? '+' : '−',
      date: formatDate(item.date),
      amount: money(item.amount),
      context: item.type === 'income' ? item.banquetName : '送给 ' + name,
      address: item.address,
      gift: item.gift,
      sourceId: item.type === 'income' ? item.banquetId : item.id,
    }))
    this.setData({
      income: money(income),
      expense: money(expense),
      balance: money(income - expense),
      balanceClass: income < expense ? 'person-balance-negative' : 'person-balance-positive',
      rows,
    })
  },
  openSource(e: WechatMiniprogram.TouchEvent) {
    const type = String(e.currentTarget.dataset.type || '')
    const id = String(e.currentTarget.dataset.id || '')
    if (type === 'income') {
      const banquet = getLedger().banquets.find((item) => item.guests.some((guest) => guest.id === id))
      if (banquet) wx.navigateTo({ url: `/pages/banquet-detail/banquet-detail?id=${encodeURIComponent(banquet.id)}&guestId=${encodeURIComponent(id)}` })
      else wx.showToast({ title: '这笔收礼记录已不存在', icon: 'none' })
      return
    }
    if (type === 'expense') {
      const exists = getLedger().outgoing.some((gift) => gift.id === id)
      if (exists) wx.navigateTo({ url: `/pages/outgoing-form/outgoing-form?id=${encodeURIComponent(id)}` })
      else wx.showToast({ title: '这笔送礼记录已不存在', icon: 'none' })
    }
  },
})
