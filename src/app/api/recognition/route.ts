// V0.2 仅展示产品框架；识别适配器保留在模块中，待后续版本接入。
export async function POST() {
  return Response.json({ code: 'NOT_AVAILABLE', message: '图片识别功能将在后续开放。' }, { status: 503 });
}
