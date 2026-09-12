# PROT Factory operational proof v0.2

This proof uses an existing real ProjectY asset instead of inventing another prototype.

Target: `widgets/MY_WAY_NOW_WIDGET_v1.js`

Why REUSE is the correct lane:

- the widget already exists on `main`;
- rebuilding it would violate the factory's reuse-first rule;
- it is low-risk and does not write external state;
- it can be verified automatically before any iPhone-only setup.

Proof contract:

1. normalize a real low-risk job;
2. select the `reuse` lane;
3. inject one intentional QA failure;
4. record exactly one bounded recovery attempt;
5. re-run verification automatically;
6. verify the existing widget artifact is present, non-empty, and JavaScript syntax-valid;
7. emit a machine-readable `trial_ready` result with artifact SHA-256;
8. require no owner `continue` step.

This does **not** claim the widget is already usable on the physical iPhone. Production token/configuration and iPhone Scriptable acceptance remain their own final boundary. The proof is specifically for the Factory's ability to keep moving until the genuine owner-only boundary.
