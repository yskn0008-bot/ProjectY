#!/usr/bin/env python3
"""Verify read-only published-edition notification shortcut. No off-device claims."""
import argparse,plistlib
from pathlib import Path

def check(file):
  root=plistlib.loads(file.read_bytes())
  actions=root['WFWorkflowActions']
  names=[x['WFWorkflowActionIdentifier'] for x in actions]
  inline=[i for i,n in enumerate(names) if n=='dk.simonbs.Scriptable.RunScriptInlineIntent']
  if len(inline)!=1:raise AssertionError('Expected one Scriptable read-only action')
  if any(n.endswith('askllm') or n=='is.workflow.actions.documentpicker.save' for n in names):
    raise AssertionError('Publishing or writing models not allowed in notifier')
  p=actions[inline[0]]['WFWorkflowActionParameters']
  src=p['script']['Value']['string']
  if '__YOS_JOURNAL_NOTIFICATION_INLINE__' in src or len(src)<2000:
    raise AssertionError('Not fully patched')
  if not all(x in src for x in ('YOS_JOURNAL_NOTIFY_HOLD','YOS_JOURNAL_NOTIFY_SCHEDULED',
          'journal/latest.json','journal-v2/','new Notification()','Script.complete()')):
    raise AssertionError('Published issue guard missing')
  if 'api.notion.com' in src or 'api.github.com' in src:
    raise AssertionError('No private or GitHub writes in notifier')
  if p.get('runInApp') is not False or p.get('ShowWhenRun') is not False:
    raise AssertionError('Unwanted UI')
  print('JOURNAL publication-only notification structure PASS',len(actions),'actions')

if __name__=='__main__':
  parser=argparse.ArgumentParser()
  parser.add_argument('shortcut',type=Path)
  a=parser.parse_args();check(a.shortcut)
