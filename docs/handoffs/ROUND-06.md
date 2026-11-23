# WearWise 第 6 轮交接｜04 穿搭灵感

更新：2026-11-23（北京时间）。本轮基于第 5 轮 [PR #35](https://github.com/dinggegu-dot/wearwise/pull/35) 的固定提交 `b7739ae37585fc9dfced36bb8691a22113fad7cd`，在独立分支 `codex/round-06-inspiration` 工作，目标分支为 `codex/round-05-wardrobe`。本轮按层叠 PR 提交，**尚未合并至 `main` 或正式上线**。交付 PR 链接与最终 head SHA 以 GitHub 页面为准。

## 依据与范围

- 使用 2026-11-22 用户更新于 Obsidian 文件夹 `/Users/jinshuyou/2 硕士/项目/6316 WearWise/WearWise 网页功能概述.md` 的新版概述，并核对仓库 `ROUND-SCHEDULE.md`、`RECOMMENDATION-MEMORY-RULES.md`、`ROUND-02-DATA-API.md` 与 UI 04 系列示例。仓库内旧 `WEB-FUNCTION-OVERVIEW.md` 尚未同步新版；团队正式整合时需核对。
- 用户确认的归纳原则：**仅从用户确认后的分析文字提取明确的“喜欢／不喜欢”；纯客观描述不写个人偏好；多张图表达同一喜好时合并来源。**视觉标签本身不证明用户喜欢。
- 本轮只做长期「穿搭灵感」。推荐页「本次喜好」的临时参考图和第 7 轮「我的偏好」管理页保持各自边界。

## 实际完成

1. 补全 `/inspiration` 的图片卡片、主要标签、分析摘要、查看、编辑、删除和空列表。上传或更换图片后自动调用现有 `POST /api/inspiration/analyze`；分析中不能保存，失败保留图片并可重试、换图或取消。AI 初稿可修改名称和分析，标签按新版概述「删除旧标签，再添加新标签」操作；详情展示完整标签。
2. 继续使用第 2 轮 `createServices(mode).inspiration` 的 `create/update/remove/list/image`，没有重建数据库。连续保存沿用 `requestId` 幂等；编辑传 `revision` 防止旧版本覆盖；替换图片须重新分析，成功后更新同一记录；已保存图片刷新可读取。
3. 新增从确认后分析文字提取显式喜好的归纳函数。仅识别明确的喜欢、偏爱、不喜欢、不想要表达；客观分析返回空结果。正反方向进入不同稳定 key；可识别的相同表达合并 `sourceIds`。归纳通过第 2 轮偏好服务写入 `group='inspiration'`，推荐服务在记忆开关开启时读取有效条目、关闭时不读。
4. 增加全量灵感归纳核对：新增、编辑、删除源灵感后重新计算；保留仍由其他照片支持的归纳，移除失去依据的自动条目。用户手改的内容和主动删除的标记得到保护。灵感保存成功而归纳失败时，页面明确区分状态，提供「重试归纳」；刷新页面也会重新核对。
5. 旧分析请求被换图或离页取消后不更新新页面，也不触发意外保存。图片预览和卡片使用的 object URL 在组件清理时释放。
6. 按用户提供的三张界面参考图调整穿搭灵感页面：桌面列表为横向图文卡片，上传弹窗左侧预览图片、右侧编辑名称/标签/分析，底部固定确认区；分析中显示进度与占位内容，失败时保留图片并显示重试入口，确认保存仍禁用。窄屏改为单列。仅调整展示，沿用上述数据与 AI 流程。

## 验证依据

| 验证 | 本轮实际结果 |
| --- | --- |
| 真实 OpenRouter 灵感 API | 使用 `tests/fixtures/real-outfit-cc0.jpg`、本机服务端模型 `qwen/qwen3.8-max-0902`，`POST /api/inspiration/analyze` 返回 HTTP 200；首次接口实测总耗时 29.9 秒、9 个标签、五类 kind 均存在。 |
| UI 调整前真实页面流程 | 隔离 Chrome 浏览器在本机 Node 服务 `127.0.0.1:3012` 上传同一真实照片，**自动**分析、用户修改分析为「喜欢灰白配色，但不喜欢紧身裤」、确认保存并刷新。返回 HTTP 200，端到端 36.4 秒；模型给出 8 个标签、五类 kind，页面和 IndexedDB 中保留 1 条灵感，归纳为「喜欢灰白配色」「不喜欢紧身裤」两条。[页面截图](round06-evidence/real-inspiration-confirmed.png)；该浏览器上下文是新建的，不含用户私人衣橱数据。 |
| **调整后 UI 的真实流程复验** | 在隔离 Chrome 浏览器中，以 `tests/fixtures/real-outfit-cc0.jpg` 上传到调整后的页面，服务端实际调用 `qwen/qwen3.8-max-0902`，`POST /api/inspiration/analyze` 返回 HTTP 200，上传至响应共 **18,478 ms**。模型返回名称「拼色长毛皮草街头造型」、7 个标签，覆盖 `color/style/fit/layering/scene` 五类。将分析手动改成「我喜欢高对比配色，但不喜欢紧身裤。」后确认保存并刷新；IndexedDB 中有 **1 条灵感、1 张图片、2 条有效灵感归纳**，两条归纳的来源 ID 都指向该灵感。[编辑截图](round06-evidence/real-inspiration-current-ui-editor.png)、[保存后截图](round06-evidence/real-inspiration-current-ui-saved.png)、[结构化记录](round06-evidence/real-inspiration-current-ui.json)。没有模拟 AI 响应，也没有使用用户现有业务数据。 |
| 单元测试 | `npm test`：**205 passed，1 skipped**，28 个测试文件通过。新增 3 项测明确偏好提取、客观文本不归纳、多来源合并、编辑/删除保护及推荐记忆开关。 |
| 第 6 轮相关页面测试 | `npx playwright test e2e/round6-inspiration.spec.ts e2e/inspiration-tags.spec.ts e2e/inspiration-race.spec.ts`：**8/8 passed**。覆盖自动分析成功/失败、旧请求、离页、标签删加、保存失败重试与幂等、冲突草稿、换图后重分析、刷新和归纳。自动化中的 AI 响应为测试模拟，**不能冒充真实 OpenRouter 调用**；真实调用证据见上两行。 |
| 本次 UI 对照 | 使用隔离 Chrome 浏览器和真实穿搭照片检查了[列表](round06-evidence/inspiration-ui-list.png)、[确认弹窗](round06-evidence/inspiration-ui-modal.png)、[分析中](round06-evidence/inspiration-ui-processing.png)、[失败](round06-evidence/inspiration-ui-failure.png)的桌面布局。这四张**只用于视觉检查，AI 响应为测试替身**；真实调用依据见上方两项真实页面流程。修改后重新构建，再跑相关页面测试为 **8/8 passed**。 |
| 完整浏览器回归 | `npm run test:e2e`，**54/54 passed**，包含第 6 轮 8 项、旧 BiRefNet Chrome 与 WebKit 测试、天气及推荐闭环。模型文件 `public/models/birefnet/model_fp16.onnx` 已按固定版本 `18d56c5` 安装，大小 **98,484,532 字节**、SHA-256 `eff9216bb2f9d3f023d9c2b7196845a7485739ab1f231593633e4d2344ffc516`，通过仓库脚本二次校验。文件仅在本机，被 `.gitignore` 排除。 |
| 类型与构建 | `npm run typecheck` 通过；`npm run build` 通过。 |
| 差异检查 | `git diff --check` 通过。 |

### 回归修正与测试边界

- 首次全量回归因本工作副本缺少被忽略的本机 BiRefNet 模型而不能完成模型用例。固定上游下载连接在命令行被重置；随后通过镜像获取**同一固定修订**，按仓库记录的大小与 SHA-256 核验后安装，未更改模型代码或来源版本。
- 旧 BiRefNet 测试仍查找旧成功文案「白底结果已返回」，现页面实际文案是「白底处理完成」；天气／推荐测试的成功模拟响应缺少现有数据契约必需的当天最低／最高温，且两处体感温度文案已变化。已更新这些测试输入与断言，保留原有图片像素、失败回退、城市竞态、缓存、过期和推荐断言；没有删除或弱化测试。
- Mac 上的自动化 Chrome 对原生 `<select>` 按 `ArrowDown` 不切换选项，独立最小 HTML 亦复现。为保证衣橱类别可通过方向键选择，在本工作分支的类别下拉增加明确的上下方向键处理，未修改第 5 轮 PR；原键盘闭环测试保持不变并通过。重新从头运行全量回归，最终 **54/54 passed**。
- 真实 OpenRouter **成功**流程已在调整后的 UI 复验；本轮没有人为触发真实 OpenRouter 认证拒绝或超时。第 6 轮页面的失败保图、禁保存与重试由模拟 502 验证，不能写成真实故障调用；第 3 轮真实故障记录仍是独立证据。

## 修改文件与位置

- `src/modules/inspiration/ui/inspiration-page.tsx`：页面与状态管理。
- `src/modules/inspiration/summaries.ts`：从确认文字提取偏好的归纳规则。
- `src/modules/preferences/index.ts`、`src/shared/infrastructure/round2-stores.ts`：沿用现有偏好库增加归纳全量核对入口。
- `src/app/globals.css`：灵感卡片及弹窗样式。
- `tests/round6/inspiration-summaries.test.ts`、`e2e/round6-inspiration.spec.ts`：新增业务链路测试。
- `e2e/inspiration-race.spec.ts`、`e2e/inspiration-tags.spec.ts` 与相关 `e2e/live/*`：更新测试到「上传后自动分析」「删旧加新」交互，保留原业务断言。
- `e2e/birefnet-business.spec.ts`、`e2e/webkit-media.spec.ts`、`e2e/weather.spec.ts`、`e2e/recommendation.spec.ts`：同步当前白底文案与天气响应契约，保持原测试场景与断言目标。
- `src/modules/wardrobe/ui/wardrobe-fields.tsx`：类别下拉支持方向键选择，修复完整键盘闭环在 Mac 自动化 Chrome 中的失败；属于本分支的小范围跨模块修正，不在第 5 轮 PR 上直接改动。

## 给第 7 轮 02 的数据说明

- 灵感记录仍是第 2 轮 `Inspiration` schema；归纳仍是第 2 轮 `Preference` schema，`group='inspiration'`，内部 `inspiration.key/sourceIds` 用于维护来源。没有新增表或迁移版本。
- 偏好页通过 `services.preferences.listActive('inspiration')` 展示有效归纳，允许用户编辑、删除；用户手改或主动删除后的保护由现有数据服务及本轮核对共同维护。详情页不展示具体来源图或链接。
- 推荐页读取归纳走现有 `session.newRoundContext()` / `adjustmentContext()` 的记忆开关；不要把灵感图片、原始全文再送入模型形成重复偏好。

## 尚需注意

- 当前归纳采用**保守的本地显式语句提取**：可以合并相同或已归一化的表达，但不能保证所有自然语言同义改写都会合并；复杂表达可能需要用户在分析栏改写得更明确。没有把不确定的客观标签推断为喜好。后续若扩展语义归纳，应只处理用户确认文字，保留稳定 key、来源和用户修改保护，并评估新 AI 请求的时延与费用。
- 正式网站的受保护 Node 服务、访问权限和调用限额仍由团队部署负责人决定。GitHub Pages 静态站不能直接运行当前 OpenRouter 灵感接口；密钥只配置在服务端环境，本轮未提交密钥。
- 当前成果经用户授权提交为第 6 轮独立层叠 PR，目标是第 5 轮分支；团队完成后再按轮次整合，不直接改动 `main`。第 7 轮接手时应以该 PR 最新 head 为固定起点，并核对 PR 状态。
