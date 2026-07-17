import "dotenv/config";
import express from "express";
import cors from "cors";
import { logger } from "./lib/logger.js";
import { authRouter } from "./routes/auth.js";
import { teamsRouter } from "./routes/teams.js";
import { productsRouter } from "./routes/products.js";
import { categoriesRouter } from "./routes/categories.js";
import { usersRouter } from "./routes/users.js";
import { documentsRouter } from "./routes/documents.js";
import { searchRouter } from "./routes/search.js";
import { filesRouter } from "./routes/files.js";
import { auditLogRouter } from "./routes/audit-log.js";
import { personalNotesRouter } from "./routes/personal-notes.js";
import { personalNoteFoldersRouter } from "./routes/personal-note-folders.js";
import { teamNotesRouter } from "./routes/team-notes.js";
import { teamNoteFoldersRouter } from "./routes/team-note-folders.js";
import { notificationsRouter } from "./routes/notifications.js";
import { noteImagesRouter } from "./routes/note-images.js";

const app = express();
const PORT = process.env.PORT ?? 4000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json());

app.use((req, _res, next) => {
  logger.info("request", { method: req.method, path: req.path });
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/teams", teamsRouter);
app.use("/api/products", productsRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/users", usersRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/search", searchRouter);
app.use("/api/audit-log", auditLogRouter);
app.use("/api/personal-notes", personalNotesRouter);
app.use("/api/personal-note-folders", personalNoteFoldersRouter);
app.use("/api/team-notes", teamNotesRouter);
app.use("/api/team-note-folders", teamNoteFoldersRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/note-images", noteImagesRouter);
app.use("/files", filesRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("unhandled error", { err: String(err) });
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  logger.info(`backend listening on http://localhost:${PORT}`);
});
