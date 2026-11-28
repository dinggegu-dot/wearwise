# 第9轮交接 首页集成与五栏目导航

本轮负责人为第06号成员，下一轮接收者为第07号成员。日期2026-11-27（北京时间）。本轮通过独立分支和拉取请求交付，尚未合并主分支或部署。已完成真实人工智能首页联调，仍待第07号成员开展独立整体验收。

## 版本与需求依据

- 仓库：https://github.com/dinggegu-dot/wearwise
- 基线拉取请求：#39，分支`codex/round-08-recommendation-page`，完整基线提交编号：`b32b1be5e7f57c339a2bae7c56a0d1fea25beafa`。
- 本轮分支：`codex/round-09-home`。完整提交编号记录在项目根目录的`VERSION.txt`。该文件在打包时生成，源码压缩包和可运行项目目录均包含它；外层交付目录另保留一份相同副本。使用包含Git历史的项目目录时，也可运行`git rev-parse HEAD`核对。打包生成的版本说明不参与源代码提交，避免提交编号自我引用。Git工作区应没有未提交改动。
- 仅以GitHub项目文件为需求依据，没有采用电脑上原有的需求文档。
- [第9轮排班](https://github.com/dinggegu-dot/wearwise/blob/b32b1be5e7f57c339a2bae7c56a0d1fea25beafa/docs/project/ROUND-SCHEDULE.md)、[#16任务卡](https://github.com/dinggegu-dot/wearwise/issues/16)、[推荐依据与记忆规则](https://github.com/dinggegu-dot/wearwise/blob/b32b1be5e7f57c339a2bae7c56a0d1fea25beafa/docs/project/RECOMMENDATION-MEMORY-RULES.md)、[用户界面索引](https://github.com/dinggegu-dot/wearwise/blob/b32b1be5e7f57c339a2bae7c56a0d1fea25beafa/docs/project/UI-REFERENCE.md)。重点参考首页正常、空衣橱与天气失败两张图，沿用示例页面风格，不要求像素复刻。
- [第8轮交接](https://github.com/dinggegu-dot/wearwise/blob/b32b1be5e7f57c339a2bae7c56a0d1fea25beafa/docs/handoffs/ROUND-08.md)。其中“尚未推送/创建拉取请求”已经过时，“交给第6轮”应理解为交给第06号成员负责的第9轮。
- GitHub的`main`在`2d9cdefbca01ee52e1afb275c0f316faf4612cdd`含[功能概述第4版原件](https://github.com/dinggegu-dot/wearwise/blob/2d9cdefbca01ee52e1afb275c0f316faf4612cdd/docs/project/source/WearWise%20%E7%BD%91%E9%A1%B5%E5%8A%9F%E8%83%BD%E6%A6%82%E8%BF%B04.docx)。#39的Markdown概述仍标第3版；本轮已核对第4版首页要求，不把旧文件的版本标签当成最新需求。未在本轮改写整套公共需求文档。

## 实际完成

1. 保留现有五栏目路由、导航和选中状态，接入完整首页。首页提供衣橱和推荐页入口；空衣橱提供添加入口。
2. 首页天气和推荐页天气改用路由上层的共享显示状态。共享城市持久化；按城市与北京时间日期复用同一天数据，跨页保留显示，跨标签页同步城市。切换城市与跨天刷新天气但不改已有搭配。失败提供重试和切换城市，不以示例天气替代真实天气。
3. 衣橱概况使用`counts()`、`thumbnails(3)`和`image()`，显示总数、真实图片引用及空状态。暂停计数保留，删除扣数；返回首页、窗口聚焦、衣橱通知时重新读取。
4. 今日穿搭复用`OutfitFlatLay`、`OutfitGarmentList`和`OutfitImage`。清单位于图旁，显示名称、替换指定单件衣物入口、搭配理由和实际依据。调整桌面尺寸、按钮和图片布局，保留加载与图片失败重试。
5. 补齐首页`swapHomeOutfit()`、`swapHomeItem()`。首次无结果时提供生成入口；已有结果时提供更换整套搭配和替换指定单件衣物。
6. 三种首页操作固定读取当前有效长期偏好、当前城市当天天气、可用衣物和搭配知识；只写首页独立状态，不读取或改动推荐页草稿、本轮条件、调整和单次反馈。更换整套搭配拒绝相同组合；替换指定单件衣物只允许同类别替代，其他位置保持不变。
7. 修复前序单件替换与需求不符的问题：首页和推荐页均允许保留其他位置已删除或暂停的衣物；保留位置继续使用原名称和图片快照，只把新增替代作为可用候选校验。服务端将冻结快照与候选衣橱分开处理，不将已删除/暂停衣物恢复为新候选。
8. 首页生成中、失败、衣物不足、无替代和衣物状态变化都有对应显示。失败保留结果；图片不可读取时不提交首页新结果。操作锁、取消信号及提交时当前结果校验防止重复和过期写入。

本轮补齐首页接口和修复相关替换校验，已由用户明确授权。没有新增数据库版本，没有清空已有数据。

## 启动与配置

需要版本为22.12或更高版本的Node.js运行环境、npm软件包管理工具和正式版Google Chrome浏览器。本轮使用Windows操作系统和版本为24.22.3的Node.js运行环境。

```powershell
npm ci --legacy-peer-deps
npm run dev
```

访问`http://127.0.0.1:3000`。真实人工智能需要按`.env.example`在本机创建`.env.local`并填写`OPENROUTER_API_KEY`。模型和超时沿用仓库模板；不要提交密钥。GitHub Pages静态版不能提供服务端模型推荐。

开发环境未提供全局npm，本轮使用临时下载的官方npm执行同样脚本；未改变项目依赖或锁文件。交付目录额外保留启动工具，项目源码仍可在标准Node.js运行环境/npm环境独立安装。

## 下一轮调用入口

```ts
const services = createServices('real');
await services.recommendationCore.generateHome();
await services.recommendationCore.swapHomeOutfit();
await services.recommendationCore.swapHomeItem(garmentId);
const { home, current } = await services.session.readHome();
const status = current ? await services.session.resultStatus(current) : undefined;
```

传入`{ signal }`可取消。成功返回`status: 'committed'`和首页状态；其他状态为`insufficient-wardrobe`、`no-current-outfit`、`no-alternative`。天气、人工智能、校验、图片和存储失败抛出错误，页面保留原结果并重试。

共享天气入口：`SharedWeatherProvider`及`useSharedWeather()`。提供城市、天气、加载/保存状态、错误、`changeCity()`、`refresh()`和`waitForCity()`。它只管理显示天气；推荐页本轮天气依据仍由推荐过程状态服务快照保存。

## 验证记录

| 检查 | 实际结果 | 范围 |
| --- | --- | --- |
| `npm run typecheck` | 通过 | TypeScript无错误 |
| `npm test` | 通过，250项测试通过、1项测试保持原有跳过状态 | 33个测试文件通过、1个测试文件保持原有跳过状态；本轮新增14项服务和应用程序接口测试 |
| `npm run build` | 通过 | Next.js Node.js运行环境生产构建、五页面和应用程序接口路由 |
| `node node_modules/playwright/cli.js test --config playwright.round9.config.ts` | 通过，9项检查全部通过 | 桌面正式Google Chrome浏览器；本轮新增6项检查、偏好页回归3项检查 |
| `git diff --check` | 通过 | 无空白错误；Windows换行警告不算失败 |
| 首页真实Open-Meteo浏览器检查 | 通过 | 深圳真实天气，见`round09-evidence/round09-real-weather.json`和截图 |
| 本轮真实人工智能生成/更换整套搭配/替换指定单件衣物 | 通过，1项Google Chrome浏览器真实服务联调用例，包含3次真实模型调用 | 真实OpenRouter和Open-Meteo；衣橱为隔离合成数据，见下文 |
| 真实衣物照片最终视觉复核 | 未执行 | 本轮Google Chrome浏览器自动化使用自制合成可缩放矢量图，不能证明真实照片质量 |
| 第10轮独立整体验收 | 未执行 | 交由第07号成员，不把作者自测当独立验收 |

Google Chrome浏览器覆盖：五栏导航及选中态、空衣橱、跨页城市、天气失败重试、首页生成、推荐页真实反馈保存流程、未应用草稿保留、两页双向隔离、刷新恢复、删除/暂停提示、数量联动、指定替换、无替代、生成失败保留、北京时间跨天、跨标签城市同步、迟到天气响应、重复点击和离页取消。

常规9项Google Chrome浏览器回归使用模拟的人工智能响应和天气响应，其中包含模拟天气异常。另行执行的真实人工智能联调直接调用OpenRouter模型服务和Open-Meteo天气服务，没有模拟这两种响应。两组验证分别记录，不能相互替代。截图中的衣物为本轮自制合成可缩放矢量图，不是实拍照片。`tests/recommendation/home-live.test.ts`原有跳过未被标成通过。

## 素材与初始化

`e2e/round9-home.spec.ts`的`seed()`在独立Google Chrome浏览器测试上下文初始化六件合成衣物、六张可缩放矢量图片和一条长期偏好。素材由测试代码绘制，可重复生成，不含私人照片；运行本轮Playwright命令会自动初始化，不需要复制个人IndexedDB。

`tests/round9/home-service.test.ts`使用隔离fake-indexeddb测试库及模拟人工智能/天气，检查服务输入和持久化。`tests/round9/replacement-route.test.ts`检查服务端冻结位置与候选隔离。

浏览器衣橱不会随Git转移。人工真实照片验收需在同一站点地址和浏览器保存测试衣物；不要清空原衣橱。

## 已知问题与未执行项

- **实拍照片视觉复核尚未执行**：真实人工智能联调使用自制合成可缩放矢量图衣物，已验证接口、衣物唯一标识对应、显示与状态流程，但不能证明真实照片的白底质量、细节或视觉效果。此项交给第07号成员用有许可的实拍衣物复核。
- 第8轮已说明模型请求可能较慢。沿用默认90秒配置，本轮没有凭模拟测试宣称解决上游性能问题。
- 未执行全部历史Playwright用例；历史用例还含旧的手动天气/规则推荐行为断言，需要第07号成员结合最新需求核对。本轮没有删除或跳过旧失败用例来制造全通过。
- 未安装或验证BiRefNet模型文件；白底处理属于前序成果，本轮没有重新验收真实抠图质量。
- 离页取消在浏览器和核心服务层均有验证，但已经开始的数据库事务不能由AbortSignal撤销。首页结果提交另有当前结果一致性检查。
- 未做手机端专项设计或部署。本轮桌面布局和必要的窄窗回退不等于移动端验收。

## 第07号成员的最短签收步骤

1. 从`VERSION.txt`核对完整提交编号，安装依赖，启动Node.js运行环境服务。
2. 运行类型、单元、构建和本轮Playwright命令，核对结果。
3. 检查首页空状态、真实天气和五栏导航。
4. 配置真实人工智能并建立可组成多套搭配的真实测试衣橱，完成生成、整套和单件替换。
5. 推荐页生成并提交单次反馈，修改草稿但不生成；去首页切换城市和更换搭配，再返回核对结果、已应用天气、反馈、草稿均保留。反向也核对。
6. 删除或暂停衣物B后，只替换衣物A，衣物B继续显示原快照和状态提示；新生成的整套搭配排除衣物B。记录实际环境、结果和未通过项。

## 真实人工智能补充验证

用户在本机填写密钥后，于2026-11-27完成独立Google Chrome浏览器上下文中的真实联调。测试访问交付目录启动的Node.js运行环境生产服务，不拦截人工智能或天气请求；密钥仅由服务端读取，未写入测试、报告或截图。被测业务代码为66ee8ad64397d08f88b057a4bd558153e6692e5b，本次后续提交只补充测试、证据和交接状态。

| 操作 | 实际结果 | 本地应用程序接口耗时 | 返回衣物唯一标识 |
| --- | --- | --- | --- |
| 首页生成 | 通过，网页接口响应状态码为200并成功保存 | 50.127秒 | T1、B2、S2 |
| 首页更换整套搭配 | 通过，不同组合且成功保存 | 38.099秒 | T2、B2、S2 |
| 首页替换指定单件衣物 | 通过，只替换上衣，裤子和鞋保持 | 26.729秒 | T1、B2、S2 |

检查了真实请求仅含长期偏好和当天天气，没有混入推荐页喜好、场景、有效反馈或草稿；三次操作后推荐页轮次、设置草稿和反馈草稿完全不变，首页刷新后仍恢复最后结果。推荐页隔离基线由测试预置，此项不等于重新验证推荐页的整套真实人工智能流程。

测试衣橱为6件自制可缩放矢量图衣物，采用明确的名称、类别和颜色；它们属于测试数据，不是实拍照片。实际生成依据均为“深圳 · 11月27日天气 · 长期偏好”。页面截图已逐张查看，无明显裁切或错图。

证据：round09-evidence/real-ai-home.json、real-ai-home-generated.png、real-ai-home-after-swaps.png。

可复现命令（先在本机配置.env.local并启动Node.js运行环境服务，真实调用可能产生费用）：

```powershell
$env:RUN_ROUND9_LIVE = '1'
node node_modules/playwright/cli.js test --config playwright.round9-live.config.ts
```

该用例默认不进入普通回归；不开启显式环境开关时不执行真实联调。服务地址可通过LIVE_BASE_URL指定。

## GitHub交付方式

发布核对日期为2026-11-28（北京时间）。第39号拉取请求仍未合并，因此本轮采用层叠拉取请求：交付分支为`codex/round-09-home`，目标分支为`codex/round-08-recommendation-page`。本轮没有合并或改写前序分支，也没有合并主分支或部署。

仓库现有拉取请求自动化检查只针对`main`和`codex/round-02-data`目标分支，本轮目标分支不在触发范围内。因此没有自动运行不能记为检查通过；当前验收证据为上文明确列出的本地类型检查、单元测试、生产构建、浏览器检查与真实服务联调。第07号成员仍需进行第10轮独立整体验收。

GitHub中直接克隆的仓库可以运行`git rev-parse HEAD`读取完整提交编号；`VERSION.txt`是本机交付和源码压缩包附带的打包元数据，不参与源代码提交。
