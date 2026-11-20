/**
 * 轻量 Markdown → HTML 渲染，专给 AI 回答气泡用。
 *
 * 只实现聊天里真正会用到的几种：表格、列表、加粗、斜体、行内代码、代码块、
 * 引用、标题、分隔线、链接。不引第三方库，保持打包体积和可控性。
 *
 * 安全：先把原文里的 HTML 全部转义，再套我们自己的标签，
 * 这样模型即使吐出 <script> 也只会显示成文字，不会执行。
 * 链接只放行 http/https，其他协议（javascript: 等）降级成纯文字。
 */

/** 转义 HTML 特殊字符，防止模型输出被当成标签执行 */
function escapeHtml(raw: string): string {
  return String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 只保留安全协议的链接地址 */
function safeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed) || /^\//.test(trimmed)) return trimmed;
  return null;
}

/**
 * 行内元素：加粗、斜体、行内代码、链接。
 * 输入必须是已转义的 HTML 字符串。
 * 用占位符保护行内代码，避免代码里的 * 被当成加粗处理。
 */
function inline(escaped: string): string {
  const codeStore: string[] = [];
  let text = escaped.replace(/`([^`]+)`/g, (_m, code: string) => {
    codeStore.push(`<code class="md-inline-code">${code}</code>`);
    return `\u0000CODE${codeStore.length - 1}\u0000`;
  });

  // 链接 [文字](地址)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label: string, url: string) => {
    const safe = safeUrl(url);
    return safe ? `<a href="${safe}" target="_blank" rel="noopener">${label}</a>` : match;
  });
  // 加粗 **x**
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // 斜体 *x* 或 _x_
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(/(^|[^\w])_([^_]+)_/g, '$1<em>$2</em>');

  // 还原行内代码
  text = text.replace(/\u0000CODE(\d+)\u0000/g, (_m, i: string) => codeStore[Number(i)] ?? '');
  return text;
}

/** 表格分隔行是否合法：| --- | :---: | 这种形式 */
function isTableDivider(line: string): boolean {
  const cells = line.trim().replace(/^\||\|$/g, '').split('|');
  if (!cells.length) return false;
  return cells.every((cell) => /^:?-{2,}:?$/.test(cell.trim()));
}

/** 把一行表格按 | 拆成单元格（去掉首尾空管道） */
function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => inline(escapeHtml(cell.trim())));
}

/** 查一段连续的 unordered/ordered 列表，渲染成 <ul>/<ol> */
function renderList(lines: string[], start: number, ordered: boolean): { html: string; next: number } {
  const tag = ordered ? 'ol' : 'ul';
  const items: string[] = [];
  let i = start;
  const pattern = ordered ? /^\s*\d+[\.、\)]\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/;
  while (i < lines.length) {
    const match = pattern.exec(lines[i]);
    if (!match) break;
    items.push(`<li>${inline(escapeHtml(match[1]))}</li>`);
    i += 1;
  }
  return { html: `<${tag}>${items.join('')}</${tag}>`, next: i };
}

/**
 * 把一段 Markdown 文本渲染成 HTML 字符串。
 * 流式输出时会被反复调用（每次 token 更新），保证对不完整片段也不抛错。
 */
export function renderMarkdown(text: string): string {
  if (!text || !text.trim()) return '';
  const lines = String(text).split(/\r?\n/);
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 代码块 ```
    if (/^\s*```/.test(line)) {
      const lang = line.trim().replace(/^```/, '').trim();
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1; // 跳过收尾 ```
      const label = lang && /^[\w+-]+$/.test(lang) ? ` data-lang="${lang}"` : '';
      out.push(`<pre class="md-pre"${label}><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // 表格：当前行是表格行，且下一行是分隔行
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const head = tableCells(line);
      i += 2; // 跳过表头和分隔行
      const body: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        body.push(tableCells(lines[i]));
        i += 1;
      }
      const headHtml = head.map((cell) => `<th>${cell}</th>`).join('');
      const bodyHtml = body
        .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`)
        .join('');
      out.push(`<table class="md-table" data-horizontal-scroll><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`);
      continue;
    }

    // 无序列表
    if (/^\s*[-*+]\s+/.test(line)) {
      const list = renderList(lines, i, false);
      out.push(list.html);
      i = list.next;
      continue;
    }

    // 有序列表
    if (/^\s*\d+[\.、\)]\s+/.test(line)) {
      const list = renderList(lines, i, true);
      out.push(list.html);
      i = list.next;
      continue;
    }

    // 引用（把连续的 > 行合成一段）
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote class="md-quote">${inline(escapeHtml(buf.join('\n')))}</blockquote>`);
      continue;
    }

    // 标题 #
    const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level} class="md-h">${inline(escapeHtml(heading[2]))}</h${level}>`);
      i += 1;
      continue;
    }

    // 分隔线
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push('<hr class="md-hr" />');
      i += 1;
      continue;
    }

    // 空行
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // 普通段落：把连续的普通文本行合并，空行分段
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*(```|\||>|#{1,6}\s|[-*+]\s|\d+[\.、\)]\s)/.test(lines[i]) &&
      !/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    if (para.length) {
      out.push(`<p class="md-p">${inline(escapeHtml(para.join('\n')))}</p>`);
    } else {
      // 兜底：避免死循环（理论上不会走到）
      out.push(`<p class="md-p">${inline(escapeHtml(line))}</p>`);
      i += 1;
    }
  }

  return out.join('');
}
