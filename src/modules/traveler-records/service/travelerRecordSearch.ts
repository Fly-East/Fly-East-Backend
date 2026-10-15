/**
 * In-memory fuzzy search for traveller records.
 *
 * Query syntax:
 *   free text            → every token must fuzzy-match some field
 *   "quoted phrase"      → phrase kept as one token
 *   field:value          → token scoped to one field group (e.g. passport:AB12)
 */

type SearchableRecord = Record<string, any>;

type FieldGroup = {
  key: string;
  aliases: string[];
  weight: number;
  paths: string[];
  kind?: "text" | "date";
};

export const SEARCH_FIELD_GROUPS: FieldGroup[] = [
  {
    key: "name",
    aliases: ["name", "fullname", "first", "firstname", "last", "lastname", "surname", "given"],
    weight: 1.5,
    paths: ["fullName", "firstName", "lastName", "surname", "givenNames"],
  },
  {
    key: "passport",
    aliases: ["passport", "pp", "passportnumber"],
    weight: 1.5,
    paths: ["passportNumber"],
  },
  { key: "id", aliases: ["id", "idnumber", "citizenship"], weight: 1.4, paths: ["idNumber", "_id"] },
  { key: "email", aliases: ["email", "mail"], weight: 1.3, paths: ["email"] },
  {
    key: "phone",
    aliases: ["phone", "whatsapp", "wa", "mobile"],
    weight: 1.3,
    paths: ["whatsappNumber"],
  },
  {
    key: "nationality",
    aliases: ["nationality", "country", "nation", "issuer", "issuing"],
    weight: 1.1,
    paths: ["nationality", "issuingCountry"],
  },
  {
    key: "trek",
    aliases: ["trek", "region", "route", "area", "trekking"],
    weight: 1.1,
    paths: ["trekkingRegion", "trekkingRoute", "trekkingArea"],
  },
  {
    key: "insurance",
    aliases: ["insurance", "insurer", "policy", "company"],
    weight: 1,
    paths: ["insuranceCompany", "insuranceCompanyOther", "insurancePolicyNumber"],
  },
  { key: "guide", aliases: ["guide", "porter"], weight: 1, paths: ["porterGuideName"] },
  { key: "gender", aliases: ["gender", "sex"], weight: 0.9, paths: ["gender", "sex"] },
  { key: "doctype", aliases: ["doctype", "type"], weight: 0.8, paths: ["documentType"] },
  {
    key: "document",
    aliases: ["document", "doc", "kind", "source", "device"],
    weight: 0.7,
    paths: ["documents.kind", "documents.source", "documents.deviceModel"],
  },
  { key: "dob", aliases: ["dob", "birth", "born"], weight: 1, paths: ["dateOfBirth"], kind: "date" },
  { key: "departure", aliases: ["departure", "depart", "start"], weight: 1, paths: ["departureDate"], kind: "date" },
  { key: "booking", aliases: ["booking", "booked"], weight: 0.9, paths: ["bookingDate"], kind: "date" },
  { key: "expiry", aliases: ["expiry", "expires", "exp"], weight: 0.9, paths: ["passportExpiry"], kind: "date" },
  { key: "created", aliases: ["created", "scanned"], weight: 0.7, paths: ["createdAt"], kind: "date" },
];

const ALIAS_TO_GROUP = new Map<string, FieldGroup>();
for (const group of SEARCH_FIELD_GROUPS) {
  for (const alias of group.aliases) ALIAS_TO_GROUP.set(alias, group);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export type ParsedToken = { value: string; group?: FieldGroup };

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function compact(s: string): string {
  return s.replace(/[^a-z0-9]/g, "");
}

export function parseSearchQuery(raw: string): ParsedToken[] {
  const tokens: ParsedToken[] = [];
  const re = /(\w+):"([^"]*)"|(\w+):(\S+)|"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const scopedKey = (m[1] || m[3])?.toLowerCase();
    const scopedValue = m[2] ?? m[4];
    const group = scopedKey ? ALIAS_TO_GROUP.get(scopedKey) : undefined;
    if (scopedKey && group) {
      const value = normalize(scopedValue || "");
      if (value) tokens.push({ value, group });
      continue;
    }
    const plain = normalize(m[5] ?? m[6] ?? m[0]);
    if (plain) tokens.push({ value: plain });
  }
  return tokens;
}

function dateVariants(value: unknown): string[] {
  if (!value) return [];
  const d = new Date(value as string);
  if (Number.isNaN(d.getTime())) return [];
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mon = MONTHS[d.getUTCMonth()];
  return [
    `${yyyy}-${mm}-${dd}`,
    `${dd}/${mm}/${yyyy}`,
    `${dd}.${mm}.${yyyy}`,
    `${dd} ${mon} ${yyyy}`,
    `${mon} ${yyyy}`,
  ];
}

function readPath(record: SearchableRecord, path: string): unknown[] {
  const [head, ...rest] = path.split(".");
  const value = record?.[head];
  if (value == null) return [];
  if (!rest.length) return Array.isArray(value) ? value : [value];
  const list = Array.isArray(value) ? value : [value];
  return list.flatMap((item) => readPath(item, rest.join(".")));
}

type IndexedField = { group: FieldGroup; text: string; compact: string; words: string[] };

function indexRecord(record: SearchableRecord): IndexedField[] {
  const fields: IndexedField[] = [];
  for (const group of SEARCH_FIELD_GROUPS) {
    for (const path of group.paths) {
      for (const raw of readPath(record, path)) {
        const texts =
          group.kind === "date" ? dateVariants(raw) : [String(raw ?? "")];
        for (const t of texts) {
          const text = normalize(t);
          if (!text) continue;
          fields.push({
            group,
            text,
            compact: compact(text),
            words: text.split(/[^a-z0-9@.+]+/).filter(Boolean),
          });
        }
      }
    }
  }
  return fields;
}

function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function isSubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (let j = 0; j < hay.length && i < needle.length; j++) {
    if (hay[j] === needle[i]) i++;
  }
  return i === needle.length;
}

function tokenFieldScore(token: string, field: IndexedField): number {
  const tokenCompact = compact(token);
  if (field.text === token) return 100;
  if (field.words.includes(token)) return 90;
  if (field.words.some((w) => w.startsWith(token))) return 75;
  if (token.length < 3) return 0;
  if (field.text.includes(token)) return 60;
  if (tokenCompact.length >= 3 && field.compact.includes(tokenCompact)) return 55;

  if (token.length >= 4) {
    const maxEdits = token.length >= 8 ? 2 : 1;
    let best = maxEdits + 1;
    for (const w of field.words) {
      best = Math.min(best, levenshtein(token, w, maxEdits));
      if (w.length > token.length) {
        best = Math.min(best, levenshtein(token, w.slice(0, token.length), maxEdits));
      }
      if (best === 0) break;
    }
    if (best <= maxEdits) return 45 - best * 10;
  }

  // Loose subsequence, only when the match stays within one word
  if (tokenCompact.length >= 3 && field.words.some((w) => w.length <= tokenCompact.length * 2 && isSubsequence(tokenCompact, w))) {
    return 20;
  }
  return 0;
}

export type SearchHit<T> = { record: T; score: number; matchedFields: string[] };

export function fuzzySearchRecords<T extends SearchableRecord>(
  records: T[],
  tokens: ParsedToken[]
): SearchHit<T>[] {
  if (!tokens.length) {
    return records.map((record) => ({ record, score: 0, matchedFields: [] }));
  }

  const hits: SearchHit<T>[] = [];
  for (const record of records) {
    const fields = indexRecord(record);
    let total = 0;
    const matched = new Set<string>();
    let ok = true;

    for (const token of tokens) {
      let best = 0;
      let bestGroup: string | undefined;
      for (const field of fields) {
        if (token.group && field.group.key !== token.group.key) continue;
        const s = tokenFieldScore(token.value, field) * field.group.weight;
        if (s > best) {
          best = s;
          bestGroup = field.group.key;
        }
      }
      if (best <= 0) {
        ok = false;
        break;
      }
      total += best;
      if (bestGroup) matched.add(bestGroup);
    }

    if (ok) hits.push({ record, score: total, matchedFields: [...matched] });
  }

  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const at = new Date(a.record.createdAt ?? 0).getTime();
    const bt = new Date(b.record.createdAt ?? 0).getTime();
    return bt - at;
  });
  return hits;
}
