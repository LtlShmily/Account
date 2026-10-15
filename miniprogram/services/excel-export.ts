import { getLedger, getPeopleSummary } from './ledger'
import { pinyinInitial, pinyinSortKey } from './pinyin'

export type ExcelExportType = 'income' | 'outgoing' | 'summary' | 'all'

interface SheetData {
  name: string
  headers: string[]
  rows: Array<Array<string | number>>
  amountColumns: number[]
  widths: number[]
}

interface ZipEntry {
  name: string
  data: Uint8Array
  crc: number
  offset: number
}

interface SummaryTransaction {
  type: '收入' | '支出'
  amount: number
  date: string
  source: string
  remark: string
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const INDEX_ORDER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'

export function exportLedgerExcel(type: ExcelExportType): void {
  const sheets = createSheets(type)
  const workbook = createWorkbookFiles(sheets)
  const bytes = createZip(workbook)
  const timestamp = formatTimestamp(new Date())
  const suffix: Record<ExcelExportType, string> = {
    income: '收取礼金',
    outgoing: '送出礼金',
    summary: '总计数据',
    all: '完整账本',
  }
  const filePath = `${wx.env.USER_DATA_PATH}/礼金账本-${suffix[type]}-${timestamp}.xlsx`
  const fileSystem = wx.getFileSystemManager()
  fileSystem.writeFile({
    filePath,
    data: toArrayBuffer(bytes),
    success: () => {
      wx.openDocument({
        filePath,
        fileType: 'xlsx',
        showMenu: true,
        fail: () => wx.showToast({ title: '文件已生成，打开失败', icon: 'none' }),
      })
    },
    fail: () => wx.showToast({ title: '导出失败，请重试', icon: 'none' }),
  })
}

function createSheets(type: ExcelExportType): SheetData[] {
  const ledger = getLedger()
  const income: SheetData = {
    name: '收取礼金',
    headers: ['来宾姓名', '金额（元）', '宴席地点', '备注', '宴席名称', '宴席日期'],
    rows: ledger.banquets.flatMap((banquet) => banquet.guests.map((guest) => [
      guest.name,
      guest.amount / 100,
      banquet.location,
      guest.address,
      banquet.name,
      banquet.date,
    ])),
    amountColumns: [1],
    widths: [18, 14, 24, 28, 22, 14],
  }
  const outgoing: SheetData = {
    name: '送出礼金',
    headers: ['收礼对象', '金额（元）', '备注', '日期'],
    rows: ledger.outgoing.map((gift) => [gift.name, gift.amount / 100, gift.note, gift.date]),
    amountColumns: [1],
    widths: [20, 14, 30, 14],
  }
  const incomeCounts = new Map<string, number>()
  const expenseCounts = new Map<string, number>()
  const transactions = new Map<string, SummaryTransaction[]>()
  for (const banquet of ledger.banquets) {
    for (const guest of banquet.guests) {
      incrementCount(incomeCounts, guest.name)
      addTransaction(transactions, guest.name, {
        type: '收入',
        amount: guest.amount,
        date: guest.date || banquet.date,
        source: banquet.name,
        remark: guest.address,
      })
    }
  }
  for (const gift of ledger.outgoing) {
    incrementCount(expenseCounts, gift.name)
    addTransaction(transactions, gift.name, {
      type: '支出',
      amount: gift.amount,
      date: gift.date,
      source: '',
      remark: gift.note,
    })
  }
  const sortedPeople = getPeopleSummary()
    .map((person) => ({ person, initial: pinyinInitial(person.name), sortKey: pinyinSortKey(person.name) }))
    .sort((first, second) => INDEX_ORDER.indexOf(first.initial) - INDEX_ORDER.indexOf(second.initial)
      || compareText(first.sortKey, second.sortKey)
      || compareText(first.person.name, second.person.name))
  const incomeTotal = ledger.banquets.reduce((sum, banquet) => sum + banquet.guests.reduce((guestSum, guest) => guestSum + guest.amount, 0), 0)
  const expenseTotal = ledger.outgoing.reduce((sum, gift) => sum + gift.amount, 0)
  const summaryRows: Array<Array<string | number>> = sortedPeople.flatMap(({ person }) => {
    const key = person.name.trim().toLocaleLowerCase()
    const personTransactions = (transactions.get(key) || []).sort((first, second) => second.date.localeCompare(first.date)
      || compareText(first.type, second.type)
      || compareText(first.source, second.source))
    return personTransactions.map((transaction) => [
      person.name,
      person.income / 100,
      person.expense / 100,
      person.balance / 100,
      incomeCounts.get(key) || 0,
      expenseCounts.get(key) || 0,
      transaction.type,
      transaction.amount / 100,
      transaction.date,
      transaction.source,
      transaction.remark,
    ])
  })
  summaryRows.push([
    '合计',
    incomeTotal / 100,
    expenseTotal / 100,
    (incomeTotal - expenseTotal) / 100,
    Array.from(incomeCounts.values()).reduce((sum, count) => sum + count, 0),
    Array.from(expenseCounts.values()).reduce((sum, count) => sum + count, 0),
    '',
    '',
    '',
    '',
    '',
  ])
  const summary: SheetData = {
    name: '总计数据',
    headers: ['姓名', '收入合计（元）', '支出合计（元）', '差额（元）', '收入笔数', '支出笔数', '收支类型', '本笔金额（元）', '日期', '来源宴席', '备注'],
    rows: summaryRows,
    amountColumns: [1, 2, 3, 7],
    widths: [20, 19, 19, 18, 14, 14, 14, 18, 14, 22, 28],
  }

  if (type === 'income') return [income]
  if (type === 'outgoing') return [outgoing]
  if (type === 'summary') return [summary]
  return [income, outgoing, summary]
}

function incrementCount(counts: Map<string, number>, name: string): void {
  const key = name.trim().toLocaleLowerCase()
  if (key) counts.set(key, (counts.get(key) || 0) + 1)
}

function addTransaction(transactions: Map<string, SummaryTransaction[]>, name: string, transaction: SummaryTransaction): void {
  const key = name.trim().toLocaleLowerCase()
  if (!key) return
  const items = transactions.get(key) || []
  items.push(transaction)
  transactions.set(key, items)
}

function compareText(first: string, second: string): number {
  if (first < second) return -1
  if (first > second) return 1
  return 0
}

function createWorkbookFiles(sheets: SheetData[]): Array<{ name: string; data: Uint8Array }> {
  const sheetOverrides = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
  const workbookSheets = sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')
  const sheetRelationships = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')
  const files: Array<{ name: string; data: Uint8Array }> = [
    { name: '[Content_Types].xml', data: utf8(`${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetOverrides}</Types>`) },
    { name: '_rels/.rels', data: utf8(`${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: 'xl/workbook.xml', data: utf8(`${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`) },
    { name: 'xl/_rels/workbook.xml.rels', data: utf8(`${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRelationships}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: 'xl/styles.xml', data: utf8(createStylesXml()) },
  ]
  sheets.forEach((sheet, index) => files.push({ name: `xl/worksheets/sheet${index + 1}.xml`, data: utf8(createSheetXml(sheet)) }))
  return files
}

function createStylesXml(): string {
  return `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFB5221E"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFE8DED4"/></left><right style="thin"><color rgb="FFE8DED4"/></right><top style="thin"><color rgb="FFE8DED4"/></top><bottom style="thin"><color rgb="FFE8DED4"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
}

function createSheetXml(sheet: SheetData): string {
  const rows = [sheet.headers, ...sheet.rows]
  const rowXml = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const reference = `${columnName(columnIndex + 1)}${rowIndex + 1}`
      if (rowIndex === 0) return inlineStringCell(reference, String(value), 1)
      if (typeof value === 'number') {
        const style = sheet.amountColumns.indexOf(columnIndex) >= 0 ? 2 : 3
        return `<c r="${reference}" s="${style}"><v>${Number.isFinite(value) ? value : 0}</v></c>`
      }
      return inlineStringCell(reference, value, 3)
    }).join('')
    return `<row r="${rowIndex + 1}"${rowIndex === 0 ? ' ht="26" customHeight="1"' : ''}>${cells}</row>`
  }).join('')
  const lastColumn = columnName(sheet.headers.length)
  const lastRow = rows.length
  const columns = sheet.widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')
  return `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="21"/><cols>${columns}</cols><sheetData>${rowXml}</sheetData><autoFilter ref="A1:${lastColumn}${lastRow}"/></worksheet>`
}

function inlineStringCell(reference: string, value: string, style: number): string {
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
}

function escapeXml(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, ' ')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function columnName(index: number): string {
  let value = index
  let name = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    value = Math.floor((value - 1) / 26)
  }
  return name
}

function createZip(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const entries: ZipEntry[] = []
  let localSize = 0
  for (const file of files) {
    const name = utf8(file.name)
    const data = file.data
    const entry: ZipEntry = { name: file.name, data, crc: crc32(data), offset: localSize }
    entries.push(entry)
    localSize += 30 + name.length + data.length
  }
  const centralSize = entries.reduce((sum, entry) => sum + 46 + utf8(entry.name).length, 0)
  const result = new Uint8Array(localSize + centralSize + 22)
  let offset = 0
  for (const entry of entries) {
    const name = utf8(entry.name)
    write32(result, offset, 0x04034b50)
    write16(result, offset + 4, 20)
    write16(result, offset + 6, 0x0800)
    write16(result, offset + 8, 0)
    write16(result, offset + 10, 0)
    write16(result, offset + 12, 33)
    write32(result, offset + 14, entry.crc)
    write32(result, offset + 18, entry.data.length)
    write32(result, offset + 22, entry.data.length)
    write16(result, offset + 26, name.length)
    write16(result, offset + 28, 0)
    result.set(name, offset + 30)
    result.set(entry.data, offset + 30 + name.length)
    offset += 30 + name.length + entry.data.length
  }
  const centralOffset = offset
  for (const entry of entries) {
    const name = utf8(entry.name)
    write32(result, offset, 0x02014b50)
    write16(result, offset + 4, 20)
    write16(result, offset + 6, 20)
    write16(result, offset + 8, 0x0800)
    write16(result, offset + 10, 0)
    write16(result, offset + 12, 0)
    write16(result, offset + 14, 33)
    write32(result, offset + 16, entry.crc)
    write32(result, offset + 20, entry.data.length)
    write32(result, offset + 24, entry.data.length)
    write16(result, offset + 28, name.length)
    write16(result, offset + 30, 0)
    write16(result, offset + 32, 0)
    write16(result, offset + 34, 0)
    write16(result, offset + 36, 0)
    write32(result, offset + 38, 0)
    write32(result, offset + 42, entry.offset)
    result.set(name, offset + 46)
    offset += 46 + name.length
  }
  write32(result, offset, 0x06054b50)
  write16(result, offset + 4, 0)
  write16(result, offset + 6, 0)
  write16(result, offset + 8, entries.length)
  write16(result, offset + 10, entries.length)
  write32(result, offset + 12, centralSize)
  write32(result, offset + 16, centralOffset)
  write16(result, offset + 20, 0)
  return result
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index += 1) {
    crc ^= bytes[index]
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function utf8(value: string): Uint8Array {
  const bytes: number[] = []
  for (let index = 0; index < value.length; index += 1) {
    let codePoint = value.charCodeAt(index)
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && index + 1 < value.length) {
      const low = value.charCodeAt(index + 1)
      if (low >= 0xdc00 && low <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (low - 0xdc00)
        index += 1
      }
    }
    if (codePoint < 0x80) bytes.push(codePoint)
    else if (codePoint < 0x800) bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f))
    else if (codePoint < 0x10000) bytes.push(0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f))
    else bytes.push(0xf0 | (codePoint >> 18), 0x80 | ((codePoint >> 12) & 0x3f), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f))
  }
  return new Uint8Array(bytes)
}

function write16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff
  bytes[offset + 1] = (value >>> 8) & 0xff
}

function write32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff
  bytes[offset + 1] = (value >>> 8) & 0xff
  bytes[offset + 2] = (value >>> 16) & 0xff
  bytes[offset + 3] = (value >>> 24) & 0xff
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function formatTimestamp(date: Date): string {
  const pad = (value: number): string => value < 10 ? `0${value}` : String(value)
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${milliseconds}`
}
