import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const files = [
  {
    file: "docs/README.md",
    title: "# VOKA Documentation",
    body: `
Welcome to the official VOKA documentation.

This folder contains the complete technical and product documentation.

Generated automatically.
`
  },
  {
    file: "docs/PROJECT_STATUS.md",
    title: "# Project Status",
    body: `
Current Sprint: 09A

Status: In Progress

Architecture:
- Clean Architecture
- DDD
- Prisma
- PostgreSQL
`
  },
  {
    file: "docs/ROADMAP.md",
    title: "# Roadmap",
    body: `
Sprint 09A
Sprint 09B
Sprint 10
`
  },
  {
    file: "docs/CTO_JOURNAL.md",
    title: "# CTO Journal",
    body: `
Architecture decisions are recorded here.
`
  }
];

const architectureDocs = [
"01_VISION",
"02_PRODUCT_PHILOSOPHY",
"03_ARCHITECTURE",
"04_AI_ENGINE",
"05_VOICE_ENGINE",
"06_DOCUMENT_ENGINE",
"07_MOBILE_APP",
"08_WEB_APP",
"09_DATABASE",
"10_API",
"11_SECURITY",
"12_BRANDING",
"13_MODULES",
"14_DASHBOARD",
"15_ROADMAP",
"16_CTO_DECISIONS",
"17_CHANGELOG",
"18_SPRINT_HISTORY",
"19_CODING_STANDARD",
"20_CONTRIBUTING"
];

for (const f of files) {
    const full = path.join(root, f.file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, `${f.title}

${f.body}`);
}

for (const name of architectureDocs) {

    const full = path.join(
        root,
        "docs",
        "architecture",
        `${name}.md`
    );

    fs.mkdirSync(path.dirname(full), { recursive: true });

    fs.writeFileSync(
        full,
`# ${name.replaceAll("_"," ")}

Status: Draft

This document will be completed during development.

`
    );
}

console.log("");
console.log("================================");
console.log("VOKA Documentation Generated");
console.log("================================");
