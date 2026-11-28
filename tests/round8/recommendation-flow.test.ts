
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

import type {
  SessionService,
  SettingsDraft
} from '@/modules/session';

import type {
  WardrobeService
} from '@/modules/wardrobe';

import type {
  WeatherProvider
} from '@/modules/weather';

import {
  testGarment
} from '../fixtures/recommendation';

const now = new Date(
  '2026-11-26T04:00:00.000Z'
);

const garments = [
  testGarment('top-1', { category: 'top' }),
  testGarment('top-2', { category: 'top' }),
  testGarment('bottom-1', { category: 'bottom' }),
  testGarment('bottom-2', { category: 'bottom' }),
  testGarment('shoes-1', { category: 'shoes' }),
  testGarment('shoes-2', { category: 'shoes' })
];

function createMocks() {
  const draft: SettingsDraft = {
    memory: false,
    weather: false,
    preference: {
      enabled: false,
      text: '尚未应用的喜好',
      imageIds: [],
      styleTags: []
    },
    scene: {
      enabled: false,
      selected: null,
      custom: '尚未应用的场景'
    },
    updatedAt: now.toISOString()
  };

  const current = {
    id: 'result-1',
    roundId: 'round-1',
    garmentIds: [
      'top-1',
      'bottom-1',
      'shoes-1'
    ],
    snapshots: [
      { id: 'top-1', imageId: 'img-top-1', category: 'top' },
      { id: 'bottom-1', imageId: 'img-bottom-1', category: 'bottom' },
      { id: 'shoes-1', imageId: 'img-shoes-1', category: 'shoes' }
    ]
  };

  const context = {
    applied: {
      memory: true,
      weather: null,
      preference: {
        text: '喜欢简约搭配',
        imageIds: [],
        styleTags: ['简约风']
      },
      scene: {
        selected: '上班',
        custom: ''
      },
      appliedAt: now.toISOString()
    },

    current,

    feedback: [
      {
        id: 'feedback-1',
        order: 1,
        choice: 'dislike',
        reason: '不喜欢黑色'
      },
      {
        id: 'feedback-2',
        order: 2,
        choice: 'like',
        reason: ''
      }
    ],

    longTerm: [
      {
        group: 'explicit',
        content: '喜欢低饱和度配色'
      }
    ],

    candidates: garments
  };

  const session = {
    getSettingsDraft:
      vi.fn().mockResolvedValue(draft),

    newRoundContext:
      vi.fn().mockResolvedValue({
        draft,
        candidates: garments,
        longTerm: []
      }),

    adjustmentContext:
      vi.fn().mockResolvedValue(context),

    commitNewRound:
      vi.fn().mockResolvedValue({
        roundId: 'round-2'
      }),

    commitAdjustment:
      vi.fn().mockResolvedValue({
        roundId: 'round-1'
      }),

    getCity:
      vi.fn().mockResolvedValue('深圳'),

    homeContext:
      vi.fn().mockResolvedValue({
        candidates: garments,
        longTerm: [
          {
            group: 'explicit',
            content: '喜欢低饱和度配色'
          }
        ]
      }),

    readHome: vi.fn().mockResolvedValue({}),
    commitHome:
      vi.fn().mockResolvedValue({
        currentResultId: 'home-result-1'
      })
  };

  const wardrobe = {
    candidates:
      vi.fn().mockResolvedValue(garments),

    image: vi.fn().mockResolvedValue(new Blob(['image']))
  };

  const weather = {
    current: vi.fn().mockResolvedValue({
      city: '深圳',
      temperature: 20,
      apparentTemperature: 19,
      temperatureMin: 17,
      temperatureMax: 23,
      weatherCode: 2,
      dataTime: now.toISOString(),
      fetchedAt: now.toISOString(),
      example: false,
      source: 'open-meteo'
    })
  };

  const service =
    new RecommendationCoreService({
      session:
        session as unknown as SessionService,

      wardrobe:
        wardrobe as unknown as WardrobeService,

      weather:
        weather as unknown as WeatherProvider,

      now: () => now
    });

  return {
    service,
    session,
    wardrobe,
    weather,
    context,
    draft
  };
}

const ai = vi.mocked(requestAIRecommendation);

describe('R08 推荐连续业务流程', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    ai.mockResolvedValue({
      garmentIds: [
        'top-2',
        'bottom-1',
        'shoes-1'
      ],
      reason: '根据当前条件调整搭配。',
      knowledgeVersion: 'V1.2'
    });
  });

  it('修改左侧草稿后，换一套仍使用已应用条件', async () => {
    const { service, session } = createMocks();

    const result = await service.swapOutfit();

    expect(result.status).toBe('committed');

    const input = ai.mock.calls[0][0];

    expect(input.conditions.preference).toEqual({
      text: '喜欢简约搭配',
      imageIds: [],
      styleTags: ['简约风']
    });

    expect(input.conditions.scene).toEqual({
      selected: '上班',
      custom: ''
    });

    expect(input.conditions.memory).toEqual([
      '【explicit】喜欢低饱和度配色'
    ]);

    expect(
      session.getSettingsDraft
    ).not.toHaveBeenCalled();

    expect(
      session.commitNewRound
    ).not.toHaveBeenCalled();
  });

  it('普通换一套继续携带本轮有效反馈', async () => {
    const { service, session } = createMocks();

    await service.swapOutfit();

    expect(
      ai.mock.calls[0][0].conditions.feedback
    ).toEqual([
      {
        choice: 'dislike',
        reason: '不喜欢黑色'
      },
      {
        choice: 'like',
        reason: ''
      }
    ]);

    expect(
      session.commitAdjustment
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRoundId: 'round-1',
        kind: 'swap-outfit'
      }),
      now
    );
  });

  it('长期记忆关闭时，本轮反馈仍参与调整', async () => {
    const {
      service,
      session,
      context
    } = createMocks();

    session.adjustmentContext.mockResolvedValue({
      ...context,

      applied: {
        ...context.applied,
        memory: false
      },

      longTerm: [
        {
          group: 'explicit',
          content: '这条长期偏好不应发送'
        }
      ]
    });

    const result =
      await service.feedbackSwap();

    expect(result.status).toBe('committed');

    const input = ai.mock.calls[0][0];

    expect(
      input.conditions.memory
    ).toBeUndefined();

    expect(
      input.conditions.feedback
    ).toEqual([
      {
        choice: 'dislike',
        reason: '不喜欢黑色'
      },
      {
        choice: 'like',
        reason: ''
      }
    ]);
  });

  it('新一轮生成读取最新草稿，不继承旧轮反馈', async () => {
    const { service, session } = createMocks();

    await service.generateNewRound();

    const input = ai.mock.calls[0][0];

    expect(input.conditions).toEqual({});

    expect(
      input.conditions.feedback
    ).toBeUndefined();

    expect(
      session.adjustmentContext
    ).not.toHaveBeenCalled();

    expect(
      session.commitNewRound
    ).toHaveBeenCalledTimes(1);

    expect(
      session.commitAdjustment
    ).not.toHaveBeenCalled();
  });

  it('换单件仍读取本轮已保存反馈', async () => {
    const { service, session } = createMocks();

    const result =
      await service.swapItem('top-1');

    expect(result.status).toBe('committed');

    const input = ai.mock.calls[0][0];

    expect(input.operation).toEqual({
      kind: 'swap-item',

      currentGarmentIds: [
        'top-1',
        'bottom-1',
        'shoes-1'
      ],

      targetGarmentId: 'top-1',
      targetCategory: 'top',
      keptGarments: [{ id: 'bottom-1', imageId: 'img-bottom-1', category: 'bottom' }, { id: 'shoes-1', imageId: 'img-shoes-1', category: 'shoes' }]
    });

    expect(
      input.conditions.feedback
    ).toEqual([
      {
        choice: 'dislike',
        reason: '不喜欢黑色'
      },
      {
        choice: 'like',
        reason: ''
      }
    ]);

    expect(
      session.commitAdjustment
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRoundId: 'round-1',

        kind: 'swap-item',

        targetGarmentId: 'top-1',

        result: expect.objectContaining({
          garmentIds: [
            'top-2',
            'bottom-1',
            'shoes-1'
          ]
        })
      }),
      now
    );
  });

  it('反馈后换一套失败，不提交调整结果', async () => {
    const { service, session } = createMocks();

    ai.mockRejectedValue(
      new Error('模拟 AI 请求失败')
    );

    await expect(
      service.feedbackSwap()
    ).rejects.toThrow('模拟 AI 请求失败');

    expect(
      session.commitAdjustment
    ).not.toHaveBeenCalled();

    expect(
      session.commitNewRound
    ).not.toHaveBeenCalled();
  });

  it('调整期间当前轮次变化，拒绝保存旧请求', async () => {
    const {
      service,
      session,
      context
    } = createMocks();

    session.adjustmentContext
      .mockResolvedValueOnce(context)
      .mockResolvedValueOnce({
        ...context,

        current: {
          ...context.current,
          id: 'result-new',
          roundId: 'round-new'
        }
      });

    await expect(
      service.swapOutfit()
    ).rejects.toMatchObject({
      code: 'ROUND_CHANGED'
    });

    expect(
      session.commitAdjustment
    ).not.toHaveBeenCalled();
  });

  it('首页生成固定读取长期偏好与天气，不读取推荐页临时条件', async () => {
    const {
      service,
      session,
      weather
    } = createMocks();

    const result =
      await service.generateHome();

    expect(result.status).toBe('committed');

    const input = ai.mock.calls[0][0];

    expect(
      input.conditions.memory
    ).toEqual([
      '【explicit】喜欢低饱和度配色'
    ]);

    expect(
      input.conditions.weather
    ).toMatchObject({
      city: '深圳',
      temperature: 20,
      apparentTemperature: 19
    });

    expect(
      input.conditions.preference
    ).toBeUndefined();

    expect(
      input.conditions.scene
    ).toBeUndefined();

    expect(
      input.conditions.feedback
    ).toBeUndefined();

    expect(
      session.newRoundContext
    ).not.toHaveBeenCalled();

    expect(
      session.adjustmentContext
    ).not.toHaveBeenCalled();

    expect(
      weather.current
    ).toHaveBeenCalledTimes(1);

    expect(
      session.commitHome
    ).toHaveBeenCalledTimes(1);

    expect(
      session.commitNewRound
    ).not.toHaveBeenCalled();

    expect(
      session.commitAdjustment
    ).not.toHaveBeenCalled();
  });
});
