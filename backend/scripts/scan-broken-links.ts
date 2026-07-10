// Scans every LINK document (and LINK version) for an externalUrl that
// doesn't look like an actual shareable Google Workspace document link
// (Sheets/Docs/Slides/Forms/Drive file) — catches copy-paste mistakes like
// pasting a Gmail inbox URL instead of the intended document's share link.
// Read-only: reports, doesn't fix anything.
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";

const RECOGNIZED = [
  /^https:\/\/docs\.google\.com\/spreadsheets\//,
  /^https:\/\/docs\.google\.com\/document\//,
  /^https:\/\/docs\.google\.com\/presentation\//,
  /^https:\/\/docs\.google\.com\/forms\//,
  /^https:\/\/drive\.google\.com\/(file|drive)\//,
];

function isRecognized(url: string): boolean {
  return RECOGNIZED.some((re) => re.test(url));
}

const docs = await prisma.document.findMany({
  where: { sourceType: "LINK", deletedAt: null },
  select: { id: true, title: true, externalUrl: true, uploadedBy: { select: { name: true, email: true } } },
});

const versions = await prisma.documentVersion.findMany({
  where: { sourceType: "LINK" },
  select: { documentId: true, version: true, externalUrl: true, document: { select: { title: true, deletedAt: true } } },
});

const brokenDocs = docs.filter((d) => d.externalUrl && !isRecognized(d.externalUrl));
const brokenVersions = versions.filter(
  (v) => v.externalUrl && !isRecognized(v.externalUrl) && !v.document.deletedAt,
);

console.log(`Checked ${docs.length} current LINK documents, ${versions.length} LINK versions.\n`);

if (brokenDocs.length === 0) {
  console.log("No suspicious current-version links found.");
} else {
  console.log(`${brokenDocs.length} document(s) with an unrecognized link:\n`);
  for (const d of brokenDocs) {
    console.log(`- "${d.title}" (${d.id})`);
    console.log(`  uploaded by: ${d.uploadedBy.name} <${d.uploadedBy.email}>`);
    console.log(`  url: ${d.externalUrl}\n`);
  }
}

const olderBroken = brokenVersions.filter((v) => !brokenDocs.some((d) => d.id === v.documentId));
if (olderBroken.length > 0) {
  console.log(`\n${olderBroken.length} older version(s) (not the current version) with an unrecognized link:\n`);
  for (const v of olderBroken) {
    console.log(`- "${v.document.title}" v${v.version} (doc ${v.documentId}): ${v.externalUrl}`);
  }
}

process.exit(0);
