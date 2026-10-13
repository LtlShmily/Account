import { banquetTotal, formatDate, getLedger, money, saveLedger } from '../../services/ledger'

interface BanquetView { id: string; name: string; date: string; location: string; total: string; count: number }
Page({
  data: { items: [] as BanquetView[], months: ['全部月份'], monthIndex: 0 },
  onShow() { this.refresh() },
  refresh() {
    const ledger = getLedger()
    const months = ['全部月份', ...Array.from(new Set(ledger.banquets.map((item) => item.date.slice(0, 7)))).sort().reverse()]
    const month = this.data.monthIndex === 0 ? '' : months[this.data.monthIndex]
    const items = ledger.banquets.filter((item) => !month || item.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date)).map((item) => ({ id: item.id, name: item.name, date: formatDate(item.date), location: item.location || '未填写地点', total: money(banquetTotal(item)), count: item.guests.length }))
    this.setData({ items, months, monthIndex: Math.min(this.data.monthIndex, months.length - 1) })
  },
  chooseMonth(e: WechatMiniprogram.PickerChange) { this.setData({ monthIndex: Number(e.detail.value) }, () => this.refresh()) },
  createBanquet() { wx.navigateTo({ url: '/pages/banquet-form/banquet-form' }) },
  openBanquet(e: WechatMiniprogram.TouchEvent) { wx.navigateTo({ url: `/pages/banquet-detail/banquet-detail?id=${e.currentTarget.dataset.id}` }) },
  editBanquet(e: WechatMiniprogram.TouchEvent) { wx.navigateTo({ url: `/pages/banquet-form/banquet-form?id=${e.currentTarget.dataset.id}` }) },
  deleteBanquet(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id)
    wx.showModal({ title: '删除这场宴席？', content: '宴席下的收礼明细也会一并删除。', confirmColor: '#b91f1b', success: (result) => {
      if (!result.confirm) return
      const ledger = getLedger(); ledger.banquets = ledger.banquets.filter((item) => item.id !== id); saveLedger(ledger); this.refresh(); wx.showToast({ title: '已删除', icon: 'success' })
    } })
  },
  stopTap() {},
})
