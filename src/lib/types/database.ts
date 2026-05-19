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
        };
        Update: Partial<Database["public"]["Tables"]["tenants"]["Insert"]>;
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
    };
    Views: { [_ in never]: never };
    Functions: {
      create_organization: {
        Args: { p_name: string; p_slug?: string };
        Returns: Database["public"]["Tables"]["organizations"]["Row"];
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
    };
    CompositeTypes: { [_ in never]: never };
  };
};
