import importlib.util,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('builder',ROOT/'build_shortcut.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
class Contract(unittest.TestCase):
 def test_exact_native_ocr_then_existing_inline_save(self):
  w=b.build();a=w['WFWorkflowActions'];ids=[x['WFWorkflowActionIdentifier']for x in a]
  self.assertEqual(len(a),8);self.assertEqual(ids.count('is.workflow.actions.extracttextfromimage'),1);self.assertEqual(ids.count('dk.simonbs.Scriptable.RunScriptInlineIntent'),1)
  self.assertEqual(a[0]['WFWorkflowActionParameters']['WFInput']['Value']['Type'],'ExtensionInput')
  self.assertEqual(a[2]['WFWorkflowActionParameters']['WFNumberValue'],1)
  self.assertEqual(a[4]['WFWorkflowActionParameters']['parameter']['Value']['OutputUUID'],a[3]['WFWorkflowActionParameters']['UUID'])
  self.assertEqual(a[4]['WFWorkflowActionParameters']['script'],(ROOT/'inbox-inline.js').read_text())
 def test_no_latest_photos_clipboard_dictation_models_or_source_image_transmission(self):
  s=str(b.build());self.assertNotIn('imageBase64',s)
  for x in ['filter.photos','getlatestphotos','getclipboard','dictatetext','askllm','api.openai.com','project-y-yos-ai.vercel.app','sk-proj-','ntn_','secret_']:
   self.assertNotIn(x,s)
 def test_existing_auth_and_only_inbox_writes(self):
  s=(ROOT/'inbox-inline.js').read_text()
  self.assertIn("const K='YOS_NOTION_INTEGRATION_TOKEN'",s);self.assertIn("const INBOX='3d35ca88-2895-81ef-9dc8-d5f11ff8e213'",s)
  self.assertNotIn("'/pages'",s);self.assertIn("'PATCH',{children}",s);self.assertIn('existing-route-unverified',s)
if __name__=='__main__':unittest.main()
