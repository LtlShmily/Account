import { banquetTotal, formatDate, getLedger, GuestGift, makeId, money, parseAmount, saveLedger } from '../../services/ledger'
import { formatBatchImportText } from '../../services/batch-export'
import { chooseExcelImport } from '../../services/excel-import'

const PAGE_SIZE = 50
const pointerInteractions = new WeakSet<object>()
const confirmedInputMoves = new WeakMap<object, string>()

interface GuestRow {
  id: string
  recordId: string
  name: string
  amount: string
  address: string
  date: string
  isDraft: boolean
  selected: boolean
  globalIndex: number
}

function emptyGuestRow(globalIndex: number): GuestRow {
  return { id: `draft-${makeId()}`, recordId: '', name: '', amount: '', address: '', date: '', isDraft: true, selected: false, globalIndex }
}

Page({
  data: {
    id: '',
    sourceGuestId: '',
    sourceJumpDone: false,
    name: '',
    date: '',
    location: '',
    total: '0.00',
    count: 0,
    keyword: '',
    batchMode: false,
    selectedIds: [] as string[],
    guests: [] as GuestRow[],
    draftRows: [] as GuestRow[],
    currentPage: 1,
    totalPages: 1,
    pageInput: '1',
    pageStart: 0,
    pageEnd: 0,
    focusTargetId: '',
    focusTargetField: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({ id: query.id || '', sourceGuestId: query.guestId || '' })
  },
  onShow() { this.refresh() },

  refresh(resetToFirst = false, callback?: () => void) {
    const banquet = getLedger().banquets.find((item) => item.id === this.data.id)
    if (!banquet) { wx.showToast({ title: '宴席不存在', icon: 'none' }); setTimeout(() => wx.navigateBack(), 500); return }

    const keyword = this.data.keyword.trim().toLocaleLowerCase()
    const filteredGuests = banquet.guests
      .filter((guest) => !keyword || guest.name.toLocaleLowerCase().includes(keyword))
    let draftRows = this.data.draftRows
    if (!draftRows.length) draftRows = [emptyGuestRow(banquet.guests.length)]

    const sourceIndex = this.data.sourceGuestId && !this.data.sourceJumpDone
      ? filteredGuests.findIndex((guest) => guest.id === this.data.sourceGuestId)
      : -1
    const visibleRowCount = filteredGuests.length + (keyword ? 0 : draftRows.length)
    const totalPages = Math.max(1, Math.ceil(visibleRowCount / PAGE_SIZE))
    const requestedPage = sourceIndex >= 0 ? Math.floor(sourceIndex / PAGE_SIZE) + 1 : (resetToFirst ? 1 : this.data.currentPage)
    const currentPage = Math.max(1, Math.min(requestedPage, totalPages))
    const start = (currentPage - 1) * PAGE_SIZE
    const savedRows: GuestRow[] = filteredGuests.map((guest, index) => ({
      id: guest.id,
      recordId: guest.id,
      name: guest.name,
      amount: (guest.amount / 100).toFixed(2),
      address: guest.address,
      date: guest.date,
      isDraft: false,
      selected: this.data.selectedIds.includes(guest.id),
      globalIndex: index,
    }))
    const positionedDrafts = draftRows.map((row, index) => ({ ...row, globalIndex: banquet.guests.length + index }))
    const allRows = keyword ? savedRows : [...savedRows, ...positionedDrafts]
    const guests = allRows.slice(start, start + PAGE_SIZE)
    const pageStart = filteredGuests.length ? Math.min(start + 1, filteredGuests.length) : 0
    const pageEnd = Math.min(start + PAGE_SIZE, filteredGuests.length)

    this.setData({
      name: banquet.name,
      date: formatDate(banquet.date),
      location: banquet.location || '未填写地点',
      total: money(banquetTotal(banquet)),
      count: banquet.guests.length,
      guests,
      draftRows,
      currentPage,
      totalPages,
      pageInput: String(currentPage),
      pageStart,
      pageEnd,
      sourceJumpDone: this.data.sourceJumpDone || sourceIndex >= 0 || Boolean(this.data.sourceGuestId),
    }, () => {
      if (sourceIndex >= 0) wx.pageScrollTo({ selector: `#guest-${this.data.sourceGuestId}`, duration: 300 })
      if (callback) callback()
    })
  },

  search(e: WechatMiniprogram.Input) {
    this.setData({ keyword: e.detail.value, selectedIds: [], currentPage: 1, focusTargetId: '', focusTargetField: '' }, () => this.refresh(true))
  },
  onPageInput(e: WechatMiniprogram.Input) { this.setData({ pageInput: e.detail.value }) },
  goToPage() {
    const requested = Math.floor(Number(this.data.pageInput))
    if (!Number.isFinite(requested) || requested < 1) {
      wx.showToast({ title: '请输入有效页码', icon: 'none' })
      this.setData({ pageInput: String(this.data.currentPage) })
      return
    }
    this.setData({ currentPage: Math.min(requested, this.data.totalPages), focusTargetId: '', focusTargetField: '' }, () => this.refresh())
  },
  previousPage() {
    if (this.data.currentPage > 1) this.setData({ currentPage: this.data.currentPage - 1, focusTargetId: '', focusTargetField: '' }, () => this.refresh())
  },
  nextPage() {
    if (this.data.currentPage < this.data.totalPages) this.setData({ currentPage: this.data.currentPage + 1, focusTargetId: '', focusTargetField: '' }, () => this.refresh())
  },
  lastPage() { this.setData({ currentPage: this.data.totalPages, focusTargetId: '', focusTargetField: '' }, () => this.refresh()) },

  toggleBatchMode() { this.setData({ batchMode: !this.data.batchMode, selectedIds: [] }, () => this.refresh()) },
  toggleSelected(e: WechatMiniprogram.TouchEvent) {
    const id = String(e.currentTarget.dataset.id || '')
    if (!id) return
    const selectedIds = this.data.selectedIds.includes(id) ? this.data.selectedIds.filter((item) => item !== id) : [...this.data.selectedIds, id]
    this.setData({ selectedIds }, () => this.refresh())
  },
  selectAllVisible() {
    const currentPageIds = this.data.guests.filter((row) => !row.isDraft).map((row) => row.recordId)
    const selectedIds = Array.from(new Set([...this.data.selectedIds, ...currentPageIds]))
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

  markTouch() { pointerInteractions.add(this) },
  onCellFocus(e: WechatMiniprogram.Input) {
    pointerInteractions.delete(this)
    const id = String(e.currentTarget.dataset.id || '')
    const field = String(e.currentTarget.dataset.field || '')
    this.setData({ focusTargetId: id, focusTargetField: field })
  },
  onCellConfirm(e: WechatMiniprogram.Input) {
    const id = String(e.currentTarget.dataset.id || '')
    const field = String(e.currentTarget.dataset.field || '')
    const row = this.data.guests.find((item) => item.id === id)
    if (!row) return
    let nextField = 'name'
    let nextIndex = row.globalIndex
    if (field === 'name') nextField = 'amount'
    else if (field === 'amount') nextField = 'address'
    else {
      nextIndex += 1
      if (!this.hasRowAt(nextIndex)) return
      this.markConfirmedMove(id, field)
      wx.hideKeyboard()
      return
    }
    this.markConfirmedMove(id, field)
    this.focusGuestInput(nextIndex, nextField)
  },
  markConfirmedMove(id: string, field: string) {
    const marker = `${id}:${field}`
    confirmedInputMoves.set(this, marker)
    setTimeout(() => {
      if (confirmedInputMoves.get(this) === marker) confirmedInputMoves.delete(this)
    }, 1000)
  },
  hasRowAt(globalIndex: number): boolean {
    const banquet = getLedger().banquets.find((item) => item.id === this.data.id)
    if (!banquet) return false
    if (this.data.keyword.trim()) return globalIndex < banquet.guests.filter((guest) => guest.name.toLocaleLowerCase().includes(this.data.keyword.trim().toLocaleLowerCase())).length
    return globalIndex < banquet.guests.length + this.data.draftRows.length
  },
  focusGuestInput(globalIndex: number, field: string) {
    const targetPage = Math.floor(globalIndex / PAGE_SIZE) + 1
    const applyFocus = () => {
      const target = this.data.guests.find((row) => row.globalIndex === globalIndex)
      if (target) this.setData({ focusTargetId: target.id, focusTargetField: field })
    }
    if (targetPage === this.data.currentPage) {
      applyFocus()
      return
    }
    this.setData({ currentPage: targetPage, pageInput: String(targetPage), focusTargetId: '', focusTargetField: '' }, () => this.refresh(false, applyFocus))
  },
  onCellInput(e: WechatMiniprogram.Input) {
    pointerInteractions.delete(this)
    const id = String(e.currentTarget.dataset.id)
    const field = String(e.currentTarget.dataset.field)
    const rows = this.data.guests.map((row) => ({ ...row }))
    const row = rows.find((item) => item.id === id)
    if (!row) return
    if (field === 'name') row.name = e.detail.value
    else if (field === 'amount') row.amount = e.detail.value
    else if (field === 'address') row.address = e.detail.value

    let draftRows = this.data.draftRows.map((draft) => ({ ...draft }))
    if (row.isDraft) {
      draftRows = draftRows.map((draft) => draft.id === id ? { ...row } : draft)
      const hasTrailingBlank = draftRows.some((draft) => !draft.name.trim() && !draft.amount.trim() && !draft.address.trim())
      if ((row.name.trim() || row.amount.trim() || row.address.trim()) && !hasTrailingBlank) draftRows.push(emptyGuestRow(this.data.count + draftRows.length))
      const nextDraft = draftRows[draftRows.length - 1]
      if (nextDraft && nextDraft.globalIndex < this.data.currentPage * PAGE_SIZE) {
        if (!rows.some((item) => item.id === nextDraft.id)) rows.push(nextDraft)
      }
    }
    const visibleCount = this.data.count + draftRows.length
    const totalPages = Math.max(1, Math.ceil(visibleCount / PAGE_SIZE))
    this.setData({ guests: rows, draftRows, totalPages })
  },
  onCellBlur(e: WechatMiniprogram.Input) {
    const id = String(e.currentTarget.dataset.id)
    const field = String(e.currentTarget.dataset.field || '')
    const row = this.data.guests.find((item) => item.id === id)
    const touched = pointerInteractions.has(this)
    pointerInteractions.delete(this)
    const explicitlyMoved = confirmedInputMoves.get(this) === `${id}:${field}`
    if (explicitlyMoved) confirmedInputMoves.delete(this)
    if (!explicitlyMoved) this.setData({ focusTargetId: '', focusTargetField: '' })
    if (!row) return

    const shouldAdvancePage = field === 'address' && (explicitlyMoved || (!touched && row.globalIndex % PAGE_SIZE === PAGE_SIZE - 1))
    if (row.isDraft && !row.name.trim() && !row.amount.trim() && !row.address.trim()) return
    if (!row.name.trim()) {
      if (row.isDraft && !row.amount.trim()) return
      if (row.isDraft) { wx.showToast({ title: '请填写姓名', icon: 'none' }); return }
      wx.showToast({ title: '姓名不能为空', icon: 'none' }); this.refresh(); return
    }
    const amount = parseAmount(row.amount)
    if (amount === null) {
      if (row.isDraft && !row.amount.trim()) return
      wx.showToast({ title: '金额需大于 0，最多两位小数', icon: 'none' })
      if (!row.isDraft) this.refresh()
      return
    }

    const ledger = getLedger()
    const banquet = ledger.banquets.find((item) => item.id === this.data.id)
    if (!banquet) { wx.showToast({ title: '宴席不存在', icon: 'none' }); this.refresh(); return }
    if (row.isDraft) {
      const guest: GuestGift = { id: makeId(), name: row.name.trim(), amount, address: row.address.trim(), date: banquet.date }
      banquet.guests.push(guest)
      let draftRows = this.data.draftRows.filter((draft) => draft.id !== row.id)
      if (!draftRows.length || draftRows.every((draft) => draft.name.trim() || draft.amount.trim() || draft.address.trim())) draftRows.push(emptyGuestRow(banquet.guests.length))
      const savedRow: GuestRow = { ...row, recordId: guest.id, name: guest.name, amount: (guest.amount / 100).toFixed(2), address: guest.address, date: guest.date, isDraft: false }
      const guests = this.data.guests.map((item) => item.id === row.id ? savedRow : item)
      const totalPages = Math.max(1, Math.ceil((banquet.guests.length + draftRows.length) / PAGE_SIZE))
      saveLedger(ledger)
      this.setData({ draftRows, guests, totalPages, total: money(banquetTotal(banquet)), count: banquet.guests.length }, () => {
        if (shouldAdvancePage) this.focusGuestInput(row.globalIndex + 1, 'name')
      })
      return
    } else {
      const guest = banquet.guests.find((item) => item.id === row.recordId)
      if (!guest) { this.refresh(); return }
      guest.name = row.name.trim()
      guest.amount = amount
      guest.address = row.address.trim()
      const updatedRow = { ...row, name: guest.name, amount: (guest.amount / 100).toFixed(2), address: guest.address }
      const guests = this.data.guests.map((item) => item.id === row.id ? updatedRow : item)
      saveLedger(ledger)
      this.setData({ guests, total: money(banquetTotal(banquet)), count: banquet.guests.length }, () => {
        if (shouldAdvancePage) this.focusGuestInput(row.globalIndex + 1, 'name')
      })
    }
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
          this.setData({ currentPage: 1, pageInput: '1', selectedIds: [] }, () => this.refresh(true))
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
