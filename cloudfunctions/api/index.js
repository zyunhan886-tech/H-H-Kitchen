// 唯一的云函数：所有读写都经过这里，按"家庭"隔离数据。
// 数据库集合：families（家庭）、members（成员，_id = openid）、dishes（菜品）、fridge（冰箱）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

let ready = false
async function ensureCollections() {
  if (ready) return
  await Promise.all(['families', 'members', 'dishes', 'fridge'].map(n => db.createCollection(n).catch(() => {})))
  ready = true
}

function fail(msg) { throw Object.assign(new Error(msg), { userFacing: true }) }

const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max)

async function getMember(openid) {
  try { return (await db.collection('members').doc(openid).get()).data } catch (e) { return null }
}

async function requireFamily(openid) {
  const m = await getMember(openid)
  if (!m || !m.familyId) fail('请先创建或加入一个家庭')
  return m.familyId
}

async function ownDoc(collection, id, familyId) {
  let doc
  try { doc = (await db.collection(collection).doc(id).get()).data } catch (e) { fail('找不到这条记录，可能已被删除') }
  if (doc.familyId !== familyId) fail('这条记录不属于你的家庭')
  return doc
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
async function newCode() {
  for (let i = 0; i < 10; i++) {
    let code = ''
    for (let j = 0; j < 6; j++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
    const { data } = await db.collection('families').where({ code }).limit(1).get()
    if (!data.length) return code
  }
  fail('生成邀请码失败，请重试')
}

function cleanDish(d = {}) {
  const name = str(d.name, 40)
  if (!name) fail('请填写菜名')
  const lines = (arr) => (Array.isArray(arr) ? arr : []).map(s => str(s, 300)).filter(Boolean).slice(0, 40)
  return {
    name,
    category: str(d.category, 20),
    ingredients: (Array.isArray(d.ingredients) ? d.ingredients : [])
      .map(i => ({ name: str(i && i.name, 20), emoji: str(i && i.emoji, 8) || '🥣' }))
      .filter(i => i.name).slice(0, 40),
    prep: lines(d.prep),
    cook: lines(d.cook)
  }
}

function cleanQty(q) {
  if (q === null || q === undefined || q === '') return null
  const n = Number(q)
  if (!isFinite(n) || n < 0 || n > 1e6) fail('数量不对')
  return Math.round(n * 100) / 100
}

const actions = {
  async me(_d, openid) {
    const member = await getMember(openid)
    if (!member || !member.familyId) return { member: null, family: null }
    let family
    try { family = (await db.collection('families').doc(member.familyId).get()).data } catch (e) { return { member: null, family: null } }
    const { data: ms } = await db.collection('members').where({ familyId: family._id }).limit(100).get()
    return {
      member: { nickname: member.nickname },
      family: {
        _id: family._id, name: family.name, code: family.code,
        members: ms.map(m => ({ nickname: m.nickname || '家人', isMe: m._id === openid }))
      }
    }
  },

  async createFamily(d, openid) {
    const name = str(d.name, 20) || '我们家'
    const code = await newCode()
    const { _id } = await db.collection('families').add({ data: { name, code, owner: openid, createdAt: db.serverDate() } })
    await db.collection('members').doc(openid).set({ data: { familyId: _id, nickname: str(d.nickname, 20) || '我', joinedAt: db.serverDate() } })
    return actions.me({}, openid)
  },

  async previewFamily(d) {
    const code = str(d.code, 10).toUpperCase()
    const { data } = await db.collection('families').where({ code }).limit(1).get()
    if (!data.length) fail('邀请码不存在')
    return { name: data[0].name }
  },

  async joinFamily(d, openid) {
    const code = str(d.code, 10).toUpperCase()
    const { data } = await db.collection('families').where({ code }).limit(1).get()
    if (!data.length) fail('邀请码不存在，请核对')
    await db.collection('members').doc(openid).set({ data: { familyId: data[0]._id, nickname: str(d.nickname, 20) || '家人', joinedAt: db.serverDate() } })
    return actions.me({}, openid)
  },

  async leaveFamily(_d, openid) {
    await db.collection('members').doc(openid).remove().catch(() => {})
    return { member: null, family: null }
  },

  async listDishes(_d, openid) {
    const familyId = await requireFamily(openid)
    const { data } = await db.collection('dishes').where({ familyId }).orderBy('updatedAt', 'desc').limit(1000).get()
    return data
  },

  async getDish(d, openid) {
    const familyId = await requireFamily(openid)
    return ownDoc('dishes', str(d.id, 64), familyId)
  },

  async saveDish(d, openid) {
    const familyId = await requireFamily(openid)
    const dish = cleanDish(d.dish)
    const meta = { updatedAt: db.serverDate(), updatedBy: openid }
    if (d.id) {
      await ownDoc('dishes', str(d.id, 64), familyId)
      await db.collection('dishes').doc(d.id).update({ data: Object.assign({}, dish, meta) })
      return { _id: d.id }
    }
    const { _id } = await db.collection('dishes').add({ data: Object.assign({ familyId, createdAt: db.serverDate(), createdBy: openid }, dish, meta) })
    return { _id }
  },

  async deleteDish(d, openid) {
    const familyId = await requireFamily(openid)
    await ownDoc('dishes', str(d.id, 64), familyId)
    await db.collection('dishes').doc(d.id).remove()
    return true
  },

  async listFridge(_d, openid) {
    const familyId = await requireFamily(openid)
    const { data } = await db.collection('fridge').where({ familyId }).orderBy('updatedAt', 'desc').limit(1000).get()
    return data
  },

  // 新买的东西：同名同单位的累加，否则新建
  async addFridge(d, openid) {
    const familyId = await requireFamily(openid)
    const items = (Array.isArray(d.items) ? d.items : []).slice(0, 100)
    if (!items.length) fail('没有要放进冰箱的东西')
    for (const raw of items) {
      const item = { name: str(raw.name, 20), unit: str(raw.unit, 6), qty: cleanQty(raw.qty), emoji: str(raw.emoji, 8) || '🥣' }
      if (!item.name) continue
      const { data } = await db.collection('fridge').where({ familyId, name: item.name, unit: item.unit }).limit(1).get()
      if (data.length) {
        const old = data[0]
        const qty = old.qty == null ? item.qty : item.qty == null ? old.qty : Math.round((old.qty + item.qty) * 100) / 100
        await db.collection('fridge').doc(old._id).update({ data: { qty, updatedAt: db.serverDate() } })
      } else {
        await db.collection('fridge').add({ data: Object.assign({ familyId, createdAt: db.serverDate(), updatedAt: db.serverDate() }, item) })
      }
    }
    return true
  },

  async updateFridge(d, openid) {
    const familyId = await requireFamily(openid)
    await ownDoc('fridge', str(d.id, 64), familyId)
    await db.collection('fridge').doc(d.id).update({ data: { qty: cleanQty(d.qty), unit: str(d.unit, 6), updatedAt: db.serverDate() } })
    return true
  },

  async deleteFridge(d, openid) {
    const familyId = await requireFamily(openid)
    await ownDoc('fridge', str(d.id, 64), familyId)
    await db.collection('fridge').doc(d.id).remove()
    return true
  }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const fn = actions[event.action]
  if (!fn) return { ok: false, msg: '未知操作' }
  try {
    await ensureCollections()
    return { ok: true, data: await fn(event.data || {}, OPENID) }
  } catch (e) {
    console.error(event.action, e)
    return { ok: false, msg: e.userFacing ? e.message : '服务器出错了，请稍后重试' }
  }
}
