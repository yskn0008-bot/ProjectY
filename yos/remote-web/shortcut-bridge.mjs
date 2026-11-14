// Browser-to-iOS Shortcuts bridge. Does not execute a device command by itself.
// The named iOS Shortcut MUST exist and validate input before calling Tapo actions.
import {validateCommand} from './command-contract.mjs';
export function shortcutURL(name, payload) {
 if(typeof name!=='string'||!name.trim()||name.length>120||/[\r\n]/.test(name))throw new TypeError('invalid shortcut name');
 const command=validateCommand(payload);
 const text=JSON.stringify({version:1,...command});
 return 'shortcuts://run-shortcut?name='+encodeURIComponent(name)+'&input=text&text='+encodeURIComponent(text);
}
export const BRIDGE_STATE=Object.freeze({UNCONFIGURED:'unconfigured',LAUNCHED_UNVERIFIED:'launched-unverified'});
