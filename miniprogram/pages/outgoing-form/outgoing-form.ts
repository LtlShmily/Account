import { getLedger, makeId, OutgoingGift, parseAmount, saveLedger, today } from '../../services/ledger'
Page({
  data: { id: '', title: '新增送礼记录', name: '', amount: '', date: today(), note: '', nameSuggestions: [] as string[] },
  onLoad(query: Record<string, string | undefined>) {
    const id = query.id || ''
    if (id) {
      const gift = getLedger().outgoing.find((item) => item.id === id)
      if (gift) this.setData({ id, title: '编辑送礼记录', name: gift.name, amount: (gift.amount / 100).toFixed(2), date: gift.date, note: gift.note || '' })
    }
  },
  onReady() { wx.setNavigationBarTitle({ title: this.data.title }) },
  onTextInput(e: WechatMiniprogram.Input) {
    const field = String(e.currentTarget.dataset.field)
    if (field === 'name') {
      const name = e.detail.value
      const keyword = name.trim().toLocaleLowerCase()
      if (!keyword || this.data.id) { this.setData({ name, nameSuggestions: [] }); return }
      const ledger = getLedger()
      const allNames = [...ledger.banquets.flatMap((banquet) => banquet.guests.map((guest) => guest.name)), ...ledger.outgoing.map((gift) => gift.name)]
      const uniqueNames = Array.from(new Set(allNames.map((item) => item.trim()).filter(Boolean)))
      const nameSuggestions = uniqueNames
        .filter((item) => item.toLocaleLowerCase().includes(keyword))
        .sort((first, second) => Number(second.toLocaleLowerCase().startsWith(keyword)) - Number(first.toLocaleLowerCase().startsWith(keyword)))
        .slice(0, 8)
      this.setData({ name, nameSuggestions })
    }
    else if (field === 'amount') this.setData({ amount: e.detail.value })
    else if (field === 'note') this.setData({ note: e.detail.value })
  },
  chooseNameSuggestion(e: WechatMiniprogram.TouchEvent) {
    const name = String(e.currentTarget.dataset.name || '')
    if (name) this.setData({ name, nameSuggestions: [] })
  },
  onDateChange(e: WechatMiniprogram.PickerChange) { this.setData({ date: String(e.detail.value) }) },
  save() {
    const { id, name, amount, date, note } = this.data
    if (!name.trim()) { wx.showToast({ title: '请填写收礼对象姓名', icon: 'none' }); return }
    const amountCents = parseAmount(amount)
    if (amountCents === null) { wx.showToast({ title: '金额需大于 0，最多两位小数', icon: 'none' }); return }
    if (!date) { wx.showToast({ title: '请选择日期', icon: 'none' }); return }
    const ledger = getLedger()
    if (id) {
      const gift = ledger.outgoing.find((item) => item.id === id)
      if (!gift) { wx.showToast({ title: '记录不存在', icon: 'none' }); return }
      Object.assign(gift, { name: name.trim(), amount: amountCents, date, note: note.trim() })
    } else {
      const newGift: OutgoingGift = { id: makeId(), name: name.trim(), amount: amountCents, date, note: note.trim() }
      ledger.outgoing.unshift(newGift)
    }
    saveLedger(ledger); wx.showToast({ title: '已保存', icon: 'success' }); setTimeout(() => wx.navigateBack(), 350)
  },
})
