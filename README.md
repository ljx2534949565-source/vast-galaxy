# Vast Galaxy（研词）

一款尊重隐私、支持本地AI的考研单词记忆App

![版本](https://img.shields.io/badge/version-5.6.2-blue)
![许可证](https://img.shields.io/badge/License-MIT-yellow.svg)
![构建状态](https://github.com/ljx2534949565-source/vast-galaxy/actions/workflows/build-apk.yml/badge.svg)
![平台](https://img.shields.io/badge/Platform-Android-green)

一个面向考研的单词记忆 App。单词、学习进度、错题、壁纸、歌单默认只存在手机本机；AI 助记和音乐播放是可选功能。

- 技术栈：Vue 3 + uni-app（H5）+ Capacitor（安卓壳）
- 版本：5.6.2（versionCode 50602）
- 包名：`com.kaoyan.memory`
- 最低系统：Android 9（API 28）
- 许可证：[MIT](./LICENSE)

## ✨ 核心亮点

- **本地优先**：学习记录、设置、壁纸、歌单全部保存在本机，默认不上传
- **双模式AI助记**：可填入自有API Key使用云端模型，也支持导入GGUF模型在手机离线运行；不配置AI也可正常背单词
- 基于 SM-2 间隔重复算法科学安排复习，适配考研词汇背诵
- 内置本地音乐播放器，带跟随节奏动效的悬浮球，背词听歌两不误
- 无广告、无统计、无埋点SDK，干净轻量

## 📌 功能

- **单词**：按单元/课程学习，采用 SM-2 间隔重复算法安排复习；支持测验、错题本、倒计时、学习统计
- **AI 助记**：可选，云端/本地GGUF双路线，AI密钥仅保存在本地，联网行为完全由你掌控
- **音乐**：扫描手机本地曲库，支持播放/暂停/切歌、进度拖拽、锁屏与通知栏控制；播放时提供跟随节奏动效的悬浮球
- **个性化**：十二套主题色、深浅色模式、自定义壁纸、悬浮球位置可拖动

## 🔒 隐私设计

- 学习数据、设置、壁纸、歌单默认只存在本机，不上传
- 云端AI默认关闭；开启后由你自行填写API Key，密钥仅保存在本机，是否联网、发送什么内容完全由你控制
- 不内置广告、统计或埋点SDK
- 详见 [隐私说明](./PRIVACY.md)

## 🚀 快速开始

```bash
npm install          # 安装依赖（需要 Node.js 22 或更高）
npm run dev:h5       # 浏览器里开发调试
npm run test         # 跑单元测试
npm run build:h5     # 构建 H5 产物，输出到 dist/build/h5
```

想打出安卓 APK，见 [构建说明](./BUILD.md)。

也可以直接点 GitHub 页面上的 **Actions → Build Android APK → Run workflow**，构建完成后在 Artifacts 里下载 `app-debug`，解压得到 `app-debug.apk`。

## ❓ 常见问题

- **点单词发音没声音**：去系统「文字转语音」设置里安装英文离线语音包。App本身不打包语音文件，复用系统TTS。
- **H5里音乐扫描不能用**：音乐扫描依赖安卓原生能力，请在APK版本中使用；H5仅作开发调试。

## 📁 目录结构

```text
src/                前端源码（Vue 3 + uni-app）
├── components/     界面组件，三个板块在 panels/ 下
├── composables/    组合式逻辑
├── stores/         状态与本地存储（Pinia）
├── utils/          算法与工具（SM-2、AI、音乐、存储等）
├── data/           单词数据
tests/              单元测试
scripts/            版本与词库脚本
android/            Capacitor 安卓壳
.github/            GitHub Actions 构建配置
```

## 📝 更新日志

- v5.6.2 Initial release：首次开源发布
