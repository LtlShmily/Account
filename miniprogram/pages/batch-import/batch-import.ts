import { getLedger, makeId, saveLedger } from '../../services/ledger'
import { parseBatchGiftText } from '../../services/batch-import'

Page({
  data: { banquetId: '', banquetName: '', content: '', lineCount: 0 },
  onLoad(query: Record<string, string | undefined>) {
    const banquetId = query.banquetId || ''
    const banquet = getLedger().banquets.find((item) => item.id === banquetId)
    if (!banquet) {
      wx.showToast({ title: '请先选择一个有效宴席', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 500)
      return
    }
    this.setData({ banquetId, banquetName: banquet.name })
  },
  onTextInput(e: WechatMiniprogram.TextareaInput) {
    const content = e.detail.value
    this.setData({ content, lineCount: content.split(/\r?\n/).filter((line) => line.trim()).length })
  },
  importRecords() {
    const parsed = parseBatchGiftText(this.data.content)
    if (parsed.error) {
      wx.showModal({ title: '导入失败', content: parsed.error, showCancel: false, confirmText: '检查格式' })
      return
    }
    const ledger = getLedger()
    const banquet = ledger.banquets.find((item) => item.id === this.data.banquetId)
    if (!banquet) {
      wx.showToast({ title: '宴席不存在，请返回重试', icon: 'none' })
      return
    }
    const imported = parsed.rows.map((row) => ({ id: makeId(), name: row.name, amount: row.amount, address: row.address, gift: row.gift, date: banquet.date }))
    banquet.guests = [...imported, ...banquet.guests]
    saveLedger(ledger)
    wx.showToast({ title: `已导入 ${imported.length} 笔`, icon: 'success' })
    setTimeout(() => wx.navigateBack(), 450)
  },
})
