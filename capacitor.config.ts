import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kaoyan.memory',
  appName: 'Vast Galaxy',
  webDir: 'dist/build/h5',
  android: {
    allowMixedContent: false,
    backgroundColor: '#0E1520'
  },
  // 云端对话要发 POST：WebView 里 fetch 会被 CORS 挡住，
  // 打开 CapacitorHttp 后由原生代发，装了就能用，不依赖目标接口的跨域头
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;
