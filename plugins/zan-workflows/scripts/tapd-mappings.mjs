const fieldName = /^custom_field_[a-z0-9_]+$/;
const text = value => typeof value === 'string' ? value.trim() : '';

function unique(items, message) {
  if (items.length !== 1) throw new Error(message);
  return items[0];
}

export function resolveBugWorkflow(statusMap, transitions, input = {}) {
  if (!statusMap || typeof statusMap !== 'object' || Array.isArray(statusMap) ||
      Object.values(statusMap).some(value => typeof value !== 'string')) throw new Error('状态映射格式不可识别');
  const find = label => unique(Object.entries(statusMap).filter(([, value]) => text(value) === label),
    `工作流状态“${label}”缺失或有歧义`)[0];
  const activeStatus = find(input.activeStatusLabel || '修复中');
  const waitingStatus = find(input.waitingStatusLabel || '待测试');
  if (activeStatus === waitingStatus ||
      (input.activeStatus && input.activeStatus !== activeStatus) ||
      (input.waitingStatus && input.waitingStatus !== waitingStatus)) throw new Error('已提供状态代码与实际工作流不一致');
  let matching;
  if (Array.isArray(transitions)) {
    matching = transitions.filter(row => row?.StepPrevious === activeStatus && row?.StepNext === waitingStatus);
    if (!matching.length) throw new Error('修复中不能直接流转到待测试');
  } else if (transitions && typeof transitions === 'object' && Array.isArray(transitions[activeStatus])) {
    if (!transitions[activeStatus].includes(waitingStatus)) throw new Error('修复中不能直接流转到待测试');
    matching = [];
  } else throw new Error('工作流流转格式不可识别');
  const requiredFields = [...new Set(matching.flatMap(row => row.Appendfield || [])
    .filter(field => field.Notnull === 'yes' || field.Notnull === true || field.Notnull === '1')
    .map(field => field.FieldName))];
  if (requiredFields.some(name => typeof name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(name))) {
    throw new Error('工作流必填字段名称不可识别');
  }
  return { activeStatus, waitingStatus, workflowVerified: true, requiredFields };
}

export function customFieldRows(metadata) {
  if (Array.isArray(metadata)) return metadata.map(row => row?.CustomFieldConfig || row);
  if (!metadata || typeof metadata !== 'object') throw new Error('自定义字段配置不可识别');
  if (metadata.CustomFieldConfig) return [metadata.CustomFieldConfig];
  return Object.entries(metadata).map(([key, value]) => ({ ...value, custom_field: value?.custom_field || key }));
}

export function resolveVersionField(metadata, input) {
  const native = input.entryType === 'bug' ? 'test_version' : 'version';
  if (input.versionField === native) return { versionField: native, versionFieldVerified: true, versionFieldSource: 'NATIVE' };
  const labels = input.versionFieldLabel ? [input.versionFieldLabel] : ['测试版本', '提测版本'];
  const rows = customFieldRows(metadata).filter(row => row && !['0', 0, false].includes(row.enabled) &&
    !['1', 1, true].includes(row.freeze) && labels.includes(text(row.name)));
  if (!input.versionField && !input.versionFieldLabel && rows.length === 0) {
    return { versionField: native, versionFieldVerified: true, versionFieldSource: 'NATIVE' };
  }
  const row = unique(rows, '测试版本字段缺失或有歧义；需要明确实际字段标签');
  if (!fieldName.test(row.custom_field || '') || !['text', 'textarea'].includes(row.type) ||
      (input.versionField && row.custom_field !== input.versionField)) throw new Error('测试版本字段代码、类型或当前配置不一致');
  return { versionField: row.custom_field, versionFieldVerified: true, versionFieldSource: 'CUSTOM', versionFieldLabel: row.name };
}

export function assertTransitionFields(fields, item) {
  const missing = fields.filter(name => item[name] === undefined || item[name] === null || String(item[name]).trim() === '');
  if (missing.length) throw new Error(`工作流必填字段没有现值，需要明确处理：${missing.join(',')}`);
}
