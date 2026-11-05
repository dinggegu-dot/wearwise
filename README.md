# WearWise · 智能衣橱

一个面向日常穿搭的智能衣橱项目。当前发布的是 **V0.2 产品框架**：展示首页、我的衣橱和穿搭推荐三个页面，以及未来功能的布局。

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
