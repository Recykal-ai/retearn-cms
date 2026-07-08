// Strips path separators and traversal sequences so an uploaded filename can
// never be used to write (or later read) outside its storage key's folder.
export function sanitizeFilename(name: string): string {
  const base = name.replace(/[/\\]/g, "_").replace(/\.\./g, "_");
  return base.trim() || "file";
}
