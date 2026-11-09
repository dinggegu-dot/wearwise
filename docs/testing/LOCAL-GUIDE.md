# WearWise

WearWise 是本地优先的智能衣橱网页。当前实施候选支持照片或手动录入、衣橱分类和编辑、六城市天气、基于衣橱的规则搭配、反馈，以及与真实衣橱隔离的示例模式。数据保存在当前浏览器的 IndexedDB；清理站点数据或更换浏览器可能丢失，当前没有跨设备同步或备份。

## 本地启动

需要 Node.js 22.12 及以上，以及已安装的项目依赖。在本目录运行：

```bash
npm run dev
```

打开 `http://127.0.0.1:3000`，首次选择真实衣橱或示例衣橱。真实衣橱中通过“添加衣物”录入自己的衣物；到首页或推荐页获取天气；推荐页选择天气和风格后生成搭配并留下反馈。示例模式内置八件示例衣物，选择示例天气即可演示。

天气由 Open-Meteo 提供。免费托管接口用于非商业用途，服务限制与许可见 [Open-Meteo](https://open-meteo.com/en/pricing)。请求发送所选城市的公共坐标及正常网络请求信息，不发送衣橱照片。为避免陈旧或异常时钟数据误导推荐，实时观测超过 3 小时或比本机时间超前超过 15 分钟会被拒绝；本机时间需准确。

## 图片识别

图片识别默认关闭。未配置时可以手动填写衣物信息。真实识别需要单独确认照片发送、服务商账户、调用费用和样本后，在本地服务端配置 `.env.example` 中的变量；密钥只放服务端。识别结果必须由用户检查并确认后才保存。真实模型效果尚未验证；静态 Pages 版本不提供服务端识别。

## 检查与静态产物

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run build:pages
npm run test:e2e:pages
npm run test:e2e:live
```

浏览器测试使用正式 Google Chrome 和独立测试数据。`test:e2e:live` 会请求六城市天气接口；其余自动测试使用隔离示例或模拟天气响应。`build:pages` 在临时副本中导出静态产物，`test:e2e:pages` 检查 `/wearwise/` 子路径，构建或测试不代表已经上线。

设计、已知限制和实施进度分别见 [历史架构方案](../terra/ARCHITECTURE.md)、[现状与未验证](../project/CURRENT-STATE.md)、[后续计划](../../team/NEXT-ITERATION.md)；开源代码来源见 [第三方声明](../../THIRD_PARTY_NOTICES.md)。

## 基础测试版补充

普通试用运行 `npm run preview`，开发运行 `npm run dev`。开发模式回归 `npm run test:e2e:dev` 与生产回归分开串行运行。初始化未就绪时天气按钮禁用。验收与后续交接见 [BASE-TEST.md](BASE-TEST.md)。
