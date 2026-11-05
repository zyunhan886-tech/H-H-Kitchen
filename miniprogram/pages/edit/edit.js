const api = require('../../utils/api')
const { CATEGORIES } = require('../../utils/const')
const { guessEmoji, EMOJI_CHOICES } = require('../../utils/emoji')

Page({
  data: {
    id: '', loaded: false, saving: false,
    name: '', category: CATEGORIES[0], cats: CATEGORIES,
    ingredients: [], ingInput: '',
    prep: [''], cook: [''],
    pickerIndex: -1, emojis: EMOJI_CHOICES,
    sections: [
      { key: 'prep', title: '备菜', tip: '猪肉切丝加蚝油、淀粉抓匀' },
      { key: 'cook', title: '炒菜', tip: '起锅烧油，油热下肉丝…' }
    ]
  },

  async onLoad(q) {
    if (!q.id) { this.setData({ loaded: true }); return }
    wx.setNavigationBarTitle({ title: '修改菜品' })
    try {
      const d = await api.call('getDish', { id: q.id })
      const cats = CATEGORIES.includes(d.category) || !d.category ? CATEGORIES : [...CATEGORIES, d.category]
      this.setData({
        id: q.id, loaded: true, cats,
        name: d.name, category: d.category || CATEGORIES[0],
        ingredients: d.ingredients || [],
        prep: d.prep && d.prep.length ? d.prep : [''],
        cook: d.cook && d.cook.length ? d.cook : ['']
      })
    } catch (e) { api.toastError(e) }
  },

  onName(e) { this.setData({ name: e.detail.value }) },
  pickCat(e) { this.setData({ category: e.currentTarget.dataset.cat }) },

  // 食材：可以一次输入多个，"瘦肉 大葱 泡椒"
  onIngInput(e) { this.setData({ ingInput: e.detail.value }) },
  addIng() {
    const names = this.data.ingInput.split(/[\s,，、。;；]+/).map(s => s.trim().slice(0, 20)).filter(Boolean)
    if (!names.length) return
    const list = this.data.ingredients.slice()
    names.forEach(n => { if (!list.some(i => i.name === n)) list.push({ name: n, emoji: guessEmoji(n) }) })
    this.setData({ ingredients: list, ingInput: '' })
  },
  removeIng(e) {
    const list = this.data.ingredients.slice()
    list.splice(e.currentTarget.dataset.index, 1)
    this.setData({ ingredients: list })
  },
  openPicker(e) { this.setData({ pickerIndex: e.currentTarget.dataset.index }) },
  closePicker() { this.setData({ pickerIndex: -1 }) },
  chooseEmoji(e) {
    this.setData({ [`ingredients[${this.data.pickerIndex}].emoji`]: e.currentTarget.dataset.emoji, pickerIndex: -1 })
  },
  noop() {},

  // 步骤：备菜 prep / 炒菜 cook
  onStep(e) {
    const { key, index } = e.currentTarget.dataset
    this.setData({ [`${key}[${index}]`]: e.detail.value })
  },
  addStep(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ [key]: [...this.data[key], ''] })
  },
  removeStep(e) {
    const { key, index } = e.currentTarget.dataset
    const list = this.data[key].slice()
    list.splice(index, 1)
    this.setData({ [key]: list.length ? list : [''] })
  },
  moveUp(e) {
    const { key, index } = e.currentTarget.dataset
    if (index === 0) return
    const list = this.data[key].slice()
    ;[list[index - 1], list[index]] = [list[index], list[index - 1]]
    this.setData({ [key]: list })
  },

  async save() {
    if (this.data.ingInput.trim()) this.addIng()
    const { id, name, category, ingredients, prep, cook } = this.data
    if (!name.trim()) { wx.showToast({ title: '请填写菜名', icon: 'none' }); return }
    const clean = arr => arr.map(s => s.trim()).filter(Boolean)
    this.setData({ saving: true })
    try {
      const res = await api.call('saveDish', { id, dish: { name, category, ingredients, prep: clean(prep), cook: clean(cook) } })
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => {
        if (id) wx.navigateBack()
        else wx.redirectTo({ url: `/pages/detail/detail?id=${res._id}` })
      }, 600)
    } catch (e) {
      this.setData({ saving: false })
      api.toastError(e)
    }
  },

  del() {
    wx.showModal({
      title: '删除这道菜？', content: '删除后家里人也看不到了', confirmColor: '#C0504A',
      success: async r => {
        if (!r.confirm) return
        try {
          await api.call('deleteDish', { id: this.data.id })
          wx.switchTab({ url: '/pages/index/index' })
        } catch (e) { api.toastError(e) }
      }
    })
  }
})
