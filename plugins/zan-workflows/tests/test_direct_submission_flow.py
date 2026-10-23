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

    def test_bug_record_only_preview_restores_the_record_gate_before_delivery(self):
        flow = read('skills/submitting-for-test/references/direct-submission.md')
        record = flow.split('## 人工改动后的 Bug 完成记录\n', 1)[1].split('## 独立直接提测的确定清单', 1)[0]
        for rule in ['仍有效则复用', '失效则按下节准备更正后的完整完成正文']:
            self.assertIn(rule, flow)
        for rule in ['PLAN', '不能宣称 Bug 已有完整 `REVIEWED`', '同一提测清单确认',
                     '先刷新评论并按语义查重', '不倒补开始评论、不重复激活 Bug',
                     '所有必要仓库引用这一份已核实记录', '不盲目重发评论']:
            self.assertIn(rule, record)
        self.assertLess(record.index('先连同当前'), record.index('EXECUTE 的第一项受控写入'))
        self.assertLess(record.index('准确 ID'), record.index('才通过正常提测输入门禁'))
        skill = read('skills/submitting-for-test/SKILL.md')
        self.assertIn('sole PLAN-only exception', skill)
        self.assertIn('before any commit/push/MR, build, Wiki or final', skill)
        validator = read('skills/implementing-work/agents/change-reviewer.md')
        self.assertIn('Do not demand the future corrected-comment readback', validator)

    def test_existing_delivery_is_verified_without_committing_a_disabled_merge(self):
        skill = read('skills/submitting-for-test/SKILL.md')
        git_step = skill.split('6. For each repository', 1)[1].split('7. Resolve', 1)[0]
        self.assertLess(git_step.index('CONTAINMENT_ONLY'), git_step.index('Commit/push through local Git'))
        self.assertIn('with no uncommitted delivery delta', git_step)
        self.assertIn('never fall through to an unapproved write', git_step)
        self.assertIn('VERIFY_CONTAINMENT_ONLY', read('skills/submitting-for-test/agents/submission-validator.md'))


if __name__ == '__main__':
    unittest.main()
