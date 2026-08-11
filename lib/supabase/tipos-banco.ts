export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      agendamentos: {
        Row: {
          cancelado_em: string | null
          cancelado_por: string | null
          cancelamento_motivo: string | null
          cancelamento_observacao: string | null
          cliente_id: string
          created_at: string
          data_hora: string
          data_hora_fim: string
          duracao_minutos: number
          id: string
          respostas_extras: Json
          servico_id: string
          sinal_expira_em: string | null
          sinal_status: string
          status: string
          usuario_id: string
        }
        Insert: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          cancelamento_motivo?: string | null
          cancelamento_observacao?: string | null
          cliente_id: string
          created_at?: string
          data_hora: string
          data_hora_fim: string
          duracao_minutos: number
          id?: string
          respostas_extras?: Json
          servico_id: string
          sinal_expira_em?: string | null
          sinal_status?: string
          status?: string
          usuario_id: string
        }
        Update: {
          cancelado_em?: string | null
          cancelado_por?: string | null
          cancelamento_motivo?: string | null
          cancelamento_observacao?: string | null
          cliente_id?: string
          created_at?: string
          data_hora?: string
          data_hora_fim?: string
          duracao_minutos?: number
          id?: string
          respostas_extras?: Json
          servico_id?: string
          sinal_expira_em?: string | null
          sinal_status?: string
          status?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes_finais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agendamentos_servico_id_fkey"
            columns: ["servico_id"]
            isOneToOne: false
            referencedRelation: "servicos"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes_finais: {
        Row: {
          created_at: string
          id: string
          nome: string | null
          remote_jid: string
          telefone: string | null
          usuario_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome?: string | null
          remote_jid: string
          telefone?: string | null
          usuario_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string | null
          remote_jid?: string
          telefone?: string | null
          usuario_id?: string
        }
        Relationships: []
      }
      cobrancas_sinal: {
        Row: {
          agendamento_id: string
          criado_em: string
          estornado_em: string | null
          estorno_pendente: boolean
          expira_em: string
          id: string
          pago_em: string | null
          provedor: string
          provedor_pagamento_id: string
          qr_code: string
          status: string
          usuario_id: string
          valor_centavos: number
        }
        Insert: {
          agendamento_id: string
          criado_em?: string
          estornado_em?: string | null
          estorno_pendente?: boolean
          expira_em: string
          id?: string
          pago_em?: string | null
          provedor?: string
          provedor_pagamento_id: string
          qr_code: string
          status?: string
          usuario_id: string
          valor_centavos: number
        }
        Update: {
          agendamento_id?: string
          criado_em?: string
          estornado_em?: string | null
          estorno_pendente?: boolean
          expira_em?: string
          id?: string
          pago_em?: string | null
          provedor?: string
          provedor_pagamento_id?: string
          qr_code?: string
          status?: string
          usuario_id?: string
          valor_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "cobrancas_sinal_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: true
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      conversas_estado: {
        Row: {
          atualizado_em: string
          dados_temporarios: Json
          etapa_atual_id: string | null
          fluxo_snapshot: Json
          id: string
          pausado_ate: string | null
          remote_jid: string
          telefone_cliente: string | null
          ultima_mensagem_id: string | null
          usuario_id: string
          versao: number
        }
        Insert: {
          atualizado_em?: string
          dados_temporarios?: Json
          etapa_atual_id?: string | null
          fluxo_snapshot?: Json
          id?: string
          pausado_ate?: string | null
          remote_jid: string
          telefone_cliente?: string | null
          ultima_mensagem_id?: string | null
          usuario_id: string
          versao?: number
        }
        Update: {
          atualizado_em?: string
          dados_temporarios?: Json
          etapa_atual_id?: string | null
          fluxo_snapshot?: Json
          id?: string
          pausado_ate?: string | null
          remote_jid?: string
          telefone_cliente?: string | null
          ultima_mensagem_id?: string | null
          usuario_id?: string
          versao?: number
        }
        Relationships: []
      }
      credenciais_pagamento: {
        Row: {
          access_token_cifrado: string
          atualizado_em: string
          conta_externa_id: string
          criado_em: string
          expira_em: string
          provedor: string
          refresh_token_cifrado: string
          usuario_id: string
        }
        Insert: {
          access_token_cifrado: string
          atualizado_em?: string
          conta_externa_id: string
          criado_em?: string
          expira_em: string
          provedor?: string
          refresh_token_cifrado: string
          usuario_id: string
        }
        Update: {
          access_token_cifrado?: string
          atualizado_em?: string
          conta_externa_id?: string
          criado_em?: string
          expira_em?: string
          provedor?: string
          refresh_token_cifrado?: string
          usuario_id?: string
        }
        Relationships: []
      }
      fluxo_etapas: {
        Row: {
          ativo: boolean
          campo_destino: string | null
          created_at: string
          id: string
          obrigatorio: boolean
          opcoes: Json | null
          ordem: number
          pergunta_texto: string
          tipo: string
          usuario_id: string
        }
        Insert: {
          ativo?: boolean
          campo_destino?: string | null
          created_at?: string
          id?: string
          obrigatorio?: boolean
          opcoes?: Json | null
          ordem: number
          pergunta_texto: string
          tipo: string
          usuario_id: string
        }
        Update: {
          ativo?: boolean
          campo_destino?: string | null
          created_at?: string
          id?: string
          obrigatorio?: boolean
          opcoes?: Json | null
          ordem?: number
          pergunta_texto?: string
          tipo?: string
          usuario_id?: string
        }
        Relationships: []
      }
      horarios_disponiveis: {
        Row: {
          created_at: string
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          dia_semana: number
          hora_fim: string
          hora_inicio: string
          id?: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          dia_semana?: number
          hora_fim?: string
          hora_inicio?: string
          id?: string
          usuario_id?: string
        }
        Relationships: []
      }
      log_conexao: {
        Row: {
          em: string
          estado: string | null
          id: string
          motivo_codigo: number | null
          tipo: string
          usuario_id: string
        }
        Insert: {
          em?: string
          estado?: string | null
          id?: string
          motivo_codigo?: number | null
          tipo: string
          usuario_id: string
        }
        Update: {
          em?: string
          estado?: string | null
          id?: string
          motivo_codigo?: number | null
          tipo?: string
          usuario_id?: string
        }
        Relationships: []
      }
      log_envio: {
        Row: {
          agendamento_id: string | null
          data_envio: string
          erro_detalhe: string | null
          id: string
          status_entrega: string
          tipo: string
          usuario_id: string
        }
        Insert: {
          agendamento_id?: string | null
          data_envio?: string
          erro_detalhe?: string | null
          id?: string
          status_entrega?: string
          tipo: string
          usuario_id: string
        }
        Update: {
          agendamento_id?: string | null
          data_envio?: string
          erro_detalhe?: string | null
          id?: string
          status_entrega?: string
          tipo?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "log_envio_agendamento_id_fkey"
            columns: ["agendamento_id"]
            isOneToOne: false
            referencedRelation: "agendamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_tenant: {
        Row: {
          atualizado_em: string
          chave: string
          texto: string
          usuario_id: string
        }
        Insert: {
          atualizado_em?: string
          chave: string
          texto: string
          usuario_id: string
        }
        Update: {
          atualizado_em?: string
          chave?: string
          texto?: string
          usuario_id?: string
        }
        Relationships: []
      }
      perfis: {
        Row: {
          antecedencia_maxima_dias: number
          antecedencia_minima_minutos: number
          created_at: string
          evolution_instance_name: string | null
          fuso_horario: string
          id: string
          nome_estabelecimento: string | null
          pagamento_conectado_em: string | null
          passo_slot_minutos: number
          plano: string
          sinal_minutos_validade: number
          status_assinatura: string
          status_conexao_whatsapp: string
          trial_bloqueado_em: string | null
          trial_expira_em: string | null
        }
        Insert: {
          antecedencia_maxima_dias?: number
          antecedencia_minima_minutos?: number
          created_at?: string
          evolution_instance_name?: string | null
          fuso_horario?: string
          id: string
          nome_estabelecimento?: string | null
          pagamento_conectado_em?: string | null
          passo_slot_minutos?: number
          plano?: string
          sinal_minutos_validade?: number
          status_assinatura?: string
          status_conexao_whatsapp?: string
          trial_bloqueado_em?: string | null
          trial_expira_em?: string | null
        }
        Update: {
          antecedencia_maxima_dias?: number
          antecedencia_minima_minutos?: number
          created_at?: string
          evolution_instance_name?: string | null
          fuso_horario?: string
          id?: string
          nome_estabelecimento?: string | null
          pagamento_conectado_em?: string | null
          passo_slot_minutos?: number
          plano?: string
          sinal_minutos_validade?: number
          status_assinatura?: string
          status_conexao_whatsapp?: string
          trial_bloqueado_em?: string | null
          trial_expira_em?: string | null
        }
        Relationships: []
      }
      servicos: {
        Row: {
          ativo: boolean
          created_at: string
          duracao_minutos: number
          id: string
          nome: string
          preco: number | null
          usuario_id: string
          valor_sinal: number | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          duracao_minutos: number
          id?: string
          nome: string
          preco?: number | null
          usuario_id: string
          valor_sinal?: number | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          duracao_minutos?: number
          id?: string
          nome?: string
          preco?: number | null
          usuario_id?: string
          valor_sinal?: number | null
        }
        Relationships: []
      }
      trials_numero_whatsapp: {
        Row: {
          criado_em: string
          numero_hash: string
          usuario_id: string
        }
        Insert: {
          criado_em?: string
          numero_hash: string
          usuario_id: string
        }
        Update: {
          criado_em?: string
          numero_hash?: string
          usuario_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      confirmar_agendamento: {
        Args: {
          p_data_hora: string
          p_duracao_minutos: number
          p_nome_cliente: string
          p_remote_jid: string
          p_respostas_extras?: Json
          p_servico_id: string
          p_telefone: string
          p_usuario_id: string
        }
        Returns: string
      }
      confirmar_sinal_pago: {
        Args: { p_provedor_pagamento_id: string; p_valor_centavos: number }
        Returns: string
      }
      escolher_plano_trial: {
        Args: { p_plano: string }
        Returns: string
      }
      expirar_sinais_vencidos: {
        Args: { p_usuario_id: string }
        Returns: number
      }
      faixa_horaria_multirange: { Args: never; Returns: unknown }
      registrar_lembrete_pendente: {
        Args: { p_agendamento_id: string; p_usuario_id: string }
        Returns: string
      }
      reivindicar_numero_trial: {
        Args: { p_numero_hash: string; p_usuario_id: string }
        Returns: string
      }
      reordenar_fluxo_etapas: { Args: { p_ids: string[] }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

