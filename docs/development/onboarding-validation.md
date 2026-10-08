# Interactive onboarding validation

[Documentation index](../README.md) · [Pi guide](../guides/pi.md) · [Release checklist](./releases.md)

**O4 preparation, 2026-10-08.** The bundled Pi 1.1.0 CLI was exercised in an interactive PTY,
using a disposable profile, synthetic history and the [fake provider fixture](https://github.com/kevinqz/optchat-durable/blob/main/test/fixtures/onboarding-provider.ts).
The runtime source was `8d085ee6836bd77483b00cfcfb63c75511a07450` (O1/O3 merged).
This qualifies the listed interaction sequence, not the final future release artifact or
real login/provider behavior. No external model call was made.

| Step                                                            | Observed result                                                                                                                               |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Start ordinary Pi in a fresh isolated profile                   | Fake model selected; ordinary input had no OptChat view                                                                                       |
| Send a message before installing OptChat                        | Pi retained the exact `TUI-107` source                                                                                                        |
| Install the local package while Pi remains open, then `/reload` | Public source loader succeeded; existing transcript remained visible                                                                          |
| Send an ordinary message                                        | Preparation status appeared, then the retained-record count; the current input used the memory view                                           |
| `/optchat zoom 0 1`                                             | Exact original, timestamp and Pi entry ID `e641a858` were returned                                                                            |
| `/new`, then `/resume` and select the previous session          | Session picker displayed the previous history; the same original and entry ID remained retrievable                                            |
| Remove the package, `/reload`, send another ordinary message    | Pi continued normally; the new current input no longer contained an OptChat view                                                              |
| Inspect the stopped disposable profile                          | All original settings, chosen model and fake auth-file bytes remained unchanged; Pi added only its own `lastChangelogVersion: "1.1.0"` marker |
| Inspect retained data after removal                             | Original Pi source and native OptChat archive remained on disk                                                                                |

The PTY's actual terminal output was inspected. Pixel-level inspection in the macOS Terminal
application remains pending: the computer-use tool refused control of that app. Do not turn
this into a claim that a GUI screenshot, real OAuth login, or the final published artifact was
verified. The [distribution checks](./validation.md) separately exercise fresh Pi installation,
SDK consumers and standalone behavior.

## Reproduce the interactive sequence

Use a source checkout with `npm ci`, Node 22.19+ and a terminal. These variables point only to a
new test profile; do not substitute your personal Pi data directory.

```bash
OPTCHAT_REPO="$PWD"
OPTCHAT_UI_TMP="$(mktemp -d)"
mkdir "$OPTCHAT_UI_TMP/workspace"
export PI_CODING_AGENT_DIR="$OPTCHAT_UI_TMP/agent"
export PI_SKIP_VERSION_CHECK=1
cd "$OPTCHAT_UI_TMP/workspace"
node "$OPTCHAT_REPO/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js" \
  -e "$OPTCHAT_REPO/test/fixtures/onboarding-provider.ts" \
  --no-skills --no-prompt-templates --no-themes --model faux/optchat-onboarding-test
```

Send a synthetic message. In another terminal using the same test environment, run the bundled
CLI's `install "$OPTCHAT_REPO"`. Back in Pi, use `/reload`, send another message, and check
`/optchat status`, `/optchat zoom 0 1`, `/new` and `/resume`. Remove that local package with the
same CLI, reload again, and confirm an ordinary message still works. Quit before comparing
profile settings and original source records. The fixture reports only whether the **current
user input** contains the view; old system/history text can still mention OptChat.

For O4, repeat the final public Git-tag/tarball installation paths from both READMEs, inspect
the terminal visually, and link exact artifact checksums and CI results in the release dossier.
This source-checkout rehearsal does not replace that gate.

## Published rc.2 and footer correction

On 2026-10-08, a second disposable profile used a freshly installed Pi 1.1.0 and the public
`git:github.com/kevinqz/optchat-durable@v0.4.0-rc.2` source, resolved to
`b991d4d741ee6265c54b460e858d3f10847f11d9`. The full interactive PTY sequence passed: send a
message before installation, install while Pi remains open, `/reload`, ordinary native input,
original retrieval, `/new` with a first native turn, `/resume` through the picker, original
retrieval again, package removal, `/reload`, and continued ordinary input without a memory view.

The original `Release TUI-107: retain this original before installing OptChat.` remained
retrievable as Pi entry `7d2f38a8`, timestamp `2026-10-08T06:44:05.589Z`, before and after resume.
Both Pi sessions and both native archives remained on disk after removal. The complete settings
object, selected model and auth-file bytes were unchanged. The synthetic provider made no
external model call. This verifies the public tag's interactive path; the compiled tarball's
separate consumer evidence remains in its [release record](https://github.com/kevinqz/optchat-durable/releases/tag/v0.4.0-rc.2).

The inspection found a display issue in rc.2: after the first reply the footer still said
`OptChat: 0 memory records`. This was the prior count of the frozen context; the current user
and assistant records had already been committed. The unreleased fix labels that phase as
`0 prior records`, then shows `2 records stored` after synchronization. It does not equate
stored originals with completed summaries. Cancellation updates the stored count; failures
retain their blocked notice; a replacement session clears the previous session's footer.

The fixed source was also inspected through the bundled interactive CLI. Reopening the rc.2
archive showed `6 prior records` before the next answer and `8 records stored` afterward;
a fresh session showed `0 prior records` then `2 records stored`. The original entry and
settings/authentication remained unchanged. Runtime regressions cover TUI, print and RPC
bindings, cancellation, failure notices and session replacement. This fix is in development
and does not retroactively change the immutable rc.2 package.

These observations concern the emitted interactive terminal output, not pixels in the macOS
Terminal application, real login, real-model recall or the future consolidated O4 artifact.
Private transcripts and test profiles stay outside the repository.
