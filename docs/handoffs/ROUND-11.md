# 第 11 轮 · 01 交给 07

交接日期为 2026-11-28（北京时间）。01 从第 9 轮产品代码接续，按第 10 轮独立验收的问题清单完成集中修复。07 在第 12 轮用自己的电脑复验并记录结论。

## 固定版本

| 项目 | 版本 |
| --- | --- |
| 接续分支 | [`codex/round-11-integration`](https://github.com/dinggegu-dot/wearwise/tree/codex/round-11-integration) |
| 实测源码 | [`adf4d05f6839dde2d0a061a31fd9e724b7ee731a`](https://github.com/dinggegu-dot/wearwise/commit/adf4d05f6839dde2d0a061a31fd9e724b7ee731a) |
| 上一轮产品基线 | [PR #40](https://github.com/dinggegu-dot/wearwise/pull/40) 的 `c147a82e02c738de162bf837ffd4295fcbb6b77d` |
| 第 10 轮问题清单 | [PR #41](https://github.com/dinggegu-dot/wearwise/pull/41) 的 `758785d98afc1cf2dc02550bbe3f11fcaba63dae` |
| 分工 | [01 任务卡 #11](https://github.com/dinggegu-dot/wearwise/issues/11) · [07 任务卡 #17](https://github.com/dinggegu-dot/wearwise/issues/17) |

候选包含 `main` 上的《网页功能概述》第 4 版原件。网页版补齐标签、双入口和场景规则，并记录本轮的上传目标和等待状态。启动、问题记录和复验步骤集中在本页。第 11 轮拉取请求正文会固定包含本页的完整提交编号。

[网页功能概述](../project/WEB-FUNCTION-OVERVIEW.md) · [推荐依据与记忆规则](../project/RECOMMENDATION-MEMORY-RULES.md) · [12 轮次排班](../project/ROUND-SCHEDULE.md) · [UI 示例](../project/UI-REFERENCE.md) · [搭配知识 V1.2](../knowledge/OUTFIT-TIPS.md)

## 修复与证据

以下修复属于同一个源码提交 `adf4d05`，可从其父提交核对差异与回退。

| 第 10 轮问题 | 第 11 轮修复 | 验证 |
| --- | --- | --- |
| 点虚线加号选不了照片 | 加号、文字和键盘共用一个选图按钮。关闭选择器保留草稿 | Chrome 逐项触发，三个操作各打开一次选择器 |
| 全身照的白底图与识别文字可能对应不同衣物 | 在线处理前先确认单件原图或框选一件目标。识别、白底和对应重试共享选区。换图或重选会取消在途处理并保留手填字段 | 用同一张合成图分别选择上下装，比较两路上传与重试的字节。保存刷新后核对卡片像素和类别。真实上游成品待 07 核对 |
| 白底重做失败后可能误用旧成功状态 | 单独重试识别时保留白底错误。批量等待中的任务可继续排队，失败不会误启用保存 | Vitest 验证白底失败后识别成功仍不能保存。Chrome 验证部分保存、失败重试和换图竞态 |
| 推荐请求耗时长，用户难以判断状态 | 推荐页显示当前操作和实际等待秒数。请求进行中锁住重复提交，失败显示请求编号并可重试 | Chrome 注入超时，核对计时、一次提交、错误编号、旧推荐与反馈保留 |
| 真实推荐超时及格式错误 | 复用 OpenRouter 的 JSON 输出选项。默认 Qwen 模型使用与识别相同的最小推理档。校验衣物 ID、替换范围和输出字段，失败信息带请求编号。服务端日志区分首页、推荐页、操作类型、阶段和耗时 | API 测试验证结构化返回、超时与格式错误。第 10 轮原始响应未取得，真实延迟和输出仍待 07 复验 |
| 缺失图片或反馈写入失败 | 首页和推荐页在提交结果前核对衣物图片。反馈写入失败保留表单和搭配，允许重试 | Vitest 验证缺图不提交新轮。Chrome 注入反馈存储错误后重试，刷新仍可读取 |
| 默认 Chrome 有 21 项失败 | 将旧的手动天气、旧反馈和旧页面选择器改为现行交互，并校验固定的 BiRefNet 模型 | 第 9 轮基线复现 42/63 通过。第 11 轮生产 Chrome 65/65 通过 |

现有 IndexedDB 迁移测试覆盖旧版衣物、图片、推荐和反馈的保留。第 11 轮沿用原数据库版本与隔离策略。建议在原浏览器保留旧数据，复验时用独立 Chrome 用户目录运行测试素材。

## 在另一台电脑启动

需要 Node.js 22.12 或更新版本、npm 和正式 Google Chrome。Windows 一样可用 PowerShell 运行 Git 与 npm。需要执行仓库的模型下载脚本时，在 Git Bash 中运行该命令。

```bash
git clone --branch codex/round-11-integration https://github.com/dinggegu-dot/wearwise.git
cd wearwise
git switch --detach adf4d05f6839dde2d0a061a31fd9e724b7ee731a
git rev-parse HEAD
npm ci --legacy-peer-deps
npm run dev -- --port 3009
```

浏览器打开 `http://127.0.0.1:3009`。导航进入首页、我的衣橱、穿搭推荐、穿搭灵感、我的偏好。

- 真实联调用仓库根目录的 [`.env.example`](../../.env.example) 创建 `.env.local`，设置团队授权的 `OPENROUTER_API_KEY` 后重启。默认 `AI_MODEL` 是 `qwen/qwen3.8-max-0902`，`OPENROUTER_BACKGROUND_MODEL` 是 Seedream 5.0 Flash。推荐与在线白底分别使用模板中的 90 秒和 120 秒服务端超时。密钥仅保存在本机服务端。
- 首次运行 Chrome 完整回归前，执行 `bash scripts/install-birefnet-model.sh` 下载并校验固定权重。可再执行 `bash scripts/install-birefnet-model.sh --verify public/models/birefnet/model_fp16.onnx` 核对安装。[模型说明](../spikes/BiRefNet-model-delivery.md)
- 测试素材在 [`tests/fixtures/`](../../tests/fixtures/README.md)。合成衣物适合自动回归。真实衣物流程请使用团队授权的单件照和一张可清楚区分上下装的全身穿搭照。
- 静态导出可以浏览五页、手动录入衣物和使用本机白底模型。页面会提示生成搭配需要已配置的 WearWise 服务。

## 07 复验步骤

1. **衣橱。** 录入上衣、下装和鞋，每类至少两件便于找替代。单件从加号或文字选图，确认白底与识别，改名保存并刷新。再用同一张全身照分别框选上衣和长裤，确认白底、名称、类别、颜色和保存卡片一一对应。重试白底或识别后再对照一次。
2. **生成与恢复。** 在推荐页先用可用衣物和默认条件生成，再复跑第 10 轮失败的原条件。记录页面等待时间、结果或请求编号。失败时核对终端里的 `[wearwise.recommendation]`，用同一编号查看来源、操作、阶段、`modelMs` 和 `detail`。只向团队提交脱敏诊断与必要截图。
3. **三条铁律。** 生成一次并保存一条「仅本轮适用」的反馈。暂时不换后连续换整套、换单件，核对反馈继续有效。改草稿、切页或生成失败时，确认旧轮、已应用条件和反馈仍在。再次点击「生成穿搭」且成功后，确认旧反馈不再使用。去首页生成和替换，回推荐页核对搭配、已应用天气与反馈；反向操作也核对首页未被改写。
4. **其余页面。** 上传经许可的灵感图，确认分析、编辑、保存及长期偏好归纳。编辑或删除偏好并刷新，检查手改与主动删除不会被覆盖。提交一次「永久适用」反馈，核对「我的偏好」中的反馈和搭配快照。
5. **签收。** 在第 12 轮记录实际被测 SHA、浏览器与系统、每项实测结果、遗留问题和最终是否建议合并。真实推荐、真实白底成品以及真实模型下的三条铁律，需由 07 签收。

## 本机检查记录

环境为 macOS、Node.js 22.23.2、npm 10.9.8、Google Chrome 156.0.8078.80。Chrome 业务用例模拟天气和服务端模型返回，BiRefNet 检查运行了真实本机模型。

| 检查 | 结果 |
| --- | --- |
| 按锁文件干净安装、类型检查、生产构建 | PASS |
| Vitest 与旧数据迁移 | PASS，254 通过、1 个原有真实接口用例跳过 |
| GitHub 进度收集脚本 | PASS，10/10 |
| 生产 Chrome 五页、业务、竞态和本机白底 | PASS，65/65 |
| 开发 Chrome | PASS，65/65（默认单工作进程） |
| 静态构建、模型 SHA-256 与 Chrome 静态回归 | PASS，3/3 |
| 真实 OpenRouter 识别、出图、推荐与延迟 | NOT_RUN，本轮环境未配置授权密钥。真实输出和延迟留给第 12 轮 |
| 07 独立整体验收 | 待第 12 轮 |

第 11 轮为可复验候选。GitHub 的 `main` 和线上部署状态由后续正式验收决定。
