"""Portable tests for structure and link checks, not subject-matter accuracy."""
from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('study_checker', ROOT / 'scripts/check_study_data.py')
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class StudyDataTests(unittest.TestCase):
    def setUp(self):
        self.data = json.loads((ROOT / 'examples/minimal-course.json').read_text(encoding='utf-8'))

    def expect(self, passed, mode='full'):
        result = checker.validate(self.data, mode)
        self.assertEqual(result['status'], 'pass' if passed else 'fail', result)
        return result

    def test_complete_course(self):
        result = self.expect(True)
        self.assertEqual(result['coverage'][0]['questionIds'], ['Q001'])

    def test_unknown_source(self):
        self.data['cards'][0]['sourceRefs'][0]['sourceId'] = 'missing'
        self.expect(False)

    def test_full_review_needs_practice(self):
        self.data['questions'] = []
        self.expect(False)

    def test_cards_only_does_not_need_practice(self):
        self.data['questions'] = []
        self.expect(True, mode='cards')

    def test_disputed_question_cannot_be_exact(self):
        self.data['questions'][0].update(reviewStatus='disputed', caution='条件有两种合理理解。')
        self.expect(False)

    def test_disputed_question_can_have_reference(self):
        self.data['questions'][0].update(reviewStatus='disputed', grading='reference',
                                       caution='条件有两种合理理解。', referenceAnswer='分别说明适用条件。')
        self.expect(True)

    def test_answer_must_be_in_options(self):
        self.data['questions'][0]['answer'] = ['C']
        self.expect(False)

    def test_official_question_needs_original_source(self):
        self.data['questions'][0]['provenance'] = 'official'
        self.expect(False)

    def test_subjective_rubric_required(self):
        self.data['questions'][0].update(type='case', grading='rubric', referenceAnswer='说明条件与计算过程。')
        self.expect(False)

    def test_subjective_rubric_accepted(self):
        self.data['questions'][0].update(type='case', grading='rubric', referenceAnswer='说明条件与过程。', rubric=['条件', '过程'])
        self.expect(True)

    def test_uncovered_objective(self):
        self.data['objectives'].append({'id':'O002', 'title':'新增能力',
                                       'sourceRefs':[{'sourceId':'S001', 'location':'第2页'}]})
        self.expect(False)

    def test_duplicate_id(self):
        self.data['cards'].append(deepcopy(self.data['cards'][0]))
        self.expect(False)

    def test_invalid_root(self):
        self.assertEqual(checker.validate([])['status'], 'fail')

    def test_interpretation_with_source(self):
        self.data['cards'][0]['definitionStatus'] = 'interpretation'
        self.expect(True)

    def test_cli_report_and_input_protection(self):
        with tempfile.TemporaryDirectory(prefix='study-kit-test-') as folder:
            source = Path(folder) / 'course.json'
            report = Path(folder) / 'report.json'
            source.write_text(json.dumps(self.data, ensure_ascii=False), encoding='utf-8')
            before = hashlib.sha256(source.read_bytes()).hexdigest()
            command = [sys.executable, '-X', 'utf8', str(ROOT / 'scripts/check_study_data.py'), str(source)]
            good = subprocess.run(command + ['--report', str(report)], capture_output=True, text=True, encoding='utf-8')
            self.assertEqual(good.returncode, 0, good.stderr)
            self.assertEqual(json.loads(report.read_text(encoding='utf-8'))['status'], 'pass')
            bad = subprocess.run(command + ['--report', str(source)], capture_output=True, text=True, encoding='utf-8')
            self.assertEqual(bad.returncode, 2)
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), before)


if __name__ == '__main__':
    unittest.main()
