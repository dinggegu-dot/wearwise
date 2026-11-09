# WearWise · 智能衣橱

**开发接力从 [12 轮总计划 #10](https://github.com/dinggegu-dot/wearwise/issues/10) 开始。** 第 01 轮已交付。第 02 轮由 02 从 [候选分支](https://github.com/dinggegu-dot/wearwise/tree/codex/round-01-baseline) 开始，在自己的电脑完成安装、五页复验与签收。[01 → 02 交接](https://github.com/dinggegu-dot/wearwise/blob/40d68d94a790e757143739fc84b05477f44d90ff/docs/handoffs/ROUND-01.md)

第 01 轮固定提交为 `40d68d94a790e757143739fc84b05477f44d90ff`。候选包含首页、我的衣橱、穿搭推荐，以及穿搭灵感和我的偏好两个页面框架。线上仍是 V0.2 框架。

## 团队和 AI 的共同材料

[网页功能概述](https://github.com/dinggegu-dot/wearwise/blob/40d68d94a790e757143739fc84b05477f44d90ff/docs/project/WEB-FUNCTION-OVERVIEW.md) · [推荐依据与记忆规则](https://github.com/dinggegu-dot/wearwise/blob/40d68d94a790e757143739fc84b05477f44d90ff/docs/project/RECOMMENDATION-MEMORY-RULES.md) · [12 轮次排班](https://github.com/dinggegu-dot/wearwise/blob/40d68d94a790e757143739fc84b05477f44d90ff/docs/project/ROUND-SCHEDULE.md) · [UI 示例](https://github.com/dinggegu-dot/wearwise/blob/40d68d94a790e757143739fc84b05477f44d90ff/docs/project/UI-REFERENCE.md) · [交接模板](https://github.com/dinggegu-dot/wearwise/blob/40d68d94a790e757143739fc84b05477f44d90ff/docs/handoffs/ROUND-HANDOFF-TEMPLATE.md)

开工前读共同材料与上一轮交接，并以其固定 SHA 为基础。每轮负责人亲自复核可操作流程。只有点击「生成穿搭」并成功才开启新一轮，单次反馈在同一轮持续有效，首页与推荐页调整互相独立。

| 岗位 | 负责轮次 | 任务卡 |
| --- | --- | --- |
| 01 主控与集成 | 01、11 | [#11](https://github.com/dinggegu-dot/wearwise/issues/11) |
| 02 数据与我的偏好 | 02、07 | [#12](https://github.com/dinggegu-dot/wearwise/issues/12) |
| 03 我的衣橱 | 05 | [#13](https://github.com/dinggegu-dot/wearwise/issues/13) |
| 04 真实 AI 与穿搭灵感 | 03、06 | [#14](https://github.com/dinggegu-dot/wearwise/issues/14) |
| 05 推荐规则与反馈 | 04、08 | [#15](https://github.com/dinggegu-dot/wearwise/issues/15) |
| 06 首页与导航 | 09 | [#16](https://github.com/dinggegu-dot/wearwise/issues/16) |
| 07 独立验收 | 10、12 | [#17](https://github.com/dinggegu-dot/wearwise/issues/17) |

提交时在 PR 写清负责轮次、基线、验证结果和未完成项。具备仓库写权限的团队成员可参与评审和验收，并在满足 main 保护和 CI 要求后合并 PR。第 10、12 轮的独立整体验收由 07 主责。

[提交与查看 PR](https://github.com/dinggegu-dot/wearwise/pulls) · [团队提交总览 #20](https://github.com/dinggegu-dot/wearwise/issues/20) · [提交与合并指南](team/提交与合并指南.md)

## 在线体验

[打开 WearWise](https://dinggegu-dot.github.io/wearwise/)

## 线上版本当前进度

- 已完成：响应式页面、导航、衣橱和推荐功能分区。
- 计划中：衣物录入与存储、天气、图片识别、推荐规则和反馈。页面上的后续功能均明确标示，当前没有接入真实数据。
- 仓库保留部分尚未完成的领域代码，不能视为已交付功能。

## 技术栈

Next.js App Router、React、TypeScript、Tailwind CSS、Lucide；计划使用 Dexie、Zod、Vitest 和 Playwright 完善后续功能。

## 团队协作

七位成员通过 [新版团队工作台](https://github.com/dinggegu-dot/wearwise/blob/40d68d94a790e757143739fc84b05477f44d90ff/team/README.md) 查看共同资料，并在上面的任务卡记录接力结果。

## 本地开发

复验五页候选时，按 [01 → 02 交接](https://github.com/dinggegu-dot/wearwise/blob/40d68d94a790e757143739fc84b05477f44d90ff/docs/handoffs/ROUND-01.md) 克隆候选分支。以下命令同样适用于本仓库当前分支。

需要 Node.js 22.12 或更高版本。

```bash
npm ci --legacy-peer-deps
npm run dev
```

在浏览器访问 http://127.0.0.1:3000 。当前 npm 依赖树需要 `--legacy-peer-deps`；安装后应执行构建和测试，不能仅凭该选项认定依赖完全兼容。

```bash
npm run typecheck
npm run build
npm run test:e2e
```

端到端测试要求本机安装正式 Google Chrome，并先完成构建。

## 项目结构

- `src/app`：页面和 API 路由。
- `src/shared`：共享 UI、样式及基础设施。
- `src/modules`：后续衣橱、识别、天气、推荐和反馈模块。
- `src/composition`：模块装配入口。
- `e2e`：基础 Chrome 端到端检查。

GitHub Pages 发布当前静态页面；需要服务端的功能待后续另行接入，不能直接在 Pages 上运行。暂未配置任何真实 API Key。

## 许可

暂未指定开源许可证；如需复用或分发，请联系项目所有者。
