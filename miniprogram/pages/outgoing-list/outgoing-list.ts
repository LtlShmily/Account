import { currentMonth, formatDate, getLedger, makeId, money, saveLedger, today } from '../../services/ledger'
import { formatBatchImportText } from '../../services/batch-export'
import { chooseExcelImport } from '../../services/excel-import'

const PAGE_SIZE = 50

interface GiftView { id: string; name: string; amount: string; note: string; date: string; selected: boolean }

Page({
  data: {
    items: [] as GiftView[],
    months: [] as string[],
    monthIndex: 0,
    keyword: '',
    total: '0.00',
    resultCount: 0,
    batchMode: false,
    selectedIds: [] as string[],
    currentPage: 1,
    totalPages: 1,
    pageInput: '1',
    pageStart: 0,
    pageEnd: 0,
  },

  onShow() { this.refresh() },

  refresh(resetToFirst = false) {
    const ledger = getLedger()
    const uniqueMonths = Array.from(new Set(ledger.outgoing.map((gift) => gift.date.slice(0, 7)))).sort().reverse()
    const months = [`${currentMonth()}（本月）`, '全部月份', ...uniqueMonths.filter((month) => month !== currentMonth())]
    const monthIndex = Math.min(this.data.monthIndex, months.length - 1)
    const selected = monthIndex === 1 ? '' : monthIndex === 0 ? currentMonth() : months[monthIndex]
    const keyword = this.data.keyword.trim().toLocaleLowerCase()
    const matched = ledger.outgoing
      .filter((gift) => (!selected || gift.date.startsWith(selected)) && (!keyword || gift.name.toLocaleLowerCase().includes(keyword) || (gift.note || '').toLocaleLowerCase().includes(keyword)))
      .sort((a, b) => b.date.localeCompare(a.date))
    const totalPages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE))
    const currentPage = resetToFirst ? 1 : Math.min(this.data.currentPage, totalPages)
    const start = (currentPage - 1) * PAGE_SIZE
    const pageItems = matched.slice(start, start + PAGE_SIZE).map((gift) => ({
      id: gift.id,
      name: gift.name,
      amount: money(gift.amount),
      note: gift.note || '—',
      date: formatDate(gift.date),
      selected: this.data.selectedIds.includes(gift.id),
    }))

    this.setData({
      months,
      monthIndex,
      total: money(matched.reduce((sum, gift) => sum + gift.amount, 0)),
      resultCount: matched.length,
      items: pageItems,
      currentPage,
      totalPages,
      pageInput: String(currentPage),
      pageStart: matched.length ? start + 1 : 0,
      pageEnd: Math.min(start + PAGE_SIZE, matched.length),
    })
  },

  chooseMonth(e: WechatMiniprogram.PickerChange) {
    this.setData({ monthIndex: Number(e.detail.value), selectedIds: [], currentPage: 1 }, () => this.refresh(true))
  },
  search(e: WechatMiniprogram.Input) {
    this.setData({ keyword: e.detail.value, selectedIds: [], currentPage: 1 }, () => this.refresh(true))
  },
  onPageInput(e: WechatMiniprogram.Input) { this.setData({ pageInput: e.detail.value }) },
  goToPage() {
    const requested = Math.floor(Number(this.data.pageInput))
    if (!Number.isFinite(requested) || requested < 1) {
      wx.showToast({ title: '请输入有效页码', icon: 'none' })
      this.setData({ pageInput: String(this.data.currentPage) })
      return
    }
    this.setData({ currentPage: Math.min(requested, this.data.totalPages) }, () => this.refresh())
  },
  previousPage() { if (this.data.currentPage > 1) this.setData({ currentPage: this.data.currentPage - 1 }, () => this.refresh()) },
  nextPage() { if (this.data.currentPage < this.data.totalPages) this.setData({ currentPage: this.data.currentPage + 1 }, () => this.refresh()) },
  lastPage() { this.setData({ currentPage: this.data.totalPages }, () => this.refresh()) },

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
          this.setData({ monthIndex: 0, currentPage: 1, selectedIds: [] }, () => this.refresh(true))
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
  selectAllVisible() {
    const selectedIds = Array.from(new Set([...this.data.selectedIds, ...this.data.items.map((item) => item.id)]))
    this.setData({ selectedIds }, () => this.refresh())
  },
  exportSelected() {
    if (!this.data.selectedIds.length) { wx.showToast({ title: '请先选择要导出的记录', icon: 'none' }); return }
    const selected = new Set(this.data.selectedIds)
    const records = getLedger().outgoing.filter((record) => selected.has(record.id)).map((record) => ({ name: record.name, amount: record.amount, remark: record.note }))
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
      const ledger = getLedger()
      ledger.outgoing = ledger.outgoing.filter((gift) => gift.id !== id)
      saveLedger(ledger)
      this.refresh()
      wx.showToast({ title: '已删除', icon: 'success' })
    } })
  },
})
