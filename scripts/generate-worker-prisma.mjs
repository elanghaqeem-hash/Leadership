import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const source = path.join(root, 'prisma', 'schema.prisma');
const workerSchema = path.join(root, 'prisma', '.schema.worker.prisma');

const canonical = fs.readFileSync(source, 'utf8');
const worker = canonical.replace(
  /generator client \{\s*provider\s*=\s*"prisma-client-js"\s*\}/m,
  'generator client {\n  provider   = "prisma-client-js"\n  engineType = "client"\n}',
);

if (worker === canonical) {
  throw new Error('Unable to prepare Worker Prisma schema: generator client block not found');
}

try {
  fs.writeFileSync(workerSchema, worker);
  execFileSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['prisma', 'generate', '--schema', workerSchema],
    { cwd: root, stdio: 'inherit' },
  );
} finally {
  fs.rmSync(workerSchema, { force: true });
}
