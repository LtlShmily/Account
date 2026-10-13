import { Banquet, banquetTotal, formatDate, getLedger, money, saveLedger } from '../../services/ledger'
interface GuestView { id: string; name: string; amount: string; address: string; date: string }
Page({
  data: { id: '', name: '', date: '', location: '', total: '0.00', count: 0, keyword: '', guests: [] as GuestView[] },
  onLoad(query: Record<string, string | undefined>) { this.setData({ id: query.id || '' }) },
  onShow() { this.refresh() },
  refresh() {
    const banquet = getLedger().banquets.find((item) => item.id === this.data.id)
    if (!banquet) { wx.showToast({ title: '宴席不存在', icon: 'none' }); setTimeout(() => wx.navigateBack(), 500); return }
    const keyword = this.data.keyword.trim().toLocaleLowerCase()
    const guests = banquet.guests.map((guest) => ({ id: guest.id, name: guest.name, amount: money(guest.amount), address: guest.address || '—', date: formatDate(guest.date) }))
    this.setData({ name: banquet.name, date: formatDate(banquet.date), location: banquet.location || '未填写地点', total: money(banquetTotal(banquet)), count: banquet.guests.length, guests: guests.filter((guest) => !keyword || guest.name.toLocaleLowerCase().includes(keyword)) })
  },
  search(e: WechatMiniprogram.Input) { this.setData({ keyword: e.detail.value }, () => this.refresh()) },
  createGuest() { wx.navigateTo({ url: `/pages/banquet-form/banquet-form?banquetId=${this.data.id}` }) },
  editBanquet() { wx.navigateTo({ url: `/pages/banquet-form/banquet-form?id=${this.data.id}` }) },
  editGuest(e: WechatMiniprogram.TouchEvent) { wx.navigateTo({ url: `/pages/banquet-form/banquet-form?banquetId=${this.data.id}&guestId=${e.currentTarget.dataset.id}` }) },
  deleteGuest(e: WechatMiniprogram.TouchEvent) {
    const guestId = String(e.currentTarget.dataset.id)
    wx.showModal({ title: '删除这笔礼金？', content: '删除后无法恢复。', confirmColor: '#b91f1b', success: (result) => {
      if (!result.confirm) return
      const ledger = getLedger(); const banquet = ledger.banquets.find((item: Banquet) => item.id === this.data.id)
      if (banquet) { banquet.guests = banquet.guests.filter((gift) => gift.id !== guestId); saveLedger(ledger); this.refresh(); wx.showToast({ title: '已删除', icon: 'success' }) }
    } })
  },
})
