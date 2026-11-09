# 第 1 轮交接 · 01 → 02

日期为 2026-11-09（北京时间）。范围为 [R01-r1](../project/ROUND-01-SCOPE.md)。开工前读 [功能概述](../project/WEB-FUNCTION-OVERVIEW.md)、[记忆规则](../project/RECOMMENDATION-MEMORY-RULES.md)、[UI 示例](../project/UI-REFERENCE.md) 和 [12 轮次排班](../project/ROUND-SCHEDULE.md)。后续沿用 [交接模板](ROUND-HANDOFF-TEMPLATE.md)。

## 唯一代码起点

本轮唯一入口为 [团队仓库的 `codex/round-01-baseline`](https://github.com/dinggegu-dot/wearwise/tree/codex/round-01-baseline)。基线来自 #23 的 `a1c1cf51e33cb947dae8326b54ae3e5d410267b3`，依次包含 #22 与 #21。对比说明和可复用项见 [R01-01](../project/ROUND-01-SCOPE.md#已核实的来源与决策)。

在空目录执行下列命令。用 `git rev-parse HEAD` 记录检出的完整 SHA，与交付记录核对。

```sh
git clone --branch codex/round-01-baseline --single-branch https://github.com/dinggegu-dot/wearwise.git wearwise
cd wearwise
git rev-parse HEAD
npm ci --legacy-peer-deps
npm run preview
```

离线交接时，把克隆命令中的 GitHub URL 换为随交接附送的 `wearwise-round-01.bundle` 路径。

Node.js 22.12 或更高版本，使用正式 Google Chrome 打开 `http://127.0.0.1:3000`。开发用 `npm run dev`，同一时间只启动一种模式。若端口被占用，先停止自己先前启动的服务；测试脚本默认使用 3000（生产/开发）和 3100（静态）。

手动衣橱和示例流程不需要密钥。`.env.example` 给出本地服务端变量；需要配置时复制到 `.env.local`，保留 `AI_ENABLE=0` 即可关闭真实识别。不要把密钥、私人照片或浏览器数据放入仓库。示例与照片测试步骤见 [测试素材](../../tests/fixtures/README.md)。

## 02 最短启动复验

1. 在自己的电脑使用上面的固定提交和锁文件启动。首次打开选择“体验示例衣橱”，在“我的衣橱”核对 8 件，刷新后再核对。
2. 依次从顶栏打开首页、我的衣橱、穿搭推荐、穿搭灵感、我的偏好。后两页应可访问并显示后续接入说明，直接刷新也应可见。
3. 到推荐页主动点击“使用示例天气”，生成穿搭、对一套点“喜欢”，刷新核对原评价。此为旧版基线流程。
4. 在独立测试环境切回真实模式，在鞋履分类打开“添加衣物”，检查默认分类。用合成样本添加后编辑并更换图片，确认保存，刷新核对。建议另录一件手动衣物验证本地计数与数据隔离。
5. 把电脑、Node/npm/Chrome 版本、SHA、实际结果和异常写入第 2 轮交接。不要依赖上一位的浏览器数据。

## 下一轮调用入口

- 从 `src/composition/index.ts` 现有装配出发。读写衣橱从 `WardrobeService` 进入；新数据和事务仍通过仓储及 `src/shared/infrastructure/unit-of-work.ts`，页面沿服务调用。
- 现有调用示例为 `const services = createServices(mode)`，然后 `await services.wardrobe.get(garmentId)`、`await services.wardrobe.count()`、`await services.wardrobe.image(imageId)`。单件和图片缺失可返回 `undefined`；编辑可能因旧修订冲突失败。已有 UI 和测试继续使用既有调用契约。
- 第 2 轮重点为衣物/灵感/偏好/推荐过程的数据服务、旧数据兼容及原子提交。推荐页的设置草稿、已应用条件和反馈分别保存；首页结果与推荐页轮次用独立状态。服饰图引用须保证旧搭配快照还能读取。
- 真实 AI 由第 3 轮扩展现有服务端入口。后续页面复用服务和适配器。第 1 轮新增页面入口为 `src/app/inspiration/page.tsx` 与 `src/app/preferences/page.tsx`。

## 验收状态

本机环境为 macOS 26.6.2、Node 22.23.2、npm 10.9.8、Google Chrome 156.0.8078.80。[运行证据](../testing/ROUND-01-VERIFICATION.txt)

| 项目 | 实际结果 |
| --- | --- |
| R01-01 来源核对 | PASS。验证 #21、#22、#23 的祖先关系及 #19、#24 的源码增量，见 [范围与决策](../project/ROUND-01-SCOPE.md)。 |
| R01-02 五页入口 | PASS。生产 Chrome 回归含五页导航和当前栏目标记；静态 Chrome 回归含子路径、直达刷新和资源错误检查。 |
| R01-03 原有业务 | PASS（本机受测流程）。类型、普通构建、49 单测、生产和开发 Chrome 各 34 项、#22 图片和反馈专项 12 项、静态构建和静态 Chrome 2 项通过。实时 Open-Meteo 2 项通过，覆盖六城市查询及真实天气参与本地测试衣物推荐和反馈；该流程使用手动录入样本。真实照片的完整识别与网络审计不在当前结果内。 |
| R01-04 资料和边界 | PASS。3 份 Word、对应 Markdown、16 张 PNG 与索引整理进候选，工作台与 README 链接共同依据。独立校验正文、表格、源文件与索引。 |
| R01-05 交接 | 本机干净安装 PASS。从空目录克隆，按原锁文件执行 `npm ci --legacy-peer-deps` 成功，锁文件未变。类型检查、49 项单测、生产构建和 34 项正式 Chrome 回归重跑通过。02 的跨电脑启动与签收、01 本人复核 NOT_RUN。 |

独立复核在独立端口和正式 Chrome 上执行自编流程。通过五项导航选中态、示例八件刷新、生成后反馈刷新与跨页恢复，以及 #23 的分类默认值、改类保存、弹窗居中和刷新。冒烟无浏览器外网请求，另实际复现旧版切换风格清除结果。该检查是第 1 轮独立抽查，07 的整体验收在第 10、12 轮。

## 已知问题

- **新铁律的运行验收未完成。** 生产回归复现了旧版切换风格或城市使当前搭配失效。旧生成开始会清空展示，保存的旧版反馈按搭配 ID 关联。当前无单次反馈和连续更换，也无首页今日穿搭调整入口。按 [范围与规则差异](../project/ROUND-01-SCOPE.md#三条铁律与旧基线的落差) 由 02/05/06 分轮补齐，01 本人和 07 后续按模板操作复核。
- **开发模式路由日志。** 开发套件断言 34/34 通过，运行中仍出现 Next.js 的 “Router action dispatched before initialization”。#22 已记录同类日志；此处保留为已知问题。
- **Windows 静态表现待复测。** #22 在 Windows 报告的 symlink EPERM 和静态资源 404 在 macOS 未复现，02 可先用普通本地启动交接。
