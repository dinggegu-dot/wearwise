import { writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const REPO = 'dinggegu-dot/wearwise';
export const DASHBOARD = 20;
export const MARKER = '<!-- wearwise-progress-dashboard:v1 -->';
const base = `https://github.com/${REPO}`;
const goals = ['手动录入与确认', '衣橱管理、数量与持久化', '真实存储、事务与故障', '照片处理与隐私', '六城市天气与异常', '接口替换与边界', '测试、构建与 Chrome', '提交、验收、合并与发布'];

// PR 内容只是成员声明，不能用于执行代码或自动判定验收通过。
export function metadata(pr) {
  const body = (pr.body || '').replace(/<!--[\s\S]*?-->/g, '');
  const field = name => body.match(new RegExp(`^\\s*-?\\s*${name}[：:]\\s*(.*)$`, 'm'))?.[1]?.trim() || '';
  const role = pr.title.match(/^\[M0([1-7])\]/)?.[1];
  const task = field('具体任务(?: Issue)?').match(/^#(1[1-7])\b/)?.[1];
  const phase = field('当前阶段').match(/^(A|B|C|文档维护)(?:\s|$)/)?.[1];
  const requirements = [...new Set(field('验收项').match(/\bA0[1-8]\b/g) || [])];
  const warnings = [];
  if (!role) warnings.push('标题缺 M01—M07');
  if (!task) warnings.push('缺具体任务 #11—#17');
  if (role && task && Number(task) !== Number(role) + 10) warnings.push('岗位与任务号不一致，需核对');
  if (!phase) warnings.push('缺当前阶段');
  if (!requirements.length) warnings.push('缺验收项 A01—A08');
  return { role, task, phase, requirements, warnings };
}

export function text(value) {
  return String(value ?? '').replace(/[&<>|\[\]`*@\\\r\n]/g, c => `&#${c.charCodeAt(0)};`);
}

export function checkStatus(checks, statuses) {
  const all = [...checks.map(c => c.status === 'completed' ? c.conclusion : 'pending'), ...statuses.map(s => s.state)];
  if (!all.length) return '未发现检查（可能待审批），不能算通过';
  if (all.some(s => ['failure', 'error', 'cancelled', 'timed_out', 'action_required', 'startup_failure', 'stale'].includes(s))) return '存在失败 / 取消 / 待处理';
  if (all.some(s => s === 'pending' || !s)) return '检查进行中';
  if (all.every(s => s === 'success')) return '已列出检查通过，仍需业务验收';
  return '含跳过 / 中立 / 未知结果，需查看';
}

export function render(data, now = new Date().toISOString()) {
  const prs = data.prs.filter(p => p.number >= 18); // #9 是上一轮已交付框架；保留全部本轮 PR，含不规范提交。
  let out = `${MARKER}\n# 团队提交总览\n\n更新：${now}。数据来自 GitHub API；提交描述是作者声明，检查和评审分别列示。\n\n`;
  out += `**唯一代码/文件提交通道：[本仓库 PR](${base}/pulls)。** [新建 PR](${base}/compare) · [目标及任务 #10](${base}/issues/10) · [使用说明](${base}/blob/main/team/工作流说明.md)\n\n同一项交付返修更新原 PR；不收 zip 或私聊附件作为正式提交。本页正文由自动化维护，讨论放评论。\n\n`;
  out += `## 每位成员\n\n| 成员 / 任务 | 本轮 PR 与状态 |\n|---|---|\n`;
  for (let role = 1; role <= 7; role++) {
    const items = prs.filter(p => metadata(p).role === String(role));
    out += `| [M0${role} / #${role + 10}](${base}/issues/${role + 10}) | ${items.length ? items.map(p => `[#${p.number}](${base}/pull/${p.number}) ${p.merged_at ? '已合并（待核验发布）' : p.state === 'closed' ? '关闭未合并' : p.draft ? '草稿' : '已提交待核验'}`).join('；') : '未找到本轮 PR；不代表未开展工作'} |\n`;
  }
  out += '\n## 目标与提交对应（不是完成率）\n\n| 验收项 | 声明涉及该项的 PR |\n|---|---|\n';
  goals.forEach((goal, i) => {
    const id = `A0${i + 1}`;
    const linked = prs.filter(p => metadata(p).requirements.includes(id));
    out += `| ${id} ${goal} | ${linked.map(p => `[#${p.number}](${base}/pull/${p.number})`).join('、') || '未找到明确映射；由提交者补填，不能推断未开发'} |\n`;
  });
  out += '\n## 提交、文件与证据\n';
  for (const pr of prs) {
    const m = metadata(pr);
    out += `\n### [#${pr.number} ${text(pr.title)}](${base}/pull/${pr.number})\n\n`;
    out += `- 提交人：${text(pr.user.login)}；岗位：${m.role ? `M0${m.role}（标题声明）` : '待补'}；任务：${m.task ? `#${m.task}` : '待补'}；阶段：${m.phase || '待补'}。\n`;
    out += `- 版本：[${pr.head.sha.slice(0, 12)}](${base}/pull/${pr.number}/commits/${pr.head.sha})；目标：${text(pr.base.ref)}；${pr.merged_at ? '已合并' : pr.state === 'closed' ? '关闭未合并' : pr.draft ? '草稿' : '未合并'}。\n`;
    out += `- [自动检查](${base}/pull/${pr.number}/checks)：${pr.checkError ? '读取失败，不能判定' : checkStatus(pr.checks, pr.statuses)}。\n`;
    out += `- 当前 head 对应的 Actions：${pr.runError ? '读取失败' : (pr.runs || []).map(r => `[${text(r.name)}](${base}/actions/runs/${r.id}) ${text(r.status)} / ${text(r.conclusion || '未结束')}`).join('；') || '未找到（可能尚未获 Fork 运行批准）'}。\n`;
    out += `- [作者完成说明、测试、依赖与联调](${base}/pull/${pr.number})：需结合正文证据核对，不自动认定完成。\n`;
    const reviews = pr.reviews.filter(r => r.state !== 'PENDING');
    out += `- 评审记录：${pr.reviewError ? '读取失败' : reviews.length ? reviews.map(r => `${text(r.user.login)} / ${text(r.state)} / ${r.commit_id === pr.head.sha ? '当前提交' : '旧提交，不作当前验收'} [原文](${base}/pull/${pr.number}#pullrequestreview-${r.id})`).join('；') : '暂无正式评审；07 如在评论验收，请从 PR 会话核对身份、提交与证据'}。\n`;
    if (m.warnings.length) out += `- 待补交接信息：${m.warnings.join('；')}。旧 PR 保留原成果，不代成员补报通过。\n`;
    out += `- [变更文件](${base}/pull/${pr.number}/files)：${pr.fileError ? '读取失败' : `${pr.files.length} 个（GitHub 报告 ${pr.changed_files ?? pr.files.length} 个）`}。\n`;
    // 大 PR 不把 Issue 正文撑爆；全部差异仍在同一个 PR，不复制文件到 main。
    for (const f of pr.files.slice(0, 20)) out += `  - ${text(f.status)}：${text(f.filename)}（+${f.additions}/-${f.deletions}）\n`;
    if (pr.files.length > 20) out += '  - 其余文件见上方完整差异链接。\n';
  }
  out += `\n## 主分支发布\n\n当前 main：${data.mainSha ? `\`${data.mainSha}\`` : '读取失败'}。\n`;
  const pages = data.pages.find(r => r.head_sha === data.mainSha);
  out += pages ? `[对应 Pages 运行](${base}/actions/runs/${pages.id})：${text(pages.status)} / ${text(pages.conclusion || '尚未结束')}。工作流成功仍需 07 实际打开网页复测。\n` : '未找到对应当前 main 的 Pages 运行；不能判断发布成功。\n';
  out += '\n**状态规则：**提交≠联调通过≠07 验收≠合并≠网页验证。成员可在 PR 中声明“可联调 / 待验收”，07 记录实际结果、固定提交、环境和证据；更新提交后旧验收不能自动沿用。用户保留合并决定，汇总程序不合并、不关闭任务、不修改代码。\n';
  if (data.warnings.length) out += `\n采集限制：${data.warnings.map(text).join('；')}。\n`;
  if (out.length > 60000) throw new Error('汇总超过 Issue 安全长度，保留旧总览，请缩小本轮范围');
  return out;
}

export function apiClient(token, request = fetch) {
  return async (path, options = {}) => {
    const response = await request(`https://api.github.com/repos/${REPO}/${path}`, {
      ...options, headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`GitHub ${response.status} (${path.split('?')[0]})`);
    return response.json();
  };
}

export async function paginate(api, path, key) {
  const all = [];
  for (let page = 1; page <= 30; page++) {
    const result = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    const rows = key ? result[key] : result;
    if (!Array.isArray(rows)) throw new Error('GitHub 列表格式异常');
    all.push(...rows);
    if (rows.length < 100) return all;
  }
  throw new Error('超过采集页数上限，不能伪装采集完整');
}

export async function collect(api) {
  const data = { prs: [], pages: [], mainSha: '', warnings: [] };
  const prs = await paginate(api, 'pulls?state=all&sort=created&direction=desc');
  for (const pr of prs.filter(p => p.number >= 18)) {
    const item = { ...pr, files: [], reviews: [], checks: [], statuses: [], runs: [] };
    try { item.files = await paginate(api, `pulls/${pr.number}/files`); } catch { item.fileError = true; }
    try { item.reviews = await paginate(api, `pulls/${pr.number}/reviews`); } catch { item.reviewError = true; }
    try {
      item.checks = await paginate(api, `commits/${pr.head.sha}/check-runs?filter=latest`, 'check_runs');
      const statuses = await paginate(api, `commits/${pr.head.sha}/statuses`);
      // statuses API 按新到旧；同名状态只保留最新，避免旧失败覆盖当前成功。
      item.statuses = [...new Map(statuses.slice().reverse().map(s => [s.context, s])).values()];
    } catch { item.checkError = true; }
    try {
      const runs = await paginate(api, `actions/runs?head_sha=${pr.head.sha}`, 'workflow_runs');
      item.runs = [...new Map(runs.slice().reverse().map(r => [`${r.workflow_id}:${r.event}`, r])).values()];
    } catch { item.runError = true; }
    const latest = await api(`pulls/${pr.number}`);
    if (latest.head.sha !== pr.head.sha) throw new Error(`#${pr.number} 在采集中更新，请重跑，避免混合版本`);
    item.changed_files = latest.changed_files;
    item.merged_at = latest.merged_at;
    item.state = latest.state;
    if (item.fileError || item.reviewError || item.checkError || item.runError) data.warnings.push(`#${pr.number} 部分证据读取失败`);
    data.prs.push(item);
  }
  try {
    data.mainSha = (await api('commits/main')).sha;
    data.pages = (await api('actions/workflows/pages.yml/runs?branch=main&per_page=30')).workflow_runs;
  } catch { data.warnings.push('主分支或发布记录读取失败'); }
  return data;
}

export async function publish(api, body) {
  const current = await api(`issues/${DASHBOARD}`);
  // 只允许写专用机器总览，绝不覆盖产品任务或成员讨论。
  if (!current.body?.startsWith(MARKER)) throw new Error('总览所有权标记缺失，停止写入');
  if (current.body !== body) await api(`issues/${DASHBOARD}`, { method: 'PATCH', body: JSON.stringify({ body }) });
}

async function main() {
  if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY !== REPO) throw new Error('Fork 不发布主仓库总览');
  const api = apiClient(process.env.GH_TOKEN);
  const data = await collect(api);
  const body = render(data);
  if (process.env.PROGRESS_OUTPUT) await writeFile(process.env.PROGRESS_OUTPUT, body);
  if (process.env.PROGRESS_JSON) await writeFile(process.env.PROGRESS_JSON, JSON.stringify(data, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, body);
  if (process.argv.includes('--publish')) {
    if (!process.env.GH_TOKEN) throw new Error('缺少工作流令牌，不能发布');
    await publish(api, body);
  }
  console.log(`已采集 ${data.prs.length} 个本轮 PR；${data.warnings.length} 项采集限制；${process.argv.includes('--publish') ? '已更新 #20' : '只读预览，未写 GitHub'}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
