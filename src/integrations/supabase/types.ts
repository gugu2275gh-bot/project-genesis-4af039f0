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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      contacts: {
        Row: {
          country_of_origin: string | null
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          nationality: string | null
          origin_channel: Database["public"]["Enums"]["origin_channel"] | null
          phone: number | null
          preferred_language:
            | Database["public"]["Enums"]["language_code"]
            | null
          updated_at: string | null
        }
        Insert: {
          country_of_origin?: string | null
          created_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          nationality?: string | null
          origin_channel?: Database["public"]["Enums"]["origin_channel"] | null
          phone?: number | null
          preferred_language?:
            | Database["public"]["Enums"]["language_code"]
            | null
          updated_at?: string | null
        }
        Update: {
          country_of_origin?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          nationality?: string | null
          origin_channel?: Database["public"]["Enums"]["origin_channel"] | null
          phone?: number | null
          preferred_language?:
            | Database["public"]["Enums"]["language_code"]
            | null
          updated_at?: string | null
        }
        Relationships: []
      }
      contracts: {
        Row: {
          created_at: string | null
          created_by_user_id: string | null
          currency: string | null
          external_signature_id: string | null
          id: string
          installment_conditions: string | null
          language: Database["public"]["Enums"]["language_code"] | null
          opportunity_id: string
          refund_policy_text: string | null
          scope_summary: string | null
          service_type: Database["public"]["Enums"]["service_interest"]
          signed_at: string | null
          status: Database["public"]["Enums"]["contract_status"] | null
          total_fee: number | null
          updated_at: string | null
          updated_by_user_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by_user_id?: string | null
          currency?: string | null
          external_signature_id?: string | null
          id?: string
          installment_conditions?: string | null
          language?: Database["public"]["Enums"]["language_code"] | null
          opportunity_id: string
          refund_policy_text?: string | null
          scope_summary?: string | null
          service_type: Database["public"]["Enums"]["service_interest"]
          signed_at?: string | null
          status?: Database["public"]["Enums"]["contract_status"] | null
          total_fee?: number | null
          updated_at?: string | null
          updated_by_user_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by_user_id?: string | null
          currency?: string | null
          external_signature_id?: string | null
          id?: string
          installment_conditions?: string | null
          language?: Database["public"]["Enums"]["language_code"] | null
          opportunity_id?: string
          refund_policy_text?: string | null
          scope_summary?: string | null
          service_type?: Database["public"]["Enums"]["service_interest"]
          signed_at?: string | null
          status?: Database["public"]["Enums"]["contract_status"] | null
          total_fee?: number | null
          updated_at?: string | null
          updated_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions: {
        Row: {
          channel: Database["public"]["Enums"]["interaction_channel"] | null
          contact_id: string | null
          content: string | null
          created_at: string | null
          created_by_user_id: string | null
          direction: Database["public"]["Enums"]["interaction_direction"] | null
          id: string
          lead_id: string | null
          origin_bot: boolean | null
        }
        Insert: {
          channel?: Database["public"]["Enums"]["interaction_channel"] | null
          contact_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          direction?:
            | Database["public"]["Enums"]["interaction_direction"]
            | null
          id?: string
          lead_id?: string | null
          origin_bot?: boolean | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["interaction_channel"] | null
          contact_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          direction?:
            | Database["public"]["Enums"]["interaction_direction"]
            | null
          id?: string
          lead_id?: string | null
          origin_bot?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "interactions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_intake: {
        Row: {
          contact_id: string | null
          created_at: string | null
          email: string | null
          error_message: string | null
          external_reference_id: string | null
          full_name: string | null
          id: string
          lead_id: string | null
          message_summary: string | null
          origin_channel: string | null
          phone: string
          preferred_language: string | null
          processed_at: string | null
          processed_by_user_id: string | null
          processing_notes: string | null
          raw_payload: Json | null
          service_interest: string | null
          source_system: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          email?: string | null
          error_message?: string | null
          external_reference_id?: string | null
          full_name?: string | null
          id?: string
          lead_id?: string | null
          message_summary?: string | null
          origin_channel?: string | null
          phone: string
          preferred_language?: string | null
          processed_at?: string | null
          processed_by_user_id?: string | null
          processing_notes?: string | null
          raw_payload?: Json | null
          service_interest?: string | null
          source_system?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          email?: string | null
          error_message?: string | null
          external_reference_id?: string | null
          full_name?: string | null
          id?: string
          lead_id?: string | null
          message_summary?: string | null
          origin_channel?: string | null
          phone?: string
          preferred_language?: string | null
          processed_at?: string | null
          processed_by_user_id?: string | null
          processing_notes?: string | null
          raw_payload?: Json | null
          service_interest?: string | null
          source_system?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          contact_id: string
          created_at: string | null
          created_by_user_id: string | null
          id: string
          interest_confirmed: boolean | null
          notes: string | null
          service_interest:
            | Database["public"]["Enums"]["service_interest"]
            | null
          status: Database["public"]["Enums"]["lead_status"] | null
          updated_at: string | null
          updated_by_user_id: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          created_by_user_id?: string | null
          id?: string
          interest_confirmed?: boolean | null
          notes?: string | null
          service_interest?:
            | Database["public"]["Enums"]["service_interest"]
            | null
          status?: Database["public"]["Enums"]["lead_status"] | null
          updated_at?: string | null
          updated_by_user_id?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
          id?: string
          interest_confirmed?: boolean | null
          notes?: string | null
          service_interest?:
            | Database["public"]["Enums"]["service_interest"]
            | null
          status?: Database["public"]["Enums"]["lead_status"] | null
          updated_at?: string | null
          updated_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      nps_surveys: {
        Row: {
          comment: string | null
          created_at: string | null
          id: string
          score: number | null
          service_case_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          id?: string
          score?: number | null
          service_case_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          id?: string
          score?: number | null
          service_case_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nps_surveys_service_case_id_fkey"
            columns: ["service_case_id"]
            isOneToOne: false
            referencedRelation: "service_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          created_at: string | null
          currency: string | null
          id: string
          lead_id: string
          reason_lost: string | null
          status: Database["public"]["Enums"]["opportunity_status"] | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          id?: string
          lead_id: string
          reason_lost?: string | null
          status?: Database["public"]["Enums"]["opportunity_status"] | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          id?: string
          lead_id?: string
          reason_lost?: string | null
          status?: Database["public"]["Enums"]["opportunity_status"] | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          contract_id: string | null
          created_at: string | null
          currency: string | null
          id: string
          opportunity_id: string
          paid_at: string | null
          payment_link: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          status: Database["public"]["Enums"]["payment_status"] | null
          transaction_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          contract_id?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          opportunity_id: string
          paid_at?: string | null
          payment_link?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          transaction_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          contract_id?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          opportunity_id?: string
          paid_at?: string | null
          payment_link?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          transaction_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name: string
          id: string
          is_active?: boolean | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      requirements_from_authority: {
        Row: {
          created_at: string | null
          description: string
          id: string
          internal_deadline_date: string | null
          official_deadline_date: string | null
          service_case_id: string
          status: Database["public"]["Enums"]["requirement_status"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          internal_deadline_date?: string | null
          official_deadline_date?: string | null
          service_case_id: string
          status?: Database["public"]["Enums"]["requirement_status"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          internal_deadline_date?: string | null
          official_deadline_date?: string | null
          service_case_id?: string
          status?: Database["public"]["Enums"]["requirement_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requirements_from_authority_service_case_id_fkey"
            columns: ["service_case_id"]
            isOneToOne: false
            referencedRelation: "service_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      service_cases: {
        Row: {
          assigned_to_user_id: string | null
          client_user_id: string | null
          created_at: string | null
          decision_date: string | null
          decision_result: Database["public"]["Enums"]["decision_result"] | null
          id: string
          opportunity_id: string
          protocol_number: string | null
          sector: Database["public"]["Enums"]["service_sector"]
          service_type: Database["public"]["Enums"]["service_interest"]
          submission_date: string | null
          technical_status:
            | Database["public"]["Enums"]["technical_status"]
            | null
          updated_at: string | null
        }
        Insert: {
          assigned_to_user_id?: string | null
          client_user_id?: string | null
          created_at?: string | null
          decision_date?: string | null
          decision_result?:
            | Database["public"]["Enums"]["decision_result"]
            | null
          id?: string
          opportunity_id: string
          protocol_number?: string | null
          sector: Database["public"]["Enums"]["service_sector"]
          service_type: Database["public"]["Enums"]["service_interest"]
          submission_date?: string | null
          technical_status?:
            | Database["public"]["Enums"]["technical_status"]
            | null
          updated_at?: string | null
        }
        Update: {
          assigned_to_user_id?: string | null
          client_user_id?: string | null
          created_at?: string | null
          decision_date?: string | null
          decision_result?:
            | Database["public"]["Enums"]["decision_result"]
            | null
          id?: string
          opportunity_id?: string
          protocol_number?: string | null
          sector?: Database["public"]["Enums"]["service_sector"]
          service_type?: Database["public"]["Enums"]["service_interest"]
          submission_date?: string | null
          technical_status?:
            | Database["public"]["Enums"]["technical_status"]
            | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_cases_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      service_document_types: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_required: boolean | null
          name: string
          needs_apostille: boolean | null
          needs_translation: boolean | null
          service_type: Database["public"]["Enums"]["service_interest"]
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_required?: boolean | null
          name: string
          needs_apostille?: boolean | null
          needs_translation?: boolean | null
          service_type: Database["public"]["Enums"]["service_interest"]
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_required?: boolean | null
          name?: string
          needs_apostille?: boolean | null
          needs_translation?: boolean | null
          service_type?: Database["public"]["Enums"]["service_interest"]
        }
        Relationships: []
      }
      service_documents: {
        Row: {
          document_type_id: string
          file_url: string | null
          id: string
          rejection_reason: string | null
          service_case_id: string
          status: Database["public"]["Enums"]["document_status"] | null
          updated_at: string | null
          uploaded_at: string | null
          uploaded_by_user_id: string | null
        }
        Insert: {
          document_type_id: string
          file_url?: string | null
          id?: string
          rejection_reason?: string | null
          service_case_id: string
          status?: Database["public"]["Enums"]["document_status"] | null
          updated_at?: string | null
          uploaded_at?: string | null
          uploaded_by_user_id?: string | null
        }
        Update: {
          document_type_id?: string
          file_url?: string | null
          id?: string
          rejection_reason?: string | null
          service_case_id?: string
          status?: Database["public"]["Enums"]["document_status"] | null
          updated_at?: string | null
          uploaded_at?: string | null
          uploaded_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "service_document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_documents_service_case_id_fkey"
            columns: ["service_case_id"]
            isOneToOne: false
            referencedRelation: "service_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      service_sectors: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      service_types: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          sector_id: string | null
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          sector_id?: string | null
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          sector_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_types_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "service_sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      system_config: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          key: string
          updated_at: string | null
          value: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to_user_id: string | null
          created_at: string | null
          created_by_user_id: string | null
          description: string | null
          due_date: string | null
          id: string
          related_lead_id: string | null
          related_opportunity_id: string | null
          related_service_case_id: string | null
          status: Database["public"]["Enums"]["task_status"] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to_user_id?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          related_lead_id?: string | null
          related_opportunity_id?: string | null
          related_service_case_id?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to_user_id?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          related_lead_id?: string | null
          related_opportunity_id?: string | null
          related_service_case_id?: string | null
          status?: Database["public"]["Enums"]["task_status"] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_related_lead_id_fkey"
            columns: ["related_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_related_opportunity_id_fkey"
            columns: ["related_opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_related_service_case_id_fkey"
            columns: ["related_service_case_id"]
            isOneToOne: false
            referencedRelation: "service_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profile_definitions: {
        Row: {
          created_at: string | null
          detailed_description: string | null
          display_name: string
          display_order: number | null
          id: string
          is_active: boolean | null
          role_code: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          detailed_description?: string | null
          display_name: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          role_code: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          detailed_description?: string | null
          display_name?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          role_code?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sectors: {
        Row: {
          created_at: string | null
          id: string
          sector_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          sector_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          sector_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sectors_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "service_sectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_sectors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          created_at: string | null
          id: string
          processed: boolean | null
          raw_payload: Json | null
          source: Database["public"]["Enums"]["webhook_source"]
        }
        Insert: {
          created_at?: string | null
          id?: string
          processed?: boolean | null
          raw_payload?: Json | null
          source: Database["public"]["Enums"]["webhook_source"]
        }
        Update: {
          created_at?: string | null
          id?: string
          processed?: boolean | null
          raw_payload?: Json | null
          source?: Database["public"]["Enums"]["webhook_source"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "ADMIN"
        | "MANAGER"
        | "ATENCAO_CLIENTE"
        | "JURIDICO"
        | "FINANCEIRO"
        | "TECNICO"
        | "CLIENTE"
      contract_status:
        | "EM_ELABORACAO"
        | "EM_REVISAO"
        | "ENVIADO"
        | "ASSINADO"
        | "CANCELADO"
      decision_result: "APROVADO" | "NEGADO" | "EM_ANDAMENTO" | "NULO"
      document_status:
        | "NAO_ENVIADO"
        | "ENVIADO"
        | "EM_CONFERENCIA"
        | "APROVADO"
        | "REJEITADO"
      interaction_channel:
        | "WHATSAPP"
        | "EMAIL"
        | "LIGACAO"
        | "REUNIAO"
        | "OUTRO"
      interaction_direction: "INBOUND" | "OUTBOUND"
      language_code: "pt" | "es" | "en" | "fr" | "ca"
      lead_status:
        | "NOVO"
        | "DADOS_INCOMPLETOS"
        | "INTERESSE_PENDENTE"
        | "INTERESSE_CONFIRMADO"
        | "ARQUIVADO_SEM_RETORNO"
      opportunity_status:
        | "ABERTA"
        | "CONTRATO_EM_ELABORACAO"
        | "CONTRATO_ENVIADO"
        | "CONTRATO_ASSINADO"
        | "PAGAMENTO_PENDENTE"
        | "FECHADA_GANHA"
        | "FECHADA_PERDIDA"
        | "CONGELADA"
      origin_channel:
        | "WHATSAPP"
        | "SITE"
        | "INSTAGRAM"
        | "FACEBOOK"
        | "EMAIL"
        | "INDICACAO"
        | "OUTRO"
      payment_method: "CARTAO" | "TRANSFERENCIA" | "PIX" | "OUTRO"
      payment_status:
        | "PENDENTE"
        | "EM_ANALISE"
        | "CONFIRMADO"
        | "PARCIAL"
        | "ESTORNADO"
      requirement_status: "ABERTA" | "RESPONDIDA" | "ENCERRADA"
      service_interest:
        | "VISTO_ESTUDANTE"
        | "VISTO_TRABALHO"
        | "REAGRUPAMENTO"
        | "RENOVACAO_RESIDENCIA"
        | "NACIONALIDADE_RESIDENCIA"
        | "NACIONALIDADE_CASAMENTO"
        | "OUTRO"
      service_sector:
        | "ESTUDANTE"
        | "TRABALHO"
        | "REAGRUPAMENTO"
        | "RENOVACAO"
        | "NACIONALIDADE"
      task_status: "PENDENTE" | "EM_ANDAMENTO" | "CONCLUIDA" | "CANCELADA"
      technical_status:
        | "CONTATO_INICIAL"
        | "AGUARDANDO_DOCUMENTOS"
        | "DOCUMENTOS_EM_CONFERENCIA"
        | "PRONTO_PARA_SUBMISSAO"
        | "SUBMETIDO"
        | "EM_ACOMPANHAMENTO"
        | "EXIGENCIA_ORGAO"
        | "AGUARDANDO_RECURSO"
        | "ENCERRADO_APROVADO"
        | "ENCERRADO_NEGADO"
      webhook_source: "ASSINATURA" | "PAGAMENTO" | "IA_WHATSAPP" | "OUTRO"
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
      app_role: [
        "ADMIN",
        "MANAGER",
        "ATENCAO_CLIENTE",
        "JURIDICO",
        "FINANCEIRO",
        "TECNICO",
        "CLIENTE",
      ],
      contract_status: [
        "EM_ELABORACAO",
        "EM_REVISAO",
        "ENVIADO",
        "ASSINADO",
        "CANCELADO",
      ],
      decision_result: ["APROVADO", "NEGADO", "EM_ANDAMENTO", "NULO"],
      document_status: [
        "NAO_ENVIADO",
        "ENVIADO",
        "EM_CONFERENCIA",
        "APROVADO",
        "REJEITADO",
      ],
      interaction_channel: ["WHATSAPP", "EMAIL", "LIGACAO", "REUNIAO", "OUTRO"],
      interaction_direction: ["INBOUND", "OUTBOUND"],
      language_code: ["pt", "es", "en", "fr", "ca"],
      lead_status: [
        "NOVO",
        "DADOS_INCOMPLETOS",
        "INTERESSE_PENDENTE",
        "INTERESSE_CONFIRMADO",
        "ARQUIVADO_SEM_RETORNO",
      ],
      opportunity_status: [
        "ABERTA",
        "CONTRATO_EM_ELABORACAO",
        "CONTRATO_ENVIADO",
        "CONTRATO_ASSINADO",
        "PAGAMENTO_PENDENTE",
        "FECHADA_GANHA",
        "FECHADA_PERDIDA",
        "CONGELADA",
      ],
      origin_channel: [
        "WHATSAPP",
        "SITE",
        "INSTAGRAM",
        "FACEBOOK",
        "EMAIL",
        "INDICACAO",
        "OUTRO",
      ],
      payment_method: ["CARTAO", "TRANSFERENCIA", "PIX", "OUTRO"],
      payment_status: [
        "PENDENTE",
        "EM_ANALISE",
        "CONFIRMADO",
        "PARCIAL",
        "ESTORNADO",
      ],
      requirement_status: ["ABERTA", "RESPONDIDA", "ENCERRADA"],
      service_interest: [
        "VISTO_ESTUDANTE",
        "VISTO_TRABALHO",
        "REAGRUPAMENTO",
        "RENOVACAO_RESIDENCIA",
        "NACIONALIDADE_RESIDENCIA",
        "NACIONALIDADE_CASAMENTO",
        "OUTRO",
      ],
      service_sector: [
        "ESTUDANTE",
        "TRABALHO",
        "REAGRUPAMENTO",
        "RENOVACAO",
        "NACIONALIDADE",
      ],
      task_status: ["PENDENTE", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"],
      technical_status: [
        "CONTATO_INICIAL",
        "AGUARDANDO_DOCUMENTOS",
        "DOCUMENTOS_EM_CONFERENCIA",
        "PRONTO_PARA_SUBMISSAO",
        "SUBMETIDO",
        "EM_ACOMPANHAMENTO",
        "EXIGENCIA_ORGAO",
        "AGUARDANDO_RECURSO",
        "ENCERRADO_APROVADO",
        "ENCERRADO_NEGADO",
      ],
      webhook_source: ["ASSINATURA", "PAGAMENTO", "IA_WHATSAPP", "OUTRO"],
    },
  },
} as const
