import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execute } from './action.mjs';

const request_id = '12345678-1234-4234-8234-123456789abc';
const employee_id = '12345678-1234-4234-8234-123456789abd';
const approval = 'https://app.cormak.app/mcp?approval_id=12345678-1234-4234-8234-123456789abe';
const evidence = 'Version 1 adds a configurable port. Default: 3000.';
const silence = () => {};
const token = 'cmcp_a_' + 'x'.repeat(43);
async function env(context = evidence) {
  const root = await mkdtemp(join(tmpdir(), 'cormak-docs-'));
  await mkdir(join(root, 'docs-input'));
  await writeFile(join(root, 'docs-input/notes.md'), context);
  return {
    GITHUB_WORKSPACE: root, GITHUB_OUTPUT: join(root, 'step-output'),
    INPUT_CONTEXT_FILE: 'docs-input/notes.md', INPUT_COPYWRITER_ID: employee_id, INPUT_KIND: 'release',
    CORMAK_API_KEY: token, INPUT_REQUEST_ID: request_id, INPUT_ALLOW_PAID: 'true', INPUT_MAX_CREDITS: '1',
  };
}
function mock(replies, requests) {
  return async (url, opts) => {
    assert.equal(url, 'https://mcp.cormak.app/mcp');
    const body = JSON.parse(opts.body);
    if (body.method === 'initialize') {
      const protocolVersion = '2025-06-18';
      return new Response('event: message\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { protocolVersion } }) + '\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }
    assert.equal(opts.headers['MCP-Protocol-Version'], '2025-06-18');
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    assert.equal(body.method, 'tools/call');
    requests.push(body.params);
    const response = replies.shift();
    assert.equal(body.params.name, response.name);
    return Response.json({ jsonrpc: '2.0', id: body.id, result: { structuredContent: response.value, isError: !!response.error } });
  };
}
const lookup = { name: 'get_employee', value: { items: [{ role: 'copywriter', id: employee_id, archived: false }] } };
test('Approval writes only receipt outputs; identical rerun polls and saves the draft', async () => {
  const inputs = await env();
  const requests = [];
  const first = await execute({ env: inputs, log: silence, fetcher: mock([
    lookup, { name: 'run_employee_task', value: { request_id, status: 'awaiting_confirmation', approval_url: approval } },
  ], requests) });
  assert.deepEqual(first, { request_id, status: 'awaiting_confirmation', approval_url: approval });
  await assert.rejects(readFile(join(inputs.GITHUB_WORKSPACE, 'generated/documentation.md')), { code: 'ENOENT' });
  assert.match(await readFile(inputs.GITHUB_OUTPUT, 'utf8'), /status=awaiting_confirmation/);
  const result = await execute({ env: inputs, log: silence, pause: silence, fetcher: mock([
    lookup, { name: 'run_employee_task', value: { request_id, status: 'running' } },
    { name: 'get_operation', value: { request_id, tool: 'run_employee_task', status: 'running' } },
    { name: 'get_operation', value: { request_id, tool: 'run_employee_task', status: 'complete',
      result: { task: { status: 'review', credit_cost: 1, result: '# Release notes\n\nPort: 3000. <script>test</script>' } } } },
  ], requests) });
  assert.deepEqual(requests[1], requests[3]);
  assert.deepEqual(requests[4].arguments, { request_id });
  assert.ok(requests[1].arguments.brief.endsWith(evidence));
  assert.equal(result.credits_charged, 1);
  assert.match(await readFile(join(inputs.GITHUB_WORKSPACE, result.output_path), 'utf8'), /&lt;script&gt;/);
});
test('Reject context with suspected credentials or symlinks before network', async () => {
  const fetcher = () => assert.fail('no fetch expected');
  await assert.rejects(execute({ env: await env('password=' + 'x'.repeat(24)), log: silence, fetcher }), /possible_secret_detected/);
  const inputs = await env();
  await symlink(join(inputs.GITHUB_WORKSPACE, 'docs-input/notes.md'), join(inputs.GITHUB_WORKSPACE, 'docs-input/link.md'));
  inputs.INPUT_CONTEXT_FILE = 'docs-input/link.md';
  await assert.rejects(execute({ env: inputs, log: silence, fetcher }), /invalid_context_file/);
});
test('Reject the wrong employee type and never echo unexpected upstream errors', async () => {
  const inputs = await env();
  await assert.rejects(execute({ env: inputs, log: silence, fetcher: mock([
    { name: 'get_employee', value: { items: [{ role: 'support', id: employee_id, archived: false }] } },
  ], []) }), /active_copywriter_required/);
  await assert.rejects(execute({ env: inputs, log: silence, fetcher: mock([
    lookup, { name: 'run_employee_task', error: true, value: { error: token } },
  ], []) }), error => error.message === 'cormak_request_failed');
});
