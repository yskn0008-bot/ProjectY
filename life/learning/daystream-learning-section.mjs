/**
 * Integration boundary for YOS System-owned DAYSTREAM.
 * Existing Scriptable has already sanitized Notion results into taskSource.
 * This pure function produces optional HTML for a read-only section.
 * No WebView access, no persistence, no shortcuts, no API, no notifications.
 */
import {prepareDaystreamLearningSnapshot} from './daystream-learning-bridge.mjs';
import {renderDaystreamLearningPreview,daystreamLearningPreviewCss} from './daystream-learning-preview.mjs';

export function buildDaystreamLearningSection({taskSource,now}={}){
  const snapshot=prepareDaystreamLearningSnapshot({taskSource,now});
  return Object.freeze({
    status:snapshot.status,
    complete:snapshot.complete===true,
    html:renderDaystreamLearningPreview(snapshot),
    css:daystreamLearningPreviewCss,
    checkedAt:snapshot.checkedAt,
    cards:snapshot.cards.map(({key,taskId,title,dueDate,reason})=>Object.freeze({key,taskId,title,dueDate,reason})),
    // This is not a confirmation that the section is mounted to a user's device.
    installed:false
  });
}
