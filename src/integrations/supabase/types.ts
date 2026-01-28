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
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      case_notes: {
        Row: {
          created_at: string | null
          created_by_user_id: string | null
          id: string
          note: string
          note_type: string | null
          service_case_id: string
        }
        Insert: {
          created_at?: string | null
          created_by_user_id?: string | null
          id?: string
          note: string
          note_type?: string | null
          service_case_id: string
        }
        Update: {
          created_at?: string | null
          created_by_user_id?: string | null
          id?: string
          note?: string
          note_type?: string | null
          service_case_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_notes_service_case_id_fkey"
            columns: ["service_case_id"]
            isOneToOne: false
            referencedRelation: "service_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_flow: {
        Row: {
          amount: number
          category: string
          created_at: string | null
          created_by_user_id: string | null
          description: string | null
          id: string
          invoice_number: string | null
          is_invoiced: boolean | null
          payment_account: string | null
          reference_date: string | null
          related_commission_id: string | null
          related_contract_id: string | null
          related_payment_id: string | null
          subcategory: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string | null
          created_by_user_id?: string | null
          description?: string | null
          id?: string
          invoice_number?: string | null
          is_invoiced?: boolean | null
          payment_account?: string | null
          reference_date?: string | null
          related_commission_id?: string | null
          related_contract_id?: string | null
          related_payment_id?: string | null
          subcategory?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string | null
          created_by_user_id?: string | null
          description?: string | null
          id?: string
          invoice_number?: string | null
          is_invoiced?: boolean | null
          payment_account?: string | null
          reference_date?: string | null
          related_commission_id?: string | null
          related_contract_id?: string | null
          related_payment_id?: string | null
          subcategory?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_flow_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_flow_related_contract_id_fkey"
            columns: ["related_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_flow_related_payment_id_fkey"
            columns: ["related_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          base_amount: number
          collaborator_name: string
          collaborator_type: string
          commission_amount: number | null
          commission_rate: number | null
          contract_id: string
          created_at: string | null
          created_by_user_id: string | null
          has_invoice: boolean | null
          id: string
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          base_amount: number
          collaborator_name: string
          collaborator_type: string
          commission_amount?: number | null
          commission_rate?: number | null
          contract_id: string
          created_at?: string | null
          created_by_user_id?: string | null
          has_invoice?: boolean | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          base_amount?: number
          collaborator_name?: string
          collaborator_type?: string
          commission_amount?: number | null
          commission_rate?: number | null
          contract_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
          has_invoice?: boolean | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commissions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address: string | null
          civil_status: string | null
          country_of_origin: string | null
          cpf: string | null
          created_at: string | null
          document_number: string | null
          document_type: string | null
          education_level: string | null
          email: string | null
          empadronamiento_address: string | null
          eu_entry_last_6_months: boolean | null
          expulsion_history: boolean | null
          father_name: string | null
          full_name: string
          id: string
          mother_name: string | null
          nationality: string | null
          onboarding_completed: boolean | null
          origin_channel: Database["public"]["Enums"]["origin_channel"] | null
          phone: number | null
          preferred_language:
            | Database["public"]["Enums"]["language_code"]
            | null
          previous_official_relationship: boolean | null
          profession: string | null
          referral_confirmed: boolean | null
          referral_name: string | null
          spain_arrival_date: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          civil_status?: string | null
          country_of_origin?: string | null
          cpf?: string | null
          created_at?: string | null
          document_number?: string | null
          document_type?: string | null
          education_level?: string | null
          email?: string | null
          empadronamiento_address?: string | null
          eu_entry_last_6_months?: boolean | null
          expulsion_history?: boolean | null
          father_name?: string | null
          full_name: string
          id?: string
          mother_name?: string | null
          nationality?: string | null
          onboarding_completed?: boolean | null
          origin_channel?: Database["public"]["Enums"]["origin_channel"] | null
          phone?: number | null
          preferred_language?:
            | Database["public"]["Enums"]["language_code"]
            | null
          previous_official_relationship?: boolean | null
          profession?: string | null
          referral_confirmed?: boolean | null
          referral_name?: string | null
          spain_arrival_date?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          civil_status?: string | null
          country_of_origin?: string | null
          cpf?: string | null
          created_at?: string | null
          document_number?: string | null
          document_type?: string | null
          education_level?: string | null
          email?: string | null
          empadronamiento_address?: string | null
          eu_entry_last_6_months?: boolean | null
          expulsion_history?: boolean | null
          father_name?: string | null
          full_name?: string
          id?: string
          mother_name?: string | null
          nationality?: string | null
          onboarding_completed?: boolean | null
          origin_channel?: Database["public"]["Enums"]["origin_channel"] | null
          phone?: number | null
          preferred_language?:
            | Database["public"]["Enums"]["language_code"]
            | null
          previous_official_relationship?: boolean | null
          profession?: string | null
          referral_confirmed?: boolean | null
          referral_name?: string | null
          spain_arrival_date?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      contract_beneficiaries: {
        Row: {
          birth_date: string | null
          contract_id: string
          created_at: string | null
          document_number: string | null
          document_type: string | null
          full_name: string
          id: string
          is_primary: boolean | null
          nationality: string | null
          relationship: string | null
          service_case_id: string | null
          updated_at: string | null
        }
        Insert: {
          birth_date?: string | null
          contract_id: string
          created_at?: string | null
          document_number?: string | null
          document_type?: string | null
          full_name: string
          id?: string
          is_primary?: boolean | null
          nationality?: string | null
          relationship?: string | null
          service_case_id?: string | null
          updated_at?: string | null
        }
        Update: {
          birth_date?: string | null
          contract_id?: string
          created_at?: string | null
          document_number?: string | null
          document_type?: string | null
          full_name?: string
          id?: string
          is_primary?: boolean | null
          nationality?: string | null
          relationship?: string | null
          service_case_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_beneficiaries_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_beneficiaries_service_case_id_fkey"
            columns: ["service_case_id"]
            isOneToOne: false
            referencedRelation: "service_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_costs: {
        Row: {
          amount: number
          contract_id: string
          created_at: string | null
          created_by_user_id: string | null
          description: string
          id: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          contract_id: string
          created_at?: string | null
          created_by_user_id?: string | null
          description: string
          id?: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          contract_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
          description?: string
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_costs_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_costs_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_notes: {
        Row: {
          contract_id: string
          created_at: string | null
          created_by_user_id: string | null
          id: string
          note: string
          note_type: string | null
        }
        Insert: {
          contract_id: string
          created_at?: string | null
          created_by_user_id?: string | null
          id?: string
          note: string
          note_type?: string | null
        }
        Update: {
          contract_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
          id?: string
          note?: string
          note_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_notes_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_notes_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_reminders: {
        Row: {
          contract_id: string
          created_at: string
          id: string
          reminder_type: string
          sent_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          reminder_type: string
          sent_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
          reminder_type?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_reminders_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          assigned_to_user_id: string | null
          cancellation_reason: string | null
          contract_number: string | null
          contract_template: string | null
          created_at: string | null
          created_by_user_id: string | null
          currency: string | null
          down_payment: number | null
          down_payment_date: string | null
          external_signature_id: string | null
          first_due_date: string | null
          id: string
          installment_amount: number | null
          installment_conditions: string | null
          installment_count: number | null
          language: Database["public"]["Enums"]["language_code"] | null
          opportunity_id: string
          payment_account: string | null
          payment_method: string | null
          payment_status: string | null
          refund_policy_text: string | null
          scope_summary: string | null
          service_type: Database["public"]["Enums"]["service_interest"]
          signed_at: string | null
          signed_document_url: string | null
          status: Database["public"]["Enums"]["contract_status"] | null
          total_fee: number | null
          updated_at: string | null
          updated_by_user_id: string | null
        }
        Insert: {
          assigned_to_user_id?: string | null
          cancellation_reason?: string | null
          contract_number?: string | null
          contract_template?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          currency?: string | null
          down_payment?: number | null
          down_payment_date?: string | null
          external_signature_id?: string | null
          first_due_date?: string | null
          id?: string
          installment_amount?: number | null
          installment_conditions?: string | null
          installment_count?: number | null
          language?: Database["public"]["Enums"]["language_code"] | null
          opportunity_id: string
          payment_account?: string | null
          payment_method?: string | null
          payment_status?: string | null
          refund_policy_text?: string | null
          scope_summary?: string | null
          service_type: Database["public"]["Enums"]["service_interest"]
          signed_at?: string | null
          signed_document_url?: string | null
          status?: Database["public"]["Enums"]["contract_status"] | null
          total_fee?: number | null
          updated_at?: string | null
          updated_by_user_id?: string | null
        }
        Update: {
          assigned_to_user_id?: string | null
          cancellation_reason?: string | null
          contract_number?: string | null
          contract_template?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          currency?: string | null
          down_payment?: number | null
          down_payment_date?: string | null
          external_signature_id?: string | null
          first_due_date?: string | null
          id?: string
          installment_amount?: number | null
          installment_conditions?: string | null
          installment_count?: number | null
          language?: Database["public"]["Enums"]["language_code"] | null
          opportunity_id?: string
          payment_account?: string | null
          payment_method?: string | null
          payment_status?: string | null
          refund_policy_text?: string | null
          scope_summary?: string | null
          service_type?: Database["public"]["Enums"]["service_interest"]
          signed_at?: string | null
          signed_document_url?: string | null
          status?: Database["public"]["Enums"]["contract_status"] | null
          total_fee?: number | null
          updated_at?: string | null
          updated_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_assigned_to_user_id_fkey"
            columns: ["assigned_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      document_reminders: {
        Row: {
          created_at: string | null
          id: string
          recipient_type: string
          reminder_type: string
          sent_at: string | null
          service_case_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          recipient_type?: string
          reminder_type: string
          sent_at?: string | null
          service_case_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          recipient_type?: string
          reminder_type?: string
          sent_at?: string | null
          service_case_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_reminders_service_case_id_fkey"
            columns: ["service_case_id"]
            isOneToOne: false
            referencedRelation: "service_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          content: string | null
          embedding: string | null
          fts: unknown
          id: number
          metadata: Json | null
        }
        Insert: {
          content?: string | null
          embedding?: string | null
          fts?: unknown
          id?: never
          metadata?: Json | null
        }
        Update: {
          content?: string | null
          embedding?: string | null
          fts?: unknown
          id?: never
          metadata?: Json | null
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          type: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          type: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          type?: string
        }
        Relationships: []
      }
      generated_documents: {
        Row: {
          created_at: string | null
          document_type: string
          file_url: string | null
          generated_at: string | null
          generated_by_user_id: string | null
          id: string
          notes: string | null
          service_case_id: string
        }
        Insert: {
          created_at?: string | null
          document_type: string
          file_url?: string | null
          generated_at?: string | null
          generated_by_user_id?: string | null
          id?: string
          notes?: string | null
          service_case_id: string
        }
        Update: {
          created_at?: string | null
          document_type?: string
          file_url?: string | null
          generated_at?: string | null
          generated_by_user_id?: string | null
          id?: string
          notes?: string | null
          service_case_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_documents_generated_by_user_id_fkey"
            columns: ["generated_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_service_case_id_fkey"
            columns: ["service_case_id"]
            isOneToOne: false
            referencedRelation: "service_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      initial_contact_reminders: {
        Row: {
          created_at: string | null
          id: string
          reminder_type: string
          sent_at: string | null
          service_case_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          reminder_type: string
          sent_at?: string | null
          service_case_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          reminder_type?: string
          sent_at?: string | null
          service_case_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "initial_contact_reminders_service_case_id_fkey"
            columns: ["service_case_id"]
            isOneToOne: false
            referencedRelation: "service_cases"
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
      invoices: {
        Row: {
          additional_costs: Json | null
          amount_without_vat: number
          client_address: string | null
          client_document: string | null
          client_name: string
          contract_id: string | null
          created_at: string | null
          created_by_user_id: string | null
          file_url: string | null
          id: string
          invoice_number: string
          issued_at: string | null
          payment_id: string | null
          sent_at: string | null
          service_description: string
          status: string | null
          total_amount: number | null
          updated_at: string | null
          vat_amount: number | null
          vat_rate: number | null
        }
        Insert: {
          additional_costs?: Json | null
          amount_without_vat: number
          client_address?: string | null
          client_document?: string | null
          client_name: string
          contract_id?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          file_url?: string | null
          id?: string
          invoice_number: string
          issued_at?: string | null
          payment_id?: string | null
          sent_at?: string | null
          service_description: string
          status?: string | null
          total_amount?: number | null
          updated_at?: string | null
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Update: {
          additional_costs?: Json | null
          amount_without_vat?: number
          client_address?: string | null
          client_document?: string | null
          client_name?: string
          contract_id?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          file_url?: string | null
          id?: string
          invoice_number?: string
          issued_at?: string | null
          payment_id?: string | null
          sent_at?: string | null
          service_description?: string
          status?: string | null
          total_amount?: number | null
          updated_at?: string | null
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
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
          assigned_to_user_id: string | null
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
          assigned_to_user_id?: string | null
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
          assigned_to_user_id?: string | null
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
      log_webhooks_falhados: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: number
          lead_id: string | null
          payload_sent: Json | null
          phone_id: string | null
          trigger_op: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: number
          lead_id?: string | null
          payload_sent?: Json | null
          phone_id?: string | null
          trigger_op?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: number
          lead_id?: string | null
          payload_sent?: Json | null
          phone_id?: string | null
          trigger_op?: string | null
        }
        Relationships: []
      }
      mensagens_cliente: {
        Row: {
          created_at: string
          id: number
          id_lead: string | null
          mensagem_cliente: string | null
          mensagem_IA: string | null
          origem: string | null
          phone_id: number | null
        }
        Insert: {
          created_at?: string
          id?: number
          id_lead?: string | null
          mensagem_cliente?: string | null
          mensagem_IA?: string | null
          origem?: string | null
          phone_id?: number | null
        }
        Update: {
          created_at?: string
          id?: number
          id_lead?: string | null
          mensagem_cliente?: string | null
          mensagem_IA?: string | null
          origem?: string | null
          phone_id?: number | null
        }
        Relationships: []
      }
      n8n_chat_histories: {
        Row: {
          id: number
          message: Json
          session_id: string
        }
        Insert: {
          id?: number
          message: Json
          session_id: string
        }
        Update: {
          id?: number
          message?: Json
          session_id?: string
        }
        Relationships: []
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
      payment_reminders: {
        Row: {
          created_at: string
          id: string
          payment_id: string
          reminder_type: string
          sent_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          payment_id: string
          reminder_type: string
          sent_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          payment_id?: string
          reminder_type?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_reminders_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
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
          due_date: string | null
          id: string
          installment_number: number | null
          opportunity_id: string
          original_due_date: string | null
          paid_at: string | null
          payment_link: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          receipt_approved_at: string | null
          receipt_approved_by: string | null
          receipt_available_in_portal: boolean | null
          receipt_generated_at: string | null
          receipt_number: string | null
          receipt_url: string | null
          refinanced_status: string | null
          rescheduled_at: string | null
          rescheduled_reason: string | null
          status: Database["public"]["Enums"]["payment_status"] | null
          transaction_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          contract_id?: string | null
          created_at?: string | null
          currency?: string | null
          due_date?: string | null
          id?: string
          installment_number?: number | null
          opportunity_id: string
          original_due_date?: string | null
          paid_at?: string | null
          payment_link?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          receipt_approved_at?: string | null
          receipt_approved_by?: string | null
          receipt_available_in_portal?: boolean | null
          receipt_generated_at?: string | null
          receipt_number?: string | null
          receipt_url?: string | null
          refinanced_status?: string | null
          rescheduled_at?: string | null
          rescheduled_reason?: string | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          transaction_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          contract_id?: string | null
          created_at?: string | null
          currency?: string | null
          due_date?: string | null
          id?: string
          installment_number?: number | null
          opportunity_id?: string
          original_due_date?: string | null
          paid_at?: string | null
          payment_link?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          receipt_approved_at?: string | null
          receipt_approved_by?: string | null
          receipt_available_in_portal?: boolean | null
          receipt_generated_at?: string | null
          receipt_number?: string | null
          receipt_url?: string | null
          refinanced_status?: string | null
          rescheduled_at?: string | null
          rescheduled_reason?: string | null
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
          {
            foreignKeyName: "payments_receipt_approved_by_fkey"
            columns: ["receipt_approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_read: boolean | null
          sender_type: string
          sender_user_id: string
          service_case_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          sender_type: string
          sender_user_id: string
          service_case_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          sender_type?: string
          sender_user_id?: string
          service_case_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_messages_service_case_id_fkey"
            columns: ["service_case_id"]
            isOneToOne: false
            referencedRelation: "service_cases"
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
          case_priority: string | null
          client_user_id: string | null
          created_at: string | null
          decision_date: string | null
          decision_result: Database["public"]["Enums"]["decision_result"] | null
          documents_completed_at: string | null
          expected_protocol_date: string | null
          first_contact_at: string | null
          huellas_completed: boolean | null
          huellas_date: string | null
          huellas_location: string | null
          huellas_resguardo_url: string | null
          huellas_time: string | null
          id: string
          is_urgent: boolean | null
          juridical_notes: string | null
          juridical_review_status: string | null
          opportunity_id: string
          protocol_instructions_sent: boolean | null
          protocol_number: string | null
          requirement_deadline: string | null
          requirement_received_at: string | null
          resource_deadline: string | null
          resource_notes: string | null
          resource_status: string | null
          sector: Database["public"]["Enums"]["service_sector"]
          sent_to_legal_at: string | null
          service_type: Database["public"]["Enums"]["service_interest"]
          submission_date: string | null
          technical_approved_at: string | null
          technical_status:
            | Database["public"]["Enums"]["technical_status"]
            | null
          tie_lot_number: string | null
          tie_picked_up: boolean | null
          tie_pickup_date: string | null
          tie_resguardo_url: string | null
          tie_validity_date: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to_user_id?: string | null
          case_priority?: string | null
          client_user_id?: string | null
          created_at?: string | null
          decision_date?: string | null
          decision_result?:
            | Database["public"]["Enums"]["decision_result"]
            | null
          documents_completed_at?: string | null
          expected_protocol_date?: string | null
          first_contact_at?: string | null
          huellas_completed?: boolean | null
          huellas_date?: string | null
          huellas_location?: string | null
          huellas_resguardo_url?: string | null
          huellas_time?: string | null
          id?: string
          is_urgent?: boolean | null
          juridical_notes?: string | null
          juridical_review_status?: string | null
          opportunity_id: string
          protocol_instructions_sent?: boolean | null
          protocol_number?: string | null
          requirement_deadline?: string | null
          requirement_received_at?: string | null
          resource_deadline?: string | null
          resource_notes?: string | null
          resource_status?: string | null
          sector: Database["public"]["Enums"]["service_sector"]
          sent_to_legal_at?: string | null
          service_type: Database["public"]["Enums"]["service_interest"]
          submission_date?: string | null
          technical_approved_at?: string | null
          technical_status?:
            | Database["public"]["Enums"]["technical_status"]
            | null
          tie_lot_number?: string | null
          tie_picked_up?: boolean | null
          tie_pickup_date?: string | null
          tie_resguardo_url?: string | null
          tie_validity_date?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to_user_id?: string | null
          case_priority?: string | null
          client_user_id?: string | null
          created_at?: string | null
          decision_date?: string | null
          decision_result?:
            | Database["public"]["Enums"]["decision_result"]
            | null
          documents_completed_at?: string | null
          expected_protocol_date?: string | null
          first_contact_at?: string | null
          huellas_completed?: boolean | null
          huellas_date?: string | null
          huellas_location?: string | null
          huellas_resguardo_url?: string | null
          huellas_time?: string | null
          id?: string
          is_urgent?: boolean | null
          juridical_notes?: string | null
          juridical_review_status?: string | null
          opportunity_id?: string
          protocol_instructions_sent?: boolean | null
          protocol_number?: string | null
          requirement_deadline?: string | null
          requirement_received_at?: string | null
          resource_deadline?: string | null
          resource_notes?: string | null
          resource_status?: string | null
          sector?: Database["public"]["Enums"]["service_sector"]
          sent_to_legal_at?: string | null
          service_type?: Database["public"]["Enums"]["service_interest"]
          submission_date?: string | null
          technical_approved_at?: string | null
          technical_status?:
            | Database["public"]["Enums"]["technical_status"]
            | null
          tie_lot_number?: string | null
          tie_picked_up?: boolean | null
          tie_pickup_date?: string | null
          tie_resguardo_url?: string | null
          tie_validity_date?: string | null
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
          validity_days: number | null
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
          validity_days?: number | null
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
          validity_days?: number | null
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
      hybrid_search: {
        Args: {
          full_text_weight?: number
          match_count: number
          query_embedding: string
          query_text: string
          rrf_k?: number
          semantic_weight?: number
        }
        Returns: {
          content: string
          id: number
          rank: number
          score: number
        }[]
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
        | "COLABORADOR"
      payment_method:
        | "CARTAO"
        | "TRANSFERENCIA"
        | "PIX"
        | "OUTRO"
        | "PAYPAL"
        | "PARCELAMENTO_MANUAL"
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
        | "RESIDENCIA_PARENTE_COMUNITARIO"
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
        | "DOCUMENTACAO_PARCIAL_APROVADA"
        | "EM_ORGANIZACAO"
        | "ENVIADO_JURIDICO"
        | "PROTOCOLADO"
        | "EM_RECURSO"
        | "AGENDAR_HUELLAS"
        | "AGUARDANDO_CITA_HUELLAS"
        | "HUELLAS_REALIZADO"
        | "DISPONIVEL_RETIRADA_TIE"
        | "AGUARDANDO_CITA_RETIRADA"
        | "TIE_RETIRADO"
        | "DENEGADO"
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
        "COLABORADOR",
      ],
      payment_method: [
        "CARTAO",
        "TRANSFERENCIA",
        "PIX",
        "OUTRO",
        "PAYPAL",
        "PARCELAMENTO_MANUAL",
      ],
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
        "RESIDENCIA_PARENTE_COMUNITARIO",
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
        "DOCUMENTACAO_PARCIAL_APROVADA",
        "EM_ORGANIZACAO",
        "ENVIADO_JURIDICO",
        "PROTOCOLADO",
        "EM_RECURSO",
        "AGENDAR_HUELLAS",
        "AGUARDANDO_CITA_HUELLAS",
        "HUELLAS_REALIZADO",
        "DISPONIVEL_RETIRADA_TIE",
        "AGUARDANDO_CITA_RETIRADA",
        "TIE_RETIRADO",
        "DENEGADO",
      ],
      webhook_source: ["ASSINATURA", "PAGAMENTO", "IA_WHATSAPP", "OUTRO"],
    },
  },
} as const
