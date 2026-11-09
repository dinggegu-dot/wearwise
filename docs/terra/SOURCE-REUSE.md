# WearWise 开源复用清单（供 Terra 直接实施）

> Terra 历史选型与复用研究。实际采用和许可证见 [第三方源码声明](../../THIRD_PARTY_NOTICES.md)，当前开发按 [12 轮次排班](../project/ROUND-SCHEDULE.md)。

版本：Terra-r1；核查日期：2026-11-05。用户要求优先借鉴开源、快速完成。本文件明确具体复用对象，不要求执行者重新从零调研。与同目录 `ARCHITECTURE.md` 配套。

## 1. 结论

推荐 **保留现有 WearWise Next.js/React/Dexie 底座，采用 MIT 项目的图片处理代码、天气映射、识别请求取消模式和推荐测试用例，补齐接线与数据一致性**。不是重新编写整个系统，也不是整体搬来三个不同应用。

可以直接部署的完整底座首选候选是 Wardrowbe；但它依赖 Python/FastAPI、PostgreSQL、Redis/arq 和认证，改成本地 IndexedDB、三页和无密钥演示并不直接。Wearly 的栈最接近，不过源码明确使用 localStorage 并吞掉保存错误；用它整体替换会丢掉当前持久化/事务要求。此推荐是源码层面的改造成本判断，未通过两条路线实际开发计时验证。

本轮核查：官方 GitHub 仓库元数据、文件树、LICENSE、package.json 和下列具体源码；没有安装、运行或部署这些第三方项目，没有下载模型。下文所有“采用”是 Terra 实施指令，**不是已完成复用或已运行证明**。

## 2. 固定来源

| 项目 | 核查时 main 提交 | 许可与维护信号 | 角色 |
|---|---|---|---|
| [Closet Kit](https://github.com/giovannieverduin/closet-kit) | `b2cc6b21a7fbda0f73a0ce20aa7b574109494e93` | 根 LICENSE：MIT，2026 Giovanni Everduin；未归档；API 的 pushed_at 为 2026-06-30 | 图片处理代码主要供体 |
| [Wearly](https://github.com/madisonsiy/wearly) | `66f4c1351eb8368d7cddf0e885f5a957ce25835f` | 根 LICENSE：MIT，2026 Wearly contributors；未归档；pushed_at 为 2026-10-11 | 天气映射、候选交互和测试供体 |
| [Wardrowbe](https://github.com/Anyesh/wardrowbe) | `1ba57a87e8ea6e57c3feaca58bd65b37f79505aa` | 根 LICENSE：MIT，2026 Anish S.；未归档；pushed_at 为 2026-11-03 | 完整底座备选、流程参考 |

这些日期只证明仓库活动，不证明运行质量、安全审计或持续维护承诺。Terra 使用以上固定提交，防止开发中上游漂移；确需换提交，在复用记录中写明新 SHA 与原因。

## 3. 逐文件采用方式

### OS01：直接改造图片缩放函数，优先做

- 源码：[Closet Kit / lib/imageClient.ts](https://github.com/giovannieverduin/closet-kit/blob/b2cc6b21a7fbda0f73a0ce20aa7b574109494e93/lib/imageClient.ts)，blob `74ef4fde8438949466df8d3fcf0f914b97097d6d`。
- 已读函数：`fileToJpeg`、`rotate90`、`compressTransparent`。源代码采用浏览器图片解码、Canvas 缩放、JPEG/透明图压缩，没有这个模块自身需要的新 npm 包。
- 目标：`src/modules/media/infrastructure/browser-image-processor.ts`。
- 直接复用 `fileToJpeg` 的解码—等比缩放—Canvas 输出主干；按本项目 `PreparedImage` 接口返回 Blob 和尺寸，预览由 object URL 管理。
- 必须补：输入大小与字节格式校验、静态格式限制、解码像素上限、取消信号、白底处理透明图、`toBlob(null)` 失败、输出大小上限、URL 回收；避免保存重复的 base64/data URL 副本。
- 原源码关于 EXIF 方向的注释也承认部分平台有差异：用正式 Chrome 的带方向样本实际验证，不承诺未测试的 Safari 行为。无自动抠图需求，不搬 rotate90 的交互或背景处理依赖。
- 验收：1600px 边界、坏文件、伪 MIME、空文件、超限、取消和方向样本。输出只入本地，AI 调用由另一个显式操作触发。

### OS02：直接采用 WMO 映射与图标分类

- 源码：[Wearly / src/lib/weather.ts](https://github.com/madisonsiy/wearly/blob/66f4c1351eb8368d7cddf0e885f5a957ce25835f/src/lib/weather.ts)，blob `e98a47a6dc5345de716b4d5ec318e219d7791fbd`。
- 已读：`forecastUrl`、`parseOpenMeteo`、`describeWeatherCode`、`weatherEmoji`。映射/图标集中在约第 120–151 行，实施前核对固定文件。
- 目标：`src/modules/weather/domain/weather-code.ts`。
- 直接复用 WMO code 分组/映射，改中文文案并用已安装 Lucide 图标。未知 code 明示“天气状况未知”，不假装晴天。
- `parseOpenMeteo(json: any)` 不原样采用：当前只要六城 current 字段，沿用 WearWise 的 Zod 边界校验；固定坐标，不搬 GPS、地理编码或加拿大日程/风寒风险模块。
- 验收：0、1–3、雾、雨、雪、雷暴和未知 code 的映射及真实响应契约测试。

### OS03：移植推荐的关键行为用例

- 源码：[Wearly / tests/engine.test.ts](https://github.com/madisonsiy/wearly/blob/66f4c1351eb8368d7cddf0e885f5a957ce25835f/tests/engine.test.ts)，固定版本可数到 30 个 `it`；**本轮未执行这些测试**。
- 对照源码：[outfit.ts](https://github.com/madisonsiy/wearly/blob/66f4c1351eb8368d7cddf0e885f5a957ce25835f/src/lib/outfit.ts) 中 `buildOutfit`、`pickBest`、`recommendOutfits`。
- 目标：`tests/recommendation/engine.test.ts`。
- 移植并适配这三类断言：只引用拥有且可用的衣物、热天不带不必要外套、存在合法替代组合。增加本项目的确认状态/排除时间、连衣裙路线、低温缺外套、严格最多两套、温度阈值、稳定排序和 ID 合法性。
- 保留现有 WearWise 五类衣物/四档保暖规则，不整体搬来 Wearly 的加拿大多层分类、健康风险阈值、购物预算和日程计划，也不通过换掉本项目验收来迎合上游算法。
- 原 `combos()` 会构造组合数组；本项目采用候选流式枚举、仅维护前两名，避免大量中间数组。算法小改以性能测试验证，不另造推荐模型。

### OS04：复用识别请求取消结构和候选确认交互

- 源码：[Wearly / src/lib/ai.ts](https://github.com/madisonsiy/wearly/blob/66f4c1351eb8368d7cddf0e885f5a957ce25835f/src/lib/ai.ts) 的 `chat`、`recognizeGarments`；[WardrobeView.tsx](https://github.com/madisonsiy/wearly/blob/66f4c1351eb8368d7cddf0e885f5a957ce25835f/src/components/WardrobeView.tsx) 的 `pending` 和确认后 `add` 流程。
- 目标：`recognition/infrastructure/qwen.ts`、`recognition/ui/recognition-review.tsx`。
- 采用 AbortSignal 合并上游超时和用户取消的结构；采用“暂存候选—修改—确认”交互。读取与保存仍走本项目服务。
- 不搬源项目的“400 时静默再试一次”、供应商原始错误返回、任意形状 JSON 宽松解析、自动猜类别，以及失败后静默下载本地模型。每一次重试都是新请求，必须用户主动触发并计入调用限额。
- Qwen 提示词只要求单件主体及本项目白名单字段；模糊/非衣物返回明确拒绝或不确定结果，保暖无法判断允许 `unknown`。

### OS05：现有项目资产优先复用

- 当前本地 `wardrobe`、`weather`、`recommendation`、`feedback`、`database.ts` 和 Qwen 适配器：复用接口与已有逻辑，按架构增量补全。
- 远程 [next.config.ts](https://github.com/dinggegu-dot/wearwise/blob/b97d95759986bcc901799f4700b61e45039cf86b/next.config.ts)、[pages.yml](https://github.com/dinggegu-dot/wearwise/blob/b97d95759986bcc901799f4700b61e45039cf86b/.github/workflows/pages.yml)、[pr-checks.yml](https://github.com/dinggegu-dot/wearwise/blob/b97d95759986bcc901799f4700b61e45039cf86b/.github/workflows/pr-checks.yml) 已实际读取；不要把本地缺少的配置当成需要从零发明。
- PR #19 固定 head `1b9891de89b87a4f7dbab1a2fc77cc7daf56d10a` 仍未合并；本轮已读差异，包含 requestId 防重复、count/filter 和 7 个 fake-indexeddb 测试。可在用户授权的项目副本比较复用，不依赖该成员继续工作，不自动合并。其作者报告的测试不算 Terra 自己的验证。

## 4. 为什么不直接整体换底座

| 备选 | 源码/官方核查的关键问题 | 决定 |
|---|---|---|
| 整体 Wardrowbe | `frontend/package.json` 和后端架构含 Next 14、认证、FastAPI、PostgreSQL、Redis/arq；功能多但不是当前本地优先模型 | 若用户选择接受服务器和数据架构变更，可以另案直接部署；本方案只参考流程，不引入其整套基础设施 |
| 整体 Wearly | `src/lib/storage.ts` 明确写 localStorage；保存失败被吞，继续内存；照片可变大 data URL；`localVision.ts` 动态从 CDN 导入模型库并下载模型 | 不整体替换；复用独立纯函数/用例/交互，保留可靠的 Dexie 保存与错误路径 |
| 整体 Closet Kit | `package.json` 含 Anthropic SDK、Notion、Vercel Blob，Next 14/React 18；用途偏个人托管造型与导入 | 只采用无额外依赖的浏览器图片函数 |
| [closet-v3](https://github.com/kuil09/closet-v3) | 描述很贴近 Dexie+Pages，但 GitHub API 的 license 为 null，本轮未找到已核实的授权依据 | 仅作产品思路参考，不复制源码；不能把公开可见当成许可 |
| [wardrobe-hq/wardrobe](https://github.com/wardrobe-hq/wardrobe) | AGPL-3.0、Nuxt/服务端数据，与本次既定栈不同 | 不直接复制；需要时先说明许可义务与变更范围 |
| [bek-sam/wardrobe_ai](https://github.com/bek-sam/wardrobe_ai) | MIT，Next/Supabase；大量认证、云存储、任务处理与账户流程 | 不为小型本地 MVP 增加 Supabase/认证体系；有明确需要时再局部核查和采用 |

上述“未核查”不能被 Terra 改写为“安全、免费、可直接商用”或“不可用”。项目自己的源码许可仍需用户决定，不能因为引入 MIT 片段就擅自给整个 WearWise 指定许可。

## 5. 许可证与来源落地（随采用动作完成）

凡复制/改编 OS01–OS04 源码或测试，Terra 必须在同一次本地改动完成：

1. `third_party/licenses/closet-kit-MIT.txt` 与 `third_party/licenses/wearly-MIT.txt`：保存固定提交的完整 LICENSE 原文及原版权行。若实际复制 Wardrowbe 再加入其 LICENSE。
2. `THIRD_PARTY_NOTICES.md`：列来源 URL、提交、原路径、目标路径、复制/改编范围、改动摘要、许可证路径。未采用的只列研究参考，不能谎称已复用。
3. 在改编文件头保留简短来源/许可指针，不删除上游已有版权声明。不要复制 logo、产品截图、私人照片、商品目录或未经确认权利的测试图片。
4. 本地查看/下载公开源码用于本次设计和经确认实现；不执行陌生安装脚本，不自动安装模型和工具，不提交到外部。新增 npm 依赖仍按具体授权办理。

没有必要为了“复用比例”硬搬代码。每个模块先看指定源文件；适配成本高于当前实现时保留现有逻辑，在 notices 或进度写明判断。以真实端到端可用性和验收为完成标准。

## 6. 官方接口依据

- [Open-Meteo 定价与限制](https://open-meteo.com/en/pricing)：免费托管端点用于非商业，存在限额且无可用性保证；需来源署名。数据许可不等于托管服务无限免费。
- [百炼视觉理解](https://help.aliyun.com/zh/model-studio/vision)、[结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output)：地域、模型和 JSON 模式必须按账号核实；业务 Schema 仍自行校验。
- [Next.js 静态导出](https://nextjs.org/docs/app/guides/static-exports)、[basePath](https://nextjs.org/docs/app/api-reference/config/next-config-js/basePath)：静态包不能承载动态识别 API；子路径属于构建配置。
- [Dexie 事务](https://dexie.org/docs/Dexie/Dexie.transaction())、[增量迁移](https://dexie.org/docs/Version/Version.upgrade())：跨表原子操作与保留历史版本。

所有来源本轮均为文档/源码核查；上游实际运行、模型质量和中国大陆网络连通性没有因此被验证。
