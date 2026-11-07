import { recognitionAvailable } from '@/modules/recognition/infrastructure/qwen';
export async function GET() {
  const available = recognitionAvailable();
  return Response.json({ recognition:{available,...(!available ? {reason:'图片识别暂未配置，可手动录入。'} : {})} });
}
