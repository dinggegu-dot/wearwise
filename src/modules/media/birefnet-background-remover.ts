/** Browser-only BiRefNet Lite foreground extraction. The model never leaves the device. */
export const BIREFNET_INPUT_SIZE = 512;
const PIXELS = BIREFNET_INPUT_SIZE * BIREFNET_INPUT_SIZE;
const MODEL_URL = process.env.NEXT_PUBLIC_RUNTIME_TARGET === 'pages'
  ? '/wearwise/models/birefnet/model_fp16.onnx'
  : '/models/birefnet/model_fp16.onnx';

type OrtTensor = { data: ArrayLike<number>; dims: readonly number[]; type: string };
type OrtSession = {
  inputNames: string[];
  outputNames: string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>>;
  release(): Promise<void>;
};
type OrtRuntime = {
  env: { wasm: { numThreads: number } };
  Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
  InferenceSession: { create(model: string, options: { executionProviders: string[]; graphOptimizationLevel: string }): Promise<OrtSession> };
};

let sessionPromise: Promise<{ session: OrtSession; runtime: OrtRuntime; backend: 'webgpu' | 'wasm' }> | undefined;
let wasmSessionPromise: Promise<{ session: OrtSession; runtime: OrtRuntime; backend: 'wasm' }> | undefined;
let webgpuDisabled = false;

/** Convert 512x512 RGBA pixels into the model's ImageNet-normalized NCHW tensor. */
export function preprocessBiRefNetPixels(rgba: Uint8ClampedArray): Float32Array {
  if (rgba.length !== PIXELS * 4) throw new Error('BiRefNet 输入必须是 512×512 RGBA 图片。');
  const tensor = new Float32Array(PIXELS * 3);
  for (let i = 0; i < PIXELS; i++) {
    tensor[i] = (rgba[i * 4] / 255 - 0.485) / 0.229;
    tensor[PIXELS + i] = (rgba[i * 4 + 1] / 255 - 0.456) / 0.224;
    tensor[PIXELS * 2 + i] = (rgba[i * 4 + 2] / 255 - 0.406) / 0.225;
  }
  return tensor;
}

/** Converts model logits to an RGBA alpha mask. */
export function biRefNetAlphaMask(logits: ArrayLike<number>): Uint8ClampedArray {
  if (logits.length !== PIXELS) throw new Error('BiRefNet 输出尺寸不是 512×512。');
  const rgba = new Uint8ClampedArray(PIXELS * 4);
  for (let i = 0; i < PIXELS; i++) {
    const alpha = 255 / (1 + Math.exp(-Number(logits[i])));
    const p = i * 4;
    rgba[p] = rgba[p + 1] = rgba[p + 2] = 255;
    rgba[p + 3] = Math.round(alpha);
  }
  return rgba;
}

function stopped(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
}

async function createSession(candidates: Array<'webgpu' | 'wasm'>): Promise<{ session: OrtSession; runtime: OrtRuntime; backend: 'webgpu' | 'wasm' }> {
  let lastError: unknown;
  for (const backend of candidates) {
    try {
      // Separate entry points keep the runtime lazy and avoid loading either backend until needed.
      const imported = backend === 'webgpu'
        ? await import('onnxruntime-web/webgpu')
        : await import('onnxruntime-web/wasm');
      const runtime = imported as unknown as OrtRuntime;
      runtime.env.wasm.numThreads = 1;
      const session = await runtime.InferenceSession.create(MODEL_URL, {
        executionProviders: [backend], graphOptimizationLevel: 'all',
      });
      if (!session.inputNames.includes('input_image') || session.outputNames.length !== 1) {
        await session.release();
        throw new Error('BiRefNet 模型输入或输出名称不符合已验证版本。');
      }
      return { session, runtime, backend };
    } catch (error) { lastError = error; }
  }
  throw lastError instanceof Error ? lastError : new Error('BiRefNet 模型无法加载。');
}

async function getSession() {
  sessionPromise ??= createSession(!webgpuDisabled && typeof navigator !== 'undefined' && 'gpu' in navigator ? ['webgpu', 'wasm'] : ['wasm'])
    .catch(error => { sessionPromise = undefined; throw error; });
  return sessionPromise;
}

async function getWasmSession() {
  wasmSessionPromise ??= createSession(['wasm']).then(value => ({ ...value, backend: 'wasm' as const }))
    .catch(error => { wasmSessionPromise = undefined; throw error; });
  return wasmSessionPromise;
}

async function runSession(active: Awaited<ReturnType<typeof getSession>>, inputData: Float32Array): Promise<OrtTensor> {
  const output = await active.session.run({ input_image: new active.runtime.Tensor('float32', inputData, [1, 3, BIREFNET_INPUT_SIZE, BIREFNET_INPUT_SIZE]) });
  const tensor = output[active.session.outputNames[0]];
  if (!tensor || tensor.data.length !== PIXELS) throw new Error('BiRefNet 推理输出不是 512×512 遮罩。');
  return tensor;
}

/** Segment a decoded source image and composite it over white at the original size. */
export async function removeBiRefNetBackground(
  source: CanvasImageSource,
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<{ canvas: HTMLCanvasElement; backend: 'webgpu' | 'wasm'; inferenceMs: number }> {
  stopped(signal);
  const inputCanvas = document.createElement('canvas');
  inputCanvas.width = inputCanvas.height = BIREFNET_INPUT_SIZE;
  const inputContext = inputCanvas.getContext('2d', { willReadFrequently: true });
  if (!inputContext) throw new Error('BiRefNet 图片预处理不可用。');
  inputContext.drawImage(source, 0, 0, BIREFNET_INPUT_SIZE, BIREFNET_INPUT_SIZE);
  const pixels = inputContext.getImageData(0, 0, BIREFNET_INPUT_SIZE, BIREFNET_INPUT_SIZE).data;
  const inputData = preprocessBiRefNetPixels(pixels);
  stopped(signal);

  let active = await getSession();
  stopped(signal);
  const startedAt = performance.now();
  let tensor: OrtTensor;
  try { tensor = await runSession(active, inputData); }
  catch (error) {
    if (active.backend !== 'webgpu') throw error;
    webgpuDisabled = true;
    try { await active.session.release(); } catch { /* The failed WebGPU session may already be disposed. */ }
    sessionPromise = undefined;
    active = await getWasmSession();
    stopped(signal);
    tensor = await runSession(active, inputData);
  }
  stopped(signal);
  const maskPixels = biRefNetAlphaMask(tensor.data);
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = maskCanvas.height = BIREFNET_INPUT_SIZE;
  const maskContext = maskCanvas.getContext('2d');
  if (!maskContext) throw new Error('BiRefNet 遮罩生成不可用。');
  const maskImage = maskContext.createImageData(BIREFNET_INPUT_SIZE, BIREFNET_INPUT_SIZE);
  maskImage.data.set(maskPixels);
  maskContext.putImageData(maskImage, 0, 0);

  const output = document.createElement('canvas');
  output.width = width; output.height = height;
  const context = output.getContext('2d');
  if (!context) throw new Error('BiRefNet 白底合成不可用。');
  context.fillStyle = '#fff'; context.fillRect(0, 0, width, height);
  const foreground = document.createElement('canvas');
  foreground.width = width; foreground.height = height;
  const foregroundContext = foreground.getContext('2d');
  if (!foregroundContext) throw new Error('BiRefNet 前景合成不可用。');
  foregroundContext.drawImage(source, 0, 0, width, height);
  foregroundContext.globalCompositeOperation = 'destination-in';
  foregroundContext.imageSmoothingQuality = 'high';
  foregroundContext.drawImage(maskCanvas, 0, 0, width, height);
  context.drawImage(foreground, 0, 0);
  stopped(signal);
  return { canvas: output, backend: active.backend, inferenceMs: performance.now() - startedAt };
}
