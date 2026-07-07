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
      auditoria: {
        Row: {
          accion: string
          cambios: Json | null
          created_at: string
          entidad: string
          entidad_id: string | null
          id: string
          usuario_id: string | null
        }
        Insert: {
          accion: string
          cambios?: Json | null
          created_at?: string
          entidad: string
          entidad_id?: string | null
          id?: string
          usuario_id?: string | null
        }
        Update: {
          accion?: string
          cambios?: Json | null
          created_at?: string
          entidad?: string
          entidad_id?: string | null
          id?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      clientes: {
        Row: {
          activo: boolean
          contacto: string | null
          created_at: string
          created_by: string | null
          direccion: string | null
          email: string | null
          id: string
          nombre: string
          rnc: string | null
          telefono: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          contacto?: string | null
          created_at?: string
          created_by?: string | null
          direccion?: string | null
          email?: string | null
          id?: string
          nombre: string
          rnc?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          contacto?: string | null
          created_at?: string
          created_by?: string | null
          direccion?: string | null
          email?: string | null
          id?: string
          nombre?: string
          rnc?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      costos: {
        Row: {
          concepto: string
          created_at: string
          estado_cobro: string
          estado_facturacion: string
          expediente_id: string
          id: string
          monto_estimado: number
          monto_real: number
          observaciones: string | null
        }
        Insert: {
          concepto: string
          created_at?: string
          estado_cobro?: string
          estado_facturacion?: string
          expediente_id: string
          id?: string
          monto_estimado?: number
          monto_real?: number
          observaciones?: string | null
        }
        Update: {
          concepto?: string
          created_at?: string
          estado_cobro?: string
          estado_facturacion?: string
          expediente_id?: string
          id?: string
          monto_estimado?: number
          monto_real?: number
          observaciones?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "costos_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          created_at: string
          estado: Database["public"]["Enums"]["doc_estado"]
          expediente_id: string
          fecha_recepcion: string | null
          fecha_vencimiento: string | null
          id: string
          observaciones: string | null
          responsable_id: string | null
          storage_path: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          estado?: Database["public"]["Enums"]["doc_estado"]
          expediente_id: string
          fecha_recepcion?: string | null
          fecha_vencimiento?: string | null
          id?: string
          observaciones?: string | null
          responsable_id?: string | null
          storage_path?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          estado?: Database["public"]["Enums"]["doc_estado"]
          expediente_id?: string
          fecha_recepcion?: string | null
          fecha_vencimiento?: string | null
          id?: string
          observaciones?: string | null
          responsable_id?: string | null
          storage_path?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
        ]
      }
      etapas: {
        Row: {
          comentario: string | null
          created_at: string
          estado: Database["public"]["Enums"]["etapa_estado"]
          evidencia_path: string | null
          expediente_id: string
          fecha_cierre: string | null
          fecha_inicio: string | null
          id: string
          nombre: string
          orden: number
          responsable_id: string | null
        }
        Insert: {
          comentario?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["etapa_estado"]
          evidencia_path?: string | null
          expediente_id: string
          fecha_cierre?: string | null
          fecha_inicio?: string | null
          id?: string
          nombre: string
          orden: number
          responsable_id?: string | null
        }
        Update: {
          comentario?: string | null
          created_at?: string
          estado?: Database["public"]["Enums"]["etapa_estado"]
          evidencia_path?: string | null
          expediente_id?: string
          fecha_cierre?: string | null
          fecha_inicio?: string | null
          id?: string
          nombre?: string
          orden?: number
          responsable_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "etapas_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
        ]
      }
      expedientes: {
        Row: {
          bl_awb: string | null
          cliente_id: string | null
          created_at: string
          created_by: string | null
          estado: Database["public"]["Enums"]["expediente_estado"]
          etapa_actual: number
          factura_comercial: string | null
          fecha_cierre: string | null
          fecha_compromiso: string | null
          id: string
          numero: string
          observaciones: string | null
          responsable_id: string | null
          sla_dias: number | null
          solicitud_id: string | null
          updated_at: string
        }
        Insert: {
          bl_awb?: string | null
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          estado?: Database["public"]["Enums"]["expediente_estado"]
          etapa_actual?: number
          factura_comercial?: string | null
          fecha_cierre?: string | null
          fecha_compromiso?: string | null
          id?: string
          numero?: string
          observaciones?: string | null
          responsable_id?: string | null
          sla_dias?: number | null
          solicitud_id?: string | null
          updated_at?: string
        }
        Update: {
          bl_awb?: string | null
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          estado?: Database["public"]["Enums"]["expediente_estado"]
          etapa_actual?: number
          factura_comercial?: string | null
          fecha_cierre?: string | null
          fecha_compromiso?: string | null
          id?: string
          numero?: string
          observaciones?: string | null
          responsable_id?: string | null
          sla_dias?: number | null
          solicitud_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expedientes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expedientes_solicitud_id_fkey"
            columns: ["solicitud_id"]
            isOneToOne: false
            referencedRelation: "solicitudes"
            referencedColumns: ["id"]
          },
        ]
      }
      incidencias: {
        Row: {
          accion_correctiva: string | null
          created_by: string | null
          descripcion: string | null
          estado: Database["public"]["Enums"]["incidencia_estado"]
          expediente_id: string
          fecha_apertura: string
          fecha_resolucion: string | null
          id: string
          responsable_id: string | null
          severidad: Database["public"]["Enums"]["incidencia_severidad"]
          tipo: string
        }
        Insert: {
          accion_correctiva?: string | null
          created_by?: string | null
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["incidencia_estado"]
          expediente_id: string
          fecha_apertura?: string
          fecha_resolucion?: string | null
          id?: string
          responsable_id?: string | null
          severidad?: Database["public"]["Enums"]["incidencia_severidad"]
          tipo: string
        }
        Update: {
          accion_correctiva?: string | null
          created_by?: string | null
          descripcion?: string | null
          estado?: Database["public"]["Enums"]["incidencia_estado"]
          expediente_id?: string
          fecha_apertura?: string
          fecha_resolucion?: string | null
          id?: string
          responsable_id?: string | null
          severidad?: Database["public"]["Enums"]["incidencia_severidad"]
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidencias_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          activo: boolean
          created_at: string
          email: string | null
          id: string
          nombre: string
          telefono: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          email?: string | null
          id: string
          nombre?: string
          telefono?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          email?: string | null
          id?: string
          nombre?: string
          telefono?: string | null
        }
        Relationships: []
      }
      solicitudes: {
        Row: {
          cliente_id: string | null
          contacto: string | null
          created_at: string
          created_by: string | null
          estado: Database["public"]["Enums"]["solicitud_estado"]
          fecha_arribo_est: string | null
          id: string
          incoterm: string | null
          medio_transporte: string | null
          numero: string
          observaciones: string | null
          origen: string | null
          prioridad: Database["public"]["Enums"]["prioridad"]
          puerto_llegada: string | null
          responsable_id: string | null
          tipo_carga: string | null
          tipo_operacion: string | null
          updated_at: string
        }
        Insert: {
          cliente_id?: string | null
          contacto?: string | null
          created_at?: string
          created_by?: string | null
          estado?: Database["public"]["Enums"]["solicitud_estado"]
          fecha_arribo_est?: string | null
          id?: string
          incoterm?: string | null
          medio_transporte?: string | null
          numero?: string
          observaciones?: string | null
          origen?: string | null
          prioridad?: Database["public"]["Enums"]["prioridad"]
          puerto_llegada?: string | null
          responsable_id?: string | null
          tipo_carga?: string | null
          tipo_operacion?: string | null
          updated_at?: string
        }
        Update: {
          cliente_id?: string | null
          contacto?: string | null
          created_at?: string
          created_by?: string | null
          estado?: Database["public"]["Enums"]["solicitud_estado"]
          fecha_arribo_est?: string | null
          id?: string
          incoterm?: string | null
          medio_transporte?: string | null
          numero?: string
          observaciones?: string | null
          origen?: string | null
          prioridad?: Database["public"]["Enums"]["prioridad"]
          puerto_llegada?: string | null
          responsable_id?: string | null
          tipo_carga?: string | null
          tipo_operacion?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitudes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
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
          role: Database["public"]["Enums"]["app_role"]
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
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "admin"
        | "operaciones"
        | "ejecutivo"
        | "agente_aduanal"
        | "documentacion"
        | "transporte"
        | "finanzas"
      doc_estado:
        | "pendiente"
        | "recibido"
        | "observado"
        | "aprobado"
        | "vencido"
      etapa_estado: "pendiente" | "en_curso" | "completada" | "bloqueada"
      expediente_estado:
        | "abierto"
        | "en_proceso"
        | "retenido"
        | "cerrado"
        | "cancelado"
      incidencia_estado: "abierta" | "en_gestion" | "resuelta" | "cerrada"
      incidencia_severidad: "baja" | "media" | "alta" | "critica"
      prioridad: "baja" | "media" | "alta" | "urgente"
      solicitud_estado:
        | "recibida"
        | "en_revision"
        | "aprobada"
        | "rechazada"
        | "convertida"
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
        "admin",
        "operaciones",
        "ejecutivo",
        "agente_aduanal",
        "documentacion",
        "transporte",
        "finanzas",
      ],
      doc_estado: ["pendiente", "recibido", "observado", "aprobado", "vencido"],
      etapa_estado: ["pendiente", "en_curso", "completada", "bloqueada"],
      expediente_estado: [
        "abierto",
        "en_proceso",
        "retenido",
        "cerrado",
        "cancelado",
      ],
      incidencia_estado: ["abierta", "en_gestion", "resuelta", "cerrada"],
      incidencia_severidad: ["baja", "media", "alta", "critica"],
      prioridad: ["baja", "media", "alta", "urgente"],
      solicitud_estado: [
        "recibida",
        "en_revision",
        "aprobada",
        "rechazada",
        "convertida",
      ],
    },
  },
} as const
