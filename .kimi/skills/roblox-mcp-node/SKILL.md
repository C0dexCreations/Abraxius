# Roblox Studio MCP Tool Skill

This skill focuses on using the **Roblox Studio MCP (Model Context Protocol) server** exposed over WebSocket. It documents the available tools, their schemas, common workflows, and best practices for controlling and querying Roblox Studio programmatically.

## What it is

Roblox Studio exposes an MCP server on `ws://localhost:13469/studio`. The studio-side MCP server provides tools to:

- Read and edit scripts
- Explore the DataModel hierarchy
- Execute Luau code
- Search scripts and instances
- Insert assets and generate models/materials/meshes
- Capture the screen, send input, and control play mode
- Fetch allowed Roblox documentation URLs

The bridge in this repo (`bridge.js` / `server.js`) connects to that WebSocket and exposes the same tools over a local HTTP API / CLI.

## Tool categories

| Category | Tools |
|---|---|
| **Scripts** | `script_read`, `multi_edit`, `script_search`, `script_grep`, `execute_luau` |
| **Tree / Instances** | `search_game_tree`, `inspect_instance` |
| **Studio state** | `get_studio_state`, `start_stop_play`, `get_console_output` |
| **Assets & AI** | `search_asset`, `insert_asset`, `generate_procedural_model`, `generate_mesh`, `generate_material`, `upload_image`, `store_image`, `wait_job_finished` |
| **Input & capture** | `screen_capture`, `user_mouse_input`, `user_keyboard_input`, `character_navigation` |
| **Docs** | `http_get`, `skill` |
| **Agents** | `subagent` |

## Critical concepts

### DataModel types

Many tools require a `datamodel_type` argument. Always call `get_studio_state` first to see which are available.

| Value | Meaning |
|---|---|
| `Edit` | Edit mode (default for most script editing) |
| `Client` | Client play mode (LocalScripts, player input, character nav) |
| `Server` | Server play mode |

Use `start_stop_play` to switch modes when needed.

### Path notation

Script/instance paths use dot notation starting from a service:

```
game.ServerScriptService.MatchManager
game.ReplicatedStorage.Knife.Util.Hooks.GetPlayerFromPart
game.Workspace.Lobby2.ObbyConveyer.ConveyorVelocity
```

`script_read` accepts paths both with and without the leading `game.`.

## Script tools

### `get_studio_state`

No arguments. Returns current mode and available DataModels.

```json
{}
```

Always call this before operations that depend on `datamodel_type`.

### `script_read`

Reads a script with line numbers.

```json
{
  "target_file": "game.ServerScriptService.MatchManager",
  "should_read_entire_file": true
}
```

To read a range:

```json
{
  "target_file": "game.ServerScriptService.MatchManager",
  "should_read_entire_file": false,
  "start_line_one_indexed": 10,
  "end_line_one_indexed_inclusive": 30
}
```

The response text format is `LINE_NUMBER→LINE_CONTENT`. Strip the prefix if you need raw source.

### `multi_edit`

Applies one or more string replacements to a single script atomically.

```json
{
  "file_path": "game.ServerScriptService.MatchManager",
  "datamodel_type": "Edit",
  "edits": [
    {
      "old_string": "local MAX_PLAYERS = 8",
      "new_string": "local MAX_PLAYERS = 12"
    },
    {
      "old_string": "-- old comment",
      "new_string": "-- new comment",
      "replace_all": true
    }
  ]
}
```

Rules:
- `old_string` must match exactly, including whitespace and indentation.
- `old_string` and `new_string` must differ.
- All edits are applied in order on the result of the previous edit.
- If the script does not exist and `className` is provided, it is created.

To create a new script:

```json
{
  "file_path": "game.ServerScriptService.NewSystem",
  "datamodel_type": "Edit",
  "className": "Script",
  "edits": [
    {
      "old_string": "",
      "new_string": "print('new script')\n"
    }
  ]
}
```

### `script_search`

Fuzzy search script names.

```json
{ "keywords": "knife, manager" }
```

### `script_grep`

Search script contents. Results capped at 50 matches.

```json
{ "query": "RemoteEvent" }
```

### `execute_luau`

Run arbitrary Luau. Returns the result of the last expression or `nil`.

```json
{
  "code": "return game.Workspace:GetChildren()",
  "datamodel_type": "Edit"
}
```

Useful for quick introspection:

```json
{
  "code": "for _, s in ipairs(game.ServerScriptService:GetChildren()) do print(s.Name, s.ClassName) end",
  "datamodel_type": "Edit"
}
```

## Tree and instance tools

### `search_game_tree`

Explore the hierarchy with flat JSON output.

```json
{
  "path": "Workspace",
  "max_depth": 2,
  "head_limit": 50,
  "instance_type": "BasePart"
}
```

Parameters:
- `path` — starting path, e.g. `Workspace`, `ServerScriptService`, `ReplicatedStorage.Packages`
- `max_depth` — 1 to 10
- `head_limit` — max results (default 200)
- `instance_type` — filter by ClassName via `IsA()` (e.g. `BaseScript`, `Model`, `Folder`)
- `keywords` — comma/space separated name filters

Use `instance_type: "BaseScript"` or `"Script"` / `"LocalScript"` / `"ModuleScript"` to find scripts efficiently.

### `inspect_instance`

Get properties, attributes, and children summary for a specific instance.

```json
{ "path": "Workspace.Lobby2.ObbyConveyer" }
```

## Studio control tools

### `start_stop_play`

```json
{ "is_start": true }
{ "is_start": false }
```

Use this to switch between Edit, Client, and Server contexts. After switching, verify with `get_studio_state`.

### `get_console_output`

No arguments. Returns recent Studio output log text.

```json
{}
```

## Asset and AI generation tools

### `search_asset`

Search the Creator Store or inventory.

```json
{
  "query": "knife",
  "assetType": "Model",
  "maxResults": 10
}
```

### `insert_asset`

Insert an asset by numeric ID.

```json
{
  "assetId": "12345678",
  "assetName": "CoolKnife",
  "assetType": "Model",
  "parentPath": "game.Workspace"
}
```

### `generate_procedural_model`

Generate a model from primitives.

```json
{
  "prompt": "A simple car with body, 4 wheels, and a door. Expose wheel count and body color as attributes.",
  "partNames": "body, front left wheel, front right wheel, rear left wheel, rear right wheel, door"
}
```

Attach an image by first calling `store_image` and passing the returned `IMAGEID_<id>` URI.

### `generate_mesh`

Generate a textured mesh from a prompt.

```json
{
  "textPrompt": "a low-poly treasure chest",
  "size": { "x": 4, "y": 3, "z": 2 },
  "maxTriangles": 2000
}
```

### `generate_material`

Generate a MaterialVariant.

```json
{
  "baseMaterial": "Metal",
  "materialDescription": "scratched brushed steel",
  "materialPattern": "Regular",
  "materialId": "my_steel_01"
}
```

Returns a BaseMaterial + MaterialVariant name that must be assigned to a BasePart's `Material` and `MaterialVariant` properties.

## Input and capture tools

### `screen_capture`

```json
{
  "capture_id": "screen_1",
  "camera_position": [10, 10, 10],
  "look_at_position": [0, 0, 0]
}
```

Omit camera params to capture from the current viewport.

### `user_mouse_input`

```json
{
  "datamodel_type": "Client",
  "actions": [
    { "action": "moveTo", "x": 100, "y": 200 },
    { "action": "mouseButtonClick", "mouse_button": "left" }
  ]
}
```

### `user_keyboard_input`

```json
{
  "datamodel_type": "Client",
  "actions": [
    { "action": "keyPress", "key": "Space" },
    { "action": "textInput", "text": "hello" },
    { "action": "wait", "duration_ms": 500 }
  ]
}
```

### `character_navigation`

```json
{
  "datamodel_type": "Client",
  "x": 10,
  "y": 0,
  "z": 10,
  "speed_multiplier": 1.5
}
```

Or navigate to an instance:

```json
{
  "datamodel_type": "Client",
  "instance_path": "game.Workspace.SpawnLocation"
}
```

## Documentation tools

### `http_get`

Fetches allowed Roblox documentation URLs. Allowed patterns:

- `https://create.roblox.com/docs/reference/engine/**/*.md`
- `https://create.roblox.com/docs/cloud/**/*.md`
- `https://create.roblox.com/docs/performance-optimization/**/*.md`
- `https://github.com/Roblox/libmp/**/*.md`

```json
{
  "url": "https://create.roblox.com/docs/reference/engine/classes/Part.md",
  "query": "Anchored",
  "context_lines": 5
}
```

### `skill`

Retrieve reference material for a Roblox skill.

```json
{ "skill_name": "ui" }
```

## Common workflows

### Edit a script safely

1. `get_studio_state` — confirm Edit mode.
2. `script_read` — get current source.
3. `multi_edit` — apply targeted changes.
4. `script_read` again or `get_console_output` to verify.

### Find all scripts under a service

```json
{
  "path": "ReplicatedStorage",
  "instance_type": "ModuleScript",
  "max_depth": 10,
  "head_limit": 1000
}
```

Repeat for `Script` and `LocalScript`.

### Execute Luau to inspect state

```json
{
  "code": "return game:GetService('Players'):GetPlayers()",
  "datamodel_type": "Edit"
}
```

### Create a new script

```json
{
  "file_path": "game.ServerScriptService.NewModule",
  "datamodel_type": "Edit",
  "className": "ModuleScript",
  "edits": [
    {
      "old_string": "",
      "new_string": "local NewModule = {}\n\nreturn NewModule\n"
    }
  ]
}
```

### Run play-mode tests

1. `start_stop_play` with `is_start: true`
2. `get_studio_state` to confirm Client/Server availability
3. Use `execute_luau` with `datamodel_type: "Client"` or `"Server"`
4. `start_stop_play` with `is_start: false` to return to Edit

## Best practices

1. **Always check `get_studio_state`** before operations that require a specific `datamodel_type`.
2. **Use targeted `multi_edit` old_string values** rather than full-file replacements when possible; it avoids accidental overwrites if the script changed.
3. **Read before editing** — script contents can change between calls.
4. **Use `search_game_tree` with filters** (`instance_type`, `keywords`) to avoid huge outputs.
5. **Prefer `script_search` or `script_grep`** over tree traversal when looking for specific scripts or patterns.
6. **Use `execute_luau` for one-off introspection** instead of editing scripts.
7. **When generating models/meshes/materials**, call `wait_job_finished` with the returned `generationId` if the tool returns one.

## Pitfalls

- **Path case sensitivity**: `ServerScriptService` is not the same as `ServerScriptservice`.
- **`datamodel_type` mismatch**: `multi_edit` only accepts `Edit`; `execute_luau` accepts `Edit`, `Client`, `Server`; `character_navigation` only accepts `Client`.
- **`multi_edit` exact matching**: a single character mismatch causes the edit to fail.
- **Head limits**: `search_game_tree` caps output; use `instance_type` filters or increase `head_limit` up to 1000.
- **Workspace size**: querying `Workspace` without filters can return hundreds of Parts. Filter by `instance_type` or `keywords`.
- **Script output**: `execute_luau` returns the last expression value, not `print` output. Use `get_console_output` to see prints.

## Tool reference summary

| Tool | Required params | Notes |
|---|---|---|
| `get_studio_state` | — | Always call first |
| `script_read` | `target_file` | Returns line-numbered text |
| `multi_edit` | `file_path`, `edits`, `datamodel_type` | `datamodel_type: "Edit"` |
| `execute_luau` | `code`, `datamodel_type` | Returns last expression |
| `search_game_tree` | — | Use `path`, `max_depth`, `instance_type`, `head_limit` |
| `inspect_instance` | `path` | Properties + children summary |
| `script_search` | `keywords` | Fuzzy name search |
| `script_grep` | `query` | Content search, max 50 results |
| `start_stop_play` | `is_start` | Switch play mode |
| `insert_asset` | `assetId` | Optional `parentPath`, `assetType` |
| `generate_procedural_model` | `prompt` | Optional `partNames`, `attachedImageUri` |
| `generate_mesh` | `textPrompt` | Optional `size`, `maxTriangles`, `partNames` |
| `generate_material` | `baseMaterial`, `materialDescription`, `materialPattern`, `materialId` | Returns material name |
| `screen_capture` | `capture_id` | Optional camera params |
| `character_navigation` | `datamodel_type` | `Client` only |
