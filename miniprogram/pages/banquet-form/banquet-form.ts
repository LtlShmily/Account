import { Banquet, getLedger, makeId, saveLedger, today } from '../../services/ledger'

Page({
  data: { id: '', title: '新建宴席', name: '', date: today(), location: '', note: '' },
  onLoad(query: Record<string, string | undefined>) {
    const id = query.id || ''
    if (!id) return
    const banquet = getLedger().banquets.find((item) => item.id === id)
    if (banquet) this.setData({ id, title: '编辑宴席', name: banquet.name, date: banquet.date, location: banquet.location, note: banquet.note })
  },
  onReady() { wx.setNavigationBarTitle({ title: this.data.title }) },
  onTextInput(e: WechatMiniprogram.Input) {
    const field = String(e.currentTarget.dataset.field)
    if (field === 'name') this.setData({ name: e.detail.value })
    else if (field === 'location') this.setData({ location: e.detail.value })
    else if (field === 'note') this.setData({ note: e.detail.value })
  },
  onDateChange(e: WechatMiniprogram.PickerChange) { this.setData({ date: String(e.detail.value) }) },
  save() {
    const { id, name, date, location, note } = this.data
    if (!name.trim()) { wx.showToast({ title: '请填写宴席名称', icon: 'none' }); return }
    if (!date || !location.trim()) { wx.showToast({ title: '请填写日期和宴席地址', icon: 'none' }); return }
    const ledger = getLedger()
    if (id) {
      const banquet = ledger.banquets.find((item) => item.id === id)
      if (!banquet) { wx.showToast({ title: '宴席不存在', icon: 'none' }); return }
      Object.assign(banquet, { name: name.trim(), date, location: location.trim(), note: note.trim() })
    } else {
      const banquet: Banquet = { id: makeId(), name: name.trim(), date, location: location.trim(), note: note.trim(), guests: [] }
      ledger.banquets.unshift(banquet)
    }
    saveLedger(ledger)
    wx.showToast({ title: '已保存', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 350)
  },
})
