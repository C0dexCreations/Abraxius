const fs = require("fs");
const path = require("path");
const { loadProject, getScriptClassFromFile, stripScriptExtension } = require("./project");

function resolveStudioPath(projectDir, localFile) {
  const project = loadProject(projectDir);
  if (!project) throw new Error("No place.json found. Run `mcp pull` first.");

  const absoluteLocal = path.resolve(localFile);
  const absoluteProjectDir = path.resolve(projectDir);

  for (const [serviceName, node] of Object.entries(project.tree)) {
    if (!node || typeof node !== "object" || !node.$path) continue;
    const serviceLocalDir = path.resolve(absoluteProjectDir, node.$path);
    if (!absoluteLocal.startsWith(serviceLocalDir + path.sep)) continue;

    const relative = absoluteLocal.slice(serviceLocalDir.length + 1);
    const parts = relative.split(path.sep);

    // init.ext pattern: folder is the script
    if (parts[parts.length - 1].startsWith("init.")) {
      const scriptName = parts[parts.length - 2];
      const parentPath = parts.slice(0, -2).join(".");
      const studioPath = parentPath
        ? `game.${serviceName}.${parentPath}.${scriptName}`
        : `game.${serviceName}.${scriptName}`;
      return { studioPath, className: getScriptClassFromFile(parts[parts.length - 1]) };
    }

    // regular script file
    const fileName = parts[parts.length - 1];
    const className = getScriptClassFromFile(fileName);
    if (!className) throw new Error(`Not a recognized script file: ${fileName}`);
    const scriptName = stripScriptExtension(fileName);
    const parentPath = parts.slice(0, -1).join(".");
    const studioPath = parentPath
      ? `game.${serviceName}.${parentPath}.${scriptName}`
      : `game.${serviceName}.${scriptName}`;
    return { studioPath, className };
  }

  throw new Error(`File ${localFile} is not inside any mapped service in place.json`);
}

function extractScriptSource(readResult) {
  try {
    const text = readResult.content[0].text;
    return text
      .split("\n")
      .map((line) => {
        const arrow = line.indexOf("→");
        return arrow === -1 ? line : line.slice(arrow + 1);
      })
      .join("\n");
  } catch {
    return "";
  }
}

class Pusher {
  constructor(client, options = {}) {
    this.client = client;
    this.projectDir = options.projectDir || ".";
  }

  async push(localFile) {
    const { studioPath, className } = resolveStudioPath(this.projectDir, localFile);
    const newSource = fs.readFileSync(localFile, "utf8");

    const readResult = await this.client.call("script_read", {
      target_file: studioPath,
      should_read_entire_file: true,
    });
    const currentSource = extractScriptSource(readResult);

    if (currentSource === newSource) {
      return { changed: false, studioPath };
    }

    const result = await this.client.call("multi_edit", {
      file_path: studioPath,
      datamodel_type: "Edit",
      edits: [
        {
          old_string: currentSource,
          new_string: newSource,
        },
      ],
    });

    return { changed: true, studioPath, result };
  }
}

module.exports = { Pusher, resolveStudioPath };
