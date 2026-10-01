import { z } from 'zod';
export const slugSchema = z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const tenantCreateSchema = z.object({ name:z.string().trim().min(2).max(160), slug:slugSchema, retentionDays:z.number().int().min(30).max(3650).optional().nullable(), programAdminName:z.string().trim().min(2).max(160).optional().nullable(), programAdminEmail:z.string().email().transform(v=>v.toLowerCase()).optional().nullable() }).refine(v=>!v.programAdminEmail || !!v.programAdminName,{message:'Nama Program Admin wajib jika email diisi',path:['programAdminName']});
export const batchCreateSchema = z.object({
  tenantId:z.string().uuid(), programVersionId:z.string().uuid().optional(), code:z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/), name:z.string().trim().min(2).max(160),
  startDate:z.coerce.date(), endDate:z.coerce.date(), location:z.string().trim().max(200).optional().nullable(), teamCount:z.number().int().min(1).max(20).default(4), participantTarget:z.number().int().min(1).max(500).optional().nullable(),
}).refine(v=>v.endDate>=v.startDate,{message:'endDate harus >= startDate',path:['endDate']});
