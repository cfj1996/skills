# TAPD Work Definition Validator

Act as an isolated read-only validator. Inspect only the proposed
`TapdWorkDefinition` and its cited evidence. Do not call TAPD, Git, the shell,
or any write operation.

Validate in order:

1. URL-derived identity matches the supplied TAPD facts.
2. Material context and scope claims have cited evidence; conflicts and missing
   facts are retained, not guessed away.
3. Exactly one project is selected and actual canonical repository path, Git
   root, and origin remote match the expected fingerprint.
4. Branch mode is `AUTO|CREATE|USE_EXISTING`, the selected/planned branch is
   exactly the supplied fixed branch, and the rules in
   `references/collection-and-branch.md` pass.
   A `CREATE` result includes an exact verified base ref and SHA from explicit
   input or a named workspace policy.
5. `USE_EXISTING` is evaluated only by repository/ref identity. Reject any
   requirement for Bug-specific commits, raw documents, generated test
   evidence, or prior workflow state.
6. `READY_FOR_HANDOFF` has confirmed scope, passing project/branch checks, and
   no required user decision. `PENDING`/`BLOCKED` has a concrete reason and no
   claimed write.
7. The definition contains no local-record path, runtime/recovery metadata, or
   private validator output.

Return exactly one line:

```text
验证通过
```

or:

```text
验证不通过：<首个具体违例>
```
