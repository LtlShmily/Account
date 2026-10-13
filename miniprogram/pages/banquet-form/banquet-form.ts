import { Banquet, GuestGift, getLedger, makeId, parseAmount, saveLedger, today } from '../../services/ledger'

Page({
  data: { kind: 'banquet', id: '', banquetId: '', guestId: '', title: '新建宴席', name: '', amount: '', date: today(), location: '', note: '' },
  onLoad(query: Record<string, string | undefined>) {
    const kind = query.guestId || query.banquetId ? 'guest' : 'banquet'
    const id = query.id || ''
    const banquetId = query.banquetId || ''
    const guestId = query.guestId || ''
    const ledger = getLedger()
    if (kind === 'banquet' && id) {
      const banquet = ledger.banquets.find((item) => item.id === id)
      if (banquet) this.setData({ id, title: '编辑宴席', name: banquet.name, date: banquet.date, location: banquet.location, note: banquet.note })
    } else if (kind === 'guest') {
      const banquet = ledger.banquets.find((item) => item.id === banquetId)
      const guest = banquet?.guests.find((item) => item.id === guestId)
      this.setData({ kind, banquetId, guestId, title: guest ? '编辑收礼记录' : '新增收礼记录', date: guest?.date || today(), name: guest?.name || '', amount: guest ? (guest.amount / 100).toFixed(2) : '', location: guest?.address || '', note: '' })
    }
  },
  onReady() { wx.setNavigationBarTitle({ title: this.data.title }) },
  onTextInput(e: WechatMiniprogram.Input) {
    const field = String(e.currentTarget.dataset.field)
    if (field === 'name') this.setData({ name: e.detail.value })
    else if (field === 'amount') this.setData({ amount: e.detail.value })
    else if (field === 'location') this.setData({ location: e.detail.value })
    else if (field === 'note') this.setData({ note: e.detail.value })
  },
  onDateChange(e: WechatMiniprogram.PickerChange) { this.setData({ date: String(e.detail.value) }) },
  save() {
    const { kind, id, banquetId, guestId, name, amount, date, location, note } = this.data
    if (!name.trim()) { wx.showToast({ title: kind === 'guest' ? '请填写姓名' : '请填写宴席名称', icon: 'none' }); return }
    const ledger = getLedger()
    if (kind === 'banquet') {
      if (!date || !location.trim()) { wx.showToast({ title: '请填写日期和宴席地址', icon: 'none' }); return }
      if (id) {
        const banquet = ledger.banquets.find((item) => item.id === id)
        if (!banquet) { wx.showToast({ title: '宴席不存在', icon: 'none' }); return }
        Object.assign(banquet, { name: name.trim(), date, location: location.trim(), note: note.trim() })
      } else {
        const banquet: Banquet = { id: makeId(), name: name.trim(), date, location: location.trim(), note: note.trim(), guests: [] }
        ledger.banquets.unshift(banquet)
      }
    } else {
      const amountCents = parseAmount(amount)
      if (amountCents === null) { wx.showToast({ title: '金额需大于 0，最多两位小数', icon: 'none' }); return }
      const banquet = ledger.banquets.find((item) => item.id === banquetId)
      if (!banquet) { wx.showToast({ title: '宴席不存在', icon: 'none' }); return }
      if (guestId) {
        const guest = banquet.guests.find((item) => item.id === guestId)
        if (!guest) { wx.showToast({ title: '记录不存在', icon: 'none' }); return }
        Object.assign(guest, { name: name.trim(), amount: amountCents, address: location.trim(), date })
      } else {
        const guest: GuestGift = { id: makeId(), name: name.trim(), amount: amountCents, address: location.trim(), date }
        banquet.guests.unshift(guest)
      }
    }
    saveLedger(ledger)
    wx.showToast({ title: '已保存', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 350)
  },
})
