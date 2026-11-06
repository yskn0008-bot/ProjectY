# Reference fidelity QA

final result: blocked

Target: supplied second reference (38B0552D), left screen, as the default glass HOME; first reference (15F7C4CD), compact HOME and separate EDIT as alternate presentation. Both references were opened. No arbitrary hybrid is designated as matching both.

Implemented: explicit glass/compact modes; glass identity/title/date pill/legend and larger translucent cards with actual time text; generated text-free pearl background; official offline Phosphor icons; separate precise edit grid. Source screenshots are not baked into the UI and reference example routines are never imported as user data.

Verification: 33 Node/native/VM DOM tests pass after embedding the final assets. These test source behavior and packaging, not actual visual fidelity.

Blocker: no permissible rendered implementation screenshot in this environment. Prior browser restrictions are not bypassed. A device-check candidate is prepared specifically to obtain an actual iPhone screenshot; it is not a visually accepted release. After the user supplies a capture, compare matching viewport/state to the reference and correct discrepancies before accepting the design. Required: typography, spacing, card clipping, actual wallpaper, touch and native save/reopen. Physical device and Figma canvas remain unverified/incomplete.
