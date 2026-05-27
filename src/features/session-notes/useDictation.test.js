import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDictation } from './useDictation.js';
import { supabase } from '../../lib/supabaseClient.js';

vi.mock('../../lib/supabaseClient.js', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

describe('useDictation with Whisper', () => {
  const mockOnText = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock getUserMedia
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
    });

    // Mock MediaRecorder
    vi.stubGlobal('MediaRecorder', vi.fn().mockImplementation(function() {
      this.start = vi.fn();
      this.stop = vi.fn(() => {
        if (this.onstop) this.onstop();
      });
      this.ondataavailable = null;
      this.onstop = null;
    }));
  });

  it('should initialize with correct default states', () => {
    const { result } = renderHook(() => useDictation(mockOnText));
    expect(result.current.listening).toBe(false);
    expect(result.current.processing).toBe(false);
    expect(result.current.supported).toBe(true);
  });

  it('should call transcribeAudio on stop recording', async () => {
    supabase.functions.invoke.mockResolvedValue({ data: { text: 'transcribed text' }, error: null });
    
    const { result } = renderHook(() => useDictation(mockOnText));

    await act(async () => {
      result.current.toggle(); // Start
    });

    expect(result.current.listening).toBe(true);

    await act(async () => {
      result.current.toggle(); // Stop
    });

    expect(result.current.listening).toBe(false);
    // Transcribe happens async after stop
    expect(supabase.functions.invoke).toHaveBeenCalledWith('whisper-transcribe', expect.any(Object));
  });
});
