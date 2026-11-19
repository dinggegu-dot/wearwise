# WearWise 第 4 轮交付交接

**05 交给 03 | 第 4 轮交付至第 5 轮开工 | 2026 年 11 月 19 日**

03，请以第 4 轮固定提交版本接手。本轮基于第 3 轮 PR #30 的固定候选版本，完成了搭配知识接入、AI 推荐输入隔离、新一轮生成、整套替换、单件替换、反馈后换整套、天气服务改造及首页专用推荐。

第 4 轮的主要交付目标是提供可复用的推荐核心服务（Recommendation Core Service），使后续页面能够直接调用统一业务接口，而不是在页面中重复实现推荐、条件处理和数据保存逻辑。

本轮不要求提前完成第 8 轮的完整推荐页面及完整反馈交互。

---

# 一、代码起点与交付状态

## 1. 项目信息

| 项目 | 内容 |
|---|---|
| 项目名称 | WearWise |
| GitHub 仓库 | https://github.com/dinggegu-dot/wearwise |
| 开发角色 | 05 |
| 本轮交付 | 第 4 轮 |
| 接收角色 | 第 5 轮 03 |

## 2. 固定分支与提交

| 项目 | 内容 |
|---|---|
| 第 3 轮基线分支 | `codex/round-03-ai` |
| 第 3 轮基线 SHA | `962d79e3eaf743c4c41325bb912e2ad7f69fe74e` |
| 第 4 轮开发分支 | `codex/round-04-recommendation` |
| 第 4 轮固定 SHA | `cc64778af1658025ee353610fb420136b8cbad4b` |
| Commit Message | `feat(round-04): implement recommendation core service` |

第 4 轮从第 3 轮固定 SHA 创建独立开发分支，没有直接修改团队 `main`。

本轮交付固定版本为：

`cc64778af1658025ee353610fb420136b8cbad4b`

接手时应检出上述完整 SHA，不要仅依赖分支最新状态。

## 3. 依赖关系与团队合并约定

第 4 轮以第 3 轮 PR #30 的固定候选版本为开发基础。

按照团队原定的 12 轮统一合并计划，本轮没有擅自合并第 2、3 轮 PR，也没有修改团队 `main`。

第 5 轮 03 应在上述固定版本基础上开展后续开发。

## 4. 本轮提交情况

Git 提交结果：

- 修改文件：17 个
- 新增文件：8 个（其中包含本轮新增测试和知识文件）
- Commit：`cc64778af1658025ee353610fb420136b8cbad4b`

本地 `.env.local` 和 `test-reference.jpg` 已通过 Git 忽略规则排除，不属于本轮提交内容。

---

# 二、开发环境与独立复验

## 1. 开发环境

| 项目 | 信息 |
|---|---|
| 操作系统 | macOS |
| Node.js | v26.13.0 |
| Node.js 最低要求 | >=22.12.0 |
| npm | 本机版本未单独记录 |
| 开发工具 | PyCharm Terminal |
| 本地服务 | Next.js Node Runtime |
| AI 服务 | OpenRouter |
| 模型 | `qwen/qwen3.8-max-0902` |

真实 AI 请求使用开发者本人 OpenRouter 账户。

API Key 配置在本地服务端 `.env.local` 中，不得提交到 Git 仓库或交接文档。

## 2. 检出与运行方法

建议第 5 轮 03 使用自己的工作副本执行：

```bash
git clone https://github.com/dinggegu-dot/wearwise.git

cd wearwise

git fetch origin codex/round-04-recommendation

git switch --detach cc64778af1658025ee353610fb420136b8cbad4b

git rev-parse HEAD

npm ci --legacy-peer-deps
```

注意：如果团队分支尚未 push，需要先由 05 将本地提交推送到远程分支，再使用上述 fetch 命令。

配置本地 `.env.local`：

```dotenv
OPENROUTER_API_KEY=自己的OpenRouter_API_Key
AI_MODEL=qwen/qwen3.8-max-0902
AI_TIMEOUT_MS=90000
```

启动本地服务：

```bash
npm run dev
```

访问：

`http://127.0.0.1:3000`

## 3. 本轮完整自动化测试

本轮最终全量测试结果：

| 检查项目 | 结果 |
|---|---|
| Test Files | 22 passed / 1 skipped |
| Tests | 157 passed / 1 skipped |
| TypeScript | 通过 |
| Production Build | 通过 |
| Git Diff Check | 已清理末尾空行，提交前检查通过 |

执行命令：

```bash
npm test

npm run typecheck

npm run build
```

其中真实首页联调测试默认跳过，以避免普通回归测试自动产生 OpenRouter 费用。

需要单独执行：

```bash
LIVE_HOME_TEST=1 npm test -- tests/recommendation/home-live.test.ts
```

真实首页端到端测试结果：

- Test Files：1 passed
- Tests：1 passed
- 实际执行时间：约 23.2 秒

---

# 三、第 4 轮已交付的能力

## 1. 搭配知识与输入隔离

新增正式搭配知识文件：

`docs/knowledge/OUTFIT-TIPS.md`

知识版本：

`V1.2`

来源：

用户提供的 WearWise 搭配推荐知识文档。

新增知识读取模块：

`src/modules/recommendation/knowledge.ts`

主要职责：

- 从固定路径读取搭配知识文件。
- 解析知识文档版本。
- 将 Markdown 知识拆分为 API 可接受的规则块。
- 限制单条规则最大长度为 500 字符。
- 限制规则总数不超过 100 条。
- 每次调用重新读取文件，不使用进程级缓存。
- 知识文件缺失、为空或格式异常时明确报错。

知识文件不是硬编码在 AI Prompt 中，而是由服务端实际读取。

知识文件发生修改后，后续推荐请求可以读取最新版本。

## 2. 推荐条件输入隔离

新增 AI Client：

`src/modules/recommendation/ai-client.ts`

统一管理客户端到服务端推荐 API 的请求。

四项推荐条件：

| 条件 | 推荐页 | 首页 |
|---|---|---|
| 长期记忆 | 根据开关 | 固定读取 |
| 天气 | 根据开关 | 固定读取 |
| 本次喜好 | 根据开关 | 不读取 |
| 本次场景 | 根据开关 | 不读取 |

另外，连续调整时可以使用已经成功保存的有效反馈。

输入隔离规则：

- 关闭的条件不得进入模型请求。
- 喜好和场景开启但内容为空时按空处理。
- 四项条件全部关闭时，仍可以使用可用衣橱和基础知识生成推荐。
- 不允许客户端通过传入自定义知识覆盖服务端正式知识。
- 不允许通过参考图 ID 绕过喜好开关。
- 参考图只允许读取本次启用的图片 Blob。
- 不向模型传递本地数据库图片 ID。
- 不允许服务端根据 ID 直接读取浏览器数据库或抓取远程图片地址。

优先级规则：

- 本次明确要求及有效反馈优先于冲突的长期要求。
- 同轮较晚的明确修正覆盖之前的冲突要求。
- 三组长期偏好不按来源自动分配优先级。

## 3. 推荐核心服务

新增：

`src/modules/recommendation/core-service.ts`

主要类：

`RecommendationCoreService`

本轮提供五个业务入口：

| 方法 | 用途 | 保存方式 |
|---|---|---|
| `generateNewRound()` | 生成新一轮搭配 | `commitNewRound()` |
| `swapOutfit()` | 更换整套搭配 | `commitAdjustment()` |
| `swapItem()` | 替换指定单件 | `commitAdjustment()` |
| `feedbackSwap()` | 根据有效反馈更换整套 | `commitAdjustment()` |
| `generateHome()` | 首页今日穿搭 | `commitHome()` |

### 新一轮生成

`generateNewRound()`

- 从 `newRoundContext()` 读取本轮草稿、长期记忆和可用衣橱。
- 根据四项开关决定模型实际输入。
- 仅使用已保存、未删除、未暂停的衣物。
- 调用真实 AI 推荐接口。
- 校验 AI 返回的衣物 ID。
- 成功后调用 `commitNewRound()`。

只有新一轮成功提交后，才清除上一轮调整和单次反馈。

### 换整套

`swapOutfit()`

- 从当前轮已应用条件和有效反馈中构造输入。
- 不读取尚未应用的左侧设置草稿。
- 要求新组合与当前组合不同。
- 允许保留部分原有单品。
- 再次核对模型返回的衣物 ID 和实时可用性。
- 不允许返回重复衣物。
- 无替代组合时返回明确状态。
- 成功后使用 `commitAdjustment()`，不创建新轮。

### 换单件

`swapItem(targetGarmentId)`

- 只允许替换当前搭配中指定的衣物。
- 根据原衣物类别寻找替代品。
- 新衣物必须属于相同类别。
- 其他位置的衣物 ID 必须保持不变。
- AI 修改了其他位置时拒绝保存。
- 无同类别替代衣物时返回明确状态。
- 失败时保留旧结果。

### 反馈后换整套

`feedbackSwap()`

- 使用已经成功保存的有效反馈。
- 按反馈提交顺序传递给模型。
- 不读取尚未提交的反馈草稿。
- 没有有效反馈时不发起模型请求。
- 不开启新轮次。
- 成功后保留当前轮次和有效反馈。

### 首页专用推荐

`generateHome()`

首页调用固定读取：

- 全部有效长期偏好。
- 当前城市当天的真实天气。
- 当前可用衣橱。
- 正式 V1.2 搭配知识。

首页不读取：

- 推荐页临时喜好。
- 推荐页场景。
- 推荐页设置开关。
- 推荐页单次反馈。
- 推荐页未应用的设置草稿。

首页结果通过 `commitHome()` 独立保存，不覆盖推荐页的当前搭配、轮次、调整和反馈。

---

# 四、天气服务改造

主要文件：

- `src/modules/weather/index.ts`
- `src/modules/weather/ui/weather-panel.tsx`
- `src/composition/index.ts`

## 1. 天气数据来源

正式天气 Provider：

`OpenMeteoProvider`

使用 Open-Meteo 获取：

- 天气状况（WMO weather code）。
- 当前气温。
- 当前体感温度。
- 当天最低气温。
- 当天最高气温。

时区使用：

`Asia/Shanghai`

## 2. 缓存规则

`WeatherService` 缓存从原来的城市短时缓存改为：

城市 + 北京时间日期。

缓存示例：

`深圳:2026-11-19`

规则：

- 同一城市同一北京时间日期复用天气数据。
- 北京时间跨日后重新获取。
- `refresh=true` 时绕过缓存。
- 天气请求失败不写入缓存。
- 不将示例天气作为正式天气失败后的自动兜底。

## 3. 推荐页天气规则

- 新一轮生成根据当天城市天气获取数据。
- 天气开关关闭时不调用天气服务。
- 天气开关开启但数据获取失败时明确失败。
- 连续调整沿用本轮已应用的天气快照。
- 不因换整套、换单件或反馈后换整套重新获取天气。

## 4. 首页天气规则

首页固定使用当前城市当天的真实天气。

不读取推荐页的天气开关。

真实天气获取失败时不生成首页推荐，也不使用示例天气。

---

# 五、可直接使用的接口

## 1. 推荐核心服务

文件：

`src/modules/recommendation/core-service.ts`

类：

`RecommendationCoreService`

主要调用入口：

```typescript
service.generateNewRound();

service.swapOutfit();

service.swapItem('targetGarmentId');

service.feedbackSwap();

service.generateHome();
```

调用参数及返回类型以固定 SHA 对应的源码为准。

## 2. AI Client

文件：

`src/modules/recommendation/ai-client.ts`

接口：

```typescript
requestAIRecommendation(input, options);
```

输入：

```typescript
{
  wardrobe: Garment[],
  conditions: {
    memory?,
    weather?,
    preference?,
    scene?,
    feedback?
  },
  operation?,
  referenceImages?
}
```

其中：

- `wardrobe` 为本次允许模型使用的衣橱。
- `conditions` 为本次允许传入模型的条件。
- `operation` 为可选操作类型及替换约束。
- `referenceImages` 为本次启用的实际图片 Blob Map。

成功返回：

```typescript
{
  garmentIds: string[],
  reason: string,
  knowledgeVersion: string
}
```

失败返回 `AIRecommendationClientError`，包含错误代码、错误信息、是否可重试、请求 ID 和 HTTP 状态（可用时）。

## 3. 推荐服务端 API

入口：

`POST /api/recommendation`

文件：

`src/app/api/recommendation/route.ts`

无参考图时使用：

`application/json`

启用参考图时使用：

`multipart/form-data`

参考图字段：

`image:<imageId>`

图片要求：

- 最多 6 张。
- 单张不超过 4 MiB。
- 只接受 JPEG、PNG、WebP。
- 图片 ID 与已启用的 `preference.imageIds` 一一对应。

服务端读取知识文件，不接受客户端覆盖知识内容。

## 4. 第 2 轮数据服务

继续复用：

`createServices(mode)`

主要入口：

```typescript
wardrobe.candidates()

preferences.listActive()

session.newRoundContext()

session.adjustmentContext()

session.homeContext()

session.commitNewRound()

session.commitAdjustment()

session.commitHome()
```

不另建数据库，不直接从页面操作 Dexie。

## 5. 首页专用 Session

文件：

`src/modules/session/index.ts`

新增：

`homeContext()`

用途：

独立读取首页上下文、长期偏好和可用衣橱，不读取推荐页临时设置。

---

# 六、自动化测试与真实 AI 验收

## 1. 新增测试文件

| 文件 | 测试内容 |
|---|---|
| `tests/recommendation/knowledge.test.ts` | 知识读取、版本、格式、规则长度和修改后重新读取 |
| `tests/recommendation/ai-client.test.ts` | JSON、multipart、参考图校验、错误映射 |
| `tests/recommendation/core-service.test.ts` | 新一轮、换整套、换单件、反馈后换整套和首页业务逻辑 |
| `tests/recommendation/home-live.test.ts` | 首页真实 AI、真实天气、Session 保存和状态隔离 |
| `tests/weather/weather.test.ts` | 天气解析、单位、观测时间、异常、缓存和跨日行为 |

另外修改了第 3 轮相关测试：

- `tests/round3/openrouter-route-failures.test.ts`
- `tests/round3/recommendation-input.test.ts`

## 2. 自动化测试结果

最终全量回归：

```text
Test Files  22 passed | 1 skipped (23)
Tests       157 passed | 1 skipped (158)
```

另外：

- `npm run typecheck`：通过。
- `npm run build`：通过。
- 首页真实端到端测试：单独执行通过。

## 3. 真实 OpenRouter 测试

真实模型：

`qwen/qwen3.8-max-0902`

真实测试均使用隔离的测试衣橱，未通过这些 API 级测试修改正式衣橱。

### 测试 A：新一轮推荐

结果：

- HTTP 200。
- 返回 3 个有效衣物 ID。
- 上衣、下装、鞋子结构完整。
- 搭配理由符合衣物信息。
- `knowledgeVersion = V1.2`。

结果：通过。

### 测试 B：换整套

原组合：

```text
test-top-1
test-bottom-1
test-shoes-1
```

AI 返回：

```text
test-top-2
test-bottom-1
test-shoes-1
```

组合不同，衣物 ID 合法。

结果：通过。

### 测试 C：换单件

指定替换：

`test-top-1`

AI 返回：

```text
test-top-2
test-bottom-1
test-shoes-1
```

只有上衣发生变化，裤子和鞋子保持不变。

结果：通过。

### 测试 D：反馈后换整套

输入两条按顺序排列的反馈：

1. 不喜欢颜色太鲜艳。
2. 希望改成简约的深色搭配。

AI 根据较晚的反馈调整组合，并说明当前衣橱缺少棕色、米色等暖调单品，因此选择黑白中性色组合进行替代。

结果：通过。

注意：以上 B、C、D 是直接调用真实推荐 API 验证模型行为，不等于已完成对应业务方法的真实 Session 持久化端到端验证。

### 测试 E：真实深圳天气推荐

城市：

深圳。

日期：

2026-11-19（北京时间）。

真实天气数据：

| 指标 | 数值 |
|---|---:|
| 当前气温 | 19.9°C |
| 体感温度 | 18.1°C |
| 最低温 | 16.9°C |
| 最高温 | 20°C |
| WMO 天气代码 | 3 |
| 数据来源 | Open-Meteo |

真实模型能够结合体感温度和长期偏好生成搭配。

结果：通过。

注意：这项测试证明天气和记忆条件可以通过 API 参与模型推荐，不等于所有天气场景均已完成完整页面端到端验收。

### 测试 F：首页真实端到端

测试文件：

`tests/recommendation/home-live.test.ts`

执行：

```bash
LIVE_HOME_TEST=1 npm test -- tests/recommendation/home-live.test.ts
```

测试结果：

```text
Test Files  1 passed (1)
Tests       1 passed (1)
Duration    23.39s
```

已验证：

- 使用真实深圳天气。
- 调用真实 OpenRouter。
- 使用隔离 IndexedDB。
- 从长期偏好服务读取真实保存的数据。
- 不读取推荐页临时喜好和场景。
- 不读取推荐页单次反馈。
- 首页结果成功写入 Home Session。
- 首页生成不覆盖推荐页已有结果和反馈。
- 关闭并重新打开 IndexedDB 后首页结果仍然存在。

结果：通过。

### 测试 G：真实参考图调用

测试图片：

`test-reference.jpg`

图片大小：

1,117,892 bytes（约 1.1 MiB）。

格式：

JPEG。

通过 multipart/form-data 上传真实图片字节。

真实模型能够识别图片中的：

- 棕色条纹系带上衣。
- 米色半裙。
- 棕色乐福鞋。
- 复古优雅风格。
- 暖调中性色配色。

在衣橱缺少对应颜色衣物时，模型使用已有白色衬衫、黑色长裤和白色运动鞋进行近似搭配，并说明无法完全复刻图片的原因。

结果：通过。

---

# 七、第 4 轮验收清单

| 验收项 | 状态 | 证据 |
|---|---|---|
| 搭配知识文件独立保存 | 已完成 | OUTFIT-TIPS.md |
| 知识文件版本化 | 已完成 | V1.2 |
| 修改知识后重新读取 | 已完成 | knowledge.test.ts |
| 四项条件输入隔离 | 已完成基础自动化测试 | core-service.test.ts |
| 新一轮推荐 | 已完成 | 自动化 + 真实 API |
| 换整套 | 已完成 | 自动化 + 真实 API |
| 换指定单件 | 已完成 | 自动化 + 真实 API |
| 反馈后换整套 | 已完成 | 自动化 + 真实 API |
| 无替代及衣物不足处理 | 已完成基础测试 | core-service.test.ts |
| 天气城市日期缓存 | 已完成基础测试 | weather.test.ts |
| 天气跨日更新 | 已完成基础测试 | weather.test.ts |
| 天气失败处理 | 已完成自动化测试 | weather.test.ts |
| 首页专用调用 | 已完成 | generateHome() |
| 首页与推荐页隔离 | 已完成 | home-live.test.ts |
| 首页 IndexedDB 持久化 | 已完成 | home-live.test.ts |
| 真实 OpenRouter 调用 | 已完成 | 真实 API 记录 |
| 真实参考图传输 | 已完成 | 真实图片调用记录 |
| 全量自动化测试 | 已完成 | 157 passed / 1 skipped |
| TypeScript | 已完成 | typecheck 通过 |
| 生产构建 | 已完成 | build 通过 |

---

# 八、已知边界与后续事项

以下内容需要第 5 轮 03 接手时了解。

## 1. 推荐页面边界

第 4 轮交付的是可复用推荐核心服务。

本轮没有要求完成第 8 轮完整推荐页面，也没有把所有新业务入口全部接入最终页面交互。

第 5 轮 03 可以直接复用 `RecommendationCoreService`，但应结合后续页面设计决定具体调用方式。

## 2. 真实调用与模拟测试的区别

本轮已经完成真实模型 API 调用及首页端到端测试。

但以下内容不能仅凭 API 级真实调用认定为完整真实端到端验收：

- 普通换整套的完整 Session 持久化。
- 换单件的完整 Session 持久化。
- 反馈后换整套的完整 Session 持久化。
- 真实网络断网和真实超时的人为故障注入。
- 所有并发情况下的事务级保存行为。

这些项目仍可作为后续专项验收内容。

## 3. 天气边界

天气服务已完成按城市和北京时间日期缓存的改造。

后续仍建议检查：

- 用户主动刷新天气的交互。
- 当天 Open-Meteo 数据更新后的刷新策略。
- 不同城市之间的缓存隔离。
- 首页与推荐页对天气服务的共享行为。

## 4. 本地测试环境

以下内容属于本地环境，不应提交：

- `.env.local`
- `test-reference.jpg`
- 本地 `.idea/` 配置

真实 OpenRouter 请求需要使用开发者自己的密钥。

## 5. 后续页面职责

第 8 轮完整推荐页面、反馈界面和页面交互仍按团队排期推进。

本轮不提前替代第 8 轮的工作。

---

# 九、交付给第 5 轮 03 的建议

建议第 5 轮 03 首先完成以下工作：

1. 检出第 4 轮固定 SHA。
2. 阅读 `src/modules/recommendation/core-service.ts`。
3. 阅读 `src/modules/recommendation/ai-client.ts`。
4. 阅读 `src/modules/recommendation/knowledge.ts`。
5. 阅读 `src/modules/session/index.ts`。
6. 阅读 `src/modules/weather/index.ts`。
7. 运行完整自动化测试。
8. 通过已有接口了解推荐核心的调用方式。
9. 在后续页面工作中复用现有服务，不另建推荐数据库或重复实现 AI 输入隔离。

第 4 轮交付的核心是：

**把推荐能力从原有页面和规则推荐实现中独立出来，形成可复用、可测试、能够调用真实 AI 的推荐核心服务。**

第 5 轮可以在这个基础上继续扩展，不需要重新实现本轮已经交付的推荐业务逻辑。

---

# 十、05 独立交付签收记录

| 项目 | 记录 |
|---|---|
| 交付角色 | 05 |
| 接收角色 | 03 |
| 开发分支 | `codex/round-04-recommendation` |
| 固定 SHA | `cc64778af1658025ee353610fb420136b8cbad4b` |
| Node.js | v26.13.0 |
| 操作系统 | macOS |
| npm 版本 | 未单独记录 |
| 浏览器版本 | 未单独记录 |
| 全量测试 | 157 passed / 1 skipped |
| TypeScript | 通过 |
| Production Build | 通过 |
| 真实 AI 调用 | 通过 |
| 真实首页 E2E | 通过 |
| 真实参考图调用 | 通过 |

**第 4 轮交付状态：代码已提交，固定版本已确定，等待第 5 轮 03 独立检出与签收。**

