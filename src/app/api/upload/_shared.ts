import "server-only";
import { NextResponse } from "next/server";
import type { Photo } from "@/domain/types";
import { AppError } from "@/server/errors";

export function errorResponse(err: unknown) {
  if (err instanceof AppError) return NextResponse.json({ error: err.messageKey }, { status: err.status });
  console.error("[upload] unexpected error", err);
  return NextResponse.json({ error: "generic" }, { status: 500 });
}

/** Reads `files` / `files[]` from a multipart body. */
export async function readFiles(req: Request): Promise<File[]> {
  const form = await req.formData();
  const entries = [...form.getAll("files"), ...form.getAll("files[]")];
  return entries.filter((e): e is File => typeof e !== "string" && typeof (e as File).arrayBuffer === "function");
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
