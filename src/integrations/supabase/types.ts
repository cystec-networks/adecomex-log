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
      catalogo_acuerdos: {
        Row: {
          codigo: string
          created_at: string
          estado: string
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          codigo: string
          created_at?: string
          estado?: string
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          estado?: string
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      catalogo_areas: {
        Row: {
          codigo: string
          created_at: string
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      catalogo_documentos_requeridos: {
        Row: {
          codigo: string
          created_at: string
          estado: string
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          codigo: string
          created_at?: string
          estado?: string
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          estado?: string
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      catalogo_estados_producto: {
        Row: {
          codigo: string
          created_at: string
          estado: string
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          codigo: string
          created_at?: string
          estado?: string
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          estado?: string
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      catalogo_hitos: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          descripcion: string | null
          id: string
          nombre: string
          orden: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre: string
          orden?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          descripcion?: string | null
          id?: string
          nombre?: string
          orden?: number
          updated_at?: string
        }
        Relationships: []
      }
      catalogo_metodos_transporte: {
        Row: {
          codigo: string
          created_at: string
          estado: string
          id: string
          nombre: string
          nombre_eng: string | null
          updated_at: string
        }
        Insert: {
          codigo: string
          created_at?: string
          estado?: string
          id?: string
          nombre: string
          nombre_eng?: string | null
          updated_at?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          estado?: string
          id?: string
          nombre?: string
          nombre_eng?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      catalogo_paises: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          nombre: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      catalogo_puertos: {
        Row: {
          activo: boolean
          cod_pais: string | null
          codigo: string
          created_at: string
          nombre: string
          pais: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          cod_pais?: string | null
          codigo: string
          created_at?: string
          nombre: string
          pais?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          cod_pais?: string | null
          codigo?: string
          created_at?: string
          nombre?: string
          pais?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      catalogo_regimenes: {
        Row: {
          codigo: string
          created_at: string
          estado: string
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          codigo: string
          created_at?: string
          estado?: string
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          estado?: string
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      catalogo_tasas_arancelarias: {
        Row: {
          acuerdo_preferencial: string | null
          aplica_isc: boolean
          codigo_arancelario: string
          created_at: string
          origen_expediente_id: string | null
          origen_nota: string | null
          pct_gravamen: number | null
          pct_gravamen_preferencial: number | null
          pct_isc: number | null
          updated_at: string
          verificado: boolean
          verificado_at: string | null
          verificado_por: string | null
        }
        Insert: {
          acuerdo_preferencial?: string | null
          aplica_isc?: boolean
          codigo_arancelario: string
          created_at?: string
          origen_expediente_id?: string | null
          origen_nota?: string | null
          pct_gravamen?: number | null
          pct_gravamen_preferencial?: number | null
          pct_isc?: number | null
          updated_at?: string
          verificado?: boolean
          verificado_at?: string | null
          verificado_por?: string | null
        }
        Update: {
          acuerdo_preferencial?: string | null
          aplica_isc?: boolean
          codigo_arancelario?: string
          created_at?: string
          origen_expediente_id?: string | null
          origen_nota?: string | null
          pct_gravamen?: number | null
          pct_gravamen_preferencial?: number | null
          pct_isc?: number | null
          updated_at?: string
          verificado?: boolean
          verificado_at?: string | null
          verificado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogo_tasas_arancelarias_origen_expediente_id_fkey"
            columns: ["origen_expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogo_tasas_arancelarias_origen_expediente_id_fkey"
            columns: ["origen_expediente_id"]
            isOneToOne: false
            referencedRelation: "v_expedientes_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogo_tasas_arancelarias_origen_expediente_id_fkey"
            columns: ["origen_expediente_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidad_expediente"
            referencedColumns: ["expediente_id"]
          },
        ]
      }
      catalogo_tasas_cambio: {
        Row: {
          created_at: string
          created_by: string | null
          fecha: string
          id: string
          notas: string | null
          tasa: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fecha: string
          id?: string
          notas?: string | null
          tasa: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fecha?: string
          id?: string
          notas?: string | null
          tasa?: number
          updated_at?: string
        }
        Relationships: []
      }
      catalogo_tipos_despacho: {
        Row: {
          codigo: string
          created_at: string
          estado: string
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          codigo: string
          created_at?: string
          estado?: string
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          estado?: string
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      catalogo_tipos_documento_id: {
        Row: {
          codigo: string
          created_at: string
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      catalogo_unidades: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          nombre: string
          nombre_eng: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          nombre: string
          nombre_eng?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          nombre?: string
          nombre_eng?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      cliente_usuarios: {
        Row: {
          activo: boolean
          cliente_id: string
          created_at: string
          created_by: string | null
          user_id: string
        }
        Insert: {
          activo?: boolean
          cliente_id: string
          created_at?: string
          created_by?: string | null
          user_id: string
        }
        Update: {
          activo?: boolean
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_usuarios_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "costos_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "v_expedientes_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "costos_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidad_expediente"
            referencedColumns: ["expediente_id"]
          },
        ]
      }
      cuentas_por_pagar: {
        Row: {
          created_at: string
          created_by: string | null
          estado: Database["public"]["Enums"]["cxp_estado"]
          expediente_id: string | null
          fecha_factura: string | null
          fecha_vencimiento: string | null
          gasto_id: string | null
          gasto_operativo_id: string | null
          id: string
          moneda: string
          monto_pagado: number
          monto_total: number
          notas: string | null
          proveedor_nombre: string
          proveedor_rnc: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          estado?: Database["public"]["Enums"]["cxp_estado"]
          expediente_id?: string | null
          fecha_factura?: string | null
          fecha_vencimiento?: string | null
          gasto_id?: string | null
          gasto_operativo_id?: string | null
          id?: string
          moneda?: string
          monto_pagado?: number
          monto_total?: number
          notas?: string | null
          proveedor_nombre: string
          proveedor_rnc?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          estado?: Database["public"]["Enums"]["cxp_estado"]
          expediente_id?: string | null
          fecha_factura?: string | null
          fecha_vencimiento?: string | null
          gasto_id?: string | null
          gasto_operativo_id?: string | null
          id?: string
          moneda?: string
          monto_pagado?: number
          monto_total?: number
          notas?: string | null
          proveedor_nombre?: string
          proveedor_rnc?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cuentas_por_pagar_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_por_pagar_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "v_expedientes_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_por_pagar_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidad_expediente"
            referencedColumns: ["expediente_id"]
          },
          {
            foreignKeyName: "cuentas_por_pagar_gasto_id_fkey"
            columns: ["gasto_id"]
            isOneToOne: false
            referencedRelation: "gastos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuentas_por_pagar_gasto_operativo_id_fkey"
            columns: ["gasto_operativo_id"]
            isOneToOne: false
            referencedRelation: "gastos_operativos"
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
          {
            foreignKeyName: "documentos_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "v_expedientes_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidad_expediente"
            referencedColumns: ["expediente_id"]
          },
        ]
      }
      envios_dgii: {
        Row: {
          archivo_path: string | null
          cantidad_registros: number
          created_at: string
          fecha_enviado: string | null
          fecha_generado: string
          formato: string
          generado_por: string | null
          id: string
          monto_total: number
          numero_acuse: string | null
          periodo: string
          updated_at: string
        }
        Insert: {
          archivo_path?: string | null
          cantidad_registros?: number
          created_at?: string
          fecha_enviado?: string | null
          fecha_generado?: string
          formato: string
          generado_por?: string | null
          id?: string
          monto_total?: number
          numero_acuse?: string | null
          periodo: string
          updated_at?: string
        }
        Update: {
          archivo_path?: string | null
          cantidad_registros?: number
          created_at?: string
          fecha_enviado?: string | null
          fecha_generado?: string
          formato?: string
          generado_por?: string | null
          id?: string
          monto_total?: number
          numero_acuse?: string | null
          periodo?: string
          updated_at?: string
        }
        Relationships: []
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
          {
            foreignKeyName: "etapas_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "v_expedientes_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etapas_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidad_expediente"
            referencedColumns: ["expediente_id"]
          },
        ]
      }
      expediente_hitos: {
        Row: {
          created_at: string
          estado: Database["public"]["Enums"]["hito_estado"]
          expediente_id: string
          fecha_cumplimiento: string | null
          fecha_programada: string | null
          hito_codigo: string
          id: string
          notas: string | null
          orden: number
          responsable_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          estado?: Database["public"]["Enums"]["hito_estado"]
          expediente_id: string
          fecha_cumplimiento?: string | null
          fecha_programada?: string | null
          hito_codigo: string
          id?: string
          notas?: string | null
          orden?: number
          responsable_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          estado?: Database["public"]["Enums"]["hito_estado"]
          expediente_id?: string
          fecha_cumplimiento?: string | null
          fecha_programada?: string | null
          hito_codigo?: string
          id?: string
          notas?: string | null
          orden?: number
          responsable_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expediente_hitos_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expediente_hitos_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "v_expedientes_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expediente_hitos_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidad_expediente"
            referencedColumns: ["expediente_id"]
          },
          {
            foreignKeyName: "expediente_hitos_hito_codigo_fkey"
            columns: ["hito_codigo"]
            isOneToOne: false
            referencedRelation: "catalogo_hitos"
            referencedColumns: ["codigo"]
          },
        ]
      }
      expedientes: {
        Row: {
          acuerdo_codigo: string | null
          area_aduanera_codigo: string | null
          bl_awb: string | null
          canal_riesgo: string | null
          cliente_id: string | null
          contacto_solicitud: string | null
          created_at: string
          created_by: string | null
          descripcion_mercancia: string | null
          eliminado_en: string | null
          eliminado_por: string | null
          estado: Database["public"]["Enums"]["expediente_estado"]
          etapa_actual: number
          factura_comercial: string | null
          factura_ecf_id: string | null
          fecha_cierre: string | null
          fecha_compromiso: string | null
          fecha_despachado: string | null
          fecha_en_transito: string | null
          fecha_entregado: string | null
          fecha_facturado: string | null
          fecha_presentado: string | null
          fecha_recibido: string | null
          fecha_verificado: string | null
          flete: number | null
          id: string
          incoterm: string | null
          liq_oficial_total: number | null
          liq_siga_estado: string | null
          liq_siga_numero: string | null
          medio_transporte: string | null
          metodo_transporte_codigo: string | null
          naviera: string | null
          numero: string
          numero_certificado_origen: string | null
          numero_dua: string | null
          numero_igra: string | null
          numero_tramite_rectificacion: string | null
          numero_vuce: string | null
          numeros_contenedores: string | null
          observaciones: string | null
          otros: number | null
          pais_origen: string | null
          pais_origen_codigo: string | null
          pais_procedencia_codigo: string | null
          peso_bruto: number | null
          peso_neto: number | null
          preferencia_comercial: string | null
          puerto_arribo: string | null
          puerto_arribo_codigo: string | null
          puerto_salida: string | null
          rectificacion_tecnica: boolean
          regimen_aduanero: string | null
          regimen_codigo: string | null
          responsable_id: string | null
          seguro: number | null
          sin_codigo_dga: boolean
          sla_dias: number | null
          solicitud_id: string | null
          suplidor: string | null
          tasa_cambio_congelada: boolean
          tasa_cambio_usada: number | null
          tipo_carga: string | null
          tipo_despacho_codigo: string | null
          tipo_operacion: string | null
          total_cif: number | null
          total_fob: number | null
          updated_at: string
        }
        Insert: {
          acuerdo_codigo?: string | null
          area_aduanera_codigo?: string | null
          bl_awb?: string | null
          canal_riesgo?: string | null
          cliente_id?: string | null
          contacto_solicitud?: string | null
          created_at?: string
          created_by?: string | null
          descripcion_mercancia?: string | null
          eliminado_en?: string | null
          eliminado_por?: string | null
          estado?: Database["public"]["Enums"]["expediente_estado"]
          etapa_actual?: number
          factura_comercial?: string | null
          factura_ecf_id?: string | null
          fecha_cierre?: string | null
          fecha_compromiso?: string | null
          fecha_despachado?: string | null
          fecha_en_transito?: string | null
          fecha_entregado?: string | null
          fecha_facturado?: string | null
          fecha_presentado?: string | null
          fecha_recibido?: string | null
          fecha_verificado?: string | null
          flete?: number | null
          id?: string
          incoterm?: string | null
          liq_oficial_total?: number | null
          liq_siga_estado?: string | null
          liq_siga_numero?: string | null
          medio_transporte?: string | null
          metodo_transporte_codigo?: string | null
          naviera?: string | null
          numero?: string
          numero_certificado_origen?: string | null
          numero_dua?: string | null
          numero_igra?: string | null
          numero_tramite_rectificacion?: string | null
          numero_vuce?: string | null
          numeros_contenedores?: string | null
          observaciones?: string | null
          otros?: number | null
          pais_origen?: string | null
          pais_origen_codigo?: string | null
          pais_procedencia_codigo?: string | null
          peso_bruto?: number | null
          peso_neto?: number | null
          preferencia_comercial?: string | null
          puerto_arribo?: string | null
          puerto_arribo_codigo?: string | null
          puerto_salida?: string | null
          rectificacion_tecnica?: boolean
          regimen_aduanero?: string | null
          regimen_codigo?: string | null
          responsable_id?: string | null
          seguro?: number | null
          sin_codigo_dga?: boolean
          sla_dias?: number | null
          solicitud_id?: string | null
          suplidor?: string | null
          tasa_cambio_congelada?: boolean
          tasa_cambio_usada?: number | null
          tipo_carga?: string | null
          tipo_despacho_codigo?: string | null
          tipo_operacion?: string | null
          total_cif?: number | null
          total_fob?: number | null
          updated_at?: string
        }
        Update: {
          acuerdo_codigo?: string | null
          area_aduanera_codigo?: string | null
          bl_awb?: string | null
          canal_riesgo?: string | null
          cliente_id?: string | null
          contacto_solicitud?: string | null
          created_at?: string
          created_by?: string | null
          descripcion_mercancia?: string | null
          eliminado_en?: string | null
          eliminado_por?: string | null
          estado?: Database["public"]["Enums"]["expediente_estado"]
          etapa_actual?: number
          factura_comercial?: string | null
          factura_ecf_id?: string | null
          fecha_cierre?: string | null
          fecha_compromiso?: string | null
          fecha_despachado?: string | null
          fecha_en_transito?: string | null
          fecha_entregado?: string | null
          fecha_facturado?: string | null
          fecha_presentado?: string | null
          fecha_recibido?: string | null
          fecha_verificado?: string | null
          flete?: number | null
          id?: string
          incoterm?: string | null
          liq_oficial_total?: number | null
          liq_siga_estado?: string | null
          liq_siga_numero?: string | null
          medio_transporte?: string | null
          metodo_transporte_codigo?: string | null
          naviera?: string | null
          numero?: string
          numero_certificado_origen?: string | null
          numero_dua?: string | null
          numero_igra?: string | null
          numero_tramite_rectificacion?: string | null
          numero_vuce?: string | null
          numeros_contenedores?: string | null
          observaciones?: string | null
          otros?: number | null
          pais_origen?: string | null
          pais_origen_codigo?: string | null
          pais_procedencia_codigo?: string | null
          peso_bruto?: number | null
          peso_neto?: number | null
          preferencia_comercial?: string | null
          puerto_arribo?: string | null
          puerto_arribo_codigo?: string | null
          puerto_salida?: string | null
          rectificacion_tecnica?: boolean
          regimen_aduanero?: string | null
          regimen_codigo?: string | null
          responsable_id?: string | null
          seguro?: number | null
          sin_codigo_dga?: boolean
          sla_dias?: number | null
          solicitud_id?: string | null
          suplidor?: string | null
          tasa_cambio_congelada?: boolean
          tasa_cambio_usada?: number | null
          tipo_carga?: string | null
          tipo_despacho_codigo?: string | null
          tipo_operacion?: string | null
          total_cif?: number | null
          total_fob?: number | null
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
            foreignKeyName: "expedientes_factura_ecf_id_fkey"
            columns: ["factura_ecf_id"]
            isOneToOne: false
            referencedRelation: "facturas_ecf"
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
      facturas: {
        Row: {
          concepto: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          estado: string
          expediente_id: string
          fecha_emision: string | null
          fecha_pago: string | null
          id: string
          monto: number
          notas: string | null
          referencia: string | null
          updated_at: string
        }
        Insert: {
          concepto: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          estado?: string
          expediente_id: string
          fecha_emision?: string | null
          fecha_pago?: string | null
          id?: string
          monto?: number
          notas?: string | null
          referencia?: string | null
          updated_at?: string
        }
        Update: {
          concepto?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          estado?: string
          expediente_id?: string
          fecha_emision?: string | null
          fecha_pago?: string | null
          id?: string
          monto?: number
          notas?: string | null
          referencia?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facturas_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "v_expedientes_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidad_expediente"
            referencedColumns: ["expediente_id"]
          },
        ]
      }
      facturas_ecf: {
        Row: {
          cdt: number
          cliente_id: string | null
          cliente_razon_social: string | null
          cliente_rnc: string | null
          codigo_seguridad: string | null
          created_at: string
          created_by: string | null
          eliminado_en: string | null
          eliminado_por: string | null
          encf: string
          estado: string
          fecha_anulacion: string | null
          fecha_emision: string
          fecha_firma: string | null
          fecha_vencimiento_ncf: string | null
          forma_pago_venta: string | null
          id: string
          isr_percibido_venta: number
          itbis_percibido_venta: number
          itbis_retenido_terceros: number
          monto_total: number
          motivo_anulacion: string | null
          notas: string | null
          otros_impuestos: number
          pdf_url: string | null
          propina_legal: number
          retencion_renta_terceros: number
          subtotal_exento: number
          subtotal_gravado: number
          tasa_itbis: number
          tipo_comprobante: string
          tipo_ingreso: string
          total_isc_av: number
          total_isc_e: number
          total_itbis: number
          updated_at: string
        }
        Insert: {
          cdt?: number
          cliente_id?: string | null
          cliente_razon_social?: string | null
          cliente_rnc?: string | null
          codigo_seguridad?: string | null
          created_at?: string
          created_by?: string | null
          eliminado_en?: string | null
          eliminado_por?: string | null
          encf: string
          estado?: string
          fecha_anulacion?: string | null
          fecha_emision: string
          fecha_firma?: string | null
          fecha_vencimiento_ncf?: string | null
          forma_pago_venta?: string | null
          id?: string
          isr_percibido_venta?: number
          itbis_percibido_venta?: number
          itbis_retenido_terceros?: number
          monto_total?: number
          motivo_anulacion?: string | null
          notas?: string | null
          otros_impuestos?: number
          pdf_url?: string | null
          propina_legal?: number
          retencion_renta_terceros?: number
          subtotal_exento?: number
          subtotal_gravado?: number
          tasa_itbis?: number
          tipo_comprobante: string
          tipo_ingreso?: string
          total_isc_av?: number
          total_isc_e?: number
          total_itbis?: number
          updated_at?: string
        }
        Update: {
          cdt?: number
          cliente_id?: string | null
          cliente_razon_social?: string | null
          cliente_rnc?: string | null
          codigo_seguridad?: string | null
          created_at?: string
          created_by?: string | null
          eliminado_en?: string | null
          eliminado_por?: string | null
          encf?: string
          estado?: string
          fecha_anulacion?: string | null
          fecha_emision?: string
          fecha_firma?: string | null
          fecha_vencimiento_ncf?: string | null
          forma_pago_venta?: string | null
          id?: string
          isr_percibido_venta?: number
          itbis_percibido_venta?: number
          itbis_retenido_terceros?: number
          monto_total?: number
          motivo_anulacion?: string | null
          notas?: string | null
          otros_impuestos?: number
          pdf_url?: string | null
          propina_legal?: number
          retencion_renta_terceros?: number
          subtotal_exento?: number
          subtotal_gravado?: number
          tasa_itbis?: number
          tipo_comprobante?: string
          tipo_ingreso?: string
          total_isc_av?: number
          total_isc_e?: number
          total_itbis?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facturas_ecf_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      facturas_ecf_lineas: {
        Row: {
          cantidad: number
          created_at: string
          descripcion: string
          descuento: number
          factura_id: string
          gravado: boolean
          id: string
          itbis: number
          orden: number
          precio: number
          recargo: number
          unidad: string | null
          valor: number
        }
        Insert: {
          cantidad?: number
          created_at?: string
          descripcion: string
          descuento?: number
          factura_id: string
          gravado?: boolean
          id?: string
          itbis?: number
          orden?: number
          precio?: number
          recargo?: number
          unidad?: string | null
          valor?: number
        }
        Update: {
          cantidad?: number
          created_at?: string
          descripcion?: string
          descuento?: number
          factura_id?: string
          gravado?: boolean
          id?: string
          itbis?: number
          orden?: number
          precio?: number
          recargo?: number
          unidad?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "facturas_ecf_lineas_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas_ecf"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos: {
        Row: {
          adjunto_path: string | null
          concepto: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          es_reembolso: boolean
          expediente_id: string
          fecha: string | null
          forma_pago: string | null
          id: string
          impuesto_selectivo_consumo: number
          isr_percibido_compras: number
          isr_retenido: number
          itbis_facturado: number
          itbis_llevado_costo: number
          itbis_percibido_compras: number
          itbis_proporcionalidad_349: number
          itbis_retenido: number
          monto: number
          monto_facturado: number
          monto_facturado_bienes: number
          monto_facturado_servicios: number
          monto_propina_legal: number
          ncf_modificado: string | null
          ncf_proveedor: string | null
          notas: string | null
          otros_impuestos_tasas: number
          proveedor: string | null
          rnc_cedula_proveedor: string | null
          tipo_bienes_servicios: number | null
          tipo_id_proveedor: string | null
          tipo_ncf_proveedor: string | null
          tipo_retencion_isr: number | null
          updated_at: string
        }
        Insert: {
          adjunto_path?: string | null
          concepto: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          es_reembolso?: boolean
          expediente_id: string
          fecha?: string | null
          forma_pago?: string | null
          id?: string
          impuesto_selectivo_consumo?: number
          isr_percibido_compras?: number
          isr_retenido?: number
          itbis_facturado?: number
          itbis_llevado_costo?: number
          itbis_percibido_compras?: number
          itbis_proporcionalidad_349?: number
          itbis_retenido?: number
          monto?: number
          monto_facturado?: number
          monto_facturado_bienes?: number
          monto_facturado_servicios?: number
          monto_propina_legal?: number
          ncf_modificado?: string | null
          ncf_proveedor?: string | null
          notas?: string | null
          otros_impuestos_tasas?: number
          proveedor?: string | null
          rnc_cedula_proveedor?: string | null
          tipo_bienes_servicios?: number | null
          tipo_id_proveedor?: string | null
          tipo_ncf_proveedor?: string | null
          tipo_retencion_isr?: number | null
          updated_at?: string
        }
        Update: {
          adjunto_path?: string | null
          concepto?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          es_reembolso?: boolean
          expediente_id?: string
          fecha?: string | null
          forma_pago?: string | null
          id?: string
          impuesto_selectivo_consumo?: number
          isr_percibido_compras?: number
          isr_retenido?: number
          itbis_facturado?: number
          itbis_llevado_costo?: number
          itbis_percibido_compras?: number
          itbis_proporcionalidad_349?: number
          itbis_retenido?: number
          monto?: number
          monto_facturado?: number
          monto_facturado_bienes?: number
          monto_facturado_servicios?: number
          monto_propina_legal?: number
          ncf_modificado?: string | null
          ncf_proveedor?: string | null
          notas?: string | null
          otros_impuestos_tasas?: number
          proveedor?: string | null
          rnc_cedula_proveedor?: string | null
          tipo_bienes_servicios?: number | null
          tipo_id_proveedor?: string | null
          tipo_ncf_proveedor?: string | null
          tipo_retencion_isr?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gastos_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "v_expedientes_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidad_expediente"
            referencedColumns: ["expediente_id"]
          },
        ]
      }
      gastos_operativos: {
        Row: {
          comprobante_url: string | null
          concepto: string
          created_at: string
          created_by: string | null
          eliminado_en: string | null
          eliminado_por: string | null
          es_recurrente: boolean
          fecha: string
          forma_pago: string | null
          id: string
          impuesto_selectivo_consumo: number
          isr_percibido_compras: number
          isr_retenido: number
          itbis_facturado: number
          itbis_llevado_costo: number
          itbis_percibido_compras: number
          itbis_proporcionalidad_349: number
          itbis_retenido: number
          moneda: Database["public"]["Enums"]["moneda"]
          monto: number
          monto_facturado: number
          monto_facturado_bienes: number
          monto_facturado_servicios: number
          monto_propina_legal: number
          ncf_modificado: string | null
          ncf_proveedor: string | null
          notas: string | null
          otros_impuestos_tasas: number
          rnc_cedula_proveedor: string | null
          tipo_bienes_servicios: number | null
          tipo_id_proveedor: string | null
          tipo_ncf_proveedor: string | null
          tipo_retencion_isr: number | null
          updated_at: string
        }
        Insert: {
          comprobante_url?: string | null
          concepto: string
          created_at?: string
          created_by?: string | null
          eliminado_en?: string | null
          eliminado_por?: string | null
          es_recurrente?: boolean
          fecha: string
          forma_pago?: string | null
          id?: string
          impuesto_selectivo_consumo?: number
          isr_percibido_compras?: number
          isr_retenido?: number
          itbis_facturado?: number
          itbis_llevado_costo?: number
          itbis_percibido_compras?: number
          itbis_proporcionalidad_349?: number
          itbis_retenido?: number
          moneda?: Database["public"]["Enums"]["moneda"]
          monto: number
          monto_facturado?: number
          monto_facturado_bienes?: number
          monto_facturado_servicios?: number
          monto_propina_legal?: number
          ncf_modificado?: string | null
          ncf_proveedor?: string | null
          notas?: string | null
          otros_impuestos_tasas?: number
          rnc_cedula_proveedor?: string | null
          tipo_bienes_servicios?: number | null
          tipo_id_proveedor?: string | null
          tipo_ncf_proveedor?: string | null
          tipo_retencion_isr?: number | null
          updated_at?: string
        }
        Update: {
          comprobante_url?: string | null
          concepto?: string
          created_at?: string
          created_by?: string | null
          eliminado_en?: string | null
          eliminado_por?: string | null
          es_recurrente?: boolean
          fecha?: string
          forma_pago?: string | null
          id?: string
          impuesto_selectivo_consumo?: number
          isr_percibido_compras?: number
          isr_retenido?: number
          itbis_facturado?: number
          itbis_llevado_costo?: number
          itbis_percibido_compras?: number
          itbis_proporcionalidad_349?: number
          itbis_retenido?: number
          moneda?: Database["public"]["Enums"]["moneda"]
          monto?: number
          monto_facturado?: number
          monto_facturado_bienes?: number
          monto_facturado_servicios?: number
          monto_propina_legal?: number
          ncf_modificado?: string | null
          ncf_proveedor?: string | null
          notas?: string | null
          otros_impuestos_tasas?: number
          rnc_cedula_proveedor?: string | null
          tipo_bienes_servicios?: number | null
          tipo_id_proveedor?: string | null
          tipo_ncf_proveedor?: string | null
          tipo_retencion_isr?: number | null
          updated_at?: string
        }
        Relationships: []
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
          {
            foreignKeyName: "incidencias_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "v_expedientes_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidencias_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidad_expediente"
            referencedColumns: ["expediente_id"]
          },
        ]
      }
      itbis_declaraciones: {
        Row: {
          created_at: string
          estado: string
          fecha_presentada: string | null
          interes_indemnizatorio: number
          periodo: string
          recargos: number
          saldo_favor_anterior: number
          sanciones: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          estado?: string
          fecha_presentada?: string | null
          interes_indemnizatorio?: number
          periodo: string
          recargos?: number
          saldo_favor_anterior?: number
          sanciones?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          estado?: string
          fecha_presentada?: string | null
          interes_indemnizatorio?: number
          periodo?: string
          recargos?: number
          saldo_favor_anterior?: number
          sanciones?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      itbis_retenciones_recibidas: {
        Row: {
          cliente_o_agente: string | null
          created_at: string
          created_by: string | null
          id: string
          monto: number
          notas: string | null
          periodo: string
          referencia: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          cliente_o_agente?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          monto?: number
          notas?: string | null
          periodo: string
          referencia?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          cliente_o_agente?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          monto?: number
          notas?: string | null
          periodo?: string
          referencia?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      mercancia_items: {
        Row: {
          aplica_isc: boolean | null
          cantidad: number | null
          codigo_arancelario: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          detalle_producto: string | null
          expediente_id: string
          id: string
          item_no: number
          pct_gravamen: number | null
          pct_isc: number | null
          pct_itbis: number | null
          peso: number | null
          unidad_codigo: string | null
          unidad_medida: string | null
          updated_at: string
          valor_fob: number | null
        }
        Insert: {
          aplica_isc?: boolean | null
          cantidad?: number | null
          codigo_arancelario?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          detalle_producto?: string | null
          expediente_id: string
          id?: string
          item_no: number
          pct_gravamen?: number | null
          pct_isc?: number | null
          pct_itbis?: number | null
          peso?: number | null
          unidad_codigo?: string | null
          unidad_medida?: string | null
          updated_at?: string
          valor_fob?: number | null
        }
        Update: {
          aplica_isc?: boolean | null
          cantidad?: number | null
          codigo_arancelario?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          detalle_producto?: string | null
          expediente_id?: string
          id?: string
          item_no?: number
          pct_gravamen?: number | null
          pct_isc?: number | null
          pct_itbis?: number | null
          peso?: number | null
          unidad_codigo?: string | null
          unidad_medida?: string | null
          updated_at?: string
          valor_fob?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mercancia_items_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mercancia_items_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "v_expedientes_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mercancia_items_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidad_expediente"
            referencedColumns: ["expediente_id"]
          },
        ]
      }
      permisos: {
        Row: {
          cliente_id: string | null
          created_at: string
          created_by: string | null
          documento_url: string | null
          eliminado_en: string | null
          eliminado_por: string | null
          estado: Database["public"]["Enums"]["permiso_estado"]
          expediente_id: string | null
          fecha_emision: string | null
          fecha_solicitud: string | null
          fecha_vencimiento: string | null
          id: string
          institucion_emisora: string | null
          numero: string
          numero_resolucion: string | null
          observaciones: string | null
          tipo: Database["public"]["Enums"]["permiso_tipo"] | null
          updated_at: string
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          documento_url?: string | null
          eliminado_en?: string | null
          eliminado_por?: string | null
          estado?: Database["public"]["Enums"]["permiso_estado"]
          expediente_id?: string | null
          fecha_emision?: string | null
          fecha_solicitud?: string | null
          fecha_vencimiento?: string | null
          id?: string
          institucion_emisora?: string | null
          numero?: string
          numero_resolucion?: string | null
          observaciones?: string | null
          tipo?: Database["public"]["Enums"]["permiso_tipo"] | null
          updated_at?: string
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          created_by?: string | null
          documento_url?: string | null
          eliminado_en?: string | null
          eliminado_por?: string | null
          estado?: Database["public"]["Enums"]["permiso_estado"]
          expediente_id?: string | null
          fecha_emision?: string | null
          fecha_solicitud?: string | null
          fecha_vencimiento?: string | null
          id?: string
          institucion_emisora?: string | null
          numero?: string
          numero_resolucion?: string | null
          observaciones?: string | null
          tipo?: Database["public"]["Enums"]["permiso_tipo"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permisos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permisos_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permisos_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "v_expedientes_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permisos_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidad_expediente"
            referencedColumns: ["expediente_id"]
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
          eliminado_en: string | null
          eliminado_por: string | null
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
          eliminado_en?: string | null
          eliminado_por?: string | null
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
          eliminado_en?: string | null
          eliminado_por?: string | null
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
      system_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      transportes: {
        Row: {
          cliente_id: string | null
          contenedores_cantidad: number | null
          contenedores_detalle: string | null
          costo_chofer: number | null
          costo_combustible: number | null
          costo_otros: number | null
          costo_peajes: number | null
          costo_viaje: number | null
          created_at: string
          created_by: string | null
          descuento_cxc: number | null
          destino: string | null
          eliminado_en: string | null
          eliminado_por: string | null
          estado: Database["public"]["Enums"]["transporte_estado"]
          eta: string | null
          expediente_id: string | null
          factura_costo_fecha: string | null
          factura_costo_numero: string | null
          factura_ecf_id: string | null
          factura_fecha: string | null
          factura_numero: string | null
          fecha_salida: string | null
          flete_moneda: Database["public"]["Enums"]["moneda"] | null
          flete_monto: number | null
          id: string
          ingreso_facturado: number | null
          numero_viaje: string
          observaciones: string | null
          origen: string | null
          pago_estado:
            | Database["public"]["Enums"]["transporte_pago_estado"]
            | null
          pago_referencia: string | null
          placa_contenedor: string | null
          tipo: Database["public"]["Enums"]["transporte_tipo"] | null
          transportista: string | null
          updated_at: string
        }
        Insert: {
          cliente_id?: string | null
          contenedores_cantidad?: number | null
          contenedores_detalle?: string | null
          costo_chofer?: number | null
          costo_combustible?: number | null
          costo_otros?: number | null
          costo_peajes?: number | null
          costo_viaje?: number | null
          created_at?: string
          created_by?: string | null
          descuento_cxc?: number | null
          destino?: string | null
          eliminado_en?: string | null
          eliminado_por?: string | null
          estado?: Database["public"]["Enums"]["transporte_estado"]
          eta?: string | null
          expediente_id?: string | null
          factura_costo_fecha?: string | null
          factura_costo_numero?: string | null
          factura_ecf_id?: string | null
          factura_fecha?: string | null
          factura_numero?: string | null
          fecha_salida?: string | null
          flete_moneda?: Database["public"]["Enums"]["moneda"] | null
          flete_monto?: number | null
          id?: string
          ingreso_facturado?: number | null
          numero_viaje?: string
          observaciones?: string | null
          origen?: string | null
          pago_estado?:
            | Database["public"]["Enums"]["transporte_pago_estado"]
            | null
          pago_referencia?: string | null
          placa_contenedor?: string | null
          tipo?: Database["public"]["Enums"]["transporte_tipo"] | null
          transportista?: string | null
          updated_at?: string
        }
        Update: {
          cliente_id?: string | null
          contenedores_cantidad?: number | null
          contenedores_detalle?: string | null
          costo_chofer?: number | null
          costo_combustible?: number | null
          costo_otros?: number | null
          costo_peajes?: number | null
          costo_viaje?: number | null
          created_at?: string
          created_by?: string | null
          descuento_cxc?: number | null
          destino?: string | null
          eliminado_en?: string | null
          eliminado_por?: string | null
          estado?: Database["public"]["Enums"]["transporte_estado"]
          eta?: string | null
          expediente_id?: string | null
          factura_costo_fecha?: string | null
          factura_costo_numero?: string | null
          factura_ecf_id?: string | null
          factura_fecha?: string | null
          factura_numero?: string | null
          fecha_salida?: string | null
          flete_moneda?: Database["public"]["Enums"]["moneda"] | null
          flete_monto?: number | null
          id?: string
          ingreso_facturado?: number | null
          numero_viaje?: string
          observaciones?: string | null
          origen?: string | null
          pago_estado?:
            | Database["public"]["Enums"]["transporte_pago_estado"]
            | null
          pago_referencia?: string | null
          placa_contenedor?: string | null
          tipo?: Database["public"]["Enums"]["transporte_tipo"] | null
          transportista?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transportes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transportes_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "expedientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transportes_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "v_expedientes_cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transportes_expediente_id_fkey"
            columns: ["expediente_id"]
            isOneToOne: false
            referencedRelation: "v_rentabilidad_expediente"
            referencedColumns: ["expediente_id"]
          },
          {
            foreignKeyName: "transportes_factura_ecf_id_fkey"
            columns: ["factura_ecf_id"]
            isOneToOne: false
            referencedRelation: "facturas_ecf"
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
      v_expedientes_cliente: {
        Row: {
          bl_awb: string | null
          cliente_id: string | null
          created_at: string | null
          estado: Database["public"]["Enums"]["expediente_estado"] | null
          fecha_compromiso: string | null
          fecha_despachado: string | null
          fecha_en_transito: string | null
          fecha_entregado: string | null
          fecha_facturado: string | null
          fecha_presentado: string | null
          fecha_recibido: string | null
          fecha_verificado: string | null
          id: string | null
          numero: string | null
        }
        Insert: {
          bl_awb?: string | null
          cliente_id?: string | null
          created_at?: string | null
          estado?: Database["public"]["Enums"]["expediente_estado"] | null
          fecha_compromiso?: string | null
          fecha_despachado?: string | null
          fecha_en_transito?: string | null
          fecha_entregado?: string | null
          fecha_facturado?: string | null
          fecha_presentado?: string | null
          fecha_recibido?: string | null
          fecha_verificado?: string | null
          id?: string | null
          numero?: string | null
        }
        Update: {
          bl_awb?: string | null
          cliente_id?: string | null
          created_at?: string | null
          estado?: Database["public"]["Enums"]["expediente_estado"] | null
          fecha_compromiso?: string | null
          fecha_despachado?: string | null
          fecha_en_transito?: string | null
          fecha_entregado?: string | null
          fecha_facturado?: string | null
          fecha_presentado?: string | null
          fecha_recibido?: string | null
          fecha_verificado?: string | null
          id?: string | null
          numero?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expedientes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      v_rentabilidad_expediente: {
        Row: {
          cliente_id: string | null
          estado: Database["public"]["Enums"]["expediente_estado"] | null
          expediente_id: string | null
          margen_pct: number | null
          margen_real: number | null
          numero: string | null
          total_costos_reales: number | null
          total_facturado: number | null
          total_gastos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "expedientes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      calc_itbis_periodo: { Args: { _periodo: string }; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
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
        | "contabilidad"
      cxp_estado: "pendiente" | "parcial" | "pagado" | "disputado"
      doc_estado:
        | "pendiente"
        | "recibido"
        | "observado"
        | "aprobado"
        | "vencido"
      etapa_estado: "pendiente" | "en_curso" | "completada" | "bloqueada"
      expediente_estado:
        | "digitar"
        | "en_transito"
        | "presentar"
        | "verificar"
        | "facturar"
        | "despachado"
        | "entregado"
      hito_estado: "pendiente" | "en_curso" | "completado" | "no_aplica"
      incidencia_estado: "abierta" | "en_gestion" | "resuelta" | "cerrada"
      incidencia_severidad: "baja" | "media" | "alta" | "critica"
      moneda: "USD" | "DOP" | "EUR"
      permiso_estado:
        | "solicitado"
        | "en_tramite"
        | "aprobado"
        | "rechazado"
        | "vencido"
      permiso_tipo:
        | "sanitario"
        | "fitosanitario"
        | "indocal"
        | "ambiental"
        | "agricola"
        | "zoosanitario"
        | "ministerio_salud"
        | "otro"
      prioridad: "baja" | "media" | "alta" | "urgente"
      solicitud_estado:
        | "recibida"
        | "en_revision"
        | "aprobada"
        | "rechazada"
        | "convertida"
      transporte_estado:
        | "programado"
        | "en_transito"
        | "entregado"
        | "retrasado"
        | "facturado"
      transporte_pago_estado: "pendiente" | "parcial" | "pagado"
      transporte_tipo: "maritimo" | "aereo" | "terrestre"
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
        "contabilidad",
      ],
      cxp_estado: ["pendiente", "parcial", "pagado", "disputado"],
      doc_estado: ["pendiente", "recibido", "observado", "aprobado", "vencido"],
      etapa_estado: ["pendiente", "en_curso", "completada", "bloqueada"],
      expediente_estado: [
        "digitar",
        "en_transito",
        "presentar",
        "verificar",
        "facturar",
        "despachado",
        "entregado",
      ],
      hito_estado: ["pendiente", "en_curso", "completado", "no_aplica"],
      incidencia_estado: ["abierta", "en_gestion", "resuelta", "cerrada"],
      incidencia_severidad: ["baja", "media", "alta", "critica"],
      moneda: ["USD", "DOP", "EUR"],
      permiso_estado: [
        "solicitado",
        "en_tramite",
        "aprobado",
        "rechazado",
        "vencido",
      ],
      permiso_tipo: [
        "sanitario",
        "fitosanitario",
        "indocal",
        "ambiental",
        "agricola",
        "zoosanitario",
        "ministerio_salud",
        "otro",
      ],
      prioridad: ["baja", "media", "alta", "urgente"],
      solicitud_estado: [
        "recibida",
        "en_revision",
        "aprobada",
        "rechazada",
        "convertida",
      ],
      transporte_estado: [
        "programado",
        "en_transito",
        "entregado",
        "retrasado",
        "facturado",
      ],
      transporte_pago_estado: ["pendiente", "parcial", "pagado"],
      transporte_tipo: ["maritimo", "aereo", "terrestre"],
    },
  },
} as const
