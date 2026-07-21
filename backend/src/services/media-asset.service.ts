import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import type { MediaAsset, PrismaClient, XAccount } from "@prisma/client";
import { env } from "../config/env.js";
import { XClientService } from "./x-client.service.js";

const stillImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const imageTypes = new Set([...stillImageTypes, "image/gif"]);
const videoTypes = new Set(["video/mp4", "video/quicktime"]);
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_GIF_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 512 * 1024 * 1024;

export type MediaAssetInput = {
  filename: string;
  contentType: string;
  bytes: Buffer;
};

export class MediaAssetService {
  private readonly xClient: XClientService;

  constructor(private readonly prisma: PrismaClient) {
    this.xClient = new XClientService(prisma);
  }

  async create(xAccountId: string, input: MediaAssetInput) {
    assertUploadable(input.contentType, input.bytes.length);
    const id = randomUUID();
    const extension = safeExtension(input.filename, input.contentType);
    const storageKey = `${id}${extension}`;
    const destination = this.pathFor(storageKey);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, input.bytes, { flag: "wx" });

    try {
      return await this.prisma.mediaAsset.create({
        data: {
          id,
          xAccountId,
          storageKey,
          filename: safeFilename(input.filename),
          contentType: input.contentType,
          bytes: input.bytes.length
        }
      });
    } catch (error) {
      await rm(destination, { force: true });
      throw error;
    }
  }

  async list(xAccountId: string) {
    return this.prisma.mediaAsset.findMany({
      where: { xAccountId },
      orderBy: { createdAt: "desc" }
    });
  }

  async remove(id: string, xAccountId: string) {
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id, xAccountId } });
    if (!asset) return { ok: true };
    const queued = await this.prisma.scheduledPost.findMany({
      where: { xAccountId, status: { in: ["DRAFT", "SCHEDULED", "POSTING"] } },
      select: { id: true, media: true }
    });
    if (queued.some((post) => mediaAssetIds(post.media).includes(asset.id))) {
      throw new Error("This media asset is attached to a draft or scheduled post and cannot be deleted");
    }
    const articleCandidates = await this.prisma.scheduledArticle.findMany({
      where: {
        xAccountId,
        status: { in: ["DRAFT", "REVIEW", "SCHEDULED", "PUBLISHING"] }
      },
      select: { coverAssetId: true, contentState: true }
    });
    if (articleCandidates.some((article) => article.coverAssetId === asset.id || JSON.stringify(article.contentState).includes(asset.id))) {
      throw new Error("This media asset is attached to an Article draft or schedule and cannot be deleted");
    }
    await this.prisma.mediaAsset.delete({ where: { id: asset.id } });
    await rm(this.pathFor(asset.storageKey), { force: true });
    return { ok: true };
  }

  async uploadForPost(xAccount: XAccount, assetIds: string[]) {
    const { ids, assets } = await this.assetsFor(xAccount, assetIds);
    assertPostMediaMix(assets);

    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    const mediaIds: string[] = [];
    for (const id of ids) {
      const asset = byId.get(id);
      if (!asset) throw new Error("Media asset disappeared before it could be published");
      let file: Buffer;
      try {
        file = await readFile(this.pathFor(asset.storageKey));
      } catch {
        throw new Error(`Media file is missing: ${asset.filename}`);
      }
      mediaIds.push(await this.xClient.uploadMedia(xAccount, {
        data: file,
        filename: asset.filename,
        contentType: asset.contentType
      }));
    }
    return mediaIds;
  }

  async uploadForArticle(xAccount: XAccount, assetIds: string[]) {
    const { ids, assets } = await this.assetsFor(xAccount, assetIds);
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    const uploaded: Array<{ assetId: string; mediaId: string; mediaCategory: string }> = [];
    for (const id of ids) {
      const asset = byId.get(id);
      if (!asset) throw new Error("Media asset disappeared before it could be published");
      let file: Buffer;
      try { file = await readFile(this.pathFor(asset.storageKey)); }
      catch { throw new Error(`Media file is missing: ${asset.filename}`); }
      uploaded.push({
        assetId: asset.id,
        mediaId: await this.xClient.uploadMedia(xAccount, { data: file, filename: asset.filename, contentType: asset.contentType }),
        mediaCategory: mediaCategory(asset.contentType)
      });
    }
    return uploaded;
  }

  private async assetsFor(xAccount: XAccount, assetIds: string[]) {
    const ids = [...new Set(assetIds)];
    if (!ids.length) return { ids, assets: [] as MediaAsset[] };
    const assets = await this.prisma.mediaAsset.findMany({ where: { id: { in: ids }, xAccountId: xAccount.id } });
    if (assets.length !== ids.length) throw new Error("One or more selected media assets do not belong to this X account");
    return { ids, assets };
  }

  private pathFor(storageKey: string) {
    return join(mediaStorageRoot(), storageKey);
  }
}

function mediaAssetIds(value: unknown) {
  if (!value || typeof value !== "object" || !("assetIds" in value)) return [];
  const ids = (value as { assetIds?: unknown }).assetIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

export function assertUploadable(contentType: string, bytes: number) {
  if (!imageTypes.has(contentType) && !videoTypes.has(contentType)) {
    throw new Error("Quill supports JPEG, PNG, WebP, GIF, MP4, and MOV files");
  }
  const maximum = contentType === "image/gif" ? MAX_GIF_BYTES : stillImageTypes.has(contentType) ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (!Number.isInteger(bytes) || bytes <= 0 || bytes > maximum) {
    throw new Error(`${contentType.startsWith("image/") ? "Images" : "Videos"} exceed the supported file size limit`);
  }
}

export function assertPostMediaMix(assets: Pick<MediaAsset, "contentType">[]) {
  const images = assets.filter((asset) => stillImageTypes.has(asset.contentType));
  const moving = assets.filter((asset) => !stillImageTypes.has(asset.contentType));
  if (assets.length > 4) throw new Error("An X post can contain at most four images");
  if (moving.length > 1 || (moving.length && images.length)) {
    throw new Error("An X post may contain either up to four images, or one GIF/video");
  }
}

function mediaStorageRoot() {
  const configured = process.env.MEDIA_STORAGE_PATH;
  if (configured) return resolve(configured);
  const databasePath = env.DATABASE_URL.replace(/^file:/, "");
  const absoluteDbPath = isAbsolute(databasePath)
    ? databasePath
    : resolve(process.cwd(), databasePath);
  return join(dirname(absoluteDbPath), "media");
}

function safeFilename(value: string) {
  const file = basename(value).replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 160);
  return file || "upload";
}

function safeExtension(filename: string, contentType: string) {
  const original = extname(safeFilename(filename)).toLowerCase();
  if (original && /^\.[a-z0-9]{1,8}$/.test(original)) return original;
  return contentType === "image/jpeg" ? ".jpg" : contentType === "image/png" ? ".png" : contentType === "image/webp" ? ".webp" : contentType === "image/gif" ? ".gif" : contentType === "video/quicktime" ? ".mov" : ".mp4";
}

function mediaCategory(contentType: string) {
  if (contentType === "image/gif") return "tweet_gif";
  if (contentType.startsWith("video/")) return "tweet_video";
  return "tweet_image";
}
