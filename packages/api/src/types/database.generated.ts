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
      audit_events: {
        Row: {
          action: string
          actor_role: Database["public"]["Enums"]["app_role"] | null
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json
          tenant_id: string
        }
        Insert: {
          action: string
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json
          tenant_id: string
        }
        Update: {
          action?: string
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clienti: {
        Row: {
          cap: string | null
          citta: string | null
          codice_fiscale: string | null
          created_at: string
          email: string[]
          id: string
          indirizzo: string | null
          note: string | null
          partita_iva: string | null
          provincia: string | null
          ragione_sociale: string
          telefoni: string[]
          tenant_id: string
          tipo: Database["public"]["Enums"]["tipo_cliente"]
          updated_at: string
        }
        Insert: {
          cap?: string | null
          citta?: string | null
          codice_fiscale?: string | null
          created_at?: string
          email?: string[]
          id?: string
          indirizzo?: string | null
          note?: string | null
          partita_iva?: string | null
          provincia?: string | null
          ragione_sociale: string
          telefoni?: string[]
          tenant_id: string
          tipo?: Database["public"]["Enums"]["tipo_cliente"]
          updated_at?: string
        }
        Update: {
          cap?: string | null
          citta?: string | null
          codice_fiscale?: string | null
          created_at?: string
          email?: string[]
          id?: string
          indirizzo?: string | null
          note?: string | null
          partita_iva?: string | null
          provincia?: string | null
          ragione_sociale?: string
          telefoni?: string[]
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["tipo_cliente"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clienti_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      commessa_counter: {
        Row: {
          anno: number
          tenant_id: string
          ultimo_num: number
        }
        Insert: {
          anno: number
          tenant_id: string
          ultimo_num?: number
        }
        Update: {
          anno?: number
          tenant_id?: string
          ultimo_num?: number
        }
        Relationships: [
          {
            foreignKeyName: "commessa_counter_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      commessa_tags: {
        Row: {
          commessa_id: string
          created_at: string
          created_by: string | null
          tag: string
          tenant_id: string
        }
        Insert: {
          commessa_id: string
          created_at?: string
          created_by?: string | null
          tag: string
          tenant_id: string
        }
        Update: {
          commessa_id?: string
          created_at?: string
          created_by?: string | null
          tag?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commessa_tags_commessa_id_fkey"
            columns: ["commessa_id"]
            isOneToOne: false
            referencedRelation: "commesse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commessa_tags_commessa_id_fkey"
            columns: ["commessa_id"]
            isOneToOne: false
            referencedRelation: "commesse_con_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commessa_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commessa_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      commessa_voci: {
        Row: {
          commessa_id: string
          created_at: string
          foto_caricate_count: number
          min_foto_richieste: number
          note: string | null
          stato: Database["public"]["Enums"]["stato_fase"]
          tenant_id: string
          updated_at: string
          voce_id: number
        }
        Insert: {
          commessa_id: string
          created_at?: string
          foto_caricate_count?: number
          min_foto_richieste?: number
          note?: string | null
          stato?: Database["public"]["Enums"]["stato_fase"]
          tenant_id: string
          updated_at?: string
          voce_id: number
        }
        Update: {
          commessa_id?: string
          created_at?: string
          foto_caricate_count?: number
          min_foto_richieste?: number
          note?: string | null
          stato?: Database["public"]["Enums"]["stato_fase"]
          tenant_id?: string
          updated_at?: string
          voce_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "commessa_voci_commessa_id_fkey"
            columns: ["commessa_id"]
            isOneToOne: false
            referencedRelation: "commesse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commessa_voci_commessa_id_fkey"
            columns: ["commessa_id"]
            isOneToOne: false
            referencedRelation: "commesse_con_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commessa_voci_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commessa_voci_voce_id_fkey"
            columns: ["voce_id"]
            isOneToOne: false
            referencedRelation: "voci_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      commesse: {
        Row: {
          cliente_id: string
          cliente_indirizzo_cantiere: string | null
          cloud_folder_path: string | null
          codice_interno: string
          created_at: string
          data_apertura: string
          descrizione_ai_finale: string | null
          descrizione_ai_proposta: string | null
          id: string
          nome_cartella: string
          preset_id: string | null
          responsabile_id: string | null
          stato: Database["public"]["Enums"]["stato_commessa"]
          tenant_id: string
          ticket_id: string | null
          updated_at: string
        }
        Insert: {
          cliente_id: string
          cliente_indirizzo_cantiere?: string | null
          cloud_folder_path?: string | null
          codice_interno: string
          created_at?: string
          data_apertura?: string
          descrizione_ai_finale?: string | null
          descrizione_ai_proposta?: string | null
          id?: string
          nome_cartella: string
          preset_id?: string | null
          responsabile_id?: string | null
          stato?: Database["public"]["Enums"]["stato_commessa"]
          tenant_id: string
          ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          cliente_indirizzo_cantiere?: string | null
          cloud_folder_path?: string | null
          codice_interno?: string
          created_at?: string
          data_apertura?: string
          descrizione_ai_finale?: string | null
          descrizione_ai_proposta?: string | null
          id?: string
          nome_cartella?: string
          preset_id?: string | null
          responsabile_id?: string | null
          stato?: Database["public"]["Enums"]["stato_commessa"]
          tenant_id?: string
          ticket_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commesse_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commesse_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "commesse_con_cliente"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "commesse_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "preset"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commesse_responsabile_id_fkey"
            columns: ["responsabile_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commesse_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commesse_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commesse_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets_with_sla"
            referencedColumns: ["id"]
          },
        ]
      }
      external_users: {
        Row: {
          attivo: boolean
          cliente_id: string
          created_at: string
          display_name: string | null
          email: string
          id: string
          last_login_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attivo?: boolean
          cliente_id: string
          created_at?: string
          display_name?: string | null
          email: string
          id: string
          last_login_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attivo?: boolean
          cliente_id?: string
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          last_login_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_users_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_users_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "commesse_con_cliente"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "external_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      file_annotations: {
        Row: {
          composite_thumb_path: string | null
          created_at: string
          created_by: string | null
          editing_by: string | null
          editing_until: string | null
          file_ref_id: string
          height_px: number
          id: string
          kind: string
          layer_json: Json
          page: number | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          version: number
          width_px: number
        }
        Insert: {
          composite_thumb_path?: string | null
          created_at?: string
          created_by?: string | null
          editing_by?: string | null
          editing_until?: string | null
          file_ref_id: string
          height_px: number
          id?: string
          kind?: string
          layer_json?: Json
          page?: number | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          width_px: number
        }
        Update: {
          composite_thumb_path?: string | null
          created_at?: string
          created_by?: string | null
          editing_by?: string | null
          editing_until?: string | null
          file_ref_id?: string
          height_px?: number
          id?: string
          kind?: string
          layer_json?: Json
          page?: number | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          width_px?: number
        }
        Relationships: [
          {
            foreignKeyName: "file_annotations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_annotations_editing_by_fkey"
            columns: ["editing_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_annotations_file_ref_id_fkey"
            columns: ["file_ref_id"]
            isOneToOne: false
            referencedRelation: "file_refs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_annotations_file_ref_id_fkey"
            columns: ["file_ref_id"]
            isOneToOne: false
            referencedRelation: "portal_files_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_annotations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_annotations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      file_refs: {
        Row: {
          commessa_id: string | null
          filename: string
          geo_lat: number | null
          geo_lng: number | null
          id: string
          mime: string
          momento: Database["public"]["Enums"]["momento_foto"] | null
          ocr_status: Database["public"]["Enums"]["ocr_status"]
          ocr_text: string | null
          path: string
          pubblico: boolean
          sha256: string | null
          size_bytes: number
          taken_at: string | null
          tenant_id: string
          thumbnail_url: string | null
          ticket_id: string | null
          uploaded_at: string
          uploaded_by: string | null
          voce_id: number | null
        }
        Insert: {
          commessa_id?: string | null
          filename: string
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          mime: string
          momento?: Database["public"]["Enums"]["momento_foto"] | null
          ocr_status?: Database["public"]["Enums"]["ocr_status"]
          ocr_text?: string | null
          path: string
          pubblico?: boolean
          sha256?: string | null
          size_bytes: number
          taken_at?: string | null
          tenant_id: string
          thumbnail_url?: string | null
          ticket_id?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
          voce_id?: number | null
        }
        Update: {
          commessa_id?: string | null
          filename?: string
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          mime?: string
          momento?: Database["public"]["Enums"]["momento_foto"] | null
          ocr_status?: Database["public"]["Enums"]["ocr_status"]
          ocr_text?: string | null
          path?: string
          pubblico?: boolean
          sha256?: string | null
          size_bytes?: number
          taken_at?: string | null
          tenant_id?: string
          thumbnail_url?: string | null
          ticket_id?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
          voce_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "file_refs_commessa_id_fkey"
            columns: ["commessa_id"]
            isOneToOne: false
            referencedRelation: "commesse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_refs_commessa_id_fkey"
            columns: ["commessa_id"]
            isOneToOne: false
            referencedRelation: "commesse_con_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_refs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_refs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_refs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets_with_sla"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_refs_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_refs_voce_id_fkey"
            columns: ["voce_id"]
            isOneToOne: false
            referencedRelation: "voci_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      interventi: {
        Row: {
          commessa_id: string
          created_at: string
          duration_minutes: number | null
          end_at: string | null
          geo_lat: number | null
          geo_lng: number | null
          id: string
          note: string | null
          start_at: string
          tenant_id: string
          updated_at: string
          user_id: string
          voce_id: number | null
        }
        Insert: {
          commessa_id: string
          created_at?: string
          duration_minutes?: number | null
          end_at?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          note?: string | null
          start_at?: string
          tenant_id: string
          updated_at?: string
          user_id: string
          voce_id?: number | null
        }
        Update: {
          commessa_id?: string
          created_at?: string
          duration_minutes?: number | null
          end_at?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          note?: string | null
          start_at?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
          voce_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "interventi_commessa_id_fkey"
            columns: ["commessa_id"]
            isOneToOne: false
            referencedRelation: "commesse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventi_commessa_id_fkey"
            columns: ["commessa_id"]
            isOneToOne: false
            referencedRelation: "commesse_con_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventi_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventi_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interventi_voce_id_fkey"
            columns: ["voce_id"]
            isOneToOne: false
            referencedRelation: "voci_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      notifiche: {
        Row: {
          created_at: string
          id: string
          payload: Json
          read_at: string | null
          tenant_id: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          tenant_id: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          tenant_id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifiche_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifiche_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          attivo: boolean
          code: string
          created_at: string
          descrizione: string | null
          features: Json
          id: string
          max_commesse_anno: number
          max_storage_gb: number
          max_tickets_mese: number
          max_utenti: number
          nome: string
          ordine: number
          prezzo_mensile_eur: number
          updated_at: string
        }
        Insert: {
          attivo?: boolean
          code: string
          created_at?: string
          descrizione?: string | null
          features?: Json
          id?: string
          max_commesse_anno?: number
          max_storage_gb?: number
          max_tickets_mese?: number
          max_utenti?: number
          nome: string
          ordine?: number
          prezzo_mensile_eur?: number
          updated_at?: string
        }
        Update: {
          attivo?: boolean
          code?: string
          created_at?: string
          descrizione?: string | null
          features?: Json
          id?: string
          max_commesse_anno?: number
          max_storage_gb?: number
          max_tickets_mese?: number
          max_utenti?: number
          nome?: string
          ordine?: number
          prezzo_mensile_eur?: number
          updated_at?: string
        }
        Relationships: []
      }
      preset: {
        Row: {
          created_at: string
          created_by: string | null
          descrizione: string | null
          id: string
          nome: string
          tenant_id: string
          updated_at: string
          voci_default: number[]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descrizione?: string | null
          id?: string
          nome: string
          tenant_id: string
          updated_at?: string
          voci_default?: number[]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descrizione?: string | null
          id?: string
          nome?: string
          tenant_id?: string
          updated_at?: string
          voci_default?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "preset_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preset_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          tenant_id: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          tenant_id: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          tenant_id?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_policy: {
        Row: {
          close_minutes: number
          created_at: string
          priorita: Database["public"]["Enums"]["priorita_ticket"]
          response_minutes: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          close_minutes: number
          created_at?: string
          priorita: Database["public"]["Enums"]["priorita_ticket"]
          response_minutes: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          close_minutes?: number
          created_at?: string
          priorita?: Database["public"]["Enums"]["priorita_ticket"]
          response_minutes?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sla_policy_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_quotas: {
        Row: {
          max_commesse_anno: number | null
          max_storage_gb: number | null
          max_tickets_mese: number | null
          max_utenti: number | null
          note: string | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          max_commesse_anno?: number | null
          max_storage_gb?: number | null
          max_tickets_mese?: number | null
          max_utenti?: number | null
          note?: string | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          max_commesse_anno?: number | null
          max_storage_gb?: number | null
          max_tickets_mese?: number | null
          max_utenti?: number | null
          note?: string | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_quotas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_quotas_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_usage_snapshot: {
        Row: {
          commesse_anno: number
          commesse_aperte: number
          commesse_totali: number
          foto_settimana: number
          snapshot_at: string
          storage_gb: number
          tenant_id: string
          tickets_mese: number
          ultima_attivita: string | null
          utenti_attivi: number
        }
        Insert: {
          commesse_anno?: number
          commesse_aperte?: number
          commesse_totali?: number
          foto_settimana?: number
          snapshot_at?: string
          storage_gb?: number
          tenant_id: string
          tickets_mese?: number
          ultima_attivita?: string | null
          utenti_attivi?: number
        }
        Update: {
          commesse_anno?: number
          commesse_aperte?: number
          commesse_totali?: number
          foto_settimana?: number
          snapshot_at?: string
          storage_gb?: number
          tenant_id?: string
          tickets_mese?: number
          ultima_attivita?: string | null
          utenti_attivi?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_usage_snapshot_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_voci_override: {
        Row: {
          attiva: boolean
          created_at: string
          min_foto_richieste_override: number | null
          nome_override: string | null
          tenant_id: string
          updated_at: string
          voce_id: number
        }
        Insert: {
          attiva?: boolean
          created_at?: string
          min_foto_richieste_override?: number | null
          nome_override?: string | null
          tenant_id: string
          updated_at?: string
          voce_id: number
        }
        Update: {
          attiva?: boolean
          created_at?: string
          min_foto_richieste_override?: number | null
          nome_override?: string | null
          tenant_id?: string
          updated_at?: string
          voce_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_voci_override_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_voci_override_voce_id_fkey"
            columns: ["voce_id"]
            isOneToOne: false
            referencedRelation: "voci_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          brand_color: string | null
          created_at: string
          id: string
          inbound_email: string | null
          logo_url: string | null
          nome: string
          note_interne: string | null
          plan: string
          plan_id: string | null
          slug: string
          sospeso: boolean
          sospeso_at: string | null
          sospeso_motivo: string | null
          storage_config: Json
          storage_provider: Database["public"]["Enums"]["storage_provider_name"]
          updated_at: string
        }
        Insert: {
          brand_color?: string | null
          created_at?: string
          id?: string
          inbound_email?: string | null
          logo_url?: string | null
          nome: string
          note_interne?: string | null
          plan?: string
          plan_id?: string | null
          slug: string
          sospeso?: boolean
          sospeso_at?: string | null
          sospeso_motivo?: string | null
          storage_config?: Json
          storage_provider?: Database["public"]["Enums"]["storage_provider_name"]
          updated_at?: string
        }
        Update: {
          brand_color?: string | null
          created_at?: string
          id?: string
          inbound_email?: string | null
          logo_url?: string | null
          nome?: string
          note_interne?: string | null
          plan?: string
          plan_id?: string | null
          slug?: string
          sospeso?: boolean
          sospeso_at?: string | null
          sospeso_motivo?: string | null
          storage_config?: Json
          storage_provider?: Database["public"]["Enums"]["storage_provider_name"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_counter: {
        Row: {
          anno: number
          tenant_id: string
          ultimo_num: number
        }
        Insert: {
          anno: number
          tenant_id: string
          ultimo_num?: number
        }
        Update: {
          anno?: number
          tenant_id?: string
          ultimo_num?: number
        }
        Relationships: [
          {
            foreignKeyName: "ticket_counter_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          attachments: Json
          body: string
          created_at: string
          id: string
          is_internal_note: boolean
          sender_external_email: string | null
          sender_user_id: string | null
          tenant_id: string
          ticket_id: string
        }
        Insert: {
          attachments?: Json
          body: string
          created_at?: string
          id?: string
          is_internal_note?: boolean
          sender_external_email?: string | null
          sender_user_id?: string | null
          tenant_id: string
          ticket_id: string
        }
        Update: {
          attachments?: Json
          body?: string
          created_at?: string
          id?: string
          is_internal_note?: boolean
          sender_external_email?: string | null
          sender_user_id?: string | null
          tenant_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_sender_user_id_fkey"
            columns: ["sender_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets_with_sla"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assegnato_a: string | null
          cliente_id: string | null
          closed_at: string | null
          codice: string
          created_at: string
          descrizione: string | null
          first_response_at: string | null
          freshdesk_legacy_id: number | null
          id: string
          oggetto: string
          priorita: Database["public"]["Enums"]["priorita_ticket"]
          source: Database["public"]["Enums"]["ticket_source"]
          stato: Database["public"]["Enums"]["stato_ticket"]
          target_close_at: string | null
          target_response_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assegnato_a?: string | null
          cliente_id?: string | null
          closed_at?: string | null
          codice: string
          created_at?: string
          descrizione?: string | null
          first_response_at?: string | null
          freshdesk_legacy_id?: number | null
          id?: string
          oggetto: string
          priorita?: Database["public"]["Enums"]["priorita_ticket"]
          source?: Database["public"]["Enums"]["ticket_source"]
          stato?: Database["public"]["Enums"]["stato_ticket"]
          target_close_at?: string | null
          target_response_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assegnato_a?: string | null
          cliente_id?: string | null
          closed_at?: string | null
          codice?: string
          created_at?: string
          descrizione?: string | null
          first_response_at?: string | null
          freshdesk_legacy_id?: number | null
          id?: string
          oggetto?: string
          priorita?: Database["public"]["Enums"]["priorita_ticket"]
          source?: Database["public"]["Enums"]["ticket_source"]
          stato?: Database["public"]["Enums"]["stato_ticket"]
          target_close_at?: string | null
          target_response_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assegnato_a_fkey"
            columns: ["assegnato_a"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "commesse_con_cliente"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          attivo: boolean
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          is_platform_admin: boolean
          onboarded_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          attivo?: boolean
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          is_platform_admin?: boolean
          onboarded_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          attivo?: boolean
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_platform_admin?: boolean
          onboarded_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      voci_catalogo: {
        Row: {
          cartella_template: string | null
          categoria: Database["public"]["Enums"]["categoria_voce"]
          default: boolean
          id: number
          nome: string
          note: string | null
          ordine_visualizzazione: number
        }
        Insert: {
          cartella_template?: string | null
          categoria: Database["public"]["Enums"]["categoria_voce"]
          default?: boolean
          id: number
          nome: string
          note?: string | null
          ordine_visualizzazione: number
        }
        Update: {
          cartella_template?: string | null
          categoria?: Database["public"]["Enums"]["categoria_voce"]
          default?: boolean
          id?: number
          nome?: string
          note?: string | null
          ordine_visualizzazione?: number
        }
        Relationships: []
      }
    }
    Views: {
      commesse_con_cliente: {
        Row: {
          cliente_id: string | null
          cliente_indirizzo_cantiere: string | null
          cliente_ragione_sociale: string | null
          cliente_tipo: Database["public"]["Enums"]["tipo_cliente"] | null
          cloud_folder_path: string | null
          codice_interno: string | null
          data_apertura: string | null
          id: string | null
          nome_cartella: string | null
          responsabile_id: string | null
          stato: Database["public"]["Enums"]["stato_commessa"] | null
          tenant_id: string | null
          ticket_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commesse_responsabile_id_fkey"
            columns: ["responsabile_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commesse_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commesse_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commesse_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets_with_sla"
            referencedColumns: ["id"]
          },
        ]
      }
      file_annotations_summary: {
        Row: {
          file_ref_id: string | null
          pagine_annotate: number | null
          total: number | null
          ultimo_aggiornamento: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_annotations_file_ref_id_fkey"
            columns: ["file_ref_id"]
            isOneToOne: false
            referencedRelation: "file_refs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_annotations_file_ref_id_fkey"
            columns: ["file_ref_id"]
            isOneToOne: false
            referencedRelation: "portal_files_view"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_files_view: {
        Row: {
          commessa_id: string | null
          filename: string | null
          id: string | null
          mime_type: string | null
          path: string | null
          pubblico: boolean | null
          size_bytes: number | null
          taken_at: string | null
          tenant_id: string | null
          uploaded_at: string | null
          voce_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "file_refs_commessa_id_fkey"
            columns: ["commessa_id"]
            isOneToOne: false
            referencedRelation: "commesse"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_refs_commessa_id_fkey"
            columns: ["commessa_id"]
            isOneToOne: false
            referencedRelation: "commesse_con_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_refs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_refs_voce_id_fkey"
            columns: ["voce_id"]
            isOneToOne: false
            referencedRelation: "voci_catalogo"
            referencedColumns: ["id"]
          },
        ]
      }
      search_documents: {
        Row: {
          body: string | null
          codice: string | null
          id: string | null
          kind: string | null
          label: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      search_documents_scoped: {
        Row: {
          body: string | null
          codice: string | null
          id: string | null
          kind: string | null
          label: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      tenant_tags_summary: {
        Row: {
          tag: string | null
          tenant_id: string | null
          ultimo_uso: string | null
          usage_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "commessa_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets_with_sla: {
        Row: {
          assegnato_a: string | null
          cliente_id: string | null
          closed_at: string | null
          codice: string | null
          created_at: string | null
          descrizione: string | null
          first_response_at: string | null
          freshdesk_legacy_id: number | null
          id: string | null
          oggetto: string | null
          priorita: Database["public"]["Enums"]["priorita_ticket"] | null
          sla_status: string | null
          source: Database["public"]["Enums"]["ticket_source"] | null
          stato: Database["public"]["Enums"]["stato_ticket"] | null
          target_close_at: string | null
          target_response_at: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          assegnato_a?: string | null
          cliente_id?: string | null
          closed_at?: string | null
          codice?: string | null
          created_at?: string | null
          descrizione?: string | null
          first_response_at?: string | null
          freshdesk_legacy_id?: number | null
          id?: string | null
          oggetto?: string | null
          priorita?: Database["public"]["Enums"]["priorita_ticket"] | null
          sla_status?: never
          source?: Database["public"]["Enums"]["ticket_source"] | null
          stato?: Database["public"]["Enums"]["stato_ticket"] | null
          target_close_at?: string | null
          target_response_at?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          assegnato_a?: string | null
          cliente_id?: string | null
          closed_at?: string | null
          codice?: string | null
          created_at?: string | null
          descrizione?: string | null
          first_response_at?: string | null
          freshdesk_legacy_id?: number | null
          id?: string | null
          oggetto?: string | null
          priorita?: Database["public"]["Enums"]["priorita_ticket"] | null
          sla_status?: never
          source?: Database["public"]["Enums"]["ticket_source"] | null
          stato?: Database["public"]["Enums"]["stato_ticket"] | null
          target_close_at?: string | null
          target_response_at?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assegnato_a_fkey"
            columns: ["assegnato_a"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clienti"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "commesse_con_cliente"
            referencedColumns: ["cliente_id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      aggiorna_usage_snapshot: {
        Args: { p_tenant_id?: string }
        Returns: number
      }
      current_cliente_id: { Args: never; Returns: string }
      current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      current_tenant_id: { Args: never; Returns: string }
      genera_codice_commessa: {
        Args: { p_anno?: number; p_tenant_slug: string }
        Returns: string
      }
      genera_codice_ticket: {
        Args: { p_anno: number; p_slug: string }
        Returns: string
      }
      is_platform_admin: { Args: never; Returns: boolean }
      refresh_search_documents: { Args: never; Returns: undefined }
      ticket_sla_status: {
        Args: {
          p_closed_at: string
          p_first_response_at: string
          p_target_close_at: string
          p_target_response_at: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "office" | "capo" | "tecnico" | "cliente"
      categoria_voce:
        | "sempre_attiva"
        | "impiantistica"
        | "ventilazione"
        | "documentazione"
        | "tubazioni"
        | "montaggi"
        | "allacci"
        | "supporto"
        | "alimentazione"
      momento_foto: "sopralluogo" | "in_corso" | "finale"
      ocr_status: "none" | "pending" | "done" | "error"
      priorita_ticket: "bassa" | "media" | "alta" | "urgente"
      stato_commessa:
        | "bozza"
        | "aperta"
        | "in_corso"
        | "collaudo"
        | "completata"
        | "archiviata"
      stato_fase: "da_iniziare" | "in_corso" | "completata" | "bloccata"
      stato_ticket: "aperto" | "in_lavorazione" | "attesa_cliente" | "chiuso"
      storage_provider_name: "supabase" | "nextcloud"
      ticket_source:
        | "manual"
        | "email"
        | "portal_cliente"
        | "imported_from_freshdesk"
      tipo_cliente: "persona_fisica" | "azienda"
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
      app_role: ["owner", "admin", "office", "capo", "tecnico", "cliente"],
      categoria_voce: [
        "sempre_attiva",
        "impiantistica",
        "ventilazione",
        "documentazione",
        "tubazioni",
        "montaggi",
        "allacci",
        "supporto",
        "alimentazione",
      ],
      momento_foto: ["sopralluogo", "in_corso", "finale"],
      ocr_status: ["none", "pending", "done", "error"],
      priorita_ticket: ["bassa", "media", "alta", "urgente"],
      stato_commessa: [
        "bozza",
        "aperta",
        "in_corso",
        "collaudo",
        "completata",
        "archiviata",
      ],
      stato_fase: ["da_iniziare", "in_corso", "completata", "bloccata"],
      stato_ticket: ["aperto", "in_lavorazione", "attesa_cliente", "chiuso"],
      storage_provider_name: ["supabase", "nextcloud"],
      ticket_source: [
        "manual",
        "email",
        "portal_cliente",
        "imported_from_freshdesk",
      ],
      tipo_cliente: ["persona_fisica", "azienda"],
    },
  },
} as const
