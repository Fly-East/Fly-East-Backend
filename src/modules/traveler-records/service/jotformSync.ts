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
  jotform?: { status?: string } | null;
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

export type JotformSubmissionSummary = {
  id: string;
  passportNumber?: string;
  /** YYYY-MM-DD */
  departureDate?: string;
};

type RawAnswer = { answer?: unknown; prettyFormat?: string };
type RawSubmission = { id: string; status?: string; answers?: Record<string, RawAnswer> };

function answerText(a?: RawAnswer): string | undefined {
  const v = a?.answer;
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
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

/** All non-deleted submissions of the configured form, reduced to the fields used for matching. */
export async function fetchAllJotformSubmissions(): Promise<JotformSubmissionSummary[]> {
  const config = jotformConfig();
  if (!config) return [];
  const out: JotformSubmissionSummary[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await jotformRequest<RawSubmission[]>(
      config,
      `/form/${config.formId}/submissions?limit=${PAGE_SIZE}&offset=${offset}`
    );
    for (const s of page ?? []) {
      if (s.status === "DELETED") continue;
      out.push({
        id: String(s.id),
        passportNumber: answerText(s.answers?.[Q.passportNumber]),
        departureDate: answerDate(s.answers?.[Q.departureDate]),
      });
    }
    if (!page || page.length < PAGE_SIZE) break;
  }
  return out;
}

/** Match key shared by app records and JotForm submissions. */
export function jotformMatchKey(passportNumber?: string, departureDate?: string): string | null {
  const passport = passportNumber?.replace(/\s+/g, "").toUpperCase();
  return passport && departureDate ? `${passport}|${departureDate}` : null;
}
