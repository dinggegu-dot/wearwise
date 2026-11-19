
import { describe, expect, it, vi } from 'vitest';

import { testGarment } from '../fixtures/recommendation';

import {
  requestAIRecommendation,
  AIRecommendationClientError
} from '@/modules/recommendation/ai-client';

const garment = testGarment('shirt-1');

const validInput = {
  wardrobe: [garment],
  conditions: {
    scene: '日常通勤'
  }
};

function successResponse() {
  return new Response(
    JSON.stringify({
      ok: true,
      data: {
        garmentIds: ['shirt-1'],
        reason: '适合日常通勤',
          knowledgeVersion: 'V1.2'
      },
      requestId: 'test-request-001'
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
}

describe('AI Recommendation Client', () => {
  it('使用 JSON 请求推荐 API', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValue(successResponse());

    const result = await requestAIRecommendation(
      validInput,
      { fetcher }
    );

    expect(result).toEqual({
  garmentIds: ['shirt-1'],
  reason: '适合日常通勤',
  knowledgeVersion: 'V1.2'
});

expect(result.knowledgeVersion).toBe('V1.2');

    expect(fetcher).toHaveBeenCalledTimes(1);

    const [url, options] = fetcher.mock.calls[0];

    expect(url).toBe('/api/recommendation');
    expect(options?.method).toBe('POST');
    expect(options?.headers).toMatchObject({
      'Content-Type': 'application/json'
    });

    const body = JSON.parse(options?.body as string);

    expect(body.wardrobe).toHaveLength(1);
    expect(body.conditions.scene).toBe('日常通勤');
    expect(body.knowledge).toBeUndefined();
  });

  it('存在参考图时使用 multipart/form-data', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValue(successResponse());

    const image = new Blob(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
      { type: 'image/png' }
    );

    const result = await requestAIRecommendation(
      {
        wardrobe: [garment],
        conditions: {
          preference: {
            text: '喜欢简约风格',
            imageIds: ['reference-1']
          }
        },
        referenceImages: new Map([
          ['reference-1', image]
        ])
      },
      { fetcher }
    );

    expect(result.garmentIds).toEqual(['shirt-1']);

    const options = fetcher.mock.calls[0][1];

    expect(options?.headers).toBeUndefined();

    expect(options?.body).toBeInstanceOf(FormData);

    const form = options?.body as FormData;

    expect(form.get('input')).toBeTruthy();
    expect(form.get('image:reference-1')).toBeInstanceOf(Blob);

    const input = JSON.parse(form.get('input') as string);

    expect(input.conditions.preference.imageIds)
      .toEqual(['reference-1']);
  });

  it('缺少参考图时拒绝发送请求', async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      requestAIRecommendation(
        {
          wardrobe: [garment],
          conditions: {
            preference: {
              text: '',
              imageIds: ['reference-1']
            }
          }
        },
        { fetcher }
      )
    ).rejects.toBeInstanceOf(AIRecommendationClientError);

    expect(fetcher).not.toHaveBeenCalled();
  });

  it('拒绝重复的参考图 ID', async () => {
    const fetcher = vi.fn<typeof fetch>();

    const image = new Blob(['image'], {
      type: 'image/jpeg'
    });

    await expect(
      requestAIRecommendation(
        {
          wardrobe: [garment],
          conditions: {
            preference: {
              text: '简约',
              imageIds: ['reference-1', 'reference-1']
            }
          },
          referenceImages: new Map([
            ['reference-1', image]
          ])
        },
        { fetcher }
      )
    ).rejects.toMatchObject({
      code: 'INVALID_REFERENCE_IMAGES'
    });

    expect(fetcher).not.toHaveBeenCalled();
  });

  it('正确转换服务端业务错误', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: 'AI_TIMEOUT',
              message: 'AI 请求超时。',
              retryable: true
            },
            requestId: 'request-timeout'
          }),
          { status: 504 }
        )
      );

    await expect(
      requestAIRecommendation(validInput, { fetcher })
    ).rejects.toMatchObject({
      code: 'AI_TIMEOUT',
      message: 'AI 请求超时。',
      retryable: true,
      requestId: 'request-timeout',
      status: 504
    });
  });

  it('网络错误映射为可重试错误', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      requestAIRecommendation(validInput, { fetcher })
    ).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      retryable: true
    });
  });

  it('拒绝格式不正确的 AI 返回结果', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              garmentIds: ['shirt-1', 'shirt-1'],
              reason: '重复衣物'
            },
            requestId: 'invalid-result'
          }),
          { status: 200 }
        )
      );

    await expect(
      requestAIRecommendation(validInput, { fetcher })
    ).rejects.toMatchObject({
      code: 'INVALID_API_RESPONSE',
      retryable: false
    });
  });
});
