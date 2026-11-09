# WearWise 当前功能、结构与缺口

> 本页记录 2026-11-06 的 #21 基础版。接力开发请从 [第 1 轮交接](../handoffs/ROUND-01.md) 读取当前候选。

版本 team-refresh-r2 · 核查 2026-11-06 · 北京时间。以代码和测试证据描述现状，后续优化方向见 [团队计划](../../team/NEXT-ITERATION.md)。

**目标补充：**用户确认保留原计划中真实衣物照片组成平面穿搭卡片的目标。[流程、分工和验收](OUTFIT-IMAGE-SPEC.md)。#21 推荐 UI 源码已支持按 imageId 读取图片，但真实照片端到端核验不能仅凭示例截图或本文件推断。

## 先分清三个状态

- **已验证候选**：PR [#21](https://github.com/dinggegu-dot/wearwise/pull/21)，产品基线 `92ee865ccf76d545534b8358e5c89288d5305ddf`，分支 `codex/testable-base`。下面的功能指这份候选。
- **main**：核查时仍为 `b97d95759986bcc901799f4700b61e45039cf86b`，是 V0.2 页面框架与协作工作流。#21 尚未合并；文档更新不会自动把候选变成线上产品。
- **线上 Pages**：本轮没有部署或在线业务验收，不能拿旧网页验证 #21 的功能。合并与发布仍按仓库授权流程进行。

PR #19 是 02 号先前的数据实现，未合并；#21 有部分重叠且接口发生变化，保留作者成果，由 02/01 比较后决定复用什么。

## 已经做到什么

| 能力 | 候选中已经实现 | 实际边界 |
|---|---|---|
| 页面与导航 | 首页、我的衣橱、穿搭推荐，桌面及手机适配 | 没有独立灵感/历史/设置页面 |
| 示例模式 | 内置 8 件本地示例衣物，可初始化/重置，配合示例天气走闭环 | 示例与真实衣橱分库，示例不是个人数据 |
| 衣橱 | 手动或照片录入、确认、详情、分类、编辑、替换照片、删除、永久排除及首页数量 | 类别上衣/下装/外套/连衣裙/鞋；无账号/云同步 |
| 图片 | 浏览器本地处理 JPEG/PNG/静态 WebP；旋转、压缩、预览和 Blob 保存 | 输入上限 10 MiB，最长边 1600px；非自动抠图，不支持任意格式 |
| 存储 | IndexedDB + Dexie，衣物/图片事务、版本冲突检查、重复提交防护、故障重试、刷新/重开恢复 | 数据按浏览器和 origin 隔离；清站点数据可能丢失，无导出/导入备份 |
| 天气 | 深圳、广州、上海、北京、成都、杭州；Open-Meteo、体感/时间、过期校验、切城竞态与失败重试 | 固定城市公共坐标；示例需明确选择，不伪装实时天气 |
| 推荐 | 真实衣橱 + 天气 + 两种风格，0–2 套规则推荐、缺失提示与理由；衣橱/城市/风格变化使旧结果失效 | 规则引擎，不是 AI 个性化；尚无用户可操作的单件替换/完整历史浏览 |
| 反馈 | 对推荐记录反馈并刷新恢复 | 没有根据反馈自动训练或学习 |
| 识别基础 | 服务端适配器、能力检测、候选校验/确认及手动降级；模拟链路已测 | 真实 Qwen 默认关闭、未实际验证；Pages 不运行服务端 API |
| 工程流程 | 类型检查、单元/浏览器测试、开发/生产/静态构建，PR 检查与 #20 汇总 | CI 通过不等于成员验收、合并或发布 |

开发模式“无法读取衣橱”的根因是 StrictMode 清理关闭 Dexie 后，同一服务无法自动重开；现允许 `close({disableAutoOpen:false})` 后重开，并把开发模式业务测试加入 CI。没有通过清空用户数据库或关闭 StrictMode 回避问题。

## 结构和数据怎么流动

```text
src/app                         三页路由与服务端 API
  ↓
src/shared/ui + modules/*/ui     公共布局、衣橱/天气/推荐交互
  ↓
src/composition                 根据真实/示例模式装配服务和适配器
  ↓
modules/wardrobe                 衣物 schema、服务、仓储接口
modules/media + recognition     本地图像处理、候选、HTTP/Qwen 适配
modules/weather                 城市、实时/示例天气、校验
modules/recommendation          规则引擎、推荐记录及有效性
modules/feedback + demo         反馈与示例初始化
  ↓
shared/infrastructure           Dexie 仓储与事务
  ↓
IndexedDB: wearwise-real-v1 / wearwise-demo-v1
```

- 数据库当前 schema version 2；库名的 `v1` 不等于 schema 版本。表为 `garments`、`media`、`outfits`、`feedback`、`meta`。
- 衣物用 `imageId` 引用 Blob；`revision` 和 `wardrobeRevision` 防止并发编辑/旧推荐覆盖；`meta` 保存当前批次等状态。保存必须原子完成，失败保留可重试状态。
- 图片选择→本地处理→手动填写或可用时获取识别候选→用户确认→衣物/图片事务；识别候选不直接进入正式衣橱。
- 城市天气→有效性检查→衣橱快照/版本→规则排序→推荐记录→激活与反馈。已删除或排除衣物不得继续当当前有效搭配。
- 前端通过服务使用数据，不直接操作 Dexie。02 负责 schema；其余模块协商端口，避免重复建库或共享文件互相覆盖。
- 普通 Next 服务可提供 `/api/capabilities`、`/api/recognition`；静态 Pages 只提供前端、本地存储与浏览器天气请求，不提供识别服务。
- 技术栈沿用 Next.js/React/TypeScript、Tailwind/Lucide、Dexie/Zod、Vitest/Playwright；实际版本以 `package-lock.json` 为准。当前不需要安装独立数据库服务器。

## 验证证据与限制

历史实际运行见 [验收日志](../testing/ACCEPTANCE.txt)、[基础版范围](../testing/BASE-TEST.md)：49 项 Vitest；正式 Google Chrome 生产/开发各 34 项；Pages 2 项；真实六城天气与闭环 2 项；类型检查和普通/静态构建通过。日志中的源码摘要对应独立验收时的版本；此后修正了 Linux Chrome 的弹窗 alert 选择器，远程 `92ee865…` 的 `Typecheck, build and Chrome` 检查已通过，可在 [PR 检查](https://github.com/dinggegu-dot/wearwise/pull/21/checks) 追溯。

本轮是文档/任务更新，复核了远程状态和证据，没有声称重新运行以上全部产品测试。真实模型、真实识别效果、云同步、付费服务、公开新版部署、所有实际设备兼容性均不属于已验证能力。

## 还没做与值得优化

1. **交付必需**：基础版审查合入、02 旧 PR 差异处理、优化范围锁定、真实成员联调、最终候选独立验收、获授权发布后复测和交接。
2. **优先评估的体验/可靠性**：数据备份恢复、存储错误、录入效率、手机与键盘体验、天气恢复、推荐解释/多样性/性能、反馈可理解性。这些是候选建议，不表示已经决定全部实现。
3. **明显缺口但须选择范围**：真实 AI 效果、灵感分析、自动抠图、单件换搭、历史浏览、更多城市、账户/云同步/自动学习。每项先说明价值、成本、依赖、测试和数据流，再决定是否进入 11 月 20 日版本；不默认全部列为承诺。
4. **资源与质量**：示例目前为有限本地素材；扩大素材需核实来源许可。真实用户可用性与推荐偏好尚无系统评价，大衣橱性能需测量而非推断。

“产品全部完成”指 **双方确定并记录的最终交付范围全部完成并通过验收**。这不是把未完成项悄悄删除：未选/延期/阻塞项均留在总计划，并由用户确认范围；未关闭严重缺陷不能写全部完成。

## 复用与参考

本轮复用既有代码与 GitHub Issues/PR/Milestones，无新增依赖、账户或协作系统。2026-11-06 查阅 [GitHub 里程碑官方文档](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/creating-and-editing-milestones-for-issues-and-pull-requests)、[Dexie close 官方文档](https://dexie.org/docs/Dexie/Dexie.close%28%29)。历史开源核查见 [SOURCE-REUSE](../terra/SOURCE-REUSE.md) 与 [第三方声明](../../THIRD_PARTY_NOTICES.md)：Closet Kit/Wearly 的适用部分已有来源记录，不表示运行过完整上游项目。新增复用先查官方仓库、许可证、维护状态和数据流；没有明确缺口不更换整个技术栈。
