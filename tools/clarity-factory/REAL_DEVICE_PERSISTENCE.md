# Clarity real-device file persistence

Observed on the target iPhone: the generated Shortcut completed after dictation without showing an error, but `Clarity Inbox.txt` and `Clarity Ledger.txt` remained empty.

Clarity therefore resolves local destination files first with `getFile(...)` and passes the resulting `WFFile` reference to `file.append`. Path-only `WFFilePath` appends are rejected by `validate_clarity_runtime.py` because compile success alone did not prove physical persistence.

Required order for Raw First is:

`dictation -> resolve Clarity Inbox.txt -> append through WFFile -> resolve Clarity Ledger.txt -> model`

After replacing the previous Shortcut on the target iPhone, the first physical check is that one dictated phrase creates a new `RAW` line in `Clarity Inbox.txt`.

The generated artifact must still pass physical iPhone E2E before whole-Clarity completion is claimed.
