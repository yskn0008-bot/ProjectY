# PROT Factory v0.1

PROT Factory is an isolated prototype manufacturing core for ProjectY. Its job is to reduce owner waiting and repeated decisions by turning a normalized prototype request into a safe manufacturing lane and a machine-readable next state.

It is **not** a new AI personality, a replacement for YOS, or a way to bypass ProjectY production protections.

## Reused assets

- ProjectY root `AGENTS.md`
- Issue #232 ProjectY HQ recovery model
- Issue #315 ProjectY v3.0 development environment
- One Enter orchestration work
- YOS Automation Factory work in Issues #306, #308, #309 and PR #307
- `tools/shortcut-builder/**`

## Pipeline

```text
intake
  -> inventory
  -> planned
  -> building
  -> qa
  -> trial_ready
  -> done
```

Safe exits:

```text
needs_yos
stopped
```

Failures may enter `recovering`, but the same failure is fingerprinted and the job has a maximum recovery budget of two attempts.

## No-wait boundary

The deterministic core itself does not pretend to keep running after a chat ends. Continued execution must be handed to a real runner such as GitHub Actions, ProjectY HQ, or an already-authorized implementation connector.

The owner should only be asked to return for boundaries that genuinely require a person, such as credentials/2FA, payment or purchase, destructive important-data changes, production approval where required, physical iPhone-only steps, or an unresolved value choice between multiple valid product directions.

## Manufacturing lanes

- `reuse`: existing asset can satisfy the request; do not build a duplicate.
- `shortcut`: use/reuse the Shortcut/Automation factory path.
- `web`: isolated small web/script prototype.
- `product`: hand off to the formal ProjectY implementation lane; PROT Factory does not bypass product QA.
- `external`: external/iPhone work; finish all automatable steps first.
- `unknown`: fail closed until the route can be determined.

## v0.1 scope

`factory.py` is dependency-free and intentionally deterministic. It validates the job contract, applies risk gates, chooses the least-expensive explicit lane, validates status transitions, fingerprints failures, and enforces bounded recovery.

It does **not** add a new AI API, secrets, autonomous deployment, production writes, purchases, or destructive operations.

## Run locally

```bash
python3 -m unittest discover -s tools/prot-factory/tests -v
python3 tools/prot-factory/factory.py job.json
```

Recovery example:

```bash
python3 tools/prot-factory/factory.py job.json \
  --recover TEST_FAILURE \
  --evidence "synthetic failure"
```

## Completion levels

- **Factory code complete:** core + tests + CI are green on a dedicated PR.
- **Factory operational:** one real low-risk prototype is manufactured through the factory without asking the owner to say “continue”.
- **Physical complete:** any unavoidable iPhone/device step has been completed and verified on the actual device.

The v0.1 core being green does **not** mean the operational factory is complete. Operational completion requires a real prototype to traverse the factory and produce a usable artifact or preview without an owner “continue” step.

Issue: #333
