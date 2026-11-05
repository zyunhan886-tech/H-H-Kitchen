const api = require('../../utils/api')
const { parseStock, parseQty } = require('../../utils/parse')
const { guessEmoji } = require('../../utils/emoji')
const app = getApp()

Page({
  data: { loading: true, hasFamily: false, items: [], text: '', preview: [], saving: false },

  onShow() { this.load() },
  onPullDownRefresh() { this.load(true).then(() => wx.stopPullDownRefresh()) },

  async load(force) {
    try {
      const me = await app.getMe(force)
      if (!me.family) { this.setData({ loading: false, hasFamily: false }); return }
      const items = await api.call('listFridge')
      items.forEach(i => { i.qtyText = api.formatQty(i.qty, i.unit) })
      this.setData({ loading: false, hasFamily: true, items })
    } catch (e) {
      this.setData({ loading: false })
      api.toastError(e)
    }
  },

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
