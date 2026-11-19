# 可复用测试素材

- 示例衣橱由 `src/modules/demo/index.ts` 提供八件示例衣物和自带类别插图。首次打开本地站点直接进入真实衣橱；点“切换示例模式”可体验示例数据。选择“使用示例天气”可离线演示推荐，示例与真实衣橱隔离。
- [generated-ui.jpg](generated-ui.jpg) 是仓库已有的自动化图片输入。它与浏览器测试生成的色块适用于图片选择、换图、解码与持久化检查。真实识别、白底视觉效果需要另用经许可的清晰衣物照片。
- [real-outfit-cc0.jpg](real-outfit-cc0.jpg) 是真实街头穿搭照片，来源为 [Wikimedia Commons：Streetstyle NYC.jpg](https://commons.wikimedia.org/wiki/File:Streetstyle_NYC.jpg)，作者 MarieClairestreetstyles，CC0 1.0；原文件 1365×2048、621 KB，SHA-256 `ccceced9df076560efa1f7650f8f21ce0c1fdc66429cd0e22bd333bf73d6b4bb`。仅用于第 3 轮真实灵感分析与页面回归；照片包含真实人物，不用作衣橱单件抠图基准。
- 需要新素材时写明来源、许可、预期分类和用途。不要提交私人照片、密钥、浏览器数据库或真实账户截图。UI 示例是设计参考，测试图片从本目录或测试代码生成。
- [`birefnet/`](birefnet/) 是独立 BiRefNet 浏览器 Spike 的合成 SVG 夹具，覆盖清晰主体、细边缘、低对比和无衣物背景；由项目测试夹具手工绘制，不含真实人物或私人照片。Spike 设计与指标见 [`docs/spikes/BiRefNet-browser-spike.md`](../../docs/spikes/BiRefNet-browser-spike.md)。
- 切回真实模式可用“添加衣物”手动初始化测试数据。请在独立 Chrome 测试档案和同一个地址下操作；Git 克隆不会复制 IndexedDB。
