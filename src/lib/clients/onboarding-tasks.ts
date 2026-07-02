import type { Stage } from "./stages";

export interface OnboardingTask {
  key: string;
  label: string;
  stage: Stage;
}

/** Checklist detalhado extraído do documento unificado de onboarding. */
export const ONBOARDING_TASKS: OnboardingTask[] = [
  // João — Kickoff & Onboarding (Fase 1)
  { key: "kickoff_reuniao", stage: "kickoff", label: "Reunião de kickoff: meta de faturamento, ticket médio, margem, CAC máximo" },
  { key: "kickoff_historico", stage: "kickoff", label: "Coletar histórico: o que já rodou, criativos antigos, contas antigas" },
  { key: "kickoff_meta", stage: "kickoff", label: "Definir meta clara em número — alinhada e assinada com o cliente" },
  { key: "kickoff_oferta", stage: "kickoff", label: "Mapear oferta, diferenciais e objeções (input para copy)" },
  { key: "kickoff_step", stage: "kickoff", label: "Classificar o cliente no Step (V1/V2/V3/V4)" },
  { key: "kickoff_fits", stage: "kickoff", label: "Verificar os 4 Fits (produto, mercado, monetização, canal)" },
  { key: "kickoff_acessos", stage: "kickoff", label: "Coletar acessos: BM, conta de anúncio, página, Instagram, Google Ads, GA4, CRM" },
  { key: "kickoff_auditoria", stage: "kickoff", label: "Auditar conta existente (se houver)" },
  { key: "kickoff_verba", stage: "kickoff", label: "Definir verba mensal + divisão por campanha/fase" },
  { key: "kickoff_breakeven", stage: "kickoff", label: "Calcular verba mínima de break-even" },
  { key: "kickoff_stakeholders", stage: "kickoff", label: "Definir stakeholders e canal de comunicação (grupo WhatsApp, daily report)" },
  { key: "kickoff_comercial", stage: "kickoff", label: "Definir quem qualifica e responde o lead no comercial do cliente" },
  { key: "kickoff_sla", stage: "kickoff", label: "SLA de resposta do cliente (aprovação de criativo, feedback de lead)" },
  { key: "kickoff_confirmar_filipe", stage: "kickoff", label: "Confirmar com Filipe que acessos aos ativos estão ok" },

  // Filipe — Site & Infraestrutura (A)
  { key: "site_landing", stage: "site_infra", label: "Criação do site institucional / landing page para campanha" },
  { key: "site_dns", stage: "site_infra", label: "Configuração de domínio, DNS, SSL e hospedagem" },
  { key: "site_pagespeed", stage: "site_infra", label: "Teste de velocidade (PageSpeed) — mobile e desktop" },
  { key: "site_responsivo", stage: "site_infra", label: "Teste de responsividade (mobile, tablet, desktop)" },

  // Filipe — Tracking & Dados (B)
  { key: "track_gtm", stage: "tracking_dados", label: "Instalar GTM (container único por cliente)" },
  { key: "track_meta_pixel", stage: "tracking_dados", label: "Pixel do Meta — instalação via GTM" },
  { key: "track_google_ads", stage: "tracking_dados", label: "Tag do Google Ads — instalação via GTM" },
  { key: "track_ga4", stage: "tracking_dados", label: "GA4 — configuração de propriedade + eventos-chave" },
  { key: "track_capi", stage: "tracking_dados", label: "API de Conversões do Meta (CAPI)" },
  { key: "track_offline", stage: "tracking_dados", label: "Conversões offline / Enhanced Conversions (CRM → Meta/Google)" },
  { key: "track_dominio_meta", stage: "tracking_dados", label: "Verificação de domínio no Meta Business" },
  { key: "track_eventos", stage: "tracking_dados", label: "Configuração dos 5 eventos priorizados (AEM)" },
  { key: "track_utms", stage: "tracking_dados", label: "Estrutura de UTMs padronizada por cliente" },
  { key: "track_validacao", stage: "tracking_dados", label: "Teste e validação de disparo de TODOS os eventos antes de subir campanha" },

  // Filipe — CRM & Integrações (C)
  { key: "crm_setup", stage: "crm_integracoes", label: "Setup do CRM (pipeline, etapas, campos obrigatórios)" },
  { key: "crm_formulario", stage: "crm_integracoes", label: "Integração formulário/site → CRM (lead rastreado com origem/UTM)" },
  { key: "crm_ads", stage: "crm_integracoes", label: "CRM → plataforma de ads (conversão offline quando aplicável)" },
  { key: "crm_webhook", stage: "crm_integracoes", label: "Webhook/n8n para automações de notificação de lead" },

  // João — Pesquisa & Planejamento (Fase 2)
  { key: "pesquisa_persona", stage: "pesquisa_planejamento", label: "Pesquisa de persona/ICP (mínimo 2-4 variações)" },
  { key: "pesquisa_consciencia", stage: "pesquisa_planejamento", label: "Mapear nível de consciência de cada persona" },
  { key: "pesquisa_benchmark", stage: "pesquisa_planejamento", label: "Benchmarking: 3-5 concorrentes" },
  { key: "pesquisa_swot", stage: "pesquisa_planejamento", label: "Análise SWOT + sazonalidade do negócio" },
  { key: "pesquisa_escada", stage: "pesquisa_planejamento", label: "Mapear escada de valor e mix de ofertas do cliente" },
  { key: "pesquisa_smart", stage: "pesquisa_planejamento", label: "Definir objetivo SMART + KRs mensuráveis" },
  { key: "pesquisa_cronograma", stage: "pesquisa_planejamento", label: "Montar cronograma por semanas" },
  { key: "pesquisa_briefing_criativos", stage: "pesquisa_planejamento", label: "Briefing de criativos pro Filipe (ângulos, hooks, formatos)" },

  // Filipe — Social & Criativos (D)
  { key: "criativos_templates", stage: "criativos", label: "Templates de marca (paleta, fontes, identidade visual)" },
  { key: "criativos_posts", stage: "criativos", label: "Criação de posts para redes sociais (feed/stories)" },
  { key: "criativos_banco", stage: "criativos", label: "Banco de criativos organizado (pasta padrão por cliente)" },

  // João — Estrutura de Campanha (Fase 3)
  { key: "campanha_estrutura", stage: "estrutura_campanha", label: "Estrutura de conta: prospecção, remarketing, lookalike" },
  { key: "campanha_publicos", stage: "estrutura_campanha", label: "Grid de públicos (mínimo 2 públicos × 3 argumentos)" },
  { key: "campanha_testes", stage: "estrutura_campanha", label: "Plano de testes inicial (públicos × criativos × ofertas)" },
  { key: "campanha_criar", stage: "estrutura_campanha", label: "Criar campanhas no Meta Ads e/ou Google Ads" },
  { key: "campanha_match", stage: "estrutura_campanha", label: "Revisar message match: anúncio ↔ LP ↔ CRM" },
  { key: "campanha_validar_tracking", stage: "estrutura_campanha", label: "Validar com Filipe que TODO tracking está disparando ANTES de ativar campanha" },

  // João — Gestão Contínua (Fase 4)
  { key: "gestao_metricas", stage: "gestao_continua", label: "Análise diária/semanal de métricas: CPA, ROAS, CTR, CPM, frequência" },
  { key: "gestao_escala", stage: "gestao_continua", label: "Decisão de escala/corte (matar perdedor, escalar vencedor)" },
  { key: "gestao_negativar", stage: "gestao_continua", label: "Análise de termos de pesquisa (Google) — negativar semanalmente" },
  { key: "gestao_iterar", stage: "gestao_continua", label: "Iterar criativos: nunca pausar sem substituto pronto" },
  { key: "gestao_briefing", stage: "gestao_continua", label: "Briefing de novos criativos com base no que vence (ciclo 7-14 dias)" },
  { key: "gestao_orcamento", stage: "gestao_continua", label: "Gestão de orçamento: redistribuir verba baseado em performance" },
  { key: "gestao_daily", stage: "gestao_continua", label: "Daily report de evidência de serviço (WhatsApp do cliente)" },
  { key: "gestao_checkin", stage: "gestao_continua", label: "Check-in semanal com cliente (framework HOPE)" },

  // Filipe — Relatórios & BI (E)
  { key: "bi_dashboard", stage: "relatorios_bi", label: "Dashboard centralizado (Meta + Google + GA4 + CRM)" },
  { key: "bi_relatorio_auto", stage: "relatorios_bi", label: "Relatório que se atualiza sozinho — conexão de fontes automatizada" },

  // João — Otimização & Escala (Fase 5)
  { key: "otim_relatorio_mensal", stage: "otimizacao_escala", label: "Relatório mensal completo pro cliente (diagnóstico e recomendação)" },
  { key: "otim_cohort", stage: "otimizacao_escala", label: "Análise de cohort e qualidade de lead (lead → venda)" },
  { key: "otim_venda_fechada", stage: "otimizacao_escala", label: "Acompanhamento de venda fechada, não só lead gerado" },
  { key: "otim_feedback_crm", stage: "otimizacao_escala", label: "Feedback loop com comercial do cliente (CRM)" },
  { key: "otim_expectativa", stage: "otimizacao_escala", label: "Gestão de expectativa quando resultado oscila" },
  { key: "otim_expansao", stage: "otimizacao_escala", label: "Avaliar expansão: novos canais, novos públicos, aumento de verba" },
  { key: "otim_ppa", stage: "otimizacao_escala", label: "Novo PPA (Pesquisa, Planejamento e Apresentação) a cada trimestre" },
];

export function tasksForStage(stage: Stage): OnboardingTask[] {
  return ONBOARDING_TASKS.filter((t) => t.stage === stage);
}

export function taskCountForStage(stage: Stage): number {
  return tasksForStage(stage).length;
}

export function allTaskKeysForStage(stage: Stage): string[] {
  return tasksForStage(stage).map((t) => t.key);
}
