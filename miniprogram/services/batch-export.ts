export interface ExportRecord {
  name: string
  amount: number
  remark: string
}

function cleanColumn(value: string): string {
  return value.replace(/[\t\r\n]+/g, ' ').trim()
}

export function formatBatchImportText(records: ExportRecord[]): string {
  return records
    .map((record) => [cleanColumn(record.name), (record.amount / 100).toFixed(2), cleanColumn(record.remark || '')].join('\t'))
    .join('\n')
}
