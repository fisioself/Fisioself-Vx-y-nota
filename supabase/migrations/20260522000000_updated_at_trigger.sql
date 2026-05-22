-- Migration to automatically update 'updated_at' column using a trigger

-- Create the trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for each relevant table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'patients_updated_at_trigger') THEN
    CREATE TRIGGER patients_updated_at_trigger
    BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'session_notes_updated_at_trigger') THEN
    CREATE TRIGGER session_notes_updated_at_trigger
    BEFORE UPDATE ON session_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'appointments_updated_at_trigger') THEN
    CREATE TRIGGER appointments_updated_at_trigger
    BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
