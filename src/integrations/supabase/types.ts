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
      account_lockouts: {
        Row: {
          created_at: string
          email: string
          id: string
          locked_until: string
          reason: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          locked_until: string
          reason?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          locked_until?: string
          reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
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
      amount_presets: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          label: string
          operator: string
          price: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          client_id?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          label: string
          operator: string
          price?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          label?: string
          operator?: string
          price?: number | null
          updated_at?: string
          user_id?: string
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
      app_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          user_id: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          user_id: string
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          user_id?: string
          value?: Json
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          device_id: string | null
          entity: string | null
          entity_id: string | null
          id: string
          ip: string | null
          metadata: Json
          new_values: Json | null
          old_values: Json | null
          target_user_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          device_id?: string | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip?: string | null
          metadata?: Json
          new_values?: Json | null
          old_values?: Json | null
          target_user_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          device_id?: string | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip?: string | null
          metadata?: Json
          new_values?: Json | null
          old_values?: Json | null
          target_user_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          client_id: string
          created_at: string
          device_id: string | null
          id: string
          name: string
          notes: string | null
          operator: string | null
          phone: string
          phone_normalized: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id?: string
          created_at?: string
          device_id?: string | null
          id?: string
          name: string
          notes?: string | null
          operator?: string | null
          phone: string
          phone_normalized: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          device_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          operator?: string | null
          phone?: string
          phone_normalized?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_summaries: {
        Row: {
          amount_total: number
          created_at: string
          day: string
          device_id: string | null
          failure_count: number
          id: string
          operator: string | null
          revenue: number
          success_count: number
          transfers_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_total?: number
          created_at?: string
          day: string
          device_id?: string | null
          failure_count?: number
          id?: string
          operator?: string | null
          revenue?: number
          success_count?: number
          transfers_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_total?: number
          created_at?: string
          day?: string
          device_id?: string | null
          failure_count?: number
          id?: string
          operator?: string | null
          revenue?: number
          success_count?: number
          transfers_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      device_bans: {
        Row: {
          banned_by: string | null
          created_at: string
          device_id: string
          id: string
          lifted_at: string | null
          reason: string | null
          user_id: string | null
        }
        Insert: {
          banned_by?: string | null
          created_at?: string
          device_id: string
          id?: string
          lifted_at?: string | null
          reason?: string | null
          user_id?: string | null
        }
        Update: {
          banned_by?: string | null
          created_at?: string
          device_id?: string
          id?: string
          lifted_at?: string | null
          reason?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      distributors: {
        Row: {
          code: string
          commission_rate: number
          company_name: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          code: string
          commission_rate?: number
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          code?: string
          commission_rate?: number
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      distributor_payouts: {
        Row: {
          id: string
          distributor_id: string
          amount: number
          notes: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          distributor_id: string
          amount: number
          notes?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          distributor_id?: string
          amount?: number
          notes?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: "distributor_payouts_distributor_id_fkey"; columns: ["distributor_id"]; isOneToOne: false; referencedRelation: "distributors"; referencedColumns: ["id"] }
        ]
      }
      devices: {
        Row: {
          android_id: string | null
          app_instance_id: string | null
          app_version: string | null
          ban_reason: string | null
          block_reason: string | null
          created_at: string
          device_fingerprint: string | null
          device_id: string
          first_seen_at: string | null
          id: string
          is_active: boolean
          is_banned: boolean
          is_blocked: boolean
          language: string | null
          last_activity_at: string | null
          last_ip: string | null
          last_seen: string
          last_seen_at: string | null
          last_sync_at: string | null
          lifecycle_state: string | null
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
          android_id?: string | null
          app_instance_id?: string | null
          app_version?: string | null
          ban_reason?: string | null
          block_reason?: string | null
          created_at?: string
          device_fingerprint?: string | null
          device_id: string
          first_seen_at?: string | null
          id?: string
          is_active?: boolean
          is_banned?: boolean
          is_blocked?: boolean
          language?: string | null
          last_activity_at?: string | null
          last_ip?: string | null
          last_seen?: string
          last_seen_at?: string | null
          last_sync_at?: string | null
          lifecycle_state?: string | null
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
          android_id?: string | null
          app_instance_id?: string | null
          app_version?: string | null
          ban_reason?: string | null
          block_reason?: string | null
          created_at?: string
          device_fingerprint?: string | null
          device_id?: string
          first_seen_at?: string | null
          id?: string
          is_active?: boolean
          is_banned?: boolean
          is_blocked?: boolean
          language?: string | null
          last_activity_at?: string | null
          last_ip?: string | null
          last_seen?: string
          last_seen_at?: string | null
          last_sync_at?: string | null
          lifecycle_state?: string | null
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
      failed_logins: {
        Row: {
          created_at: string
          email: string | null
          id: string
          ip: string | null
          reason: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          ip?: string | null
          reason?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          ip?: string | null
          reason?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      licenses: {
        Row: {
          activated_at: string | null
          created_at: string
          created_by: string | null
          device_fingerprint: string | null
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
          device_fingerprint?: string | null
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
          device_fingerprint?: string | null
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
      notifications: {
        Row: {
          action_target: string | null
          action_type: Database["public"]["Enums"]["notification_action_type"]
          body_ar: string
          body_en: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          image_url: string | null
          is_announcement: boolean
          is_deleted: boolean
          is_pinned: boolean
          metadata: Json
          notification_type: Database["public"]["Enums"]["notification_type"]
          priority: Database["public"]["Enums"]["notification_priority"]
          requires_acknowledgement: boolean
          scheduled_at: string | null
          send_config: Json
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          title_ar: string
          title_en: string
          updated_at: string
          version: number
        }
        Insert: {
          action_target?: string | null
          action_type?: Database["public"]["Enums"]["notification_action_type"]
          body_ar?: string
          body_en?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          is_announcement?: boolean
          is_deleted?: boolean
          is_pinned?: boolean
          metadata?: Json
          notification_type?: Database["public"]["Enums"]["notification_type"]
          priority?: Database["public"]["Enums"]["notification_priority"]
          requires_acknowledgement?: boolean
          scheduled_at?: string | null
          send_config?: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          title_ar?: string
          title_en?: string
          updated_at?: string
          version?: number
        }
        Update: {
          action_target?: string | null
          action_type?: Database["public"]["Enums"]["notification_action_type"]
          body_ar?: string
          body_en?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          is_announcement?: boolean
          is_deleted?: boolean
          is_pinned?: boolean
          metadata?: Json
          notification_type?: Database["public"]["Enums"]["notification_type"]
          priority?: Database["public"]["Enums"]["notification_priority"]
          requires_acknowledgement?: boolean
          scheduled_at?: string | null
          send_config?: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          title_ar?: string
          title_en?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          commission_amount: number | null
          commission_rate: number | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          device_id: string | null
          distributor_id: string | null
          id: string
          method: string
          notes: string | null
          payment_date: string
          payment_for: string | null
          plan_id: string | null
          reference: string | null
          status: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          commission_amount?: number | null
          commission_rate?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          device_id?: string | null
          distributor_id?: string | null
          id?: string
          method?: string
          notes?: string | null
          payment_date?: string
          payment_for?: string | null
          plan_id?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          commission_amount?: number | null
          commission_rate?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          device_id?: string | null
          distributor_id?: string | null
          id?: string
          method?: string
          notes?: string | null
          payment_date?: string
          payment_for?: string | null
          plan_id?: string | null
          reference?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "payments_distributor_id_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "distributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: string
          address: string | null
          avatar_url: string | null
          city: string | null
          commission_max: number | null
          commission_min: number | null
          commission_type: string | null
          commission_value: number | null
          created_at: string
          credit_limit: number | null
          current_device: string | null
          customer_status: string | null
          display_name: string | null
          distributor_assignment_status: Database["public"]["Enums"]["distributor_assignment_status"]
          distributor_id: string | null
          email: string | null
          emergency_phone: string | null
          expiry_date: string | null
          full_name: string | null
          id: string
          language: string
          last_login: string | null
          last_sync: string | null
          license_status: Database["public"]["Enums"]["license_status"]
          license_type: Database["public"]["Enums"]["license_type"] | null
          notes: string | null
          permanent: boolean | null
          phone: string | null
          role: string | null
          service_type: string | null
          shop_name: string | null
          trial_end: string | null
          trial_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_status?: string
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          commission_max?: number | null
          commission_min?: number | null
          commission_type?: string | null
          commission_value?: number | null
          created_at?: string
          credit_limit?: number | null
          current_device?: string | null
          customer_status?: string | null
          display_name?: string | null
          distributor_assignment_status?: Database["public"]["Enums"]["distributor_assignment_status"]
          distributor_id?: string | null
          email?: string | null
          emergency_phone?: string | null
          expiry_date?: string | null
          full_name?: string | null
          id?: string
          language?: string
          last_login?: string | null
          last_sync?: string | null
          license_status?: Database["public"]["Enums"]["license_status"]
          license_type?: Database["public"]["Enums"]["license_type"] | null
          notes?: string | null
          permanent?: boolean | null
          phone?: string | null
          role?: string | null
          service_type?: string | null
          shop_name?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_status?: string
          address?: string | null
          avatar_url?: string | null
          city?: string | null
          commission_max?: number | null
          commission_min?: number | null
          commission_type?: string | null
          commission_value?: number | null
          created_at?: string
          credit_limit?: number | null
          current_device?: string | null
          customer_status?: string | null
          display_name?: string | null
          distributor_assignment_status?: Database["public"]["Enums"]["distributor_assignment_status"]
          distributor_id?: string | null
          email?: string | null
          emergency_phone?: string | null
          expiry_date?: string | null
          full_name?: string | null
          id?: string
          language?: string
          last_login?: string | null
          last_sync?: string | null
          license_status?: Database["public"]["Enums"]["license_status"]
          license_type?: Database["public"]["Enums"]["license_type"] | null
          notes?: string | null
          permanent?: boolean | null
          phone?: string | null
          role?: string | null
          service_type?: string | null
          shop_name?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          created_at: string
          device_id: string | null
          id: string
          ip: string | null
          last_seen_at: string
          revoked_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          id?: string
          ip?: string | null
          last_seen_at?: string
          revoked_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          id?: string
          ip?: string | null
          last_seen_at?: string
          revoked_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sim_assignments: {
        Row: {
          created_at: string
          device_id: string
          id: string
          msisdn: string | null
          operator: string
          slot: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: string
          msisdn?: string | null
          operator: string
          slot: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: string
          msisdn?: string | null
          operator?: string
          slot?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          code: string
          created_at: string
          currency: string
          description: string | null
          display_order: number
          duration_days: number
          features: Json
          id: string
          is_active: boolean
          max_devices: number
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          display_order?: number
          duration_days: number
          features?: Json
          id?: string
          is_active?: boolean
          max_devices?: number
          name: string
          price?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          display_order?: number
          duration_days?: number
          features?: Json
          id?: string
          is_active?: boolean
          max_devices?: number
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      sync_conflicts: {
        Row: {
          attempts: number
          client_id: string | null
          conflict_type: string
          created_at: string
          device_id: string | null
          entity: string
          error: string | null
          id: string
          payload: Json | null
          resolved_at: string | null
          user_id: string | null
        }
        Insert: {
          attempts?: number
          client_id?: string | null
          conflict_type: string
          created_at?: string
          device_id?: string | null
          entity: string
          error?: string | null
          id?: string
          payload?: Json | null
          resolved_at?: string | null
          user_id?: string | null
        }
        Update: {
          attempts?: number
          client_id?: string | null
          conflict_type?: string
          created_at?: string
          device_id?: string | null
          entity?: string
          error?: string | null
          id?: string
          payload?: Json | null
          resolved_at?: string | null
          user_id?: string | null
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
      sync_metrics: {
        Row: {
          created_at: string
          device_id: string | null
          duration_ms: number | null
          error: string | null
          id: string
          records_failed: number
          records_sent: number
          success: boolean
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          records_failed?: number
          records_sent?: number
          success?: boolean
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          records_failed?: number
          records_sent?: number
          success?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      system_config: {
        Row: {
          created_at: string
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
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
          package_price: number | null
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
          package_price?: number | null
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
          package_price?: number | null
          phone?: string
          status?: string
          synced_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      trials: {
        Row: {
          cancelled_at: string | null
          converted_license_id: string | null
          created_at: string
          days_total: number
          device_id: string
          expires_at: string
          extended_by_admin: boolean
          extended_by_days: number
          id: string
          started_at: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cancelled_at?: string | null
          converted_license_id?: string | null
          created_at?: string
          days_total?: number
          device_id: string
          expires_at: string
          extended_by_admin?: boolean
          extended_by_days?: number
          id?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cancelled_at?: string | null
          converted_license_id?: string | null
          created_at?: string
          days_total?: number
          device_id?: string
          expires_at?: string
          extended_by_admin?: boolean
          extended_by_days?: number
          id?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string | null
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
      notification_recipients: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          delivered_at: string
          delivered_version: number
          dismissed_at: string | null
          id: string
          is_deleted: boolean
          is_favorite: boolean
          is_read: boolean
          notification_id: string
          read_at: string | null
          read_version: number
          status: Database["public"]["Enums"]["notification_recipient_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          delivered_at?: string
          delivered_version?: number
          dismissed_at?: string | null
          id?: string
          is_deleted?: boolean
          is_favorite?: boolean
          is_read?: boolean
          notification_id: string
          read_at?: string | null
          read_version?: number
          status?: Database["public"]["Enums"]["notification_recipient_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          delivered_at?: string
          delivered_version?: number
          dismissed_at?: string | null
          id?: string
          is_deleted?: boolean
          is_favorite?: boolean
          is_read?: boolean
          notification_id?: string
          read_at?: string | null
          read_version?: number
          status?: Database["public"]["Enums"]["notification_recipient_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_recipients_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_recipients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          enabled: boolean
          id: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          sound_enabled: boolean
          updated_at: string
          user_id: string
          vibration_enabled: boolean
        }
        Insert: {
          enabled?: boolean
          id?: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          sound_enabled?: boolean
          updated_at?: string
          user_id: string
          vibration_enabled?: boolean
        }
        Update: {
          enabled?: boolean
          id?: string
          notification_type?: Database["public"]["Enums"]["notification_type"]
          sound_enabled?: boolean
          updated_at?: string
          user_id?: string
          vibration_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      notification_versions: {
        Row: {
          action_target: string | null
          action_type: Database["public"]["Enums"]["notification_action_type"] | null
          body_ar: string
          body_en: string
          edited_at: string
          edited_by: string | null
          id: string
          image_url: string | null
          metadata: Json
          notification_id: string
          notification_type: Database["public"]["Enums"]["notification_type"] | null
          priority: Database["public"]["Enums"]["notification_priority"] | null
          title_ar: string
          title_en: string
          version: number
        }
        Insert: {
          action_target?: string | null
          action_type?: Database["public"]["Enums"]["notification_action_type"] | null
          body_ar?: string
          body_en?: string
          edited_at?: string
          edited_by?: string | null
          id?: string
          image_url?: string | null
          metadata?: Json
          notification_id: string
          notification_type?: Database["public"]["Enums"]["notification_type"] | null
          priority?: Database["public"]["Enums"]["notification_priority"] | null
          title_ar?: string
          title_en?: string
          version: number
        }
        Update: {
          action_target?: string | null
          action_type?: Database["public"]["Enums"]["notification_action_type"] | null
          body_ar?: string
          body_en?: string
          edited_at?: string
          edited_by?: string | null
          id?: string
          image_url?: string | null
          metadata?: Json
          notification_id?: string
          notification_type?: Database["public"]["Enums"]["notification_type"] | null
          priority?: Database["public"]["Enums"]["notification_priority"] | null
          title_ar?: string
          title_en?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "notification_versions_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _require_admin: { Args: never; Returns: string }
      activate_license: {
        Args: {
          _device_id: string
          _fingerprint?: string
          _license_key: string
        }
        Returns: Json
      }
      admin_block_device: {
        Args: { _device_id: string; _reason?: string }
        Returns: Json
      }
      admin_convert_license: {
        Args: { _expiry?: string; _license_id: string; _permanent: boolean }
        Returns: Json
      }
      admin_convert_trial: {
        Args: { _device_id: string; _license_id: string }
        Returns: Json
      }
      admin_decide_activation: {
        Args: {
          _decision: string
          _license_id?: string
          _notes?: string
          _request_id: string
        }
        Returns: Json
      }
      admin_end_trial: { Args: { _device_id: string }; Returns: Json }
      admin_extend_license: {
        Args: { _license_id: string; _new_expiry: string }
        Returns: Json
      }
      admin_set_license_status: {
        Args: { _license_id: string; _reason?: string; _status: string }
        Returns: Json
      }
      admin_set_role: {
        Args: {
          _grant: boolean
          _role: Database["public"]["Enums"]["app_role"]
          _target_user: string
        }
        Returns: Json
      }
      admin_transfer_license: {
        Args: { _license_id: string; _new_device_id: string; _reason?: string }
        Returns: Json
      }
      admin_unblock_device: { Args: { _device_id: string }; Returns: Json }
      device_heartbeat: {
        Args: {
          _app_version?: string
          _device_id: string
          _fingerprint?: string
          _platform?: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      request_activation: {
        Args: { _device_id: string; _contact_name?: string; _contact_phone?: string; _ussd_numbers?: string[] }
        Returns: Json
      }
      admin_approve_activation: {
        Args: { _request_id: string; _license_type?: string; _expiry_date?: string; _notes?: string }
        Returns: Json
      }
      admin_reject_activation: {
        Args: { _request_id: string; _reason?: string }
        Returns: Json
      }
      admin_modify_activation: {
        Args: { _request_id: string; _license_type?: string; _expiry_date?: string; _notes?: string }
        Returns: Json
      }
      admin_revoke_activation: {
        Args: { _request_id: string; _reason?: string }
        Returns: Json
      }
      get_update_policy: {
        Args: Record<string, never>
        Returns: Json
      }
      get_contact_settings: {
        Args: Record<string, never>
        Returns: Json
      }
      admin_update_contact_settings: {
        Args: {
          p_whatsapp_enabled?: boolean
          p_whatsapp_number?: string
          p_whatsapp_url?: string
          p_email_enabled?: boolean
          p_email_address?: string
          p_facebook_enabled?: boolean
          p_facebook_url?: string
        }
        Returns: Json
      }
      get_user_license_status: {
        Args: Record<string, never>
        Returns: Json
      }
      admin_get_all_users_license: {
        Args: { _search?: string; _status?: string; _page?: number; _page_size?: number }
        Returns: Json
      }
      admin_set_license: {
        Args: { _target_user_id: string; _license_status: string; _license_type?: string; _expiry_date?: string; _notes?: string }
        Returns: Json
      }
      admin_extend_trial: {
        Args: { _target_user_id: string; _extra_days?: number }
        Returns: Json
      }
      admin_suspend_user: {
        Args: { _target_user_id: string; _status: string; _reason?: string }
        Returns: Json
      }
      get_activation_requests: {
        Args: { _status?: string }
        Returns: Json
      }
      log_last_login: {
        Args: Record<string, never>
        Returns: Json
      }
      get_pending_activation_request: {
        Args: Record<string, never>
        Returns: Json
      }
      admin_get_activation_history: {
        Args: { _target_user_id: string }
        Returns: Json
      }
      update_last_sync: {
        Args: Record<string, never>
        Returns: Json
      }
      admin_get_license_summary: {
        Args: Record<string, never>
        Returns: Json
      }
      validate_device_session: {
        Args: { _device_id: string }
        Returns: Json
      }
      user_get_notifications: {
        Args: {
          p_since?: string
          p_page?: number
          p_page_size?: number
          p_filter?: string
          p_type?: string
          p_priority?: string
          p_search?: string
          p_order?: string
          p_date_from?: string
          p_date_to?: string
          p_include_dismissed?: boolean
        }
        Returns: Json
      }
      user_mark_notification_read: {
        Args: {
          p_notification_id: string
          p_read_version?: number
          p_read_at?: string
        }
        Returns: Json
      }
      user_mark_all_notifications_read: {
        Args: Record<string, never>
        Returns: Json
      }
      user_toggle_notification_favorite: {
        Args: { p_favorite?: boolean; p_notification_id: string }
        Returns: Json
      }
      user_dismiss_notification: {
        Args: { p_notification_id: string }
        Returns: Json
      }
      user_acknowledge_notification: {
        Args: { p_notification_id: string }
        Returns: Json
      }
      user_get_notification_preferences: {
        Args: Record<string, never>
        Returns: Json
      }
      user_set_notification_preferences: {
        Args: {
          p_enabled?: boolean
          p_notification_type: Database["public"]["Enums"]["notification_type"]
          p_sound_enabled?: boolean
          p_vibration_enabled?: boolean
        }
        Returns: Json
      }
      admin_create_notification: {
        Args: {
          p_action_target?: string
          p_action_type?: Database["public"]["Enums"]["notification_action_type"]
          p_body_ar: string
          p_body_en: string
          p_expires_at?: string
          p_image_url?: string
          p_is_announcement?: boolean
          p_is_pinned?: boolean
          p_metadata?: Json
          p_priority?: Database["public"]["Enums"]["notification_priority"]
          p_requires_acknowledgement?: boolean
          p_scheduled_at?: string
          p_send_config?: Json
          p_title_ar: string
          p_title_en: string
          p_type?: Database["public"]["Enums"]["notification_type"]
        }
        Returns: Json
      }
      admin_update_notification: {
        Args: {
          p_action_target?: string
          p_action_type?: Database["public"]["Enums"]["notification_action_type"]
          p_body_ar?: string
          p_body_en?: string
          p_clear_expires_at?: boolean
          p_expires_at?: string
          p_id: string
          p_image_url?: string
          p_is_announcement?: boolean
          p_is_pinned?: boolean
          p_metadata?: Json
          p_priority?: Database["public"]["Enums"]["notification_priority"]
          p_title_ar?: string
          p_title_en?: string
          p_type?: Database["public"]["Enums"]["notification_type"]
        }
        Returns: Json
      }
      admin_delete_notification: {
        Args: { p_id: string }
        Returns: Json
      }
      admin_restore_notification: {
        Args: { p_id: string }
        Returns: Json
      }
      admin_archive_notification: {
        Args: { p_id: string }
        Returns: Json
      }
      admin_cancel_notification: {
        Args: { p_id: string }
        Returns: Json
      }
      admin_process_scheduled_notifications: {
        Args: Record<string, never>
        Returns: Json
      }
      admin_resend_notification: {
        Args: { p_id: string; p_recipient_ids?: string[] }
        Returns: Json
      }
      admin_get_notifications: {
        Args: {
          p_date_from?: string
          p_date_to?: string
          p_include_deleted?: boolean
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_status?: string
          p_type?: string
        }
        Returns: Json
      }
      admin_get_notification_detail: {
        Args: { p_id: string }
        Returns: Json
      }
      admin_search_notification_users: {
        Args: { p_page?: number; p_page_size?: number; p_search?: string }
        Returns: Json
      }
      admin_get_notification_segments: {
        Args: Record<string, never>
        Returns: Json
      }
      admin_get_notification_stats: {
        Args: Record<string, never>
        Returns: Json
      }
      admin_delete_user: {
        Args: { _target_user_id: string }
        Returns: Json
      }
      admin_get_user_devices: {
        Args: { _user_id: string }
        Returns: Json
      }
      admin_repair_self: {
        Args: Record<string, never>
        Returns: Json
      }
      admin_reset_user_device: {
        Args: { _user_id: string }
        Returns: Json
      }
      admin_get_user_payments: {
        Args: { _user_id: string }
        Returns: Json
      }
      admin_update_payment: {
        Args: {
          _amount: number
          _currency: string
          _payment_date: string
          _payment_for?: string | null
          _payment_id: string
          _payment_method: string
        }
        Returns: Json
      }
      admin_add_payment: {
        Args: {
          _amount: number
          _currency: string
          _payment_date: string
          _payment_for?: string | null
          _payment_method: string
          _user_id: string
        }
        Returns: Json
      }
      admin_delete_payment: {
        Args: { _payment_id: string }
        Returns: Json
      }
      admin_get_sync_monitor: {
        Args: { _days?: number }
        Returns: Json
      }
      admin_get_users_admin: {
        Args: {
          _account_status?: string
          _activation_status?: string
          _page?: number
          _page_size?: number
          _role?: string
          _search?: string
          _status?: string
        }
        Returns: Json
      }
      ensure_license_expiration_reminders: {
        Args: {
          p_remind_days_license?: number
          p_remind_days_trial?: number
        }
        Returns: Json
      }
      get_validation_policy: {
        Args: Record<string, never>
        Returns: Json
      }
      generate_distributor_code: {
        Args: Record<string, never>
        Returns: string
      }
      admin_grant_distributor: {
        Args: {
          _user_id: string
          _commission_rate?: number
        }
        Returns: Json
      }
      admin_revoke_distributor: {
        Args: { _user_id: string }
        Returns: Json
      }
      admin_update_distributor: {
        Args: {
          _user_id: string
          _commission_rate?: number
          _status?: string
        }
        Returns: Json
      }
      admin_get_distributors: {
        Args: {
          _search?: string
          _status?: string
          _page?: number
          _page_size?: number
        }
        Returns: Json
      }
      admin_get_distributor_detail: {
        Args: { _user_id: string }
        Returns: Json
      }
      admin_assign_customer_to_distributor: {
        Args: {
          _customer_id: string
          _distributor_user_id: string
        }
        Returns: Json
      }
      admin_remove_customer_from_distributor: {
        Args: { _customer_id: string }
        Returns: Json
      }
      link_to_distributor: {
        Args: { _code: string }
        Returns: Json
      }
      get_my_distributor: {
        Args: Record<string, never>
        Returns: Json
      }
      distributor_get_dashboard: {
        Args: Record<string, never>
        Returns: Json
      }
      distributor_get_customers: {
        Args: {
          _search?: string
          _page?: number
          _page_size?: number
        }
        Returns: Json
      }
      distributor_get_report: {
        Args: { _period?: string }
        Returns: Json
      }
      admin_record_distributor_payout: {
        Args: { p_distributor_id: string; p_amount: number; p_notes?: string }
        Returns: Json
      }
      distributor_get_payouts: {
        Args: Record<string, never>
        Returns: Json
      }
    }
     Enums: {
       activation_status: "pending" | "approved" | "rejected"
        app_role: "admin" | "user" | "distributor"
       distributor_assignment_status: "unassigned" | "assigned" | "direct_locked"
       license_status: "active" | "expired" | "inactive" | "revoked" | "pending" | "suspended" | "trial" | "rejected" | "permanent" | "blocked"
      license_type: "trial" | "year_1" | "year_2" | "year_3" | "custom_date" | "lifetime"
      notification_action_type: "none" | "screen" | "url" | "custom"
      notification_priority: "low" | "normal" | "high" | "critical"
      notification_recipient_status: "pending" | "delivered" | "failed"
      notification_status: "draft" | "scheduled" | "sent" | "archived" | "cancelled" | "failed"
      notification_type: "custom" | "license_expiring" | "license_expired" | "license_activated" | "license_revoked" | "trial_started" | "trial_ended" | "account_suspended" | "account_restored" | "security_alert" | "announcement" | "system_update" | "transfer_success" | "transfer_failure"
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
       app_role: ["admin", "user", "distributor"],
      license_status: ["active", "expired", "inactive", "revoked", "pending", "suspended", "trial", "rejected", "permanent", "blocked"],
      license_type: ["trial", "year_1", "year_2", "year_3", "custom_date", "lifetime"],
      notification_action_type: ["none", "screen", "url", "custom"],
      notification_priority: ["low", "normal", "high", "critical"],
      notification_recipient_status: ["pending", "delivered", "failed"],
      notification_status: ["draft", "scheduled", "sent", "archived", "cancelled", "failed"],
      notification_type: ["custom", "license_expiring", "license_expired", "license_activated", "license_revoked", "trial_started", "trial_ended", "account_suspended", "account_restored", "security_alert", "announcement", "system_update", "transfer_success", "transfer_failure"],
    },
  },
} as const
