# 第 3 轮交接候选 · 04 → 05

> **状态：[第 3 轮 PR #30](https://github.com/dinggegu-dot/wearwise/pull/30) 候选，待 05 独立验收。** 分支为 `codex/round-03-ai`，基线为第 2 轮 PR #29 的 `63efce6d10e265ada27b539664a2723b00305da5`；评审应以 GitHub PR 显示的最新 head SHA 为准。基线 SHA 不是第 3 轮候选提交。

本地全部文件变更见[第 3 轮文件清单](ROUND-03-FILES.md)。

| 项目 | 当前记录 |
| --- | --- |
| 负责人和接收者 | 04 → 05；第 3 轮 → 第 4 轮；2026-11-12（北京时间） |
| 共同依据 | [第 3 轮排班](../project/ROUND-SCHEDULE.md)、[推荐依据与记忆规则](../project/RECOMMENDATION-MEMORY-RULES.md)、[第 2 轮数据 API](../project/ROUND-02-DATA-API.md) |
| 唯一代码入口 | 团队仓库分支 `codex/round-03-ai`，以 GitHub PR 当前 head SHA 为准；依赖第 2 轮 PR #29，基线为 `63efce6d10e265ada27b539664a2723b00305da5` |
| 运行要求 | Node.js ≥ 22.12；按仓库 README 安装；`npm run dev`。本机 `.env.local` 已配置 OpenRouter；API Key 的值未读取或输出 |
| 服务配置 | `.env.example` 仅提供 OpenRouter 的 `OPENROUTER_API_KEY`、`AI_MODEL=qwen/qwen3.8-max-0902`、`AI_TIMEOUT_MS=90000` 示例，已移除过时的 DashScope 配置。当前本机 `.env.local` 的模型和超时也为此值；只调整了超时项，API Key 原字节未变，未输出其值。无效超时配置回退到 90000 ms，允许 1–180000 ms 的整数。真实恢复测试的失败服务使用独立占位凭据 |

## 本轮实现范围与实际状态

首次访问现在直接进入真实衣橱，不再显示衣橱选择页；此前主动切换到示例模式的浏览器仍保留该选择，页面顶部可在真实和示例模式间切换。新增/调整的模式隔离页面测试在独立端口 **PASS，3/3**；这项改动不清理或迁移浏览器数据。

| 排班要求 | 实现 / 验证位置 | 状态 |
| --- | --- | --- |
| 可替换视觉模型、统一请求和错误结构 | `src/modules/recognition/infrastructure/ai-provider.ts`：OpenRouter 适配器、模型环境变量、超时、输入任务及结构化解析 | 代码/契约测试 **PASS**；当前 Qwen 模型三项真实接口验收 **PASS，3/3**；具体结果见下方测试表 |
| 衣物识别返回与 02 Schema 一致的资料，未知值按 02 约定 | `recognitionCandidateSchema`、`recognizeGarment()`；`tests/round3/ai-contract.test.ts`、`tests/recognition/route.test.ts` | 当前 Qwen + 合成衣物图真实识别 **PASS**，34.4 秒；候选字段通过 API Schema 校验，材质返回“不确定”。用户提供的鞋子实拍图后来也通过真实识别接口与页面流程，识别为 `shoes`；其他真实类别和不同背景的准确度仍需扩样。针对用户遇到的格式错误，请求已启用 JSON 输出，并归一化中文类别、空值和无法判断的厚薄；不支持的类别仍拒绝 |
| 上传后自动识别、用户确认后真实保存衣物资料 | 衣橱页先验证图片并生成识别用 JPEG，随即并行启动 OpenRouter 识别与本机白底处理；结果填入可编辑的名称、类别、颜色、版型、厚薄、材质、风格标签和描述，用户确认后才调用第二轮 `wardrobe.add/update`；失败后可用“重新识别衣物”再请求 | 当前 Qwen + 用户此前提供的鞋子实拍图真实页面验收 **PASS**：识别结果显示在表单→用户修改→首次 IndexedDB 保存故障→重试成功；刷新后仅 1 件衣物与 1 张图片。识别中用户已手改的字段不会被晚返回的候选覆盖 |
| 灵感图片分析及确认后的创建/更新 | `POST /api/inspiration/analyze`；灵感页保存到第二轮 `inspiration.create/update`；每条标签可改文字、类型或删除，也可补加标签 | 合成服装真实分析→确认保存→首次 IndexedDB 保存故障→重试成功；刷新后仍有 1 条灵感和 1 张图片，**PASS**。真实穿搭照片分析见测试表；逐条标签编辑、保存、刷新复核 **PASS** |
| 给 05 提供结构化推荐通道 | `POST /api/recommendation`；按第 2 轮完整衣物 Schema 校验输入，拒绝重复、已删除和暂停衣物；只接受明确的知识规则和已知条件字段，不把数据库元信息发送给模型；拒绝模型返回重复或衣橱外的 ID。无参考图时 JSON 保持兼容，有已启用的参考图时随 multipart 请求发送实际图片字节 | 新增参考图边界与真实视觉输入测试已通过；当前 Qwen 在收紧后的接口上使用公开穿搭参考图真实推荐 **PASS，HTTP 200，34.2 秒**，返回两件输入衣橱中的 ID。05 只传实际启用的条件，并按第 2 轮服务再次校验、保存结果；接口契约已发给 05，待回复确认 |
| 处理中、成功、失败、超时与稳定错误 | API 返回 `requestId` 与 `{ ok, error: { code, message, retryable } }`；识别路由区分验证、未配置、超时、服务错误和无效响应 | 模拟供应商拒绝、断网、超时、畸形响应、取消和未配置 **PASS**；真实认证拒绝页面提示/重试 **PASS**；真实 OpenRouter 断网和超时尚未触发 |
| 防止旧图片/旧请求覆盖新结果或离页保存 | `e2e/inspiration-race.spec.ts` 两项真实组件生命周期测试：换图后旧响应过期、离页后不更新/不保存且无未处理拒绝 | **PASS**（2 项） |

## 白底图片处理与 BiRefNet 状态

BiRefNet Lite 技术 Spike **已完成实测验证**，见 [BiRefNet Spike 报告](../spikes/BiRefNet-browser-spike.md)。固定模型 SHA-256 为 `eff9216bb2f9d3f023d9c2b7196845a7485739ab1f231593633e4d2344ffc516`；ONNX Runtime Web 1.31.1 在本机 Chrome WebGPU 和 WASM 均完成推理，6 张夹具通过，WebGPU 实拍图约 0.52 秒/张、WASM 约 4.4 秒/张。Spike 同时确认 512 像素输入会限制细边缘、模型不是衣物分类器，Safari 未验证。

**正式衣橱图片流程现已完成接线与页面级验证。** 固定依赖 ONNX Runtime Web 1.31.1，模型和 MIT 许可证放在 `public/models/birefnet/`。新增的浏览器处理模块按 Spike 使用 RGB 512×512、ImageNet NCHW 归一化、logits sigmoid alpha、原图尺寸遮罩重采样和白底合成。WebGPU 优先；不支持或 session 初始化失败时尝试 WASM，WebGPU 推理失败也降级重试 WASM。模型加载或推理均失败时 `prepareImage` 保留现有图片处理结果，衣橱新增/编辑仍用同一第二轮保存接口。

兼容性：`prepareImage(file, signal?)` 参数和原有 `PreparedImage` 字段均保留，`backgroundRemoval` 是可选新增字段；未知/不支持的设备不会阻断上传，页面会区分抠图成功与原图回退。测试在隔离 Chromium context 中实际运行本地模型，确认抠图白底 Blob 保存且刷新后仍可见；另拦截模型请求验证回退与保存。模型约 94 MiB，仅图片处理时从同源静态路径加载。WebKit 引擎白底预览也已通过；用户在实际 Safari 手动确认上传和保存可用，Safari 白底效果、其他 GPU 与更多真实衣物照片仍需复核。

本次补充“重新处理白底图”：衣橱新增/编辑弹窗只在当前上传的**原始 `File`** 仍在内存中时显示入口；重新处理直接以该文件调用本地模型，不把已有白底预览当成原图。失败时保留之前成功的白底图。第 2 轮图片数据只保存处理后的图片，未保存原图；关闭弹窗或保存后会丢弃内存中的原始文件。此后编辑已保存衣物如需重新抠图，必须由用户重新选择原照片；不会伪称可从已保存白底图恢复原图。真实模型页面测试覆盖首次加载失败后重试成功、保存后入口消失。

## 测试与证据

此前已执行并通过的相关检查记录：

| 检查 | 命令 / 范围 | 结果 |
| --- | --- | --- |
| 全部 Vitest（含 BiRefNet、推荐输入边界和 OpenRouter 失败场景） | `npm test` | **PASS，123/123**，19 个测试文件；2026-11-12 本轮最终复跑 |
| 正式衣橱 BiRefNet 页面接线 | `npm run test:e2e:birefnet` | **PASS，3/3**：真实模型白底图保存/刷新；模型加载失败回退并保存；保留原始上传文件时重新处理、保存后入口消失 |
| 推荐 API 输入边界 | `tests/round3/recommendation-input.test.ts`，纳入完整 Vitest | **PASS，15/15**：第 2 轮完整衣物字段、暂停/删除/重复过滤、知识及条件字段白名单、输出 ID 校验；参考图必须与启用的 ID 一一对应，图片实际进入模型，缺图、多图、伪装图片和远程 URL 均在调用前拒绝 |
| 收紧后推荐接口的真实视觉调用 | 当前本机服务 `POST /api/recommendation`，公开穿搭照片 `tests/fixtures/real-outfit-cc0.jpg`，虚构的白衬衫和深色长裤 | **PASS，HTTP 200，34.247 秒，Schema PASS**；`qwen/qwen3.8-max-0902` 返回 `test-shirt-01`、`test-trousers-02`，均在输入衣橱中且无重复。理由引用参考图的层次和配色，但没有把图中服饰当成候选；只调用推荐接口，没有重跑已通过的识别、灵感真实调用 |
| 灵感标签逐条编辑和并行识别 | `npx playwright test --config=playwright.parallel.config.ts` | **PASS，2/2**：灵感标签文字/类型修改、删除、添加、保存及刷新复核；衣物识别与本机白底并行，结果回填 |
| 真实穿搭灵感照片分析 | 本地 `POST /api/inspiration/analyze`，使用 `tests/fixtures/real-outfit-cc0.jpg` | **PASS，HTTP 200，28.7 秒**；返回“拼色毛皮大衣街头造型”、9 个涵盖配色/风格/版型/层次/场景的标签和非空分析。图片来源、许可及哈希见 `tests/fixtures/README.md`；这是真实 OpenRouter 请求 |
| 真实故障后恢复配置并重试 | `npx playwright test --config=playwright.openrouter-recovery.config.ts` | **PASS，1/1，33.0 秒**：独立服务用无效占位凭据收到真实 OpenRouter 认证拒绝（HTTP 502）；网页显示错误并保留图片。第二次请求使用本机有效服务配置，真实 OpenRouter HTTP 200，分析结果回填且错误消失。未改动用户的密钥 |
| WebKit 引擎与实际 Safari | `npx playwright test --config=playwright.webkit.config.ts`；用户在 macOS Safari 手动试用 | Playwright WebKit 白底预览 **PASS，1/1**，其 IndexedDB Blob 写入仍报 `UnknownError`。用户于 2026-11-12 报告在实际 Safari 可上传并保存衣物；这是用户手动验收，不等于 Playwright WebKit 自动化通过，亦未单独确认 Safari 白底效果及刷新后的持久化 |
| GitHub Pages 静态白底模型交付 | `bash scripts/install-birefnet-model.sh --verify out/models/birefnet/model_fp16.onnx`；`npx playwright test --config=playwright.pages.config.ts --grep '静态网站加载固定 BiRefNet'` | 本地静态导出模型字节数、SHA-256 **PASS**；浏览器从 `/wearwise` 子路径真实加载模型、完成白底抠图、保存并刷新复核 **PASS，1/1**。发布工作流已加入固定下载与双重校验；线上 Pages 要等 PR 合入 main 后才能验证 |
| 自动识图页面和保存失败重试 | `npx playwright test --config=playwright.ai-live.config.ts --grep '真实识别候选'`；隔离 Chromium context | **PASS，1/1**：上传后自动请求当前 Qwen，用户修改候选后保存；保存失败可重试，刷新后数据保留。验收超时设为 90 秒；本机 60 秒时限的一次调用曾返回 `AI_TIMEOUT` |
| 用户此前提供的鞋子实拍图复验 | 将 `截屏2026-11-08 03.47.04.png` 转 JPEG 调用 `/api/recognition`；再通过 `WEARWISE_TEST_IMAGE` 在上述 Playwright 页面测试中上传原 PNG | **PASS，2/2**：接口 HTTP 200，约 25.2 秒，识别为 `shoes` 并返回通过 Schema 的候选；网页上传→本机白底处理→自动识别→用户修改→注入一次保存故障→重试→刷新后仅 1 条衣物和 1 张图片，Playwright 约 24.6 秒。测试使用独立浏览器 context，未改用户现有衣橱数据 |
| 衣物识别提速与页面回填复验 | 当前 Qwen 识别请求设置 `reasoning.effort=minimal`；`e2e/wardrobe-parallel.spec.ts`；同一鞋子实拍图的真实 OpenRouter 请求和 `e2e/live/ai-save.spec.ts` | **PASS**：最低推理强度直调约 14.2 秒，HTTP 200 且字段可解析；并行与回填页面测试 1/1，证明识别请求在白底模型加载期间已发出、版型和描述可编辑、提前修改的名称不被覆盖、确认后才保存；真实网页流程 1/1，约 15.4 秒。之前同图直调约 25.2 秒、网页约 24.6 秒；这些是单次实测，云端耗时会波动。`effort=none` 被当前端点以 HTTP 400 拒绝，已撤回 |
| 真实灵感分析页面确认、保存失败重试与刷新持久化 | `npx playwright test --config=playwright.ai-live.config.ts --grep '真实灵感分析'`（此前页面验收） | **PASS，1/1**；未因本次衣橱自动识图改动而重跑 |
| 图片切换和页面离开竞态 | `npx playwright test e2e/inspiration-race.spec.ts` | **PASS，2/2** |
| 当前模型真实 API 验收 | `npx playwright test --config=playwright.qwen-acceptance.config.ts`；OpenRouter、合成衣物图、虚构测试衣橱 | **PASS，3/3 HTTP 200，Schema 3/3**。识图 34.4 秒：名称“短袖连衣裙（Polo门襟）”、dress/红色/直筒宽松/light，材质“不确定”；灵感 41.8 秒：返回 10 个配色/风格/版型/层次/场景标签及分析；推荐 5.7 秒：返回 `test-shirt-01`、`test-trousers-02`，均属于输入衣橱。当前模型 `qwen/qwen3.8-max-0902` |
| 真实 OpenRouter 错误页面与重试 | `npx playwright test --config=playwright.openrouter-auth-retry.config.ts` | **PASS，1/1**：临时服务使用无效占位凭据，真实 OpenRouter 认证拒绝映射为通用 502；页面显示错误、保留图片，点击重试后再次请求并再次显示错误。未使用个人密钥，未进入模型推理 |
| OpenRouter 错误适配器与三个业务路由 | `npx vitest run tests/round3/ai-provider.test.ts tests/round3/openrouter-route-failures.test.ts tests/recognition/route.test.ts` | **PASS**；模拟 401/429/503、网络断开、超时、畸形响应、缺配置、取消及错误信息不泄漏；覆盖中文类别、空值、无法判断厚薄、字符串警告和当前 Qwen 最低推理强度；未发起真实故障请求 |
| 类型检查 | `npm run typecheck` | **PASS**（本次最终重跑） |
| 生产构建 | `npm run build` | **PASS**（本次最终重跑） |
| Patch 空白与冲突标记检查 | `git diff --check` | **PASS** |
| 本地转发头兼容回归 | Next.js 自动补入与 Host 匹配的 `x-forwarded-host`；非本机目标仍拒绝 | **PASS，2/2**；识别路由的来源校验已修复 |
| 第 5 轮接收方联调与独立复验 | 需 05 在固定候选 SHA 上执行 | **NOT_RUN** |

衣橱真实模式上传图片会自动发送到所配置的 OpenRouter 模型，文件选择旁会提示此事和可能费用；示例模式不会自动调用 AI。真实验收使用过合成图片、CC0 公开穿搭照片、虚构衣橱，**也使用过用户此前提供的鞋子照片进行真实 OpenRouter 识别**；旧记录中“没有发送个人照片”的说法不准确，现已纠正。成功模型调用按 OpenRouter 账户规则计费；认证失败用无效占位凭据完成，没有触发推理。05 独立验收尚未执行；CI 结果以 PR 页面最新检查为准。

## 交给第 5 轮的调用入口

- `POST /api/recommendation` 的 `input` 为 `{ wardrobe: Garment[], knowledge: { version?: string, rules: string[] }, conditions: { memory?: string[], weather?: WeatherSnapshot, preference?: { text: string, imageIds: string[] }, scene?: string, feedback?: { choice: 'like' | 'dislike', reason: string }[] } }`。没有参考图时沿用 `application/json`；本次喜好已启用且 `imageIds` 非空时用 `multipart/form-data`，字段 `input` 为上述 JSON 字符串，每张图片字段名 `image:<imageId>`，必须与 ID 一一对应。最多 6 张，每张不超过 4 MiB，仅 JPEG/PNG/WebP；可只有参考图、没有喜好文字。远程 URL、不匹配 ID、未启用却附图均拒绝。衣物使用第 2 轮 `Garment` Schema，服务端只把推荐必需字段和图像字节送给 OpenRouter，不发送本地图片 ID 和数据库元信息。成功：`{ ok: true, data: { garmentIds: string[], reason: string }, requestId }`；失败：`{ ok: false, error: { code, message, retryable }, requestId }`。
- Provider 业务接口：`recommend({ wardrobe, knowledge, conditions, referenceImages? }, signal?)`；`referenceImages` 为已授权 Blob 数组。旧的三字段调用仍可用，模型 ID 来自服务端 `AI_MODEL`。
- 05 应从第 2 轮 `newRoundContext()` 的已启用草稿或 `adjustmentContext()` 的已应用条件中取得允许的 `imageIds`，只读取对应的浏览器 Blob，关闭的条件不要放入请求；服务端不按 ID 查询浏览器数据库，也不抓远程图片。现有 `services.wardrobe.image(id)` 可读取共用媒体表，但专用 session 只读入口是否需要增加，已在 [05 任务讨论](https://github.com/dinggegu-dot/wearwise/issues/15#issuecomment-6806776092) 请求确认，**尚无 05 回复，不能记作已确认/签收**。本接口检查输入衣物未删除、未暂停且无重复，并检查返回 ID 属于本次输入衣橱；05 必须在保存前按第 2 轮服务再次验证实时状态、场景规则及来源条件。
- 除推荐 API 外，衣物识别与灵感接口分别为 `/api/recognition` 和 `/api/inspiration/analyze`。所有真实调用仍需使用者自行配置密钥并明确启用。

## 未完成项与接力条件

1. BiRefNet Spike、衣橱业务接线、原图仍在内存时的白底重处理、Chromium 保存及 WebKit 白底预览已验证。用户报告在实际 Safari 手动上传并保存成功；白底效果和刷新持久化尚未由用户确认。Playwright WebKit 27.2 的 IndexedDB Blob 写入仍报告 `UnknownError: Error preparing Blob/File data to be stored in object store`，不能以此断言实际 Safari 也有问题。未改动第 2 轮数据库层。其他 GPU、低内存手机、更多真实衣物照片与细边缘效果仍待验证。模型不是衣物分类器。
2. 当前 Qwen 模型的真实识别、真实穿搭灵感、推荐调用及 Schema 已通过；真实认证拒绝后**恢复有效配置并在页面重试成功**也已通过。真实 OpenRouter 断网和超时尚未人为触发，错误映射由模拟上游测试覆盖。用户报告的一张上传照片触发格式错误，未取得该照片和原始模型响应，无法确认具体字段；已针对可识别的响应格式差异修复，并用用户此前提供的鞋子实拍图通过真实接口和完整网页流程复验。报错的原照片仍需用户在本地重新验证。
3. 第 2 轮数据契约只保存处理后的衣物图片。关闭编辑窗或保存后，重新处理白底图须重新上传原始照片；不能从已保存白底图恢复原图。05 传入推荐时需从第 2 轮服务读取当前可用衣物，并在调用前根据四项开关过滤条件。本接口不自行读取浏览器数据库。
   临时参考图的视觉输入通道已实现并通过真实调用；05 的调用方仍须按已启用条件读取图片，接口契约和读取边界待 05 回复确认，不能把本次本地测试当作跨成员联调。
4. 模型权重约 94 MiB，不进入普通 Git 提交。[模型交付与缓存方案](../spikes/BiRefNet-model-delivery.md)记录固定来源、版本、SHA-256、MIT 许可和浏览器缓存现状。PR 检查及 GitHub Pages 发布已共用固定下载/校验脚本；导出后的模型和静态网页抠图保存已本地实测。团队计划 12 轮结束后才合并，故**当前线上 Pages 仍是旧版本**；本 PR 合入 main 后才会触发含模型的发布，并需再核对线上 URL 与实际白底效果。其他托管环境仍须自行运行同一安装步骤。
5. 05 接收后需实测 `/api/recommendation` 的结构化响应、坏 ID 拒绝和断网/超时错误，并记录固定 SHA、实际模型配置状态及本机结果。

## 接收签收

待 05 在自己的电脑检出 PR 当前 head 提交并完成最短复验后填写；本交接候选不代表签收或合并。
