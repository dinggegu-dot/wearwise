# 衣物风格／场景标签字段约定（第 2 轮补充）

- 负责人：02
- 依据：
  - 《WearWise 网页功能概述》第 4 版（`docs/project/source/WearWise 网页功能概述4.docx`）
  - 2026-11-16 标签投票（PR #31）
  - **第 5 轮 PR #35 确认的 OUTFIT-TIPS V1.2 词表与字段**（`codex/round-05-wardrobe` 中的 `src/modules/wardrobe/tag-adapter.ts`、`docs/handoffs/ROUND-05.md`）。三者不一致时以第 5 轮为准。
- 分支：`codex/round-02-tags`，基于第 2 轮固定提交 `63efce6`。按 01 的决定单独成 PR #34，合并顺序为 #29 → #34。
- 注意：仓库里的 `WEB-FUNCTION-OVERVIEW.md` 仍是旧版，请以第 4 版 docx 为准。

## 1. 已确定的内容

| 项目 | 约定 |
|---|---|
| 风格 | V1.2 共 9 种：中性风、甜美风、亚文化风、简约风、优雅风、复古风、街头风、运动休闲风、学院风 |
| 场景 | 6 种：学习、上班、约会、朋友聚会、运动健身、户外 |
| 字段 | `styleTags`、`sceneTags`、`styleOther`、`sceneOther`，都是字符串数组 |
| 多选 | 风格、场景各自独立多选 |
| 其他 | “其他”只是填写说明的入口，不算第 10 种风格或第 7 种场景；说明保存原始识别词 |
| 不确定 | “不确定”≠“其他”。不确定、未知、unknown、uncertain、无法判断这类词一律丢弃，对应选择保持为空 |
| 自定义 | 本阶段不开放，保存时只接受词表里的值或“其他” |
| 本次场景 | 先按**单选＋自填**实现。v4 没写明单选还是多选，如果需要多选再调整 |

## 2. 统一词表 `src/shared/domain/tags.ts`

这是唯一的词表文件。衣橱、识别、推荐都从这里读取候选、映射规则和校验，不允许各页面各写一套。

导出的名称与第 5 轮 `tag-adapter.ts` 一致，可以直接替换：

| 名称 | 用途 |
|---|---|
| `STYLE_TAGS`、`SCENE_TAGS`、`OTHER_TAG` | 页面候选项 |
| `TagKind`、`WardrobeTags` | 类型 |
| `mapTag(kind, 词)` | 中文名、V1.2 英文名或无歧义同义词 → 固定值；映射不到返回 `undefined` |
| `resolveTags(kind, 词列表, 已有说明?)` | 整理成 `{ tags, other }`：映射不到的进 `other`，不确定类的词丢弃，已有说明原样保留，有说明时补上“其他” |
| `readTags(记录)` | 读取任意记录（包括旧版、缺字段的）的四个字段，返回整理后的结果，不改原记录 |
| `validateTags(四个字段)` | 不合规时抛出中文提示 |
| `styleChoiceSchema`、`sceneChoiceSchema` | 推荐页只能选固定值时用的校验 |

映射规则：
- **英文名**：Neutral Style、Sweet Style、Subculture Style、Minimalist Style、Elegant Style、Vintage Style、Streetwear、Athleisure、Preppy Style；Study、Work、Date、Friends Gathering、Fitness and Sports、Outdoor。大小写不限。
- **同义词**：中性 / 甜美 / 亚文化 / 简约 / 极简 / 极简风 / 优雅 / 复古 / 街头 / 运动休闲 / 学院 → 对应的“××风”；工作 → 上班；聚会 → 朋友聚会；健身、运动 → 运动健身。
- **不硬归类**：“日常”“休闲”“通勤”等拿不准的词进“其他”。

## 3. 衣物资料

```ts
{
  styleTags:  string[]  // 固定风格值，可含 '其他'
  sceneTags:  string[]  // 固定场景值，可含 '其他'，可以为空
  styleOther: string[]  // 风格“其他”的原始识别词或说明
  sceneOther: string[]  // 场景“其他”的原始识别词或说明
  // 其余字段不变
}
```

保存时的校验：
- 每组最多 12 个标签、20 条说明，每条说明 1–30 字。
- 选了“其他”就必须有说明，有说明就必须选“其他”。
- 只能选固定值，不能重复。

`wardrobe.add()` / `wardrobe.update()` 会先整理再校验。不合规时抛出中文提示，例如“选择‘其他’时请填写对应说明；不确定时请清空选择。”

```ts
await wardrobe.add({ ...资料, styleTags: ['Minimalist Style', 'Y2K'], sceneTags: ['Work', '音乐节'] }, 白底图);
// → styleTags ['简约风','其他']，styleOther ['Y2K']
//   sceneTags ['上班','其他']，sceneOther ['音乐节']

await wardrobe.update(id, { name: '改名' });                 // 没传标签：两组都不变
await wardrobe.update(id, { styleTags: ['简约风', '其他'] }); // 仍选着“其他”：沿用原说明
await wardrobe.update(id, { styleTags: ['学院风'] });         // 去掉“其他”：风格说明清空，场景不变
```

## 4. 给 03（第 5 轮，PR #35）

#34 合入后，把 `src/modules/wardrobe/tag-adapter.ts` 改成只转出统一模块，页面代码不用改：

```ts
export { STYLE_TAGS, SCENE_TAGS, OTHER_TAG, mapTag, resolveTags, readTags, validateTags } from '@/shared/domain/tags';
export type { TagKind, WardrobeTags } from '@/shared/domain/tags';
```

`src/modules/wardrobe/index.ts` 中第 5 轮的最小兼容改动（`93fe847`）可以撤掉，改用 #34 的版本，这两份改动的功能是一样的。差别在于：
- #34 的四个字段读取时缺省为 `[]`，不再是 `undefined`。
- 数据库升到 v4，旧衣物在迁移时整理一次。

`tests/round5/tags-data.test.ts` 中这两项会随之变化：
- `does not migrate…`：原来断言 `verno` 为 3、`sceneTags` 为 `undefined`，现在分别是 4 和 `[]`。
- 旧标签：迁移时就整理成固定值和“其他”，不再等到读取时转换。

其余断言已在 #34 的 `tests/round2/tags.test.ts` 中照搬并通过。

## 5. 给 04（衣物识别）

识别候选建议输出：

```json
{ "styleTags": ["复古风", "其他"], "styleOther": ["Y2K"],
  "sceneTags": ["上班", "其他"], "sceneOther": ["音乐节"] }
```

- 提示词里列出两份词表的中文名或英文名，要求模型优先从中选择。
- 词表外的词原样传给页面也可以，保存时服务会转成“其他”并保留原文。
- 判断不了时输出空数组，不要输出“不确定”，也不要编造。
- 本次喜好参考图的解析结果只能用 `STYLE_TAGS` 中的值，对应不上的内容写进说明文字。

## 6. 给 05（推荐）

- 衣物新增 `sceneTags`。场景标签**只用于辅助判断**，衣物没有同名场景标签时不能一律排除。
- 本次场景草稿：`{ enabled, selected: 固定场景 | null, custom: 自填 }`。
- 本次喜好草稿：新增 `styleTags`（固定风格值），可以不传，不传时按空处理。
- 本轮已应用条件：
  - `preference: { text, imageIds, styleTags } | null`：只选了标签也算有内容。
  - `scene: { selected, custom } | null`。
- `sceneText(scene)` 生成依据文字，例如“户外（去爬山）”；`basis.scene` 仍是这段文字。
- 搭配快照新增 `sceneTags`，按当时原样保存，不按现行词表校验。

## 7. 旧数据迁移（IndexedDB v3 → v4）

迁移不清空衣橱，也不丢弃旧标签原文。

| 数据 | 处理 |
|---|---|
| 衣物旧 `styleTags`（自由文本） | 按词表整理。例：`['日常','简约']` → `['简约风','其他']`，说明 `['日常']` |
| 第 5 轮已经写入四个字段的衣物 | 原样保留，不降格 |
| 缺字段 | 补 `[]` |
| 超长或超量的旧文字 | 截到 30 字，数量截到上限 |
| 推荐页草稿 `scene.value` | 能对应固定场景的放进 `selected`，否则原文放进 `custom` |
| 本轮已应用的 `scene`（旧字符串） | 同上；本次喜好补 `styleTags: []` |
| 搭配结果、永久反馈里的快照 | 不改写；读取时缺 `sceneTags` 按 `[]` 处理 |

## 8. 测试

`tests/round2/tags.test.ts` 覆盖以下内容：
- V1.2 词表。
- 英文和同义词映射。
- “不确定”的处理。
- “其他”与说明的配套校验。
- 新增、编辑和重开数据库后的持久化。
- 推荐页的喜好标签和场景。
- v3→v4 迁移：包括第 5 轮四字段数据、草稿、本轮条件、旧快照、永久反馈。

## 9. 本 PR 不包含

- 衣橱页面：第 5 轮由 03 完成。
- 识别提示词与识别候选字段：由 04 调整。
- 推荐页界面以及推荐对场景的使用：由 05 完成。
