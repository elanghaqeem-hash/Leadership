# Sprint 1 Runbook

## Scope

Sprint 1 mencakup Auth, RBAC, tenant/bank, batch, participant import, manager mapping, dan content seed dari Excel. Realtime games, tools Day 1/Day 2, reminder, dashboard Kirkpatrick, PDF/XLSX export, dan security hardening lanjutan berada di sprint berikutnya.

## Bootstrap

1. Siapkan PostgreSQL dan `DATABASE_URL`.
2. Salin `.env.example` menjadi `.env` dan ganti `APP_SECRET` serta bootstrap admin password.
3. Jalankan `npm install` dan `npm run db:generate`.
4. Buat migration Sprint 1 dengan `npm run db:migrate:dev -- --name sprint1` pada environment development.
5. Jalankan `npm run db:seed` untuk template `LTW` v1, scoring config, rubrik, test, dan content seed hasil Excel.
6. Login sebagai Super Admin, buat tenant/bank dan Program Admin.
7. Program Admin membuat batch lalu mengimpor peserta dengan CSV.

## CSV participant import

Header yang didukung: `nama,nip,unit,jabatan,email,atasan,atasan_email`. `manager_email` juga diterima sebagai alias `atasan_email`.

- Email peserta dinormalisasi menjadi lowercase.
- Duplikat email di file ditolak.
- Manager hanya dipetakan jika email manager tersedia; nama manager saja tidak ditebak.
- Existing role berbeda pada batch yang sama tidak ditimpa otomatis.
- Participant yang belum aktif menerima activation token; pengiriman email production akan memakai notification adapter.

Contoh: `samples/participants.csv`.

## Tenant isolation

Authorization tetap wajib dilakukan di server. `prisma/rls.sql` adalah defense-in-depth baseline PostgreSQL dan harus dipakai dengan **non-owner runtime DB role**. Jangan menganggap RLS efektif bila aplikasi berjalan sebagai owner tabel/superuser. Tenant request harus dieksekusi dengan tenant context; platform maintenance memakai privileged server-only path.

## Auth notes

- Session token random disimpan hanya dalam cookie HttpOnly; database menyimpan SHA-256 token hash.
- Password disimpan menggunakan Argon2id.
- Magic-link token juga disimpan dalam bentuk hash dan single-use.
- MFA flag/enforcement hook sudah tersedia, tetapi enrollment/verifikasi TOTP production belum dinyatakan complete pada Sprint 1 ini.
- SMTP/WhatsApp delivery adapter dijadwalkan pada sprint notification; development response boleh menampilkan activation/magic-link URL hanya di non-production.

## Definition of done Sprint 1

Sprint 1 dianggap green setelah CI menjalankan typecheck, Sprint-1 tests, dan Next.js production build; migration + seed juga harus diuji pada PostgreSQL test environment sebelum deploy.
