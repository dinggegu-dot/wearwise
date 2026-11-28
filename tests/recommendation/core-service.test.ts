
import {
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

vi.mock('@/modules/recommendation/ai-client', () => ({
  requestAIRecommendation: vi.fn()
}));

import {
  requestAIRecommendation
} from '@/modules/recommendation/ai-client';

import {
  RecommendationCoreService
} from '@/modules/recommendation/core-service';

import type { SettingsDraft } from '@/modules/session';

import type {
  SessionService
} from '@/modules/session';

import type {
  WardrobeService,
  Garment
} from '@/modules/wardrobe';

import type {
  WeatherProvider
} from '@/modules/weather';

import { testGarment } from '../fixtures/recommendation';

const now = new Date('2026-11-18T04:00:00.000Z');

const top = testGarment('top-1', { category: 'top' });
const bottom = testGarment('bottom-1', { category: 'bottom' });
const shoes = testGarment('shoes-1', { category: 'shoes' });

const garments: Garment[] = [top, bottom, shoes];

function createDraft(
  overrides: Partial<SettingsDraft> = {}
): SettingsDraft {
  return {
    memory: false,
    weather: false,
    preference: {
      enabled: false,
      text: '',
      imageIds: [],
      styleTags: []
    },
    scene: {
      enabled: false,
      selected: null, custom: ''
    },
    updatedAt: now.toISOString(),
    ...overrides
  };
}

function createMocks(
  draft = createDraft(),
  longTerm: Array<{
    group: string;
    content: string;
    feedback?: { choice: 'like' | 'dislike' };
  }> = []
) {


const current = {
  id: 'result-1',
  roundId: 'round-1',
  garmentIds: ['top-1', 'bottom-1', 'shoes-1'],
  snapshots: [
    { id: 'top-1', category: 'top' },
    { id: 'bottom-1', category: 'bottom' },
    { id: 'shoes-1', category: 'shoes' }
  ]
};


const session = {
  newRoundContext: vi.fn().mockResolvedValue({
    draft,
    longTerm,
    candidates: garments
  }),

  getSettingsDraft: vi.fn().mockResolvedValue(draft),

  getCity: vi.fn().mockResolvedValue('深圳'),

  commitNewRound: vi.fn().mockResolvedValue({
    roundId: 'round-1'
  }),

  adjustmentContext: vi.fn().mockResolvedValue({
    applied: {
      memory: false,
      weather: null,
      preference: null,
      scene: null,
      appliedAt: now.toISOString()
    },
    current,
    feedback: [],
    longTerm: [],
    candidates: garments
  }),

  commitAdjustment: vi.fn().mockResolvedValue({
    roundId: 'round-1'
  })
};


  const wardrobe = {
    candidates: vi.fn().mockResolvedValue(garments),
    image: vi.fn().mockResolvedValue(undefined)
  };

  const weather = {
    current: vi.fn()
  };

  const service = new RecommendationCoreService({
    session: session as unknown as SessionService,
    wardrobe: wardrobe as unknown as WardrobeService,
    weather: weather as unknown as WeatherProvider,
    now: () => now
  });

  return {
    service,
    session,
    wardrobe,
    weather
  };
}

function mockSuccessfulAI() {
  vi.mocked(requestAIRecommendation).mockResolvedValue({
    garmentIds: ['top-1', 'bottom-1', 'shoes-1'],
    reason: '整体配色协调，适合日常穿着。',
    knowledgeVersion: 'V1.2'
  });
}

describe('RecommendationCoreService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSuccessfulAI();
  });

  it('四项条件全部关闭时，只发送衣橱和基础知识', async () => {
    const mocks = createMocks(
      createDraft({
        memory: false,
        weather: false,
        preference: {
          enabled: false,
          text: '这段文字不能发送',
          imageIds: [],
          styleTags: []
        },
        scene: {
          enabled: false,
          selected: null, custom: '这个场景不能发送'
        }
      })
    );

    await mocks.service.generateNewRound();

    const input = vi.mocked(
      requestAIRecommendation
    ).mock.calls[0][0];

    expect(input.conditions).toEqual({});
    expect(input.wardrobe).toHaveLength(3);

    expect(mocks.weather.current).not.toHaveBeenCalled();
    expect(mocks.wardrobe.image).not.toHaveBeenCalled();

    expect(mocks.session.commitNewRound).toHaveBeenCalledWith(
      expect.objectContaining({
        weather: null,
        result: expect.objectContaining({
          knowledgeVersion: 'V1.2'
        })
      }),
      now
    );
  });

  it('喜好只有固定标签也发送，场景保留固定值与自填', async () => {
    const mocks = createMocks(createDraft({
      preference: { enabled: true, text: '', imageIds: [], styleTags: ['学院风'] },
      scene: { enabled: true, selected: '学习', custom: '图书馆' }
    }));
    await mocks.service.generateNewRound();
    expect(vi.mocked(requestAIRecommendation).mock.calls[0][0].conditions).toEqual({
      preference: { text: '', imageIds: [], styleTags: ['学院风'] },
      scene: { selected: '学习', custom: '图书馆' }
    });
  });

  it.each(['style', 'scene'] as const)('生成期间修改 %s 条件会拒绝提交', async kind => {
    const draft = createDraft();
    const mocks = createMocks(draft);
    mocks.session.getSettingsDraft.mockResolvedValue(kind === 'style'
      ? { ...draft, preference: { ...draft.preference, styleTags: ['学院风'] } }
      : { ...draft, scene: { ...draft.scene, selected: '学习', custom: '图书馆' } });
    await expect(mocks.service.generateNewRound()).rejects.toThrow();
    expect(mocks.session.commitNewRound).not.toHaveBeenCalled();
  });

  it('长期记忆开启时，只发送有效长期偏好', async () => {
    const mocks = createMocks(
      createDraft({ memory: true }),
      [
        {
          group: 'explicit',
          content: '喜欢简约风格'
        },
        {
          group: 'inspiration',
          content: '偏好低饱和度颜色'
        }
      ]
    );

    await mocks.service.generateNewRound();

    const input = vi.mocked(
      requestAIRecommendation
    ).mock.calls[0][0];

    expect(input.conditions.memory).toEqual([
      '【explicit】喜欢简约风格',
      '【inspiration】偏好低饱和度颜色'
    ]);
  });

  it('本次场景关闭时，即使草稿有内容也不发送', async () => {
    const mocks = createMocks(
      createDraft({
        scene: {
          enabled: false,
          selected: null, custom: '正式商务会议'
        }
      })
    );

    await mocks.service.generateNewRound();

    const input = vi.mocked(
      requestAIRecommendation
    ).mock.calls[0][0];

    expect(input.conditions.scene).toBeUndefined();
  });

  it('本次场景开启时发送场景内容', async () => {
    const mocks = createMocks(
      createDraft({
        scene: {
          enabled: true,
          selected: null, custom: '日常通勤'
        }
      })
    );

    await mocks.service.generateNewRound();

    const input = vi.mocked(
      requestAIRecommendation
    ).mock.calls[0][0];

    expect(input.conditions.scene).toEqual({ selected: null, custom: '日常通勤' });
  });

  it('本次喜好开启时发送用户最终确认的文字', async () => {
    const mocks = createMocks(
      createDraft({
        preference: {
          enabled: true,
          text: '喜欢简约、低饱和度搭配',
          imageIds: [],
          styleTags: []
        }
      })
    );

    await mocks.service.generateNewRound();

    const input = vi.mocked(
      requestAIRecommendation
    ).mock.calls[0][0];

    expect(input.conditions.preference).toEqual({
      text: '喜欢简约、低饱和度搭配',
      imageIds: [],
      styleTags: []
    });
  });


it('喜好开启且有参考图时，读取 Blob 并传给 AI', async () => {
  const mocks = createMocks(
    createDraft({
      preference: {
        enabled: true,
        text: '喜欢简约风格',
        imageIds: ['reference-1'],
        styleTags: []
      }
    })
  );

  const image = new Blob(
    ['test reference image'],
    { type: 'image/jpeg' }
  );

  mocks.wardrobe.image.mockResolvedValue(image);

  await mocks.service.generateNewRound();

  expect(mocks.wardrobe.image).toHaveBeenCalledWith(
    'reference-1'
  );

  const input = vi.mocked(
    requestAIRecommendation
  ).mock.calls[0][0];

  expect(input.conditions.preference).toEqual({
    text: '喜欢简约风格',
    imageIds: ['reference-1'],
    styleTags: []
  });

  expect(input.referenceImages?.get('reference-1')).toBe(image);
});


it('天气关闭时不调用天气服务', async () => {
  const mocks = createMocks(
    createDraft({ weather: false })
  );

  await mocks.service.generateNewRound();

  expect(mocks.weather.current).not.toHaveBeenCalled();

  const input = vi.mocked(
    requestAIRecommendation
  ).mock.calls[0][0];

  expect(input.conditions.weather).toBeUndefined();
});

it('天气开启时获取真实天气并传入 AI', async () => {
  const mocks = createMocks(
    createDraft({ weather: true })
  );

  mocks.weather.current.mockResolvedValue({
    city: '深圳',
    temperature: 24,
    apparentTemperature: 23,
    temperatureMin: 19,
    temperatureMax: 28,
    weatherCode: 2,
    dataTime: '2026-11-18T04:00:00.000Z',
    fetchedAt: now.toISOString(),
    example: false,
    source: 'open-meteo'
  });

  await mocks.service.generateNewRound();

  expect(mocks.weather.current).toHaveBeenCalledWith(
    '深圳',
    undefined
  );

  const input = vi.mocked(
    requestAIRecommendation
  ).mock.calls[0][0];

  expect(input.conditions.weather).toMatchObject({
    city: '深圳',
    date: '2026-11-18',
    temperature: 24,
    apparentTemperature: 23,
    temperatureMin: 19,
    temperatureMax: 28,
    source: 'open-meteo'
  });

  expect(input.conditions.weather?.usedFields).toContain(
    'apparentTemperature'
  );
});


  it('AI 生成失败时不提交新轮', async () => {
    const mocks = createMocks();

    vi.mocked(requestAIRecommendation).mockRejectedValue(
      new Error('模拟 AI 失败')
    );

    await expect(
      mocks.service.generateNewRound()
    ).rejects.toThrow('模拟 AI 失败');

    expect(mocks.session.commitNewRound).not.toHaveBeenCalled();
  });

  it('没有完整衣橱时不调用 AI，也不保存结果', async () => {
    const incompleteGarments = [top, shoes];

    const mocks = createMocks();

    mocks.session.newRoundContext.mockResolvedValue({
      draft: createDraft(),
      longTerm: [],
      candidates: incompleteGarments
    });

    await expect(
      mocks.service.generateNewRound()
    ).resolves.toMatchObject({
      status: 'insufficient-wardrobe'
    });

    expect(requestAIRecommendation).not.toHaveBeenCalled();
    expect(mocks.session.commitNewRound).not.toHaveBeenCalled();
  });


it('换整套成功时保存不同组合，并保留当前轮次', async () => {
  const mocks = createMocks();

  const newTop = testGarment('top-2', {
    category: 'top'
  });

  mocks.wardrobe.candidates.mockResolvedValue([
    top,
    bottom,
    shoes,
    newTop
  ]);

  vi.mocked(requestAIRecommendation).mockResolvedValue({
    garmentIds: ['top-2', 'bottom-1', 'shoes-1'],
    reason: '更换上衣后形成不同风格。',
    knowledgeVersion: 'V1.2'
  });

  const result = await mocks.service.swapOutfit();

  expect(result.status).toBe('committed');

  expect(mocks.session.commitAdjustment).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedRoundId: 'round-1',
      kind: 'swap-outfit',
      result: expect.objectContaining({
        garmentIds: ['top-2', 'bottom-1', 'shoes-1'],
        knowledgeVersion: 'V1.2'
      })
    }),
    now
  );

  expect(mocks.session.commitNewRound).not.toHaveBeenCalled();

  const input = vi.mocked(
    requestAIRecommendation
  ).mock.calls[0][0];

  expect(input.operation).toEqual({
    kind: 'swap-outfit',
    currentGarmentIds: ['top-1', 'bottom-1', 'shoes-1']
  });
});


it('AI 返回原组合时不保存调整', async () => {
  const mocks = createMocks();

  vi.mocked(requestAIRecommendation).mockResolvedValue({
    garmentIds: ['shoes-1', 'top-1', 'bottom-1'],
    reason: '原有搭配。',
    knowledgeVersion: 'V1.2'
  });

  const result = await mocks.service.swapOutfit();

  expect(result.status).toBe('no-alternative');

  expect(mocks.session.commitAdjustment).not.toHaveBeenCalled();
});


it('没有当前搭配时不调用 AI', async () => {
  const mocks = createMocks();

  mocks.session.adjustmentContext.mockResolvedValue({
    applied: {
      memory: false,
      weather: null,
      preference: null,
      scene: null,
      appliedAt: now.toISOString()
    },
    current: undefined,
    feedback: [],
    longTerm: [],
    candidates: garments
  });

  const result = await mocks.service.swapOutfit();

  expect(result.status).toBe('no-current-outfit');

  expect(requestAIRecommendation).not.toHaveBeenCalled();

  expect(mocks.session.commitAdjustment).not.toHaveBeenCalled();
});


it('换单件成功，只改变指定上衣', async () => {
  const mocks = createMocks();
  const newTop = testGarment('top-2', { category: 'top' });

  mocks.wardrobe.candidates.mockResolvedValue([
    top, bottom, shoes, newTop
  ]);

  vi.mocked(requestAIRecommendation).mockResolvedValue({
    garmentIds: ['top-2', 'bottom-1', 'shoes-1'],
    reason: '替换上衣后整体配色协调。',
    knowledgeVersion: 'V1.2'
  });

  const result = await mocks.service.swapItem('top-1');

  expect(result.status).toBe('committed');

  expect(mocks.session.commitAdjustment).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedRoundId: 'round-1',
      kind: 'swap-item',
      targetGarmentId: 'top-1',
      result: expect.objectContaining({
        garmentIds: ['top-2', 'bottom-1', 'shoes-1']
      })
    }),
    now
  );

  expect(mocks.session.commitNewRound).not.toHaveBeenCalled();

  const input = vi.mocked(
    requestAIRecommendation
  ).mock.calls[0][0];

  expect(input.operation).toEqual({
    kind: 'swap-item',
    currentGarmentIds: ['top-1', 'bottom-1', 'shoes-1'],
    targetGarmentId: 'top-1',
    targetCategory: 'top',
    keptGarments: [{ id: 'bottom-1', category: 'bottom' }, { id: 'shoes-1', category: 'shoes' }]
  });
});

it('没有同类别替代衣物时保留原结果', async () => {
  const mocks = createMocks();

  const result = await mocks.service.swapItem('top-1');

  expect(result.status).toBe('no-alternative');
  expect(requestAIRecommendation).not.toHaveBeenCalled();
  expect(mocks.session.commitAdjustment).not.toHaveBeenCalled();
});

it('AI 同时修改上衣和裤子时拒绝保存', async () => {
  const mocks = createMocks();

  const newTop = testGarment('top-2', { category: 'top' });
  const newBottom = testGarment('bottom-2', { category: 'bottom' });

  mocks.wardrobe.candidates.mockResolvedValue([
    top, bottom, shoes, newTop, newBottom
  ]);

  vi.mocked(requestAIRecommendation).mockResolvedValue({
    garmentIds: ['top-2', 'bottom-2', 'shoes-1'],
    reason: '模型错误地替换了两件衣物。',
    knowledgeVersion: 'V1.2'
  });

  await expect(
    mocks.service.swapItem('top-1')
  ).rejects.toMatchObject({
    code: 'AI_INVALID_SWAP_ITEM'
  });

  expect(mocks.session.commitAdjustment).not.toHaveBeenCalled();
});

it('指定衣物不属于当前搭配时拒绝替换', async () => {
  const mocks = createMocks();

  await expect(
    mocks.service.swapItem('not-in-current')
  ).rejects.toMatchObject({
    code: 'INVALID_TARGET'
  });

  expect(requestAIRecommendation).not.toHaveBeenCalled();
  expect(mocks.session.commitAdjustment).not.toHaveBeenCalled();
});


  it('反馈后换整套使用已保存反馈，并沿用当前轮次', async () => {
    const mocks = createMocks();

    const originalContext =
      await mocks.session.adjustmentContext();

    mocks.session.adjustmentContext.mockResolvedValue({
      ...originalContext,
      feedback: [
        {
          id: 'feedback-1',
          order: 1,
          choice: 'dislike',
          reason: '不喜欢颜色太鲜艳'
        },
        {
          id: 'feedback-2',
          order: 2,
          choice: 'like',
          reason: '希望改成简约的深色搭配'
        }
      ]
    });

    const newTop = testGarment('top-2', {
      category: 'top'
    });

    mocks.wardrobe.candidates.mockResolvedValue([
      top, bottom, shoes, newTop
    ]);

    vi.mocked(requestAIRecommendation).mockResolvedValue({
      garmentIds: ['top-2', 'bottom-1', 'shoes-1'],
      reason: '根据用户反馈调整为简约搭配。',
      knowledgeVersion: 'V1.2'
    });

    const result = await mocks.service.feedbackSwap();

    expect(result.status).toBe('committed');

    const input = vi.mocked(
      requestAIRecommendation
    ).mock.calls[0][0];

    expect(input.operation?.kind).toBe('feedback-swap');

    expect(input.conditions.feedback).toEqual([
      {
        choice: 'dislike',
        reason: '不喜欢颜色太鲜艳'
      },
      {
        choice: 'like',
        reason: '希望改成简约的深色搭配'
      }
    ]);

    expect(mocks.session.commitAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRoundId: 'round-1',
        kind: 'feedback-swap'
      }),
      now
    );

    expect(mocks.session.commitNewRound).not.toHaveBeenCalled();
  });

  it('不喜欢但原因为空，反馈后换整套仍然使用该反馈', async () => {
  const mocks = createMocks();

  const originalContext =
    await mocks.session.adjustmentContext();

  mocks.session.adjustmentContext.mockResolvedValue({
    ...originalContext,
    feedback: [
      {
        id: 'feedback-empty-1',
        order: 1,
        choice: 'dislike',
        reason: ''
      }
    ]
  });

  const newTop = testGarment('top-2', {
    category: 'top'
  });

  mocks.wardrobe.candidates.mockResolvedValue([
    top,
    bottom,
    shoes,
    newTop
  ]);

  vi.mocked(requestAIRecommendation).mockResolvedValue({
    garmentIds: ['top-2', 'bottom-1', 'shoes-1'],
    reason: '根据用户不喜欢的反馈调整搭配。',
    knowledgeVersion: 'V1.2'
  });

  const result = await mocks.service.feedbackSwap();

  expect(result.status).toBe('committed');

  const input = vi.mocked(
    requestAIRecommendation
  ).mock.calls[0][0];

  expect(input.conditions.feedback).toEqual([
    {
      choice: 'dislike',
      reason: ''
    }
  ]);
});

  it('没有有效反馈时不执行反馈后换整套', async () => {
    const mocks = createMocks();

    const result = await mocks.service.feedbackSwap();

    expect(result.status).toBe('no-feedback');
    expect(requestAIRecommendation).not.toHaveBeenCalled();
    expect(mocks.session.commitAdjustment).not.toHaveBeenCalled();
  });

  it('换整套生成期间衣物被暂停时拒绝提交', async () => {
    const mocks = createMocks();

    const newTop = testGarment('top-2', {
      category: 'top'
    });

    // 第一次读取时上衣可以用，第二次已不可用。
    mocks.wardrobe.candidates
      .mockResolvedValueOnce([top, bottom, shoes, newTop])
      .mockResolvedValueOnce([top, bottom, shoes]);

    vi.mocked(requestAIRecommendation).mockResolvedValue({
      garmentIds: ['top-2', 'bottom-1', 'shoes-1'],
      reason: '新搭配',
      knowledgeVersion: 'V1.2'
    });

    await expect(
      mocks.service.swapOutfit()
    ).rejects.toMatchObject({
      code: 'AI_INVALID_RESPONSE'
    });

    expect(mocks.session.commitAdjustment).not.toHaveBeenCalled();
  });
it('不喜欢但原因为空，换单件仍然使用该反馈', async () => {
  const mocks = createMocks();

  const originalContext =
    await mocks.session.adjustmentContext();

  mocks.session.adjustmentContext.mockResolvedValue({
    ...originalContext,
    feedback: [
      {
        id: 'feedback-empty-2',
        order: 1,
        choice: 'dislike',
        reason: ''
      }
    ]
  });

  const newTop = testGarment('top-2', {
    category: 'top'
  });

  mocks.wardrobe.candidates.mockResolvedValue([
    top,
    bottom,
    shoes,
    newTop
  ]);

  vi.mocked(requestAIRecommendation).mockResolvedValue({
    garmentIds: ['top-2', 'bottom-1', 'shoes-1'],
    reason: '根据用户反馈替换上衣。',
    knowledgeVersion: 'V1.2'
  });

  const result = await mocks.service.swapItem('top-1');

  expect(result.status).toBe('committed');

  const input = vi.mocked(
    requestAIRecommendation
  ).mock.calls[0][0];

  expect(input.conditions.feedback).toEqual([
    {
      choice: 'dislike',
      reason: ''
    }
  ]);
});

});
