const api = require('../../utils/api')
const app = getApp()

Page({
  data: { loading: true, family: null, familyName: '', nickname: '', code: '', busy: false },

  onShow() { this.load() },

  async load() {
    try {
      const me = await app.getMe(true)
      this.setData({ loading: false, family: me.family })
    } catch (e) {
      this.setData({ loading: false })
      api.toastError(e)
    }
  },

  onInput(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }) },

  async create() {
    this.setData({ busy: true })
    try {
      const me = await api.call('createFamily', { name: this.data.familyName, nickname: this.data.nickname })
      app.setMe(me)
      this.setData({ family: me.family })
      wx.showToast({ title: '建好了，邀请家人吧', icon: 'none' })
    } catch (e) { api.toastError(e) }
    this.setData({ busy: false })
  },

  async join() {
    if (!this.data.code.trim()) { wx.showToast({ title: '请输入邀请码', icon: 'none' }); return }
    this.setData({ busy: true })
    try {
      const me = await api.call('joinFamily', { code: this.data.code, nickname: this.data.nickname })
      app.setMe(me)
      this.setData({ family: me.family })
      wx.showToast({ title: `已加入「${me.family.name}」`, icon: 'none' })
    } catch (e) { api.toastError(e) }
    this.setData({ busy: false })
  },

  copyCode() { wx.setClipboardData({ data: this.data.family.code }) },

  leave() {
    wx.showModal({
      title: '退出这个家庭？', content: '菜谱和冰箱会留在家庭里，你可以再用邀请码加回来', confirmColor: '#C0504A',
      success: async r => {
        if (!r.confirm) return
        try {
          const me = await api.call('leaveFamily')
          app.setMe(me)
          this.setData({ family: null })
        } catch (e) { api.toastError(e) }
      }
    })
  },

  onShareAppMessage() {
    const f = this.data.family
    if (!f) return { title: '我家菜谱', path: '/pages/index/index' }
    return { title: `来加入「${f.name}」，一起记菜谱`, path: `/pages/join/join?code=${f.code}` }
  }
})
