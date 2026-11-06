# Literal reference timeline foundation

The user explicitly deferred tasks and asked for an exact static wallpaper copy of the supplied timeline. This supersedes the active CSS/interactive design effort.

The viewer uses the ORIGINAL JPEG bytes unchanged. No image model generation, font substitution, icon substitution, gradients or redrawn cards. It displays the left timeline content region through a clipped viewport at one uniform scale. Device decoration and unrelated explanatory panels are outside that viewport. It does not claim a new generated image is identical.

Default: second glass reference. Optional existing Scriptable shortcutParameter=compact selects the first compact reference. No new installed app is created, no old script is replaced, no calendar/Notion/plan is read or written. Dates, tasks, hand illustration and effects seen inside the image remain static reference artwork; they are not user schedule or app advice.

Assets are fixed atbd67b996c0da7e54e99b7a3528c2a3233e329c6b. Original file hashes and crop bounds: reference-wallpaper-manifest.json. Runtime image base64 SHA256 is checked before display. No remote HTML or JavaScript is loaded into WebView; image becomes an inert data URL. Native Close toolbar is controlled by Scriptable and remains outside the image.

Build: python3 build-reference-wallpaper.py. Test: node --test reference-wallpaper.test.mjs.5/5 pass: exact source hashes, uniform viewport geometry, no task UI/data operations, fixed image loading, failed/tampered image rejection. Physical iPhone output remains unverified.

Next: open YOS_DAYSTREAM_Reference_Wallpaper.js through the short pinned bootstrap. Check actual crop and scale on iPhone. Only after the foundation is accepted should editable task controls be placed over it. Existing app and prior updater remain untouched.
