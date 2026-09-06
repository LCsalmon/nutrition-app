# 食愈 App — MVP v1

个性化营养方案生成 + 每日饮食打卡。基于 Expo (React Native) + Supabase。

## 本地运行步骤

1. 安装 Node.js（建议 18 或 20 版本）：https://nodejs.org
2. 手机上安装 **Expo Go** App（iOS App Store / Android 应用商店搜索 "Expo Go"）
3. 解压这个项目文件夹，在终端进入目录：
   ```bash
   cd nutrition-app
   npm install
   npx expo install --fix
   ```
   （第二条命令会自动把依赖版本对齐到 Expo SDK 要求的版本，避免版本不匹配报错）
4. 确认 `.env` 文件里已经填好了你的 Supabase 项目信息（已经预先填好）
5. 启动开发服务器：
   ```bash
   npx expo start -c
   ```
6. 终端会显示一个二维码。手机和电脑连同一个 WiFi，用 **Expo Go App 扫码**，App 就会加载到你手机上。

## 使用流程

1. 首次打开：注册账号（邮箱+密码）
2. 填写基础信息（性别/年龄/身高体重/活动水平/目标）→ 自动生成专属营养方案
3. 首页看到今日热量和三大营养素进度
4. 点击"记录一餐" → 搜索食物 → 选择分量 → 保存

## 已实现功能（更新至 v3）

- 邮箱注册/登录（Supabase Auth）
- 基础信息采集（含过敏原/饮食偏好/做饭时间/外食频率/地区）+ 初始方案生成
- 食物数据库搜索（本地库 + USDA FoodData Central，自动缓存）+ 每日饮食打卡
- 方案自动动态调整（App启动时检查，约12天评估一次，可手动触发测试）
- 体重记录
- 行为改变支持：每日打卡提醒（本地通知）、连续打卡streak、成就徽章、执行障碍微干预提示
- 可穿戴设备数据接入代码框架（iOS HealthKit / Android Health Connect）

## 关于可穿戴设备功能的重要说明

`react-native-health` 和 `react-native-health-connect` 是原生模块，**无法在 Expo Go 里运行**。
要真正测试这个功能，需要先构建"自定义开发版本"：

```bash
npx expo prebuild
npx expo run:ios       # 需要 Mac + Xcode（或用 EAS Build 云端编译，见下方）
npx expo run:android   # 需要 Android Studio（或用 EAS Build 云端编译）
```

iOS 还需要：
1. 有 Apple Developer 账号（$99/年）
2. 在 `app.json` 里补充 bundle identifier 对应的 HealthKit Capability 配置
3. 云端编译可用 `eas build --platform ios --profile development`

在完成以上构建之前，首页点击"同步"按钮会提示暂不可用，这是预期行为，不是bug。

## 数据库改动 / Supabase GitHub 集成说明

数据库结构文件现在统一放在 `supabase/migrations/` 目录下（Supabase 官方规范的位置），文件名带时间戳前缀，按顺序执行：

- `20240101000001_initial_schema.sql` —— 基础表结构（用户资料/方案/食物库/打卡/体重）
- `20240102000001_family_members.sql` —— 家庭成员支持

**这两个文件都写成了"幂等"的（可以安全重复执行，不会因为表/字段已存在而报错）**，所以：

- 如果你是全新的 Supabase 项目，直接在 SQL Editor 里按顺序各跑一次即可
- 如果你之前已经手动跑过旧版本、遇到过 "already exists" 报错、或者中途删过什么表，**直接重新完整跑一遍这两个文件也是安全的**，不会因为部分对象已存在而中断

如果你在 Supabase 项目里连了 GitHub 集成（Project Settings → Integrations → GitHub），它会识别这个 `supabase/migrations/` 目录，之后我这边如果要改数据库结构，会新增一个新的时间戳文件到这个目录里，push 上去后可以在 Supabase 的集成设置里手动触发运行，或者按它当时展示的方式操作。

⚠️ 已经删除了旧的 `supabase/schema.sql` 和 `supabase/migration_v2_family_members.sql`（非标准位置的历史文件），改用上面 `migrations/` 目录下的新版本，避免大家搞混跑错文件。

- 拍照识别食物 / 语音输入
- 体检报告上传与OCR风险分级
- 真人营养师/食疗师咨询模块（需要先确定支付方案）
- 教育内容模块

## 打包发布到 App Store / Google Play

准备好正式发布时，使用 EAS Build（无需 Xcode/Android Studio）：
```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform all
```
详见 https://docs.expo.dev/build/introduction/
