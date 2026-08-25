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
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          archived_at: string | null
          color: string | null
          created_at: string
          currency: string
          icon: string | null
          id: string
          institution: string | null
          is_primary: boolean
          last4: string | null
          name: string
          opening_balance: number
          sms_senders: string[]
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          currency?: string
          icon?: string | null
          id?: string
          institution?: string | null
          is_primary?: boolean
          last4?: string | null
          name: string
          opening_balance?: number
          sms_senders?: string[]
          type: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          user_id?: string
        }
        Update: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          currency?: string
          icon?: string | null
          id?: string
          institution?: string | null
          is_primary?: boolean
          last4?: string | null
          name?: string
          opening_balance?: number
          sms_senders?: string[]
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      balance_assertions: {
        Row: {
          account_id: string
          acknowledged_at: string | null
          asserted_balance: number
          computed_balance: number | null
          created_at: string
          drift: number | null
          id: string
          observed_at: string
          sms_message_id: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          acknowledged_at?: string | null
          asserted_balance: number
          computed_balance?: number | null
          created_at?: string
          drift?: number | null
          id?: string
          observed_at?: string
          sms_message_id?: string | null
          user_id?: string
        }
        Update: {
          account_id?: string
          acknowledged_at?: string | null
          asserted_balance?: number
          computed_balance?: number | null
          created_at?: string
          drift?: number | null
          id?: string
          observed_at?: string
          sms_message_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "balance_assertions_account_id_fkey"
            columns: ["account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id", "user_id"]
          },
          {
            foreignKeyName: "balance_assertions_account_id_fkey"
            columns: ["account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "balance_assertions_sms_message_id_fkey"
            columns: ["sms_message_id", "user_id"]
            isOneToOne: false
            referencedRelation: "sms_messages"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      budgets: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      categories: {
        Row: {
          archived_at: string | null
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_fixed: boolean
          is_system: boolean
          kind: Database["public"]["Enums"]["category_kind"]
          name: string
          parent_id: string | null
          slug: string | null
          sort_order: number
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_fixed?: boolean
          is_system?: boolean
          kind?: Database["public"]["Enums"]["category_kind"]
          name: string
          parent_id?: string | null
          slug?: string | null
          sort_order?: number
          user_id?: string
        }
        Update: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_fixed?: boolean
          is_system?: boolean
          kind?: Database["public"]["Enums"]["category_kind"]
          name?: string
          parent_id?: string | null
          slug?: string | null
          sort_order?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      email_accounts: {
        Row: {
          access_token: string | null
          connected_at: string
          email_address: string
          history_id: string | null
          id: string
          last_synced_at: string | null
          provider: string
          refresh_token: string
          revoked_at: string | null
          token_expires_at: string | null
          user_id: string
        }
        Insert: {
          access_token?: string | null
          connected_at?: string
          email_address: string
          history_id?: string | null
          id?: string
          last_synced_at?: string | null
          provider?: string
          refresh_token: string
          revoked_at?: string | null
          token_expires_at?: string | null
          user_id?: string
        }
        Update: {
          access_token?: string | null
          connected_at?: string
          email_address?: string
          history_id?: string | null
          id?: string
          last_synced_at?: string | null
          provider?: string
          refresh_token?: string
          revoked_at?: string | null
          token_expires_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ingest_tokens: {
        Row: {
          created_at: string
          id: string
          label: string
          last_used_at: string | null
          revoked_at: string | null
          token_hash: string
          use_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash: string
          use_count?: number
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash?: string
          use_count?: number
          user_id?: string
        }
        Relationships: []
      }
      merchants: {
        Row: {
          created_at: string
          default_category_id: string | null
          display_name: string
          id: string
          last_seen_at: string | null
          merged_into: string | null
          raw_name: string
          times_seen: number
          user_id: string
        }
        Insert: {
          created_at?: string
          default_category_id?: string | null
          display_name: string
          id?: string
          last_seen_at?: string | null
          merged_into?: string | null
          raw_name: string
          times_seen?: number
          user_id?: string
        }
        Update: {
          created_at?: string
          default_category_id?: string | null
          display_name?: string
          id?: string
          last_seen_at?: string | null
          merged_into?: string | null
          raw_name?: string
          times_seen?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchants_default_category_id_fkey"
            columns: ["default_category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "merchants_merged_into_fkey"
            columns: ["merged_into", "user_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      parser_templates: {
        Row: {
          bank_key: string
          country: string
          created_at: string
          enabled: boolean
          field_patterns: Json
          id: string
          kind: Database["public"]["Enums"]["template_kind"]
          label: string
          match_pattern: string
          priority: number
          sample: string | null
          sender_pattern: string
          user_id: string | null
        }
        Insert: {
          bank_key: string
          country?: string
          created_at?: string
          enabled?: boolean
          field_patterns?: Json
          id?: string
          kind?: Database["public"]["Enums"]["template_kind"]
          label: string
          match_pattern: string
          priority?: number
          sample?: string | null
          sender_pattern: string
          user_id?: string | null
        }
        Update: {
          bank_key?: string
          country?: string
          created_at?: string
          enabled?: boolean
          field_patterns?: Json
          id?: string
          kind?: Database["public"]["Enums"]["template_kind"]
          label?: string
          match_pattern?: string
          priority?: number
          sample?: string | null
          sender_pattern?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          currency: string
          display_name: string | null
          id: string
          month_start_day: number
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          display_name?: string | null
          id: string
          month_start_day?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          display_name?: string | null
          id?: string
          month_start_day?: number
          timezone?: string
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
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id?: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      savings_goals: {
        Row: {
          created_at: string
          id: string
          name: string
          saved_amount: number
          target_amount: number
          target_date: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          saved_amount?: number
          target_amount: number
          target_date?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          saved_amount?: number
          target_amount?: number
          target_date?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sms_messages: {
        Row: {
          body: string
          body_hash: string
          created_at: string
          device_label: string | null
          error: string | null
          id: string
          matched_template_id: string | null
          parse_status: Database["public"]["Enums"]["sms_parse_status"]
          parsed: Json | null
          pending_last4: string | null
          received_at: string
          sender: string
          user_id: string
        }
        Insert: {
          body: string
          body_hash: string
          created_at?: string
          device_label?: string | null
          error?: string | null
          id?: string
          matched_template_id?: string | null
          parse_status?: Database["public"]["Enums"]["sms_parse_status"]
          parsed?: Json | null
          pending_last4?: string | null
          received_at?: string
          sender: string
          user_id?: string
        }
        Update: {
          body?: string
          body_hash?: string
          created_at?: string
          device_label?: string | null
          error?: string | null
          id?: string
          matched_template_id?: string | null
          parse_status?: Database["public"]["Enums"]["sms_parse_status"]
          parsed?: Json | null
          pending_last4?: string | null
          received_at?: string
          sender?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_messages_matched_template_id_fkey"
            columns: ["matched_template_id"]
            isOneToOne: false
            referencedRelation: "parser_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string
          amount: number
          category_id: string | null
          confidence: number | null
          counterparty_account_id: string | null
          created_at: string
          currency: string
          dedupe_hash: string | null
          id: string
          merchant_id: string | null
          note: string | null
          occurred_at: string
          owed_amount: number | null
          owed_by: string | null
          settled_by_id: string | null
          sms_message_id: string | null
          sms_message_id_2: string | null
          source: Database["public"]["Enums"]["transaction_source"]
          split_group_id: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          tags: string[]
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          category_id?: string | null
          confidence?: number | null
          counterparty_account_id?: string | null
          created_at?: string
          currency?: string
          dedupe_hash?: string | null
          id?: string
          merchant_id?: string | null
          note?: string | null
          occurred_at?: string
          owed_amount?: number | null
          owed_by?: string | null
          settled_by_id?: string | null
          sms_message_id?: string | null
          sms_message_id_2?: string | null
          source?: Database["public"]["Enums"]["transaction_source"]
          split_group_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          tags?: string[]
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string
        }
        Update: {
          account_id?: string
          amount?: number
          category_id?: string | null
          confidence?: number | null
          counterparty_account_id?: string | null
          created_at?: string
          currency?: string
          dedupe_hash?: string | null
          id?: string
          merchant_id?: string | null
          note?: string | null
          occurred_at?: string
          owed_amount?: number | null
          owed_by?: string | null
          settled_by_id?: string | null
          sms_message_id?: string | null
          sms_message_id_2?: string | null
          source?: Database["public"]["Enums"]["transaction_source"]
          split_group_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          tags?: string[]
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id", "user_id"]
          },
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "transactions_counterparty_account_id_fkey"
            columns: ["counterparty_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "account_balances"
            referencedColumns: ["account_id", "user_id"]
          },
          {
            foreignKeyName: "transactions_counterparty_account_id_fkey"
            columns: ["counterparty_account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "transactions_merchant_id_fkey"
            columns: ["merchant_id", "user_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "transactions_settled_by_fkey"
            columns: ["settled_by_id", "user_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "transactions_sms_message_id_2_fkey"
            columns: ["sms_message_id_2", "user_id"]
            isOneToOne: false
            referencedRelation: "sms_messages"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "transactions_sms_message_id_fkey"
            columns: ["sms_message_id", "user_id"]
            isOneToOne: false
            referencedRelation: "sms_messages"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
    }
    Views: {
      account_balances: {
        Row: {
          account_id: string | null
          archived_at: string | null
          balance: number | null
          currency: string | null
          institution: string | null
          is_primary: boolean | null
          last_activity_at: string | null
          last4: string | null
          name: string | null
          opening_balance: number | null
          projected_balance: number | null
          type: Database["public"]["Enums"]["account_type"] | null
          user_id: string | null
        }
        Relationships: []
      }
      account_movements: {
        Row: {
          account_id: string | null
          delta: number | null
          occurred_at: string | null
          status: Database["public"]["Enums"]["transaction_status"] | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      account_type: "bank" | "wallet" | "cash" | "credit_card" | "savings"
      category_kind: "expense" | "income"
      sms_parse_status:
        | "parsed"
        | "needs_account"
        | "unmatched"
        | "ignored"
        | "duplicate"
      template_kind: "purchase" | "credit" | "atm" | "fee" | "ignore"
      transaction_source:
        | "manual"
        | "sms"
        | "recurring"
        | "split"
        | "import"
        | "adjustment"
      transaction_status: "cleared" | "pending" | "needs_review" | "void"
      transaction_type: "expense" | "income" | "transfer"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_type: ["bank", "wallet", "cash", "credit_card", "savings"],
      category_kind: ["expense", "income"],
      sms_parse_status: [
        "parsed",
        "needs_account",
        "unmatched",
        "ignored",
        "duplicate",
      ],
      template_kind: ["purchase", "credit", "atm", "fee", "ignore"],
      transaction_source: [
        "manual",
        "sms",
        "recurring",
        "split",
        "import",
        "adjustment",
      ],
      transaction_status: ["cleared", "pending", "needs_review", "void"],
      transaction_type: ["expense", "income", "transfer"],
    },
  },
} as const
