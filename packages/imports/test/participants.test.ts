import { describe, expect, it } from 'vitest';
import { parseParticipantCsv } from '../src/participants.js';

describe('participant CSV parser', () => {
  it('normalizes headers and manager email', () => {
    const csv = 'Nama,NIP,Unit,Jabatan,Email,Atasan,Atasan Email\nAni,001,Risk,Manager,ANI@BANK.CO.ID,Budi,budi@bank.co.id';
    const result = parseParticipantCsv(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0]).toMatchObject({
      nama: 'Ani', email: 'ani@bank.co.id', managerEmail: 'budi@bank.co.id', nip: '001', unit: 'Risk', jabatan: 'Manager',
    });
  });

  it('rejects duplicate participant email', () => {
    const csv = 'nama,email\nAni,ani@bank.co.id\nAni 2,ANI@BANK.CO.ID';
    const result = parseParticipantCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.errors[0]?.message).toContain('duplikat');
  });

  it('keeps an unresolved manager name without inventing an email mapping', () => {
    const csv = 'nama,email,atasan\nAni,ani@bank.co.id,Budi';
    const result = parseParticipantCsv(csv);
    expect(result.rows[0]?.managerEmail).toBeUndefined();
    expect(result.rows[0]?.atasan).toBe('Budi');
  });
});
