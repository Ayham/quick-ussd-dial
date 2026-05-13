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
      activations: {
        Row: {
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          device_id: string
          id: string
          license_id: string | null
          notes: string | null
          processed_at: string | null
          processed_by: string | null
          request_token: string
          status: Database["public"]["Enums"]["activation_status"]
          user_id: string | null
          ussd_numbers: string[]
        }
        Insert: {
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          device_id: string
          id?: string
          license_id?: string | null
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          request_token: string
          status?: Database["public"]["Enums"]["activation_status"]
          user_id?: string | null
          ussd_numbers?: string[]
        }
        Update: {
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          device_id?: string
          id?: string
          license_id?: string | null
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          request_token?: string
          status?: Database["public"]["Enums"]["activation_status"]
          user_id?: string | null
          ussd_numbers?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "activations_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_actions: {
        Row: {
          action: string
          admin_id: string | null
          admin_label: string | null
          created_at: string
          details: Json
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          admin_label?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          admin_label?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      app_events: {
        Row: {
          created_at: string
          data: Json
          device_id: string
          event: string
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          data?: Json
          device_id: string
          event: string
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          data?: Json
          device_id?: string
          event?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      devices: {
        Row: {
          app_version: string | null
          created_at: string
          device_id: string
          id: string
          is_active: boolean
          is_blocked: boolean
          language: string | null
          last_seen: string
          metadata: Json
          model: string | null
          name: string | null
          notes: string | null
          platform: string | null
          timezone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_id: string
          id?: string
          is_active?: boolean
          is_blocked?: boolean
          language?: string | null
          last_seen?: string
          metadata?: Json
          model?: string | null
          name?: string | null
          notes?: string | null
          platform?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_id?: string
          id?: string
          is_active?: boolean
          is_blocked?: boolean
          language?: string | null
          last_seen?: string
          metadata?: Json
          model?: string | null
          name?: string | null
          notes?: string | null
          platform?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      distributor_transactions: {
        Row: {
          amount: number
          client_id: string | null
          created_at: string
          device_id: string
          distributor_id: string
          id: string
          notes: string | null
          type: string
        }
        Insert: {
          amount: number
          client_id?: string | null
          created_at?: string
          device_id: string
          distributor_id: string
          id?: string
          notes?: string | null
          type: string
        }
        Update: {
          amount?: number
          client_id?: string | null
          created_at?: string
          device_id?: string
          distributor_id?: string
          id?: string
          notes?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "distributor_transactions_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
        ]
      }
      distributors: {
        Row: {
          balance: number
          client_id: string | null
          created_at: string
          device_id: string
          id: string
          name: string
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          balance?: number
          client_id?: string | null
          created_at?: string
          device_id: string
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          balance?: number
          client_id?: string | null
          created_at?: string
          device_id?: string
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      licenses: {
        Row: {
          activated_at: string | null
          created_at: string
          created_by: string | null
          device_id: string | null
          expiry_date: string | null
          id: string
          level: string
          license_key: string
          notes: string | null
          permanent: boolean
          status: Database["public"]["Enums"]["license_status"]
          updated_at: string
          user_id: string | null
          ussd_numbers: string[]
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          expiry_date?: string | null
          id?: string
          level?: string
          license_key: string
          notes?: string | null
          permanent?: boolean
          status?: Database["public"]["Enums"]["license_status"]
          updated_at?: string
          user_id?: string | null
          ussd_numbers?: string[]
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          expiry_date?: string | null
          id?: string
          level?: string
          license_key?: string
          notes?: string | null
          permanent?: boolean
          status?: Database["public"]["Enums"]["license_status"]
          updated_at?: string
          user_id?: string | null
          ussd_numbers?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "licenses_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["device_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          language: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          language?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          language?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sync_logs: {
        Row: {
          created_at: string
          device_id: string | null
          error: string | null
          event: string
          id: string
          payload: Json
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          error?: string | null
          event: string
          id?: string
          payload?: Json
          status: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string | null
          error?: string | null
          event?: string
          id?: string
          payload?: Json
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      transfers: {
        Row: {
          amount: number
          client_id: string | null
          created_at: string
          device_id: string
          id: string
          operator: string
          phone: string
          status: string
          synced_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          client_id?: string | null
          created_at?: string
          device_id: string
          id?: string
          operator: string
          phone: string
          status?: string
          synced_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          client_id?: string | null
          created_at?: string
          device_id?: string
          id?: string
          operator?: string
          phone?: string
          status?: string
          synced_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      trials: {
        Row: {
          created_at: string
          days_total: number
          device_id: string
          expires_at: string
          extended_by_admin: boolean
          id: string
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          days_total?: number
          device_id: string
          expires_at: string
          extended_by_admin?: boolean
          id?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          days_total?: number
          device_id?: string
          expires_at?: string
          extended_by_admin?: boolean
          id?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          device_id: string
          id: string
          key: string
          updated_at: string
          user_id: string | null
          value: Json
        }
        Insert: {
          device_id: string
          id?: string
          key: string
          updated_at?: string
          user_id?: string | null
          value?: Json
        }
        Update: {
          device_id?: string
          id?: string
          key?: string
          updated_at?: string
          user_id?: string | null
          value?: Json
        }
        Relationships: []
      }
      ussd_codes: {
        Row: {
          created_at: string
          device_id: string
          id: string
          is_active: boolean
          label: string
          operator: string
          sort_order: number
          template: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: string
          is_active?: boolean
          label: string
          operator: string
          sort_order?: number
          template: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: string
          is_active?: boolean
          label?: string
          operator?: string
          sort_order?: number
          template?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      activation_status: "pending" | "approved" | "rejected"
      app_role: "admin" | "user"
      license_status: "active" | "expired" | "revoked" | "pending"
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
    Enums: {
      activation_status: ["pending", "approved", "rejected"],
      app_role: ["admin", "user"],
      license_status: ["active", "expired", "revoked", "pending"],
    },
  },
} as const
