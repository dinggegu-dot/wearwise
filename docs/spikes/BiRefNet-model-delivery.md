# BiRefNet Lite 模型交付与缓存方案

## 当前固定版本

- 来源：[Studio Ludens `birefnet-lite-512`](https://huggingface.co/studioludens/birefnet-lite-512/tree/main/onnx)，ONNX 目录显示提交 `18d56c5`。下载时使用该修订号对应的 [`onnx/model_fp16.onnx`](https://huggingface.co/studioludens/birefnet-lite-512/resolve/18d56c5/onnx/model_fp16.onnx)，不用会继续变化的 `main` URL。该短修订号是上游页面公开的标识；若需完整提交号，应在网络可访问时向上游取得并记录，文件 SHA-256 是本方案最终的字节校验依据。
- 字节数：`98,484,532`（约 94 MiB）。SHA-256：`eff9216bb2f9d3f023d9c2b7196845a7485739ab1f231593633e4d2344ffc516`。2026-11-12 已对本地 `public/models/birefnet/model_fp16.onnx` 重新计算，通过。
- 许可证：MIT；保留同一修订的 `LICENSE`，随模型分发。本地 `public/models/birefnet/LICENSE` 的 SHA-256 为 `b5cd5faac84a0acb8a6bdb8aeef0919e528891be27216df84eab398d7c8bd2aa`。
- 浏览器运行时由 `package-lock.json` 固定为 `onnxruntime-web@1.31.1`。不要用未经实测的旧版本替换：Spike 中 1.22.0 的 WebGPU 输出曾异常。

## 下载与安装

模型权重不放入普通 Git 提交。`npm install`、`npm test` 和构建不隐式下载模型；需要模型时显式运行 `bash scripts/install-birefnet-model.sh`。PR 检查和 GitHub Pages 发布工作流都在构建/页面测试前调用同一脚本，从固定修订下载、核对字节数及 SHA-256，并按内容摘要缓存；静态导出后再次核对 `out/models/birefnet/model_fp16.onnx`。校验失败则停止发布。建议本机先存入 macOS 用户缓存 `~/Library/Caches/WearWise/models/birefnet-lite-512/18d56c5/model_fp16.onnx`，再安装到仓库 `public/models/birefnet/model_fp16.onnx`。如果已有用户提供的本地文件，可直接从该文件开始校验，不必重新下载。缓存目录不放 API Key、用户照片或业务数据。

操作顺序：

1. 从上述固定修订链接下载到缓存目录中的临时文件 `model_fp16.onnx.part`。若浏览器下载，先把下载所得文件移到此临时路径；不要直接覆盖正在服务的正式模型。
2. 在 macOS 上执行 `stat -f%z <临时文件>`，结果必须是 `98484532`；执行 `shasum -a 256 <临时文件>`，结果必须是上面的完整 SHA-256。任一不符就丢弃临时文件，检查来源后重新下载，绝不进入 `public/`。
3. 校验通过后，将临时文件重命名为缓存中的 `model_fp16.onnx`，并复制到 `public/models/birefnet/model_fp16.onnx`。复制后再次核对大小与 SHA-256。把上述固定修订的 MIT `LICENSE` 放在同目录。旧版本若要回退，保留独立缓存目录，不能用同名文件混放不同版本。
4. 启动本地服务后，对 `/models/birefnet/model_fp16.onnx` 做一次 HTTP 可达性检查，再运行已有 BiRefNet 页面测试。若部署在 `/wearwise` 前缀下，则检查 `/wearwise/models/birefnet/model_fp16.onnx`。未安装模型时，当前业务会回退为保留原图，不能把这种回退写成白底处理通过。

## 浏览器缓存与后续部署

当前页面只在用户处理图片时请求模型，同一页面的 ONNX session 在内存中复用；失败后清除 session 缓存以允许重试。本地 Next.js Node 静态路径目前响应 `Cache-Control: public, max-age=0` 与 ETag，浏览器可以重新验证并复用未变内容；GitHub Pages 的实际缓存头要等上线后核对。两者都不保证首次 94 MiB 下载时间。当前运行路径是无版本的 `model_fp16.onnx`，更换该文件时必须重新做 SHA、兼容和图像效果测试，并清理旧运行页面的内存 session。

GitHub Pages 的发布方案已固定：工作流下载并校验模型，将它与 MIT 许可证一起放入静态导出产物；模型 URL 为 `/wearwise/models/birefnet/model_fp16.onnx`。本地静态网站已验证该 URL 的 HTTP 200、导出文件的大小和 SHA-256，以及浏览器实际抠图、保存和刷新；**当前 PR 尚未合入 `main`，线上 GitHub Pages 尚未更新或验收**。GitHub 官方规定[已发布站点不大于 1 GB](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)，[Pages 工件中的 tar 不大于 10 GB](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)；本模型约 94 MiB，但首次下载时间和带宽仍需上线后观察。其他托管环境需执行同一安装/校验步骤并保证同源路径。若改用长期缓存，应把版本或内容摘要放进 URL，再配置 `immutable`，同时更新加载路径和回退测试。本轮没有更改现有静态加载路径或缓存头。
