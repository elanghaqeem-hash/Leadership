# Production Runbook

## Tujuan

Runbook ini mendokumentasikan minimum production gate untuk **Leadership That Works**. Workbook canonical tetap menjadi sumber konten dan formula; PostgreSQL menjadi runtime system of record untuk peserta, aktivitas, game, follow-up, dan impact.

## 1. Runtime prerequisites

- Node.js runtime yang kompatibel dengan package lock repository.
- PostgreSQL dengan koneksi TLS sesuai kebijakan environment.
- Runtime database user **bukan** table owner/superuser agar PostgreSQL RLS efektif.
- HTTPS pada reverse proxy / platform.
- Persistent database backup dan restore procedure yang diuji.

## 2. Environment variables

Wajib:

- `DATABASE_URL`
- `APP_URL`
- `APP_SECRET` minimal 32 karakter acak
- `MFA_ENCRYPTION_KEY` terpisah dari APP_SECRET
- `SESSION_COOKIE_NAME`
- `SESSION_TTL_HOURS`
- `MAGIC_LINK_TTL_MINUTES`
- `MFA_CHALLENGE_TTL_SECONDS`

Bootstrap awal, hanya saat dibutuhkan:

- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`
- `BOOTSTRAP_ADMIN_NAME`

Reminder D+7 / D+14 / D+30:

- `CRON_SECRET`
- `NOTIFICATION_WEBHOOK_URL` untuk provider email/webhook
- `WHATSAPP_WEBHOOK_URL` bila WhatsApp dipakai
- `NOTIFICATION_WEBHOOK_TOKEN` bila provider memerlukan bearer token

Jangan commit nilai real ke Git.

## 3. Database initialization

Urutan production:

```bash
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
```

`db:seed` harus menghasilkan template LTW published, scoring config, rubrics, test, dan content hasil workbook canonical. Seed bersifat idempotent terhadap content/version yang sudah ada.

## 4. Mandatory CI / release gates

Jalankan:

```bash
npm run toolkit:extract
npm run typecheck
npm run test:sprint2
npm run build
npm run test:classroom:load
```

Pipeline repository juga menguji migration, seed smoke, PostgreSQL RLS dengan runtime role non-owner, HTTP auth smoke, production build, 30-participant classroom latency smoke, dan dependency audit.

Release tidak boleh dipromosikan bila salah satu mandatory gate gagal.

## 5. Health and readiness

`GET /api/health` adalah readiness endpoint. HTTP 200 membutuhkan:

- database dapat diakses; dan
- minimal satu published LTW template version tersedia.

HTTP 503 berarti instance tidak siap menerima traffic kelas.

Gunakan platform health check dengan interval yang wajar dan tanpa caching.

## 6. Batch go-live

Sebelum training:

1. Buat tenant dan batch.
2. Import participant CSV dan manager mapping.
3. Tugaskan Lead Trainer / Co-Facilitator.
4. Bentuk tim manual atau balanced-random.
5. Buka **Batch Readiness**.
6. Selesaikan seluruh blocker.
7. Program Admin menjalankan lifecycle `DRAFT → PRE_TRAINING → ACTIVE`.

Readiness juga menampilkan warning untuk aktivasi akun, manager mapping, team balance, dan completion pre-training.

Setelah training: `ACTIVE → FOLLOW_UP`. Setelah follow-up selesai: `FOLLOW_UP → CLOSED`, lalu dapat diarsipkan.

## 7. Classroom realtime and degraded mode

Classroom state menggunakan authenticated Server-Sent Events (SSE) dengan fallback polling. Projector, Trainer Console, observer, dan participant menerima perubahan batch/game melalui channel ini.

Structured individual activity submission memiliki IndexedDB outbox. Bila network terputus, submission tersebut dapat diantrikan dan disinkronkan kembali. Game state yang membutuhkan sinkronisasi tim/realtime tetap harus dianggap **online-required**; jangan mengandalkan offline outbox untuk voting/game controls.

## 8. Reminder scheduler

Jalankan scheduler harian ke:

`POST /api/cron/follow-up-reminders`

dengan header:

`x-cron-secret: <CRON_SECRET>`

Endpoint melakukan idempotency check lewat audit log sebelum mengirim reminder untuk checkpoint yang belum selesai.

## 9. Privacy and exports

- Private reflection tidak boleh muncul pada sponsor aggregate export.
- Sponsor Viewer hanya memperoleh aggregate data dan threshold minimum population tetap diberlakukan server-side.
- Participant individual read/export dibatasi ke dirinya sendiri.
- Lead Trainer dapat mengakses private reflection hanya sesuai RBAC.
- Batch XLSX export mengikuti 27-sheet structure dari toolkit tetapi tetap menerapkan privacy mode berdasarkan role.

## 10. Backup, rollback, and incident operation

Sebelum migration production:

- snapshot/backup database;
- catat commit SHA yang akan dirilis;
- verifikasi migration state;
- lakukan smoke test login dan health check.

Rollback aplikasi tidak boleh membatalkan migration secara manual tanpa migration plan. Untuk incident data, restore hanya dari backup terverifikasi dan catat tindakan pada change/incident record organisasi.

## 11. Post-deploy smoke

Minimum smoke:

- `/api/health` = 200;
- login Super Admin / Program Admin berhasil;
- buat atau buka batch test;
- participant join dengan code yang valid;
- Trainer Console dan Projector menerima SSE;
- satu structured submission tersimpan;
- satu live game round dapat Start → Reveal → Close;
- export XLSX dapat diunduh sesuai role;
- reminder endpoint menolak request tanpa `CRON_SECRET`.

