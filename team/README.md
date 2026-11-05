# WearWise 团队工作台

收藏本目录，七位成员分别更新进度、提交代码，1号集中查看成果。当前基线是V0.2网页框架，具体开发按已确认的任务与PRD执行。

## 七位成员入口

| 成员 | 个人使用页 | 更新进度与历史 | 查看PR及修改 |
| --- | --- | --- | --- |
| 1号 主控与集成 | [进入](member-01.md) | [工作卡 #1](https://github.com/dinggegu-dot/wearwise/issues/1) | [查看](https://github.com/dinggegu-dot/wearwise/pulls?q=is%3Apr+M01+in%3Atitle) |
| 2号 数据与衣橱内核 | [进入](member-02.md) | [工作卡 #2](https://github.com/dinggegu-dot/wearwise/issues/2) | [查看](https://github.com/dinggegu-dot/wearwise/pulls?q=is%3Apr+M02+in%3Atitle) |
| 3号 衣橱与录入体验 | [进入](member-03.md) | [工作卡 #3](https://github.com/dinggegu-dot/wearwise/issues/3) | [查看](https://github.com/dinggegu-dot/wearwise/pulls?q=is%3Apr+M03+in%3Atitle) |
| 4号 视觉识别与灵感 | [进入](member-04.md) | [工作卡 #4](https://github.com/dinggegu-dot/wearwise/issues/4) | [查看](https://github.com/dinggegu-dot/wearwise/pulls?q=is%3Apr+M04+in%3Atitle) |
| 5号 天气与推荐内核 | [进入](member-05.md) | [工作卡 #5](https://github.com/dinggegu-dot/wearwise/issues/5) | [查看](https://github.com/dinggegu-dot/wearwise/pulls?q=is%3Apr+M05+in%3Atitle) |
| 6号 推荐体验与反馈 | [进入](member-06.md) | [工作卡 #6](https://github.com/dinggegu-dot/wearwise/issues/6) | [查看](https://github.com/dinggegu-dot/wearwise/pulls?q=is%3Apr+M06+in%3Atitle) |
| 7号 独立验收 | [进入](member-07.md) | [工作卡 #7](https://github.com/dinggegu-dot/wearwise/issues/7) | [查看](https://github.com/dinggegu-dot/wearwise/pulls?q=is%3Apr+M07+in%3Atitle) |

## 每个人只做三件事

1. 点个人入口，在固定工作卡中追加进度评论。
2. 代码放任务分支，以PR提交，标题用成员编号，例如 `[M02] 保存衣物`。
3. 1号协调评审与集成，7号对固定版本独立验收；上传、合并、验收通过分别报告。

## 1号查看入口

- [所有成员工作卡](https://github.com/dinggegu-dot/wearwise/issues)：查看最新评论、日期和阻塞。
- [待评审PR](https://github.com/dinggegu-dot/wearwise/pulls?q=is%3Apr+is%3Aopen+-is%3Adraft)：查看说明、实际测试和Files changed。
- [已合并成果](https://github.com/dinggegu-dot/wearwise/pulls?q=is%3Apr+is%3Amerged)：核对进入共同版本的代码。
- [1号集成工作卡](https://github.com/dinggegu-dot/wearwise/issues/1)：汇总本轮任务、PR、依赖、阻塞和交给7号的代码版本。
- [7号验收工作卡](https://github.com/dinggegu-dot/wearwise/issues/7)：查看PASS / FAIL / NOT_RUN / BLOCKED及证据。

## 一分钟更新格式

每完成一小项、遇到阻塞或提交PR，在个人工作卡追加评论：

```text
日期：
任务编号与PRD版本：
状态：待开始 / 进行中 / 阻塞 / 待评审 / 已集成 / 验收通过
已完成：
PR链接和分支：
实际测试结果与未验证项：
需要谁帮助：
下一步：
```

状态由成员主动更新，不是自动监控。角色卡长期保留，具体任务另建Issue关联。成员GitHub账号尚未与岗位绑定，公开可读不代表有代码写权限。

## 上传与更新代码

有仓库写权限时，从最新main建自己的任务分支；没有写权限时，先Fork到个人账号，再从Fork向本仓库提交PR。不要直接覆盖main，不把整个项目zip当代码交付。一个任务一份PR，后续修改继续提交同一分支，原PR会显示新变化。

沿用仓库技术栈与锁文件。公共接口先由提供方与使用方对齐，1号协调公共配置，2号统一数据库schema，各成员负责自己的业务和测试，7号独立验收。不要等所有人做完才联调，也不要各自重新建项目。

## 集成为产品

先衣橱与存储，再接录入确认；天气和推荐同步对齐接口，接入衣橱后完成换件和反馈；灵感流程独立建设。每批验证一条完整可用的流程，最后冻结版本交7号独立验收，并由1号试用决定是否接受。

## 合并与公开展示

main更新会触发GitHub Pages发布，提交PR不会自动合并。Pages当前是静态展示，未来Qwen等服务端能力需要另行确定托管和授权。公开位置不要贴真实密钥、私人照片或用户数据。

[仓库运行说明](../README.md) · [在线展示](https://dinggegu-dot.github.io/wearwise/)
