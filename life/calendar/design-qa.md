# Current design acceptance gate

final result: blocked

User now explicitly asks for an exact static wallpaper copy and defers task functionality. The current renderer uses the original supplied JPEG bytes, clipped to the left content viewport and scaled uniformly. It does not redraw or approximate the source. Original hash equality and viewport math are verified; actual iPhone placement/crop and Scriptable chrome remain unverified. Prior generated/HTML skins are historical, not the current target.

Source: second supplied JPEG (glass) default; first supplied JPEG (compact) optional. Both original images remain unchanged. See REFERENCE_WALLPAPER.md and reference-wallpaper-manifest.json.5 source/native mock checks pass. No claim of a browser or physical-device visual pass. Next: obtain actual iPhone output and compare the exact chosen viewport with the source.
