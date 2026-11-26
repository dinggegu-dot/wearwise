# WearWise 第 8 轮交接｜05 穿搭推荐页面与反馈闭环

更新：2026-11-26（北京时间）。

## 一、提交信息

- 负责人：05
- 分支：`codex/round-08-recommendation-page`
- 基线分支：`origin/pr-38`
- 基线提交：`70a1aeb390f0231ed24e9f3af16c5e3a1a0510b4`
- 本轮代码提交：`08f2473`
- Commit Message：`feat(recommendation): complete round 08 recommendation workflow`
- 当前状态：本地已提交，尚未 Push，尚未创建 PR。
- 本轮基于第 7 轮 PR #38 继续开发，不代表已经合并到 main 或正式上线。

## 二、本轮目标

完成穿搭推荐页面及推荐过程控制，复用前序轮次已经交付的推荐核心服务。

本轮主要完成：
- 左侧四项推荐条件。
- 右侧单套穿搭结果和平铺展示。
- 换一套、换掉这件。
- 喜欢／不喜欢反馈闭环。
- 单次反馈与永久偏好隔离。
- 推荐页面状态持久化。
- 请求取消及并发保护。
- 首页可复用的平铺和单品清单组件。

## 三、实际完成内容

### 1. 左侧推荐条件

涉及：
- `src/modules/recommendation/ui/conditions-panel.tsx`
- `src/modules/recommendation/ui/recommendations-page.tsx`
- `src/modules/weather/ui/weather-panel.tsx`

完成：
- 长期记忆、天气、本次喜好、本次场景四项条件。
- 首次默认长期记忆和天气开启，本次喜好和场景关闭。
- 本次喜好支持文字、图片和固定标签。
- 本次场景支持预设选项和自填。
- 关闭条件后保留草稿内容，重新开启可以继续修改。
- 左侧修改不自动改变当前搭配。
- 点击生成才应用最新设置。
- 城市切换不自动替换当前搭配。
- 条件草稿通过 Session 持久化。

### 2. 推荐结果与平铺组件

涉及：
- `outfit-flat-lay.tsx`
- `outfit-garment-list.tsx`
- `outfit-image.tsx`

完成：
- 根据 `flatLay` 层级排列真实衣物图片。
- 根据衣物快照展示名称、类别和颜色。
- 图片支持异步加载、失败占位、重试和 Object URL 释放。
- 生成依据和推荐理由与当前搭配结果对应。
- 提供首页可复用的公共组件导出入口：

`src/modules/recommendation/ui/index.ts`

首页可以通过以下方式导入：

```tsx
import {
  OutfitFlatLay,
  OutfitGarmentList,
  OutfitImage
} from '@/modules/recommendation/ui';
```

单品清单组件的替换回调为可选参数。不传入 `onSwapItem` 时只展示衣物，不显示替换按钮。

### 3. 推荐生成与调整

涉及：
- `recommendations-page.tsx`
- `core-service.ts`
- `src/composition/index.ts`
- `src/app/api/recommendation/route.ts`

完成：
- 接入 `RecommendationCoreService`。
- 新一轮生成读取最新设置草稿。
- 生成成功才提交新轮。
- 生成失败不主动清除旧结果。
- 换一套沿用本轮已应用条件。
- 换整套不能返回完全相同的衣物组合。
- 换单件只允许改变指定衣物。
- 换单件要求新衣物与原衣物属于同一类别。
- 其他位置衣物必须保持不变。
- 没有同类别替代衣物时返回明确状态。
- 已删除或暂停衣物不能作为新推荐候选。
- 已有搭配中的已删除、已暂停衣物通过快照继续展示并提示。

### 4. 喜欢／不喜欢反馈

涉及：
- `feedback-dialog.tsx`
- `feedback-saved-dialog.tsx`
- `recommendations-page.tsx`
- `core-service.ts`

完成：
- 喜欢／不喜欢反馈弹窗。
- 当前搭配缩略图。
- 可选原因及补充文字。
- 仅本轮适用和永久适用两种范围。
- 反馈草稿保存及恢复。
- 取消反馈不产生有效反馈。
- 保存失败保留用户填写内容。
- 保存成功展示「反馈已保存」。
- 支持「根据反馈换一套」和「暂时不换，返回」。
- 根据反馈换一套沿用本轮已应用条件，不读取左侧未提交修改。
- 永久反馈同步进入「我的偏好」。
- 本轮刚提交的反馈即使长期记忆关闭，仍然参与当前轮调整。

特别修复：

不喜欢但原因为空时，反馈仍然有效，不能被过滤掉。

```ts
const effectiveFeedback = feedback.map(item => ({
  choice: item.choice,
  reason: item.reason
}));
```

只有没有任何已保存反馈时，才返回 `no-feedback`。

### 5. 长期记忆与单次反馈隔离

已验证的业务规则：

- 长期记忆关闭后，新轮不读取历史长期偏好。
- 本轮已经提交的反馈仍参与当前轮连续调整。
- 新轮成功提交后清除旧轮单次反馈和旧轮调整记录。
- 永久反馈保留在「我的偏好」。
- 重新开启长期记忆后，永久偏好可以参与后续推荐。

### 6. 并发保护与请求取消

完成：
- 页面级统一操作锁。
- 生成、换整套、换单件、反馈保存和反馈后换套共用操作锁。
- 反馈提交使用稳定的 `requestId`。
- AI 返回后检查取消信号。
- 数据库提交前检查取消信号。
- 天气请求取消时保留原始取消异常。
- 页面卸载时取消当前推荐操作。
- 通过生命周期标识防止旧页面请求覆盖新页面状态。
- 反馈草稿按修改顺序保存。

注意：AbortSignal 不能撤销已经开始的数据库事务，也不能保证上游 AI 服务立即停止计费。

## 四、首页复用接口

公共组件：

| 组件 | 用途 |
|---|---|
| `OutfitFlatLay` | 平铺展示 |
| `OutfitGarmentList` | 单品清单 |
| `OutfitImage` | 衣物图片加载 |

首页只展示搭配时：

```tsx
<OutfitFlatLay
  result={current}
  load={loadImage}
/>

<OutfitGarmentList
  result={current}
  load={loadImage}
  title="今日穿搭单品"
/>
```

首页今日穿搭生成使用：

```ts
await services.recommendationCore.generateHome();
```

推荐页新一轮生成使用：

```ts
await services.recommendationCore.generateNewRound();
```

首页与推荐页使用独立的 Home 和 Round 状态，不能互相覆盖推荐结果或反馈。

**尚未交付：**
- 首页专用换整套接口。
- 首页专用换单件接口。
- 首页实际页面的最终接线和浏览器验收。

本轮交付的是公共展示组件及调用示例，不代表首页全部业务已经完成。

## 五、修改文件清单

### 页面和服务

- `src/app/api/recommendation/route.ts`
- `src/app/globals.css`
- `src/composition/index.ts`
- `src/modules/recommendation/core-service.ts`
- `src/modules/recommendation/ui/conditions-panel.tsx`
- `src/modules/recommendation/ui/feedback-dialog.tsx`
- `src/modules/recommendation/ui/feedback-saved-dialog.tsx`
- `src/modules/recommendation/ui/index.ts`
- `src/modules/recommendation/ui/outfit-flat-lay.tsx`
- `src/modules/recommendation/ui/outfit-garment-list.tsx`
- `src/modules/recommendation/ui/outfit-image.tsx`
- `src/modules/recommendation/ui/recommendations-page.tsx`
- `src/modules/weather/ui/weather-panel.tsx`

### 测试

- `tests/recommendation/core-service.test.ts`
- `tests/round3/recommendation-input.test.ts`
- `tests/round8/cancellation.test.ts`
- `tests/round8/recommendation-flow.test.ts`

本轮新增两个第 8 轮专项测试文件，共 17 项测试。

## 六、实际验证结果

### 专项测试

命令：

```bash
npx vitest run tests/round8
```

结果：

- `cancellation.test.ts`：9/9 通过。
- `recommendation-flow.test.ts`：8/8 通过。
- 合计：17/17 通过。

### 完整回归

命令：

```bash
npm run typecheck
npm test
npm run build
git diff --check
```

实际结果：

| 验证项 | 结果 |
|---|---|
| TypeScript | 通过 |
| 完整 Vitest | 236 通过，1 跳过 |
| 测试文件 | 31 通过，1 跳过 |
| Next.js 生产构建 | 通过 |
| Git diff 检查 | 通过 |

`tests/recommendation/home-live.test.ts` 有 1 项跳过，为原有跳过项。

部分 Dexie 测试出现测试数据库连接清理提示，但对应测试均通过。

### 真实网页验证

已实际验证：
- 真实衣橱上传。
- AI 推荐成功生成。
- 真实衣物图片展示。
- 根据「不喜欢黑色」反馈换一套，AI 返回了避开黑色的搭配。
- 关闭长期记忆并成功生成新轮后，生成依据不再出现长期偏好。
- 本次喜好和场景仍然参与推荐。

未完成独立浏览器专项验证的项目：
- 页面卸载期间的真实网络请求取消。
- 反馈草稿在刷新瞬间尚未完成写入时的恢复。
- 连续快速点击所有操作按钮的浏览器级并发表现。
- 首页公共组件实际接入后的最终视觉验收。

因此不能将以上项目描述为全部通过浏览器验收。

## 七、环境与密钥

- 使用 OpenRouter。
- 模型配置：`qwen/qwen3.8-max-0902`。
- 本地 `.env.local` 不进入 Git。
- `.env.example` 恢复为空密钥模板。
- API Key 不应写入代码、提交、PR 描述或截图。
- 本地开发曾将 AI 请求超时时间调整为 180000ms，以应对上游请求超时。此本地配置不作为仓库默认密钥或配置提交。

本轮开发期间曾误将老师提供的全组共用 Key 写入本地 `.env.example`，之后已恢复模板。未将该文件纳入本轮提交。

## 八、已知限制与后续工作

1. 首页专用换整套和换单件接口尚未交付。
2. 首页公共组件已提供，但仍需由第 6 轮负责人完成页面接线。
3. 请求取消测试目前以核心服务层 Mock 测试为主，仍需浏览器专项验收。
4. 已开始执行的数据库事务不能通过 AbortSignal 撤销。
5. `home-live.test.ts` 仍有一项跳过，后续负责人可根据真实环境补齐。
6. 真实 AI 请求可能超过 90 秒，建议后续评估模型响应时间、Prompt 大小及超时策略。

## 九、交给第 6 轮

第 8 轮已交付：
- 推荐页核心交互。
- 单套搭配平铺展示。
- 单品清单公共组件。
- 推荐反馈闭环。
- 独立的首页展示组件调用入口。

第 6 轮可以直接从本轮固定提交继续接入首页展示组件。

首页接入时必须遵守：
- 使用 `generateHome()` 读取首页专用推荐结果。
- 首页和推荐页的 Session 状态保持独立。
- 不读取推荐页的本次喜好、场景和单次反馈。
- 不直接调用推荐页的替换操作。
- 图片及搭配展示优先复用本轮公共组件。

## 十、当前 Git 状态

本轮代码已提交：

`08f2473 feat(recommendation): complete round 08 recommendation workflow`

当前分支：

`codex/round-08-recommendation-page`

本地工作区干净。

交接文档提交后，统一 Push 当前分支并创建 PR，目标分支以 PR #38 的实际目标分支为准。

本轮尚未合并到 main，也未正式上线。
