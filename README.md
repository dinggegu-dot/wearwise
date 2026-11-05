# WearWise · 智能衣橱

一个面向日常穿搭的智能衣橱项目。当前发布的是 **V0.2 产品框架**：展示首页、我的衣橱和穿搭推荐三个页面，以及未来功能的布局。

## 第一批任务：每个人从这里开始

目标：把当前网页框架升级为可以**手动管理本地衣物、查看六城市天气**的 Demo。照片留在本机；AI 识别和自动推荐仍在后续。详细范围和验收：[第一批总计划](https://github.com/dinggegu-dot/wearwise/issues/10)。

| 岗位 | 任务 |
|---|---|
| 01 主控与合并 | [查看任务 #11](https://github.com/dinggegu-dot/wearwise/issues/11) |
| 02 衣物与本地存储 | [查看任务 #12](https://github.com/dinggegu-dot/wearwise/issues/12) |
| 03 衣橱界面 | [查看任务 #13](https://github.com/dinggegu-dot/wearwise/issues/13) |
| 04 本地照片处理 | [查看任务 #14](https://github.com/dinggegu-dot/wearwise/issues/14) |
| 05 天气服务 | [查看任务 #15](https://github.com/dinggegu-dot/wearwise/issues/15) |
| 06 首页天气与数量 | [查看任务 #16](https://github.com/dinggegu-dot/wearwise/issues/16) |
| 07 独立验收 | [查看任务 #17](https://github.com/dinggegu-dot/wearwise/issues/17) |

### 怎么开始和提交

1. 登录 GitHub，打开自己的任务，在评论区写“已领取”。
2. Fork 这个仓库（仓库拥有者使用独立任务分支），从最新 main 建立自己的分支，按任务卡开发并自测。
3. 把分支推到自己的仓库，向本仓库 main 发起 Pull Request（PR，合并申请）。写清完成内容、测试结果、没验证的内容、依赖的 PR 和联调情况。
4. 不直接覆盖 main；不上传私人照片、用户数据或 API Key。每人的账号目前未绑定，请自行领取。

### 谁和谁配合

- **衣橱小组：02、03、04。** 03 负责衣橱界面联调，02 提供存储，04 提供本地照片处理。
- **天气小组：05、06。** 05 提供天气数据，06 负责首页联调。两个小组可以同时做。
- **两两确认交接：** 02↔03 对齐衣物字段和增查改删；03↔04 对齐照片处理、预览和错误；02↔04 对齐照片 Blob 的保存；05↔06 对齐天气数据和错误；02↔06 对齐衣物数量的读取和刷新。具体标准写在双方任务卡中。
- 03 负责衣橱组件拆分，06 新建首页天气组件；共同入口由两人先商量修改顺序。解决不了的公共配置或跨组问题再找 01。

### 验收和合并

07 从一开始准备测试；对需要彼此配合的 PR，在隔离的候选版本中一起验收，问题交负责人修复并复测。07 记录实际测试、代码版本、结果和未验证项；不能把模拟数据通过当成真实功能通过。

**用户决定是否合并。** 有权限且获授权的 01 合并；07 如需兼任合并人，须经用户明确安排并有实际权限。按依赖顺序合并后，07 再检查主分支的完整流程和 Pages 部署。main 更新会触发网页发布。

---

## 在线体验

[打开 WearWise](https://dinggegu-dot.github.io/wearwise/)

## 当前进度

- 已完成：响应式页面、导航、衣橱和推荐功能分区。
- 计划中：衣物录入与存储、天气、图片识别、推荐规则和反馈。页面上的后续功能均明确标示，当前没有接入真实数据。
- 仓库保留部分尚未完成的领域代码，不能视为已交付功能。

## 技术栈

Next.js App Router、React、TypeScript、Tailwind CSS、Lucide；计划使用 Dexie、Zod、Vitest 和 Playwright 完善后续功能。

## 团队协作

七位成员从 [团队工作台](team/README.md) 进入各自的任务、进度和 PR；首次提交请看 [从任务到合并](team/%E6%8F%90%E4%BA%A4%E4%B8%8E%E5%90%88%E5%B9%B6%E6%8C%87%E5%8D%97.md)。

## 本地开发

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

