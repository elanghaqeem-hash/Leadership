import { NextResponse } from 'next/server';
import { AuthError } from './auth';
import { ZodError } from 'zod';

export function jsonError(error: unknown) {
  if (error instanceof AuthError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError) return NextResponse.json({ error: 'Validation failed', issues: error.issues }, { status: 400 });
  console.error(error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
