import unittest
from real_pty_contract import decision, succeeded

class VersionGate(unittest.TestCase):
    def test_confirm_only_exact_complete_prompt(self):
        prompt = "\x1b[31mUpdate available! 1.0.0 → 2.0.0\x1b[0m\nEnter confirm"
        self.assertEqual(decision(prompt, '1.0.0', '2.0.0', False), 'confirm')
        self.assertEqual(decision(prompt, '1.0.0', '2.0.0', True), 'wait')
        self.assertEqual(decision(prompt[:-5], '1.0.0', '2.0.0', False), 'wait')
        self.assertEqual(decision(prompt, '1.0.1', '2.0.0', False), 'cancel')
        self.assertEqual(decision(prompt, '1.0.0', '2.0.1', False), 'cancel')
    def test_changed_target_is_cancelled_even_after_first_confirmation(self):
        self.assertEqual(decision('Homebrew offers a different version. Approve this version to continue.', '1.0.0', '2.0.0', True), 'cancel')
    def test_cancel_and_wrong_result_are_not_success(self):
        self.assertFalse(succeeded('Update cancelled', '1.0.0', '2.0.0'))
        self.assertFalse(succeeded('Temper updated: 1.0.0 → 2.0.1', '1.0.0', '2.0.0'))
        self.assertFalse(succeeded('Temper updated: 1.0.0 → 2.0.00', '1.0.0', '2.0.0'))
        self.assertTrue(succeeded('✓ Temper updated: 1.0.0 → 2.0.0', '1.0.0', '2.0.0'))

unittest.main()
