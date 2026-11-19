
import 'fake-indexeddb/auto';

import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { RecommendationCoreService } from '@/modules/recommendation/core-service';
import { createWeatherService } from '@/composition';
import { toWeatherSnapshot } from '@/modules/session';

import {
  cleanup,
  seedWardrobe,
  services
} from '../round2/helpers';

const RUN_LIVE = process.env.LIVE_HOME_TEST === '1';
const BASE_URL = process.env.LIVE_BASE_URL ?? 'http://127.0.0.1:3000';

afterEach(async () => {
  vi.unstubAllGlobals();
  await cleanup();
});

describe('首页推荐：真实端到端联调', () => {
  const liveTest = RUN_LIVE ? it : it.skip;

  liveTest(
    '真实 AI -> Home Session -> IndexedDB，且不影响推荐页',
    async () => {
      // 1. 创建完全隔离的 IndexedDB 测试环境。
      const ctx = services();
      const ids = await seedWardrobe(ctx.wardrobe);

      await ctx.session.setCity('深圳');

      // 2. 添加真正保存在测试库中的长期偏好。
      await ctx.preferences.addExplicit(
        '喜欢简约、舒适、颜色低饱和的搭配'
      );

      // 3. 故意设置推荐页临时条件。
      // 首页不能读取这些内容。
      await ctx.session.saveSettingsDraft({
        memory: false,
        weather: false,
        preference: {
          enabled: true,
          text: '只属于推荐页：喜欢夸张的荧光色',
          imageIds: []
        },
        scene: {
          enabled: true,
          value: '只属于推荐页：舞台演出'
        }
      });

      // 4. 使用真实天气服务。
      const weather = createWeatherService('real');
      const actualWeather = await weather.current('深圳');

      expect(actualWeather.example).toBe(false);
      expect(actualWeather.source).toBe('open-meteo');

      const snapshot = toWeatherSnapshot(actualWeather, [
        'temperature',
        'apparentTemperature',
        'temperatureMin',
        'temperatureMax',
        'weatherCode'
      ]);

      // 5. 先建立一个推荐页轮次和单次反馈。
      // 后面要证明首页生成不会覆盖它们。
      const round = await ctx.session.commitNewRound({
        weather: null,
        result: {
          garmentIds: [ids.T1, ids.B1, ids.S1],
          reason: '原推荐页搭配'
        }
      });

      await ctx.session.saveFeedback({
        expectedRoundId: round.roundId,
        resultId: round.currentResultId,
        choice: 'dislike',
        reason: '只属于推荐页的单次反馈',
        scope: 'once'
      });

      const beforeRound = await ctx.session.readRound();

      // 6. Node.js 的 fetch 不接受相对路径。
      // 这里只把 /api/recommendation 转成真实本地服务地址。
      // 其余网络请求（包括天气）正常发出。
      const originalFetch = globalThis.fetch.bind(globalThis);

      let capturedConditions: Record<string, unknown> | undefined;

      vi.stubGlobal(
        'fetch',
        async (
          input: RequestInfo | URL,
          init?: RequestInit
        ): Promise<Response> => {
          if (
            typeof input === 'string' &&
            input.startsWith('/api/recommendation')
          ) {
            const payload = JSON.parse(
              String(init?.body)
            ) as {
              conditions: Record<string, unknown>;
            };

            capturedConditions = payload.conditions;

            return originalFetch(
              new URL(input, BASE_URL),
              init
            );
          }

          return originalFetch(input, init);
        }
      );

      // 7. 真实调用 RecommendationCoreService.generateHome()。
      // 这里不会 Mock AI。
      const service = new RecommendationCoreService({
        session: ctx.session,
        wardrobe: ctx.wardrobe,
        weather
      });

      const result = await service.generateHome();

      expect(result.status).toBe('committed');

      if (result.status !== 'committed') {
        throw new Error('首页没有生成成功');
      }

      expect(result.knowledgeVersion).toBe('V1.2');

      // 8. 检查 AI 输入没有混入推荐页临时条件。
      expect(capturedConditions).toBeDefined();

      expect(capturedConditions?.memory).toEqual(
        expect.arrayContaining([
          expect.stringContaining('简约、舒适')
        ])
      );

      expect(capturedConditions?.weather).toMatchObject({
        city: '深圳',
        source: 'open-meteo'
      });

      expect(capturedConditions?.preference).toBeUndefined();
      expect(capturedConditions?.scene).toBeUndefined();
      expect(capturedConditions?.feedback).toBeUndefined();

      // 9. 确认首页真实保存成功。
      const homeView = await ctx.session.readHome();

      expect(homeView.home?.currentResultId).toBe(
        result.home.currentResultId
      );

      expect(homeView.current?.surface).toBe('home');
      expect(homeView.current?.roundId).toBeNull();

      expect(homeView.current?.basis).toMatchObject({
        memory: true,
        preference: false,
        scene: null,
        knowledgeVersion: 'V1.2',
        weather: {
          city: '深圳',
          source: 'open-meteo'
        }
      });

      // 10. 推荐页轮次与单次反馈必须原封不动。
      const afterRound = await ctx.session.readRound();

      expect(afterRound).toEqual(beforeRound);

      // 11. 关闭后重新打开 IndexedDB。
      // 验证不是只保存在内存中的结果。
      ctx.db.close();
      await ctx.db.open();

      const restoredHome = await ctx.session.readHome();

      expect(restoredHome).toEqual(homeView);

      console.log(
        '首页真实 E2E 通过：',
        JSON.stringify({
          city: '深圳',
          garmentIds: result.garmentIds,
          knowledgeVersion: result.knowledgeVersion,
          homeResultId: restoredHome.current?.id,
          recommendationRoundPreserved: true,
          feedbackPreserved: true
        }, null, 2)
      );
    },
    180000
  );
});
