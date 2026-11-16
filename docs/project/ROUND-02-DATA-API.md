# 第 2 轮数据服务接口说明

版本 R02（2026-11-09，北京时间）。依据 [功能概述](WEB-FUNCTION-OVERVIEW.md)、[推荐依据与记忆规则](RECOMMENDATION-MEMORY-RULES.md) 与 [12 轮次排班](ROUND-SCHEDULE.md) 第 2 轮条目。交接见 [ROUND-02](../handoffs/ROUND-02.md)。

页面一律通过服务读写，不直接访问 Dexie：

```ts
import { createServices } from '@/composition';
const services = createServices(mode); // 'real' | 'demo'，两个库互相隔离
services.wardrobe      // 衣橱
services.inspiration   // 灵感库
services.preferences   // 三组长期偏好
services.session       // 推荐页轮次、首页结果、共享城市、草稿与反馈
```

可运行示例：`npx vitest run tests/round2/handoff-examples.test.ts`。全部行为测试在 `tests/round2/`。

## 通用约定

- **原子性**：每个写方法是一次 IndexedDB 事务。抛错即表示什么都没写入，旧状态完整保留。页面捕获错误后提示重试即可。
- **修订号**：衣物、灵感、偏好带 `revision`。编辑时传入读取到的 `revision`，若记录已被别处修改则抛出“已被修改，请刷新后重试”。
- **幂等**：新增类方法可传 `requestId`。同一次保存点击的重试复用同一 ID，只写入一次。
- **日期**：暂停恢复日期、天气日期都是北京时间的 `YYYY-MM-DD`，见 `src/shared/domain/beijing-date.ts`。
- **字段缺失**：输入不符合 schema 时抛出 `ZodError`，不会写入。无法从图片判断的文字字段写 `'不确定'`（`UNCERTAIN`），厚薄写 `'unknown'`。

## 衣橱 `services.wardrobe`

衣物字段（`src/modules/wardrobe/index.ts`）：

| 字段 | 说明 |
| --- | --- |
| `name` `category` `color` | 名称、类别（top/bottom/outerwear/dress/shoes）、颜色 |
| `fit` | 版型，默认 `'不确定'` |
| `warmth` | 厚薄 light/medium/warm/unknown |
| `material?` `styleTags` `description` | 材质、风格标签、自然语言描述（默认空） |
| `imageId` | **白底图引用**。上传原图不保留 |
| `pause?` | `{ since, resumeOn }`。`resumeOn` 为北京日期，当天 00:00 起恢复候选资格。`null` 只来自旧版“永久排除”的迁移 |
| `deletedAt?` | 软删除时间 |

| 方法 | 输入 | 返回 / 错误 |
| --- | --- | --- |
| `add(input, whiteBackground, requestId?)` | 确认后的资料 + 白底图 Blob | 新衣物。缺字段抛 ZodError |
| `update(id, patch, revision?, media?)` | 修改资料；`media={id,blob}` 即替换白底图 | 新记录。旧图若无快照引用会自动清理。“衣物已被修改”/“衣物不存在” |
| `pause(id, resumeOn, revision?)` | `resumeOn` 须晚于北京今天 | “恢复日期需晚于今天”/“请选择有效的恢复日期” |
| `resume(id, revision?)` | 提前恢复 | 新记录 |
| `remove(id)` | 软删除，保留白底图供旧搭配展示 | — |
| `list()` / `count()` / `counts()` | — | 未删除衣物（含暂停）。`counts()` 返回 `{ total, byCategory }` |
| `thumbnails(limit=6)` | — | `[{ id, name, category, imageId }]`，按最近添加排序 |
| `candidates(now?)` | — | 当前可作为新候选的衣物，每次调用重新判断是否到期 |
| `statuses(ids, now?)` | — | `{ [id]: 'available' \| 'paused' \| 'deleted' \| 'missing' }` |
| `image(imageId)` | — | Blob 或 `undefined` |

## 灵感 `services.inspiration`

字段：`imageId`、`name`、`tags: { text, kind? }[]`（kind 为 color/style/fit/layering/scene，用户手动添加的标签可不填）、`analysis`（用户确认后的分析，不能为空）。

| 方法 | 返回 |
| --- | --- |
| `create(input, image, requestId?)` | 新灵感。分析为空即“未确认或分析失败”，抛错 |
| `update(id, patch, revision?, image?)` | `{ inspiration, affectedSummaryIds }`。后者是引用此灵感、且未被用户手改的自动归纳，供第 6 轮重新核对 |
| `remove(id)` | `{ removedSummaryIds, affectedSummaryIds }`。失去全部依据的自动归纳被移除，其他灵感仍支持的保留 |
| `list()` / `get(id)` / `image(imageId)` | — |

## 长期偏好 `services.preferences`

一条记录包含 `group`（explicit/inspiration/feedback）、`content`、`state`（active/deleted）和 `userEdited`；灵感归纳另有 `inspiration: { key, sourceIds }`，永久反馈另有 `feedback: { choice, outfit 快照, roundId, roundFeedbackId }`。

| 方法 | 说明 |
| --- | --- |
| `listActive(group?)` | 有效的长期记录。三组不分优先级 |
| `addExplicit(content)` | 添加明确偏好 |
| `edit(id, { content?, choice? }, revision?)` | 修改后标记 `userEdited`。永久反馈在同一事务中同步本轮反馈副本 |
| `remove(id)` | 明确偏好直接删除；灵感归纳留下删除标记，再次归纳不会恢复；永久反馈连同本轮副本一起移除 |
| `applyInspirationSummaries([{ key, content, sourceIds }])` | 第 6 轮写入归纳：新 key 新增；用户删过或手改过的跳过内容、只更新来源；其余更新内容 |

## 推荐过程 `services.session`

| 方法 | 说明 |
| --- | --- |
| `getCity()` / `setCity(city)` | 首页与推荐页共享的城市。不影响推荐页已应用的天气快照 |
| `getSettingsDraft()` / `saveSettingsDraft(draft)` | 推荐页左侧草稿。首次默认：记忆开、天气开、喜好关且空、场景关且空。保存草稿不生成、不清除本轮 |
| `addReferenceImage(blob)` | 本次喜好参考图，只作本轮或草稿条件，不进入灵感库 |
| `newRoundContext()` | 新一轮可读取的输入：草稿、开启记忆时的长期记录、候选衣物。不继承旧轮临时反馈 |
| `commitNewRound({ weather, result })` | “生成穿搭”成功后调用。`result = { garmentIds, reason, flatLay?, knowledgeVersion? }`。校验衣物可用，按当前衣物生成快照，一次性切换结果、已应用条件和轮次，清理旧轮结果、调整、单次反馈、反馈草稿以及不再被引用的参考图 |
| `readRound()` | `{ round, current, results, feedbackDraft }`，刷新后据此恢复 |
| `adjustmentContext()` | 连续调整可读取的输入：已应用条件、按提交顺序的有效反馈、开启记忆时的最新长期记录、候选衣物 |
| `commitAdjustment({ expectedRoundId, kind, targetGarmentId?, result })` | `kind` 为 swap-outfit/swap-item/feedback-swap。不开新轮、不清反馈。换单件只能替换目标位置，替代须可用，其他位置允许保留已删除或暂停的衣物；换整套须是不同组合且全部可用 |
| `saveFeedback({ expectedRoundId, resultId, choice, reason, scope })` | 成功才生效。`permanent` 同时写入长期永久反馈和本轮。任一处失败都不写 |
| `saveFeedbackDraft()` / `clearFeedbackDraft()` | 未提交的反馈，恢复后仍不生效 |
| `readHome()` / `commitHome({ kind, weather, expectedResultId?, targetGarmentId?, result })` | 首页今日穿搭，独立于推荐页轮次，依据固定为长期记忆加当天天气 |
| `resultStatus(result)` | `{ deleted, paused }`，用于“存在已删除衣物 / 存在已暂停搭配衣物”提示 |

`toWeatherSnapshot(weather, usedFields)` 把页面天气转成“城市 + 北京日期”的快照，含当天最低和最高气温。`basisLabel()` 生成如“深圳 · 11月9日天气 · 上班 · 长期偏好”的依据，只写实际使用的条件。

## 存储与迁移

IndexedDB schema 升至 **v3**（`src/shared/infrastructure/database.ts`），库名不变，`wearwise-real-v1` / `wearwise-demo-v1` 中的 `v1` 不是 schema 版本。新增表：`inspirations`、`preferences`、`results`、`state`。

升级不清空衣橱，按下表改写旧记录：

| 旧数据 | 迁移后 |
| --- | --- |
| `excludedPermanently: true` | 暂停，`resumeOn: null`（需用户手动恢复或补设日期） |
| 未来的 `excludedUntil` | 暂停，`resumeOn` 取不早于原时刻的北京日期 |
| `status: 'archived'` | 软删除 |
| 缺少的 `fit` / `description` | 分别补为 `'不确定'` / `''` |
| `sourceImageId`（上传原图） | 字段移除。未被引用的原图清理，被旧推荐快照引用的保留 |

旧推荐记录和旧反馈原样保留。
