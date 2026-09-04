# areana-video

This repository is set up to use **ChatCut** for AI-assisted video editing and
creation. It vendors the public [ChatCut Agent Plugin](https://github.com/ChatCut-Inc/agent-plugin.git)
(marketplace metadata, Codex/Claude Code plugin packages, workflow skills, and
install documentation) so it can be registered and connected directly from this
repo.

With it connected you can ask an agent to:

- import local or attached media into a ChatCut project
- create / target a project timeline
- trim pauses, clean up talking-head video, add B-roll and overlays
- add captions / subtitles and transcribe audio
- create motion graphics and digital-human assets
- generate images, video, voice, music, sound effects, and shaders
- export renders and verify that edits are visible in the editor

## What's here

- `claude/` - Claude Code plugin package (skills + MCP server).
- `codex/` - Codex plugin package (skills + `.mcp.json`).
- `chatcut-desktop-codex-plugin/` - skill-only plugin that tells Codex how to
  install/open/connect the signed ChatCut Desktop app.
- `.claude-plugin/marketplace.json` - Claude Code plugin marketplace entry.
- `.agents/plugins/marketplace.json` - Codex/agent plugin marketplace entry.
- `docs/claude-code-install.md` - full Claude Code installation and handoff guide.

The hosted ChatCut MCP endpoint used by the plugin is:

```text
https://api.chatcut.io/api/external-mcp/mcp
```

## Requirements

- A [ChatCut](https://chatcut.io) account.
- Claude Code 2.x, or Codex with plugin/MCP support.
- A ChatCut project you want to edit.
- **FFmpeg / ffprobe** for media import. This repo intentionally does **not**
  vendor the ~115 MB compressed FFmpeg binaries from upstream, so the helper
  falls back to `ffmpeg` / `ffprobe` on `PATH` (see "FFmpeg note" below).

> Host gate: this repository is a source/config repo. If you are running in a
> web/remote workspace, you cannot install the plugin into your local machine's
> `~/.claude` or run the interactive ChatCut OAuth login from here. Run the steps
> below on the machine where you want to edit videos.

## Connect ChatCut from this repository

### Claude Code

```bash
# From this repo (a local marketplace and plugin source)
claude plugin marketplace add "$PWD"
claude plugin marketplace list
claude plugin install chatcut@chatcut-inc

# Authenticate the ChatCut MCP server
claude mcp login plugin:chatcut:chatcut

# Verify
claude mcp get plugin:chatcut:chatcut
claude plugin details chatcut@chatcut-inc
```

Follow the browser sign-in flow when it opens, then start a **new** Claude Code
conversation (plugins/tools are captured at session start). See
`docs/claude-code-install.md` for the full host gate, verification, and the
required "first editing conversation" handoff.

### Codex

Codex reads the plugin's `codex/.mcp.json`. Register/install the `chatcut`
plugin from this repo via the plugin marketplace at `.agents/plugins/marketplace.json`
(or the equivalent `codex` plugin flow), then authenticate and verify:

```bash
codex mcp login chatcut
codex mcp get chatcut
```

If the `chatcut` tools appear missing after login, the usual cause is that the
MCP server is not signed in yet — re-authenticate, then start a new session.

## FFmpeg note

The upstream plugin bundles compressed FFmpeg binaries for Apple Silicon (macOS)
and x64 Windows. Those binaries are **not** committed in this repo to keep it
light. The import helper resolves media tools in this order:

1. explicit `--ffmpeg` / `--ffprobe` arguments
2. `FFMPEG_PATH` / `FFPROBE_PATH` environment variables
3. bundled binaries (only present if you restore them from upstream)
4. `ffmpeg` / `ffprobe` on `PATH`

So install FFmpeg locally (e.g. `brew install ffmpeg` on macOS,
`winget install Gyan.FFmpeg` on Windows, or your distro's package manager). If
you need the upstream bundle, restore it from
`git clone https://github.com/ChatCut-Inc/agent-plugin.git` and copy the
`codex/skills/asset-import/scripts/ffmpeg/` directory back here.

## Example prompts

- `Import this video into my ChatCut project.`
- `Add a simple motion graphic overlay.`
- `Generate a voiceover and background music.`
- `Transcribe this clip and add captions.`
- `Export the current project.`

## Upstream

- Repository: <https://github.com/ChatCut-Inc/agent-plugin.git>
- Product: <https://chatcut.io>
