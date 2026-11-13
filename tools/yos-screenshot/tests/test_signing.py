import importlib.util,unittest
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'verify_signed.py'
spec=importlib.util.spec_from_file_location('verify',p);v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
class Signing(unittest.TestCase):
 def test_rejects_known_hubsign_failure_even_when_all_actions_survive(self):
  e={'WFWorkflowActions':[{'id':'save'}],'WFWorkflowTriggers':[{'WFTriggerIdentifier':'WFScreenshotTrigger'}]}
  with self.assertRaisesRegex(ValueError,'WFWorkflowTriggers'):v.assert_workflow(e,{'WFWorkflowActions':e['WFWorkflowActions']})
 def test_presentation_normalization_is_allowed_but_changed_dataflow_is_not(self):
  e={'WFWorkflowClientVersion':'5114','WFWorkflowActions':[{'input':'trigger'}]}
  v.assert_workflow(e,{**e,'WFWorkflowClientVersion':'1505','WFWorkflowHasOutputFallback':False})
  with self.assertRaises(ValueError):v.assert_workflow(e,{'WFWorkflowActions':[{'input':'latest-photo'}]})
if __name__=='__main__':unittest.main()
