# Cormak Documentation Generator

Draft README files, technical guides, release notes or reference pages from
one reviewed notes file. The Action invokes an active Copywriter in your
Cormak account through its existing MCP interface. It does not scan Git
history, inspect pull requests, or auto-update files outside `generated/`.
Runs on Node 24 with no runtime packages.

**Release candidate:** use the checked-in mock tests while the repository and
Marketplace listing are being prepared.

Follow [the OAuth connection guide](CONNECTION.md) with `employees:read` and
`employees:use`. Select an active Copywriter in Cormak and obtain its UUID via
the authorized MCP `list_employees` tool (see the
[developer guide](https://cormak.app/developers)). Use the UUID as the
`CORMAK_COPYWRITER_ID` environment variable in GitHub's `cormak` environment
(**Variables**, not **Secrets**). Commit a reviewed file to `docs-input/`;
[the demo notes](demo/docs-input/release.md) are a starting point.

| Input | Purpose |
| --- | --- |
| `context_file` | One UTF-8 `.md` or `.txt` file under `docs-input/`, up to 5,500 characters. |
| `copywriter_id` | UUID of an active Copywriter in the connected account. |
| `kind` | `readme`, `technical`, `release`, or `reference`. |
| `language` | `en`, `ru`, `de`, `es`, or `ko`. |
| `request_id`, `allow_paid`, `max_credits` | Stable UUID, explicit opt-in and credit ceiling. |
| `output_path` | New `.md` file below `generated/`. |

The first run may return `status=awaiting_confirmation` and an `approval_url`.
Open the link in Cormak, review the request and credit cost, then rerun the
same workflow with the same UUID, commit and inputs within the displayed
approval window. Approval by itself does not start the job. On completion,
`output_path` identifies the Markdown draft and `credits_charged` is included
when returned. Keep the original grant if you have to replace an expired token.
Use the [workflow example](examples/documentation.yml) for both stages.

Run offline tests: `node --test test.mjs oauth.test.mjs`.
