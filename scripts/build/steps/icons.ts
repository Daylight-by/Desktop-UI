// Icon extraction step

import fs from "fs";
import path from "path";
// preact-render-to-string doesn't work here: react-icons emits real React elements
// ($$typeof: Symbol(react.element)), not Preact VNodes, so we need the real React SSR renderer.
import { renderToStaticMarkup } from "real-react-dom/server";
import { ICONS_DIR, NODE_MODULES_DIR } from "../config.ts";

const LITE_ICON_SOURCE_DIRS = ["src", "libs/ui", "libs/core/src"];
const LITE_ICON_IGNORED_DIRS = new Set(["node_modules", "gen", "npm", "vendor", "target"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".svelte", ".html", ".json", ".yml", ".yaml"]);

function collectLiteIconNames(families: string[]): Set<string> {
  const names = new Set<string>();
  const prefixes = families
    .filter((family) => /^[a-z0-9]+$/i.test(family))
    .map((family) => family.charAt(0).toUpperCase() + family.slice(1));
  const iconPattern = new RegExp(`\\b(?:${prefixes.join("|")})[A-Z][A-Za-z0-9]*\\b`, "g");

  function scanDirectory(directory: string) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!LITE_ICON_IGNORED_DIRS.has(entry.name)) scanDirectory(path.join(directory, entry.name));
        continue;
      }
      if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
      const source = fs.readFileSync(path.join(directory, entry.name), "utf8");
      for (const match of source.matchAll(iconPattern)) names.add(match[0]);
    }
  }

  for (const directory of LITE_ICON_SOURCE_DIRS) scanDirectory(path.resolve(directory));
  return names;
}

/**
 * Extracts SVG icons from react-icons package and generates TypeScript types
 * This step only runs if the icons directory doesn't exist
 */
export async function extractIcons(): Promise<void> {
  if (fs.existsSync(ICONS_DIR)) {
    console.info("Icons already extracted, skipping...");
    return;
  }

  console.info("Extracting SVG Lazy Icons");
  console.time("Lazy Icons");

  fs.mkdirSync(ICONS_DIR, { recursive: true });

  let tsFile = "// This file is generated on build, do not edit.\nexport type IconName =";
  const reactIconsPath = path.join(NODE_MODULES_DIR, "react-icons");
  const entries = fs.readdirSync(reactIconsPath);
  const liteMode = process.env.SEELEN_LITE_ICONS === "1";
  const iconNames = liteMode
    ? collectLiteIconNames(entries.filter((entry) => entry !== "lib"))
    : null;

  if (iconNames) {
    console.info(`Lite icon mode: retaining ${iconNames.size} referenced icons`);
  }

  for (const entry of entries) {
    const entryPath = path.join(reactIconsPath, entry);
    const isDir = fs.statSync(entryPath).isDirectory();

    if (!isDir || entry === "lib") {
      continue;
    }

    console.info(`Extracting icon family: ${entry}`);

    const family = await import(`react-icons/${entry}`);
    for (const [name, ElementConstructor] of Object.entries(family)) {
      if (iconNames && !iconNames.has(name)) continue;
      if (typeof ElementConstructor !== "function") {
        continue;
      }
      const element = ElementConstructor({ size: "1em" });
      const svg = renderToStaticMarkup(element);
      if (!svg.startsWith("<svg")) {
        throw new Error(`Invalid SVG: ${svg}`);
      }
      fs.writeFileSync(path.join(ICONS_DIR, `${name}.svg`), svg);
    }

    tsFile += `\n  | keyof typeof import("react-icons/${entry}")`;
  }

  tsFile += ";\n";
  fs.writeFileSync("./libs/ui/icons.ts", tsFile);

  console.timeEnd("Lazy Icons");
}
