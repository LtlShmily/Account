import { pinyinForHanzi } from './pinyin-data'

const SURNAME_READINGS: { [character: string]: string } = {
  曾: 'zeng', 单: 'shan', 仇: 'qiu', 区: 'ou', 查: 'zha', 解: 'xie', 乐: 'yue', 朴: 'piao',
  盖: 'ge', 华: 'hua', 纪: 'ji', 翟: 'zhai', 覃: 'qin', 郗: 'xi', 召: 'shao', 过: 'guo',
  种: 'chong', 阚: 'kan', 缪: 'miao', 燕: 'yan', 句: 'gou', 卜: 'bo', 尉: 'yu',
}

export function pinyinSortKey(name: string): string {
  return Array.from(name.trim()).map((character, index) => {
    if (index === 0 && SURNAME_READINGS[character]) return SURNAME_READINGS[character]
    return pinyinForHanzi(character) || character.toLowerCase()
  }).join('')
}

export function pinyinInitial(name: string): string {
  const first = pinyinSortKey(name).charAt(0).toUpperCase()
  return first >= 'A' && first <= 'Z' ? first : '#'
}
