import { getLedger, makeId, OutgoingGift, parseAmount, saveLedger, today } from '../../services/ledger'
Page({
  data: { id: '', title: '新增送礼记录', name: '', amount: '', address: '', date: today(), note: '' },
  onLoad(query: Record<string, string | undefined>) {
    const id = query.id || ''
    if (id) {
      const gift = getLedger().outgoing.find((item) => item.id === id)
      if (gift) this.setData({ id, title: '编辑送礼记录', name: gift.name, amount: (gift.amount / 100).toFixed(2), address: gift.address, date: gift.date, note: gift.note })
    }
  },
  onReady() { wx.setNavigationBarTitle({ title: this.data.title }) },
  onTextInput(e: WechatMiniprogram.Input) {
    const field = String(e.currentTarget.dataset.field)
    if (field === 'name') this.setData({ name: e.detail.value })
    else if (field === 'amount') this.setData({ amount: e.detail.value })
    else if (field === 'address') this.setData({ address: e.detail.value })
    else if (field === 'note') this.setData({ note: e.detail.value })
  },
  onDateChange(e: WechatMiniprogram.PickerChange) { this.setData({ date: String(e.detail.value) }) },
  save() {
    const { id, name, amount, address, date, note } = this.data
    if (!name.trim()) { wx.showToast({ title: '请填写收礼对象姓名', icon: 'none' }); return }
    const amountCents = parseAmount(amount)
    if (amountCents === null) { wx.showToast({ title: '金额需大于 0，最多两位小数', icon: 'none' }); return }
    if (!date) { wx.showToast({ title: '请选择日期', icon: 'none' }); return }
    const ledger = getLedger()
    if (id) {
      const gift = ledger.outgoing.find((item) => item.id === id)
      if (!gift) { wx.showToast({ title: '记录不存在', icon: 'none' }); return }
      Object.assign(gift, { name: name.trim(), amount: amountCents, address: address.trim(), date, note: note.trim() })
    } else {
      const gift: OutgoingGift = { id: makeId(), name: name.trim(), amount: amountCents, address: address.trim(), date, note: note.trim() }
      ledger.outgoing.unshift(gift)
    }
    saveLedger(ledger); wx.showToast({ title: '已保存', icon: 'success' }); setTimeout(() => wx.navigateBack(), 350)
  },
})
