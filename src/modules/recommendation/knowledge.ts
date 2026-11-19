
import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * WearWise 推荐知识文件路径。
 */
export const RECOMMENDATION_KNOWLEDGE_PATH = path.resolve(
  process.cwd(),
  'docs/knowledge/OUTFIT-TIPS.md'
);

/**
 * 第 3 轮 API 知识输入契约。
 */
export interface RecommendationKnowledge {
  version: string;
  rules: string[];
}

const MAX_LENGTH = 500;
const MAX_RULES = 100;

/**
 * 规范化 Markdown 空白。
 * 保留标题、列表、表格结构和正文内容。
 */
function normalizeMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 按单词和换行边界分块。
 *
 * 优先保留完整单词。
 * 保留 Markdown 换行。
 * 每块最多 500 字符。
 */
function splitKnowledge(markdown: string): string[] {
  const content = normalizeMarkdown(markdown);

  if (!content) {
    throw new Error('搭配知识文件为空。');
  }

  const rules: string[] = [];
  let current = '';

  const flush = () => {
    const value = current.trim();

    if (value) {
      rules.push(value);
    }

    current = '';
  };

  const tokens = content.match(/\n|[^\S\n]+|[^\s]+/g) ?? [];

  for (const token of tokens) {
    if (token.length > MAX_LENGTH) {
      flush();

      const characters = Array.from(token);
      let piece = '';

      for (const character of characters) {
        if (piece.length + character.length > MAX_LENGTH) {
          rules.push(piece);
          piece = '';
        }

        piece += character;
      }

      current = piece;
      continue;
    }

    if (current.length + token.length > MAX_LENGTH) {
      flush();
      current = token.trimStart();
    } else {
      current += token;
    }
  }

  flush();

  if (rules.length === 0 || rules.length > MAX_RULES) {
    throw new Error(
      `搭配知识分块数量无效：${rules.length}，允许范围为 1–${MAX_RULES}。`
    );
  }

  if (rules.some(rule => rule.length > MAX_LENGTH)) {
    throw new Error('搭配知识分块超过 API 允许的 500 字符限制。');
  }

  return rules;
}

/**
 * 解析知识文档。
 */
export function parseRecommendationKnowledge(
  markdown: string
): RecommendationKnowledge {
  if (!markdown.trim()) {
    throw new Error('搭配知识文件为空。');
  }

  const versionMatch =
    markdown.match(/\*\*Version:\*\*\s*([^\s]+)/i) ??
    markdown.match(/^\s*Version:\s*(\S+)/im);

  if (!versionMatch) {
    throw new Error('搭配知识文件缺少 Version 版本信息。');
  }

  const version = versionMatch[1].trim();

  if (!version || version.length > 100) {
    throw new Error('搭配知识文件的版本信息无效。');
  }

  return {
    version,
    rules: splitKnowledge(markdown)
  };
}

/**
 * 读取当前最新的搭配知识。
 *
 * 每次调用都重新读取文件，不使用缓存。
 */
export async function readRecommendationKnowledge(
  filePath: string = RECOMMENDATION_KNOWLEDGE_PATH
): Promise<RecommendationKnowledge> {
  let markdown: string;

  try {
    markdown = await readFile(filePath, 'utf8');
  } catch {
    throw new Error(
      '无法读取搭配知识文件，请检查 docs/knowledge/OUTFIT-TIPS.md。'
    );
  }

  return parseRecommendationKnowledge(markdown);
}
