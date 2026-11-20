# 构建说明

本项目用 uni-app 写前端，Capacitor 把它打包进安卓壳。两条出包路线：GitHub 自动构建（最简单）和本机构建。

## 路线一：GitHub Actions 自动构建（推荐）

1. 打开仓库的 **Actions** 标签。
2. 左侧选 **Build Android APK**，点右侧 **Run workflow** → **Run workflow**。
3. 等任务跑完，在本次运行页面往下拉到 **Artifacts**，下载 `app-debug`。
4. 解压得到 `app-debug.apk`，传到安卓手机安装。

这条路线不需要你装任何开发环境。产物是调试包，用 Android 自动生成的 debug 证书签名。

## 路线二：本机构建

### 准备环境

- Node.js 22 或更高
- JDK 17
- Android SDK 34（并接受相关许可协议）

### 步骤

```bash
npm install            # 1. 装依赖
npm run test           # 2. 跑单元测试，确认基础功能正常
npm run build:h5       # 3. 构建前端，产物在 dist/build/h5
npx cap sync android   # 4. 把前端产物同步进安卓壳

cd android
./gradlew assembleDebug --no-daemon    # Windows 用 gradlew.bat
```

调试包输出在 `android/app/build/outputs/apk/debug/app-debug.apk`。

> 顺序不能反：必须**先** `npm run build:h5`，**再** `npx cap sync android`。反了的话 APK 里打进去的是上一次的页面，改了代码却看不到效果。

也可以用一条命令把第 3、4 步和打包合起来：

```bash
npm run build:apk
```

### Android Studio

可以用 Android Studio 打开 `android/` 目录，点运行按钮直接装到连接的手机上，方便调试。

## 关于签名（重要）

- 仓库里**不含任何签名私钥**，这是故意的。私钥一旦公开，任何人都能签出同证书的包。
- 调试包用 Android 自动生成的默认 debug 证书，clone 下来就能构建。
- 正式发布需要你自己的 release keystore，请在本机配置，不要提交到仓库。配置方式见 `android/app/build.gradle` 里的注释。
- 换了签名证书后，老版本**不能直接覆盖安装**，需要先卸载再装（本地数据会清空）。

## 改版本号

版本号统一由脚本写入，改一处会同步 `package.json`、`src/manifest.json`、`src/config/app.ts`、`android/app/build.gradle` 四个文件：

```bash
node scripts/version.mjs 5.6.3
```

不要手动分别改这四个文件，否则容易出现 APK 里显示旧版本。

## 改词库

`src/data/wordsData.js` 是自动生成的，不要手改。按 `src/data/words/unitNN.js` 分片新增后，跑合并脚本：

```bash
node scripts/expandWords.mjs          # 合并并校验
node scripts/expandWords.mjs --check # 只校验不写入
```
