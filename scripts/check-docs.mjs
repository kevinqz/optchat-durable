import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import GithubSlugger from "github-slugger";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Include new, non-ignored documentation during local development as well as tracked files.
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  {
    cwd: root,
    encoding: "utf8",
  },
)
  .split("\0")
  .filter((file) => file.endsWith(".md") && existsSync(resolve(root, file)));
const cache = new Map();
const failures = [];
let checked = 0;

function textOf(tokens) {
  return tokens.map((token) => (token.tokens ? textOf(token.tokens) : (token.text ?? ""))).join("");
}

function document(path) {
  if (cache.has(path)) return cache.get(path);
  const tokens = marked.lexer(readFileSync(path, "utf8"));
  const slugger = new GithubSlugger();
  const anchors = new Set();
  const links = [];
  marked.walkTokens(tokens, (token) => {
    if (token.type === "heading") anchors.add(slugger.slug(textOf(token.tokens)));
    if (token.type === "link" || token.type === "image") links.push(token.href);
  });
  const parsed = { anchors, links };
  cache.set(path, parsed);
  return parsed;
}

for (const file of new Set(files)) {
  const path = resolve(root, file);
  for (const href of document(path).links) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) continue;
    try {
      const [location, fragment = ""] = href.split("#", 2);
      const destination = decodeURIComponent(location.split("?", 1)[0]);
      assert.ok(!isAbsolute(destination), "use a repository-relative path");
      let target = destination ? resolve(dirname(path), destination) : path;
      const within = relative(root, target);
      assert.ok(
        within !== ".." && !within.startsWith("../") && !isAbsolute(within),
        "link leaves the repository",
      );
      assert.ok(existsSync(target), "file does not exist");
      if (statSync(target).isDirectory()) target = resolve(target, "README.md");
      assert.ok(existsSync(target), "linked directory needs a README.md");
      if (fragment && target.endsWith(".md")) {
        assert.ok(
          document(target).anchors.has(decodeURIComponent(fragment)),
          "heading anchor does not exist",
        );
      }
      checked++;
    } catch (error) {
      failures.push(`${file}: ${href} — ${error.message}`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Checked ${new Set(files).size} Markdown files and ${checked} local links/anchors. Remote URLs are not fetched.`,
  );
}
