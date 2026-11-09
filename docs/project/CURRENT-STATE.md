# WearWise 第 1 轮候选现状

截至 2026-11-09，团队开发以第 1 轮候选及其后续交接为起点。线上 Pages 对应 `main` 的 V0.2 框架。第 1 轮候选来自 #21 → #22 → #23，已推到 `codex/round-01-baseline`，固定提交 `40d68d94a790e757143739fc84b05477f44d90ff`。 [第 1 轮交接](../handoffs/ROUND-01.md) · [12 轮总计划](https://github.com/dinggegu-dot/wearwise/issues/10)

| 项目 | 第 1 轮实际可用 | 依排班扩展 |
| --- | --- | --- |
| 页面 | 首页、我的衣橱和穿搭推荐可操作。灵感与偏好有路由和框架。 | 灵感、偏好、推荐体验、首页集成由后续轮次接入。 |
| 衣橱 | 手动和本地照片录入、查看、分类、编辑、换图、删除和永久排除。 | 暂停至日期、到期恢复、批量处理和白底确认。 |
| 推荐 | 六城天气、按规则生成 0–2 套、图片展示和喜欢／不喜欢。 | 单套平铺、四项条件、连续替换、长期记忆及跨页独立调整。 |
| 识别 | 有服务端适配器，默认关闭。 | 第 3 轮接真实图片与模型流程。 |
| 数据 | 浏览器 IndexedDB，示例库含 8 件并与真实衣橱隔离。 | 第 2 轮加入灵感、偏好、轮次与快照并验证旧数据迁移。 |

## 数据和服务边界

`src/app` 提供路由，`src/composition` 装配服务，`src/modules` 维护业务接口。Dexie 与事务在 `src/shared/infrastructure`，候选 schema v2 包含 `garments`、`media`、`outfits`、`feedback`、`meta`。衣物以 `imageId` 引用 Blob，现有记录用版本控制编辑冲突。真实识别经服务端入口，静态 Pages 无对应服务端能力。

旧候选改风格或城市会使当前搭配失效，旧反馈按搭配 ID 保存，首页还没有今日穿搭调整。新版以成功生成才换轮、同轮持续使用单次反馈、首页和推荐页调整独立为准。 [第 1 轮范围和旧规则差异](ROUND-01-SCOPE.md) · [功能概述](WEB-FUNCTION-OVERVIEW.md) · [推荐依据与记忆规则](RECOMMENDATION-MEMORY-RULES.md)

## 验证与接手

第 1 轮在 macOS 按锁文件干净安装，类型、49 项单测、生产构建和 34 项正式 Chrome 回归通过。02 在自己的电脑按交接签收；更完整的环境、限制和补测以证据为准。 [验证记录](../testing/ROUND-01-VERIFICATION.txt) · [启动和测试方法](../testing/LOCAL-GUIDE.md)
