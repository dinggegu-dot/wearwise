
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  readRecommendationKnowledge,
  parseRecommendationKnowledge
} from '@/modules/recommendation/knowledge';

import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

describe('推荐知识文件', () => {
  let tempDirectory: string | undefined;

  afterEach(async () => {
    if (tempDirectory) {
      await rm(tempDirectory, { recursive: true, force: true });
      tempDirectory = undefined;
    }
    vi.restoreAllMocks();
  });


it('读取正式 V1.2 知识文件', async () => {
  const knowledge = await readRecommendationKnowledge();

  expect(knowledge.version).toBe('V1.2');
  expect(knowledge.rules.length).toBeGreaterThan(0);
  expect(knowledge.rules.length).toBeLessThanOrEqual(100);

  for (const rule of knowledge.rules) {
    expect(rule.length).toBeLessThanOrEqual(500);
    expect(rule.trim().length).toBeGreaterThan(0);
  }

  const allRules = knowledge.rules.join('\n');

  // 检查文档开头、中间和末尾的重要规则
  expect(allRules).toContain(
    'Temperature determines the basic clothing requirements.'
  );

  expect(allRules).toContain(
    'Color coordination is a soft rule.'
  );

  expect(allRules).toContain(
    'Current-round preference and occasion inputs are temporary'
  );

  expect(allRules).toContain('End of Document');

  // 检查规则数量及长度限制
  expect(knowledge.rules.length).toBeLessThanOrEqual(100);
  expect(knowledge.rules.every(rule => rule.length <= 500)).toBe(true);
});


  it('修改知识文件后，下次读取应获得最新内容', async () => {
    tempDirectory = await mkdtemp(
      path.join(os.tmpdir(), 'wearwise-knowledge-')
    );

    const filePath = path.join(tempDirectory, 'OUTFIT-TIPS.md');

    await writeFile(
      filePath,
      '**Version:** V1.2\n\n第一版搭配规则。',
      'utf8'
    );

    const first = await readRecommendationKnowledge(filePath);

    expect(first.version).toBe('V1.2');
    expect(first.rules.join('\n')).toContain('第一版搭配规则');

    await writeFile(
      filePath,
      '**Version:** V1.3\n\n第二版搭配规则。',
      'utf8'
    );

    const second = await readRecommendationKnowledge(filePath);

    expect(second.version).toBe('V1.3');
    expect(second.rules.join('\n')).toContain('第二版搭配规则');
    expect(second.rules.join('\n')).not.toContain('第一版搭配规则');
  });

  it('拒绝缺少版本号的知识文档', () => {
    expect(() =>
      parseRecommendationKnowledge('没有版本信息的知识文档')
    ).toThrow('缺少 Version');
  });

  it('拒绝超过 API 最大规则数量的知识文档', () => {
    const markdown =
      '**Version:** V1.2\n' + 'A'.repeat(50001);

    expect(() => parseRecommendationKnowledge(markdown))
      .toThrow('允许范围为 1–100');
  });

  it('拒绝空知识文档', () => {
    expect(() =>
      parseRecommendationKnowledge('   ')
    ).toThrow('搭配知识文件为空');
  });
});
