#!/usr/bin/env bash
#
# Set up ChatCut for Claude Code and/or Codex from this repository.
#
# Run this ON the machine where you want to edit videos (Claude Code desktop /
# Claude Code CLI terminal, or Codex with plugin support). A web/remote sandbox
# cannot install the plugin into your local machine's ~/.claude or open the
# ChatCut OAuth flow, so this script will not help there.
#
# Usage:
#   ./scripts/setup-chatcut.sh              # detect and use available hosts
#   HOST=claude ./scripts/setup-chatcut.sh  # force Claude Code setup
#   HOST=codex  ./scripts/setup-chatcut.sh  # force Codex setup
#   NO_LOGIN=1  ./scripts/setup-chatcut.sh  # install only, no OAuth login
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${HOST:-auto}"
NO_LOGIN="${NO_LOGIN:-0}"

log() { printf '\033[36m[chatcut]\033[0m %s\n' "$*"; }
err() { printf '\033[31m[chatcut]\033[0m %s\n' "$*" >&2; }

claude_install() {
  command -v claude >/dev/null 2>&1 || {
    err "claude CLI not found on PATH."
    return 1
  }

  log "Adding local ChatCut marketplace from $REPO_ROOT"
  claude plugin marketplace add "$REPO_ROOT"

  log "Installing chatcut@chatcut-inc"
  claude plugin install "chatcut@chatcut-inc"

  log "Current marketplaces:"
  claude plugin marketplace list

  if [[ "$NO_LOGIN" == "1" ]]; then
    log "Skipping OAuth login (NO_LOGIN=1)."
    log "Later run: claude mcp login plugin:chatcut:chatcut"
    return 0
  fi

  if [[ ! -t 0 ]]; then
    err "stdin is not a TTY; 'claude mcp login' needs an interactive terminal."
    err "Open an interactive terminal on your machine and run:"
    err "  claude mcp login plugin:chatcut:chatcut"
    return 1
  fi

  log "Opening ChatCut sign-in in your browser..."
  claude mcp login "plugin:chatcut:chatcut"
}

codex_install() {
  command -v codex >/dev/null 2>&1 || {
    err "codex CLI not found on PATH."
    return 1
  }

  log "Codex uses the plugin config at $REPO_ROOT/codex/.codex-plugin/plugin.json"
  log "and MCP config at $REPO_ROOT/codex/.mcp.json."
  log "Register/install the 'chatcut' plugin from the marketplace in"
  log "$REPO_ROOT/.agents/plugins/marketplace.json using your Codex plugin flow."

  if [[ "$NO_LOGIN" == "1" ]]; then
    log "Skipping OAuth login (NO_LOGIN=1)."
    log "Later run: codex mcp login chatcut"
    return 0
  fi

  log "Opening ChatCut sign-in in your browser..."
  codex mcp login "chatcut" || true

  log "Verify with:"
  log "  codex mcp get chatcut"
}

main() {
  case "$HOST" in
    auto)
      if command -v claude >/dev/null 2>&1; then
        log "Detected Claude Code"
        claude_install
      elif command -v codex >/dev/null 2>&1; then
        log "Detected Codex"
        codex_install
      else
        err "Neither 'claude' nor 'codex' was found on PATH."
        err "Run this script on a machine that has Claude Code 2.x or Codex installed."
        exit 1
      fi
      ;;
    claude) claude_install ;;
    codex)  codex_install ;;
    *)
      err "Unknown HOST '$HOST' (allowed: auto, claude, codex)."
      exit 2
      ;;
  esac
}

main "$@"
