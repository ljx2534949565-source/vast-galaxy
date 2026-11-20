#!/usr/bin/env node

/**
 * 词库校验与分片合并工具
 *
 * 数据来源：用户提供的《英语.xlsx》精简版工作表，10 个 Unit × 4 个 Lesson，共 40 课 2931 词。
 *
 * 用法：
 *   node scripts/expandWords.mjs            校验 src/data/wordsData.js
 *   node scripts/expandWords.mjs --check    只校验，不写文件
 *   node scripts/expandWords.mjs --merge   发现分片时合并生成 wordsData.js
 *   node scripts/expandWords.mjs --help     显示帮助
 *
 * 扩充词库的分片方案：
 *   1. 新建 src/data/words/unit01.js … unit20.js，每个文件 export default [ ... ]，
 *      文件内所有词条的 unit 必须等于文件名编号。
 *   2. 每批建议 200-300 词，写完一个 Unit 再写下一个，避免单文件过大。
 *   3. 运行 node scripts/expandWords.mjs --merge，脚本按 Unit 排序、按 id 重排，
 *      生成单一 wordsData.js 供 uni-app 直接 import。
 *   4. id 必须从 1 开始严格连续，单词不得重复；释义允许重复（干扰项生成时会自动去重）。
 *   5. phonetic 可以为空字符串（本词库原表未提供音标），有音标时必须写成 /.../。
 */

import { access, readdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(scriptPath), '..');
const fragmentsDir = path.join(rootDir, 'src', 'data', 'words');
const outputPath = path.join(rootDir, 'src', 'data', 'wordsData.js');
const maxMeaningLength = 24;
const targetWords = 5500;

const usage = `用法：node scripts/expandWords.mjs [--check | --merge]

无参数   校验当前 wordsData.js；存在分片时一并校验并提示。
--check  只校验，绝不写文件。
--merge  校验分片并合并生成 src/data/wordsData.js。
--help   显示本帮助。`;

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function locationOf(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function lengthOf(text) {
  return Array.from(text).length;
}

function validate(entries, { checkSequence = true } = {}) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(entries) || entries.length === 0) {
    return { errors: ['词条必须是非空数组。'], warnings };
  }

  const words = new Map();
  const ids = new Map();
  const meanings = new Map();
  const required = ['id', 'word', 'phonetic', 'pos', 'meaning', 'unit', 'lesson'];

  entries.forEach((entry, index) => {
    const label = `第 ${index + 1} 条`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${label}必须是对象。`);
      return;
    }
    for (const field of required) {
      if (!Object.hasOwn(entry, field)) {
        errors.push(`${label}（${entry.word || '未知'}）缺少字段 ${field}。`);
      }
    }
    if (!Number.isInteger(entry.id) || entry.id < 1) {
      errors.push(`${label}（${entry.word || '未知'}）的 id 必须是正整数。`);
    } else if (ids.has(entry.id)) {
      errors.push(`id ${entry.id} 重复：${ids.get(entry.id)} 与 ${entry.word || label}。`);
    } else {
      ids.set(entry.id, entry.word || label);
    }
    if (typeof entry.word !== 'string' || !/^[A-Za-z][A-Za-z '\-]*$/.test(entry.word)) {
      errors.push(`${label}的 word 不是有效英文单词：${entry.word}`);
    } else if (words.has(entry.word.toLowerCase())) {
      errors.push(`单词 ${entry.word} 重复（第 ${words.get(entry.word.toLowerCase())} 条与第 ${index + 1} 条）。`);
    } else {
      words.set(entry.word.toLowerCase(), index + 1);
    }
    if (typeof entry.phonetic !== 'string') {
      errors.push(`${label}（${entry.word || '未知'}）的 phonetic 必须是字符串。`);
    } else if (entry.phonetic !== '' && !/^\/[^/\r\n]+\/$/.test(entry.phonetic)) {
      errors.push(`${label}（${entry.word}）的 phonetic 必须为空或由斜线包围。`);
    }
    if (typeof entry.pos !== 'string' || entry.pos.trim() === '') {
      errors.push(`${label}（${entry.word || '未知'}）的 pos 不能为空。`);
    }
    if (typeof entry.meaning !== 'string' || entry.meaning.trim() === '') {
      errors.push(`${label}（${entry.word || '未知'}）的 meaning 不能为空。`);
    } else {
      const size = lengthOf(entry.meaning);
      if (size > maxMeaningLength) {
        errors.push(`${label}（${entry.word}）的释义 ${size} 字，超过 ${maxMeaningLength} 字。`);
      }
      if (meanings.has(entry.meaning)) {
        warnings.push(`释义「${entry.meaning}」同时用于 ${meanings.get(entry.meaning)} 和 ${entry.word}，干扰项会跳过重复释义。`);
      } else {
        meanings.set(entry.meaning, entry.word);
      }
    }
    if (!Number.isInteger(entry.unit) || entry.unit < 1 || entry.unit > 10) {
      errors.push(`${label}（${entry.word || '未知'}）的 unit 必须是 1-10 的整数。`);
    }
    if (!Number.isInteger(entry.lesson) || entry.lesson < 1 || entry.lesson > 40) {
      errors.push(`${label}（${entry.word || '未知'}）的 lesson 必须是 1-40 的整数。`);
    } else if (Number.isInteger(entry.unit) && Math.ceil(entry.lesson / 4) !== entry.unit) {
      errors.push(
        `${label}（${entry.word}）的 lesson ${entry.lesson} 应属于 Unit ${Math.ceil(entry.lesson / 4)}，与 unit ${entry.unit} 不一致。`
      );
    }
  });

  if (checkSequence) {
    [...entries]
      .sort((a, b) => (a?.id ?? 0) - (b?.id ?? 0))
      .forEach((entry, index) => {
        if (entry?.id !== index + 1) {
          errors.push(`id 必须从 1 连续递增；排序后第 ${index + 1} 条实际为 ${entry?.id}。`);
        }
      });

    const units = new Map();
    for (const entry of entries) {
      if (Number.isInteger(entry?.unit)) units.set(entry.unit, (units.get(entry.unit) || 0) + 1);
    }
    [...units.keys()]
      .sort((a, b) => a - b)
      .forEach((unit, index) => {
        if (unit !== index + 1) {
          errors.push(`Unit 必须从 1 连续；期望 Unit ${index + 1}，实际为 Unit ${unit}。`);
        }
      });
  }

  return { errors, warnings };
}

async function loadDefaultArray(filePath) {
  const module = await import(`${pathToFileURL(filePath).href}?t=${Date.now()}`);
  if (!Array.isArray(module.default)) {
    throw new Error(`${locationOf(filePath)} 必须用 export default 导出数组。`);
  }
  return module.default;
}

async function loadTotalFile() {
  if (!(await exists(outputPath))) return null;
  const module = await import(`${pathToFileURL(outputPath).href}?t=${Date.now()}`);
  const list = Array.isArray(module.words) ? module.words : module.default;
  if (!Array.isArray(list)) {
    throw new Error(`${locationOf(outputPath)} 必须导出 words 数组。`);
  }
  return list;
}

async function loadFragments() {
  if (!(await exists(fragmentsDir))) return null;
  const fileNames = (await readdir(fragmentsDir)).filter((name) => /^unit\d{2}\.js$/.test(name)).sort();
  if (fileNames.length === 0) return null;

  const merged = [];
  const seenUnits = new Map();
  for (const fileName of fileNames) {
    const fileUnit = Number(fileName.slice(4, 6));
    const entries = await loadDefaultArray(path.join(fragmentsDir, fileName));
    const { errors } = validate(entries, { checkSequence: false });
    entries.forEach((entry, index) => {
      if (entry?.unit !== fileUnit) {
        errors.push(`${fileName} 第 ${index + 1} 条 unit 应为 ${fileUnit}，实际为 ${entry?.unit}。`);
      }
    });
    if (errors.length > 0) {
      throw new Error(`${fileName} 校验失败：\n- ${errors.join('\n- ')}`);
    }
    if (seenUnits.has(fileUnit)) {
      throw new Error(`Unit ${fileUnit} 同时出现在 ${seenUnits.get(fileUnit)} 和 ${fileName}。`);
    }
    seenUnits.set(fileUnit, fileName);
    merged.push(...entries);
  }
  console.log(`发现 ${fileNames.length} 个分片：${fileNames.join('、')}。`);
  return merged;
}

function serialize(entries) {
  const units = [...new Set(entries.map((entry) => entry.unit))].sort((a, b) => a - b);
  const lines = [
    '// 本文件由 scripts/expandWords.mjs 生成，请修改对应 Unit 分片后重新合并。',
    `// 当前共 ${entries.length} 词，${units.length} 个 Unit；长期目标 ${targetWords} 词。`,
    '',
    'export const words = ['
  ];
  units.forEach((unit, unitIndex) => {
    lines.push(`  // Unit ${unit}`);
    const group = entries.filter((entry) => entry.unit === unit).sort((a, b) => a.id - b.id);
    group.forEach((entry, index) => {
      const comma = unitIndex === units.length - 1 && index === group.length - 1 ? '' : ',';
      lines.push(
        `  { id: ${entry.id}, word: ${JSON.stringify(entry.word)}, phonetic: ${JSON.stringify(entry.phonetic)}, ` +
          `pos: ${JSON.stringify(entry.pos)}, meaning: ${JSON.stringify(entry.meaning)}, unit: ${entry.unit}, lesson: ${entry.lesson} }${comma}`
      );
    });
    if (unitIndex < units.length - 1) lines.push('');
  });
  lines.push('];', '', `export const totalWords = ${entries.length};`, '', 'export default words;', '');
  return lines.join('\n');
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage);
    return;
  }
  const unknown = argv.filter((arg) => !['--check', '--merge'].includes(arg));
  if (unknown.length > 0) {
    throw new Error(`未知参数：${unknown.join('、')}\n${usage}`);
  }

  const fragments = await loadFragments();
  const total = await loadTotalFile();

  if (fragments && argv.includes('--merge')) {
    const { errors, warnings } = validate(fragments);
    if (errors.length > 0) {
      throw new Error(`分片合并校验失败：\n- ${errors.join('\n- ')}`);
    }
    const merged = [...fragments].sort((a, b) => a.id - b.id);
    await writeFile(outputPath, serialize(merged), 'utf8');
    console.log(`已生成 ${locationOf(outputPath)}：${merged.length} 词，${new Set(merged.map((e) => e.unit)).size} 个 Unit。`);
    warnings.slice(0, 5).forEach((warning) => console.warn(`提示：${warning}`));
    return;
  }

  const source = fragments ?? total;
  if (!source) {
    throw new Error('未找到词库：请提供 src/data/wordsData.js 或 src/data/words/unitXX.js。');
  }

  const { errors, warnings } = validate(source);
  if (errors.length > 0) {
    throw new Error(`词库校验失败（${errors.length} 项）：\n- ${errors.slice(0, 20).join('\n- ')}`);
  }

  const units = new Map();
  for (const entry of source) units.set(entry.unit, (units.get(entry.unit) || 0) + 1);
  const distribution = [...units.entries()].sort((a, b) => a[0] - b[0]).map(([unit, count]) => `U${unit}:${count}`).join(' ');
  const emptyPhonetic = source.filter((entry) => entry.phonetic === '').length;

  console.log(`校验通过：${source.length} 词 / ${units.size} 个 Unit。`);
  console.log(`分布：${distribution}`);
  console.log(`音标：${source.length - emptyPhonetic} 条有音标，${emptyPhonetic} 条为空。`);
  if (source.length < targetWords) {
    console.log(`距离长期目标 ${targetWords} 词还差 ${targetWords - source.length} 词。`);
  }
  warnings.slice(0, 8).forEach((warning) => console.warn(`提示：${warning}`));
  if (warnings.length > 8) console.warn(`提示：另有 ${warnings.length - 8} 条同类提示已省略。`);
  if (argv.includes('--check')) console.log('仅校验模式：未写入任何文件。');
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(`错误：${error.message}`);
    process.exitCode = 1;
  });
}
