from pathlib import Path
import json
import re
import unittest


PLUGIN = Path(__file__).resolve().parents[1]


def read(path):
    return (PLUGIN / path).read_text()


class DirectSubmissionFlowTests(unittest.TestCase):
    def test_requirement_default_still_delivers_after_review(self):
        requirement = read('skills/developing-requirement/SKILL.md')
        self.assertIn('普通“开发”默认 SUBMIT', requirement)
        self.assertIn('需求清单默认显示“直接提测：是”', requirement)
        checklist = read('references/execution-checklist.md')
        template = checklist.split('## 完整展示模板\n', 1)[1].split('## 展示顺序与语言', 1)[0]
        self.assertIn('**直接提测：**', template)
        self.assertLess(template.index('**直接提测：**'), template.index('**合并到测试分支：**'))

    def test_developer_inspection_can_end_implementation_without_delivery(self):
        for path in ['skills/developing-requirement/SKILL.md', 'skills/fixing-bug/SKILL.md',
                     'references/execution-checklist.md']:
            with self.subTest(path=path):
                content = read(path)
                self.assertIn('先完成代码，我检查后再提测', content)
                self.assertIn('直接提测：否', content)
                self.assertIn('IMPLEMENT', content)
        flow = read('skills/submitting-for-test/references/direct-submission.md')
        self.assertIn('人工检查没有回复不代表可以交付', flow)
        self.assertIn('不提交、推送、创建/合并 MR、写提测 Wiki', flow)
        self.assertIn('不查询这些能力或展示 Wiki 预览', flow)
        self.assertIn('实施本身必需且已授权的 Bug 状态/修复记录', flow)

    def test_direct_submission_is_discoverable_and_does_not_mean_skip_build(self):
        metadata = read('skills/submitting-for-test/agents/openai.yaml')
        self.assertIn('display_name: "zan:直接提测"', metadata)
        self.assertIn('$submitting-for-test', metadata)
        self.assertIn('直接提测不表示跳过构建', metadata)
        deployment = read('skills/submitting-for-test/references/deployment-and-confirmation.md')
        skip_row = next(line for line in deployment.splitlines() if line.startswith('| `SKIP` |'))
        self.assertNotIn('直接提测', skip_row)
        self.assertIn('不构建', skip_row)
        self.assertIn('明确不构建/跳过发布选 `SKIP`', read('skills/fixing-bug/SKILL.md'))
        prompts = json.loads(read('.codex-plugin/plugin.json'))['interface']['defaultPrompt']
        self.assertTrue(any('$submitting-for-test' in prompt and '直接提测' in prompt for prompt in prompts))

    def test_human_edits_require_current_evidence_without_reimplementation(self):
        skill = read('skills/submitting-for-test/SKILL.md')
        self.assertIn('changed content after review', skill)
        self.assertIn('POST_CHANGE_REVIEW', skill)
        self.assertIn('Never manufacture', skill)
        flow = read('skills/submitting-for-test/references/direct-submission.md')
        for rule in ['不重跑需求拆解', '不重新激活 Bug', '人工确认不能替代',
                     '不在直接提测中自动修复业务代码', '不要求重写提交']:
            self.assertIn(rule, flow)

    def test_standalone_checklist_has_exact_delivery_scope_and_one_confirmation(self):
        flow = read('skills/submitting-for-test/references/direct-submission.md')
        self.assertIn('实施授权或人工看过代码不能代替准确交付计划的确认', flow)
        self.assertIn('本次明确要求直接提测后重新解析本轮选择', flow)
        self.assertIn('本轮明确的 NO_WIKI/SKIP 仍保留', flow)
        template = re.search(r'```markdown\n(.*?)\n```', flow, re.S).group(1)
        markers = ['### 待交付变更', '### 合并与测试环境', '**直接提测：**',
                   '**合并到测试分支：**', '**是否需要提测 Wiki：**', '**部署测试环境：**',
                   '**TAPD 状态：**', '### 提测 Wiki 模板预览', '是否按以上确定清单执行？']
        positions = [template.index(marker) for marker in markers]
        self.assertEqual(positions, sorted(positions))
        self.assertEqual(template.count('是否按以上确定清单执行？'), 1)
        self.assertIn('TRIGGER_ACCEPTED', flow)
        self.assertIn('不等待构建完成', flow)

    def test_new_guidance_links_resolve(self):
        for relative in ['skills/submitting-for-test/references/direct-submission.md',
                         'skills/submitting-for-test/SKILL.md']:
            path = PLUGIN / relative
            for target in re.findall(r'\[[^\]]+\]\(([^)]+)\)', path.read_text()):
                if '://' not in target and not target.startswith('#'):
                    with self.subTest(path=relative, target=target):
                        self.assertTrue((path.parent / target.split('#', 1)[0]).is_file())

    def test_bug_record_publication_is_a_normal_late_step_not_an_input_exception(self):
        flow = read('skills/submitting-for-test/references/direct-submission.md')
        record = flow.split('## Bug 修复记录\n', 1)[1].split('## 独立直接提测的确定清单', 1)[0]
        self.assertIn('已评审的完整草稿即可正常进入 PLAN', record)
        self.assertIn('没有已发表评论不是缺口', record)
        self.assertIn('适用 Wiki/独立回链之后、TAPD 登记之前', record)
        self.assertIn('不追加另一条完整记录', record)
        skill = read('skills/submitting-for-test/SKILL.md')
        step = skill.split('9. For a Bug only', 1)[1].split('10. After all required', 1)[0]
        self.assertIn('NO_WIKI skips only Wiki/link steps, not this record', step)
        self.assertIn('unknown effect blocks registration', step)
        for path in ['skills/submitting-for-test/SKILL.md',
                     'skills/submitting-for-test/agents/submission-validator.md',
                     'skills/submitting-for-test/references/submission-rules.md',
                     'skills/submitting-for-test/references/contracts.md']:
            with self.subTest(path=path):
                self.assertNotIn('record-only', read(path))
        rules = read('skills/implementing-work/references/bug-repair-record.md')
        self.assertNotIn('｜开始', rules)
        self.assertNotIn('｜完成', rules)
        self.assertIn('修复记录与提测 Wiki 链接是两条独立评论', rules)
        prompts = json.loads(read('.codex-plugin/plugin.json'))['interface']['defaultPrompt']
        self.assertNotIn('start/completion records', '\n'.join(prompts))

    def test_existing_delivery_is_verified_without_committing_a_disabled_merge(self):
        skill = read('skills/submitting-for-test/SKILL.md')
        git_step = skill.split('6. For each repository', 1)[1].split('7. Resolve', 1)[0]
        self.assertLess(git_step.index('CONTAINMENT_ONLY'), git_step.index('Commit/push through local Git'))
        self.assertIn('with no uncommitted delivery delta', git_step)
        self.assertIn('never fall through to an unapproved write', git_step)
        self.assertIn('VERIFY_CONTAINMENT_ONLY', read('skills/submitting-for-test/agents/submission-validator.md'))


if __name__ == '__main__':
    unittest.main()
