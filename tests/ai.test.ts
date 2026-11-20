import { beforeEach, describe, expect, it, vi } from 'vitest';

const bucket = new Map<string, unknown>();
vi.stubGlobal('uni', {
  getStorageSync: (key: string) => (bucket.has(key) ? bucket.get(key) : ''),
  setStorageSync: (key: string, value: unknown) => void bucket.set(key, value),
  removeStorageSync: (key: string) => void bucket.delete(key)
});

const {
  AI_STORAGE_KEY,
  DEFAULT_API_BASE,
  canUseCloud,
  defaultAiConfig,
  isValidApiBase,
  isValidApiKey,
  maskApiKey,
  normalizeApiBase,
  normalizeApiKey,
  normalizeModel,
  normalizeProvider,
  providerLabel,
  readAiConfig,
  saveAiConfig,
  switchProvider,
  AI_PRESETS,
  configMismatch,
  matchPreset
} = await import('@/utils/ai');

const KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789';

describe('AI 接入配置', () => {
  beforeEach(() => bucket.clear());

  it('认不出的方案一律回到「未选择」，不会把脏值当成云端', () => {
    expect(normalizeProvider('local')).toBe('local');
    expect(normalizeProvider('cloud')).toBe('cloud');
    expect(normalizeProvider('')).toBeNull();
    expect(normalizeProvider('remote')).toBeNull();
    expect(normalizeProvider(undefined)).toBeNull();
    expect(normalizeProvider({ provider: 'cloud' })).toBeNull();
  });

  it('Key 会去掉 Bearer 前缀和所有空白（从网页复制常带换行）', () => {
    expect(normalizeApiKey('  Bearer sk-abc  ')).toBe('sk-abc');
    expect(normalizeApiKey('sk-a\nb\tc d')).toBe('sk-abcd');
    expect(normalizeApiKey(123)).toBe('');
    expect(normalizeApiKey(null)).toBe('');
  });

  it('Key 只要求有内容：短口令、符号都放行，自建服务不受 16 位限制', () => {
    expect(isValidApiKey('')).toEqual({ ok: false, reason: '还没有填 Key' });
    expect(isValidApiKey('  ')).toEqual({ ok: false, reason: '还没有填 Key' });
    // 自建服务常常不要正经 Key，或只是很短的一串口令：一律通过
    expect(isValidApiKey('x').ok).toBe(true);
    expect(isValidApiKey('123').ok).toBe(true);
    expect(isValidApiKey('my-local-token!@#').ok).toBe(true);
    expect(isValidApiKey(KEY).ok).toBe(true);
  });

  it('接口地址 http 和 https 都行（自建局域网服务用 http），末尾斜杠会抹掉', () => {
    expect(isValidApiBase('')).toEqual({ ok: true, reason: '' });
    expect(normalizeApiBase('  https://api.example.com/v1///  ')).toBe('https://api.example.com/v1');
    expect(normalizeApiBase('')).toBe(DEFAULT_API_BASE);
    // 局域网自建服务的 http 地址现在放行
    expect(isValidApiBase('http://192.168.0.106:8080').ok).toBe(true);
    expect(isValidApiBase('http://api.example.com/v1').ok).toBe(true);
    expect(isValidApiBase('https://api.example.com/v1').ok).toBe(true);
    // 没有协议头、纯文字仍要拦住
    expect(isValidApiBase('192.168.0.106:8080').ok).toBe(false);
    expect(isValidApiBase('随便写的地址').reason).toContain('http');
  });

  it('界面上只露头尾，截图录屏带不走整串 Key', () => {
    expect(maskApiKey('')).toBe('');
    expect(maskApiKey('sk-short')).toBe('••••••');
    expect(maskApiKey(KEY)).toBe('sk-pr…6789');
  });

  it('云端可用要三件事同时成立：选了云端、开了联网、Key 合法', () => {
    const base = defaultAiConfig();
    expect(canUseCloud({ ...base, provider: 'cloud', network: true, apiKey: KEY })).toBe(true);
    expect(canUseCloud({ ...base, provider: 'cloud', network: false, apiKey: KEY })).toBe(false);
    expect(canUseCloud({ ...base, provider: 'cloud', network: true, apiKey: '' })).toBe(false);
    expect(canUseCloud({ ...base, provider: 'local', network: true, apiKey: KEY })).toBe(false);
  });

  it('没存过时给默认值：没选方案、联网关闭、地址用官方兼容地址', () => {
    const config = readAiConfig();
    expect(config.provider).toBeNull();
    expect(config.network).toBe(false);
    expect(config.apiKey).toBe('');
    expect(config.apiBase).toBe(DEFAULT_API_BASE);
  });

  it('存档里的脏数据会被逐项清洗，network 只有明确的 true 才算开', () => {
    bucket.set(AI_STORAGE_KEY, {
      provider: 'cloud',
      network: 'yes',
      apiKey: ' Bearer sk-abcdefghijklmnop ',
      apiBase: 'http://insecure.example.com',
      guideAt: 'abc',
      decidedAt: 1700000000000
    });
    const config = readAiConfig();
    expect(config.provider).toBe('cloud');
    expect(config.network).toBe(false);
    expect(config.apiKey).toBe('sk-abcdefghijklmnop');
    expect(config.apiBase).toBe('http://insecure.example.com');
    expect(config.guideAt).toBe(0);
    expect(config.decidedAt).toBe(1700000000000);
  });

  it('写进去再读出来是同一份配置', () => {
    const config = { ...defaultAiConfig(), provider: 'cloud' as const, network: true, apiKey: KEY };
    saveAiConfig(config);
    expect(readAiConfig()).toEqual(config);
  });

  it('换成本地时把云端参数清干净，避免「切回本地了 Key 还留着」', () => {
    const cloud = { ...defaultAiConfig(), provider: 'cloud' as const, network: true, apiKey: KEY };
    const local = switchProvider(cloud, 'local', 42);
    expect(local.provider).toBe('local');
    expect(local.network).toBe(false);
    expect(local.apiKey).toBe('');
    expect(local.decidedAt).toBe(42);
    // 反过来切云端不清 Key、也不偷偷把联网打开
    const back = switchProvider({ ...local, apiKey: KEY }, 'cloud', 43);
    expect(back.network).toBe(false);
    expect(back.apiKey).toBe(KEY);
  });

  it('三个状态的中文标签固定，模板直接拿来当 chip 文案', () => {
    expect(providerLabel(null)).toBe('未接入');
    expect(providerLabel('local')).toBe('本地模型');
    expect(providerLabel('cloud')).toBe('云端模型');
  });
});

describe('服务商预设与错配提醒', () => {
  const deepseek = AI_PRESETS.find((preset) => preset.id === 'deepseek')!;

  it('预设里 DeepSeek 的地址不带 /v1，拼上 /chat/completions 正是官方路径', () => {
    expect(deepseek.apiBase).toBe('https://api.deepseek.com');
    expect(`${deepseek.apiBase}/chat/completions`).toBe('https://api.deepseek.com/chat/completions');
    expect(deepseek.model).toBe('deepseek-flash');
  });

  it('每家预设的地址都是 https 且模型名不为空', () => {
    expect(AI_PRESETS.length).toBeGreaterThanOrEqual(4);
    for (const preset of AI_PRESETS) {
      expect(isValidApiBase(preset.apiBase).ok).toBe(true);
      expect(normalizeModel(preset.model)).toBe(preset.model);
    }
  });

  it('地址与模型名一致时认出服务商，自定义地址就是 custom', () => {
    expect(matchPreset(deepseek.apiBase, deepseek.model)).toBe('deepseek');
    expect(matchPreset(DEFAULT_API_BASE, 'gpt-4o-mini')).toBe('openai');
    expect(matchPreset('https://my-proxy.example.com/v1', 'gpt-4o-mini')).toBe('custom');
  });

  it('用户那种「模型名 deepseek、地址还是 OpenAI」要报出来', () => {
    const message = configMismatch(DEFAULT_API_BASE, 'deepseek');
    expect(message).toContain('另一家');
    expect(message).toContain('401');
  });

  it('同一家的组合不误报，第三方中转也不误报', () => {
    expect(configMismatch(deepseek.apiBase, 'deepseek-flash')).toBe('');
    expect(configMismatch('https://api.deepseek.com/v1', 'deepseek-chat')).toBe('');
    expect(configMismatch('https://api.siliconflow.cn/v1', 'deepseek-ai/DeepSeek-V3')).toBe('');
    expect(configMismatch('https://my-proxy.example.com/v1', 'gpt-4o-mini')).toBe('');
  });
});

describe('模型名', () => {
  beforeEach(() => bucket.clear());

  it('默认是 gpt-4o-mini，空值和空白都回落到它', () => {
    expect(defaultAiConfig().model).toBe('gpt-4o-mini');
    expect(normalizeModel('')).toBe('gpt-4o-mini');
    expect(normalizeModel('   ')).toBe('gpt-4o-mini');
    expect(normalizeModel(undefined)).toBe('gpt-4o-mini');
  });

  it('第三方模型名原样保留，带斜杠也行', () => {
    expect(normalizeModel('deepseek-chat')).toBe('deepseek-chat');
    expect(normalizeModel('openai/gpt-4o-mini')).toBe('openai/gpt-4o-mini');
    expect(normalizeModel('gpt-4o ')).toBe('gpt-4o');
  });

  it('中间带空格或超长的名字按默认处理，避免拼出非法请求', () => {
    expect(normalizeModel('gpt 4o')).toBe('gpt-4o-mini');
    expect(normalizeModel('a'.repeat(80))).toBe('gpt-4o-mini');
  });

  it('老存档没有 model 字段时补上默认值', () => {
    bucket.set('ky_v1_ai', { provider: 'cloud', network: true, apiKey: KEY, apiBase: 'https://api.openai.com/v1' });
    expect(readAiConfig().model).toBe('gpt-4o-mini');
  });
});
