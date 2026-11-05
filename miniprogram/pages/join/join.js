const api = require('../../utils/api')
const app = getApp()

Page({
  data: { code: '', name: '', error: '', nickname: '', busy: false, already: false },

  async onLoad(q) {
    const code = String(q.code || '').toUpperCase()
    this.setData({ code })
    try {
      const [f, me] = await Promise.all([api.call('previewFamily', { code }), app.getMe(true)])
      this.setData({ name: f.name, already: !!(me.family && me.family.code === code) })
      this.currentFamily = me.family
    } catch (e) { this.setData({ error: e.message }) }
  },

  onNick(e) { this.setData({ nickname: e.detail.value }) },

  join() {
    const doJoin = async () => {
      this.setData({ busy: true })
      try {
        const me = await api.call('joinFamily', { code: this.data.code, nickname: this.data.nickname })
        app.setMe(me)
        wx.switchTab({ url: '/pages/index/index' })
      } catch (e) { this.setData({ busy: false }); api.toastError(e) }
    }
    if (this.currentFamily && !this.data.already) {
      wx.showModal({
        title: '换一个家庭？', content: `你现在在「${this.currentFamily.name}」，加入后会离开它`,
        success: r => r.confirm && doJoin()
      })
    } else doJoin()
  },

  goHome() { wx.switchTab({ url: '/pages/index/index' }) }
})
