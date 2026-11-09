# WearWise · 本地优先的智能衣橱

**第 1 轮统一候选**在 #21 → #22 → #23 的实际提交链上扩展五个页面入口。开始接力前请读取 [第 1 轮交接](docs/handoffs/ROUND-01.md) 和 [本轮范围与旧基线差异](docs/project/ROUND-01-SCOPE.md)。

**第 2 轮**补齐衣橱、灵感、三组长期偏好和推荐过程的数据服务，数据库升级到 v3。见 [第 2 轮交接](docs/handoffs/ROUND-02.md) 与 [数据服务接口说明](docs/project/ROUND-02-DATA-API.md)。

[功能概述](docs/project/WEB-FUNCTION-OVERVIEW.md) · [推荐与记忆规则](docs/project/RECOMMENDATION-MEMORY-RULES.md) · [UI 示例](docs/project/UI-REFERENCE.md) · [12 轮次排班](docs/project/ROUND-SCHEDULE.md) · [团队工作台](team/README.md)

**共同产品目标：**穿搭推荐保留原计划的图片输出——用用户确认保存的真实衣物图片组成平面搭配卡片，并展示理由。详见 [图片穿搭目标、接口和验收](docs/project/OUTFIT-IMAGE-SPEC.md)；示例图片演示不等于真实照片联调验收通过。

## 已有能力

- 首页、我的衣橱、穿搭推荐三个业务页面；穿搭灵感和我的偏好可进入页面框架。示例模式内置 8 件，和真实衣橱分库。
- 手动/照片录入、确认、详情、分类、编辑/替换图片、删除、永久排除与数量联动。
- IndexedDB + Dexie 事务保存图片/衣物，刷新及同一浏览器重开保留；开发模式读取故障已修复。
- 六城市实时/示例天气、规则生成 0–2 套搭配、反馈与恢复。
- 类型、单元、Chrome 开发/生产/静态测试。真实模型识别默认关闭，未验证效果。

没有账户/云同步/备份、自动学习、完整灵感分析或历史浏览；不把已留接口当已完成产品。详情和证据见 [现状](docs/project/CURRENT-STATE.md)。

## 本地试用候选

先按交接固定候选分支和提交。需要 Node.js 22.12 或更高版本，以及正式 Google Chrome。

```bash
npm ci --legacy-peer-deps
npm run preview
```

等待 Ready，Chrome 打开 `http://127.0.0.1:3000`：体验示例衣橱→我的衣橱 8 件→穿搭推荐→使用示例天气→生成→反馈。真实模式可添加自己的衣物。开发用 `npm run dev`。数据按浏览器和 origin 保存，`localhost` 与 `127.0.0.1` 不同；清理站点数据可能丢失衣物。

更多见 [使用指南](docs/testing/LOCAL-GUIDE.md) 和 [基础验收](docs/testing/BASE-TEST.md)。

## 团队接下来做什么

按 [12 轮次排班](docs/project/ROUND-SCHEDULE.md) 接力。01 的候选交给 02 扩展数据服务，后续轮次使用 [统一交接单](docs/handoffs/ROUND-HANDOFF-TEMPLATE.md)。[旧任务记录](team/NEXT-ITERATION.md) 用于追溯已有功能与历史安排。

## 结构与验证

`src/app` 路由/API；`src/composition` 模式与服务装配；`src/modules` 衣橱、图片、识别、天气、推荐、反馈、示例；`src/shared/infrastructure` Dexie/事务；`tests` 单元和契约；`e2e` 正式 Chrome；`docs/testing` 证据与使用方法。

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:e2e:dev
npm run build:pages
npm run test:e2e:pages
```

以上串行执行，避免端口和报告冲突。`npm run test:e2e:live` 会实际访问六城市天气接口，真实与模拟分开记录。历史实测 49 项单测、开发/生产各 34 项、Pages 2 项、真实天气 2 项，见 [验收记录](docs/testing/ACCEPTANCE.txt)。本次文档更新不冒称重新跑过全部产品检查。

## 发布、AI 与许可

[线上 Pages](https://dinggegu-dot.github.io/wearwise/) 在本次核查时没有部署上述候选；静态版本不支持服务端识别。合并 main 会触发发布，操作须按既定授权流程进行。

真实识别需另行确认照片发送、服务商/费用/样本并在服务端配置密钥。Open-Meteo 请求固定城市公共坐标，不发送衣橱照片；商业使用需核查 [官方条款](https://open-meteo.com/en/pricing)。

项目自身暂未指定开源许可证；第三方复用见 [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md) 与 [来源核查](docs/terra/SOURCE-REUSE.md)。
