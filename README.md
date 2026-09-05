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

## 已实现功能（MVP v1）

- 邮箱注册/登录（Supabase Auth）
- 基础信息采集 + 初始方案生成（Mifflin-St Jeor 公式计算BMR/TDEE，按目标动态调整宏量营养素比例）
- 食物数据库搜索 + 每日饮食打卡
- 今日营养摄入 vs 目标 的进度展示

## 尚未实现（后续迭代方向，对应原始PRD）

- 拍照识别食物 / 语音输入
- 可穿戴设备数据接入（Apple Health / Google Fit）
- 方案的自动动态调整逻辑（目前仅生成初始方案，尚无每1-2周自动微调的定时任务）
- 体检报告上传与OCR风险分级
- 真人营养师/食疗师咨询模块
- 行为改变提醒与教育内容

## 打包发布到 App Store / Google Play

准备好正式发布时，使用 EAS Build（无需 Xcode/Android Studio）：
```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform all
```
详见 https://docs.expo.dev/build/introduction/
