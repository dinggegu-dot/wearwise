# WearWise · 本地优先的智能衣橱

**当前功能候选已可测试，尚未合并/发布。** 基础版 [PR #21](https://github.com/dinggegu-dot/wearwise/pull/21) 的产品基线为 `92ee865ccf76d545534b8358e5c89288d5305ddf`；2026-11-06 核查 main 仍是 V0.2 框架。

[当前功能、架构、缺口](docs/project/CURRENT-STATE.md) · [团队优化建议与 DDL](team/NEXT-ITERATION.md) · [总计划 #10](https://github.com/dinggegu-dot/wearwise/issues/10) · [PR/检查总览 #20](https://github.com/dinggegu-dot/wearwise/issues/20)

**共同产品目标：**穿搭推荐保留原计划的图片输出——用用户确认保存的真实衣物图片组成平面搭配卡片，并展示理由。详见 [图片穿搭目标、接口和验收](docs/project/OUTFIT-IMAGE-SPEC.md)；示例图片演示不等于真实照片联调验收通过。

## 已有能力

- 首页、我的衣橱、穿搭推荐三个页面；示例模式内置 8 件，和真实衣橱分库。
- 手动/照片录入、确认、详情、分类、编辑/替换图片、删除、永久排除与数量联动。
- IndexedDB + Dexie 事务保存图片/衣物，刷新及同一浏览器重开保留；开发模式读取故障已修复。
- 六城市实时/示例天气、规则生成 0–2 套搭配、反馈与恢复。
- 类型、单元、Chrome 开发/生产/静态测试。真实模型识别默认关闭，未验证效果。

没有账户/云同步/备份、自动学习、完整灵感分析或历史浏览；不把已留接口当已完成产品。详情和证据见 [现状](docs/project/CURRENT-STATE.md)。

## 本地试用候选

使用 #21 分支或其合入后的版本；旧 main 没有这些业务能力。需要 Node.js >=22.12 和正式 Google Chrome：

```bash
npm ci --legacy-peer-deps
npm run preview
```

等待 Ready，Chrome 打开 `http://127.0.0.1:3000`：体验示例衣橱→我的衣橱 8 件→穿搭推荐→使用示例天气→生成→反馈。真实模式可添加自己的衣物。开发用 `npm run dev`。数据按浏览器和 origin 保存，`localhost` 与 `127.0.0.1` 不同；清理站点数据可能丢失衣物。

更多见 [使用指南](docs/testing/LOCAL-GUIDE.md) 和 [基础验收](docs/testing/BASE-TEST.md)。

## 团队接下来做什么

**11 月 14 日 23:59 前完成个人优化并交代码、测试和设计说明；11 月 15—19 日联调对齐与修复；11 月 20 日完成最终验收。全部北京时间，2026 年。** 14 日不是只交方案。具体选题为建议，成员提前自行沟通并收敛。

[团队工作台](team/README.md) 按 01—07 岗位列出要找谁、建议优化什么和实际交付要求；正式成果仍用同一仓库 PR，返修更新原 PR。旧的 A→B→C 从零搭建任务已被当前优化安排替代；已确认基线和验收要求保留。

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
