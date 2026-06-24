const fs = require("fs");
const path = require("path");

const SCRIPT_EXTENSIONS = {
  Script: ".server.luau",
  LocalScript: ".client.luau",
  ModuleScript: ".luau",
};

const EXTENSION_TO_CLASS = Object.fromEntries(
  Object.entries(SCRIPT_EXTENSIONS).map(([k, v]) => [v, k]),
);

function getScriptExtension(className) {
  return SCRIPT_EXTENSIONS[className] || null;
}

function getScriptClassFromFile(fileName) {
  for (const [ext, cls] of Object.entries(EXTENSION_TO_CLASS)) {
    if (fileName.endsWith(ext)) return cls;
  }
  return null;
}

function stripScriptExtension(name) {
  for (const ext of Object.keys(EXTENSION_TO_CLASS)) {
    if (name.endsWith(ext)) return name.slice(0, -ext.length);
  }
  return name;
}

function isScriptClass(className) {
  return className in SCRIPT_EXTENSIONS;
}

function loadProject(projectDir) {
  const placePath = path.join(projectDir, "place.json");
  if (!fs.existsSync(placePath)) return null;
  return JSON.parse(fs.readFileSync(placePath, "utf8"));
}

function saveProject(projectDir, project) {
  const placePath = path.join(projectDir, "place.json");
  fs.writeFileSync(placePath, JSON.stringify(project, null, 2));
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sanitizeFileName(name) {
  // Remove characters that are illegal or problematic on Windows/Unix
  return name.replace(/[\\/:*?"<>|]/g, "_");
}

module.exports = {
  SCRIPT_EXTENSIONS,
  EXTENSION_TO_CLASS,
  getScriptExtension,
  getScriptClassFromFile,
  stripScriptExtension,
  isScriptClass,
  loadProject,
  saveProject,
  ensureDir,
  sanitizeFileName,
};
