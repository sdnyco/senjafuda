import { publicId } from "./public-id";

export function exportIdSalt(): string {
  const salt = process.env.EXPORT_ID_SALT;
  if (!salt) {
    throw new Error("EXPORT_ID_SALT is required to derive public_id");
  }
  return salt;
}

export function visitPublicId(visitId: string): string {
  return publicId(visitId, exportIdSalt());
}
