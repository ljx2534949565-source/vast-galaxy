# Vast Galaxy（研词）

一个面向考研的单词记忆 App。单词、学习进度、错题、壁纸、歌单默认只存在手机本机；AI 助记和音乐播放是可选功能。

- 技术栈：Vue 3 + uni-app（H5）+ Capacitor（安卓壳）
- 版本：5.6.2（versionCode 50602）
- 包名：`com.kaoyan.memory`
- 最低系统：Android 9（API 28）
- 许可证：[MIT](./LICENSE)

## 功能

- **单词**：按单元/课程学习，用 SM-2 间隔重复算法安排复习；有测验、错题本、倒计时、学习统计。
- **AI 助记**：可选。可以填自己的 API Key 用云端模型，也可以导入本地 GGUF 模型在手机上跑；不配置也能正常背单词。
- **音乐**：扫描手机本地曲库，支持播放/暂停、切歌、拖进度条、锁屏与通知栏控制；播放时有一个跟随节奏动的悬浮球。
- **个性化**：十二套主题色、深浅色模式、自定义壁纸、悬浮球位置可拖动。

## 隐私设计

- 学习数据、设置、壁纸、歌单默认只存在本机，不上传。
- 云端 AI 默认关闭；开启后由你填自己的 Key，Key 只存在本机。是否联网、发什么内容，完全由你控制。
- 不内置广告、统计或埋点 SDK。
- 详见 [隐私说明](./PRIVACY.md)。

## 快速开始

```bash
npm install        # 安装依赖（需要 Node.js 22 或更高）
npm run dev:h5     # 浏览器里开发调试
npm run test       # 跑单元测试
npm run build:h5   # 构建 H5 产物，输出到 dist/build/h5
```

想打出安卓 APK，见 [构建说明](./BUILD.md)。

也可以直接点 GitHub 页面上的 **Actions → Build Android APK → Run workflow**，构建完成后在 Artifacts 里下载 `app-debug`，解压得到 `app-debug.apk`。

## 常见问题

- **点单词发音没声音**：去系统「文字转语音」设置里装一个英文离线语音包。App 本身不打包语音文件，用的是系统 TTS。
- **H5 里音乐扫描不能用**：音乐扫描依赖安卓原生能力，请在 APK 里使用；H5 仅作开发调试。

## 目录结构

```
src/             前端源码（Vue 3 + uni-app）
  components/    界面组件，三个板块在 panels/ 下
  composables/   组合式逻辑
  stores/        状态与本地存储（Pinia）
  utils/         算法与工具（SM-2、AI、音乐、存储等）
  data/          单词数据
tests/           单元测试
scripts/         版本与词库脚本
android/         Capacitor 安卓壳
.github/         GitHub Actions 构建配置
```
