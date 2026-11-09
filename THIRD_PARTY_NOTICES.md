# 第三方源码声明

- Closet Kit，MIT，Giovanni Everduin；固定提交 `b2cc6b21a7fbda0f73a0ce20aa7b574109494e93`，来源 `lib/imageClient.ts`，改编浏览器 Canvas 图片缩放至 `src/modules/media/browser-image-processor.ts`，增加格式和尺寸校验、取消与资源释放。许可见 `third_party/licenses/closet-kit-MIT.txt`。
- Wearly，MIT，Wearly contributors；固定提交 `66f4c1351eb8368d7cddf0e885f5a957ce25835f`，来源 `src/lib/weather.ts`，改编 WMO 分类及中文文案至 `src/modules/weather/domain/weather-code.ts`。许可见 `third_party/licenses/wearly-MIT.txt`。

- Wearly，MIT，固定提交 `66f4c1351eb8368d7cddf0e885f5a957ce25835f`；将 `tests/engine.test.ts` 的可用衣物和不同组合行为用例适配至 `tests/recommendation/engine.test.ts`；许可见 `third_party/licenses/wearly-MIT.txt`。

- Wearly，MIT，固定提交 `66f4c1351eb8368d7cddf0e885f5a957ce25835f`；参考 `src/lib/ai.ts` 的超时/取消组合与候选确认流程，适配至 `src/modules/recognition/infrastructure/qwen.ts` 和衣物录入界面；许可见 `third_party/licenses/wearly-MIT.txt`。

- sharp 0.35.5（Apache-2.0）为 Next.js 现有锁文件中的可选依赖；本地识别 API 复用该解码器校验 JPEG。未新增安装，缺失时接口安全关闭。
