import { getLedger, money, totals } from '../../services/ledger'

interface RecentItem { id: string; type: string; typeClass: string; name: string; date: string; detail: string; amount: string }

Page({
  data: { received: '0.00', sent: '0.00', balance: '0.00', recent: [] as RecentItem[] },
  onShow() { this.refresh() },
  refresh() {
    const ledger = getLedger()
    const summary = totals(ledger)
    const received: RecentItem[] = ledger.banquets.flatMap((banquet) => banquet.guests.map((guest) => ({ id: guest.id, type: '收', typeClass: 'receive', name: guest.name, date: guest.date, detail: guest.gift ? `${banquet.name} · 礼品：${guest.gift}` : banquet.name, amount: `+${money(guest.amount)}` })))
    const sent: RecentItem[] = ledger.outgoing.map((gift) => ({ id: gift.id, type: '送', typeClass: 'send', name: gift.name, date: gift.date, detail: gift.gift ? `礼品：${gift.gift}` : gift.address || '送出礼金', amount: `−${money(gift.amount)}` }))
    this.setData({ received: money(summary.received), sent: money(summary.sent), balance: money(summary.balance), recent: [...received, ...sent].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6) })
  },
  openReceived() { wx.navigateTo({ url: '/pages/banquet-list/banquet-list' }) },
  openSent() { wx.navigateTo({ url: '/pages/outgoing-list/outgoing-list' }) },
})
