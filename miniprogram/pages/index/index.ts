import { getLedger, money, totals } from '../../services/ledger'
import { exportLedgerExcel, ExcelExportType } from '../../services/excel-export'
import { getListDisplayMode, ListDisplayMode, setListDisplayMode } from '../../services/list-display-mode'

interface RecentItem { id: string; type: string; typeClass: string; name: string; date: string; detail: string; amount: string }

Page({
  data: { received: '0.00', sent: '0.00', balance: '0.00', recent: [] as RecentItem[], listDisplayMode: 'paged' as ListDisplayMode, listDisplayModeLabel: '分页模式（50 条/页）' },
  onShow() { this.refresh() },
  refresh() {
    const ledger = getLedger()
    const summary = totals(ledger)
    const received: RecentItem[] = ledger.banquets.flatMap((banquet) => banquet.guests.map((guest) => ({ id: guest.id, type: '收', typeClass: 'receive', name: guest.name, date: guest.date, detail: banquet.name, amount: `+${money(guest.amount)}` })))
    const sent: RecentItem[] = ledger.outgoing.map((gift) => ({ id: gift.id, type: '送', typeClass: 'send', name: gift.name, date: gift.date, detail: gift.note || '送出礼金', amount: `−${money(gift.amount)}` }))
    const listDisplayMode = getListDisplayMode()
    this.setData({ received: money(summary.received), sent: money(summary.sent), balance: money(summary.balance), recent: [...received, ...sent].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6), listDisplayMode, listDisplayModeLabel: listDisplayMode === 'paged' ? '分页模式（50 条/页）' : '完整列表模式' })
  },
  toggleListDisplayMode() {
    const listDisplayMode: ListDisplayMode = this.data.listDisplayMode === 'paged' ? 'all' : 'paged'
    setListDisplayMode(listDisplayMode)
    this.setData({ listDisplayMode, listDisplayModeLabel: listDisplayMode === 'paged' ? '分页模式（50 条/页）' : '完整列表模式' })
    wx.showToast({ title: listDisplayMode === 'paged' ? '已切换为分页模式' : '已切换为完整列表模式', icon: 'none' })
  },
  openReceived() { wx.navigateTo({ url: '/pages/banquet-list/banquet-list' }) },
  openSent() { wx.navigateTo({ url: '/pages/outgoing-list/outgoing-list' }) },
  exportData() {
    const types: ExcelExportType[] = ['income', 'outgoing', 'summary', 'all']
    wx.showActionSheet({
      itemList: ['仅收取礼金', '仅送出礼金', '仅总计数据', '完整账本（3 个工作表）'],
      success: (result) => {
        const type = types[result.tapIndex]
        if (type) exportLedgerExcel(type)
      },
    })
  },
})
