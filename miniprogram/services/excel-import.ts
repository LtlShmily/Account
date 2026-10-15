import { parseAmount } from './ledger'

export interface ExcelImportRow {
  name: string
  amount: number
  remark: string
}

interface ExcelImportResult {
  rows: ExcelImportRow[]
  error: string
}

interface WorksheetRow {
  number: number
  cells: Map<number, string>
}

interface HuffmanTree {
  codes: Array<Map<number, number>>
  maxLength: number
}

const MAX_FILE_SIZE = 20 * 1024 * 1024
const MAX_UNCOMPRESSED_SIZE = 64 * 1024 * 1024

export function chooseExcelImport(onSuccess: (rows: ExcelImportRow[]) => void): void {
  wx.chooseMessageFile({
    count: 1,
    type: 'file',
    extension: ['xlsx'],
    success: (result) => {
      const file = result.tempFiles[0]
      if (!file) {
        showImportError('没有选中文件。')
        return
      }
      if (!/\.xlsx$/i.test(file.name)) {
        showImportError('请选择 .xlsx 格式文件；暂不支持 .xls。')
        return
      }
      if (file.size > MAX_FILE_SIZE) {
        showImportError('文件超过 20 MB，请拆分后再导入。')
        return
      }
      wx.getFileSystemManager().readFile({
        filePath: file.path,
        success: (readResult) => {
          if (typeof readResult.data === 'string') {
            showImportError('无法读取 Excel 文件，请重新选择。')
            return
          }
          const parsed = parseExcelWorkbook(readResult.data)
          if (parsed.error) {
            showImportError(parsed.error)
            return
          }
          onSuccess(parsed.rows)
        },
        fail: () => showImportError('读取文件失败，请重新选择。'),
      })
    },
    fail: (error) => {
      if (!/cancel/i.test(error.errMsg || '')) wx.showToast({ title: '选择文件失败', icon: 'none' })
    },
  })
}

function parseExcelWorkbook(buffer: ArrayBuffer): ExcelImportResult {
  try {
    const files = unzipXlsx(new Uint8Array(buffer))
    const workbook = files.get('xl/workbook.xml')
    const relationships = files.get('xl/_rels/workbook.xml.rels')
    if (!workbook || !relationships) return failed('文件不是有效的 .xlsx 工作簿。')
    const sharedStringsFile = files.get('xl/sharedStrings.xml')
    const sharedStrings = sharedStringsFile ? parseSharedStrings(decodeUtf8(sharedStringsFile)) : []
    const sheetPaths = getWorksheetPaths(decodeUtf8(workbook), decodeUtf8(relationships))
    if (!sheetPaths.length) return failed('工作簿中没有可读取的工作表。')

    let firstHeaderError = ''
    for (const path of sheetPaths) {
      const sheetFile = files.get(path)
      if (!sheetFile) continue
      const rows = parseWorksheetRows(decodeUtf8(sheetFile), sharedStrings)
      const parsed = parseRowsWithHeader(rows)
      if (!parsed.error || parsed.error !== '未找到姓名和金额表头。') return parsed
      if (!firstHeaderError) firstHeaderError = parsed.error
    }
    return failed(firstHeaderError || '工作簿中没有可读取的工作表。')
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return failed(message || 'Excel 文件损坏或格式不受支持，未导入任何记录。')
  }
}

function parseRowsWithHeader(rows: WorksheetRow[]): ExcelImportResult {
  let headerRowIndex = -1
  let nameColumn = -1
  let amountColumn = -1
  let remarkColumn = -1
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    let hasRecognizedHeader = false
    let rowNameColumn = -1
    let rowAmountColumn = -1
    let rowRemarkColumn = -1
    row.cells.forEach((value, column) => {
      const key = normalizeHeader(value)
      if (NAME_HEADERS.has(key)) {
        hasRecognizedHeader = true
        if (rowNameColumn < 0) rowNameColumn = column
      }
      if (AMOUNT_HEADERS.has(key)) {
        hasRecognizedHeader = true
        if (rowAmountColumn < 0) rowAmountColumn = column
      }
      if (REMARK_HEADERS.has(key) && rowRemarkColumn < 0) rowRemarkColumn = column
    })
    if (!hasRecognizedHeader) continue
    if (rowNameColumn < 0 || rowAmountColumn < 0) return failed('表头必须同时包含“姓名”和“金额”列。')
    nameColumn = rowNameColumn
    amountColumn = rowAmountColumn
    remarkColumn = rowRemarkColumn
    headerRowIndex = rowIndex
    break
  }
  if (headerRowIndex < 0) return failed('未找到姓名和金额表头。')

  const imported: ExcelImportRow[] = []
  for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index]
    const name = (row.cells.get(nameColumn) || '').trim()
    const amountText = (row.cells.get(amountColumn) || '').trim()
    const remark = remarkColumn < 0 ? '' : (row.cells.get(remarkColumn) || '').trim()
    const hasAnyValue = Array.from(row.cells.values()).some((value) => value.trim() !== '')
    if (!hasAnyValue) continue
    if (!name || !amountText) return failed(`第 ${row.number} 行姓名或金额为空，整份文件未导入。`)
    const amount = parseAmount(amountText)
    if (amount === null) return failed(`第 ${row.number} 行金额无效，请填写大于 0 且最多两位小数的数字，整份文件未导入。`)
    imported.push({ name, amount, remark })
  }
  if (!imported.length) return failed('没有可导入的数据行，未导入任何记录。')
  return { rows: imported, error: '' }
}

const NAME_HEADERS = new Set(['姓名', '名字', '收礼对象', '收礼人', '来宾姓名'])
const AMOUNT_HEADERS = new Set(['金额', '金额元', '礼金金额', '礼金金额元'])
const REMARK_HEADERS = new Set(['备注', '地址', '说明'])

function normalizeHeader(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[\s\u3000()（）:_-]/g, '')
}

function failed(error: string): ExcelImportResult {
  return { rows: [], error }
}

function showImportError(message: string): void {
  wx.showModal({ title: 'Excel 导入失败', content: message, showCancel: false, confirmText: '检查格式' })
}

function unzipXlsx(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const minimumEnd = Math.max(0, bytes.length - 22 - 65535)
  let endOffset = -1
  for (let offset = bytes.length - 22; offset >= minimumEnd; offset -= 1) {
    if (read32(view, offset) === 0x06054b50 && offset + 22 + read16(view, offset + 20) === bytes.length) {
      endOffset = offset
      break
    }
  }
  if (endOffset < 0) throw new Error('文件不是有效的 .xlsx 压缩包，未导入任何记录。')

  const diskEntryCount = read16(view, endOffset + 10)
  const directoryOffset = read32(view, endOffset + 16)
  if (diskEntryCount > 1024 || directoryOffset >= bytes.length) throw new Error('工作簿结构异常，未导入任何记录。')
  const files = new Map<string, Uint8Array>()
  let totalUncompressed = 0
  let offset = directoryOffset
  for (let entryIndex = 0; entryIndex < diskEntryCount; entryIndex += 1) {
    if (read32(view, offset) !== 0x02014b50) throw new Error('工作簿目录损坏，未导入任何记录。')
    const flags = read16(view, offset + 8)
    const method = read16(view, offset + 10)
    const expectedCrc = read32(view, offset + 16)
    const compressedSize = read32(view, offset + 20)
    const uncompressedSize = read32(view, offset + 24)
    const fileNameLength = read16(view, offset + 28)
    const extraLength = read16(view, offset + 30)
    const commentLength = read16(view, offset + 32)
    const localOffset = read32(view, offset + 42)
    const fileNameStart = offset + 46
    const fileName = decodeUtf8(bytes.subarray(fileNameStart, fileNameStart + fileNameLength))
    if (flags & 1) throw new Error('不支持加密的 Excel 文件，未导入任何记录。')
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) throw new Error('不支持超大 ZIP64 工作簿，未导入任何记录。')
    totalUncompressed += uncompressedSize
    if (totalUncompressed > MAX_UNCOMPRESSED_SIZE) throw new Error('Excel 解压后超过 64 MB，未导入任何记录。')

    if (!fileName.endsWith('/')) {
      if (read32(view, localOffset) !== 0x04034b50) throw new Error('工作簿文件内容损坏，未导入任何记录。')
      const localNameLength = read16(view, localOffset + 26)
      const localExtraLength = read16(view, localOffset + 28)
      const dataStart = localOffset + 30 + localNameLength + localExtraLength
      const compressed = bytes.subarray(dataStart, dataStart + compressedSize)
      let data: Uint8Array
      if (method === 0) data = new Uint8Array(compressed)
      else if (method === 8) data = inflateRaw(compressed, uncompressedSize)
      else throw new Error('Excel 文件使用了不支持的压缩格式，未导入任何记录。')
      if (data.length !== uncompressedSize || crc32(data) !== expectedCrc) throw new Error('Excel 文件校验失败，未导入任何记录。')
      files.set(fileName, data)
    }
    offset = fileNameStart + fileNameLength + extraLength + commentLength
  }
  return files
}

function getWorksheetPaths(workbook: string, relationships: string): string[] {
  const targets = new Map<string, string>()
  const relationshipPattern = /<Relationship\b([^>]*)\/?\s*>/g
  let relationshipMatch: RegExpExecArray | null
  while ((relationshipMatch = relationshipPattern.exec(relationships))) {
    const id = readAttribute(relationshipMatch[1], 'Id')
    const target = readAttribute(relationshipMatch[1], 'Target')
    if (id && target) targets.set(id, resolveZipPath('xl/', target))
  }
  const paths: string[] = []
  const sheetPattern = /<sheet\b([^>]*)\/?\s*>/g
  let sheetMatch: RegExpExecArray | null
  while ((sheetMatch = sheetPattern.exec(workbook))) {
    const id = readAttribute(sheetMatch[1], 'r:id')
    const path = id ? targets.get(id) : ''
    if (path && path.startsWith('xl/worksheets/')) paths.push(path)
  }
  return paths
}

function resolveZipPath(base: string, target: string): string {
  const initial = target.startsWith('/') ? [] : base.split('/').filter(Boolean)
  const parts = initial
  target.replace(/\\/g, '/').split('/').forEach((part) => {
    if (!part || part === '.') return
    if (part === '..') parts.pop()
    else parts.push(part)
  })
  return parts.join('/')
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = []
  const itemPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/g
  let itemMatch: RegExpExecArray | null
  while ((itemMatch = itemPattern.exec(xml))) {
    const item = itemMatch[1].replace(/<rPh\b[^>]*>[\s\S]*?<\/rPh>/g, '')
    strings.push(readTextElements(item, 't').join(''))
  }
  return strings
}

function parseWorksheetRows(xml: string, sharedStrings: string[]): WorksheetRow[] {
  const rows: WorksheetRow[] = []
  const rowPattern = /<row\b([^>]*)>([\s\S]*?)<\/row>/g
  let rowMatch: RegExpExecArray | null
  let sequentialNumber = 0
  while ((rowMatch = rowPattern.exec(xml))) {
    sequentialNumber += 1
    const rowNumber = Number(readAttribute(rowMatch[1], 'r')) || sequentialNumber
    const cells = new Map<number, string>()
    const cellPattern = /<c\b([^>]*?)(?:\s*\/\s*>|>([\s\S]*?)<\/c\s*>)/g
    let cellMatch: RegExpExecArray | null
    while ((cellMatch = cellPattern.exec(rowMatch[2]))) {
      const attributes = cellMatch[1]
      const reference = readAttribute(attributes, 'r')
      const column = columnIndex(reference)
      if (column < 0) continue
      const type = readAttribute(attributes, 't')
      const content = cellMatch[2] || ''
      let value = ''
      if (type === 's') {
        const stringIndex = Number(readElementText(content, 'v'))
        if (!Number.isInteger(stringIndex) || stringIndex < 0 || stringIndex >= sharedStrings.length) throw new Error(`第 ${rowNumber} 行包含无效的字符串索引，未导入任何记录。`)
        value = sharedStrings[stringIndex]
      } else if (type === 'inlineStr') {
        value = readTextElements(content, 't').join('')
      } else {
        value = readElementText(content, 'v')
        if ((!type || type === 'n') && value && Number.isFinite(Number(value))) value = String(Number(value))
      }
      cells.set(column, value)
    }
    rows.push({ number: rowNumber, cells })
  }
  return rows
}

function readAttribute(attributes: string, name: string): string {
  const escapedName = name.replace(':', '\\:')
  const match = attributes.match(new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*(["'])([\\s\\S]*?)\\1`))
  return match ? decodeXml(match[2]) : ''
}

function readElementText(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`))
  return match ? decodeXml(match[1]) : ''
}

function readTextElements(xml: string, tag: string): string[] {
  const values: string[] = []
  const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'g')
  let match: RegExpExecArray | null
  while ((match = pattern.exec(xml))) values.push(decodeXml(match[1]))
  return values
}

function decodeXml(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, key: string) => {
    const lowered = key.toLowerCase()
    if (lowered === 'amp') return '&'
    if (lowered === 'lt') return '<'
    if (lowered === 'gt') return '>'
    if (lowered === 'quot') return '"'
    if (lowered === 'apos') return "'"
    const codePoint = lowered.startsWith('#x') ? parseInt(lowered.slice(2), 16) : parseInt(lowered.slice(1), 10)
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity
  })
}

function columnIndex(reference: string): number {
  const letters = reference.match(/^([A-Z]+)/i)
  if (!letters) return -1
  let column = 0
  for (const character of letters[1].toUpperCase()) column = column * 26 + character.charCodeAt(0) - 64
  return column - 1
}

function inflateRaw(input: Uint8Array, expectedLength: number): Uint8Array {
  if (expectedLength < 0 || expectedLength > MAX_UNCOMPRESSED_SIZE) throw new Error('Excel 工作表大小异常，未导入任何记录。')
  const reader = new BitReader(input)
  const output = new Uint8Array(expectedLength)
  let outputOffset = 0
  let finalBlock = false
  while (!finalBlock) {
    finalBlock = reader.readBits(1) === 1
    const blockType = reader.readBits(2)
    if (blockType === 0) {
      reader.alignByte()
      const length = reader.readBits(16)
      const inverseLength = reader.readBits(16)
      if ((length ^ 0xffff) !== inverseLength) throw new Error('Excel 工作表压缩数据损坏，未导入任何记录。')
      for (let index = 0; index < length; index += 1) outputOffset = writeOutput(output, outputOffset, reader.readBits(8))
      continue
    }
    if (blockType === 3) throw new Error('Excel 工作表压缩格式无效，未导入任何记录。')
    let literalTree: HuffmanTree
    let distanceTree: HuffmanTree
    if (blockType === 1) {
      const literalLengths = new Array<number>(288).fill(8)
      for (let symbol = 144; symbol <= 255; symbol += 1) literalLengths[symbol] = 9
      for (let symbol = 256; symbol <= 279; symbol += 1) literalLengths[symbol] = 7
      for (let symbol = 280; symbol <= 287; symbol += 1) literalLengths[symbol] = 8
      literalTree = buildHuffman(literalLengths)
      distanceTree = buildHuffman(new Array<number>(32).fill(5))
    } else {
      const trees = readDynamicTrees(reader)
      literalTree = trees.literal
      distanceTree = trees.distance
    }
    let symbol = decodeSymbol(reader, literalTree)
    while (symbol !== 256) {
      if (symbol < 256) {
        outputOffset = writeOutput(output, outputOffset, symbol)
      } else {
        const lengthIndex = symbol - 257
        if (lengthIndex < 0 || lengthIndex >= LENGTH_BASE.length) throw new Error('Excel 工作表压缩数据包含无效符号，未导入任何记录。')
        const length = LENGTH_BASE[lengthIndex] + reader.readBits(LENGTH_EXTRA[lengthIndex])
        const distanceSymbol = decodeSymbol(reader, distanceTree)
        if (distanceSymbol >= DISTANCE_BASE.length) throw new Error('Excel 工作表压缩距离无效，未导入任何记录。')
        const distance = DISTANCE_BASE[distanceSymbol] + reader.readBits(DISTANCE_EXTRA[distanceSymbol])
        if (distance > outputOffset) throw new Error('Excel 工作表引用了无效数据，未导入任何记录。')
        for (let index = 0; index < length; index += 1) {
          outputOffset = writeOutput(output, outputOffset, output[outputOffset - distance])
        }
      }
      symbol = decodeSymbol(reader, literalTree)
    }
  }
  if (outputOffset !== expectedLength) throw new Error('Excel 工作表解压长度不符，未导入任何记录。')
  return output
}

function readDynamicTrees(reader: BitReader): { literal: HuffmanTree; distance: HuffmanTree } {
  const literalCount = reader.readBits(5) + 257
  const distanceCount = reader.readBits(5) + 1
  const codeLengthCount = reader.readBits(4) + 4
  const order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]
  const codeLengths = new Array<number>(19).fill(0)
  for (let index = 0; index < codeLengthCount; index += 1) codeLengths[order[index]] = reader.readBits(3)
  const codeLengthTree = buildHuffman(codeLengths)
  const combined = new Array<number>(literalCount + distanceCount)
  let lengthIndex = 0
  while (lengthIndex < combined.length) {
    const symbol = decodeSymbol(reader, codeLengthTree)
    if (symbol <= 15) {
      combined[lengthIndex] = symbol
      lengthIndex += 1
    } else if (symbol === 16) {
      if (lengthIndex === 0) throw new Error('Excel 工作表代码长度无效，未导入任何记录。')
      const repeat = reader.readBits(2) + 3
      if (lengthIndex + repeat > combined.length) throw new Error('Excel 工作表代码长度超出范围，未导入任何记录。')
      const previous = combined[lengthIndex - 1]
      for (let index = 0; index < repeat; index += 1) combined[lengthIndex++] = previous
    } else {
      const repeat = symbol === 17 ? reader.readBits(3) + 3 : symbol === 18 ? reader.readBits(7) + 11 : 0
      if (!repeat || lengthIndex + repeat > combined.length) throw new Error('Excel 工作表重复代码无效，未导入任何记录。')
      for (let index = 0; index < repeat; index += 1) combined[lengthIndex++] = 0
    }
  }
  const literalLengths = combined.slice(0, literalCount)
  const distanceLengths = combined.slice(literalCount)
  if (!literalLengths[256]) throw new Error('Excel 工作表缺少结束代码，未导入任何记录。')
  return { literal: buildHuffman(literalLengths), distance: buildHuffman(distanceLengths) }
}

function buildHuffman(lengths: number[]): HuffmanTree {
  const counts = new Array<number>(16).fill(0)
  let maxLength = 0
  for (const length of lengths) {
    if (length < 0 || length > 15) throw new Error('Excel 工作表哈夫曼代码无效，未导入任何记录。')
    if (length) {
      counts[length] += 1
      maxLength = Math.max(maxLength, length)
    }
  }
  if (!maxLength) throw new Error('Excel 工作表缺少压缩代码，未导入任何记录。')
  let code = 0
  const nextCode = new Array<number>(16).fill(0)
  for (let bits = 1; bits <= 15; bits += 1) {
    code = (code + counts[bits - 1]) << 1
    if (code + counts[bits] > (1 << bits)) throw new Error('Excel 工作表哈夫曼树无效，未导入任何记录。')
    nextCode[bits] = code
  }
  const codes = Array.from({ length: 16 }, () => new Map<number, number>())
  lengths.forEach((length, symbol) => {
    if (!length) return
    codes[length].set(nextCode[length], symbol)
    nextCode[length] += 1
  })
  return { codes, maxLength }
}

function decodeSymbol(reader: BitReader, tree: HuffmanTree): number {
  let code = 0
  for (let length = 1; length <= tree.maxLength; length += 1) {
    code = (code << 1) | reader.readBits(1)
    const symbol = tree.codes[length].get(code)
    if (symbol !== undefined) return symbol
  }
  throw new Error('Excel 工作表压缩代码无法解析，未导入任何记录。')
}

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
const DISTANCE_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
const DISTANCE_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]

class BitReader {
  private offset: number
  private bitOffset: number
  private readonly bytes: Uint8Array

  constructor(bytes: Uint8Array) {
    this.bytes = bytes
    this.offset = 0
    this.bitOffset = 0
  }

  readBits(count: number): number {
    let value = 0
    for (let index = 0; index < count; index += 1) {
      if (this.offset >= this.bytes.length) throw new Error('Excel 工作表压缩数据意外结束，未导入任何记录。')
      value |= ((this.bytes[this.offset] >> this.bitOffset) & 1) << index
      this.bitOffset += 1
      if (this.bitOffset === 8) {
        this.bitOffset = 0
        this.offset += 1
      }
    }
    return value >>> 0
  }

  alignByte(): void {
    if (this.bitOffset) {
      this.bitOffset = 0
      this.offset += 1
    }
  }
}

function writeOutput(output: Uint8Array, offset: number, value: number): number {
  if (offset >= output.length) throw new Error('Excel 工作表解压数据超出预期大小，未导入任何记录。')
  output[offset] = value
  return offset + 1
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let index = 0; index < bytes.length; index += 1) {
    crc ^= bytes[index]
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function read16(view: DataView, offset: number): number {
  if (offset < 0 || offset + 2 > view.byteLength) throw new Error('Excel ZIP 数据不完整，未导入任何记录。')
  return view.getUint16(offset, true)
}

function read32(view: DataView, offset: number): number {
  if (offset < 0 || offset + 4 > view.byteLength) throw new Error('Excel ZIP 数据不完整，未导入任何记录。')
  return view.getUint32(offset, true)
}

function decodeUtf8(bytes: Uint8Array): string {
  let text = ''
  for (let index = 0; index < bytes.length;) {
    const first = bytes[index]
    let codePoint = 0xfffd
    let length = 1
    if (first < 0x80) codePoint = first
    else if ((first & 0xe0) === 0xc0 && index + 1 < bytes.length) {
      codePoint = ((first & 0x1f) << 6) | (bytes[index + 1] & 0x3f)
      length = 2
    } else if ((first & 0xf0) === 0xe0 && index + 2 < bytes.length) {
      codePoint = ((first & 0x0f) << 12) | ((bytes[index + 1] & 0x3f) << 6) | (bytes[index + 2] & 0x3f)
      length = 3
    } else if ((first & 0xf8) === 0xf0 && index + 3 < bytes.length) {
      codePoint = ((first & 0x07) << 18) | ((bytes[index + 1] & 0x3f) << 12) | ((bytes[index + 2] & 0x3f) << 6) | (bytes[index + 3] & 0x3f)
      length = 4
    }
    if (codePoint <= 0xffff) text += String.fromCharCode(codePoint)
    else {
      const adjusted = codePoint - 0x10000
      text += String.fromCharCode(0xd800 + (adjusted >> 10), 0xdc00 + (adjusted & 0x3ff))
    }
    index += length
  }
  return text
}
