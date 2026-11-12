# BiRefNet 浏览器技术 Spike 报告

## 隔离边界

本报告记录当时的独立技术 Spike：页面和推理脚本位于 `spikes/birefnet/`，没有调用 OpenRouter 或 IndexedDB。Spike 完成后，模型推理已另行接入正式衣橱图片流程；业务验证与交付状态见 [第 3 轮交接](../handoffs/ROUND-03.md)。用户提供的两张照片在本 Spike 中只在本机处理。

本地 Spike 安装了固定版本 `onnxruntime-web@1.31.1`，并使用用户下载后放入该目录的模型。模型权重没有加入 Git 提交。没有安装其他推理库或额外模型。

## 模型、来源和输入输出

- 仓库：[`studioludens/birefnet-lite-512`](https://huggingface.co/studioludens/birefnet-lite-512)，基于 ZhengPeng7/BiRefNet_lite 导出的 512×512 ONNX 模型。
- 固定文件版本：ONNX 目录提交 `18d56c5`（Hugging Face 标记为 verified）。
- 使用文件：`onnx/model_fp16.onnx`，本地约 94 MiB，仓库页面标注 98.5 MB。
- SHA-256：`eff9216bb2f9d3f023d9c2b7196845a7485739ab1f231593633e4d2344ffc516`；与 Hugging Face 文件页提供的 SHA-256 一致。
- 许可证：MIT。许可文件保存在 `spikes/birefnet/model/LICENSE`；若之后重新分发模型，必须一并保留版权和许可文本。
- 输入：RGB 512×512，除以 255 后按 ImageNet mean `[0.485, 0.456, 0.406]` 和 std `[0.229, 0.224, 0.225]` 归一化，NCHW，输入名 `input_image`。
- 输出：512×512 单通道 logits。按模型卡执行 sigmoid 得到 alpha mask，再缩放到原图尺寸并与原始 RGB 合成白底图。

## 实测环境和结果

在本机 Chrome 157 headless 和普通图形窗口中分别运行 WebGPU；WASM 在 headless Chrome 中运行。WebGPU adapter 报告支持 `shader-f16`、`maxStorageBuffersPerShaderStage=10`，但厂商/设备信息为空。使用固定 6 张夹具（4 张合成 SVG、2 张用户提供的实拍图）。更新运行时前后使用同一模型和预处理做了对照：`onnxruntime-web@1.22.0` 的 WebGPU 输出异常；同一模型在 `1.31.1` 下恢复为与 WASM 接近的数值。切换正式 Spike 运行时后清理并强制重建 Vite 依赖缓存，完整复跑通过。

| 后端 | Session 初始化 | 单张推理 | 输出质量 |
| --- | ---: | ---: | --- |
| WASM | 3.03 秒 | 合成夹具 4.36–4.48 秒；实拍图 4.39–4.41 秒 | 两张实拍图都保留了包/鞋并去除了大部分木地板；合成衣物也能形成主体 mask。 |
| WebGPU | 2.64 秒（普通图形窗口） | 冷启动夹具 0.93 秒，其余约 0.52–0.57 秒；实拍图约 0.52 秒 | 6 张夹具均成功；实拍输出与 WASM 相符，包/鞋保留且大部分木地板移除。 |

WebGPU 实拍输出统计（WASM 结果在小数点后两位一致）：

| 输入 | logit 范围 | 平均 alpha | alpha ≥ 0.5 像素占比 |
| --- | ---: | ---: | ---: |
| 包 | -30.83 至 23.92 | 23.1% | 23.1% |
| 鞋 | -21.19 至 28.61 | 40.1% | 40.1% |

无衣物夹具仍有约 37.9% 像素被判为前景，表明模型做的是显著目标/前景分割，不提供“是否为衣物”的语义判断；该夹具中的大色块也会被识别为前景。

鞋图右边缘原始截图中有黑色遮挡物，输出会保留这部分遮挡；模型无法恢复被遮住的内容。模型输入只有 512×512，也会限制细肩带和精细边缘的还原。

## 结论

模型文件、预处理以及 `onnxruntime-web@1.31.1` 的 WebGPU/WASM 推理链路均已验证。WebGPU 约 0.57 秒/张，WASM 约 4.4 秒/张。`1.22.0` 的 WebGPU 错误结果可在同一环境复现，升级到 `1.31.1` 后恢复正确；因此正式 Spike 固定为 `1.31.1`。这一对照把问题定位到旧运行时/其 WebGPU 执行路径，而非模型文件或图片预处理，但没有进一步确定具体算子缺陷。

独立 Spike 当时未直接写入正式业务；后续衣橱接线与页面验证记录在第 3 轮交接中。仍需在更多真实衣物图片和目标设备上复核细边缘、误抠和性能。Safari 26.6.2 已安装，但其 WebDriver 被“Allow Remote Automation”设置拦截；本次没有更改该安全设置，因此 Safari 尚未实测。当前不能宣称跨浏览器或跨 GPU 兼容。

## 可复现内容

- 页面：`spikes/birefnet/index.html`
- 推理脚本：`spikes/birefnet/spike.js`
- 合成夹具：`spikes/birefnet/fixtures/`
- 用户照片 fixture 仅为本地测试文件，没有上传。

页面可分别选择 WebGPU/WASM，运行全部 6 张图并查看输入、mask、白底结果和逐图耗时。当前模型文件由 `.gitignore` 排除，不应提交或推送。
