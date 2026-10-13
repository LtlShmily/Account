import { parseAmount } from './ledger'

export interface ImportedLedgerRow {
  name: string
  amount: number
  remark: string
}

export interface BatchImportResult {
  rows: ImportedLedgerRow[]
  error: string
}

function columnsForLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((value) => value.trim())
  const spacedColumns = line.trim().split(/\s{2,}/)
  if (spacedColumns.length > 1) return spacedColumns.map((value) => value.trim())

  // For manually typed rows, locate the amount after the name. Two or more spaces
  // allow names with spaces while still locating the numeric amount.
  const match = line.trim().match(/^(.*?)\s+(\d+(?:[.,]\d{1,2})?)(?:\s+(.*))?$/)
  if (!match) return [line.trim()]
  const trailing = match[3] ? match[3].split(/\s{2,}/).map((value) => value.trim()) : []
  return [match[1].trim(), match[2], ...trailing]
}

export function parseBatchRecordText(text: string): BatchImportResult {
  const lines = text.replace(/\r/g, '').split('\n')
  const rows: ImportedGiftRow[] = []
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].trim()) continue
    const columns = columnsForLine(lines[index])
    const lineNumber = index + 1
    if (columns.length < 2 || !columns[0] || !columns[1]) {
      return { rows: [], error: `第 ${lineNumber} 行姓名或金额缺失，请检查导入格式。` }
    }
    if (columns.length > 3) return { rows: [], error: `第 ${lineNumber} 行列数超过 3 列，请检查导入格式。` }
    const amount = parseAmount(columns[1])
    if (amount === null) return { rows: [], error: `第 ${lineNumber} 行金额格式不正确，请填写大于 0 的数字。` }
    rows.push({ name: columns[0], amount, remark: columns[2] || '' })
  }
  if (!rows.length) return { rows: [], error: '请先粘贴要导入的记录。' }
  return { rows, error: '' }
}
