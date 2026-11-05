const api = require('../../utils/api')
const app = getApp()

Page({
  data: { loading: true, hasFamily: false, dishes: [], shown: [], cats: ['全部'], cat: '全部', keyword: '' },

  onShow() { this.load() },
  onPullDownRefresh() { this.load(true).then(() => wx.stopPullDownRefresh()) },

  async load(force) {
    try {
      const me = await app.getMe(force)
      // 首页标题 = 家庭名 + 菜谱，比如「H&H 的小家菜谱」；还没加入家庭时用「我家菜谱」
      wx.setNavigationBarTitle({ title: me.family ? `${me.family.name}菜谱` : '我家菜谱' })
      if (!me.family) { this.setData({ loading: false, hasFamily: false, dishes: [], shown: [] }); return }
      const dishes = await api.call('listDishes')
      dishes.forEach(d => {
        d.emojis = (d.ingredients || []).slice(0, 6).map(i => i.emoji).join(' ')
        d.stepCount = (d.prep || []).length + (d.cook || []).length
      })
      const cats = ['全部', ...new Set(dishes.map(d => d.category).filter(Boolean))]
      const cat = cats.includes(this.data.cat) ? this.data.cat : '全部'
      this.setData({ loading: false, hasFamily: true, dishes, cats, cat })
      this.filter()
    } catch (e) {
      this.setData({ loading: false })
      api.toastError(e)
    }
  },

  filter() {
    const { dishes, cat, keyword } = this.data
    const k = keyword.trim()
    const shown = dishes.filter(d =>
      (cat === '全部' || d.category === cat) &&
      (!k || d.name.includes(k) || (d.ingredients || []).some(i => i.name.includes(k))))
    this.setData({ shown })
  },

  onSearch(e) { this.setData({ keyword: e.detail.value }); this.filter() },
  pickCat(e) { this.setData({ cat: e.currentTarget.dataset.cat }); this.filter() },
  open(e) { wx.navigateTo({ url: `/pages/detail/detail?id=${e.currentTarget.dataset.id}` }) },
  add() { wx.navigateTo({ url: '/pages/edit/edit' }) },
  goFamily() { wx.switchTab({ url: '/pages/family/family' }) }
})
