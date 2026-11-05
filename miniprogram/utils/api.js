function call(action, data = {}) {
  return wx.cloud.callFunction({ name: 'api', data: { action, data } }).then(res => {
    const r = res.result
    if (!r || !r.ok) throw new Error((r && r.msg) || '出错了')
    return r.data
  }, err => {
    console.error(err)
    const msg = String(err && err.errMsg || '')
    if (msg.includes('FunctionName') || msg.includes('-501000')) throw new Error('云函数 api 还没部署')
    throw new Error('网络不太好，请重试')
  })
}

function toastError(e) {
  wx.showToast({ title: (e && e.message) || '出错了', icon: 'none', duration: 2500 })
}

function formatQty(qty, unit) {
  if (qty === null || qty === undefined || qty === '') return '有'
  return `${qty}${unit || ''}`
}

module.exports = { call, toastError, formatQty }
