const api = require('../../utils/api')

Page({
  data: { dish: null, haveCount: 0, error: '' },

  onLoad(q) { this.id = q.id },
  onShow() { this.load() },

  async load() {
    try {
      const [dish, fridge] = await Promise.all([
        api.call('getDish', { id: this.id }),
        api.call('listFridge').catch(() => [])
      ])
      const names = fridge.map(f => f.name).filter(Boolean)
      dish.ingredients = (dish.ingredients || []).map(i => Object.assign({}, i, {
        have: names.some(n => n.includes(i.name) || i.name.includes(n))
      }))
      this.setData({ dish, haveCount: dish.ingredients.filter(i => i.have).length, error: '' })
    } catch (e) {
      this.setData({ error: e.message })
    }
  },

  edit() { wx.navigateTo({ url: `/pages/edit/edit?id=${this.id}` }) },

  onShareAppMessage() {
    const d = this.data.dish
    return { title: d ? `${d.name}的做法` : '我家菜谱', path: `/pages/detail/detail?id=${this.id}` }
  }
})
