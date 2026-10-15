import { currentMonth, formatDate, getLedger, makeId, money, saveLedger, today } from '../../services/ledger'
import { formatBatchImportText } from '../../services/batch-export'
import { chooseExcelImport } from '../../services/excel-import'
interface GiftView { id: string; name: string; amount: string; note: string; date: string; selected: boolean }
Page({
  data: { items: [] as GiftView[], months: [] as string[], monthIndex: 0, keyword: '', total: '0.00', resultCount: 0, batchMode: false, selectedIds: [] as string[] },
  onShow() { this.refresh() },
  refresh() {
    const ledger = getLedger()
    const uniqueMonths = Array.from(new Set(ledger.outgoing.map((gift) => gift.date.slice(0, 7)))).sort().reverse()
    const months = [`${currentMonth()}（本月）`, '全部月份', ...uniqueMonths.filter((month) => month !== currentMonth())]
    const selected = this.data.monthIndex === 1 ? '' : this.data.monthIndex === 0 ? currentMonth() : months[this.data.monthIndex]
    const keyword = this.data.keyword.trim().toLocaleLowerCase()
    const matched = ledger.outgoing.filter((gift) => (!selected || gift.date.startsWith(selected)) && (!keyword || gift.name.toLocaleLowerCase().includes(keyword) || (gift.note || '').toLocaleLowerCase().includes(keyword)))
    this.setData({ months, monthIndex: Math.min(this.data.monthIndex, months.length - 1), total: money(matched.reduce((sum, gift) => sum + gift.amount, 0)), resultCount: matched.length, items: matched.sort((a, b) => b.date.localeCompare(a.date)).map((gift) => ({ id: gift.id, name: gift.name, amount: money(gift.amount), note: gift.note || '—', date: formatDate(gift.date), selected: this.data.selectedIds.includes(gift.id) })) })
  },
  chooseMonth(e: WechatMiniprogram.PickerChange) { this.setData({ monthIndex: Number(e.detail.value), selectedIds: [] }, () => this.refresh()) },
  search(e: WechatMiniprogram.Input) { this.setData({ keyword: e.detail.value, selectedIds: [] }, () => this.refresh()) },
  createGift() { wx.navigateTo({ url: '/pages/outgoing-form/outgoing-form' }) },
  importGifts() { wx.navigateTo({ url: '/pages/batch-import/batch-import?type=outgoing' }) },
  importGiftsFromExcel() {
    chooseExcelImport((rows) => {
      wx.showModal({
        title: '确认导入送礼记录',
        content: `文件校验通过，共 ${rows.length} 条记录。确认导入送出礼金吗？`,
        confirmText: '导入',
        success: (result) => {
          if (!result.confirm) return
          const ledger = getLedger()
          const imported = rows.map((row) => ({ id: makeId(), name: row.name, amount: row.amount, date: today(), note: row.remark }))
          ledger.outgoing = [...imported, ...ledger.outgoing]
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
  toggleBatchMode() { this.setData({ batchMode: !this.data.batchMode, selectedIds: [] }, () => this.refresh()) },
  toggleSelected(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id || '')
    if (!id) return
    const selectedIds = this.data.selectedIds.includes(id) ? this.data.selectedIds.filter((item) => item !== id) : [...this.data.selectedIds, id]
    this.setData({ selectedIds }, () => this.refresh())
  },
  selectAllVisible() { this.setData({ selectedIds: this.data.items.map((item) => item.id) }, () => this.refresh()) },
  exportSelected() {
    if (!this.data.selectedIds.length) { wx.showToast({ title: '请先选择要导出的记录', icon: 'none' }); return }
    const selected = new Set(this.data.selectedIds)
    const ledger = getLedger()
    const records = this.data.items.filter((item) => selected.has(item.id)).flatMap((item) => {
      const record = ledger.outgoing.find((entry) => entry.id === item.id)
      return record ? [{ name: record.name, amount: record.amount, remark: record.note }] : []
    })
    wx.setClipboardData({ data: formatBatchImportText(records), success: () => wx.showToast({ title: `已复制 ${records.length} 条`, icon: 'success' }) })
  },
  deleteSelected() {
    const count = this.data.selectedIds.length
    if (!count) { wx.showToast({ title: '请先选择要删除的记录', icon: 'none' }); return }
    wx.showModal({ title: `删除选中的 ${count} 条记录？`, content: '删除后无法恢复。', confirmColor: '#286a6e', success: (result) => {
      if (!result.confirm) return
      const selected = new Set(this.data.selectedIds)
      const ledger = getLedger()
      ledger.outgoing = ledger.outgoing.filter((record) => !selected.has(record.id))
      saveLedger(ledger)
      this.setData({ selectedIds: [] }, () => this.refresh())
      wx.showToast({ title: `已删除 ${count} 条`, icon: 'success' })
    } })
  },
  editGift(e: WechatMiniprogram.TouchEvent) { wx.navigateTo({ url: `/pages/outgoing-form/outgoing-form?id=${e.currentTarget.dataset.id}` }) },
  deleteGift(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id)
    wx.showModal({ title: '删除这笔送礼记录？', content: '删除后无法恢复。', confirmColor: '#286a6e', success: (result) => {
      if (!result.confirm) return
      const ledger = getLedger(); ledger.outgoing = ledger.outgoing.filter((gift) => gift.id !== id); saveLedger(ledger); this.refresh(); wx.showToast({ title: '已删除', icon: 'success' })
    } })
  },
})
