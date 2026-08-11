# Acceptance scenarios

| Scenario | Expected behavior |
| --- | --- |
| One Bug URL | Execute one prepare/implement/submit chain and optional go-live. |
| Three Bug URLs on one existing branch | Execute the same chain three times in order with `USE_EXISTING`. Do not require prior evidence for the next Bug. |
| Three Bug URLs with a new fixed branch | First actual creation uses `CREATE`; after its ref readback, later Bugs use `USE_EXISTING`. |
| Second Bug fails repair | Report the second Bug failure, skip its submit/go-live, then begin the third Bug. |
| Exact duplicate URL | Keep the first occurrence and do not execute the duplicate again. |
| `NO_WIKI` | Submission never loads or invokes Wiki capability. |
| No explicit go-live request | Stop each successful Bug after submission. |
| Interrupted conversation | Create no recovery record; the user supplies remaining Bugs again. |
| Shared repository or branch mismatch | Perform no writes for affected items and report the shared blocker concisely. |

The final user-facing response contains only the ordered result list, not
handoff objects, runtime metadata, generated files, or validator protocol.
