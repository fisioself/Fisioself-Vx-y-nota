import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App.jsx';

vi.mock('./lib/supabaseClient.js', () => ({
  isSupabaseConfigured: false,
  supabase: null
}));

vi.mock('./services/authService.js', () => ({
  authService: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ unsubscribe: vi.fn() })),
    signOut: vi.fn()
  }
}));

describe('App', () => {
  it('shows a clear setup state when Supabase env vars are missing', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /falta conectar supabase/i })).toBeInTheDocument();
    expect(screen.getByText(/vite_supabase_url/i)).toBeInTheDocument();
  });
});
