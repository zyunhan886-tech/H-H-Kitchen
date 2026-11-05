// 冰箱文字录入：把"芹菜一斤，鸡蛋10个、酱油一瓶 半斤五花肉"拆成一条条。
// 只做常见的"名称+数量+单位"/"数量+单位+名称"，识别不了的整段当名称，预览里可以改。
const UNITS = ['毫升', '千克', '公斤', 'kg', 'ml', '个', '只', '斤', '两', '克', 'g', '升', 'l', '瓶', '罐', '袋', '包', '盒', '把', '根', '颗', '块', '片', '条', '棵', '份', '打', '串', '箱', '桶', '碗', '勺', '头', '瓣', '枚', '盒']
const ALIAS = { 公斤: '千克', kg: '千克', g: '克', ml: '毫升', l: '升', 枚: '个' }
const UNIT = '(' + [...new Set(UNITS)].sort((a, b) => b.length - a.length).join('|') + ')'
const NUM = '(\\d+(?:\\.\\d+)?|半|[零一二两三四五六七八九十百]+?)'
const SUFFIX = new RegExp(`^(.+?)\\s*${NUM}\\s*${UNIT}?(半)?$`, 'i')
const PREFIX = new RegExp(`^${NUM}\\s*${UNIT}(半)?\\s*(.+)$`, 'i')
const ONLY_QTY = new RegExp(`^${NUM}\\s*${UNIT}?(半)?$`, 'i')
const DIGITS = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

function toNumber(s) {
  if (s === '半') return 0.5
  if (/^\d/.test(s)) return Number(s)
  let total = 0, cur = 0
  for (const c of s) {
    if (c in DIGITS) cur = DIGITS[c]
    else if (c === '十') { total += (cur || 1) * 10; cur = 0 }
    else if (c === '百') { total += (cur || 1) * 100; cur = 0 }
  }
  return total + cur
}

function unitOf(u) {
  if (!u) return ''
  const k = u.toLowerCase()
  return ALIAS[k] || ALIAS[u] || u
}

function qtyOf(num, unit, half) {
  // 没有单位时，只认阿拉伯数字（避免把"腊八"当成 8）
  if (!unit && !/^\d/.test(num)) return null
  const n = toNumber(num) + (half ? 0.5 : 0)
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

function normalize(text) {
  return String(text || '')
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/．/g, '.')
    .replace(/^\s*(?:\d+[.)、]|[-*•·])\s*/gm, '')   // 去掉列表编号
    .replace(/[（(]([^()（）]*)[)）]/g, ' $1')        // 番茄（三个）
    .replace(/\s*[×xX*]\s*(?=\d)/g, ' ')             // 五花肉×2
}

// 解析一段数量，比如"2个"、"半斤"，给冰箱"修改数量"用
function parseQty(text) {
  const t = normalize(text).trim()
  if (!t) return { qty: null, unit: '' }
  const m = t.match(ONLY_QTY)
  if (!m) return null
  const unit = unitOf(m[2])
  const qty = /^\d/.test(m[1]) || unit ? toNumber(m[1]) + (m[3] ? 0.5 : 0) : null
  return qty ? { qty: Math.round(qty * 100) / 100, unit } : null
}

function parseStock(text) {
  const pieces = normalize(text).split(/[,，、。；;：:\n\r\t|/／\s]+/).map(s => s.trim()).filter(Boolean)
  const out = []
  for (const p of pieces) {
    const only = p.match(ONLY_QTY)
    if (only && (only[2] || /^\d/.test(only[1]))) {
      // 单独的数量，比如"鸡蛋，10个"里的"10个"，接到上一项
      const last = out[out.length - 1]
      if (last && last.qty == null) { last.unit = unitOf(only[2]); last.qty = qtyOf(only[1], only[2], only[3]) }
      continue
    }
    let m = p.match(SUFFIX)
    let item = null
    if (m) {
      const qty = qtyOf(m[2], m[3], m[4])
      if (qty != null) item = { name: m[1].trim(), qty, unit: unitOf(m[3]) }
    }
    if (!item && (m = p.match(PREFIX))) {
      item = { name: m[4].trim(), qty: qtyOf(m[1], m[2], m[3]), unit: unitOf(m[2]) }
    }
    if (!item) item = { name: p, qty: null, unit: '' }
    item.name = item.name.replace(/^的|的$/g, '').slice(0, 20)
    if (item.name) out.push(item)
  }
  return out
}

module.exports = { parseStock, parseQty }
