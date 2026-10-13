import { currentMonth, formatDate, getLedger, money, saveLedger } from '../../services/ledger'
interface GiftView { id: string; name: string; amount: string; address: string; date: string }
Page({
  data: { items: [] as GiftView[], months: [] as string[], monthIndex: 0, keyword: '', total: '0.00', resultCount: 0 },
  onShow() { this.refresh() },
  refresh() {
    const ledger = getLedger()
    const uniqueMonths = Array.from(new Set(ledger.outgoing.map((gift) => gift.date.slice(0, 7)))).sort().reverse()
    const months = [`${currentMonth()}（本月）`, '全部月份', ...uniqueMonths.filter((month) => month !== currentMonth())]
    const selected = this.data.monthIndex === 1 ? '' : this.data.monthIndex === 0 ? currentMonth() : months[this.data.monthIndex]
    const keyword = this.data.keyword.trim().toLocaleLowerCase()
    const matched = ledger.outgoing.filter((gift) => (!selected || gift.date.startsWith(selected)) && (!keyword || gift.name.toLocaleLowerCase().includes(keyword) || gift.address.toLocaleLowerCase().includes(keyword)))
    this.setData({ months, monthIndex: Math.min(this.data.monthIndex, months.length - 1), total: money(matched.reduce((sum, gift) => sum + gift.amount, 0)), resultCount: matched.length, items: matched.sort((a, b) => b.date.localeCompare(a.date)).map((gift) => ({ id: gift.id, name: gift.name, amount: money(gift.amount), address: gift.address || '未填写地址', date: formatDate(gift.date) })) })
  },
  chooseMonth(e: WechatMiniprogram.PickerChange) { this.setData({ monthIndex: Number(e.detail.value) }, () => this.refresh()) },
  search(e: WechatMiniprogram.Input) { this.setData({ keyword: e.detail.value }, () => this.refresh()) },
  createGift() { wx.navigateTo({ url: '/pages/outgoing-form/outgoing-form' }) },
  editGift(e: WechatMiniprogram.TouchEvent) { wx.navigateTo({ url: `/pages/outgoing-form/outgoing-form?id=${e.currentTarget.dataset.id}` }) },
  deleteGift(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id)
    wx.showModal({ title: '删除这笔送礼记录？', content: '删除后无法恢复。', confirmColor: '#286a6e', success: (result) => {
      if (!result.confirm) return
      const ledger = getLedger(); ledger.outgoing = ledger.outgoing.filter((gift) => gift.id !== id); saveLedger(ledger); this.refresh(); wx.showToast({ title: '已删除', icon: 'success' })
    } })
  },
})
