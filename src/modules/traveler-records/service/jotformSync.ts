import { Types } from "mongoose";
import TravelerRecord from "../model/travelerRecord.model";
import logger from "../../../utils/logger";

const DEFAULT_API_BASE = "https://api.jotform.com";
const PAGE_SIZE = 1000;

/** Question ids from the "Trekkers Information Form" (GET /form/{id}/questions). */
const Q = {
  trekkingArea: "5",
  bookingDate: "6",
  departureDate: "7",
  name: "8",
  gender: "10",
  dateOfBirth: "11",
  nationality: "13",
  passportNumber: "15",
  idNumber: "20",
  insurancePolicy: "21",
  insuranceCompany: "30",
  insuranceOther: "31",
  porterGuide: "54",
  whatsapp: "56",
  email: "59",
} as const;

export type JotformRecordInput = {
  _id: Types.ObjectId | string;
  firstName?: string;
  lastName?: string;
  givenNames?: string;
  surname?: string;
  fullName?: string;
  gender?: string;
  sex?: string;
  nationality?: string;
  dateOfBirth?: Date | null;
  passportNumber?: string;
  idNumber?: string;
  trekkingRegion?: string;
  trekkingRoute?: string;
  bookingDate?: Date | null;
  departureDate?: Date | null;
  insurancePolicyNumber?: string;
  insuranceCompany?: string;
  insuranceCompanyOther?: string;
  whatsappNumber?: string;
  email?: string;
  porterGuideName?: string;
  jotform?: { status?: string; submissionId?: string } | null;
};

type JotformConfig = { apiKey: string; formId: string; base: string };

/** null when JOTFORM_API_KEY or JOTFORM_FORM_ID is unset: syncing is disabled. */
export function jotformConfig(): JotformConfig | null {
  const apiKey = process.env.JOTFORM_API_KEY?.trim();
  const formId = process.env.JOTFORM_FORM_ID?.trim();
  if (!apiKey || !formId) return null;
  const base = (process.env.JOTFORM_API_BASE?.trim() || DEFAULT_API_BASE).replace(/\/+$/, "");
  return { apiKey, formId, base };
}

/** Dates are stored at UTC midnight for the picked calendar day. */
function dateParts(value?: Date | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const [year, month, day] = d.toISOString().slice(0, 10).split("-");
  return { day, month, year };
}

function splitName(r: JotformRecordInput) {
  const first = r.firstName || r.givenNames;
  const last = r.lastName || r.surname;
  if (first || last) return { first, last };
  const parts = (r.fullName || "").trim().split(/\s+/);
  return {
    first: parts.slice(0, -1).join(" ") || parts[0],
    last: parts.length > 1 ? parts[parts.length - 1] : undefined,
  };
}

export function buildSubmission(r: JotformRecordInput): URLSearchParams {
  const form = new URLSearchParams();
  const set = (key: string, value?: string | null) => {
    if (value?.trim()) form.append(`submission[${key}]`, value.trim());
  };
  const setDate = (qid: string, value?: Date | null) => {
    const parts = dateParts(value);
    if (!parts) return;
    set(`${qid}][day`, parts.day);
    set(`${qid}][month`, parts.month);
    set(`${qid}][year`, parts.year);
  };

  // Dynamic dropdown without a separator: one value per line.
  set(Q.trekkingArea, [r.trekkingRegion, r.trekkingRoute].filter(Boolean).join("\n"));
  setDate(Q.bookingDate, r.bookingDate);
  setDate(Q.departureDate, r.departureDate);
  const name = splitName(r);
  set(`${Q.name}][first`, name.first);
  set(`${Q.name}][last`, name.last);
  set(Q.gender, r.gender || r.sex);
  setDate(Q.dateOfBirth, r.dateOfBirth);
  set(Q.nationality, r.nationality);
  set(Q.passportNumber, r.passportNumber);
  set(Q.idNumber, r.idNumber);
  set(Q.insurancePolicy, r.insurancePolicyNumber);
  set(Q.insuranceCompany, r.insuranceCompany);
  set(Q.insuranceOther, r.insuranceCompanyOther);
  set(Q.porterGuide, r.porterGuideName);
  set(Q.whatsapp, r.whatsappNumber);
  set(Q.email, r.email);
  return form;
}

type JotformResponse<T> = { responseCode?: number; message?: string; content?: T };

async function jotformRequest<T>(
  config: JotformConfig,
  path: string,
  init?: RequestInit
): Promise<T> {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${config.base}${path}${sep}apiKey=${encodeURIComponent(config.apiKey)}`, init);
  const json = (await res.json().catch(() => null)) as JotformResponse<T> | null;
  if (!res.ok || json?.responseCode !== 200) {
    throw new Error(`JotForm ${res.status}: ${json?.message ?? "unexpected response"}`);
  }
  return json.content as T;
}

/**
 * Pushes the record as a new JotForm submission and stores the outcome on `record.jotform`.
 * No-op when JotForm is not configured or the record is already in JotForm.
 * Throws on failure (after marking the record "failed").
 */
export async function submitTravelerRecordToJotform(
  record: JotformRecordInput,
  options: { silent?: boolean } = {}
): Promise<string | null> {
  const config = jotformConfig();
  if (!config) return null;
  const status = record.jotform?.status;
  if (status === "imported" || status === "synced") return null;
  if (status === "failed" && record.jotform?.submissionId) {
    await updateTravelerRecordInJotform(record);
    return record.jotform.submissionId;
  }

  try {
    const content = await jotformRequest<{ submissionID?: string }>(
      config,
      `/form/${config.formId}/submissions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: buildSubmission(record),
      }
    );
    const submissionId = content?.submissionID ? String(content.submissionID) : undefined;
    await TravelerRecord.updateOne(
      { _id: record._id },
      { $set: { jotform: { status: "synced", submissionId, syncedAt: new Date() } } }
    );
    if (!options.silent) logger.info(`[jotform] record ${record._id} -> submission ${submissionId ?? "?"}`);
    return submissionId ?? null;
  } catch (err) {
    await TravelerRecord.updateOne(
      { _id: record._id },
      { $set: { jotform: { status: "failed", error: (err as Error).message } } }
    ).catch(() => undefined);
    throw err;
  }
}

/**
 * Overwrites the record's linked JotForm submission with its current values.
 * Fields left empty in the app are not cleared in JotForm.
 * No-op when JotForm is not configured or the record has no submission.
 * Throws on failure (after marking the record "failed", keeping the submission id for retries).
 */
export async function updateTravelerRecordInJotform(record: JotformRecordInput): Promise<boolean> {
  const config = jotformConfig();
  const submissionId = record.jotform?.submissionId;
  if (!config || !submissionId) return false;

  try {
    await jotformRequest(config, `/submission/${submissionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: buildSubmission(record),
    });
    const status = record.jotform?.status === "imported" ? "imported" : "synced";
    await TravelerRecord.updateOne(
      { _id: record._id },
      { $set: { jotform: { status, submissionId, syncedAt: new Date() } } }
    );
    logger.info(`[jotform] record ${record._id} updated submission ${submissionId}`);
    return true;
  } catch (err) {
    await TravelerRecord.updateOne(
      { _id: record._id },
      {
        $set: {
          jotform: { status: "failed", submissionId, error: `Update failed: ${(err as Error).message}` },
        },
      }
    ).catch(() => undefined);
    throw err;
  }
}

export type JotformSubmissionSummary = {
  id: string;
  passportNumber?: string;
  /** YYYY-MM-DD */
  departureDate?: string;
};

/** Date fields are YYYY-MM-DD. */
export type JotformSubmission = JotformSubmissionSummary & {
  createdAt?: string;
  firstName?: string;
  lastName?: string;
  gender?: string;
  dateOfBirth?: string;
  nationality?: string;
  idNumber?: string;
  trekkingRegion?: string;
  trekkingRoute?: string;
  bookingDate?: string;
  insurancePolicyNumber?: string;
  insuranceCompany?: string;
  insuranceCompanyOther?: string;
  porterGuideName?: string;
  whatsappNumber?: string;
  email?: string;
};

type RawAnswer = { answer?: unknown; prettyFormat?: string };
type RawSubmission = {
  id: string;
  status?: string;
  created_at?: string;
  answers?: Record<string, RawAnswer>;
};

function answerText(a?: RawAnswer): string | undefined {
  const v = a?.answer;
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function answerPart(a: RawAnswer | undefined, part: string): string | undefined {
  const v = a?.answer;
  if (!v || typeof v !== "object") return undefined;
  const value = (v as Record<string, unknown>)[part];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Phone answers are either a plain string or `{ full, area, phone }`. */
function answerPhone(a?: RawAnswer): string | undefined {
  return answerText(a) || answerPart(a, "full") || a?.prettyFormat?.trim() || undefined;
}

/** Date answers come as {day,month,year}, "YYYY-MM-DD…" or prettyFormat "DD-MM-YYYY". */
function answerDate(a?: RawAnswer): string | undefined {
  const v = a?.answer;
  const pad = (n: unknown) => `0${n}`.slice(-2);
  if (v && typeof v === "object") {
    const { day, month, year } = v as Record<string, unknown>;
    if (day && month && year) return `${year}-${pad(month)}-${pad(day)}`;
  }
  if (typeof v === "string") {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const pretty = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(a?.prettyFormat?.trim() ?? "");
  if (pretty) return `${pretty[3]}-${pad(pretty[2])}-${pad(pretty[1])}`;
  return undefined;
}

function parseSubmission(s: RawSubmission): JotformSubmission {
  const a = s.answers ?? {};
  const [trekkingRegion, trekkingRoute] = (answerText(a[Q.trekkingArea]) ?? "")
    .split(/\r?\n/)
    .map((part) => part.trim() || undefined);
  return {
    id: String(s.id),
    createdAt: s.created_at,
    firstName: answerPart(a[Q.name], "first"),
    lastName: answerPart(a[Q.name], "last"),
    gender: answerText(a[Q.gender]),
    dateOfBirth: answerDate(a[Q.dateOfBirth]),
    nationality: answerText(a[Q.nationality]),
    passportNumber: answerText(a[Q.passportNumber]),
    idNumber: answerText(a[Q.idNumber]),
    trekkingRegion,
    trekkingRoute,
    bookingDate: answerDate(a[Q.bookingDate]),
    departureDate: answerDate(a[Q.departureDate]),
    insurancePolicyNumber: answerText(a[Q.insurancePolicy]),
    insuranceCompany: answerText(a[Q.insuranceCompany]),
    insuranceCompanyOther: answerText(a[Q.insuranceOther]),
    porterGuideName: answerText(a[Q.porterGuide]),
    whatsappNumber: answerPhone(a[Q.whatsapp]),
    email: answerText(a[Q.email])?.toLowerCase(),
  };
}

/** All non-deleted submissions of the configured form. */
export async function fetchAllJotformSubmissions(
  onPage?: (pageNumber: number, received: number) => void
): Promise<JotformSubmission[]> {
  const config = jotformConfig();
  if (!config) return [];
  const out: JotformSubmission[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await jotformRequest<RawSubmission[]>(
      config,
      `/form/${config.formId}/submissions?limit=${PAGE_SIZE}&offset=${offset}`
    );
    onPage?.(offset / PAGE_SIZE + 1, page?.length ?? 0);
    for (const s of page ?? []) {
      if (s.status === "DELETED") continue;
      out.push(parseSubmission(s));
    }
    if (!page || page.length < PAGE_SIZE) break;
  }
  return out;
}

/** Turns a JotForm/network error into a reason an admin can act on. */
export function explainJotformError(err: unknown): { reason: string; fatal: boolean } {
  const message = err instanceof Error ? err.message : String(err);
  const status = Number(/^JotForm (\d{3})/.exec(message)?.[1]);
  if (status === 401 || status === 403) {
    return { reason: `JotForm rejected the API key (${message}). Check JOTFORM_API_KEY has read/write access.`, fatal: true };
  }
  if (status === 404) {
    return { reason: `Form not found (${message}). Check JOTFORM_FORM_ID.`, fatal: true };
  }
  if (status === 429 || /limit/i.test(message)) {
    return { reason: `JotForm daily API limit reached (${message}). Try again tomorrow.`, fatal: true };
  }
  if (status >= 500) {
    return { reason: `JotForm server error (${message}). Retry later.`, fatal: false };
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(message)) {
    return { reason: `Could not reach JotForm (${message}). Check the server's internet connection.`, fatal: true };
  }
  return { reason: message, fatal: false };
}

/** Match key shared by app records and JotForm submissions. */
export function jotformMatchKey(passportNumber?: string, departureDate?: string): string | null {
  const passport = passportNumber?.replace(/\s+/g, "").toUpperCase();
  return passport && departureDate ? `${passport}|${departureDate}` : null;
}
