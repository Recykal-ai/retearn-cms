// pdf.js needs its worker file served as a static asset — copying it into
// public/ at install time means it survives a fresh `npm install` on Vercel
// without us having to hand-maintain a checked-in copy.
import { copyFile, mkdir } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, "../node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
const destDir = join(__dirname, "../public");
const dest = join(destDir, "pdf.worker.min.mjs");

await mkdir(destDir, { recursive: true });
await copyFile(src, dest);
console.log("copied pdf.worker.min.mjs to public/");
