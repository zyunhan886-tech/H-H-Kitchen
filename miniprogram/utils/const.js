const CATEGORIES = ['无肉不欢 🥩', '清爽素菜 🥬', '海鲜水产 🦐', '汤汤水水 🍲', '主食点心 🍚', '凉菜小食 🥒', '其他 🍽️']

// 冰箱页「常买的菜」默认清单（家里还没自定义过时用）
const DEFAULT_STAPLES = [
  { name: '西红柿', unit: '个' }, { name: '黄瓜', unit: '根' }, { name: '胡萝卜', unit: '根' },
  { name: '洋葱', unit: '个' }, { name: '五花肉', unit: '条' }, { name: '肥牛卷', unit: '袋' },
  { name: '鸡蛋', unit: '个' }, { name: '上海青', unit: '棵' }, { name: '香菜', unit: '把' },
  { name: '葱', unit: '把' }, { name: '姜', unit: '块' }, { name: '蒜', unit: '头' }
]

// 按克/毫升计的单位：加减步长大一些
const BULK_UNITS = ['克', '毫升', 'g', 'ml']
const isBulk = unit => BULK_UNITS.includes(unit)

module.exports = { CATEGORIES, DEFAULT_STAPLES, BULK_UNITS, isBulk }
