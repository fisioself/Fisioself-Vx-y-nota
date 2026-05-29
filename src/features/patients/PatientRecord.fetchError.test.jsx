/**
 * Regression: when getPatient() fails the UI must show an explicit error card
 * with a retry button instead of the misleading "Aún no hay actividad clínica"
 * empty state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../test/test-utils';

// ---- mock supabase ----
vi.mock('../../lib/supabaseClient', () => ({
  supabase: null,
  isSupabaseConfigured: false,
  assertSupabase: () => {
    throw new Error('Supabase not configured in test');
  }
}));

// ---- mock clinicalApi ----
vi.mock('../../services/clinicalApi', () => ({
  clinicalApi: {
    getPatient: vi.fn(),
    buildTimeline: vi.fn(() => [])
  }
}));

// ---- stub heavy sub-components ----
vi.mock('../appointments/AppointmentList', () => ({ AppointmentList: () => null }));
vi.mock('../../components/ImageUploader', () => ({ ImageUploader: () => null }));
vi.mock('../../components/ClinicalFilesList', () => ({ ClinicalFilesList: () => null }));
vi.mock('../../components/calendar/NativeCalendar', () => ({ NativeCalendar: () => null }));

import { PatientRecord } from './PatientRecord';
import { clinicalApi } from '../../services/clinicalApi';

const PATIENT = { id: 'p-1', full_name: 'Prueba Error', status: 'En tratamiento' };

// Error message matching the "no-retry" pattern (4xx) so the query fails
// immediately without waiting for backoff delays.
const INSTANT_FAIL_ERROR = new Error('PGRST116 not found');

describe('PatientRecord — fetch error', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows error card and retry button when getPatient rejects', async () => {
    clinicalApi.getPatient.mockRejectedValue(INSTANT_FAIL_ERROR);

    renderWithProviders(<PatientRecord patient={PATIENT} />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 3000 });

    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
  });

  it('does NOT show "actividad clinica" empty state when fetch fails', async () => {
    clinicalApi.getPatient.mockRejectedValue(INSTANT_FAIL_ERROR);

    renderWithProviders(<PatientRecord patient={PATIENT} />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 3000 });

    // The misleading empty-timeline message must NOT appear on error
    expect(screen.queryByText(/actividad clinica/i)).not.toBeInTheDocument();
  });
});
