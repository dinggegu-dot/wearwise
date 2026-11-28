
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
  testGarment('shoes-1', { category: 'shoes' })
];

const successfulAIResult = {
  garmentIds: [
    'top-2',
    'bottom-1',
    'shoes-1'
  ],
  reason: '模拟生成结果',
  knowledgeVersion: 'V1.2'
};

function createMocks(
  weatherEnabled = false
) {
  const draft: SettingsDraft = {
    memory: false,
    weather: weatherEnabled,

    preference: {
      enabled: false,
      text: '',
      imageIds: [],
      styleTags: []
    },

    scene: {
      enabled: false,
      selected: null,
      custom: ''
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
      memory: false,
      weather: null,
      preference: null,
      scene: null,
      appliedAt: now.toISOString()
    },

    current,

    feedback: [
      {
        id: 'feedback-1',
        order: 1,
        choice: 'dislike',
        reason: '不喜欢当前搭配'
      }
    ],

    longTerm: [],
    candidates: garments
  };

  const session = {
    newRoundContext:
      vi.fn().mockResolvedValue({
        draft,
        candidates: garments,
        longTerm: []
      }),

    getSettingsDraft:
      vi.fn().mockResolvedValue(draft),

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

    homeContext:
      vi.fn().mockResolvedValue({
        longTerm: [],
        candidates: garments
      }),

    commitHome:
      vi.fn().mockResolvedValue({
        currentResultId: 'home-result-1'
      }),

    getCity:
      vi.fn().mockResolvedValue('深圳')
  };

  const wardrobe = {
    candidates:
      vi.fn().mockResolvedValue(garments),

    image:
      vi.fn().mockResolvedValue(new Blob(['test garment image']))
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
    draft,
    context
  };
}

const ai = vi.mocked(requestAIRecommendation);

describe('R08 推荐请求取消保护', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    ai.mockResolvedValue(
      successfulAIResult
    );
  });

  it('新轮 AI 返回时请求已取消，不提交新轮', async () => {
    const { service, session } = createMocks();

    const controller = new AbortController();

    ai.mockImplementation(async () => {
      controller.abort();

      return successfulAIResult;
    });

    await expect(
      service.generateNewRound({
        signal: controller.signal
      })
    ).rejects.toMatchObject({
      name: 'AbortError'
    });

    expect(
      session.commitNewRound
    ).not.toHaveBeenCalled();
  });

  it('新轮 AI 返回后、提交前取消，不写入新结果', async () => {
    const {
      service,
      session,
      wardrobe
    } = createMocks();

    const controller = new AbortController();

    wardrobe.candidates.mockImplementation(
      async () => {
        controller.abort();

        return garments;
      }
    );

    await expect(
      service.generateNewRound({
        signal: controller.signal
      })
    ).rejects.toMatchObject({
      name: 'AbortError'
    });

    expect(
      session.commitNewRound
    ).not.toHaveBeenCalled();
  });

  it('换整套请求取消后不保存调整', async () => {
    const { service, session } = createMocks();

    const controller = new AbortController();

    ai.mockImplementation(async () => {
      controller.abort();

      return successfulAIResult;
    });

    await expect(
      service.swapOutfit({
        signal: controller.signal
      })
    ).rejects.toMatchObject({
      name: 'AbortError'
    });

    expect(
      session.commitAdjustment
    ).not.toHaveBeenCalled();
  });

  it('换单件请求取消后不保存调整', async () => {
    const { service, session } = createMocks();

    const controller = new AbortController();

    ai.mockImplementation(async () => {
      controller.abort();

      return successfulAIResult;
    });

    await expect(
      service.swapItem('top-1', {
        signal: controller.signal
      })
    ).rejects.toMatchObject({
      name: 'AbortError'
    });

    expect(
      session.commitAdjustment
    ).not.toHaveBeenCalled();
  });

  it('反馈后换一套取消，不保存调整结果', async () => {
    const { service, session } = createMocks();

    const controller = new AbortController();

    ai.mockImplementation(async () => {
      controller.abort();

      return successfulAIResult;
    });

    await expect(
      service.feedbackSwap({
        signal: controller.signal
      })
    ).rejects.toMatchObject({
      name: 'AbortError'
    });

    expect(
      session.commitAdjustment
    ).not.toHaveBeenCalled();

    expect(
      session.commitNewRound
    ).not.toHaveBeenCalled();
  });

  it('首页请求取消，不提交首页推荐结果', async () => {
    const { service, session } = createMocks();

    const controller = new AbortController();

    ai.mockImplementation(async () => {
      controller.abort();

      return successfulAIResult;
    });

    await expect(
      service.generateHome({
        signal: controller.signal
      })
    ).rejects.toMatchObject({
      name: 'AbortError'
    });

    expect(
      session.commitHome
    ).not.toHaveBeenCalled();
  });

  it('天气请求主动取消时，不误报天气不可用', async () => {
    const {
      service,
      session,
      weather
    } = createMocks(true);

    const controller = new AbortController();

    weather.current.mockImplementation(
      async () => {
        controller.abort();

        throw controller.signal.reason;
      }
    );

    await expect(
      service.generateNewRound({
        signal: controller.signal
      })
    ).rejects.toMatchObject({
      name: 'AbortError'
    });

    expect(ai).not.toHaveBeenCalled();

    expect(
      session.commitNewRound
    ).not.toHaveBeenCalled();
  });

  it('首页天气请求取消时，保留原始取消异常', async () => {
    const {
      service,
      session,
      weather
    } = createMocks();

    const controller = new AbortController();

    weather.current.mockImplementation(
      async () => {
        controller.abort();

        throw controller.signal.reason;
      }
    );

    await expect(
      service.generateHome({
        signal: controller.signal
      })
    ).rejects.toMatchObject({
      name: 'AbortError'
    });

    expect(ai).not.toHaveBeenCalled();

    expect(
      session.commitHome
    ).not.toHaveBeenCalled();
  });

  it('将调用方提供的取消信号传入 AI 客户端', async () => {
    const { service } = createMocks();

    const controller = new AbortController();

    await service.generateNewRound({
      signal: controller.signal
    });

    expect(ai).toHaveBeenCalledWith(
      expect.anything(),

      expect.objectContaining({
        signal: controller.signal
      })
    );
  });
});
