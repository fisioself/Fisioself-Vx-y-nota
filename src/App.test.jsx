import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App.jsx';

describe('App', () => {
  it('shows a clear setup state when Supabase env vars are missing', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /falta conectar supabase/i })).toBeInTheDocument();
    expect(screen.getByText(/vite_supabase_url/i)).toBeInTheDocument();
  });
});
