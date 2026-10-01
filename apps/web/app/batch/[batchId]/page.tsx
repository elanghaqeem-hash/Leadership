import { redirect } from 'next/navigation';
import { prisma } from '@ltw/db';
import { assertPermission, getCurrentUser } from '@/lib/auth';
import ParticipantBatchClient from './ParticipantBatchClient';

export default async function ParticipantBatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const { batchId } = await params;
  const batch = await prisma.batch.findUnique({ where: { id: batchId }, select: { id: true, tenantId: true, name: true } });
  if (!batch) redirect('/dashboard');
  await assertPermission('BATCH_ACTIVITY_READ', { tenantId: batch.tenantId, batchId });
  return <ParticipantBatchClient batchId={batchId} />;
}
