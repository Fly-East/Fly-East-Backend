import { randomUUID } from "crypto";
import TravelerRecord from "../model/travelerRecord.model";
import logger from "../../../utils/logger";
import {
  JotformRecordInput,
  JotformSubmission,
  explainJotformError,
  fetchAllJotformSubmissions,
  jotformConfig,
  jotformMatchKey,
  submitTravelerRecordToJotform,
} from "./jotformSync";

export type JotformJobKind = "import" | "push";
export type JotformJobOutcome = "created" | "pushed" | "linked" | "skipped" | "failed";

export type JotformJobItem = {
  outcome: JotformJobOutcome;
  name: string;
  recordId?: string;
  submissionId?: string;
  detail?: string;
};

export type JotformJobStep = { at: string; level: "info" | "warn" | "error"; message: string };

export type JotformJob = {
  id: string;
  kind: JotformJobKind;
  status: "running" | "done" | "failed" | "cancelled";
  startedAt: string;
  finishedAt?: string;
  startedBy?: string;
  total: number;
  processed: number;
  counts: Record<JotformJobOutcome, number>;
  items: JotformJobItem[];
  steps: JotformJobStep[];
  error?: string;
};

type JobState = JotformJob & { cancelRequested: boolean };

const MAX_KEPT_JOBS = 10;
const PUSH_DELAY_MS = 250;
const jobs = new Map<string, JobState>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toPublic({ cancelRequested: _c, ...job }: JobState): JotformJob {
  return job;
}

function step(job: JobState, message: string, level: JotformJobStep["level"] = "info") {
  job.steps.push({ at: new Date().toISOString(), level, message });
}

function record(job: JobState, item: JotformJobItem) {
  job.items.push(item);
  job.counts[item.outcome] += 1;
  job.processed += 1;
}

function dayKey(value?: Date | string | null): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

function submissionName(s: JotformSubmission): string {
  return [s.firstName, s.lastName].filter(Boolean).join(" ").trim();
}

export function getJotformJob(id: string): JotformJob | null {
  const job = jobs.get(id);
  return job ? toPublic(job) : null;
}

export function runningJotformJob(): JotformJob | null {
  for (const job of jobs.values()) if (job.status === "running") return toPublic(job);
  return null;
}

export function latestJotformJob(): JotformJob | null {
  const all = [...jobs.values()];
  return all.length ? toPublic(all[all.length - 1]) : null;
}

export function cancelJotformJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job || job.status !== "running") return false;
  job.cancelRequested = true;
  step(job, "Stop requested. Finishing the current record…", "warn");
  return true;
}

export async function jotformStatusCounts() {
  const rows = await TravelerRecord.aggregate<{ _id: string | null; count: number }>([
    { $group: { _id: "$jotform.status", count: { $sum: 1 } } },
  ]);
  const counts = { notInJotform: 0, imported: 0, synced: 0, failed: 0 };
  for (const row of rows) {
    if (row._id === "imported" || row._id === "synced" || row._id === "failed") {
      counts[row._id] += row.count;
    } else {
      counts.notInJotform += row.count;
    }
  }
  return counts;
}

function startJob(
  kind: JotformJobKind,
  startedBy: string | undefined,
  run: (job: JobState) => Promise<void>
): JotformJob {
  if (!jotformConfig()) {
    throw new Error("JotForm is not configured. Set JOTFORM_API_KEY and JOTFORM_FORM_ID on the server.");
  }
  const running = runningJotformJob();
  if (running) {
    throw new Error(`A JotForm ${running.kind} is already running. Wait for it to finish or stop it.`);
  }

  const job: JobState = {
    id: randomUUID(),
    kind,
    status: "running",
    startedAt: new Date().toISOString(),
    startedBy,
    total: 0,
    processed: 0,
    counts: { created: 0, pushed: 0, linked: 0, skipped: 0, failed: 0 },
    items: [],
    steps: [],
    cancelRequested: false,
  };
  jobs.set(job.id, job);
  while (jobs.size > MAX_KEPT_JOBS) jobs.delete(jobs.keys().next().value as string);

  void run(job)
    .then(() => {
      job.status = job.error ? "failed" : job.cancelRequested ? "cancelled" : "done";
      const c = job.counts;
      step(
        job,
        `${job.status === "done" ? "Finished" : "Stopped early"}: ${c.created} created, ${c.pushed} pushed, ${c.linked} linked, ${c.skipped} skipped, ${c.failed} failed.`
      );
    })
    .catch((err) => {
      const { reason } = explainJotformError(err);
      job.status = "failed";
      job.error = reason;
      step(job, reason, "error");
      logger.error(`[jotform] ${kind} job ${job.id} failed:`, err);
    })
    .finally(() => {
      job.finishedAt = new Date().toISOString();
    });

  return toPublic(job);
}

async function fetchSubmissions(job: JobState) {
  step(job, `Fetching submissions from JotForm form ${jotformConfig()!.formId}…`);
  const submissions = await fetchAllJotformSubmissions((page, received) =>
    step(job, `Page ${page}: received ${received} submission${received === 1 ? "" : "s"}.`)
  );
  step(job, `${submissions.length} active submission${submissions.length === 1 ? "" : "s"} in JotForm.`);
  return submissions;
}

/** Creates app records for JotForm submissions the app doesn't have yet. */
export function startJotformImport(startedBy?: string): JotformJob {
  return startJob("import", startedBy, async (job) => {
    const submissions = await fetchSubmissions(job);
    job.total = submissions.length;

    step(job, "Loading existing traveller records to avoid duplicates…");
    const existing = await TravelerRecord.find(
      {},
      { fullName: 1, passportNumber: 1, departureDate: 1, jotform: 1 }
    ).lean();
    const bySubmission = new Map<string, (typeof existing)[number]>();
    const byKey = new Map<string, (typeof existing)[number]>();
    for (const r of existing) {
      if (r.jotform?.submissionId) bySubmission.set(r.jotform.submissionId, r);
      const key = jotformMatchKey(r.passportNumber, dayKey(r.departureDate));
      if (key && !byKey.has(key)) byKey.set(key, r);
    }
    step(job, `${existing.length} records in the app, ${bySubmission.size} already linked to a submission.`);

    for (const s of submissions) {
      if (job.cancelRequested) break;
      const name = submissionName(s) || "(no name)";

      const linked = bySubmission.get(s.id);
      if (linked) {
        record(job, {
          outcome: "skipped",
          name,
          submissionId: s.id,
          recordId: String(linked._id),
          detail: "Already in the app",
        });
        continue;
      }

      const key = jotformMatchKey(s.passportNumber, s.departureDate);
      const match = key ? byKey.get(key) : undefined;
      if (match) {
        if (match.jotform?.status === "imported" || match.jotform?.status === "synced") {
          record(job, {
            outcome: "skipped",
            name,
            submissionId: s.id,
            recordId: String(match._id),
            detail: `Same passport and departure date as "${match.fullName}", which is already linked to submission ${match.jotform.submissionId ?? "?"}. Possible duplicate in JotForm.`,
          });
          continue;
        }
        await TravelerRecord.updateOne(
          { _id: match._id },
          { $set: { jotform: { status: "imported", submissionId: s.id, syncedAt: new Date() } } }
        );
        bySubmission.set(s.id, match);
        record(job, {
          outcome: "linked",
          name,
          submissionId: s.id,
          recordId: String(match._id),
          detail: `Matched existing record "${match.fullName}" by passport and departure date`,
        });
        continue;
      }

      if (!submissionName(s)) {
        record(job, {
          outcome: "failed",
          name,
          submissionId: s.id,
          detail: "Submission has no first or last name",
        });
        continue;
      }

      try {
        const toDate = (v?: string) => (v ? new Date(v) : undefined);
        const created = await TravelerRecord.create({
          fullName: submissionName(s),
          firstName: s.firstName,
          lastName: s.lastName,
          givenNames: s.firstName,
          surname: s.lastName,
          gender: s.gender,
          sex: s.gender,
          dateOfBirth: toDate(s.dateOfBirth),
          nationality: s.nationality,
          passportNumber: s.passportNumber,
          idNumber: s.idNumber,
          trekkingArea: [s.trekkingRegion, s.trekkingRoute].filter(Boolean).join("\n") || undefined,
          trekkingRegion: s.trekkingRegion,
          trekkingRoute: s.trekkingRoute,
          bookingDate: toDate(s.bookingDate),
          departureDate: toDate(s.departureDate),
          insurancePolicyNumber: s.insurancePolicyNumber,
          insuranceCompany: s.insuranceCompany,
          insuranceCompanyOther: s.insuranceCompanyOther,
          porterGuideName: s.porterGuideName,
          whatsappNumber: s.whatsappNumber,
          email: s.email,
          jotform: { status: "imported", submissionId: s.id, syncedAt: new Date() },
        });
        bySubmission.set(s.id, created.toObject());
        if (key) byKey.set(key, created.toObject());
        record(job, {
          outcome: "created",
          name,
          submissionId: s.id,
          recordId: String(created._id),
          detail: [s.trekkingRegion, s.departureDate].filter(Boolean).join(" · ") || undefined,
        });
      } catch (err) {
        record(job, {
          outcome: "failed",
          name,
          submissionId: s.id,
          detail: `Could not save: ${(err as Error).message}`,
        });
      }
    }
  });
}

/** Sends app records that aren't in JotForm yet as new submissions. */
export function startJotformPush(
  options: { retryFailed?: boolean; limit?: number },
  startedBy?: string
): JotformJob {
  return startJob("push", startedBy, async (job) => {
    const statuses: (string | null)[] = [null];
    if (options.retryFailed) statuses.push("failed");
    const pending = await TravelerRecord.find({ "jotform.status": { $in: statuses } })
      .sort({ createdAt: 1 })
      .limit(options.limit ?? 0)
      .lean();
    job.total = pending.length;
    step(
      job,
      `${pending.length} record${pending.length === 1 ? "" : "s"} to send${options.retryFailed ? " (including previously failed)" : ""}${options.limit ? `, capped at ${options.limit}` : ""}.`
    );
    if (!pending.length) return;

    const submissions = await fetchSubmissions(job);
    const byKey = new Map<string, string>();
    for (const s of submissions) {
      const key = jotformMatchKey(s.passportNumber, s.departureDate);
      if (key && !byKey.has(key)) byKey.set(key, s.id);
    }

    step(job, "Sending records one at a time…");
    for (const [index, r] of pending.entries()) {
      if (job.cancelRequested) break;
      const name = r.fullName || "(no name)";
      const recordId = String(r._id);

      const key = jotformMatchKey(r.passportNumber, dayKey(r.departureDate));
      const ownSubmissionId = r.jotform?.submissionId;
      const existingId = !ownSubmissionId && key ? byKey.get(key) : undefined;
      if (existingId) {
        await TravelerRecord.updateOne(
          { _id: r._id },
          { $set: { jotform: { status: "synced", submissionId: existingId, syncedAt: new Date() } } }
        );
        record(job, {
          outcome: "linked",
          name,
          recordId,
          submissionId: existingId,
          detail: "Already in JotForm with the same passport and departure date; linked instead of sending a duplicate",
        });
        continue;
      }

      try {
        const submissionId = await submitTravelerRecordToJotform(
          r as unknown as JotformRecordInput,
          { silent: true }
        );
        if (key && submissionId) byKey.set(key, submissionId);
        const missing = [!r.passportNumber && "passport", !r.departureDate && "departure date"].filter(Boolean);
        record(job, {
          outcome: "pushed",
          name,
          recordId,
          submissionId: submissionId ?? undefined,
          detail: ownSubmissionId
            ? "Updated the existing submission with the latest edits"
            : missing.length
              ? `Sent without ${missing.join(" and ")}`
              : undefined,
        });
      } catch (err) {
        const { reason, fatal } = explainJotformError(err);
        record(job, { outcome: "failed", name, recordId, detail: reason });
        if (fatal) {
          job.error = reason;
          step(job, `Stopping: ${reason}`, "error");
          break;
        }
      }

      if (index < pending.length - 1) await sleep(PUSH_DELAY_MS);
    }
  });
}
