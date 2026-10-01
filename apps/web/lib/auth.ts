import { createHash, randomBytes } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { prisma } from '@ltw/db';
import type { Permission, Role } from '@ltw/authz';
import { can } from '@ltw/authz';

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'ltw_session';
const SESSION_TTL_HOURS = Number(process.env.SESSION_TTL_HOURS || 12);

export class AuthError extends Error {
  status: number;
  constructor(message = 'Unauthorized', status = 401) { super(message); this.status = status; }
}

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const hashIp = (ip: string | null) => ip ? createHash('sha256').update(ip).digest('hex') : null;

async function requestMeta() {
  const h = await headers();
  const raw = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip');
  return { ipHash: hashIp(raw), userAgent: h.get('user-agent')?.slice(0, 500) ?? null };
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);
  const meta = await requestMeta();
  await prisma.authSession.create({ data: { userId, tokenHash, expiresAt, ...meta } });
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
  return expiresAt;
}

export async function revokeCurrentSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) await prisma.authSession.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
  jar.set(COOKIE_NAME, '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 });
}

export async function getCurrentUser() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.isActive) return null;
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    void prisma.authSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
  }
  return session.user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new AuthError();
  return user;
}

function mapTenantRole(role: string): Role | null {
  if (role === 'PROGRAM_ADMIN') return 'PROGRAM_ADMIN';
  if (role === 'SPONSOR_VIEWER') return 'SPONSOR_VIEWER';
  return null;
}

export async function assertPermission(permission: Permission, input: {
  tenantId?: string;
  batchId?: string;
  teamId?: string;
  resourceUserId?: string;
  aggregateSize?: number;
}) {
  const user = await requireUser();
  if (user.platformRole === 'SUPER_ADMIN' && can(permission, { role:'SUPER_ADMIN' })) return user;

  let tenantId = input.tenantId;
  if (input.batchId && !tenantId) {
    const batch = await prisma.batch.findUnique({ where: { id: input.batchId }, select: { tenantId: true } });
    if (!batch) throw new AuthError('Batch tidak ditemukan', 404);
    tenantId = batch.tenantId;
  }
  if (!tenantId) throw new AuthError('Tenant context required', 400);

  const tenantMembership = await prisma.tenantMembership.findUnique({ where: { tenantId_userId: { tenantId, userId: user.id } } });
  const candidateRoles: Role[] = [];
  const tenantRole = tenantMembership ? mapTenantRole(tenantMembership.role) : null;
  if (tenantRole) candidateRoles.push(tenantRole);

  if (input.batchId) {
    const membership = await prisma.batchMembership.findUnique({ where: { batchId_userId: { batchId: input.batchId, userId: user.id } } });
    if (membership) candidateRoles.push(membership.role as Role);
  }

  for (const role of candidateRoles) {
    let isAssignedTeam = false;
    let isMappedSubordinate = false;
    if (role === 'CO_FACILITATOR' && input.teamId && input.batchId) {
      isAssignedTeam = Boolean(await prisma.observerTeamAssignment.findUnique({
        where: { batchId_observerUserId_teamId: { batchId: input.batchId, observerUserId: user.id, teamId: input.teamId } },
      }));
    }
    if (role === 'LINE_MANAGER' && input.resourceUserId && input.batchId) {
      isMappedSubordinate = Boolean(await prisma.participantManagerLink.findUnique({
        where: { batchId_participantUserId: { batchId: input.batchId, participantUserId: input.resourceUserId } },
      }).then((x) => x?.managerUserId === user.id));
    }
    if (can(permission, {
      role,
      actorTenantId: tenantId,
      resourceTenantId: tenantId,
      actorBatchId: input.batchId,
      resourceBatchId: input.batchId,
      isOwner: input.resourceUserId === user.id,
      isAssignedTeam,
      isMappedSubordinate,
      aggregateSize: input.aggregateSize,
    })) return user;
  }
  throw new AuthError('Forbidden', 403);
}

export async function getUserAccessSnapshot(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id:true,email:true,name:true,platformRole:true,mfaEnabled:true,
      tenantMemberships:{ include:{tenant:{select:{id:true,name:true,slug:true,isActive:true}}}},
      batchMemberships:{ include:{batch:{select:{id:true,tenantId:true,code:true,name:true,status:true,startDate:true,endDate:true}}}},
    },
  });
  return user;
}
