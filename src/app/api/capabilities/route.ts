import { aiAvailable } from '@/modules/recognition/infrastructure/ai-provider';
export async function GET() {
  const available = aiAvailable();
  return Response.json({ recognition:{available,...(!available ? {reason:'图片识别暂未配置，可手动录入。'} : {})} });
}
