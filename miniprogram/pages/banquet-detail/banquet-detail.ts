import { banquetTotal, formatDate, getLedger, GuestGift, makeId, money, parseAmount, saveLedger } from '../../services/ledger'
import { formatBatchImportText } from '../../services/batch-export'
import { chooseExcelImport } from '../../services/excel-import'

interface GuestRow { id: string; recordId: string; name: string; amount: string; address: string; date: string; isDraft: boolean; selected: boolean }

function emptyGuestRow(): GuestRow {
  return { id: `draft-${makeId()}`, recordId: '', name: '', amount: '', address: '', date: '', isDraft: true, selected: false }
}

Page({
  data: { id: '', sourceGuestId: '', name: '', date: '', location: '', total: '0.00', count: 0, keyword: '', batchMode: false, selectedIds: [] as string[], guests: [] as GuestRow[] },
  onLoad(query: Record<string, string | undefined>) { this.setData({ id: query.id || '', sourceGuestId: query.guestId || '' }) },
  onShow() { this.refresh() },
  refresh() {
    const banquet = getLedger().banquets.find((item) => item.id === this.data.id)
    if (!banquet) { wx.showToast({ title: '宴席不存在', icon: 'none' }); setTimeout(() => wx.navigateBack(), 500); return }
    const keyword = this.data.keyword.trim().toLocaleLowerCase()
    const savedRows: GuestRow[] = banquet.guests
      .map((guest) => ({ id: guest.id, recordId: guest.id, name: guest.name, amount: (guest.amount / 100).toFixed(2), address: guest.address, date: guest.date, isDraft: false, selected: this.data.selectedIds.includes(guest.id) }))
      .filter((guest) => !keyword || guest.name.toLocaleLowerCase().includes(keyword))
    const partialRows = this.data.guests.filter((guest) => guest.isDraft && (guest.name.trim() || guest.amount.trim() || guest.address.trim()))
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
  search(e: WechatMiniprogram.Input) { this.setData({ keyword: e.detail.value, selectedIds: [] }, () => this.refresh()) },
  toggleBatchMode() { this.setData({ batchMode: !this.data.batchMode, selectedIds: [] }, () => this.refresh()) },
  toggleSelected(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id || '')
    if (!id) return
    const selectedIds = this.data.selectedIds.includes(id) ? this.data.selectedIds.filter((item) => item !== id) : [...this.data.selectedIds, id]
    this.setData({ selectedIds }, () => this.refresh())
  },
  selectAllVisible() {
    const selectedIds = this.data.guests.filter((row) => !row.isDraft).map((row) => row.recordId)
    this.setData({ selectedIds }, () => this.refresh())
  },
  exportSelected() {
    if (!this.data.selectedIds.length) { wx.showToast({ title: '请先选择要导出的记录', icon: 'none' }); return }
    const banquet = getLedger().banquets.find((item) => item.id === this.data.id)
    if (!banquet) return
    const selected = new Set(this.data.selectedIds)
    const text = formatBatchImportText(banquet.guests.filter((guest) => selected.has(guest.id)).map((guest) => ({ name: guest.name, amount: guest.amount, remark: guest.address })))
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: `已复制 ${this.data.selectedIds.length} 条`, icon: 'success' }) })
  },
  deleteSelected() {
    const count = this.data.selectedIds.length
    if (!count) { wx.showToast({ title: '请先选择要删除的记录', icon: 'none' }); return }
    wx.showModal({ title: `删除选中的 ${count} 条记录？`, content: '删除后无法恢复。', confirmColor: '#b91f1b', success: (result) => {
      if (!result.confirm) return
      const ledger = getLedger()
      const banquet = ledger.banquets.find((item) => item.id === this.data.id)
      if (!banquet) return
      const selected = new Set(this.data.selectedIds)
      banquet.guests = banquet.guests.filter((guest) => !selected.has(guest.id))
      saveLedger(ledger)
      this.setData({ selectedIds: [] }, () => this.refresh())
      wx.showToast({ title: `已删除 ${count} 条`, icon: 'success' })
    } })
  },
  onCellInput(e: WechatMiniprogram.Input) {
    const id = String(e.currentTarget.dataset.id)
    const field = String(e.currentTarget.dataset.field)
    const rows = this.data.guests.map((row) => ({ ...row }))
    const row = rows.find((item) => item.id === id)
    if (!row) return
    if (field === 'name') row.name = e.detail.value
    else if (field === 'amount') row.amount = e.detail.value
    else if (field === 'address') row.address = e.detail.value
    if (row.isDraft && (row.name.trim() || row.amount.trim() || row.address.trim()) && !rows.some((item) => item.isDraft && item.id !== id)) rows.push(emptyGuestRow())
    this.setData({ guests: rows })
  },
  onCellBlur(e: WechatMiniprogram.Input) {
    const id = String(e.currentTarget.dataset.id)
    const row = this.data.guests.find((item) => item.id === id)
    if (!row) return
    if (row.isDraft && !row.name.trim() && !row.amount.trim() && !row.address.trim()) return
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
      const guest: GuestGift = { id: makeId(), name: row.name.trim(), amount, address: row.address.trim(), date: banquet.date }
      banquet.guests.unshift(guest)
      const rows = this.data.guests.map((item) => item.id === id ? { ...row, recordId: guest.id, name: guest.name, amount: (guest.amount / 100).toFixed(2), address: guest.address, date: guest.date, isDraft: false } : item)
      saveLedger(ledger)
      this.setData({ guests: rows, total: money(banquetTotal(banquet)), count: banquet.guests.length })
      return
    }
    const guest = banquet.guests.find((item) => item.id === row.recordId)
    if (!guest) { this.refresh(); return }
    guest.name = row.name.trim()
    guest.amount = amount
    guest.address = row.address.trim()
    const updatedRow = { ...row, name: guest.name, amount: (guest.amount / 100).toFixed(2), address: guest.address }
    saveLedger(ledger)
    this.setData({ guests: this.data.guests.map((item) => item.id === row.id ? updatedRow : item), total: money(banquetTotal(banquet)), count: banquet.guests.length })
  },
  editBanquet() { wx.navigateTo({ url: `/pages/banquet-form/banquet-form?id=${this.data.id}` }) },
  importGuests() { wx.navigateTo({ url: `/pages/batch-import/batch-import?banquetId=${encodeURIComponent(this.data.id)}` }) },
  importGuestsFromExcel() {
    chooseExcelImport((rows) => {
      wx.showModal({
        title: '确认导入收礼记录',
        content: `文件校验通过，共 ${rows.length} 条记录。确认导入到当前宴席吗？`,
        confirmText: '导入',
        success: (result) => {
          if (!result.confirm) return
          const ledger = getLedger()
          const banquet = ledger.banquets.find((item) => item.id === this.data.id)
          if (!banquet) { wx.showToast({ title: '宴席不存在，未导入', icon: 'none' }); return }
          const imported: GuestGift[] = rows.map((row) => ({ id: makeId(), name: row.name, amount: row.amount, address: row.remark, date: banquet.date }))
          banquet.guests = [...imported, ...banquet.guests]
          try {
            saveLedger(ledger)
          } catch {
            wx.showToast({ title: '保存失败，未完成导入', icon: 'none' })
            return
          }
          this.refresh()
          wx.showToast({ title: `已导入 ${imported.length} 笔`, icon: 'success' })
        },
      })
    })
  },
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
