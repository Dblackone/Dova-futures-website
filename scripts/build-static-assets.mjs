import { readFile, writeFile, cp, mkdir, rm } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
const root = process.cwd(),
  output = resolve(root, "dist");
if (dirname(output) !== root || !output.endsWith("dist"))
  throw new Error("Unsafe build output");
await rm(output, { recursive: true, force: true });
for (const dir of ["assets/media", "data", "_pages", "vollmann"])
  await mkdir(resolve(output, dir), { recursive: true });
const read = (path) => readFile(path, "utf8");
const write = (path, text) => writeFile(resolve(output, path), text);
const projects = JSON.parse(await read("data/projects.json")).filter(
  (p) => p.published !== false,
);
const aliases = JSON.parse(await read("data/project-aliases.json"));
const hash = (data) =>
  createHash("sha256").update(data).digest("hex").slice(0, 12);
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let html = await read("index.html"),
  card = await read("vollmann/index.html");
const css = await read("site.css"),
  images = {},
  sources = new Set(projects.flatMap((p) => [p.coverImage, ...p.gallery]));
for (const text of [html, card, css])
  for (const m of text.matchAll(
    /(?:src=["']|url\(["']?)([^"')]+\.(?:png|jpe?g|webp))/gi,
  )) {
    const path = decodeURIComponent(
      m[1].replace(/^\.\.\//, "").replace(/^\//, ""),
    );
    if (path.startsWith("assets/")) sources.add(path);
  }
for (const path of sources) {
  const absolute = resolve(root, path),
    assets = resolve(root, "assets");
  if (!absolute.startsWith(assets + "/") && !absolute.startsWith(assets + "\\"))
    throw new Error("Invalid asset path");
  const buffer = await readFile(absolute),
    variants = [];
  for (const width of [480, 800, 1280]) {
    const result = await sharp(buffer)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer({ resolveWithObject: true });
    if (variants.some((v) => v.width === result.info.width)) continue;
    const src =
      "/assets/media/" + hash(result.data) + "-" + result.info.width + ".webp";
    await write(src.slice(1), result.data);
    variants.push({
      src,
      width: result.info.width,
      height: result.info.height,
    });
  }
  images[path] = {
    ...variants.at(-1),
    srcset: variants.map((v) => v.src + " " + v.width + "w").join(", "),
  };
}
const imageTag = (path, alt) => {
  const i = images[path];
  return (
    '<img src="' +
    i.src +
    '" srcset="' +
    i.srcset +
    '" sizes="(max-width:600px) 100vw, (max-width:1000px) 50vw, 640px" width="' +
    i.width +
    '" height="' +
    i.height +
    '" alt="' +
    esc(alt) +
    '" loading="lazy" decoding="async" />'
  );
};
const projectCard = (p) =>
  '<a class="project-card project-item" data-project="' +
  p.id +
  '" data-category="' +
  p.category +
  '" href="/?project=' +
  p.id +
  '" aria-label="View ' +
  esc(p.title) +
  '">' +
  imageTag(p.coverImage, p.title) +
  '<span class="project-card-copy"><span class="tag">' +
  p.category +
  "</span><h3>" +
  esc(p.title) +
  "</h3><p>" +
  esc(p.location) +
  "</p></span></a>";
html = html
  .replace("<!-- PROJECT_GRID -->", projects.map(projectCard).join(""))
  .replace(
    "<!-- FEATURED_PROJECTS -->",
    projects
      .filter((p) => p.featured)
      .slice(0, 3)
      .map(projectCard)
      .join(""),
  );
function replaceImages(text) {
  return text.replace(/<img\b[^>]*>/gi, (tag) => {
    const m = tag.match(/src="([^"]+)"/);
    if (!m) return tag;
    const path = decodeURIComponent(
        m[1].replace(/^\.\.\//, "").replace(/^\//, ""),
      ),
      i = images[path];
    if (!i) return tag;
    return tag
      .replace(
        /\s(?:src|srcset|sizes|width|height|loading|decoding)="[^"]*"/g,
        "",
      )
      .replace(
        /\s*\/?>$/,
        ' src="' +
          i.src +
          '" srcset="' +
          i.srcset +
          '" sizes="100vw" width="' +
          i.width +
          '" height="' +
          i.height +
          '" decoding="async" loading="' +
          (/hero|logo/i.test(tag) ? "eager" : "lazy") +
          '" />',
      );
  });
}
html = replaceImages(html);
card = replaceImages(card);
let cardScript = "";
card = card.replace(/<script>([\s\S]*?)<\/script>/g, (_m, s) => {
  cardScript += s;
  return '<script src="/card.js" defer></script>';
});
card = card.replace(
  "</style>",
  ".contact-copy > p { color: var(--color-accent-ink); }\n.contact .eyebrow { color: #fff; }\n</style>",
);
const code = {
  "site.js": await read("site.js"),
  "card.js": cardScript,
  "site.css": css,
  "hallmark.css": await read("hallmark.css"),
  "tokens.css": await read("tokens.css"),
};
for (const [file, text] of Object.entries(code)) {
  const ext = extname(file),
    name = file.slice(0, -ext.length) + "." + hash(text) + ext;
  await write(name, text);
  html = html.replaceAll(file, name);
  card = card.replaceAll(file, name);
}
await write(
  "data/projects.js",
  "const PROJECTS = " +
    JSON.stringify(projects) +
    ";\nconst PROJECT_ALIASES = " +
    JSON.stringify(aliases) +
    ";",
);
await write(
  "data/images.js",
  "const IMAGE_MANIFEST = " + JSON.stringify(images) + ";",
);
// Copy only linked public support files, never entire source directories.
const copied = new Set();
for (const text of [html, card, ...Object.values(code)])
  for (const m of text.matchAll(
    /(?:src=|href=)["']([^"']+)["']|url\(["']?([^"')]+)["']?\)/g,
  )) {
    const path = decodeURIComponent((m[1] || m[2]).split("?")[0])
      .replace(/^\.\.\//, "")
      .replace(/^\//, "");
    if (
      !/^(assets|vollmann)\//.test(path) ||
      !/\.(png|svg|ico|webp|jpe?g|woff2?|vcf|pdf|css)$/i.test(path) ||
      path.startsWith("assets/media/") ||
      copied.has(path)
    )
      continue;
    copied.add(path);
    await mkdir(dirname(resolve(output, path)), { recursive: true });
    await cp(resolve(root, path), resolve(output, path));
  }
for (const path of [
  "vollmann/og-vollmann.png",
  "vollmann/qr-vollmann.svg",
  "vollmann/vollmann-akarakiri.vcf",
]) {
  if (copied.has(path)) continue;
  copied.add(path);
  await mkdir(dirname(resolve(output, path)), { recursive: true });
  await cp(resolve(root, path), resolve(output, path));
}
await write("vollmann/index.html", card);
await write("index.html", html);
function metadata(text, title, description, url, image) {
  text = text.replace(
    /<title>[\s\S]*?<\/title>/,
    "<title>" + esc(title) + "</title>",
  );
  text = text
    .replace(
      /(<meta\s+name="description"\s+content=")[^"]*/,
      "$1" + esc(description),
    )
    .replace(/(<link rel="canonical" href=")[^"]*/, "$1" + esc(url));
  for (const [key, value] of Object.entries({ title, description, url, image }))
    text = text.replace(
      new RegExp('(<meta\\s+property="og:' + key + '"\\s+content=")[^"]*'),
      "$1" + esc(value),
    );
  return text;
}
function activate(text, name) {
  return text
    .replace(
      'id="page-home" class="page active"',
      'id="page-home" class="page"',
    )
    .replace(
      'id="page-' + name + '" class="page"',
      'id="page-' + name + '" class="page active"',
    );
}
for (const p of projects) {
  let page = activate(
    metadata(
      html,
      p.title + " | Dova Futures",
      p.summary,
      "https://dovafutures.com/?project=" + p.id,
      "https://dovafutures.com" + images[p.coverImage].src,
    ),
    "projects",
  );
  page = page.replace(
    '<div class="projects-grid" id="projectsGrid">',
    '<article class="server-project"><h2>' +
      esc(p.title) +
      "</h2><p>" +
      esc(p.summary) +
      "</p><p>" +
      esc(p.location + " · " + p.deliveryType + " · " + p.status) +
      '</p></article><div class="projects-grid" id="projectsGrid">',
  );
  await write("_pages/" + p.id + ".html", page);
}
const pages = [
  "home",
  "about",
  "services",
  "projects",
  "process",
  "why",
  "contact",
];
for (const name of pages) {
  const page = activate(
    metadata(
      html,
      name === "home"
        ? "Dova Futures Developers | Design-build construction in Nigeria"
        : name[0].toUpperCase() + name.slice(1) + " | Dova Futures",
      "Integrated architecture, construction and interior finishing across Nigeria.",
      "https://dovafutures.com/" + (name === "home" ? "" : "?page=" + name),
      "https://dovafutures.com" +
        images["assets/optimized/hero-hillside.webp"].src,
    ),
    name,
  );
  await write("_pages/page-" + name + ".html", page);
}
await cp("static/privacy.html", resolve(output, "privacy.html"));
const urls = [
  "/",
  "/vollmann/",
  "/privacy.html",
  ...pages.filter((p) => p !== "home").map((p) => "/?page=" + p),
  ...projects.map((p) => "/?project=" + p.id),
];
await write(
  "sitemap.xml",
  '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    urls
      .map(
        (p) =>
          "<url><loc>" + esc("https://dovafutures.com" + p) + "</loc></url>",
      )
      .join("") +
    "</urlset>",
);
await write(
  "robots.txt",
  "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /_pages/\nSitemap: https://dovafutures.com/sitemap.xml\n",
);
const hashes = [
  ...card.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
  ),
].map(
  (m) => "'sha256-" + createHash("sha256").update(m[1]).digest("base64") + "'",
);
await write(
  "_headers",
  (await read("static/_headers")).replace(
    "__SCRIPT_HASHES__",
    hashes.join(" "),
  ),
);
console.log(
  "Built " +
    projects.length +
    " projects and " +
    sources.size +
    " responsive image sets.",
);
