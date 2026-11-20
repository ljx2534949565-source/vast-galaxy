import { beforeEach, describe, expect, it, vi } from 'vitest';

const bucket = new Map<string, unknown>();
vi.stubGlobal('uni', {
  getStorageSync: (key: string) => (bucket.has(key) ? bucket.get(key) : ''),
  setStorageSync: (key: string, value: unknown) => void bucket.set(key, value),
  removeStorageSync: (key: string) => void bucket.delete(key)
});

const {
  CHAT_KEEP,
  CHAT_STORAGE_KEY,
  FOLLOWUP_PROMPT,
  SYSTEM_PROMPT,
  buildRequestBody,
  clearChat,
  describeHttpError,
  parseFollowUps,
  parseReply,
  readChat,
  requestChat,
  resolveEndpoint,
  saveChat,
  trimChat,
  translateNetworkError
} = await import('@/utils/chat');
const { defaultAiConfig } = await import('@/utils/ai');

const now = 1763000000000;

function turn(role: 'user' | 'assistant', content: string) {
  return { role, content, at: now };
}

function cloudConfig(overrides: Record<string, unknown> = {}) {
  return {
    ...defaultAiConfig(),
    provider: 'cloud' as const,
    network: true,
    apiKey: 'sk-abcdefghijklmnopqrstuvwxyz',
    ...overrides
  };
}

beforeEach(() => {
  bucket.clear();
});

describe('对话历史整理', () => {
  it('丢掉空消息，只保留最近的消息', () => {
    const list = [
      turn('user', '第一条'),
      turn('assistant', ''),
      turn('assistant', '回答'),
      turn('user', '第二条')
    ];
    const kept = trimChat(list);
    expect(kept).toHaveLength(3);
    expect(kept[1].content).toBe('回答');
  });

  it('开头不是用户提问的残句会被剪掉', () => {
    const kept = trimChat([turn('assistant', '半截回答'), turn('user', '问题'), turn('assistant', '回答')]);
    expect(kept[0].role).toBe('user');
    expect(kept).toHaveLength(2);
  });

  it('超过上限时只留最后 CHAT_KEEP 条', () => {
    const list = Array.from({ length: CHAT_KEEP + 10 }, (_, index) => turn(index % 2 ? 'assistant' : 'user', `m${index}`));
    const kept = trimChat(list);
    expect(kept.length).toBeLessThanOrEqual(CHAT_KEEP);
    expect(kept[kept.length - 1].content).toBe(`m${CHAT_KEEP + 9}`);
  });
});

describe('请求体', () => {
  it('系统提示固定在第一条，历史跟在后面', () => {
    const body = buildRequestBody([turn('user', '你好')], 'gpt-4o-mini');
    expect(body.stream).toBe(false);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.messages[0]).toEqual({ role: 'system', content: SYSTEM_PROMPT });
    expect(body.messages[1]).toEqual({ role: 'user', content: '你好' });
  });

  it('上下文只带最近 12 条', () => {
    const list = Array.from({ length: 30 }, (_, index) => turn(index % 2 ? 'assistant' : 'user', `m${index}`));
    const body = buildRequestBody(list, 'deepseek-chat');
    // 1 条系统提示 + 12 条上下文
    expect(body.messages).toHaveLength(13);
  });

  it('模型名带空白或过长时退回默认值', () => {
    expect(buildRequestBody([], '  ').model).toBe('gpt-4o-mini');
    expect(buildRequestBody([], 'a'.repeat(80)).model).toBe('gpt-4o-mini');
    expect(buildRequestBody([], 'openai/gpt-4o-mini').model).toBe('openai/gpt-4o-mini');
  });
});

describe('接口地址', () => {
  it('三条都满足才给出地址', () => {
    expect(resolveEndpoint({ ...cloudConfig(), network: false })).toBeNull();
    expect(resolveEndpoint(cloudConfig({ apiKey: '' }))).toBeNull();
    expect(resolveEndpoint(cloudConfig({ provider: 'local' }))).toBeNull();
  });

  it('补 /chat/completions，已经写全的不重复拼', () => {
    expect(resolveEndpoint(cloudConfig())?.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(resolveEndpoint(cloudConfig({ apiBase: 'https://api.deepseek.com/v1/' }))?.url).toBe(
      'https://api.deepseek.com/v1/chat/completions'
    );
    expect(resolveEndpoint(cloudConfig({ apiBase: 'https://x.cn/v1/chat/completions' }))?.url).toBe(
      'https://x.cn/v1/chat/completions'
    );
  });

  it('鉴权头走 Bearer，Key 里的空白被清掉', () => {
    const endpoint = resolveEndpoint(cloudConfig({ apiKey: '  sk-abcdefghijklmnop  ' }));
    expect(endpoint?.headers.Authorization).toBe('Bearer sk-abcdefghijklmnop');
  });
});

describe('返回解析', () => {
  it('标准 OpenAI 结构', () => {
    expect(parseReply({ choices: [{ message: { content: ' 回答 ' } }] })).toBe('回答');
  });

  it('content 是数组时拼起来', () => {
    expect(parseReply({ choices: [{ message: { content: [{ text: '前半' }, { text: '后半' }] } }] })).toBe('前半后半');
  });

  it('兼容 text / reply / 纯文本', () => {
    expect(parseReply({ choices: [{ text: '旧格式' }] })).toBe('旧格式');
    expect(parseReply({ reply: '直达' })).toBe('直达');
    expect(parseReply('就是一段话')).toBe('就是一段话');
    expect(parseReply(null)).toBe('');
  });
});

describe('错误翻译', () => {
  it('401 提示检查 Key', () => {
    expect(describeHttpError(401, '{"error":{"message":"Incorrect API key"}}')).toContain('Incorrect API key');
    expect(describeHttpError(401, '')).toContain('401');
  });

  it('429 提示额度或频率', () => {
    expect(describeHttpError(429, '')).toContain('额度');
  });

  it('非 JSON 的响应只截一小段', () => {
    const text = describeHttpError(502, '<html>'.repeat(100));
    expect(text.length).toBeLessThan(180);
  });
});

describe('会话落盘', () => {
  it('存进去再读出来，脏数据被过滤', () => {
    saveChat([turn('user', '你好'), turn('assistant', '在的')]);
    const back = readChat();
    expect(back).toHaveLength(2);
    expect(back[1].content).toBe('在的');
  });

  it('清空后读到空数组', () => {
    saveChat([turn('user', '你好')]);
    clearChat();
    expect(readChat()).toEqual([]);
    expect(bucket.has(CHAT_STORAGE_KEY)).toBe(false);
  });
});

describe('发请求', () => {
  it('没配置时直接返回提示，不发请求', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const result = await requestChat(defaultAiConfig(), [turn('user', '你好')]);
    expect(result.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('正常返回时拿到正文', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: '这是回答' } }] }), { status: 200 }))
    );
    const result = await requestChat(cloudConfig(), [turn('user', '你好')]);
    expect(result.ok).toBe(true);
    expect(result.content).toBe('这是回答');
  });

  it('HTTP 错误翻成中文提示', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"bad key"}}', { status: 401 })));
    const result = await requestChat(cloudConfig(), [turn('user', '你好')]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('401');
  });

  it('返回空内容时给一句能照着改的话', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })));
    const result = await requestChat(cloudConfig(), [turn('user', '你好')]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('空内容');
  });
});

describe('网络异常翻译', () => {
  it('真机上那句 OkHttp 超时要翻成中文，并点名是 OpenAI 直连的问题', () => {
    const raw = 'failed to connect to api.openai.com/50.23.209.199 (port 443) from /192.168.0.101 (port 38432) after 60000ms';
    const message = translateNetworkError(raw, 'https://api.openai.com/v1/chat/completions');
    expect(message).toContain('连不上');
    expect(message).toContain('api.openai.com');
    expect(message).toContain('DeepSeek');
    expect(message).not.toContain('failed to connect');
  });

  it('其它域名超时给出域名和排查方向', () => {
    const message = translateNetworkError('java.net.SocketTimeoutException: timeout', 'https://api.example.com/v1/chat/completions');
    expect(message).toContain('api.example.com');
    expect(message).toContain('检查手机网络');
  });

  it('证书错误与跨域分别给不同提示', () => {
    expect(translateNetworkError('SSLHandshakeException: trust anchor', 'https://api.example.com/v1')).toContain('安全连接');
    expect(translateNetworkError('CORS blocked', 'https://api.example.com/v1')).toContain('跨域');
  });

  it('认不出的异常保留原文但截断，不把整段日志塞进气泡', () => {
    const message = translateNetworkError('x'.repeat(300), 'https://api.example.com/v1');
    expect(message.startsWith('请求出错：')).toBe(true);
    expect(message.length).toBeLessThan(140);
  });
});

describe('追问建议解析', () => {
  it('两行纯问题原样取出', () => {
    expect(parseFollowUps('这个词还有哪些搭配？\n能出一道填空题吗？')).toEqual(['这个词还有哪些搭配？', '能出一道填空题吗？']);
  });

  it('去掉编号、项目符号和引号包装', () => {
    expect(parseFollowUps('1. 这个词还有哪些搭配？\n- 「能出一道填空题吗？」')).toEqual(['这个词还有哪些搭配？', '能出一道填空题吗？']);
  });

  it('去掉加粗星号，只取前两条，跳过空行和重复', () => {
    const raw = '**近义词怎么区分？**\n\n近义词怎么区分？\n帮我造个句子\n第三条也不要';
    expect(parseFollowUps(raw)).toEqual(['近义词怎么区分？', '帮我造个句子']);
  });

  it('过滤太短和过长的行', () => {
    const raw = '好\n' + 'x'.repeat(60) + '\n这是一个正常长度的问题吗？';
    expect(parseFollowUps(raw)).toEqual(['这是一个正常长度的问题吗？']);
  });

  it('空输入返回空数组', () => {
    expect(parseFollowUps('')).toEqual([]);
    expect(parseFollowUps('   \n\n  ')).toEqual([]);
  });

  it('剔除照抄用户原问题的复述，保留真正的新追问', () => {
    const raw = '含有“permit”这个词的歌曲\n能再给几个含 permit 的例句吗？';
    const exclude = ['帮我找含有“permit”这个词的歌曲（英文原词）'];
    expect(parseFollowUps(raw, exclude)).toEqual(['能再给几个含 permit 的例句吗？']);
  });

  it('剔除照抄回答原文的复述和表格行', () => {
    const raw = '| 歌曲 | 演唱者 | 释义 |\npermit 用作动词，意思是允许\n这个词还有哪些固定搭配？';
    const exclude = ['permit 用作动词，意思是“允许”，常见搭配 permit sb to do sth。'];
    expect(parseFollowUps(raw, exclude)).toEqual(['这个词还有哪些固定搭配？']);
  });

  it('提示词明确禁止复述、要求往下推进', () => {
    expect(FOLLOWUP_PROMPT).toContain('严禁照抄');
    expect(FOLLOWUP_PROMPT).toContain('往下推进');
  });
});
