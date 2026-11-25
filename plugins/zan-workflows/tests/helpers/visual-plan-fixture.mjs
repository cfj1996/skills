export const visualFeatures = ['P1-M1-F1', 'P1-M2-F1'];

export function withVisualTests(markdown) {
  return markdown.split(/(?=^#### P\d+-M\d+-F\d+ )/m).map(section => {
    const feature = visualFeatures.find(id => section.startsWith('#### ' + id + ' '));
    if (!feature) return section;
    return section.trimEnd() + '\n\n' + [
      '##### ' + feature + '-UI1 弹框布局',
      '',
      '- **视觉对照依据** [已确认的图一](https://design.example.test/import.png)',
      '- **视觉对齐要点** 模板说明与两个链接同区，虚线上传框，验证码同行。',
      '',
      '##### ' + feature + '-TC2 弹框视觉对齐',
      '',
      '- **验收类型** 视觉对齐',
      '- **对照界面** ' + feature + '-UI1',
      '- **验收前提** 管理员，桌面窗口，弹框初始空态。',
      '- **验收步骤** 从本功能入口打开实际弹框，对照图一并截图。',
      '- **通过条件** 说明和链接同区、虚线上传框和验证码同行均可见。',
      '',
      '',
    ].join('\n');
  }).join('');
}
