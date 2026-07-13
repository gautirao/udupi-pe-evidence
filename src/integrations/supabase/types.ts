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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      facebook_groups: {
        Row: {
          automation_enabled: boolean
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_enabled: boolean
          name: string
          updated_at: string
          url: string
        }
        Insert: {
          automation_enabled?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean
          name: string
          updated_at?: string
          url: string
        }
        Update: {
          automation_enabled?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_enabled?: boolean
          name?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      feed_runs: {
        Row: {
          created_at: string
          ended_at: string | null
          error_log: Json | null
          facebook_group_id: string | null
          id: string
          posts_failed: number | null
          posts_fetched: number | null
          posts_parsed: number | null
          started_at: string | null
          status: Database["public"]["Enums"]["feed_run_status"]
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          error_log?: Json | null
          facebook_group_id?: string | null
          id?: string
          posts_failed?: number | null
          posts_fetched?: number | null
          posts_parsed?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["feed_run_status"]
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          error_log?: Json | null
          facebook_group_id?: string | null
          id?: string
          posts_failed?: number | null
          posts_fetched?: number | null
          posts_parsed?: number | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["feed_run_status"]
        }
        Relationships: [
          {
            foreignKeyName: "feed_runs_facebook_group_id_fkey"
            columns: ["facebook_group_id"]
            isOneToOne: false
            referencedRelation: "facebook_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      geocode_cache: {
        Row: {
          display_name: string | null
          fetched_at: string
          id: string
          latitude: number
          locality: string
          longitude: number
        }
        Insert: {
          display_name?: string | null
          fetched_at?: string
          id?: string
          latitude: number
          locality: string
          longitude: number
        }
        Update: {
          display_name?: string | null
          fetched_at?: string
          id?: string
          latitude?: number
          locality?: string
          longitude?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      property_listings: {
        Row: {
          bathrooms: number | null
          bedrooms: number | null
          built_area: number | null
          built_area_unit: string | null
          carpet_area: number | null
          carpet_area_unit: string | null
          commercial_usage: string | null
          confidence_score: number | null
          contact_info: string | null
          contact_phone: string | null
          created_at: string
          description: string | null
          floor_number: number | null
          furnishing_status: string | null
          id: string
          is_duplicate: boolean
          is_valid: boolean
          land_area: number | null
          land_area_unit: string | null
          language_detected: string | null
          latitude: number | null
          listing_purpose: string
          locality: string | null
          lock_in_months: number | null
          longitude: number | null
          monthly_rent: number | null
          number_of_units: number | null
          parking_count: number | null
          parsed_data: Json | null
          price: number | null
          price_per_cent_paise: number | null
          price_unit: string | null
          property_type: Database["public"]["Enums"]["property_type"]
          raw_post_id: string | null
          road_frontage_ft: number | null
          rera_number: string | null
          security_deposit_months: number | null
          seller_type: string
          status: string
          title: string | null
          total_floors: number | null
          updated_at: string
          updated_by: string | null
          washrooms: number | null
        }
        Insert: {
          bathrooms?: number | null
          bedrooms?: number | null
          built_area?: number | null
          built_area_unit?: string | null
          carpet_area?: number | null
          carpet_area_unit?: string | null
          commercial_usage?: string | null
          confidence_score?: number | null
          contact_info?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          floor_number?: number | null
          furnishing_status?: string | null
          id?: string
          is_duplicate?: boolean
          is_valid?: boolean
          land_area?: number | null
          land_area_unit?: string | null
          language_detected?: string | null
          latitude?: number | null
          listing_purpose?: string
          locality?: string | null
          lock_in_months?: number | null
          longitude?: number | null
          monthly_rent?: number | null
          number_of_units?: number | null
          parking_count?: number | null
          parsed_data?: Json | null
          price?: number | null
          price_per_cent_paise?: number | null
          price_unit?: string | null
          property_type?: Database["public"]["Enums"]["property_type"]
          raw_post_id?: string | null
          road_frontage_ft?: number | null
          rera_number?: string | null
          security_deposit_months?: number | null
          seller_type?: string
          status?: string
          title?: string | null
          total_floors?: number | null
          updated_at?: string
          updated_by?: string | null
          washrooms?: number | null
        }
        Update: {
          bathrooms?: number | null
          bedrooms?: number | null
          built_area?: number | null
          built_area_unit?: string | null
          carpet_area?: number | null
          carpet_area_unit?: string | null
          commercial_usage?: string | null
          confidence_score?: number | null
          contact_info?: string | null
          contact_phone?: string | null
          created_at?: string
          description?: string | null
          floor_number?: number | null
          furnishing_status?: string | null
          id?: string
          is_duplicate?: boolean
          is_valid?: boolean
          land_area?: number | null
          land_area_unit?: string | null
          language_detected?: string | null
          latitude?: number | null
          listing_purpose?: string
          locality?: string | null
          lock_in_months?: number | null
          longitude?: number | null
          monthly_rent?: number | null
          number_of_units?: number | null
          parking_count?: number | null
          parsed_data?: Json | null
          price?: number | null
          price_per_cent_paise?: number | null
          price_unit?: string | null
          property_type?: Database["public"]["Enums"]["property_type"]
          raw_post_id?: string | null
          road_frontage_ft?: number | null
          rera_number?: string | null
          security_deposit_months?: number | null
          seller_type?: string
          status?: string
          title?: string | null
          total_floors?: number | null
          updated_at?: string
          updated_by?: string | null
          washrooms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "property_listings_raw_post_id_fkey"
            columns: ["raw_post_id"]
            isOneToOne: false
            referencedRelation: "raw_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_posts: {
        Row: {
          author_name: string | null
          content: string
          created_at: string
          external_post_id: string | null
          feed_run_id: string | null
          id: string
          images: Json | null
          is_processed: boolean
          posted_at: string | null
          source_url: string | null
        }
        Insert: {
          author_name?: string | null
          content: string
          created_at?: string
          external_post_id?: string | null
          feed_run_id?: string | null
          id?: string
          images?: Json | null
          is_processed?: boolean
          posted_at?: string | null
          source_url?: string | null
        }
        Update: {
          author_name?: string | null
          content?: string
          created_at?: string
          external_post_id?: string | null
          feed_run_id?: string | null
          id?: string
          images?: Json | null
          is_processed?: boolean
          posted_at?: string | null
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raw_posts_feed_run_id_fkey"
            columns: ["feed_run_id"]
            isOneToOne: false
            referencedRelation: "feed_runs"
            referencedColumns: ["id"]
          },
        ]
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
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
      feed_run_status: "pending" | "running" | "success" | "partial" | "failed"
      property_type: "land" | "house" | "commercial" | "other" | "apartment"
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
      app_role: ["admin", "user"],
      feed_run_status: ["pending", "running", "success", "partial", "failed"],
      property_type: ["land", "house", "commercial", "other", "apartment"],
    },
  },
} as const
