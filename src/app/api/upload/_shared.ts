import "server-only";
import { NextResponse } from "next/server";
import type { Photo } from "@/domain/types";
import { AppError, invalid, limitExceeded } from "@/server/errors";
import { getInstanceSettings } from "@/server/services/admin";
import { assertSameOrigin } from "@/server/sources/http-guard";

/** Max files per multipart request (the UI uploads one file per request). */
export const MAX_FILES_PER_REQUEST = 10;
const MULTIPART_OVERHEAD = 1024 * 1024;

/**
 * Cheap checks BEFORE the body is read (req.formData() buffers everything in memory):
 * same-origin, a declared Content-Length, and an upper bound derived from the instance limits.
 * Callers must run their authorisation checks before calling readFiles() as well.
 */
export async function preflight(req: Request): Promise<void> {
  assertSameOrigin(req);
  const declared = req.headers.get("content-length");
  if (!declared || !/^\d+$/.test(declared)) throw new AppError("validation", "lengthRequired");
  const { maxUploadMb } = await getInstanceSettings();
  const max = maxUploadMb * 1024 * 1024 * MAX_FILES_PER_REQUEST + MULTIPART_OVERHEAD;
  if (Number(declared) > max) throw limitExceeded("fileTooLarge");
}

export function errorResponse(err: unknown) {
  if (err instanceof AppError) {
    const status = err.messageKey === "lengthRequired" ? 411 : err.messageKey === "fileTooLarge" ? 413 : err.status;
    return NextResponse.json({ error: err.messageKey }, { status });
  }
  console.error("[upload] unexpected error", err);
  return NextResponse.json({ error: "generic" }, { status: 500 });
}

/** Reads `files` / `files[]` from a multipart body. */
export async function readFiles(req: Request): Promise<File[]> {
  const form = await req.formData();
  const entries = [...form.getAll("files"), ...form.getAll("files[]")];
  const files = entries.filter((e): e is File => typeof e !== "string" && typeof (e as File).arrayBuffer === "function");
  if (files.length > MAX_FILES_PER_REQUEST) throw invalid("tooManyFiles");
  return files;
}

/** Processes files sequentially (sharp is CPU heavy) and collects per-file errors. */
export async function ingestFiles(files: File[], add: (file: { data: Buffer; filename: string; contentType: string }) => Promise<Photo>) {
  const photos: { id: string }[] = [];
  const errors: { filename: string; error: string }[] = [];
  for (const f of files) {
    try {
      const photo = await add({ data: Buffer.from(await f.arrayBuffer()), filename: f.name, contentType: f.type });
      photos.push({ id: photo.id });
    } catch (err) {
      if (err instanceof AppError) errors.push({ filename: f.name, error: err.messageKey });
      else {
        console.error("[upload] file failed", err);
        errors.push({ filename: f.name, error: "generic" });
      }
    }
  }
  return { photos, errors };
}
