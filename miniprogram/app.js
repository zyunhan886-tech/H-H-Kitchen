// 如果你的云开发有多个环境，把 env 换成你的环境 ID（云开发控制台 → 设置 里能看到）
const CLOUD_ENV = ''

App({
  globalData: { me: null },
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }
    wx.cloud.init(CLOUD_ENV ? { env: CLOUD_ENV, traceUser: true } : { traceUser: true })
  },
  // 当前用户和家庭信息，缓存一份；force=true 时重新拉取
  async getMe(force) {
    if (this.globalData.me && !force) return this.globalData.me
    const api = require('./utils/api')
    this.globalData.me = await api.call('me')
    return this.globalData.me
  },
  setMe(me) { this.globalData.me = me }
})
