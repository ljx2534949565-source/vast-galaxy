/**
 * 云端流式对话封装。
 *
 * 原生（Capacitor）：走 CloudStreamPlugin，用 HttpURLConnection 逐行读 SSE，
 *   通过 cloudToken 事件把增量推回来，不受 CORS 限制。
 * H5 / 浏览器：走 fetch + ReadableStream 自己解析 SSE，便于本地调试；
 *   若接口不支持 CORS 会失败，由上层降级提示。
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { AiConfig } from '@/utils/ai';
import { buildRequestBody, resolveEndpoint } from '@/utils/chat';
import type { ChatTurn } from '@/utils/chat';

interface CloudTokenEvent {
  text?: string;
  done?: boolean;
  error?: string;
}

interface CloudStreamPluginApi {
  stream(options: { url: string; headers: Record<string, string>; body: Record<string, unknown> }): Promise<{ text?: string }>;
  cancel(): Promise<{ ok?: boolean }>;
  addListener(eventName: string, listener: (event: CloudTokenEvent) => void): { remove: () => void };
}

const CloudStream = registerPlugin<CloudStreamPluginApi>('CloudStream');

function native(): boolean {
  return typeof window !== 'undefined' && !!Capacitor?.isNativePlatform?.();
}

/**
 * 从一段 SSE 文本块里抽所有增量文本（H5 兜底用）。
 * 一个 chunk 里可能有多行 `data:`，也可能被网络切断成半行——
 * 调用方负责把半行缓存起来，下次拼上再解析。
 * 返回 { text: 拼好的增量, done: 是否遇到 [DONE] }
 */
export function parseSseChunk(chunk: string): { text: string; done: boolean } {
  let text = '';
  let done = false;
  for (const line of chunk.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const data = trimmed.substring(5).trim();
    if (data === '[DONE]') {
      done = true;
      continue;
    }
    if (!data) continue;
    try {
      const obj = JSON.parse(data) as Record<string, unknown>;
      const choices = obj.choices as Array<Record<string, unknown>> | undefined;
      let piece = '';
      if (Array.isArray(choices) && choices.length) {
        const first = choices[0];
        const delta = first?.delta as Record<string, unknown> | undefined;
        if (delta && typeof delta.content === 'string') piece = delta.content;
        else if (delta && typeof delta.text === 'string') piece = delta.text;
        else if (typeof first?.text === 'string') piece = first.text;
      }
      if (!piece && typeof obj.content === 'string') piece = obj.content;
      if (!piece && typeof obj.reply === 'string') piece = obj.reply;
      text += piece;
    } catch {
      // 半行或注释，忽略；调用方的缓存会处理跨 chunk 的半行
    }
  }
  return { text, done };
}

export interface StreamResult {
  ok: boolean;
  text: string;
  error?: string;
}

/**
 * 发起云端流式请求，边收边回调 onChunk(piece, fullText)。
 * @returns 全文与成功状态；失败时 error 给上层显示。
 */
export async function streamChat(
  config: AiConfig,
  messages: ChatTurn[],
  systemPrompt: string,
  onChunk: (piece: string, full: string) => void
): Promise<StreamResult> {
  const endpoint = resolveEndpoint(config);
  if (!endpoint) {
    return { ok: false, text: '', error: '还没配置好：需要打开联网、填好接口地址和 Key。' };
  }
  const body = buildRequestBody(messages, config.model, systemPrompt, true);

  if (native()) {
    let full = '';
    let handle: { remove: () => void } | null = null;
    try {
      handle = CloudStream.addListener('cloudToken', (event: CloudTokenEvent) => {
        if (!event) return;
        if (event.text) {
          full += event.text;
          onChunk(event.text, full);
        }
      });
      const res = await CloudStream.stream({
        url: endpoint.url,
        headers: endpoint.headers,
        body: body as unknown as Record<string, unknown>
      });
      const final = typeof res?.text === 'string' && res.text ? res.text : full;
      return { ok: true, text: final };
    } catch (e) {
      const message = (e as Error)?.message || '流式请求失败';
      // 接口不支持流时给一个明确的降级提示
      const hint = /stream|sse|400|not support/i.test(message)
        ? `${message}（这个接口可能不支持流式，请换支持 stream 的服务）`
        : message;
      return { ok: false, text: full, error: hint };
    } finally {
      if (handle) {
        try { handle.remove(); } catch { /* 忽略 */ }
      }
    }
  }

  // ── H5 兜底：fetch 读 ReadableStream ──
  let full = '';
  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: { ...endpoint.headers, Accept: 'text/event-stream' },
      body: JSON.stringify(body)
    });
    if (!response.ok || !response.body) {
      return { ok: false, text: '', error: `请求失败（${response.status}）` };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const cut = buffer.lastIndexOf('\n');
      if (cut < 0) continue;
      const complete = buffer.slice(0, cut + 1);
      buffer = buffer.slice(cut + 1);
      const parsed = parseSseChunk(complete);
      if (parsed.text) {
        full += parsed.text;
        onChunk(parsed.text, full);
      }
      if (parsed.done) break;
    }
    // 处理尾部残留
    if (buffer.trim()) {
      const parsed = parseSseChunk(buffer);
      if (parsed.text) {
        full += parsed.text;
        onChunk(parsed.text, full);
      }
    }
    return { ok: true, text: full };
  } catch (e) {
    const message = (e as Error)?.message || '流式请求失败';
    return {
      ok: false,
      text: full,
      error: /cors|failed to fetch|networkerror/i.test(message)
        ? '浏览器调试受跨域限制，装到手机上即可正常流式。'
        : message
    };
  }
}

/** 取消当前流（切模型/清空对话时调用） */
export async function cancelCloudStream(): Promise<void> {
  if (!native()) return;
  try { await CloudStream.cancel(); } catch { /* 忽略 */ }
}
