// 唯一的云函数：所有读写都经过这里，按"家庭"隔离数据。
// 环境：CloudBase PG 模式。数据存在 PostgreSQL 的 public schema（建表见 db/migrations/001_init.sql）。
//
// 身份：小程序通过 wx.cloud.callFunction 调用时，平台会把调用者的微信 openid 注入到运行上下文（WX_OPENID），
//       这是可信的，不需要前端传，也不接受前端传。
// 数据库：@cloudbase/node-sdk 的 app.rdb()（PostgREST）。普通事件云函数由平台自动鉴权，
//       不需要也不应该在代码里写 SecretId / SecretKey。
//       如果控制台提示云函数没有数据库权限，可在「云函数 → api → 环境变量」配置 CLOUDBASE_APIKEY（仅服务端）。
const tcb = require('@cloudbase/node-sdk')

const config = { env: tcb.SYMBOL_CURRENT_ENV }
if (process.env.CLOUDBASE_APIKEY) config.accessKey = process.env.CLOUDBASE_APIKEY
const app = tcb.init(config)

let client = null
const db = () => client || (client = app.rdb())

function fail(msg) { throw Object.assign(new Error(msg), { userFacing: true }) }

// 执行一个 PostgREST 查询；出错时把常见数据库错误翻译成可操作的提示
async function run(query) {
  const { data, error } = await query
  if (!error) return data
  console.error('[db]', JSON.stringify(error))
  const code = String(error.code || '')
  if (code === '42P01' || code === 'PGRST205') fail('数据库表还没建：请在 CloudBase 控制台执行 db/migrations/001_init.sql')
  if (code === '42501' || code === 'PGRST301' || code === 'PGRST302') fail('云函数没有数据库权限：请按 README 配置云函数环境变量 CLOUDBASE_APIKEY')
  if (code === '23505') { const e = new Error('duplicate'); e.duplicate = true; throw e }
  throw new Error(error.message || '数据库出错')
}

const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function uuid(v) {
  const s = str(v, 64)
  if (!UUID.test(s)) fail('找不到这条记录，可能已被删除')
  return s
}
const now = () => new Date().toISOString()

// ---------- 行 → 前端需要的形状（保持和旧版文档数据库一致，页面不用改） ----------
const toDish = r => ({
  _id: r.id, name: r.name, category: r.category,
  ingredients: r.ingredients || [], prep: r.prep || [], cook: r.cook || [],
  lastUsage: r.last_usage || {},
  updatedAt: r.updated_at
})
const toFridge = r => ({
  _id: r.id, name: r.name, unit: r.unit, emoji: r.emoji,
  qty: r.qty == null ? null : Number(r.qty), updatedAt: r.updated_at
})

// ---------- 家庭 / 成员 ----------
async function getMember(openid) {
  return run(db().from('members').select('openid,family_id,nickname').eq('openid', openid).maybeSingle())
}

async function requireFamily(openid) {
  const m = await getMember(openid)
  if (!m) fail('请先创建或加入一个家庭')
  return m.family_id
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function randomCode() {
  let code = ''
  for (let j = 0; j < 6; j++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return code
}

async function findFamilyByCode(code) {
  return run(db().from('families').select('id,name').eq('code', str(code, 10).toUpperCase()).maybeSingle())
}

async function setMember(openid, familyId, nickname) {
  await run(db().from('members').upsert(
    { openid, family_id: familyId, nickname: str(nickname, 20) || '家人', joined_at: now() },
    { onConflict: 'openid' }
  ))
}

function cleanDish(d = {}) {
  const name = str(d.name, 40)
  if (!name) fail('请填写菜名')
  const lines = arr => (Array.isArray(arr) ? arr : []).map(s => str(s, 300)).filter(Boolean).slice(0, 40)
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
    if (!member) return { member: null, family: null }
    const family = await run(db().from('families').select('id,name,code').eq('id', member.family_id).maybeSingle())
    if (!family) return { member: null, family: null }
    const ms = await run(db().from('members').select('openid,nickname').eq('family_id', family.id).order('joined_at').limit(100))
    return {
      member: { nickname: member.nickname },
      family: {
        _id: family.id, name: family.name, code: family.code,
        members: ms.map(m => ({ nickname: m.nickname || '家人', isMe: m.openid === openid }))
      }
    }
  },

  async createFamily(d, openid) {
    const name = str(d.name, 20) || '我们家'
    let family = null
    for (let i = 0; i < 5 && !family; i++) {
      try {
        family = await run(db().from('families').insert({ name, code: randomCode(), owner_openid: openid }).select('id').single())
      } catch (e) { if (!e.duplicate) throw e }   // 邀请码撞了就换一个
    }
    if (!family) fail('生成邀请码失败，请重试')
    await setMember(openid, family.id, str(d.nickname, 20) || '我')
    return actions.me({}, openid)
  },

  async previewFamily(d) {
    const f = await findFamilyByCode(d.code)
    if (!f) fail('邀请码不存在')
    return { name: f.name }
  },

  async joinFamily(d, openid) {
    const f = await findFamilyByCode(d.code)
    if (!f) fail('邀请码不存在，请核对')
    await setMember(openid, f.id, d.nickname)
    return actions.me({}, openid)
  },

  async renameFamily(d, openid) {
    const familyId = await requireFamily(openid)
    const name = str(d.name, 20)
    if (!name) fail('家庭名字不能为空')
    await run(db().from('families').update({ name }).eq('id', familyId))
    return actions.me({}, openid)
  },

  async updateNickname(d, openid) {
    await requireFamily(openid)
    const nickname = str(d.nickname, 20)
    if (!nickname) fail('昵称不能为空')
    await run(db().from('members').update({ nickname }).eq('openid', openid))
    return actions.me({}, openid)
  },

  async leaveFamily(_d, openid) {
    await run(db().from('members').delete().eq('openid', openid))
    return { member: null, family: null }
  },

  // ---------- 菜品 ----------
  async listDishes(_d, openid) {
    const familyId = await requireFamily(openid)
    const rows = await run(db().from('dishes').select('*').eq('family_id', familyId).order('updated_at', { ascending: false }).limit(1000))
    return rows.map(toDish)
  },

  async getDish(d, openid) {
    const familyId = await requireFamily(openid)
    const row = await run(db().from('dishes').select('*').eq('id', uuid(d.id)).eq('family_id', familyId).maybeSingle())
    if (!row) fail('找不到这道菜，可能已被删除')
    return toDish(row)
  },

  async saveDish(d, openid) {
    const familyId = await requireFamily(openid)
    const dish = cleanDish(d.dish)
    if (d.id) {
      const rows = await run(db().from('dishes')
        .update(Object.assign({}, dish, { updated_at: now(), updated_by: openid }))
        .eq('id', uuid(d.id)).eq('family_id', familyId).select('id'))
      if (!rows.length) fail('找不到这道菜，可能已被删除')
      return { _id: rows[0].id }
    }
    const row = await run(db().from('dishes')
      .insert(Object.assign({ family_id: familyId, created_by: openid, updated_by: openid }, dish))
      .select('id').single())
    return { _id: row.id }
  },

  async deleteDish(d, openid) {
    const familyId = await requireFamily(openid)
    const rows = await run(db().from('dishes').delete().eq('id', uuid(d.id)).eq('family_id', familyId).select('id'))
    if (!rows.length) fail('找不到这道菜，可能已被删除')
    return true
  },

  // 炒好啦：按用户确认过的用量扣冰箱；扣到 0（或勾了"用完了"）就移除；顺便记住这次用量
  async cookDish(d, openid) {
    const familyId = await requireFamily(openid)
    const dish = await run(db().from('dishes').select('*').eq('id', uuid(d.id)).eq('family_id', familyId).maybeSingle())
    if (!dish) fail('找不到这道菜，可能已被删除')
    const uses = (Array.isArray(d.uses) ? d.uses : []).slice(0, 40)
    const usage = {}
    const usedUp = []
    let updated = 0
    for (const u of uses) {
      const amount = cleanQty(u && u.qty)
      const useUp = !!(u && u.useUp)
      if (!useUp && !amount) continue
      const item = await run(db().from('fridge_items').select('id,name,qty,unit')
        .eq('id', uuid(u.fridgeId)).eq('family_id', familyId).maybeSingle())
      if (!item) continue                                  // 家人刚好把它移除了
      const have = item.qty == null ? null : Number(item.qty)
      if (useUp || (have != null && amount >= have - 1e-9)) {
        await run(db().from('fridge_items').delete().eq('id', item.id))
        usedUp.push(item.name)
      } else if (have != null) {
        await run(db().from('fridge_items').update({ qty: Math.round((have - amount) * 100) / 100, updated_at: now() }).eq('id', item.id))
      } else {
        continue                                           // 没记数量又没勾"用完了"：不动
      }
      updated++
      if (amount) usage[str(u.ingredient || item.name, 20)] = { qty: amount, unit: item.unit }
    }
    if (Object.keys(usage).length) {
      try {
        await run(db().from('dishes').update({ last_usage: Object.assign({}, dish.last_usage || {}, usage) }).eq('id', dish.id))
      } catch (e) { console.error('[cookDish] 记录用量失败（是否执行了 002_cook_usage.sql？）', e.message) }
    }
    return { updated, usedUp }
  },

  // ---------- 冰箱 ----------
  async listFridge(_d, openid) {
    const familyId = await requireFamily(openid)
    const rows = await run(db().from('fridge_items').select('*').eq('family_id', familyId).order('updated_at', { ascending: false }).limit(1000))
    return rows.map(toFridge)
  },

  // 新买的东西：同名同单位的累加，否则新建
  async addFridge(d, openid) {
    const familyId = await requireFamily(openid)
    const items = (Array.isArray(d.items) ? d.items : []).slice(0, 100)
    if (!items.length) fail('没有要放进冰箱的东西')
    for (const raw of items) {
      const item = { name: str(raw.name, 20), unit: str(raw.unit, 6), qty: cleanQty(raw.qty), emoji: str(raw.emoji, 8) || '🥣' }
      if (!item.name) continue
      for (let attempt = 0; attempt < 2; attempt++) {
        const old = await run(db().from('fridge_items').select('id,qty')
          .eq('family_id', familyId).eq('name', item.name).eq('unit', item.unit).maybeSingle())
        if (old) {
          const oldQty = old.qty == null ? null : Number(old.qty)
          const qty = oldQty == null ? item.qty : item.qty == null ? oldQty : Math.round((oldQty + item.qty) * 100) / 100
          await run(db().from('fridge_items').update({ qty, updated_at: now() }).eq('id', old.id))
          break
        }
        try {
          await run(db().from('fridge_items').insert(Object.assign({ family_id: familyId }, item)))
          break
        } catch (e) { if (!e.duplicate || attempt) throw e }   // 家人同时在加同一样东西 → 再走一次累加
      }
    }
    return true
  },

  async updateFridge(d, openid) {
    const familyId = await requireFamily(openid)
    const rows = await run(db().from('fridge_items')
      .update({ qty: cleanQty(d.qty), unit: str(d.unit, 6), updated_at: now() })
      .eq('id', uuid(d.id)).eq('family_id', familyId).select('id'))
    if (!rows.length) fail('找不到这样东西，可能已被移除')
    return true
  },

  async deleteFridge(d, openid) {
    const familyId = await requireFamily(openid)
    const rows = await run(db().from('fridge_items').delete().eq('id', uuid(d.id)).eq('family_id', familyId).select('id'))
    if (!rows.length) fail('找不到这样东西，可能已被移除')
    return true
  }
}

function callerContext(context) {
  try { return tcb.getCloudbaseContext(context) || {} } catch (e) { return tcb.getCloudbaseContext() || {} }
}

exports.main = async (event, context) => {
  const ctx = callerContext(context)
  const WX_OPENID = ctx.WX_OPENID
  if (!WX_OPENID) {
    // 只打印变量名，不打印值（里面有临时密钥）
    console.error('[api] no WX_OPENID in context; keys =', Object.keys(ctx).join(','))
    return { ok: false, msg: '没有拿到微信身份：请从小程序里通过 wx.cloud.callFunction 调用' }
  }
  const fn = actions[event && event.action]
  if (!fn) return { ok: false, msg: '未知操作' }
  try {
    return { ok: true, data: await fn((event && event.data) || {}, WX_OPENID) }
  } catch (e) {
    if (!e.userFacing) console.error('[api]', event.action, e)
    return { ok: false, msg: e.userFacing ? e.message : '服务器出错了，请稍后重试' }
  }
}
