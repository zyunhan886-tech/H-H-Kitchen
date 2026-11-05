// 把云开发的常见错误翻译成人话，原始错误也一起显示，方便排查
function explain(errMsg) {
  const m = String(errMsg || '')
  if (m.includes('-601034') || m.includes('开通云开发') || m.includes('not activated'))
    return '小程序还没关联云开发环境：按 README「控制台手动步骤」把 hhcook 环境关联到小程序'
  if ((m.includes('-501000') || m.includes('-501001')) && /env|环境/i.test(m))
    return '找不到云环境 hhcook：确认环境已关联到这个小程序，且 app.js 里 CLOUD_ENV 填的是完整环境 ID'
  if (m.includes('-501000') || m.includes('FunctionName') || m.includes('-501009') || m.includes('ResourceNotFound.Function'))
    return '云函数 api 还没部署到 hhcook 环境：按 README 用 CloudBase 控制台或 tcb CLI 部署'
  if (m.includes('Cannot find module'))
    return '云函数缺依赖：部署时要选「安装依赖」，或在控制台点「保存并安装依赖」'
  if (m.includes('-404011') || m.includes('execution error'))
    return '云函数运行出错：去 CloudBase 控制台 → 云函数 → api → 日志 看看'
  if (m.includes('timeout') || m.includes('-504003'))
    return '云函数超时了，再试一次'
  return ''
}

function call(action, data = {}) {
  return wx.cloud.callFunction({ name: 'api', data: { action, data } }).then(res => {
    const r = res.result
    if (!r || !r.ok) throw new Error((r && r.msg) || '出错了')
    return r.data
  }, err => {
    const raw = String((err && (err.errMsg || err.message)) || err)
    console.error('[api]', action, raw, err)
    const e = new Error(explain(raw) || '连不上云函数')
    e.raw = raw
    throw e
  })
}

function toastError(e) {
  const msg = (e && e.message) || '出错了'
  if (e && e.raw) {
    // 连接类问题：弹窗显示完整原因
    wx.showModal({ title: '连不上后台', content: `${msg}\n\n原始错误：${e.raw}`.slice(0, 600), showCancel: false })
  } else {
    wx.showToast({ title: msg, icon: 'none', duration: 2500 })
  }
}

function formatQty(qty, unit) {
  if (qty === null || qty === undefined || qty === '') return '有'
  return `${qty}${unit || ''}`
}

module.exports = { call, toastError, formatQty }
