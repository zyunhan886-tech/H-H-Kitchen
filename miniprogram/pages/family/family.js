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

  // 弹一个可编辑的框，确认后调用 action
  editText(title, current, placeholder, action, field) {
    wx.showModal({
      title, editable: true, placeholderText: placeholder, content: current || '',
      success: async r => {
        if (!r.confirm) return
        const value = (r.content || '').trim()
        if (!value) { wx.showToast({ title: '不能为空', icon: 'none' }); return }
        if (value.length > 20) { wx.showToast({ title: '最多 20 个字', icon: 'none' }); return }
        try {
          const me = await api.call(action, { [field]: value })
          app.setMe(me)
          this.setData({ family: me.family })
          wx.showToast({ title: '改好了', icon: 'success' })
        } catch (e) { api.toastError(e) }
      }
    })
  },

  renameFamily() {
    this.editText('改家庭名字', this.data.family.name, '比如：H&H 的小家🏠', 'renameFamily', 'name')
  },

  editNickname() {
    const me = this.data.family.members.find(m => m.isMe)
    this.editText('改我的昵称', me && me.nickname, '比如：Chris', 'updateNickname', 'nickname')
  },

  copyCode() { wx.setClipboardData({ data: this.data.family.code }) },

  // 小程序未认证时不能用分享卡片，所以改成复制一段文字，粘贴到微信聊天里发给家人
  copyInvite() {
    const f = this.data.family
    wx.setClipboardData({
      data: `来加入「${f.name}」，一起记菜谱 🍳\n打开 H&H Kitchen 小程序 →「家庭」→ 输入邀请码：${f.code}`,
      success: () => wx.showToast({ title: '已复制，去微信粘贴发给家人', icon: 'none', duration: 2500 })
    })
  },

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
