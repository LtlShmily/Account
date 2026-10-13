import { getLedger, makeId, saveLedger, today } from '../../services/ledger'
import { parseBatchRecordText } from '../../services/batch-import'

Page({
  data: { importType: 'income', banquetId: '', banquetName: '', pageTitle: '批量导入收礼记录', fieldName: '名字', fieldThird: '备注', exampleText: '姓名  金额  备注（每行一条，如：张三  200  XX小区）', content: '', lineCount: 0 },
  onReady() { wx.setNavigationBarTitle({ title: this.data.pageTitle }) },
  onLoad(query: Record<string, string | undefined>) {
    if (query.type === 'outgoing') {
      this.setData({ importType: 'outgoing', banquetName: '送出礼金', pageTitle: '批量导入送礼记录', fieldName: '收礼对象', fieldThird: '备注', exampleText: '姓名  金额  备注（每行一条，如：张三  200  XX小区）' })
      return
    }
    const banquetId = query.banquetId || ''
    const banquet = getLedger().banquets.find((item) => item.id === banquetId)
    if (!banquet) {
      wx.showToast({ title: '请先选择一个有效宴席', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 500)
      return
    }
    this.setData({ importType: 'income', banquetId, banquetName: banquet.name })
  },
  onTextInput(e: WechatMiniprogram.TextareaInput) {
    const content = e.detail.value
    this.setData({ content, lineCount: content.split(/\r?\n/).filter((line) => line.trim()).length })
  },
  importRecords() {
    const parsed = parseBatchRecordText(this.data.content)
    if (parsed.error) {
      wx.showModal({ title: '导入失败', content: parsed.error, showCancel: false, confirmText: '检查格式' })
      return
    }
    const ledger = getLedger()
    let importedCount = 0
    if (this.data.importType === 'outgoing') {
      const imported = parsed.rows.map((row) => ({ id: makeId(), name: row.name, amount: row.amount, date: today(), note: row.remark }))
      ledger.outgoing = [...imported, ...ledger.outgoing]
      importedCount = imported.length
    } else {
      const banquet = ledger.banquets.find((item) => item.id === this.data.banquetId)
      if (!banquet) {
        wx.showToast({ title: '宴席不存在，请返回重试', icon: 'none' })
        return
      }
      const imported = parsed.rows.map((row) => ({ id: makeId(), name: row.name, amount: row.amount, address: row.remark, date: banquet.date }))
      banquet.guests = [...imported, ...banquet.guests]
      importedCount = imported.length
    }
    saveLedger(ledger)
    wx.showToast({ title: `已导入 ${importedCount} 笔`, icon: 'success' })
    setTimeout(() => wx.navigateBack(), 450)
  },
})
