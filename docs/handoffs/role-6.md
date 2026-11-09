# M06 · 推荐图片、反馈与照片编辑交付

> PR #22 的历史交付与自测证据。该改动已纳入第 1 轮候选，接力请使用 [第 1 轮固定交接](ROUND-01.md)。

任务 [#16](https://github.com/dinggegu-dot/wearwise/issues/16)，优化编号 OPT-M06-01。记录日期 2026-11-06，北京时间。当前阶段：C 天气/推荐/反馈；本人实现与用户本机试用完成，可开始成员联调，尚未通过 07 独立验收。

## 授权、依赖和文件边界

- 用户已明确授权提交、推送并创建 PR，明确不合并、不部署。没有授权代发成员消息或任务评论；本次不执行这些动作。
- 基于 [#21](https://github.com/dinggegu-dot/wearwise/pull/21) / `45980c82fd1b15401bc29e6f9ae48809bb25a5bb`，分支 `codex/testable-base`。本次提交时核查 #21 未合并，main 为 `b97d95759986bcc901799f4700b61e45039cf86b`。产品历史基线为 `92ee865ccf76d545534b8358e5c89288d5305ddf`；不冒用其测试作为本轮证据。
- 个人分支 `task/06-outfit-image-states`。PR 先以 #21 分支为 base，避免向旧 main 重复交整份基础候选；#21 合入 main 后由 07/维护者核对再改 base。PR 头提交为固定交付 SHA，依赖 SHA 不是本次交付 SHA。
- [#19](https://github.com/dinggegu-dot/wearwise/pull/19) / `1b9891de89b87a4f7dbab1a2fc77cc7daf56d10a` 是 02 的旧实现，保留成果、不直接合入；其接口签名与 #21 有差异，由 02/01 比较。
- 修改推荐 UI、该模块回归、自己的交接与脱敏测试日志。用户试用后直接要求照片说明、取消误退出及编辑预览，按该明确请求修改衣橱页；03 尚未共同确认，合入前须核对。
- 公共样式、装配、根配置、依赖锁、数据库 schema、推荐引擎及 07 原有独立测试均未改动。原本地底座 `wearwise` 工作树保持干净，sources 只读材料未动。
- 11/14 23:59 前完成优化与对接交付；11/15—19 联调返修；11/20 23:59 最终验收，均为北京时间。

## 最终行为与复用

### 推荐图片

沿用现有推荐页、110px contain 图片、名称和理由，不重建页面。原组件把加载、缺图和读失败都显示为“暂无图片”，没有重试，换输入时还可能短暂保留旧 URL。

- 独立显示“图片加载中…”、“暂无图片”、“图片读取失败”；失败可用鼠标或键盘重试，不影响名称、理由及其他图片。
- Blob 解码成功后显示；解码错误明确失败，不借用别件或示例图。
- 以衣物/imageId 隔离状态，旧 loader/尝试立即隐藏，晚到读取不创建 URL；离开、换图、重试释放 Object URL。

### 喜欢/不喜欢

原数据实际保存且 aria-pressed 更新，但没有选中样式。新增局部 CSS 与 FeedbackControls：成功后按钮变绿、带勾，并显示“反馈已保存”；刷新恢复选择。保存中显示进度并暂禁重复点击。写入失败不显示假成功，可重试。晚到的反馈结果不能更新失效批次。

### 选择、替换与编辑照片

- 文件输入的 cancel 会冒泡；原 dialog onCancel 不检查 target，导致取消选择或重选同文件时整个编辑表单关闭。现在只处理目标为 dialog 自身的 cancel，表单自身 Escape 仍正常取消。
- 照片字段加“如果选错照片，可以点击文件名，重新上传正确照片；取消选择会保留当前照片”的可访问说明。
- 编辑时显示“当前已保存的照片”及真实本地 Blob 预览；选新图后改为新图预览。取消编辑不替换，确认保存后才替换；不选图修改其他字段仍保留原图。
- 浏览器不会回填文件输入，现有契约未保存原始文件名。本轮不伪造文件名、不改 schema。用户要求删除“不重新选图……”额外说明，最终已删该说明，保留预览。

本轮无历史浏览、换件、学习、下载、识别、虚拟试衣、数据迁移或新依赖。基线手动无照片录入保存的是类别插图，不把它称为真实照片。

## 接口与待确认清单

没有发布下面的沟通，没有假定成员已经同意。

| 接收人 | 具体接口/问题 | 归属及当前状态 |
|---|---|---|
| 02 @walkercell | `wardrobe.image(imageId): Promise<Blob | undefined>`：缺失与 reject 的语义；换图是否总新 imageId 并递增 wardrobeRevision；共享媒体不可误删；无照片插图是否显式标记 | 存储归 02，06 只调用公开服务。其[旧调用表](https://github.com/dinggegu-dot/wearwise/issues/12#issuecomment-6657123752)是 #19 的，不能当 #21 新契约确认 |
| 04 | 本地处理 Blob/MIME 与可解码性；提供许可明确、彼此可区分的上衣/下装/鞋、横竖图及异常样本 | 图片处理归 04；无真实照片样本共同确认，不调用识别 |
| 05 | generate/restore 返回的 garmentSnapshots 真实 ID/imageId；换图/删除/归档/排除后旧推荐失效；反馈保存恢复；dress+shoes、寒冷外套、0/1/2套边界 | 规则服务归 05，本轮接口不变。本人运行候选真实服务，不等于与成员真实联调 |
| 03 | 核对衣橱页 cancel 修复、字段说明与编辑预览；统一手机/键盘视觉 | 用户明确要求的跨页修复；03 共同评审尚未执行 |
| 07 | 固定 PR 头 SHA，用许可真实照片走保存→逐项核对ID/名称/图片→刷新/重开→换图/删除/归档/排除→重生成；检查不外传与手机/键盘 | 06 自测及用户本机试用不替代独立验收 |
| 01/07 | #21 合入顺序、#19 重叠处理；本 PR base 后续调整；静态构建/导航404及开发路由日志 | 不绕过失败检查、不合并或发布 |

## 启动和验证

需 Node >=22.12、正式 Google Chrome；依赖以原 package-lock 为准。

```sh
npm ci --legacy-peer-deps
npm run preview
```

Chrome 打开 `http://127.0.0.1:3000`。真实衣橱→添加并确认上衣/下装/鞋照片→推荐→主动使用示例天气→生成→核对照片/名称/理由→反馈→刷新→编辑/换图/取消→重生成。示例天气明确标记，不冒充实时天气。

```sh
npm run typecheck
npm test
npm run build
npx playwright test --config=src/modules/recommendation/ui/playwright.config.ts
npm run test:e2e
npm run test:e2e:dev
npm run test:e2e:live
npm run build:pages
npm run test:e2e:pages
```

命令按顺序执行，避免同端口与构建冲突。06 专项开发模式先设置 `M06_DEV=1`；可设 `M06_PORT=3001` 使用独立端口。项目没有 lint 脚本，不虚构 lint PASS。

## 实际测试与证据

Windows，Node v24.22.1，npm 11.6.2，Google Chrome 157.0.8103.38，Next 16.4.5。日志在 [m06-evidence](m06-evidence/manifest.json)，隐藏本机用户名/路径、移除颜色码并统一换行和行尾空白，不修改结果；没有照片、截图、trace 或浏览器数据库。manifest 同时保存原始和脱敏日志 SHA-256。

测试跨多次用户返修：先完成图片状态，再修反馈与文件 cancel，再补已保存预览，最后删一句说明。下面明确区分运行范围；不把历史结果冒充最终提交重跑。

| 验证 | 实际结果与范围 | 日志 |
|---|---|---|
| 基线三问题复现 | 3条按预期 FAIL：选中仍白、缺确认文案、文件 cancel 关闭表单 | [baseline](m06-evidence/user-reports-baseline.txt) |
| 类型/单测/构建 | 反馈与 cancel 修复后类型 PASS、49/49单测 PASS、普通构建 PASS | [typecheck](m06-evidence/user-reports-typecheck.txt)、[unit](m06-evidence/user-reports-unit.txt)、[build](m06-evidence/user-reports-build.txt) |
| 反馈与 cancel 回归 | 生产/开发专项各11/11，既有生产流程34/34 PASS | [UI生产](m06-evidence/user-reports-ui-production.txt)、[UI开发](m06-evidence/user-reports-ui-development.txt)、[流程](m06-evidence/user-reports-e2e-production.txt) |
| 编辑预览返修 | 类型/构建 PASS，完整生产专项12/12、衣橱15/15、新预览开发1/1 PASS；未重复无关模块单测 | [类型](m06-evidence/saved-photo-typecheck.txt)、[构建](m06-evidence/saved-photo-build.txt)、[专项](m06-evidence/saved-photo-ui-production.txt)、[衣橱](m06-evidence/saved-photo-wardrobe-production.txt)、[开发](m06-evidence/saved-photo-ui-development.txt) |
| 最终删除说明 | 纯文案删除，生产构建含TS PASS；移除对应文案存在断言，保留原图/换图断言，未重复全套浏览器测试 | [最终构建](m06-evidence/remove-photo-note-build.txt) |
| 真实天气 | 首轮正式 Chrome 六城市实际 HTTP200，实际天气→本地衣橱→推荐反馈共2/2 PASS；该流程使用类别插图，不称真实照片 | [live](m06-evidence/weather-live.txt) |
| 首轮开发模式 | 既有34/34 PASS，但有两次 Next `Router action dispatched before initialization` 日志；不称无异常 | [development](m06-evidence/e2e-development.txt) |
| 官方静态构建 | BLOCKED：Windows目录symlink EPERM；未改公共脚本 | [原始失败](m06-evidence/build-pages.txt) |
| Windows静态等效验证 | 外层临时runner仅把dir symlink改junction、显式调用npm CLI并检查清理路径，构建PASS；该工具不提交、不替代官方入口 | [等效构建](m06-evidence/build-pages-windows.txt) |
| 静态 Chrome | FAIL，1/2：推荐/反馈恢复通过，导航资源404失败。未删改/跳过断言，后续未重跑静态 | [Pages](m06-evidence/e2e-pages.txt) |

专项使用生成色块，经真实表单压缩与真实 Chrome IndexedDB 保存，按名称/imageId逐字节比对 Blob，覆盖手机、键盘、反馈恢复、读/解码失败、晚响应与URL释放。故障注入、模拟天气与真实外部请求分别记录，不用色块或示例截图代替真实照片验收。

用户本机逐步复试确认反馈和取消/重选已正常，最后确认无问题并授权本次提交。这不是07验收，没有完整真实照片矩阵或照片网络审计结论。

安装环境曾遇SWC下载卡住；停止后从已有缓存复制同版本16.4.5二进制，SHA-256一致，离线rebuild成功。Windows沙箱临时目录rename EPERM后在正常权限环境重跑单测通过。未改依赖锁或放宽断言。

## 遗留与接收人

1. **Pages导航仍失败**：请求如 `/wearwise/wardrobe/__next.wardrobe.__PAGE__.txt` 返回404，产物在 `out/wardrobe/__next.wardrobe/__PAGE__.txt`；推荐页同类现象。现有静态服务精确查找路径。请01/07核查Windows导出/静态映射与实际Pages，不断言该问题由本轮引入或已经证明属于基线。
2. **成员联调/独立验收 NOT_RUN**：03/05等确认、04许可样本、07固定SHA独立验收及完整网络检查仍待进行。下一位接收人为03/05及07，01协助依赖/静态阻塞。
3. **未合并/未部署**：#21依赖仍在；无最终main/线上验收结论。真实AI、跨账号完整协作、发布后复测未执行。
4. **CI范围**：当前工作流只对base为main的PR触发产品检查；以#21分支为base的依赖PR可能没有自动CI，这不能写成CI通过。#21合入后改base，按main规则运行检查；不要绕过失败检查。
