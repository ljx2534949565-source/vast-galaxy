import { describe, expect, it } from 'vitest';
import { parseSseChunk } from '@/utils/cloudStream';

const delta = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`;

describe('云端 SSE 增量解析', () => {
  it('从一行 data 里抠出 delta.content', () => {
    expect(parseSseChunk(delta('你')).text).toBe('你');
  });

  it('一个 chunk 多行 data 全部拼起来', () => {
    const chunk = `${delta('你')}\n\n${delta('好')}\n\n`;
    expect(parseSseChunk(chunk).text).toBe('你好');
  });

  it('识别 [DONE] 结束标记', () => {
    const chunk = `${delta('完')}\n\ndata: [DONE]\n\n`;
    const res = parseSseChunk(chunk);
    expect(res.text).toBe('完');
    expect(res.done).toBe(true);
  });

  it('兼容 choices[0].text 与顶层 content/reply', () => {
    expect(parseSseChunk(`data: ${JSON.stringify({ choices: [{ text: '甲' }] })}`).text).toBe('甲');
    expect(parseSseChunk(`data: ${JSON.stringify({ content: '乙' })}`).text).toBe('乙');
    expect(parseSseChunk(`data: ${JSON.stringify({ reply: '丙' })}`).text).toBe('丙');
  });

  it('忽略注释、心跳和半行，不抛错', () => {
    expect(parseSseChunk(': ping\n\n').text).toBe('');
    expect(parseSseChunk('data: {broken\n').text).toBe('');
    expect(() => parseSseChunk('whatever')).not.toThrow();
  });

  it('流式请求体打开 stream 开关', async () => {
    const { buildRequestBody } = await import('@/utils/chat');
    const noStream = buildRequestBody([{ role: 'user', content: 'hi', at: 1 }], 'gpt', 'sys');
    const withStream = buildRequestBody([{ role: 'user', content: 'hi', at: 1 }], 'gpt', 'sys', true);
    expect(noStream.stream).toBe(false);
    expect(withStream.stream).toBe(true);
    expect(withStream.messages[0]).toEqual({ role: 'system', content: 'sys' });
  });
});
