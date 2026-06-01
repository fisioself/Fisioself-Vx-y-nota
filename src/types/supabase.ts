export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_consults: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          input_text: string
          output_text: string
          patient_id: string | null
          therapist_id: string | null
          type: string
          validated: boolean
          validation_notes: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          input_text: string
          output_text: string
          patient_id?: string | null
          therapist_id?: string | null
          type: string
          validated?: boolean
          validation_notes?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          input_text?: string
          output_text?: string
          patient_id?: string | null
          therapist_id?: string | null
          type?: string
          validated?: boolean
          validation_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_consults_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_consults_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_rate_limits: {
        Row: {
          request_count: number
          updated_at: string
          user_id: string
          window_start: string
        }
        Insert: {
          request_count?: number
          updated_at?: string
          user_id: string
          window_start?: string
        }
        Update: {
          request_count?: number
          updated_at?: string
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          color_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string
          google_calendar_id: string | null
          google_event_id: string | null
          google_html_link: string | null
          id: string
          location: string | null
          patient_id: string
          reminder_30min_sent_at: string | null
          session_type: string | null
          starts_at: string
          status: string
          sync_error: string | null
          sync_status: string
          therapist_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          color_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at: string
          google_calendar_id?: string | null
          google_event_id?: string | null
          google_html_link?: string | null
          id?: string
          location?: string | null
          patient_id: string
          reminder_30min_sent_at?: string | null
          session_type?: string | null
          starts_at: string
          status?: string
          sync_error?: string | null
          sync_status?: string
          therapist_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          color_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string
          google_calendar_id?: string | null
          google_event_id?: string | null
          google_html_link?: string | null
          id?: string
          location?: string | null
          patient_id?: string
          reminder_30min_sent_at?: string | null
          session_type?: string | null
          starts_at?: string
          status?: string
          sync_error?: string | null
          sync_status?: string
          therapist_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after_json: Json | null
          before_json: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      caja_movements: {
        Row: {
          amount: number
          clinic_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          method: string
          occurred_at: string
        }
        Insert: {
          amount: number
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          method?: string
          occurred_at?: string
        }
        Update: {
          amount?: number
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          method?: string
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "caja_movements_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_connections: {
        Row: {
          access_token: string | null
          calendar_id: string
          connected_at: string
          id: string
          provider: string
          provider_account_email: string | null
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          calendar_id?: string
          connected_at?: string
          id?: string
          provider?: string
          provider_account_email?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          calendar_id?: string
          connected_at?: string
          id?: string
          provider?: string
          provider_account_email?: string | null
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      clinic_memberships: {
        Row: {
          active: boolean
          clinic_id: string
          created_at: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          clinic_id: string
          created_at?: string
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          clinic_id?: string
          created_at?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_memberships_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      evaluations: {
        Row: {
          created_at: string
          created_by: string | null
          eva_initial: number | null
          evaluation_date: string
          id: string
          patient_id: string
          prognosis: string | null
          red_flags: string | null
          sections: Json
          therapist_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          eva_initial?: number | null
          evaluation_date?: string
          id?: string
          patient_id: string
          prognosis?: string | null
          red_flags?: string | null
          sections?: Json
          therapist_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          eva_initial?: number | null
          evaluation_date?: string
          id?: string
          patient_id?: string
          prognosis?: string | null
          red_flags?: string | null
          sections?: Json
          therapist_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          clinic_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          spent_at: string
        }
        Insert: {
          amount: number
          category?: string
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          spent_at?: string
        }
        Update: {
          amount?: number
          category?: string
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          spent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          contacted_at: string | null
          created_at: string
          created_by: string | null
          day_number: number
          id: string
          notes: string | null
          patient_id: string
          scheduled_date: string
          status: string
          therapist_id: string | null
        }
        Insert: {
          contacted_at?: string | null
          created_at?: string
          created_by?: string | null
          day_number: number
          id?: string
          notes?: string | null
          patient_id: string
          scheduled_date: string
          status?: string
          therapist_id?: string | null
        }
        Update: {
          contacted_at?: string | null
          created_at?: string
          created_by?: string | null
          day_number?: number
          id?: string
          notes?: string | null
          patient_id?: string
          scheduled_date?: string
          status?: string
          therapist_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      google_oauth_states: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          state: string
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          state: string
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      integration_config: {
        Row: {
          created_at: string
          key: string
          value: string
        }
        Insert: {
          created_at?: string
          key: string
          value: string
        }
        Update: {
          created_at?: string
          key?: string
          value?: string
        }
        Relationships: []
      }
      packages: {
        Row: {
          active: boolean
          clinic_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          price: number
          session_type: string | null
          sessions_included: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          price?: number
          session_type?: string | null
          sessions_included?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          price?: number
          session_type?: string | null
          sessions_included?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packages_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_packages: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          package_id: string | null
          patient_id: string
          purchased_at: string
          sessions_total: number
          sessions_used: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          package_id?: string | null
          patient_id: string
          purchased_at?: string
          sessions_total?: number
          sessions_used?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          package_id?: string | null
          patient_id?: string
          purchased_at?: string
          sessions_total?: number
          sessions_used?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_packages_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_packages_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_packages_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          assigned_therapist_id: string | null
          birth_date: string | null
          clinic_id: string
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          functional_diagnosis: string | null
          id: string
          medical_diagnosis: string | null
          occupation: string | null
          phone: string | null
          sex: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_therapist_id?: string | null
          birth_date?: string | null
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          functional_diagnosis?: string | null
          id?: string
          medical_diagnosis?: string | null
          occupation?: string | null
          phone?: string | null
          sex?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_therapist_id?: string | null
          birth_date?: string | null
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          functional_diagnosis?: string | null
          id?: string
          medical_diagnosis?: string | null
          occupation?: string | null
          phone?: string | null
          sex?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_assigned_therapist_id_fkey"
            columns: ["assigned_therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          clinic_id: string
          created_at: string
          created_by: string | null
          id: string
          method: string
          notes: string | null
          paid_at: string
          patient_id: string
          patient_package_id: string | null
        }
        Insert: {
          amount: number
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string
          notes?: string | null
          paid_at?: string
          patient_id: string
          patient_package_id?: string | null
        }
        Update: {
          amount?: number
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string
          notes?: string | null
          paid_at?: string
          patient_id?: string
          patient_package_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_patient_package_id_fkey"
            columns: ["patient_package_id"]
            isOneToOne: false
            referencedRelation: "patient_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          full_name: string | null
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          full_name?: string | null
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          full_name?: string | null
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      session_notes: {
        Row: {
          assessment: string | null
          created_at: string
          created_by: string | null
          eva: number | null
          id: string
          objective: string | null
          patient_id: string
          plan: string | null
          raw_text: string
          session_date: string
          session_number: number
          subjective: string | null
          therapist_id: string | null
          updated_at: string
        }
        Insert: {
          assessment?: string | null
          created_at?: string
          created_by?: string | null
          eva?: number | null
          id?: string
          objective?: string | null
          patient_id: string
          plan?: string | null
          raw_text: string
          session_date?: string
          session_number: number
          subjective?: string | null
          therapist_id?: string | null
          updated_at?: string
        }
        Update: {
          assessment?: string | null
          created_at?: string
          created_by?: string | null
          eva?: number | null
          id?: string
          objective?: string | null
          patient_id?: string
          plan?: string | null
          raw_text?: string
          session_date?: string
          session_number?: number
          subjective?: string | null
          therapist_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_notes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_notes_therapist_id_fkey"
            columns: ["therapist_id"]
            isOneToOne: false
            referencedRelation: "therapists"
            referencedColumns: ["id"]
          },
        ]
      }
      therapists: {
        Row: {
          active: boolean
          clinic_id: string
          created_at: string
          full_name: string
          id: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          clinic_id?: string
          created_at?: string
          full_name: string
          id?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          clinic_id?: string
          created_at?: string
          full_name?: string
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "therapists_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      calendar_connection_status: {
        Row: {
          calendar_id: string | null
          connected_at: string | null
          has_refresh_token: boolean | null
          has_token: boolean | null
          id: string | null
          provider: string | null
          provider_account_email: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          calendar_id?: string | null
          connected_at?: string | null
          has_refresh_token?: never
          has_token?: never
          id?: string | null
          provider?: string | null
          provider_account_email?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          calendar_id?: string | null
          connected_at?: string | null
          has_refresh_token?: never
          has_token?: never
          id?: string | null
          provider?: string | null
          provider_account_email?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_access_clinic: {
        Args: { target_clinic_id: string }
        Returns: boolean
      }
      can_write_clinic: { Args: { target_clinic_id: string }; Returns: boolean }
      check_ai_rate_limit: {
        Args: {
          max_requests?: number
          target_user_id: string
          window_seconds?: number
        }
        Returns: {
          allowed: boolean
          retry_after_seconds: number
        }[]
      }
      cleanup_google_oauth_states: { Args: never; Returns: number }
      current_profile_role: { Args: never; Returns: string }
      default_clinic_id: { Args: never; Returns: string }
      finance_appt_stats: { Args: { p_months_back?: number }; Returns: Json }
      is_active_clinical_user: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_therapist: { Args: never; Returns: boolean }
      my_calendar_connection: {
        Args: never
        Returns: {
          connected: boolean
          email: string
        }[]
      }
      notify_appointment_reminders: { Args: never; Returns: undefined }
      patient_name_norm: { Args: { n: string }; Returns: string }
      pull_google_calendar: { Args: never; Returns: undefined }
      retry_pending_appointment_syncs: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
