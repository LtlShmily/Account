import { banquetTotal, formatDate, getLedger, GuestGift, makeId, money, parseAmount, saveLedger } from '../../services/ledger'

interface GuestRow { id: string; recordId: string; name: string; amount: string; address: string; gift: string; date: string; isDraft: boolean }

function emptyGuestRow(): GuestRow {
  return { id: `draft-${makeId()}`, recordId: '', name: '', amount: '', address: '', gift: '', date: '', isDraft: true }
}

Page({
  data: { id: '', sourceGuestId: '', name: '', date: '', location: '', total: '0.00', count: 0, keyword: '', guests: [] as GuestRow[] },
  onLoad(query: Record<string, string | undefined>) { this.setData({ id: query.id || '', sourceGuestId: query.guestId || '' }) },
  onShow() { this.refresh() },
  refresh() {
    const banquet = getLedger().banquets.find((item) => item.id === this.data.id)
    if (!banquet) { wx.showToast({ title: '宴席不存在', icon: 'none' }); setTimeout(() => wx.navigateBack(), 500); return }
    const keyword = this.data.keyword.trim().toLocaleLowerCase()
    const savedRows: GuestRow[] = banquet.guests
      .map((guest) => ({ id: guest.id, recordId: guest.id, name: guest.name, amount: (guest.amount / 100).toFixed(2), address: guest.address, gift: guest.gift || '', date: guest.date, isDraft: false }))
      .filter((guest) => !keyword || guest.name.toLocaleLowerCase().includes(keyword))
    const partialRows = this.data.guests.filter((guest) => guest.isDraft && (guest.name.trim() || guest.amount.trim() || guest.address.trim() || guest.gift.trim()))
    this.setData({
      name: banquet.name,
      date: formatDate(banquet.date),
      location: banquet.location || '未填写地点',
      total: money(banquetTotal(banquet)),
      count: banquet.guests.length,
      guests: [...savedRows, ...partialRows, emptyGuestRow()],
    }, () => {
      if (this.data.sourceGuestId) wx.pageScrollTo({ selector: `#guest-${this.data.sourceGuestId}`, duration: 300 })
    })
  },
  search(e: WechatMiniprogram.Input) { this.setData({ keyword: e.detail.value }, () => this.refresh()) },
  onCellInput(e: WechatMiniprogram.Input) {
    const id = String(e.currentTarget.dataset.id)
    const field = String(e.currentTarget.dataset.field)
    const rows = this.data.guests.map((row) => ({ ...row }))
    const row = rows.find((item) => item.id === id)
    if (!row) return
    if (field === 'name') row.name = e.detail.value
    else if (field === 'amount') row.amount = e.detail.value
    else if (field === 'address') row.address = e.detail.value
    else if (field === 'gift') row.gift = e.detail.value
    if (row.isDraft && (row.name.trim() || row.amount.trim() || row.address.trim() || row.gift.trim()) && !rows.some((item) => item.isDraft && item.id !== id)) rows.push(emptyGuestRow())
    this.setData({ guests: rows })
  },
  onCellBlur(e: WechatMiniprogram.Input) {
    const id = String(e.currentTarget.dataset.id)
    const row = this.data.guests.find((item) => item.id === id)
    if (!row) return
    if (row.isDraft && !row.name.trim() && !row.amount.trim() && !row.address.trim() && !row.gift.trim()) return
    if (!row.name.trim()) {
      if (row.isDraft && !row.amount.trim()) return
      if (row.isDraft) { wx.showToast({ title: '请填写姓名', icon: 'none' }); return }
      wx.showToast({ title: '姓名不能为空', icon: 'none' }); this.refresh(); return
    }
    const amount = parseAmount(row.amount)
    if (amount === null) {
      if (row.isDraft && !row.amount.trim()) return
      if (row.isDraft) { wx.showToast({ title: '金额需大于 0，最多两位小数', icon: 'none' }); return }
      wx.showToast({ title: '金额需大于 0，最多两位小数', icon: 'none' }); this.refresh(); return
    }
    const ledger = getLedger()
    const banquet = ledger.banquets.find((item) => item.id === this.data.id)
    if (!banquet) { wx.showToast({ title: '宴席不存在', icon: 'none' }); this.refresh(); return }
    if (row.isDraft) {
      const guest: GuestGift = { id: makeId(), name: row.name.trim(), amount, address: row.address.trim(), gift: row.gift.trim(), date: banquet.date }
      banquet.guests.unshift(guest)
      const rows = this.data.guests.map((item) => item.id === id ? { ...row, recordId: guest.id, name: guest.name, amount: (guest.amount / 100).toFixed(2), address: guest.address, gift: guest.gift, date: guest.date, isDraft: false } : item)
      saveLedger(ledger)
      this.setData({ guests: rows, total: money(banquetTotal(banquet)), count: banquet.guests.length })
      return
    }
    const guest = banquet.guests.find((item) => item.id === row.recordId)
    if (!guest) { this.refresh(); return }
    guest.name = row.name.trim()
    guest.amount = amount
    guest.address = row.address.trim()
    guest.gift = row.gift.trim()
    const updatedRow = { ...row, name: guest.name, amount: (guest.amount / 100).toFixed(2), address: guest.address, gift: guest.gift }
    saveLedger(ledger)
    this.setData({ guests: this.data.guests.map((item) => item.id === row.id ? updatedRow : item), total: money(banquetTotal(banquet)), count: banquet.guests.length })
  },
  editBanquet() { wx.navigateTo({ url: `/pages/banquet-form/banquet-form?id=${this.data.id}` }) },
  importGuests() { wx.navigateTo({ url: `/pages/batch-import/batch-import?banquetId=${encodeURIComponent(this.data.id)}` }) },
  deleteGuest(e: WechatMiniprogram.TouchEvent) {
    const guestId = String(e.currentTarget.dataset.id)
    wx.showModal({ title: '删除这笔礼金？', content: '删除后无法恢复。', confirmColor: '#b91f1b', success: (result) => {
      if (!result.confirm) return
      const ledger = getLedger()
      const banquet = ledger.banquets.find((item) => item.id === this.data.id)
      if (banquet) { banquet.guests = banquet.guests.filter((gift) => gift.id !== guestId); saveLedger(ledger); this.refresh(); wx.showToast({ title: '已删除', icon: 'success' }) }
    } })
  },
})
