/**
 * database.ts — TypeScript shape of the PMS-Build Postgres schema.
 *
 * Authored from supabase/migrations/ and VERIFIED 2026-05-18 by direct
 * introspection of the live dev database (scripts/schema-dump.ts): every
 * table, column, nullability, and enum matches the applied schema exactly.
 *
 * `supabase gen types` could not run in the build environment (it requires
 * Docker for --db-url, or Supabase API auth for --project-id). To regenerate
 * with the official tool later, from a machine with Docker / a linked project:
 *   supabase gen types typescript --linked > src/lib/types/database.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          status: Database["public"]["Enums"]["organization_status"];
          ai_mode: Database["public"]["Enums"]["ai_mode"];
          email_mode: Database["public"]["Enums"]["email_mode"];
          logo_url: string | null;
          primary_color: string | null;
          billing_email: string | null;
          phone: string | null;
          website: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          status?: Database["public"]["Enums"]["organization_status"];
          ai_mode?: Database["public"]["Enums"]["ai_mode"];
          email_mode?: Database["public"]["Enums"]["email_mode"];
          logo_url?: string | null;
          primary_color?: string | null;
          billing_email?: string | null;
          phone?: string | null;
          website?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
        Relationships: [];
      };
      users: {
        Row: {
          id: string;
          organization_id: string | null;
          vendor_id: string | null;
          email: string;
          full_name: string | null;
          phone: string | null;
          title: string | null;
          avatar_url: string | null;
          is_active: boolean;
          is_super_admin: boolean;
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          organization_id?: string | null;
          vendor_id?: string | null;
          email: string;
          full_name?: string | null;
          phone?: string | null;
          title?: string | null;
          avatar_url?: string | null;
          is_active?: boolean;
          is_super_admin?: boolean;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>;
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string;
          role: Database["public"]["Enums"]["user_role"];
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id: string;
          role: Database["public"]["Enums"]["user_role"];
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["user_roles"]["Insert"]>;
        Relationships: [];
      };
      settings: {
        Row: {
          id: string;
          organization_id: string;
          module: string;
          key: string;
          value: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          module?: string;
          key: string;
          value?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["settings"]["Insert"]>;
        Relationships: [];
      };
      properties: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          property_type: Database["public"]["Enums"]["property_type"];
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          state: string | null;
          postal_code: string | null;
          country: string;
          year_built: number | null;
          planned_units: number;
          description: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          property_type?: Database["public"]["Enums"]["property_type"];
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          country?: string;
          year_built?: number | null;
          planned_units?: number;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["properties"]["Insert"]>;
        Relationships: [];
      };
      buildings: {
        Row: {
          id: string;
          organization_id: string;
          property_id: string;
          name: string;
          status: Database["public"]["Enums"]["building_status"];
          floors: number | null;
          year_built: number | null;
          address_line1: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          property_id: string;
          name: string;
          status?: Database["public"]["Enums"]["building_status"];
          floors?: number | null;
          year_built?: number | null;
          address_line1?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["buildings"]["Insert"]>;
        Relationships: [];
      };
      units: {
        Row: {
          id: string;
          organization_id: string;
          property_id: string;
          building_id: string | null;
          unit_number: string;
          status: Database["public"]["Enums"]["unit_status"];
          floor: number | null;
          bedrooms: number;
          bathrooms: number;
          square_feet: number | null;
          market_rent: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          property_id: string;
          building_id?: string | null;
          unit_number: string;
          status?: Database["public"]["Enums"]["unit_status"];
          floor?: number | null;
          bedrooms?: number;
          bathrooms?: number;
          square_feet?: number | null;
          market_rent?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["units"]["Insert"]>;
        Relationships: [];
      };
      tenants: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string | null;
          property_id: string | null;
          unit_id: string | null;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
          status: Database["public"]["Enums"]["tenant_status"];
          date_of_birth: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          move_in_date: string | null;
          move_out_date: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
          lease_id: string | null;
          source_application_id: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id?: string | null;
          property_id?: string | null;
          unit_id?: string | null;
          first_name: string;
          last_name: string;
          email?: string | null;
          phone?: string | null;
          status?: Database["public"]["Enums"]["tenant_status"];
          date_of_birth?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          move_in_date?: string | null;
          move_out_date?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          lease_id?: string | null;
          source_application_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["tenants"]["Insert"]>;
        Relationships: [];
      };
      tenant_invites: {
        Row: {
          id: string;
          organization_id: string;
          tenant_id: string;
          email: string;
          token_hash: string;
          expires_at: string;
          accepted_at: string | null;
          accepted_by: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          organization_id: string;
          tenant_id: string;
          email: string;
          token_hash: string;
          expires_at: string;
          accepted_at?: string | null;
          accepted_by?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["tenant_invites"]["Insert"]>;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          organization_id: string | null;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          actor_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Insert"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          title: string;
          body: string | null;
          type: string;
          link: string | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          title: string;
          body?: string | null;
          type?: string;
          link?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
        Relationships: [];
      };
      ai_logs: {
        Row: {
          id: string;
          organization_id: string;
          actor_id: string | null;
          module: string;
          action_type: string;
          ai_mode: Database["public"]["Enums"]["ai_mode"];
          status: string;
          prompt: Json | null;
          response: Json | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          actor_id?: string | null;
          module: string;
          action_type: string;
          ai_mode: Database["public"]["Enums"]["ai_mode"];
          status?: string;
          prompt?: Json | null;
          response?: Json | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_logs"]["Insert"]>;
        Relationships: [];
      };
      automation_logs: {
        Row: {
          id: string;
          organization_id: string;
          automation_id: string | null;
          module: string;
          action_type: string;
          status: string;
          result: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          automation_id?: string | null;
          module: string;
          action_type: string;
          status?: string;
          result?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["automation_logs"]["Insert"]>;
        Relationships: [];
      };
      vendors: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          trade: string | null;
          status: Database["public"]["Enums"]["vendor_status"];
          email: string | null;
          phone: string | null;
          website: string | null;
          address_line1: string | null;
          city: string | null;
          state: string | null;
          postal_code: string | null;
          notes: string | null;
          rating_avg: number | null;
          rating_count: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          trade?: string | null;
          status?: Database["public"]["Enums"]["vendor_status"];
          email?: string | null;
          phone?: string | null;
          website?: string | null;
          address_line1?: string | null;
          city?: string | null;
          state?: string | null;
          postal_code?: string | null;
          notes?: string | null;
          rating_avg?: number | null;
          rating_count?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["vendors"]["Insert"]>;
        Relationships: [];
      };
      vendor_contacts: {
        Row: {
          id: string;
          organization_id: string;
          vendor_id: string;
          user_id: string | null;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
          title: string | null;
          is_primary: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          vendor_id: string;
          user_id?: string | null;
          first_name: string;
          last_name: string;
          email?: string | null;
          phone?: string | null;
          title?: string | null;
          is_primary?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["vendor_contacts"]["Insert"]>;
        Relationships: [];
      };
      vendor_documents: {
        Row: {
          id: string;
          organization_id: string;
          vendor_id: string;
          document_type: Database["public"]["Enums"]["vendor_document_type"];
          name: string;
          file_path: string | null;
          issued_on: string | null;
          expires_on: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          vendor_id: string;
          document_type?: Database["public"]["Enums"]["vendor_document_type"];
          name: string;
          file_path?: string | null;
          issued_on?: string | null;
          expires_on?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["vendor_documents"]["Insert"]>;
        Relationships: [];
      };
      vendor_invoices: {
        Row: {
          id: string;
          organization_id: string;
          vendor_id: string;
          work_order_id: string | null;
          invoice_number: string | null;
          amount: number;
          status: Database["public"]["Enums"]["vendor_invoice_status"];
          issued_on: string | null;
          due_on: string | null;
          paid_on: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          vendor_id: string;
          work_order_id?: string | null;
          invoice_number?: string | null;
          amount?: number;
          status?: Database["public"]["Enums"]["vendor_invoice_status"];
          issued_on?: string | null;
          due_on?: string | null;
          paid_on?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["vendor_invoices"]["Insert"]>;
        Relationships: [];
      };
      vendor_ratings: {
        Row: {
          id: string;
          organization_id: string;
          vendor_id: string;
          work_order_id: string | null;
          rating: number;
          review: string | null;
          rated_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          vendor_id: string;
          work_order_id?: string | null;
          rating: number;
          review?: string | null;
          rated_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["vendor_ratings"]["Insert"]>;
        Relationships: [];
      };
      maintenance_requests: {
        Row: {
          id: string;
          organization_id: string;
          property_id: string;
          unit_id: string | null;
          tenant_id: string | null;
          reported_by: string | null;
          title: string;
          description: string | null;
          category: Database["public"]["Enums"]["maintenance_category"];
          priority: Database["public"]["Enums"]["maintenance_priority"];
          status: Database["public"]["Enums"]["maintenance_status"];
          location_notes: string | null;
          access_instructions: string | null;
          permission_to_enter: boolean;
          ai_triage: Json | null;
          ai_triaged_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          property_id: string;
          unit_id?: string | null;
          tenant_id?: string | null;
          reported_by?: string | null;
          title: string;
          description?: string | null;
          category?: Database["public"]["Enums"]["maintenance_category"];
          priority?: Database["public"]["Enums"]["maintenance_priority"];
          status?: Database["public"]["Enums"]["maintenance_status"];
          location_notes?: string | null;
          access_instructions?: string | null;
          permission_to_enter?: boolean;
          ai_triage?: Json | null;
          ai_triaged_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["maintenance_requests"]["Insert"]>;
        Relationships: [];
      };
      work_orders: {
        Row: {
          id: string;
          organization_id: string;
          maintenance_request_id: string | null;
          property_id: string;
          unit_id: string | null;
          number: string | null;
          title: string;
          description: string | null;
          category: Database["public"]["Enums"]["maintenance_category"];
          priority: Database["public"]["Enums"]["maintenance_priority"];
          status: Database["public"]["Enums"]["work_order_status"];
          assignee_type: Database["public"]["Enums"]["work_order_assignee"];
          assigned_vendor_id: string | null;
          assigned_user_id: string | null;
          scheduled_for: string | null;
          sla_due_at: string | null;
          accepted_at: string | null;
          completed_at: string | null;
          cost_estimate: number | null;
          cost_actual: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          maintenance_request_id?: string | null;
          property_id: string;
          unit_id?: string | null;
          number?: string | null;
          title: string;
          description?: string | null;
          category?: Database["public"]["Enums"]["maintenance_category"];
          priority?: Database["public"]["Enums"]["maintenance_priority"];
          status?: Database["public"]["Enums"]["work_order_status"];
          assignee_type?: Database["public"]["Enums"]["work_order_assignee"];
          assigned_vendor_id?: string | null;
          assigned_user_id?: string | null;
          scheduled_for?: string | null;
          sla_due_at?: string | null;
          accepted_at?: string | null;
          completed_at?: string | null;
          cost_estimate?: number | null;
          cost_actual?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["work_orders"]["Insert"]>;
        Relationships: [];
      };
      work_order_photos: {
        Row: {
          id: string;
          organization_id: string;
          work_order_id: string;
          file_path: string;
          caption: string | null;
          kind: string;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          work_order_id: string;
          file_path: string;
          caption?: string | null;
          kind?: string;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["work_order_photos"]["Insert"]>;
        Relationships: [];
      };
      email_log: {
        Row: {
          id: string;
          organization_id: string | null;
          to_address: string;
          subject: string;
          template: string;
          status: string;
          mode: Database["public"]["Enums"]["email_mode"];
          reason: string | null;
          related_entity_type: string | null;
          related_entity_id: string | null;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          to_address: string;
          subject: string;
          template: string;
          status?: string;
          mode: Database["public"]["Enums"]["email_mode"];
          reason?: string | null;
          related_entity_type?: string | null;
          related_entity_id?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["email_log"]["Insert"]>;
        Relationships: [];
      };
      leases: {
        Row: {
          id: string;
          organization_id: string;
          unit_id: string;
          start_date: string;
          end_date: string | null;
          monthly_rent: number;
          status: Database["public"]["Enums"]["lease_status"];
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          unit_id: string;
          start_date: string;
          end_date?: string | null;
          monthly_rent: number;
          status?: Database["public"]["Enums"]["lease_status"];
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["leases"]["Insert"]>;
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          organization_id: string;
          status: Database["public"]["Enums"]["lead_status"];
          source: Database["public"]["Enums"]["lead_source"];
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
          assigned_to: string | null;
          desired_property_id: string | null;
          desired_move_in: string | null;
          desired_bedrooms: number | null;
          desired_budget: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          status?: Database["public"]["Enums"]["lead_status"];
          source?: Database["public"]["Enums"]["lead_source"];
          first_name: string;
          last_name: string;
          email?: string | null;
          phone?: string | null;
          assigned_to?: string | null;
          desired_property_id?: string | null;
          desired_move_in?: string | null;
          desired_bedrooms?: number | null;
          desired_budget?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["leads"]["Insert"]>;
        Relationships: [];
      };
      tours: {
        Row: {
          id: string;
          organization_id: string;
          lead_id: string;
          unit_id: string | null;
          agent_id: string | null;
          scheduled_at: string;
          status: Database["public"]["Enums"]["tour_status"];
          outcome_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          lead_id: string;
          unit_id?: string | null;
          agent_id?: string | null;
          scheduled_at: string;
          status?: Database["public"]["Enums"]["tour_status"];
          outcome_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tours"]["Insert"]>;
        Relationships: [];
      };
      applications: {
        Row: {
          id: string;
          organization_id: string;
          lead_id: string | null;
          unit_id: string;
          status: Database["public"]["Enums"]["application_status"];
          applicant_first_name: string;
          applicant_last_name: string;
          applicant_email: string;
          applicant_phone: string | null;
          desired_move_in: string | null;
          monthly_income: number | null;
          employment_status: string | null;
          prior_address: string | null;
          background_check_consent: boolean;
          submitted_at: string | null;
          decided_at: string | null;
          decided_by: string | null;
          decision_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          lead_id?: string | null;
          unit_id: string;
          status?: Database["public"]["Enums"]["application_status"];
          applicant_first_name: string;
          applicant_last_name: string;
          applicant_email: string;
          applicant_phone?: string | null;
          desired_move_in?: string | null;
          monthly_income?: number | null;
          employment_status?: string | null;
          prior_address?: string | null;
          background_check_consent?: boolean;
          submitted_at?: string | null;
          decided_at?: string | null;
          decided_by?: string | null;
          decision_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["applications"]["Insert"]>;
        Relationships: [];
      };
      rent_charges: {
        Row: {
          id: string;
          organization_id: string;
          lease_id: string;
          tenant_id: string;
          unit_id: string;
          charge_type: Database["public"]["Enums"]["rent_charge_type"];
          amount_due: number;
          due_date: string;
          period_start: string | null;
          period_end: string | null;
          status: Database["public"]["Enums"]["rent_charge_status"];
          description: string | null;
          notes: string | null;
          voided_at: string | null;
          voided_by: string | null;
          void_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          lease_id: string;
          tenant_id: string;
          unit_id: string;
          charge_type?: Database["public"]["Enums"]["rent_charge_type"];
          amount_due: number;
          due_date: string;
          period_start?: string | null;
          period_end?: string | null;
          status?: Database["public"]["Enums"]["rent_charge_status"];
          description?: string | null;
          notes?: string | null;
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["rent_charges"]["Insert"]>;
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          organization_id: string;
          charge_id: string;
          tenant_id: string;
          amount_paid: number;
          paid_at: string;
          method: Database["public"]["Enums"]["payment_method"];
          reference: string | null;
          notes: string | null;
          recorded_by: string;
          refunded_at: string | null;
          refunded_by: string | null;
          refund_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          charge_id: string;
          tenant_id: string;
          amount_paid: number;
          paid_at: string;
          method?: Database["public"]["Enums"]["payment_method"];
          reference?: string | null;
          notes?: string | null;
          recorded_by: string;
          refunded_at?: string | null;
          refunded_by?: string | null;
          refund_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          organization_id: string;
          tenant_id: string;
          sender_id: string | null;
          sender_role: Database["public"]["Enums"]["message_sender_role"];
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          tenant_id: string;
          sender_id?: string | null;
          sender_role: Database["public"]["Enums"]["message_sender_role"];
          body: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
        Relationships: [];
      };
      tenant_conversation_state: {
        Row: {
          tenant_id: string;
          organization_id: string;
          last_read_by_tenant_at: string | null;
          last_read_by_staff_at: string | null;
          updated_at: string;
        };
        Insert: {
          tenant_id: string;
          organization_id: string;
          last_read_by_tenant_at?: string | null;
          last_read_by_staff_at?: string | null;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["tenant_conversation_state"]["Insert"]
        >;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_organization: {
        Args: { p_name: string; p_slug?: string };
        Returns: Database["public"]["Tables"]["organizations"]["Row"];
      };
      create_lease_with_tenants: {
        Args: {
          p_organization_id: string;
          p_unit_id: string;
          p_start_date: string;
          p_end_date: string | null;
          p_monthly_rent: number;
          p_status?: Database["public"]["Enums"]["lease_status"];
          p_notes?: string | null;
          p_tenant_ids?: string[];
        };
        Returns: string;
      };
      accept_tenant_invite: {
        Args: { p_token_hash: string; p_user_id: string };
        Returns: {
          ok: boolean;
          error_code: string | null;
          tenant_id: string | null;
          organization_id: string | null;
        }[];
      };
      current_user_org_id: { Args: Record<string, never>; Returns: string | null };
      is_super_admin: { Args: Record<string, never>; Returns: boolean };
      is_org_staff: { Args: Record<string, never>; Returns: boolean };
      is_org_manager: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: {
      user_role:
        | "SUPER_ADMIN"
        | "OWNER"
        | "REGIONAL_MANAGER"
        | "PROPERTY_MANAGER"
        | "LEASING_AGENT"
        | "MAINTENANCE_MANAGER"
        | "MAINTENANCE_TECH"
        | "VENDOR_ADMIN"
        | "VENDOR_TECH"
        | "TENANT"
        | "INVESTOR"
        | "ACCOUNTING";
      ai_mode:
        | "disabled"
        | "draft_only"
        | "suggest_only"
        | "auto_with_approval"
        | "fully_automated";
      email_mode: "test" | "production";
      organization_status: "trial" | "active" | "suspended";
      property_type:
        | "apartment"
        | "condo"
        | "townhome"
        | "single_family"
        | "duplex"
        | "mixed_use"
        | "commercial"
        | "other";
      building_status: "active" | "inactive" | "under_construction";
      unit_status:
        | "vacant"
        | "occupied"
        | "notice"
        | "make_ready"
        | "off_market"
        | "model"
        | "down";
      tenant_status:
        | "prospect"
        | "applicant"
        | "current"
        | "notice"
        | "past"
        | "evicted";
      maintenance_status:
        | "submitted"
        | "triaged"
        | "scheduled"
        | "in_progress"
        | "on_hold"
        | "completed"
        | "cancelled";
      maintenance_priority: "low" | "medium" | "high" | "emergency";
      maintenance_category:
        | "plumbing"
        | "electrical"
        | "hvac"
        | "appliance"
        | "structural"
        | "pest"
        | "landscaping"
        | "locks"
        | "general"
        | "other";
      work_order_status:
        | "open"
        | "assigned"
        | "accepted"
        | "in_progress"
        | "on_hold"
        | "completed"
        | "cancelled";
      work_order_assignee: "unassigned" | "internal" | "vendor";
      vendor_status: "pending" | "active" | "inactive" | "suspended";
      vendor_document_type:
        | "insurance"
        | "license"
        | "w9"
        | "contract"
        | "certification"
        | "other";
      vendor_invoice_status:
        | "draft"
        | "submitted"
        | "approved"
        | "rejected"
        | "paid";
      lease_status: "upcoming" | "active" | "ended";
      message_sender_role: "tenant" | "staff";
      lead_status:
        | "new"
        | "contacted"
        | "qualified"
        | "tour_scheduled"
        | "applied"
        | "converted"
        | "disqualified"
        | "lost";
      lead_source: "website" | "referral" | "walkin" | "partner" | "other";
      tour_status: "scheduled" | "completed" | "no_show" | "cancelled";
      application_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "approved"
        | "rejected"
        | "withdrawn";
      rent_charge_type: "rent" | "deposit" | "fee" | "credit" | "other";
      rent_charge_status: "open" | "paid" | "partial" | "voided";
      payment_method:
        | "cash"
        | "check"
        | "ach"
        | "wire"
        | "money_order"
        | "zelle"
        | "card_offline"
        | "other";
    };
    CompositeTypes: { [_ in never]: never };
  };
};
