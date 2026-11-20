/**
 * 云端对话：把「问一句、拿一段回答」这件事做出来。
 *
 * 这一层不做流式（SSE）：原生 HTTP 通道拿不到增量，走 fetch 又会被 CORS 拦。
 * 一次请求拿全文，再由界面逐字吐出来——观感接近流式，兼容性最好。
 *
 * 约束没变：只有 provider=cloud、联网开关打开、Key 合法这三条同时成立才会发请求。
 */
import {
  canUseCloud,
  isValidApiBase,
  isValidApiKey,
  normalizeApiKey,
  normalizeModel,
  type AiConfig
} from '@/utils/ai';

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatTurn {
  role: ChatRole;
  content: string;
  /** 毫秒时间戳；界面上只在分组时用 */
  at: number;
  /** 请求失败时留在气泡上，重试时据此找回上一条用户消息 */
  failed?: boolean;
  /** 这条回答下方由模型生成的「用户可能追问」，点击即填进输入框 */
  followUps?: string[];
}

export const CHAT_STORAGE_KEY = 'ky_v1_chat';
/** 本地最多留这么多轮，再多就把最早的丢掉 */
export const CHAT_KEEP = 40;
/** 每次请求带上的最近消息数：太多会拖慢首字，也太费 token */
export const CHAT_CONTEXT = 12;
export const MAX_INPUT = 800;

/** 助教口吻的默认版本：用户没在设置里改过时用这一份 */
export const SYSTEM_PROMPT = [
  '你是「Vast Galaxy」内置的考研英语助教，服务对象是正在背考研词汇（约 2900 词）的学生。',
  '回答用简体中文，直接给结论，不要客套开场。',
  '解释单词时给出音标、词性、一个考研阅读风格的例句和中文翻译；区分近义词时用一两句话点出核心差别。',
  '不确定就说不确定，不要编造词义或搭配。',
  '默认控制在 200 字以内，用户要求展开时再详细写。'
].join('\n');

export const SYSTEM_PROMPT_STORAGE_KEY = 'ky_v1_system_prompt';

/** 读取用户在设置里改过的系统提示词；没改过或读不到就用默认版 */
export function readSystemPrompt(): string {
  try {
    const raw = uni.getStorageSync(SYSTEM_PROMPT_STORAGE_KEY);
    if (typeof raw === 'string' && raw.trim()) return raw;
  } catch {
    // 读不到就用默认值
  }
  return SYSTEM_PROMPT;
}

/** 保存系统提示词；传空串或纯空白相当于恢复默认（直接删掉存储） */
export function saveSystemPrompt(text: string): string {
  const value = typeof text === 'string' ? text.trim() : '';
  try {
    if (!value) uni.removeStorageSync(SYSTEM_PROMPT_STORAGE_KEY);
    else uni.setStorageSync(SYSTEM_PROMPT_STORAGE_KEY, value);
  } catch {
    // 写不进去就只在本次会话生效
  }
  return value || SYSTEM_PROMPT;
}

export function emptyChat(): ChatTurn[] {
  return [];
}

/** 只保留最近 CHAT_KEEP 条，且丢掉开头的 assistant（没有对应提问的残句） */
export function trimChat(turns: ChatTurn[], keep = CHAT_KEEP): ChatTurn[] {
  const clean = turns.filter((turn) => typeof turn?.content === 'string' && turn.content.trim().length > 0);
  const sliced = clean.slice(-keep);
  while (sliced.length && sliced[0].role !== 'user') sliced.shift();
  return sliced;
}

/** 拼请求体：系统提示只放一条，历史里已有的同角色消息不再重复塞。
 *  systemPrompt 不传时读用户配置（设置页可改），保证云端和本地用同一份人设。
 *  stream=true 时打开流式——原生 SSE 插件会按流的方式读增量。 */
export function buildRequestBody(messages: ChatTurn[], model: string, systemPrompt?: string, stream = false) {
  const context = messages.slice(-CHAT_CONTEXT).map((turn) => ({ role: turn.role, content: turn.content }));
  const prompt = systemPrompt ?? readSystemPrompt();
  return {
    model: normalizeModel(model),
    stream,
    temperature: 0.6,
    messages: [{ role: 'system', content: prompt }, ...context]
  };
}

export interface ChatEndpoint {
  url: string;
  headers: Record<string, string>;
}

/** apiBase 允许以 /v1 结尾，也允许直接把完整路径填进来 */
export function resolveEndpoint(config: AiConfig): ChatEndpoint | null {
  if (!canUseCloud(config)) return null;
  const base = config.apiBase.replace(/\/+$/, '');
  if (!isValidApiBase(base).ok) return null;
  const url = /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
  return {
    url,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${normalizeApiKey(config.apiKey)}`
    }
  };
}

/** 不同家的返回结构都兼容一下：choices[0].message.content / 纯文本 / content 数组 */
export function parseReply(payload: unknown): string {
  if (!payload) return '';
  if (typeof payload === 'string') return payload.trim();
  const data = payload as Record<string, unknown>;
  const choices = data.choices;
  if (Array.isArray(choices) && choices.length) {
    const first = choices[0] as Record<string, unknown>;
    const message = first?.message as Record<string, unknown> | undefined;
    const content = message?.content ?? first?.text;
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) {
      return content
        .map((part) => (typeof part === 'string' ? part : String((part as Record<string, unknown>)?.text ?? '')))
        .join('')
        .trim();
    }
  }
  // 少数兼容层直接给 { reply: '...' } 或 { output_text: '...' }
  for (const key of ['reply', 'output_text', 'content', 'text']) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/** 把 HTTP 状态码翻译成「用户能照着做」的一句话 */
export function describeHttpError(status: number, body: string): string {
  const detail = extractApiError(body);
  if (status === 401) return `Key 没通过验证（401）${detail ? `：${detail}` : '，检查一下是不是复制少了字符'}。`;
  if (status === 403) return `这个 Key 没有调用权限（403）${detail ? `：${detail}` : '，确认账号已开通对应模型'}。`;
  if (status === 404) return `接口地址或模型名不对（404）${detail ? `：${detail}` : '，检查地址结尾是不是 /v1'}。`;
  if (status === 429) return `请求太频繁或额度用完了（429）${detail ? `：${detail}` : '，等一会儿再试'}。`;
  if (status >= 500) return `接口那边出错了（${status}）${detail ? `：${detail}` : '，稍后重试'}。`;
  return `请求失败（${status}）${detail ? `：${detail}` : ''}。`;
}

function extractApiError(body: string): string {
  if (!body) return '';
  try {
    const data = JSON.parse(body) as Record<string, unknown>;
    const error = data.error as Record<string, unknown> | string | undefined;
    if (typeof error === 'string') return error.slice(0, 120);
    const message = error?.message;
    if (typeof message === 'string') return message.slice(0, 120);
    if (typeof data.message === 'string') return data.message.slice(0, 120);
  } catch {
    // 不是 JSON 就直接截一段原文，别把整页 HTML 塞进气泡
  }
  return body.replace(/\s+/g, ' ').slice(0, 120);
}

export interface ChatReply {
  ok: boolean;
  content: string;
  error?: string;
}

/** 连不上要快点说，别让用户对着空白等一分钟；生成回答仍然给足时间 */
const CONNECT_TIMEOUT_MS = 12000;
const READ_TIMEOUT_MS = 45000;
const TOTAL_TIMEOUT_MS = 50000;

/** 从 URL 里抠出域名，报错时告诉用户到底卡在哪台服务器 */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * 原生壳抛上来的是 OkHttp / HttpURLConnection 的英文异常，
 * 直接塞进气泡用户根本看不懂。这里翻成「哪台服务器、大概为什么、怎么办」。
 */
export function translateNetworkError(message: string, url: string): string {
  const raw = String(message ?? '');
  const text = raw.toLowerCase();
  const host = hostOf(url);
  const isOpenAI = /api\.openai\.com/i.test(host);
  const unreachable = /failed to connect|timed ?out|timeout|econnrefused|enetunreach|enotfound|unable to resolve|unknownhost|no route|network is unreachable|socketexception|connectexception|failed to fetch|networkerror|err_network/i.test(text);
  if (unreachable) {
    if (isOpenAI) {
      return `连不上 ${host}。中国大陆网络通常无法直连 OpenAI，建议在「AI」板块的云端卡片里换成 DeepSeek 这类可直连的服务商，或填一条自己能用的线路。`;
    }
    return `连不上接口服务器 ${host}。检查手机网络、接口地址有没有填错，以及这个服务在你当前网络下能不能访问。`;
  }
  if (/ssl|certificate|handshake|trust anchor/i.test(text)) {
    return `和 ${host} 的安全连接没建立起来（证书校验失败）。确认接口地址是官方 https 地址，没有走不可信的代理。`;
  }
  if (/cors|cross-origin/i.test(text)) {
    return '浏览器里被跨域限制挡住了。装到手机上不会这样；手机上请检查联网开关和网络。';
  }
  return `请求出错：${raw.slice(0, 120)}`;
}

/**
 * 发一次请求。
 *
 * 原生壳优先走 CapacitorHttp：它由原生代码发请求，不受 WebView 的 CORS 限制。
 * 浏览器（含本地调试）走 fetch，开发时用代理或 mock 都行。
 */
export async function requestChat(config: AiConfig, messages: ChatTurn[], systemPrompt?: string): Promise<ChatReply> {
  const endpoint = resolveEndpoint(config);
  if (!endpoint) {
    return { ok: false, content: '', error: '还没配置好：需要选云端方案、打开联网、填好接口地址和 Key。' };
  }
  const body = JSON.stringify(buildRequestBody(messages, config.model, systemPrompt));

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS) : null;

  try {
    const native = nativeBridge();
    let status = 0;
    let text = '';
    if (native) {
      const response = await native.post({
        url: endpoint.url,
        headers: endpoint.headers,
        data: JSON.parse(body),
        connectTimeout: CONNECT_TIMEOUT_MS,
        readTimeout: READ_TIMEOUT_MS
      });
      status = Number(response?.status) || 0;
      text = typeof response?.data === 'string' ? response.data : JSON.stringify(response?.data ?? '');
    } else {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: endpoint.headers,
        body,
        signal: controller?.signal
      });
      status = response.status;
      text = await response.text();
    }

    if (status < 200 || status >= 300) {
      return { ok: false, content: '', error: describeHttpError(status, text) };
    }

    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {
      // 有的兼容层返回纯文本，直接当回答用
    }
    const content = parseReply(payload);
    if (!content) return { ok: false, content: '', error: '接口返回了空内容，换个模型名或接口地址再试。' };
    return { ok: true, content };
  } catch (error) {
    const name = (error as Error)?.name;
    const message = String((error as Error)?.message ?? error);
    if (name === 'AbortError') return { ok: false, content: '', error: '等了 50 秒还没回应，可能是网络太慢或接口没响应。' };
    return { ok: false, content: '', error: translateNetworkError(message, endpoint.url) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ── 追问建议：每轮回答后让模型猜两条用户可能接着问的话 ── */

/** 生成追问时用的专用人设：盖掉助教人设，避免它在追问里继续讲题 */
export const FOLLOWUP_PROMPT = [
  '你在为一款考研英语背词 App 生成「接下来你可能想问」的快捷提问，供用户点一下直接发送。',
  '仔细读下面的师生问答，站在学生的角度，猜他看完这段回答后，接下来最可能追问的两个新问题。',
  '这是「接着往下问」，不是「复述」：',
  '－ 严禁照抄或改写学生刚问过的问题，那是他已经问完的，不会再问一遍；',
  '－ 严禁照抄助教回答里的句子、表格、词条、标题或任何原文片段；',
  '－ 要往下推进：追问可以是要求举例、问搭配/近义/词根、问用法区别、问怎么记、或延伸到相关词。',
  '输出硬性要求：只输出两行，每行一个独立问题；每行 8～24 个字；',
  '不要编号、不要序号、不要引号、不要加粗、不要任何解释或多余文字；',
  '两行必须是两个不同的问题，且单独发给助教就能得到有用回答。'
].join('\n');

/**
 * 判断一句话是不是在复述已有内容（用户刚问的 / 回答里的原句）。
 * 只做保守判断：完全相等、或一方几乎被另一方包含时才算复述，避免误杀正常追问。
 */
function isRestating(candidate: string, reference: string): boolean {
  // 归一化：去掉空白、常见标点与各类引号，让"允许"和「允许」、中英文标点不影响比对
  const norm = (s: string) => s
    .replace(/[\s，。！？、；：（）()《》〈〉\[\]【】\-_*.·—…~`"'"\u2018-\u201f]/g, '')
    .toLowerCase();
  const a = norm(candidate);
  const b = norm(reference);
  if (!a || !b) return false;
  if (a === b) return true;
  // 候选被原句完整包含且自身够长——大概率是照抄时截了一段或漏了几个字。
  // 只判断"候选 ⊂ 原句"这个方向：正常追问（如"能举个例子吗"）不会是回答原句的子串，不会误杀。
  if (a.length >= 8 && b.includes(a)) return true;
  return false;
}

/**
 * 把模型返回的自由文本解析成最多两条追问。
 * 容错处理常见的「1. xxx」「- xxx」「**xxx**」等包装，过滤掉空行、过长内容和复述。
 * @param exclude 最近的用户提问 / 回答原文，用于剔除照抄式的复述
 */
export function parseFollowUps(raw: string, exclude?: string[]): string[] {
  if (!raw) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const refs = (exclude ?? []).filter((s) => typeof s === 'string' && s.trim()).slice(-6);
  for (const line of String(raw).split(/\r?\n/)) {
    let text = line.trim();
    if (!text) continue;
    // 先去掉加粗星号，避免后面的项目符号正则把落单的 * 当符号处理
    text = text.replace(/\*\*/g, '').trim();
    // 去掉行首编号 / 项目符号 / 引号
    text = text.replace(/^[\s]*[-*•]\s*/, '').replace(/^[\s]*\d+[\.、\)）]\s*/, '');
    text = text.replace(/^[\s]*[「"'"']+|[」"'"']+[\s]*$/g, '').trim();
    if (text.length < 4 || text.length > 40) continue;
    // 表格行 / 代码块围栏不是「问题」，直接丢掉
    if (/^\|.*\|$/.test(text) || /^```/.test(text)) continue;
    if (seen.has(text)) continue;
    // 照抄了用户刚问的或回答里的句子 → 不是追问
    if (refs.some((r) => isRestating(text, r))) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= 2) break;
  }
  return out;
}

/** 云端追问：复用 requestChat，但用专用提示词，且只带最近几轮上下文 */
export async function requestFollowUps(config: AiConfig, messages: ChatTurn[]): Promise<string[]> {
  if (!canUseCloud(config)) return [];
  const context = messages.slice(-CHAT_CONTEXT).map((turn) => ({
    role: turn.role,
    content: turn.role === 'assistant' ? turn.content.slice(0, 400) : turn.content
  }));
  const reply = await requestChat(config, context as ChatTurn[], FOLLOWUP_PROMPT);
  // 用最近的用户提问和回答原文过滤照抄式复述
  const exclude = context.filter((t) => t.role === 'user' || t.role === 'assistant').map((t) => t.content);
  return reply.ok ? parseFollowUps(reply.content, exclude) : [];
}

interface NativeHttp {
  post: (options: Record<string, unknown>) => Promise<{ status?: number; data?: unknown }>;
}

/** Capacitor 6 的 CapacitorHttp；浏览器里没有这个对象，返回 null 就走 fetch */
function nativeBridge(): NativeHttp | null {
  if (typeof window === 'undefined') return null;
  const capacitor = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { CapacitorHttp?: NativeHttp } };
  })?.Capacitor;
  if (!capacitor?.isNativePlatform?.()) return null;
  return capacitor.Plugins?.CapacitorHttp ?? null;
}

/* ── 会话落盘 ── */

export function readChat(): ChatTurn[] {
  try {
    const raw = uni.getStorageSync(CHAT_STORAGE_KEY);
    if (!Array.isArray(raw)) return emptyChat();
    return trimChat(
      raw.map((item) => {
        const turn = item as Partial<ChatTurn>;
        const role: ChatRole = turn.role === 'assistant' ? 'assistant' : turn.role === 'system' ? 'system' : 'user';
        const followUps = Array.isArray(turn.followUps)
          ? turn.followUps.filter((q): q is string => typeof q === 'string' && q.trim().length > 0).slice(0, 2)
          : undefined;
        return {
          role,
          content: typeof turn.content === 'string' ? turn.content : '',
          at: Number.isFinite(Number(turn.at)) ? Number(turn.at) : 0,
          ...(followUps && followUps.length ? { followUps } : {})
        };
      })
    );
  } catch {
    return emptyChat();
  }
}

export function saveChat(turns: ChatTurn[]): void {
  try {
    uni.setStorageSync(CHAT_STORAGE_KEY, trimChat(turns));
  } catch {
    // 写不进去就只留在内存里，不影响这次对话
  }
}

export function clearChat(): void {
  try {
    uni.removeStorageSync(CHAT_STORAGE_KEY);
  } catch {
    // 同上
  }
}

/** 界面上的状态文案：先看有没有配置，再看能不能用 */
export function chatStatus(config: AiConfig): { ready: boolean; label: string; hint: string } {
  if (!config.provider) return { ready: false, label: '未接入', hint: '还没选实现方案' };
  if (config.provider === 'local') return { ready: false, label: '本地模型', hint: '在 AI 页加载模型后即可离线对话' };
  if (!config.network) return { ready: false, label: '云端模型', hint: '联网开关关着' };
  if (!isValidApiKey(config.apiKey).ok) return { ready: false, label: '云端模型', hint: '还没填 Key' };
  return { ready: true, label: '云端模型', hint: '可以开始对话' };
}
