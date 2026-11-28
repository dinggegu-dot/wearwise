
import type { Garment, Category } from '@/modules/wardrobe';
import type { WeatherSnapshot, GarmentSnapshot } from '@/modules/session/schema';

/**
 * 与 POST /api/recommendation 保持一致的条件结构。
 * 只传入本次允许 AI 使用的条件。
 */
export interface AIRecommendationConditions {
  memory?: string[];
  weather?: WeatherSnapshot;
  preference?: {
    text: string;
    imageIds: string[];
    styleTags?: string[];
  };
  scene?: string | { selected: string | null; custom: string };
  feedback?: Array<{
    choice: 'like' | 'dislike';
    reason: string;
  }>;
}

export type AIRecommendationOperation =
  | {
      kind: 'swap-outfit';
      currentGarmentIds: string[];
    }
  | {
      kind: 'swap-item';
      currentGarmentIds: string[];
      targetGarmentId: string;
      targetCategory: Category;
      /** Frozen positions are display context, never new candidates. */
      keptGarments?: GarmentSnapshot[];
    }
  | {
      kind: 'feedback-swap';
      currentGarmentIds: string[];
    };

/** AI 推荐接口的请求参数。 */
export interface AIRecommendationInput {
  wardrobe: Garment[];
  conditions: AIRecommendationConditions;
  operation?: AIRecommendationOperation;
  referenceImages?: ReadonlyMap<string, Blob>;
}

/** 与第 3 轮 AI Provider 的返回结构保持一致。 */
export interface AIRecommendationResult {
  garmentIds: string[];
  reason: string;
  knowledgeVersion: string;
}

/** API 统一错误结构。 */
export interface AIRecommendationError {
  code: string;
  message: string;
  retryable: boolean;
  requestId?: string;
  status?: number;
}

export class AIRecommendationClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly requestId?: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'AIRecommendationClientError';
  }
}

interface APIResponse {
  ok?: boolean;
  data?: unknown;
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
  };
  requestId?: string;
}

export interface AIRecommendationClientOptions {
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}


function isRecommendationResult(
  value: unknown
): value is AIRecommendationResult {
  if (!value || typeof value !== 'object') return false;

  const result = value as Record<string, unknown>;

  return (
    Array.isArray(result.garmentIds) &&
    result.garmentIds.length > 0 &&
    result.garmentIds.every(
      id => typeof id === 'string' && id.length > 0
    ) &&
    new Set(result.garmentIds).size === result.garmentIds.length &&
    typeof result.reason === 'string' &&
    result.reason.trim().length > 0 &&
    typeof result.knowledgeVersion === 'string' &&
    result.knowledgeVersion.trim().length > 0
  );
}


function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
  );
}

/**
 * 构造推荐 API 请求。
 *
 * 没有参考图时使用 JSON。
 * 有参考图时使用 multipart/form-data。
 *
 * 图片 ID 必须与本次启用的 preference.imageIds 一一对应。
 */
function buildRequest(input: AIRecommendationInput): {
  body: BodyInit;
  headers?: HeadersInit;
} {
  const imageIds = input.conditions.preference?.imageIds ?? [];
  const images = input.referenceImages ?? new Map<string, Blob>();

  if (new Set(imageIds).size !== imageIds.length) {
    throw new AIRecommendationClientError(
      'INVALID_REFERENCE_IMAGES',
      '参考图 ID 不能重复。',
      false
    );
  }

  if (images.size !== imageIds.length) {
    throw new AIRecommendationClientError(
      'INVALID_REFERENCE_IMAGES',
      '参考图与本次喜好中启用的图片 ID 不一致。',
      false
    );
  }

  for (const id of imageIds) {
    const image = images.get(id);

    if (!image) {
      throw new AIRecommendationClientError(
        'INVALID_REFERENCE_IMAGES',
        `缺少参考图：${id}`,
        false
      );
    }

    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(image.type) ||
      image.size === 0 ||
      image.size > 4 * 1024 * 1024
    ) {
      throw new AIRecommendationClientError(
        'INVALID_REFERENCE_IMAGES',
        `参考图 ${id} 的格式或大小不符合要求。`,
        false
      );
    }
  }

  const payload = {
  wardrobe: input.wardrobe,
  conditions: input.conditions,
  ...(input.operation
    ? { operation: input.operation }
    : {})
};

  // 无参考图：使用 JSON 请求。
  if (imageIds.length === 0) {
    return {
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json'
      }
    };
  }

  // 有参考图：使用 multipart/form-data。
  const form = new FormData();

  form.set('input', JSON.stringify(payload));

  for (const id of imageIds) {
    const image = images.get(id)!;

    const extension =
      image.type === 'image/jpeg'
        ? 'jpg'
        : image.type === 'image/png'
          ? 'png'
          : 'webp';

    form.append(
      `image:${id}`,
      image,
      `${id}.${extension}`
    );
  }

  // 不手动设置 Content-Type。
  // 浏览器需要自动生成 multipart boundary。
  return { body: form };
}

/**
 * 调用服务端 AI 推荐 API。
 *
 * 本模块不读取数据库、不管理 Session，
 * 也不决定长期记忆和临时条件的开关。
 * 这些职责由上层 RecommendationCoreService 负责。
 */
export async function requestAIRecommendation(
  input: AIRecommendationInput,
  options: AIRecommendationClientOptions = {}
): Promise<AIRecommendationResult> {
  const fetcher = options.fetcher ?? fetch;

  const request = buildRequest(input);

  let response: Response;

  try {
    response = await fetcher('/api/recommendation', {
      method: 'POST',
      headers: request.headers,
      body: request.body,
      signal: options.signal
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new AIRecommendationClientError(
      'NETWORK_ERROR',
      '无法连接推荐服务，请检查网络后重试。',
      true
    );
  }

  let result: APIResponse;

  try {
    result = await response.json() as APIResponse;
  } catch {
    throw new AIRecommendationClientError(
      'INVALID_API_RESPONSE',
      '推荐服务返回了无法解析的数据。',
      false,
      undefined,
      response.status
    );
  }

  if (!response.ok || result.ok !== true) {
    throw new AIRecommendationClientError(
      result.error?.code ?? 'AI_REQUEST_FAILED',
      result.error?.message ?? '推荐请求失败，请稍后重试。',
      result.error?.retryable ?? response.status >= 500,
      result.requestId,
      response.status
    );
  }

  if (!isRecommendationResult(result.data)) {
    throw new AIRecommendationClientError(
      'INVALID_API_RESPONSE',
      'AI 推荐结果格式不正确。',
      false,
      result.requestId,
      response.status
    );
  }

  return result.data;
}
