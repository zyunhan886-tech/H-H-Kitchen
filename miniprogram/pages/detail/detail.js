const api = require('../../utils/api')

const isBulk = unit => ['克', '毫升', 'g', 'ml'].includes(unit)   // 按克/毫升计的，步长 50；其他步长 0.25（1/4 个）
const round2 = n => Math.round(n * 100) / 100

// 食材名 → 冰箱里的那一样：先找同名，再找互相包含的（"猪瘦肉" ↔ "瘦肉"）
function matchFridge(fridge, name) {
  return fridge.find(f => f.name === name) ||
    fridge.find(f => f.name && (f.name.includes(name) || name.includes(f.name)))
}

Page({
  data: { dish: null, haveCount: 0, error: '', cook: { show: false, rows: [], missing: '', saving: false } },

  onLoad(q) { this.id = q.id },
  onShow() { this.load() },

  async load() {
    try {
      const [dish, fridge] = await Promise.all([
        api.call('getDish', { id: this.id }),
        api.call('listFridge').catch(() => [])
      ])
      this.fridge = fridge
      const names = fridge.map(f => f.name).filter(Boolean)
      dish.ingredients = (dish.ingredients || []).map(i => Object.assign({}, i, {
        have: names.some(n => n.includes(i.name) || i.name.includes(n))
      }))
      this.setData({ dish, haveCount: dish.ingredients.filter(i => i.have).length, error: '' })
    } catch (e) {
      this.setData({ error: e.message })
    }
  },

  // 未认证的小程序不能分享卡片，先提供"复制做法"，粘贴到微信里发给别人
  copyRecipe() {
    const d = this.data.dish
    if (!d) return
    const list = (title, arr) => arr.length ? `【${title}】\n` + arr.map((s, i) => `${i + 1}. ${s}`).join('\n') : ''
    const text = [
      `${d.name}${d.category ? '（' + d.category + '）' : ''}`,
      d.ingredients.length ? '【食材】\n' + d.ingredients.map(i => `${i.emoji}${i.name}`).join('  ') : '',
      list('备菜', d.prep || []),
      list('炒菜', d.cook || [])
    ].filter(Boolean).join('\n\n')
    wx.setClipboardData({ data: text, success: () => wx.showToast({ title: '已复制，可以粘贴到微信', icon: 'none' }) })
  },

  // ---------- 炒好啦：确认用量 → 扣冰箱 ----------
  openCook() {
    const dish = this.data.dish
    if (!dish) return
    const fridge = this.fridge || []
    const last = dish.lastUsage || {}
    const rows = []
    const missing = []
    for (const ing of dish.ingredients) {
      const item = matchFridge(fridge, ing.name)
      if (!item) { missing.push(ing.name); continue }
      if (rows.some(r => r.fridgeId === item._id)) continue
      const hasQty = item.qty != null
      let qty = ''
      if (hasQty) {
        const prev = last[ing.name]
        const def = prev && prev.unit === item.unit ? prev.qty : (isBulk(item.unit) ? 100 : 1)
        qty = String(round2(Math.min(def, item.qty)))
      }
      rows.push({
        fridgeId: item._id, ingredient: ing.name, emoji: ing.emoji || item.emoji, name: item.name,
        unit: item.unit, have: item.qty, haveText: api.formatQty(item.qty, item.unit),
        hasQty, qty, useUp: false, over: false
      })
    }
    if (!rows.length) {
      wx.showModal({ title: '冰箱里没有这道菜的食材', content: '没有可以扣的东西。买菜回来记得在「冰箱」里录一下～', showCancel: false })
      return
    }
    this.setData({ cook: { show: true, rows, missing: missing.join('、'), saving: false } })
  },

  closeCook() { this.setData({ 'cook.show': false }) },
  noop() {},

  onCookQty(e) {
    const i = e.currentTarget.dataset.index
    this.setRowQty(i, e.detail.value)
  },

  stepCook(e) {
    const { index, delta } = e.currentTarget.dataset
    const row = this.data.cook.rows[index]
    const cur = parseFloat(row.qty) || 0
    const next = Math.max(0, round2(cur + Number(delta) * (isBulk(row.unit) ? 50 : 0.25)))
    this.setRowQty(index, String(next))
  },

  setRowQty(i, value) {
    const row = this.data.cook.rows[i]
    const n = parseFloat(value)
    this.setData({
      [`cook.rows[${i}].qty`]: value,
      [`cook.rows[${i}].over`]: row.hasQty && isFinite(n) && n >= row.have
    })
  },

  toggleUseUp(e) {
    const i = e.currentTarget.dataset.index
    this.setData({ [`cook.rows[${i}].useUp`]: !!e.detail.value })
  },

  async confirmCook() {
    const uses = []
    for (const r of this.data.cook.rows) {
      if (!r.hasQty) { if (r.useUp) uses.push({ fridgeId: r.fridgeId, ingredient: r.ingredient, useUp: true }); continue }
      const txt = String(r.qty).trim()
      if (txt === '') continue
      const n = Number(txt)
      if (!isFinite(n) || n < 0) { wx.showToast({ title: `「${r.name}」的用量不对`, icon: 'none' }); return }
      if (n > 0) uses.push({ fridgeId: r.fridgeId, ingredient: r.ingredient, qty: round2(n) })
    }
    if (!uses.length) { wx.showToast({ title: '都是 0，没东西可扣', icon: 'none' }); return }
    this.setData({ 'cook.saving': true })
    try {
      const res = await api.call('cookDish', { id: this.id, uses })
      this.setData({ 'cook.show': false, 'cook.saving': false })
      const tail = res.usedUp.length ? `，${res.usedUp.join('、')}用完了` : ''
      wx.showToast({ title: `🍳 冰箱已更新${tail}`, icon: 'none', duration: 2500 })
      this.load()
    } catch (e) {
      this.setData({ 'cook.saving': false })
      api.toastError(e)
    }
  },

  edit() { wx.navigateTo({ url: `/pages/edit/edit?id=${this.id}` }) },

  onShareAppMessage() {
    const d = this.data.dish
    return { title: d ? `${d.name}的做法` : '我家菜谱', path: `/pages/detail/detail?id=${this.id}` }
  }
})
