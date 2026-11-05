const api = require('../../utils/api')
const { parseStock, parseQty } = require('../../utils/parse')
const { guessEmoji } = require('../../utils/emoji')
const { DEFAULT_STAPLES, isBulk } = require('../../utils/const')
const app = getApp()

const round2 = n => Math.round(n * 100) / 100

Page({
  data: {
    loading: true, hasFamily: false, items: [], text: '', preview: [], saving: false,
    // 常买的菜：每样 { name, unit, emoji, add: '数量字符串', stock: '冰箱里有 2个' }
    staples: [], stapleCount: 0, editingStaples: false, addingStaples: false
  },

  onShow() { this.load() },
  onPullDownRefresh() { this.load(true).then(() => wx.stopPullDownRefresh()) },

  async load(force) {
    if (force) this.stapleList = null          // 下拉刷新时重新拉家人改过的常买清单
    try {
      const me = await app.getMe(force)
      if (!me.family) { this.setData({ loading: false, hasFamily: false }); return }
      const [items, st] = await Promise.all([
        api.call('listFridge'),
        this.stapleList ? Promise.resolve(null) : api.call('getStaples').catch(() => null)
      ])
      items.forEach(i => { i.qtyText = api.formatQty(i.qty, i.unit) })
      if (!this.stapleList) {
        this.stapleList = (st && st.staples) || DEFAULT_STAPLES
        this.staplesSaved = !!(st && st.saved)
      }
      this.setData({ loading: false, hasFamily: true, items })
      this.renderStaples()
    } catch (e) {
      this.setData({ loading: false })
      api.toastError(e)
    }
  },

  // ---------- 常买的菜 ----------
  // 把清单 + 冰箱库存 + 正在输入的数量 合成页面要显示的格子
  renderStaples() {
    const adds = {}
    this.data.staples.forEach(s => { adds[s.name] = s.add })
    const items = this.data.items
    const staples = this.stapleList.map(s => {
      const same = items.find(i => i.name === s.name && i.unit === s.unit) || items.find(i => i.name === s.name)
      return {
        name: s.name, unit: s.unit, emoji: s.emoji || guessEmoji(s.name),
        add: adds[s.name] || '',
        stock: same ? `冰箱里 ${same.qtyText}` : ''
      }
    })
    this.setData({ staples })
    this.countStaples()
  },

  countStaples() {
    const stapleCount = this.data.staples.filter(s => parseFloat(s.add) > 0).length
    this.setData({ stapleCount })
  },

  stepStaple(e) {
    const { index, delta } = e.currentTarget.dataset
    const s = this.data.staples[index]
    const next = Math.max(0, round2((parseFloat(s.add) || 0) + Number(delta) * (isBulk(s.unit) ? 50 : 1)))
    this.setData({ [`staples[${index}].add`]: next ? String(next) : '' })
    this.countStaples()
  },

  onStapleInput(e) {
    this.setData({ [`staples[${e.currentTarget.dataset.index}].add`]: e.detail.value })
    this.countStaples()
  },

  clearStaples() {
    this.setData({ staples: this.data.staples.map(s => Object.assign({}, s, { add: '' })), stapleCount: 0 })
  },

  async confirmStaples() {
    const items = []
    for (const s of this.data.staples) {
      const txt = String(s.add).trim()
      if (!txt) continue
      const qty = Number(txt)
      if (!isFinite(qty) || qty < 0) { wx.showToast({ title: `「${s.name}」的数量不对`, icon: 'none' }); return }
      if (qty > 0) items.push({ name: s.name, unit: s.unit, qty: round2(qty), emoji: s.emoji })
    }
    if (!items.length) return
    this.setData({ addingStaples: true })
    try {
      await api.call('addFridge', { items })
      this.clearStaples()
      wx.showToast({ title: `放进冰箱了（${items.length} 样）`, icon: 'none' })
      await this.load()
    } catch (e) { api.toastError(e) }
    this.setData({ addingStaples: false })
  },

  // 改单位：比如五花肉 条 → 克。全家共用，保存到云端
  editUnit(e) {
    const i = e.currentTarget.dataset.index
    const s = this.stapleList[i]
    wx.showModal({
      title: `${s.name}用什么单位？`, editable: true, placeholderText: '比如：条、克、斤、袋', content: s.unit || '',
      success: r => {
        if (!r.confirm) return
        const unit = (r.content || '').trim().slice(0, 6)
        if (!unit) { wx.showToast({ title: '单位不能为空', icon: 'none' }); return }
        if (/\d/.test(unit)) { wx.showToast({ title: '只填单位，数量用 ＋ − 调', icon: 'none' }); return }
        this.stapleList = this.stapleList.map((x, j) => j === i ? Object.assign({}, x, { unit }) : x)
        this.setData({ [`staples[${i}].add`]: '' })
        this.renderStaples()
        this.saveStapleList()
      }
    })
  },

  toggleEditStaples() { this.setData({ editingStaples: !this.data.editingStaples }) },

  removeStaple(e) {
    const i = e.currentTarget.dataset.index
    this.stapleList = this.stapleList.filter((_, j) => j !== i)
    const staples = this.data.staples.slice()
    staples.splice(i, 1)
    this.setData({ staples })
    this.renderStaples()
    this.saveStapleList()
  },

  addStaple() {
    wx.showModal({
      title: '添加常买的菜', editable: true, placeholderText: '名字 单位，比如：排骨 斤',
      success: r => {
        if (!r.confirm) return
        const parts = (r.content || '').trim().split(/[\s,，]+/).filter(Boolean)
        const name = (parts[0] || '').slice(0, 20)
        const unit = (parts[1] || '份').slice(0, 6)
        if (!name) return
        if (this.stapleList.some(s => s.name === name)) { wx.showToast({ title: `已经有「${name}」了`, icon: 'none' }); return }
        this.stapleList = this.stapleList.concat({ name, unit, emoji: guessEmoji(name) })
        this.renderStaples()
        this.saveStapleList()
      }
    })
  },

  resetStaples() {
    wx.showModal({
      title: '恢复默认清单？', content: '会换回西红柿、黄瓜、胡萝卜…这 12 样，单位也恢复默认',
      success: r => {
        if (!r.confirm) return
        this.stapleList = DEFAULT_STAPLES.slice()
        this.renderStaples()
        this.saveStapleList()
      }
    })
  },

  async saveStapleList() {
    try {
      await api.call('saveStaples', { staples: this.stapleList.map(s => ({ name: s.name, unit: s.unit, emoji: s.emoji || guessEmoji(s.name) })) })
    } catch (e) { api.toastError(e) }
  },

  // ---------- 文字录入 ----------
  onText(e) { this.setData({ text: e.detail.value }) },

  parse() {
    const preview = parseStock(this.data.text).map(i => ({
      name: i.name, emoji: guessEmoji(i.name),
      qty: i.qty == null ? '' : String(i.qty), unit: i.unit
    }))
    if (!preview.length) { wx.showToast({ title: '先写点东西吧', icon: 'none' }); return }
    this.setData({ preview })
  },

  editPreview(e) {
    const { index, field } = e.currentTarget.dataset
    const patch = { [`preview[${index}].${field}`]: e.detail.value }
    if (field === 'name') patch[`preview[${index}].emoji`] = guessEmoji(e.detail.value)
    this.setData(patch)
  },
  removePreview(e) {
    const preview = this.data.preview.slice()
    preview.splice(e.currentTarget.dataset.index, 1)
    this.setData({ preview })
  },
  cancelPreview() { this.setData({ preview: [] }) },

  async confirmAdd() {
    const items = []
    for (const p of this.data.preview) {
      const name = p.name.trim()
      if (!name) continue
      const qty = p.qty === '' ? null : Number(p.qty)
      if (qty !== null && !(qty >= 0)) { wx.showToast({ title: `「${name}」的数量不对`, icon: 'none' }); return }
      items.push({ name, emoji: p.emoji, qty, unit: p.unit.trim() })
    }
    if (!items.length) return
    this.setData({ saving: true })
    try {
      await api.call('addFridge', { items })
      this.setData({ text: '', preview: [], saving: false })
      wx.showToast({ title: '已放进冰箱', icon: 'success' })
      this.load()
    } catch (e) {
      this.setData({ saving: false })
      api.toastError(e)
    }
  },

  // ---------- 冰箱里有的 ----------
  tapItem(e) {
    const item = this.data.items[e.currentTarget.dataset.index]
    wx.showActionSheet({
      itemList: ['修改数量', '用完了'],
      success: r => r.tapIndex === 0 ? this.changeQty(item) : this.useUp(item)
    })
  },

  changeQty(item) {
    wx.showModal({
      title: `${item.emoji} ${item.name} 还剩多少？`,
      editable: true,
      placeholderText: '比如：2个、半斤、300克',
      content: item.qty == null ? '' : `${item.qty}${item.unit || ''}`,
      success: async r => {
        if (!r.confirm) return
        const q = parseQty(r.content || '')
        if (!q) { wx.showToast({ title: '没看懂，写成"2个"这样', icon: 'none' }); return }
        try {
          await api.call('updateFridge', { id: item._id, qty: q.qty, unit: q.qty == null ? item.unit : (q.unit || item.unit) })
          this.load()
        } catch (e) { api.toastError(e) }
      }
    })
  },

  useUp(item) {
    wx.showModal({
      title: `${item.name} 用完了？`, content: '会从冰箱里移除',
      success: async r => {
        if (!r.confirm) return
        try { await api.call('deleteFridge', { id: item._id }); this.load() } catch (e) { api.toastError(e) }
      }
    })
  },

  goFamily() { wx.switchTab({ url: '/pages/family/family' }) }
})
