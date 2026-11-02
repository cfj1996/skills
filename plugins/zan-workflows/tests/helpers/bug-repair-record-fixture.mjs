import { sha256 } from '../../scripts/workflow-runtime.mjs';

export const repairRecordBody = '<p><strong>【Bug 溯源与修复记录】</strong></p>' +
  '<p><strong>产生原因：</strong>模拟组件导入不明确。</p>' +
  '<p><strong>引入人：</strong>暂未确认。</p>' +
  '<p><strong>引入时间：</strong>暂未确认。</p>' +
  '<p><strong>引入提交／MR：</strong>暂未确认。</p>' +
  '<p><strong>依据：</strong>模拟项目解析器验证。</p>' +
  '<p><strong>修复方式：</strong></p><ul><li><strong>改动：</strong>显式声明组件扩展名。</li>' +
  '<li><strong>验证：</strong>模拟编译、解析和评审通过。</li></ul>';

export function repairRecordFixture(body = repairRecordBody) {
  return { commentId: '1150372234001000099', author: 'developer', bodySha256: sha256(body) };
}

export function repairCommentFixture(entryId, workspaceId, body = repairRecordBody) {
  const record = repairRecordFixture(body);
  return { id: record.commentId, entry_id: entryId, workspace_id: String(workspaceId),
    entry_type: 'bug', author: record.author, description: body };
}
