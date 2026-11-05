import test from 'node:test';
import assert from 'node:assert/strict';
import { metadata, checkStatus, render, paginate, publish, collect, MARKER } from './progress.mjs';

const pr = (extra = {}) => ({ number: 19, title: '[M02] 数据服务', body: '- 具体任务：#12\n- 当前阶段：A 手动衣橱\n- 验收项：A02、A03、A07', user: { login: 'walkercell' }, head: { sha: 'a'.repeat(40) }, base: { ref: 'main' }, state: 'open', files: [], reviews: [], checks: [], statuses: [], ...extra });
test('精确读取本人任务，不误把依赖号或注释示例当作交付', () => {
  assert.deepEqual(metadata(pr()).requirements, ['A02', 'A03', 'A07']);
  const m = metadata(pr({ body: '<!-- 具体任务：#12 -->\n依赖 #12\n- 当前阶段：A\n- 验收项：A02' }));
  assert.equal(m.task, undefined);
  assert.ok(m.warnings.includes('缺具体任务 #11—#17'));
});
test('支持旧模板，但不补造阶段、验收项或成功', () => {
  const m = metadata(pr({ body: '- 具体任务 Issue：#12\n我全部做完了' }));
  assert.equal(m.task, '12');
  assert.equal(m.phase, undefined);
  assert.equal(m.requirements.length, 0);
});
test('岗位任务不匹配明确提示', () => {
  assert.ok(metadata(pr({ title: '[M03] 数据服务' })).warnings.some(w => w.includes('不一致')));
});
test('空检查、跳过、失败、等待均不能算通过', () => {
  assert.match(checkStatus([], []), /未发现/);
  assert.match(checkStatus([{status: 'completed', conclusion: 'skipped'}], []), /跳过/);
  assert.match(checkStatus([], [{state: 'failure'}]), /失败/);
  assert.match(checkStatus([{status: 'in_progress'}], []), /进行中/);
  assert.match(checkStatus([{status: 'completed', conclusion: 'success'}], []), /仍需业务验收/);
});
test('未知编号 PR 不丢失，旧提交评审不作当前验收，恶意 Markdown 不执行/触发提及', () => {
  const body = render({ prs: [pr({ title: '[M02] <img src=x> @everyone |', reviews: [{id: 1, user: {login: 'tester'}, state: 'APPROVED', commit_id: 'old'}] }), pr({number: 21, title: '没有编号'})], pages: [], mainSha: 'b', warnings: [] }, 'fixed');
  assert.match(body, /旧提交，不作当前验收/);
  assert.match(body, /#21/);
  assert.ok(!body.includes('<img'));
  assert.ok(!body.includes('@everyone'));
  assert.match(body, /不是完成率/);
});
test('删除文件也保留在差异清单，Pages 必须匹配当前 main', () => {
  const body = render({prs: [pr({files: [{status:'removed',filename:'src/deleted.ts',additions:0,deletions:4}]})], pages:[{head_sha:'old',conclusion:'success',id:1}],mainSha:'new',warnings:[]});
  assert.match(body, /removed：src\/deleted.ts/);
  assert.match(body, /未找到对应当前 main/);
});
test('分页收集超过100条，API失败向上抛出而非报告零提交', async () => {
  const result = await paginate(async path => path.endsWith('page=1') ? Array(100).fill(1) : [2], 'pulls?state=all');
  assert.equal(result.length, 101);
  await assert.rejects(paginate(async () => {throw new Error('403');}, 'pulls'), /403/);
});
test('只有带专用标记的 #20 可被覆盖；不写评论、合并或任务', async () => {
  const calls = [];
  await publish(async (path, opts) => { calls.push({path, opts}); return {body: MARKER}; }, `${MARKER}\nresult`);
  assert.equal(calls[1].path, 'issues/20');
  assert.equal(calls[1].opts.method, 'PATCH');
  await assert.rejects(publish(async () => ({body:'用户任务'}), 'new'), /标记缺失/);
});
test('采集失败部分明确标记，最新同名状态覆盖旧失败', async () => {
  const api = async path => {
    if (path.startsWith('pulls?')) return [pr()];
    if (path === 'pulls/19') return pr({changed_files: 1});
    if (path.includes('/files')) throw new Error('403');
    if (path.includes('/reviews')) return [];
    if (path.includes('/check-runs')) return {check_runs: []};
    if (path.includes('/statuses')) return [{context:'ci',state:'success'}, {context:'ci',state:'failure'}];
    if (path.startsWith('actions/runs?')) return {workflow_runs: []};
    if (path === 'commits/main') return {sha:'mainsha'};
    return {workflow_runs: []};
  };
  const data = await collect(api);
  assert.equal(data.prs[0].fileError, true);
  assert.equal(data.prs[0].statuses[0].state, 'success');
  assert.equal(data.warnings.length, 1);
});
test('并发更新提交会拒绝生成混合版本汇总', async () => {
  const api = async path => {
    if (path.startsWith('pulls?')) return [pr()];
    if (path === 'pulls/19') return pr({head:{sha:'changed'}});
    if (path.includes('/check-runs')) return {check_runs: []};
    if (path.startsWith('actions/')) return {workflow_runs: []};
    return [];
  };
  await assert.rejects(collect(api), /采集中更新/);
});
