import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '@/utils/markdown';

describe('AI 回答 Markdown 渲染', () => {
  it('表格渲染成 thead/tbody，不再是一堆竖线', () => {
    const md = [
      '| 歌曲 | 演唱者 |',
      '| --- | --- |',
      '| The Way | The Strokes |',
      '| Toxic | Britney Spears |'
    ].join('\n');
    const html = renderMarkdown(md);
    expect(html).toContain('<table');
    expect(html).toContain('data-horizontal-scroll');
    expect(html).toContain('<th>歌曲</th>');
    expect(html).toContain('<td>The Way</td>');
    expect(html).toContain('<td>Britney Spears</td>');
    expect(html).not.toContain('| --- |');
  });

  it('无序与有序列表渲染成 ul/ol li', () => {
    expect(renderMarkdown('- 甲\n- 乙\n* 丙')).toContain('<li>甲</li>');
    expect(renderMarkdown('1. 第一\n2. 第二')).toContain('<ol>');
    expect(renderMarkdown('1. 第一\n2. 第二')).toContain('<li>第二</li>');
  });

  it('加粗、斜体、行内代码生效', () => {
    const html = renderMarkdown('这是 **重点**，这是 *斜体*，这是 `code`');
    expect(html).toContain('<strong>重点</strong>');
    expect(html).toContain('<em>斜体</em>');
    expect(html).toContain('<code class="md-inline-code">code</code>');
  });

  it('代码块逐字转义，不执行也不吃掉换行', () => {
    const html = renderMarkdown('```js\nconst a = 1 < 2;\n```');
    expect(html).toContain('<pre');
    expect(html).toContain('const a = 1 &lt; 2;');
  });

  it('防止 HTML 注入：script 标签显示成文字', () => {
    const html = renderMarkdown('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('链接只放行 http/https，javascript 协议降级', () => {
    expect(renderMarkdown('[官网](https://example.com)')).toContain('href="https://example.com"');
    expect(renderMarkdown('[坏链](javascript:alert(1))')).not.toContain('href=');
  });

  it('流式不完整的表格片段也不抛错', () => {
    expect(() => renderMarkdown('| 歌曲 | 演唱者 |')).not.toThrow();
    expect(renderMarkdown('| 歌曲 | 演唱者 |')).toContain('歌曲');
  });

  it('空输入返回空串', () => {
    expect(renderMarkdown('')).toBe('');
    expect(renderMarkdown('   ')).toBe('');
  });

  it('普通中文段落按段落输出', () => {
    const html = renderMarkdown('affect 是动词，意思是影响。');
    expect(html).toContain('<p');
    expect(html).toContain('affect 是动词');
  });
});
