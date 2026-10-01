import { parse } from 'csv-parse/sync';
import { z } from 'zod';

const nullableTrimmed = z.preprocess(
  (v) => typeof v === 'string' && v.trim() === '' ? undefined : typeof v === 'string' ? v.trim() : v,
  z.string().optional(),
);

const emailField = z.preprocess(
  (v) => typeof v === 'string' ? v.trim().toLowerCase() : v,
  z.string().email(),
);

const optionalEmail = z.preprocess(
  (v) => typeof v === 'string' && v.trim() === '' ? undefined : typeof v === 'string' ? v.trim().toLowerCase() : v,
  z.string().email().optional(),
);

export const ParticipantImportRowSchema = z.object({
  nama: z.string().trim().min(1, 'nama wajib diisi'),
  nip: nullableTrimmed,
  unit: nullableTrimmed,
  jabatan: nullableTrimmed,
  email: emailField,
  atasan: nullableTrimmed,
  atasan_email: optionalEmail,
  manager_email: optionalEmail,
});

export type ParticipantImportRow = z.infer<typeof ParticipantImportRowSchema> & {
  rowNumber: number;
  managerEmail?: string;
};

export interface ParticipantImportParseResult {
  rows: ParticipantImportRow[];
  errors: Array<{ rowNumber: number; email?: string; message: string }>;
}

function normalizeHeaders(record: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const k = key.trim().toLowerCase().replace(/\s+/g, '_');
    normalized[k] = value;
  }
  return normalized;
}

export function parseParticipantCsv(csvText: string): ParticipantImportParseResult {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true,
  }) as Record<string, unknown>[];

  const rows: ParticipantImportRow[] = [];
  const errors: ParticipantImportParseResult['errors'] = [];
  const seen = new Set<string>();

  records.forEach((raw, index) => {
    const rowNumber = index + 2;
    const normalized = normalizeHeaders(raw);
    const parsed = ParticipantImportRowSchema.safeParse(normalized);
    if (!parsed.success) {
      errors.push({
        rowNumber,
        email: typeof normalized.email === 'string' ? normalized.email : undefined,
        message: parsed.error.issues.map((i) => i.message).join('; '),
      });
      return;
    }

    if (seen.has(parsed.data.email)) {
      errors.push({ rowNumber, email: parsed.data.email, message: 'email peserta duplikat dalam file' });
      return;
    }
    seen.add(parsed.data.email);

    const managerEmail = parsed.data.atasan_email ?? parsed.data.manager_email;
    rows.push({ ...parsed.data, rowNumber, managerEmail });
  });

  return { rows, errors };
}
