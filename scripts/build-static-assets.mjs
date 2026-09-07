import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const output = resolve(root, "dist");
const files = ["index.html", "hallmark.css", "tokens.css"];
const directories = ["assets", "data", "vollmann"];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all([
  ...files.map((file) => cp(resolve(root, file), resolve(output, file))),
  ...directories.map((directory) =>
    cp(resolve(root, directory), resolve(output, directory), {
      recursive: true,
    }),
  ),
  cp(resolve(root, "static", "_headers"), resolve(output, "_headers")),
]);
