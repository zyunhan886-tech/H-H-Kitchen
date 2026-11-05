# 我家菜谱（微信小程序）

全家共享的菜谱 + 冰箱。一个人添加、修改，家里其他人那边会同步。

- **菜谱**：首页列出全部菜，右下角 ＋ 添加。每道菜分三块：**食材**（emoji 图标）→ **备菜** → **炒菜**
- **冰箱**：直接写"芹菜一斤，鸡蛋10个、酱油一瓶"，识别后确认放进冰箱；点一下能改数量或标记"用完了"
- **详情页**会标出哪些食材冰箱里已经有（绿色 ✓）
- **家庭**：创建后会生成 6 位邀请码，点"发给家人"，对方打开卡片就能加入

## AppID

真实 AppID 只放在本地 `project.private.config.json`（已被 .gitignore 忽略，优先级高于 `project.config.json`）：

```json
{ "appid": "wx你的AppID" }
```

仓库里的 `project.config.json` 只保留占位符 `touristappid`。

## 后端：CloudBase PG 模式（环境 `hhcook`）

```
小程序页面 ──wx.cloud.callFunction──▶ 云函数 api ──@cloudbase/node-sdk rdb()──▶ PostgreSQL（public schema）
             （平台自动注入微信 openid）        （服务端身份，平台自动鉴权）        RLS 开启，前端直连全部拒绝
```

- 前端不直连数据库、不放任何密钥；家庭隔离和权限校验都在云函数里按 openid 做。
- 表结构见 `db/migrations/001_init.sql`：`families / members / dishes / fridge_items`。

## 控制台手动步骤（按顺序）

> 原则：不删除任何环境；不购买套餐、资源包；任何弹窗只要出现"付费 / 购买 / 升级套餐"就先停下。

### 1. 把 `hhcook` 环境关联到小程序（最关键）

PG 环境是在腾讯云侧创建的，官方说明腾讯云侧创建的环境默认只支持 Web 端，
要先导入到小程序，`wx.cloud` 才能用。

1. **核对账号是否一致**：打开 腾讯云 → 账号中心 → 账号信息 → **登录方式 → 微信公众平台**，
   看绑定的是不是你的这个小程序（AppID 见本地 `project.private.config.json`）。
   - 没绑定：点「关联」，用小程序管理员微信扫码。前提是这个小程序之前没绑过别的腾讯云账号，
     并且一个腾讯云账号只能绑一个小程序。
   - 绑的是另一个腾讯云账号：通常是之前在开发者工具里点「云开发」时自动建出来的。先告诉我，不要删除任何东西。
2. **导入环境**：微信开发者工具 → **云开发**（打开云开发控制台）→ 设置 → 环境设置 →
   展开环境列表 → 管理我的环境 → **使用已有腾讯云环境** → 选 `hhcook` → 确认 → 扫码。
   - 确认前看清弹窗写了什么。如果提示要付费、升级套餐，或者没有列出 PG 环境，先停下截图给我。

### 2. 建表

CloudBase 控制台（https://tcb.cloud.tencent.com）→ 选环境 `hhcook` → **PostgreSQL 数据库** →
SQL 编辑器 → 粘贴 `db/migrations/001_init.sql` 的全部内容 → 执行。
执行完应该能看到 4 张表，重复执行也没关系。
不需要开启 pgdoc / Document 插件。

### 3. 部署云函数 `api`

开发者工具里看不到这个环境，所以**不要**右键「上传并部署」，用下面两种方式之一：

- **控制台**：云函数 → 新建云函数 → **普通云函数**（不要选 Web 云函数 / HTTP 云函数）→ 从空白创建 →
  名称 `api`，运行环境 **Nodejs 18.15**（18 及以上都行）→ 把 `cloudfunctions/api/index.js` 和
  `package.json` 的内容粘进去 → **保存并安装依赖**。
- **命令行**：
  ```sh
  npm i -g @cloudbase/cli
  tcb login                    # 浏览器里点「同意授权」，不用填任何密钥
  cd 本项目根目录
  tcb fn deploy api            # 读取 cloudbaserc.json，部署到 hhcook
  ```

### 4.（只有日志报"没有数据库权限"时才做）配置服务端 API Key

普通云函数默认由平台自动鉴权。如果调用时弹出「云函数没有数据库权限」：
控制台 → 环境管理 → **API 密钥** → 创建 **API Key** → 云函数 `api` → 环境变量 →
新增 `CLOUDBASE_APIKEY = <刚才的 Key>` → 保存。
这个 Key 只能放在云函数环境变量里，**绝不能**写进 `miniprogram/` 或提交到 git。

### 5. 验证

开发者工具点「编译」→「家庭」页 → 创建家庭。
如果失败，会弹出「连不上后台」，弹窗里有中文原因和原始错误；
也可以去 CloudBase 控制台 → 云函数 → api → **日志** 查看。

## 给家人用（不用备案）

开发者工具点"上传" → 到 mp.weixin.qq.com 的 **版本管理** 把它设为**体验版** →
**成员管理 → 体验成员** 里加上家人的微信号。家人扫体验版二维码打开，在"家庭"页输入邀请码，
或者直接点你分享的邀请卡片。

## 想公开发布

1. 小程序后台 → **小程序备案**：填信息、实名、人脸核验，等管局审核（一般 1–3 周）
2. 备案通过 → 版本管理里提交审核 → 审核通过 → 发布

## 代码结构

```
cloudfunctions/api/index.js   唯一的云函数（PostgreSQL），所有读写都在这里，按家庭隔离、校验权限
db/migrations/001_init.sql    建表 + 权限（RLS）
cloudbaserc.json              tcb CLI 部署配置（不含密钥）
miniprogram/
  pages/index    菜谱列表 + ＋ 按钮
  pages/detail   菜品详情（食材 / 备菜 / 炒菜）
  pages/edit     添加 / 修改 / 删除菜品
  pages/fridge   冰箱：文字录入 + 一眼看到有什么
  pages/family   创建 / 加入 / 邀请 / 退出家庭
  pages/join     邀请卡片的落地页
  utils/parse.js 冰箱文字识别（芹菜一斤、半斤五花肉、鸡蛋，10个…）
  utils/emoji.js 按食材名自动配 emoji，想加词改这里
  utils/const.js 菜品分类，想改分类改这里
```

# H-H-Kitchen
