import crypto from "crypto";
import { getCache, setCache } from "../../../utils/redis";
import { MESSAGE_TYPES } from "../constants/messageType.constants";
import { MessageType } from "../constants/messageType.constants";

const DEFAULT_DEDUPE_TTL = Number(
  process.env.NOTIFICATION_ERROR_DEDUPE_TTL_SECONDS ?? 300
);

const normalizeMessage = (message: unknown): string => {
  if (typeof message !== "string") {
    return String(message ?? "unknown");
  }
  return message.slice(0, 200);
};

const buildDedupeKey = (
  messageType: MessageType,
  context: Record<string, unknown>
): string => {
  const payload = JSON.stringify({
    messageType,
    source: context.source ?? "",
    path: context.path ?? "",
    message: normalizeMessage(context.message),
  });

  const hash = crypto.createHash("sha256").update(payload).digest("hex");
  return `notification:dedupe:${hash}`;
};

export const shouldSkipDuplicateNotification = async (
  messageType: MessageType,
  context: Record<string, unknown>
): Promise<boolean> => {
  if (messageType !== MESSAGE_TYPES.SYSTEM_ERROR) {
    return false;
  }

  const key = buildDedupeKey(messageType, context);
  const existing = await getCache<string>(key);
  if (existing) {
    return true;
  }

  await setCache(key, "1", DEFAULT_DEDUPE_TTL);
  return false;
};
