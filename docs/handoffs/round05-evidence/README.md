# 第5轮浏览器运行证据

2026-11-21 整合补充：[桌面列表](2026-11-21/wardrobe-desktop.png)、[320px编辑](2026-11-21/editor-mobile-320.png)、[批量部分保存](2026-11-21/batch-partial-desktop.png)。列表／编辑为示例数据，批量为模拟识别和模拟在线白底。以下2026-11-20图片与记录保留历史性质，当前版本见 [ROUND-05.md](../ROUND-05.md)。

截图来自2026-11-20本机正式Google Chrome 157.0.8103.79，非设计稿、非图片生成。桌面主要使用1536×1024；单件对照保留自动化测试的1280px窗口。手机检查390和320宽度。截图是可复用的合成测试衣物／原有示例衣橱，不含私人照片或账户数据。

| 文件 | 内容及证据性质 |
| --- | --- |
| [wardrobe-desktop.png](wardrobe-desktop.png) | 真实运行的四列衣橱页面；示例模式8件，图片为原有SVG示意图，数量非硬编码设计值 |
| [wardrobe-mobile.png](wardrobe-mobile.png) | 390px列表布局 |
| [detail-desktop.png](detail-desktop.png) | 白底图与完整属性详情；原有旧标签的Other无损展示 |
| [editor-desktop.png](editor-desktop.png) | 编辑回填及固定9风格／6场景多选 |
| [editor-mobile-390.png](editor-mobile-390.png) | 390px编辑弹窗，内容可纵向滚动 |
| [editor-mobile-320.png](editor-mobile-320.png) | 320px编辑弹窗，无横向溢出 |
| [single-real-white.png](single-real-white.png) | 真实ONNX模型本机推理，左侧合成衬衫原图、右侧实际白底输出；没有调用AI识别，明确显示手动确认 |
| [batch-partial-desktop.png](batch-partial-desktop.png) | 真实本机白底、模拟AI、注入单项存储故障后重试；部分保存成功，失败和处理中项目继续保留 |

对应测试：`e2e/birefnet-business.spec.ts`、`e2e/round5-wardrobe.spec.ts`。原图／白底像素、IndexedDB记录和媒体数量、刷新、失败回滚、复用requestId等均有测试断言；截图仅作为视觉证据。

测试素材来自仓库已有 `tests/fixtures/synthetic-shirt.jpg`、浏览器Canvas色块和 `src/modules/demo`。本轮没有把合成衣物称作实物照片效果验收；实际衣物拍照质量和真实OpenRouter识别须由本人在Codex之外按交接说明手动检查，最多6次请求。

自动化不调用真实OpenRouter。真实本机模型推理与模拟AI是两种独立证据。参考图中的摄影衣物未被裁剪、重新生成或用于冒充可操作页面。

完整环境、命令、基线、最终结果、未完成接口和复现路径见 [ROUND-05.md](../ROUND-05.md)。原始日志留在本机仓库外的 `round5-work`，没有把模型响应大文件、浏览器数据库或完整trace提交到Git。
