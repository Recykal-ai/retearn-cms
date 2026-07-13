// One-off migration: converts every already-uploaded docx/pptx (or legacy
// doc/ppt) DocumentVersion to a PDF preview, for docs uploaded before the
// office-preview feature existed (see lib/office-preview.ts). Without this,
// a pre-existing docx/pptx keeps routing through Google's external viewer —
// the exact "Open with Google Docs/Slides" escape hatch this feature was
// built to close — even though newly-uploaded ones are already fixed.
// Safe to re-run: only touches rows where previewS3Key is still null.
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { storage } from "../src/lib/storage.js";
import { isOfficePreviewCandidate, convertOfficeToPdf } from "../src/lib/office-preview.js";

const versions = await prisma.documentVersion.findMany({
  where: { sourceType: "FILE", s3Key: { not: null }, previewS3Key: null },
});

const candidates = versions.filter((v) => v.s3Key && isOfficePreviewCandidate(v.s3Key));
console.log(`Found ${candidates.length} office-format version(s) without a preview.`);

let converted = 0;
let failed = 0;

for (const version of candidates) {
  const s3Key = version.s3Key!;
  const filename = s3Key.split("/").pop()!;
  try {
    const { url } = await storage.getSignedUrl(s3Key);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());

    const pdf = await convertOfficeToPdf(buffer, filename);
    if (!pdf) {
      failed++;
      console.log(`  conversion failed: ${s3Key}`);
      continue;
    }

    const previewS3Key = `${s3Key}.preview.pdf`;
    await storage.save(previewS3Key, pdf);
    await prisma.documentVersion.update({ where: { id: version.id }, data: { previewS3Key } });

    // Keep Document.previewS3Key in sync when this is the doc's current version
    // (view-url reads from Document for the "current" case, DocumentVersion
    // for a specific past version — see routes/documents.ts).
    const doc = await prisma.document.findUnique({ where: { id: version.documentId } });
    if (doc && doc.currentVersion === version.version) {
      await prisma.document.update({ where: { id: doc.id }, data: { previewS3Key } });
    }

    converted++;
    console.log(`  converted: ${s3Key}`);
  } catch (err) {
    failed++;
    console.log(`  error on ${s3Key}: ${err instanceof Error ? err.message : err}`);
  }
}

console.log(`\nDone. Converted ${converted}, failed ${failed}, skipped 0 (already had a preview).`);
process.exit(0);
