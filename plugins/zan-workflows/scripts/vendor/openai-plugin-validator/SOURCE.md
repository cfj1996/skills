# OpenAI Plugin validator

Unmodified source from [openai/codex, commit 985cf47](https://github.com/openai/codex/tree/985cf47a4eb6084b2ff6b30ebdb1216acda85bb4/codex-rs/skills/src/assets/samples/plugin-creator/scripts).
The bundled skill was removed upstream in
[9db8162](https://github.com/openai/codex/commit/9db8162d658100bbf0a5a151996f9c3396ff1791).
This repository pins the validator locally so its required package check does
not depend on an absent file in a user's Codex system-skill installation.

| File | Upstream Git blob SHA |
| --- | --- |
| `validate_plugin.py` | `b5be462c3b4fe3ea6083cca948ccf52e05301546` |
| `identifier_validation.py` | `41a1a2f1b503c165f5d4b93f7f0e99eb0b3add6e` |
| `LICENSE` | `4606e72e042564097e8780d66c1d4dcb611869bd` |
| `NOTICE` | `2805899d56d0332d175cfc613c67d45d6f006db7` |

The Python files come from
`codex-rs/skills/src/assets/samples/plugin-creator/scripts/`; license and notice
come from the upstream repository root. They are distributed under Apache-2.0.

From the repository root, using Python 3.10+ with PyYAML:

```bash
python3 -B plugins/zan-workflows/scripts/vendor/openai-plugin-validator/validate_plugin.py \
  plugins/zan-workflows
```

Validation only reads the package. It checks the pinned ingestion contract,
companion JSON files, skill metadata and asset references; it does not execute
MCP servers or prove workflow behavior. Update the upstream revision and source
hashes together when deliberately adopting a new contract.
