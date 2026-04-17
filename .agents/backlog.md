# Backlog

## oxfmt config broken (2026-04-17)

`bunx oxfmt .` fails with:

```
Failed to parse configuration.
Invalid `sortImports` configuration: unknown group name `builtin-type` in `groups`
```

Pre-existing — not introduced by current work. Likely the `sortImports.groups` field in oxfmt config references a deprecated group name. Fix when next touching formatting/lint config.
