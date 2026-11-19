# WearWise 第5轮衣橱管理交接

03 → 第6轮04；07的独立验收另行进行。日期：2026-11-20（Asia/Shanghai）。

本候选完成03衣橱页面与录入管理流程，使用正式衣橱服务和浏览器 IndexedDB 持久化。跨模块标签整合及真实 OpenRouter 联调尚未完成，按 Draft PR 交付；不代表04签收或全项目验收通过。

## 起点、资料和远程依赖

- 实际代码目录：`C:\Users\dell\Desktop\WearWise\wearwise`。用户说明中的 Documents 路径不是本次实际工作区。
- 参考资料：同级 `wearwise-round5-reference`，未复制进仓库、未改写原件。
- 复用已存在且起初干净的分支 `codex/round-05-wardrobe`，没有覆盖或重建分支。
- 开发起点：`f8aa1b375a4f54bb27e4815886f82fd4b40af89e`，与执行时 #33 最新 head 相同。
- #33相对 `cc64778af1658025ee353610fb420136b8cbad4b` 只增加第4轮交接文档，已含 #29 / #30 业务代码。
- `main`：`2d9cdefbca01ee52e1afb275c0f316faf4612cdd`；与第4轮分支的共同祖先为 `b01b526231e82b12880030c0cdf58bf0033c4dde`。未从旧 main 丢失业务代码开工。
- #34与本分支的共同祖先为 #29 的 `63efce6d10e265ada27b539664a2723b00305da5`，不在本分支祖先链中。未 merge / cherry-pick #34。
- PR base：`codex/round-04-recommendation`，因为 #33 仍开放。现有CI仅监听 main / round-02-data 的PR，不能把没有产品检查误记为通过，也不为触发CI更改base。
- 已创建 [Draft PR #35](https://github.com/dinggegu-dot/wearwise/pull/35)，标题 `[M03] Round 5 - Wardrobe Management`。03分支已推送；没有合并、改main或部署。
- 最小字段兼容独立提交：`93fe847ae6bf1e6c470f43b5738833471ace46ae`，必须由02审查。
- 主功能提交：`946e704888faa8219540571418b67ed8c6ebca8d`；最终功能／宽屏视觉修正提交：`6264b1988e1fff04fe8b997b519b8596aae660a4`。交接文档及截图随后独立提交，完整交付head以本分支和Draft PR显示为准。

执行时 fetch 与 GitHub API 核对结果：

| PR | 状态 | head完整SHA | base | head上的检查 |
| --- | --- | --- | --- | --- |
| #29 | Open，未合并 | `63efce6d10e265ada27b539664a2723b00305da5` | main | Pull request checks成功 |
| #30 | Open，未合并 | `962d79e3eaf743c4c41325bb912e2ad7f69fe74e` | codex/round-02-data | Pull request checks成功 |
| #31 | Open，未合并 | `87166bde9a34af15cac0331496d05731d214943d` | main | Pull request checks成功；仅投票文档 |
| #32 | 已合并 | `e756b8805e9425f9822736ae517c8332be3775f2` | main | Pull request checks成功；Word4更新 |
| #33 | Open，未合并 | `f8aa1b375a4f54bb27e4815886f82fd4b40af89e` | main | Pull request checks失败，历史天气回归 |
| #34 | Open，未合并 | `ea6304350b109602312d6852f6978dd4b09a1e4f` | codex/round-02-data | API未返回head工作流记录；不能视为通过 |

已阅读外部01–05目录中的排班、推荐规则、Word4正文与文本副本、05→03的ROUND-4、历史第2/3/4轮开工交接、Guide、Prompt v2和两份标签补丁说明。最新版用户指令覆盖这些文件中“等待共同上游 / 等待06 / 占位10风格”等旧限制。仓库旧Markdown概述及README的固定旧链接不能替代Word4。

外部知识实际文件为 `03-历史轮次补充/OUTFIT-TIPS.md`，内容标明V1.2；与仓库 `docs/knowledge/OUTFIT-TIPS.md` 消除CRLF差异后完全一致。没有生成V1.3。

## 03完成功能

| 范围 | 本次行为 |
| --- | --- |
| 列表与计数 | 全部及上衣、下装、外套、连衣裙、鞋履；暂停计入，软删除扣除；新增沿用当前分类，保存后分类变化时显示保存的分类 |
| 单件录入 | 校验真实文件格式/尺寸/大小；原图与白底左右对照；本机白底与现有AI识别并行；全部属性编辑；取消、换图、白底重试、识别重试、保存失败重试 |
| 白底失败 | `backgroundRemoval !== removed` 明确失败，不能保存；不把 fallback 作为合格白底。白底重试不额外调用AI |
| AI失败 | 失败／超时保留草稿，提供重试与显式“改为手动填写并确认”；未成功识别时不冒充AI完成；不自动重试付费请求 |
| 批量 | 一张图一件；每批最多12张，每张10 MiB；单一队列串行处理模型和识别（包括重试），每项独立ID、requestId、sequence、草稿、状态 |
| 部分保存 | 仅保存成功且勾选项；每项写入独立事务；失败项内容和勾选保留；已保存项禁用再次保存并释放原图；处理中／未选／失败项继续保留，显示数量与完成入口 |
| 标签 | V1.2九风格、六场景，独立多选；其他说明为字符串数组；不确定为空选项；未知识别原词保留到对应Other，不创建公共自定义标签 |
| 详情与编辑 | 真正的详情弹窗；白底图、类别、颜色、版型、厚薄、材质、风格、场景、其他说明、描述、状态及日期；编辑正确回填，取消不写入 |
| 换图保护 | 新图需重新处理；失败时旧库记录和旧图不动；可放弃新图保留原白底；保存失败保留新草稿；继续使用revision和原有图片引用保护 |
| 暂停／恢复／删除 | 暂停日期弹窗；北京到期日00:00恢复资格；提前恢复；软删除保留旧搭配白底快照；不更改Session、条件、轮次、反馈 |
| 异步及资源 | 请求序列＋任务身份＋AbortController；AI应用时检查用户改动，标签及Other按组保护；换图、取消、离页、模式切换丢弃旧结果；Object URL释放；双击提交互斥 |
| 键盘 | 弹窗初始聚焦名称；Escape取消，恢复触发入口焦点；文件选择器cancel冒泡不关闭表单 |

## UI资料与视觉检查

外部 `03-历史轮次补充/wearwise_ui2` 与仓库 `docs/project/wearwise_ui2` 各16张PNG，逐张打开检查；16张均逐字节一致，未重复复制或重新生成。索引为 `docs/project/UI-REFERENCE.md`。

- 01及01-2：首页正常、空态、天气异常。
- 02、02-2、02-3：衣橱四列卡片、详情／编辑／暂停恢复、单件对照、批量确认与部分保存。
- 03及03-2至03-6：推荐条件、反馈、保存成功／失败、生成异常及旧衣物状态。
- 04及04-2、04-3：灵感列表、编辑、分析状态。
- 05及05-2：偏好分组和编辑。

03实现02系列对应的真实交互，保留米白背景、绿色主按钮、圆角卡片与标签、居中遮罩弹窗、原图／白底对照与批量行布局。桌面参考尺寸1536×1024；移动端390和320宽度检查横向溢出、列表和编辑弹窗。

有意保留的差异：顶端沿用现有模式条和公共导航；示例衣橱沿用原有SVG示意图及真实示例数量，没有把设计图的照片或示例计数伪装成用户数据；新表单比旧图更宽，以容纳新版两组固定标签与全部属性。手机采用响应布局，原图未提供手机版。未改造其余四个业务页面。

截图及运行证据见 `round05-evidence/`（实际截图均由Chrome运行产生；示例/模拟AI与真实本机模型分别标注）。

## 文件与接口

| 文件 | 用途 |
| --- | --- |
| `src/modules/wardrobe/tag-adapter.ts` | 唯一临时V1.2词表、英文及明确同义词映射、Other整理与校验；接入02后替换实现 |
| `src/modules/wardrobe/index.ts` | 最小字段兼容；保留原服务与事务接口，不改数据库版本或迁移 |
| `src/modules/wardrobe/draft.ts` | 分类／厚薄显示、草稿回填、最终资料检查 |
| `src/modules/wardrobe/upload-tasks.ts` | 内存任务队列、请求保护、限流、逐项保存与重试 |
| `src/modules/wardrobe/ui/wardrobe-page.tsx` | 列表、分类、计数、详情、暂停恢复删除及变更通知 |
| `src/modules/wardrobe/ui/wardrobe-editor.tsx` | 单件／编辑与批量弹窗 |
| `src/modules/wardrobe/ui/wardrobe-fields.tsx` | 共用属性与标签控件、图片URL管理、可访问弹窗 |
| `src/modules/wardrobe/ui/upload-panel.tsx` | 原图／白底对照与分阶段状态、重试入口 |
| `src/modules/wardrobe/ui/wardrobe.css` | 03局部样式与响应布局 |
| `tests/round5/*.test.ts` | 标签持久化、旧数据保护、任务竞态、限流、失败及重试 |
| `e2e/round5-wardrobe.spec.ts` | 新版分类、多选、混合批量、部分保存、换图故障、资源释放与视觉证据 |
| `e2e/wardrobe*.spec.ts`、`e2e/birefnet-business.spec.ts`、`e2e/persistence.spec.ts` | 沿用原验收目标，适配新弹窗和固定标签；白底fallback旧“允许保存”断言改为禁止保存；成功项使用真实本机模型 |
| `e2e/recommendation.spec.ts` | 仅把确认暂停定位到新弹窗；原天气失败断言保持不变 |
| `playwright*.config.ts`中本轮修改的三个文件 | 禁用自动化真实AI；实际本机Chrome；为真实模型设置适当等待时间 |
| `scripts/build-pages.mjs` | Windows使用junction和npm JS入口；为Next导出的RSC分段文件补齐浏览器请求的点分文件名；保留原文件，仅本地导出 |
| `.gitignore` | 独立静态／开发浏览器测试输出忽略 |

页面只调用 `createServices(mode).wardrobe` 的 `list/get/image/add/update/pause/resume/remove`；候选检查仍用原有 `availability/candidates/statuses`。图片处理沿用 `prepareImage` / BiRefNet，识别沿用 `services.recognition.recognize` / HTTP / `ai-provider.ts`，未修改04的模型Prompt、路由或服务逻辑。UI没有直接操作Dexie/IndexedDB，没有另建localStorage衣物存储。E2E测试中的IndexedDB访问只用于独立浏览器上下文的故障注入和验收取证。

## 四字段契约和待联调

新页面写入完整数组：

```ts
styleTags: string[]
sceneTags: string[]
styleOther: string[]
sceneOther: string[]
```

风格：中性风、甜美风、亚文化风、简约风、优雅风、复古风、街头风、运动休闲风、学院风。
场景：学习、上班、约会、朋友聚会、运动健身、户外。
`其他`是说明入口，不算第10种固定风格或第7种固定场景；不确定不会变为其他。

兼容层对旧v3记录允许新增字段缺省，读取展示时用 `readTags` 生成无损视图，不在读取时重写旧库。新页面确认保存后，四字段通过原衣橱服务和原事务真正持久化。旧调用者未提交的标签组不变；02的正式v4迁移不在本轮实现。

**02最小后续工作**：审查兼容提交93fe847；将#34正式 `src/shared/domain/tags.ts` 定稿为V1.2的9/6词表；在整合后的统一模块中保留对应显示名称及Other约束，再替换03适配模块。合入v3→v4迁移并验证已存在本轮四字段的数据不会降格或丢失，旧衣物、媒体、旧结果与反馈不变。当前临时兼容不等于已合并#34。

**04最小后续工作**：`recognitionCandidateSchema`、`ai-provider.ts`的原始输出解析与模型Prompt、HTTP返回契约增加 sceneTags/styleOther/sceneOther，使用正式映射并补测试。当前AI仅返回旧styleTags；03不声称已经自动识别场景。当前可手动补场景／Other。真实OpenRouter识别质量、服务端90秒超时与模型可用性需本人手测，03只验证模拟响应及95秒客户端兜底。

**05最小后续工作**：整合#34的偏好标签／场景对象与快照sceneTags；当前 `src/modules/session/schema.ts` 的快照和 `snapshotOf()` 仍只复制旧styleTags。核心AI Client传递的衣橱可带新字段，但本轮没有证明模型已正确采用新场景；需05验证场景只辅助、不做硬过滤，以及新旧快照兼容。`createServices().recommendation` 仍为旧规则页面服务，独立 `RecommendationCoreService` 未被替换或重写。

不影响03独立手动录入、正式持久化和管理；影响全组统一标签迁移、AI新字段和推荐语义的最终签收。保留Draft，不能标记全部跨模块联调完成。

## 开发环境和运行

Windows 11；Git 2.56.1.windows.1；Node v24.13.0；npm 11.6.2；GitHub CLI 2.104.0；正式Google Chrome 157.0.8103.79。Node满足>=22.12。

原先没有node_modules，按package-lock运行 `npm.cmd ci --legacy-peer-deps`；系统npm缓存无权限后用 `--cache ..\round5-work\npm-cache --no-audit --no-fund` 重试成功，没有升级依赖或修改锁文件。终端最初网络／gh配置沙箱受限，授权的提权执行后fetch和既有登录正常，未重新登录或输出token。提交身份为本人ecttk的GitHub隐私邮箱，不冒用组员。

```powershell
Set-Location 'C:\Users\dell\Desktop\WearWise\wearwise'
npm.cmd ci --legacy-peer-deps
npm.cmd run dev
```

访问 `http://127.0.0.1:3000/wardrobe`。无Key可以手动录入；上传白底成功但AI失败时，显式选择手动确认。Pages静态版只提供本机白底及手动资料，不伪装服务端AI可用。

模型已通过仓库脚本用本机Git Bash安装，保留LICENSE：

- `public/models/birefnet/model_fp16.onnx`
- 98484532 bytes
- SHA-256：`eff9216bb2f9d3f023d9c2b7196845a7485739ab1f231593633e4d2344ffc516`
- `.env`、`.env.local`和模型权重均经 `git check-ignore` 确认忽略，未提交。

## 测试记录

原始运行日志保存于仓库外同级 `round5-work`；界面证据与精简结果随本交接提交。所有自动化均禁用真实AI。

| 命令／范围 | 实际结果 |
| --- | --- |
| `npm.cmd run typecheck` | 最终修正后通过 |
| `npm.cmd test` | 最终修正后174通过、1跳过；24测试文件通过、1文件跳过 |
| `npm.cmd run build` | 最终修正后通过，生产Next.js构建 |
| 最后宽屏缩略图样式修正后的R5浏览器复测 | 5通过，0失败；新增缩略图高度、标题与完成按钮处于视口内的断言；再次生产构建通过 |
| `npm.cmd run test:e2e` | 正式Chrome全量47项：42通过、5失败，全部为下述原有天气问题 |
| `npm.cmd run test:e2e -- e2e/wardrobe.spec.ts e2e/wardrobe-parallel.spec.ts e2e/birefnet-business.spec.ts e2e/round5-wardrobe.spec.ts` | 最终修正后24通过，0失败，包含真实本机模型及模拟AI |
| `npm.cmd run build:pages` | Windows兼容修复后通过，未发布 |
| `npm.cmd run test:e2e:pages -- --output test-results-pages` | 3通过，包含真实本机模型、保存和刷新 |
| 开发模式：5项 `R5-` 浏览器用例 | 5通过；使用临时端口3020的配置，避免与生产回归端口冲突；StrictMode实际运行 |
| `node --test .github/scripts/progress.test.mjs` | 10通过 |
| 真实OpenRouter | 0次，未验证 |

全量、开发模式与静态检查完成后，最后补上“旧AI接口缺少场景字段不能清空已有场景”和“批量空文件／超限文件逐项失败”两个边界。之后重新运行全部单元、类型、构建及上表24项衣橱专项；不把其他模块未重复执行的检查冒称为该两项修正后的全量复验。最后两项修正没有改推荐、识别、Session或静态构建脚本。

1536px截图复查还发现列表图片放大规则误匹配批量弹窗，已将媒体查询限定到衣橱网格卡片。该纯样式修正后再次构建并运行全部5个R5浏览器场景通过，重新保存最终截图。

开发模式复验可直接使用仓库配置（关闭其他占用3000端口的服务）：

```powershell
npm.cmd run test:e2e:dev -- e2e/round5-wardrobe.spec.ts --output test-results-dev
```

修复过程中的失败如实保留：键盘返回焦点问题已修复；真实模型推理超过旧15秒等待后，仅对图片用例设置90秒等待／适当用例超时，保留其他测试原30秒上限；静态导出先遇到Windows symlink权限及RSC文件名404，修复后3项静态检查全部通过。并发运行浏览器推理与单元测试时，原推荐性能用例曾测得2.76秒而失败；在浏览器结束后单独重跑全部单元，174通过，未改推荐算法或2秒断言。

本机ONNX推理使用合成衬衫、Canvas样本；已检查白底角点、衣物形状、保存Blob及刷新读取。实物照片分割质量和真实AI识别没有冒充通过，仍需本人按下述人工步骤验收。

修改前基线：typecheck通过；Vitest 157通过、1跳过；生产构建通过；正式Chrome 37通过、5失败。跳过项为默认关闭的真实首页AI测试。

已知5项历史浏览器失败（保留断言，不改为skip）：

1. `recommendation.spec.ts` 刷新后天气控件与已保存推荐使用的城市一致。
2. `recommendation.spec.ts` 获取后五分钟内观测时间先过期时禁止继续使用推荐。
3. `weather.spec.ts` 天气失败重试／主动示例／切城。
4. `weather.spec.ts` 快速切城的晚天气响应。
5. `weather.spec.ts` 切换示例模式后的晚天气响应。

天气行为交05/07，不接管修复，不删除失败断言。ESLint：package.json没有lint脚本，依赖和仓库也没有ESLint配置；未虚构一次lint通过。

## R5复现与验收范围

| 项 | 证据和边界 |
| --- | --- |
| R5-01 | 新版E2E：空衣橱逐类添加5件、默认分类及各类数量；原衣橱E2E：暂停计数／删除扣数 |
| R5-02 | 真实Chrome＋本机模型：白底blob保存、白色角点、刷新恢复；模拟AI可修改并确认；真实OpenRouter未测试 |
| R5-03 | 词表／英文同义映射／Other校验单测；新版E2E两组多选、Other说明与刷新后四数组 |
| R5-04 | 三项批量：成功、无效图片失败、等待中的模拟AI；逐项编辑与勾选 |
| R5-05 | 单元与浏览器：部分保存、单项事务失败、双击、重试、已保存不重复添加 |
| R5-06 | 旧revision写入拒绝、事务及图片引用单测；换图失败／取消、保存失败草稿与旧库保护E2E |
| R5-07 | 原数据层北京时间边界单测＋暂停日期弹窗／刷新／提前恢复E2E；候选读取每次重新判定 |
| R5-08 | 原 `tests/round2/session.test.ts` 删除／暂停B只换A、旧图及反馈保留；不是第8/9轮整页最终签收 |
| R5-09 | 单元晚AI／换图／取消／dispose；浏览器旧图晚返回、模式切换、文件选择cancel、URL释放 |
| R5-10 | 实际模型文件503故障注入、fallback禁止保存；AI失败／超时模拟与手动确认；真实AI超时未触发 |
| R5-11 | 原v2→v3迁移回归、新旧标签无损读取及重开数据库；#34的v3→v4未整合，不能声称已验收 |
| R5-12 | 类型、单元、生产构建、正式Chrome、静态导出及开发模式结果见本次最终记录 |

下一位04复验：按本交付分支固定提交检出；安装锁文件和校验模型；先跑无Key检查；用隔离浏览器资料操作单件、批量与换图；与02整合标签模块后再增加识别新字段；由07独立复验。不要在真实用户数据库运行故障注入或清库。

## 真实AI人工测试上限

本次Codex未读取 `.env` / `.env.local`，未枚举系统环境或凭据，未索要或使用课程Key，未发起真实OpenRouter请求。自动化启动配置显式清空相关Key；模拟AI与真实本机推理分开记录。

需要本人在Codex之外的新PowerShell窗口进行真实AI测试。本人可用隐藏输入把Key放入该窗口的临时进程环境（不存文件、不贴聊天），设置 `AI_MODEL=qwen/qwen3.8-max-0902`、`AI_TIMEOUT_MS=90000` 后自行启动应用；关闭窗口结束。不要把Key交给编程代理。

以下命令只供本人复制到独立PowerShell中执行，**不要让Codex执行，不要在Codex聊天或Codex终端输入Key**。它不把Key保存到项目文件；停止应用后清除该窗口的Key变量。

```powershell
Set-Location 'C:\Users\dell\Desktop\WearWise\wearwise'
$wearwiseSecureKey = Read-Host '在此独立窗口隐藏输入OpenRouter Key' -AsSecureString
$wearwiseKeyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($wearwiseSecureKey)
try {
  $env:OPENROUTER_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($wearwiseKeyPointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($wearwiseKeyPointer)
  $wearwiseSecureKey.Dispose()
}
$env:AI_MODEL = 'qwen/qwen3.8-max-0902'
$env:AI_TIMEOUT_MS = '90000'
try { npm.cmd run dev }
finally { Remove-Item Env:\OPENROUTER_API_KEY -ErrorAction SilentlyContinue }
```

最多6次真实请求：单件选择1张（第1次），更换另一张（第2次），批量3张（第3–5次）；仅确有失败且仍需验证时手动重试一次（第6次）。不为凑次数重试，不上传私人照片，不自动充值。检查资料准确性、手改标签保护、手工场景确认、部分保存及刷新。白底重处理本身不增加AI请求。模型不可用交04核对，不自行更换供应商或模型。
