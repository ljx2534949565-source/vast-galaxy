/**
 * AI 助记的「接入配置」——这一版只做到「选方案 + 填参数 + 落盘」，
 * 真正发起推理的那一层还没接（见设置页与 FEASIBILITY.md）。
 *
 * 两条约束写在这里，而不是散在页面里：
 * 1. 云端方案必须先打开 `network` 总开关。开关关着，任何代码路径都不该发请求。
 * 2. Key 只落在本机存储，不进备份包，也不做任何形式的同步。
 */

export type AiProvider = 'local' | 'cloud';

export const AI_STORAGE_KEY = 'ky_v1_ai';
export const DEFAULT_API_BASE = 'https://api.openai.com/v1';
/** 默认模型：便宜、够用，写错也能在设置里改 */
export const DEFAULT_MODEL = 'gpt-4o-mini';

/**
 * 常见服务商的「一键填好」参数。模型名会变，所以界面上写明以服务商后台为准。
 * DeepSeek 的官方 OpenAI 兼容地址不带 /v1，chat/completions 直接挂在根路径下；
 * 我们把 apiBase 拼上 /chat/completions，正好对得上官方文档。
 */
export interface AiPreset {
  id: string;
  label: string;
  apiBase: string;
  model: string;
  note: string;
}

export const AI_PRESETS: AiPreset[] = [
  { id: 'deepseek', label: 'DeepSeek', apiBase: 'https://api.deepseek.com', model: 'deepseek-flash', note: '国内可直连；模型名以开放平台文档为准（deepseek-chat 已停用）' },
  { id: 'moonshot', label: 'Kimi', apiBase: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', note: '月之暗面，地址结尾是 /v1' },
  { id: 'zhipu', label: '智谱 GLM', apiBase: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', note: '路径是 /api/paas/v4，不是 /v1' },
  { id: 'openai', label: 'OpenAI', apiBase: DEFAULT_API_BASE, model: DEFAULT_MODEL, note: '中国大陆网络通常无法直连，需要自备可用线路' }
];

/** 当前填的地址+模型能对应上哪个预设（用于高亮那颗快捷按钮） */
export function matchPreset(apiBase: string, model: string): string {
  const base = normalizeApiBase(apiBase).toLowerCase();
  const name = normalizeModel(model).toLowerCase();
  for (const preset of AI_PRESETS) {
    if (normalizeApiBase(preset.apiBase).toLowerCase() !== base) continue;
    // 模型名允许各家自己的变体，只要求前缀对得上
    const family = preset.id === 'deepseek' ? 'deepseek'
      : preset.id === 'moonshot' ? 'moonshot|kimi'
        : preset.id === 'zhipu' ? 'glm' : 'gpt|o1|o3|o4|chatgpt';
    if (new RegExp(`^${family}`).test(name)) return preset.id;
  }
  return 'custom';
}

/**
 * 最典型的一类错配：模型名填了 deepseek，地址却还是默认的 api.openai.com。
 * 这种组合在国内必然是 60 秒连不上，或者拿别家的 Key 去换 401。
 * 只报「两边都认得出来且不是同一家」的情况，第三方中转/自定义模型不误伤。
 */
export function configMismatch(apiBase: string, model: string): string {
  const base = normalizeApiBase(apiBase);
  const name = normalizeModel(model);
  const families: Array<{ key: string; host: RegExp; model: RegExp }> = [
    { key: 'DeepSeek', host: /api\.deepseek\.com/i, model: /^deepseek/i },
    { key: 'Kimi', host: /api\.moonshot\.cn/i, model: /^(moonshot|kimi)/i },
    { key: '智谱 GLM', host: /bigmodel|zhipu/i, model: /^glm/i },
    { key: 'OpenAI', host: /api\.openai\.com/i, model: /^(gpt-|o[134]|chatgpt)/i }
  ];
  const host = families.find((item) => item.host.test(base));
  const family = families.find((item) => item.model.test(name));
  if (host && family && host.key !== family.key) {
    return `接口地址指向 ${host.key}，模型名「${name}」却是另一家的。Key、地址、模型名必须是同一家，否则会一直连不上或报 401。点上面的服务商按钮可以一键改好。`;
  }
  return '';
}

export interface AiConfig {
  /** null = 还没选过方案，设置页据此弹「请选择实现方案」 */
  provider: AiProvider | null;
  /** 云端方案的联网总开关；默认关，关着不发任何请求 */
  network: boolean;
  apiKey: string;
  apiBase: string;
  /** 模型名，默认 gpt-4o-mini；第三方兼容接口填它自己的名字 */
  model: string;
  /** 本地方案：看过部署教程的时间，0 表示没看过 */
  guideAt: number;
  /** 上次确定方案的时间，用于在卡片上显示「几时选的」 */
  decidedAt: number;
}

export function defaultAiConfig(): AiConfig {
  return {
    provider: null,
    network: false,
    apiKey: '',
    apiBase: DEFAULT_API_BASE,
    model: DEFAULT_MODEL,
    guideAt: 0,
    decidedAt: 0
  };
}

export function normalizeProvider(value: unknown): AiProvider | null {
  return value === 'local' || value === 'cloud' ? value : null;
}

/** 去掉 "Bearer " 前缀与所有空白：从网页复制 Key 时经常带换行或尾随空格 */
export function normalizeApiKey(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/^\s*bearer\s+/i, '').replace(/\s+/g, '');
}

export function normalizeModel(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_MODEL;
  const text = value.trim();
  // 允许 openai/gpt-4o-mini、deepseek-chat 这类带路径的名字，只挡住空白和超长
  if (!text || /\s/.test(text) || text.length > 64) return DEFAULT_MODEL;
  return text;
}

export function normalizeApiBase(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_API_BASE;
  const text = value.trim().replace(/\/+$/, '');
  return text || DEFAULT_API_BASE;
}

export interface CheckResult {
  ok: boolean;
  reason: string;
}

export function isValidApiKey(value: unknown): CheckResult {
  const key = normalizeApiKey(value);
  if (!key) return { ok: false, reason: '还没有填 Key' };
  // 自建服务（局域网 / 本机部署）常常不要 Key，或只是很短的一串口令。
  // 不再强制 16 位、也不限制字符种类：只要有内容就放行，交给服务端自己校验。
  // 不要 Key 的服务随手填一个短口令（如 x）即可，App 照样把请求发出去。
  return { ok: true, reason: '' };
}

export function isValidApiBase(value: unknown): CheckResult {
  const text = normalizeApiBase(value);
  // 自建服务多用 http://192.168.x.x:端口 这类局域网明文地址，http 与 https 都放行。
  // 仍然要求带协议头且后面有主机，避免把乱填的文字当成地址。
  if (!/^https?:\/\/[^\s/]+/i.test(text)) return { ok: false, reason: '接口地址要以 http:// 或 https:// 开头' };
  return { ok: true, reason: '' };
}

/** 界面上只露头尾，避免截图、录屏把整串 Key 带出去 */
export function maskApiKey(value: unknown): string {
  const key = normalizeApiKey(value);
  if (!key) return '';
  if (key.length <= 12) return '••••••';
  return `${key.slice(0, 5)}…${key.slice(-4)}`;
}

/** 三个条件同时成立才算「云端能用」：选了云端、开了联网、Key 合法 */
export function canUseCloud(config: AiConfig): boolean {
  return config.provider === 'cloud' && config.network && isValidApiKey(config.apiKey).ok;
}

export function providerLabel(provider: AiProvider | null): string {
  if (provider === 'local') return '本地模型';
  if (provider === 'cloud') return '云端模型';
  return '未接入';
}

export function readAiConfig(): AiConfig {
  try {
    const raw = uni.getStorageSync(AI_STORAGE_KEY);
    if (!raw || typeof raw !== 'object') return defaultAiConfig();
    const value = raw as Partial<AiConfig>;
    return {
      provider: normalizeProvider(value.provider),
      // 只有明确的 true 才算开：老存档、脏数据一律按关处理
      network: value.network === true,
      apiKey: normalizeApiKey(value.apiKey),
      apiBase: normalizeApiBase(value.apiBase),
      model: normalizeModel(value.model),
      guideAt: Number.isFinite(Number(value.guideAt)) ? Number(value.guideAt) : 0,
      decidedAt: Number.isFinite(Number(value.decidedAt)) ? Number(value.decidedAt) : 0
    };
  } catch {
    return defaultAiConfig();
  }
}

export function saveAiConfig(config: AiConfig): void {
  try {
    uni.setStorageSync(AI_STORAGE_KEY, config);
  } catch {
    // 存储写不进去时也不该让设置页崩掉；下次进入会回到默认值
  }
}

/** 换方案时把上一套参数清干净，避免「切成本地了 Key 还留着」 */
export function switchProvider(config: AiConfig, provider: AiProvider, at = Date.now()): AiConfig {
  return {
    ...config,
    provider,
    apiKey: provider === 'local' ? '' : config.apiKey,
    network: provider === 'local' ? false : config.network,
    decidedAt: at
  };
}

/** 一份可直接用的云端配置：给「先填 Key 再回头开联网」这条路径补默认值 */
export function withCloudDefaults(config: AiConfig): AiConfig {
  return {
    ...config,
    apiBase: normalizeApiBase(config.apiBase),
    model: normalizeModel(config.model)
  };
}
