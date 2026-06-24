# CLI Reference

The `mcp` command is the main interface for managing the bridge and interacting with Roblox Studio.

## Daemon commands

| Command | Description |
|---|---|
| `start` | Start the bridge daemon in the background |
| `stop` | Stop the background bridge |
| `status` | Check daemon + Studio connection |
| `logs` | Tail daemon log file |

## Query commands

| Command | Description |
|---|---|
| `tools` | List available MCP tools |
| `state` | Get current studio state |
| `call <name> [json]` | Call a tool with JSON arguments |
| `execute <code>` | Execute Luau code in Studio |
| `repl` | Interactive tool-calling shell |

## Sync commands

| Command | Description |
|---|---|
| `pull [dir]` | Pull scripts into a local project (default: current directory) |
| `push <file>` | Push a local script file back to Studio |

## Examples

```bash
# Start the daemon
mcp start

# List tools
mcp tools

# Get studio state
mcp state

# Call a tool
mcp call search_game_tree '{"path":"Workspace","max_depth":2,"head_limit":20}'
mcp call script_read '{"target_file":"ServerScriptService.MatchManager","should_read_entire_file":true}'

# Execute Luau
mcp execute 'print(#game.Workspace:GetChildren())'

# Pull scripts into a project
mcp pull ./my-game

# Push an edited script back
mcp push ./my-game/src/ServerScriptService/MatchManager.server.luau
```
