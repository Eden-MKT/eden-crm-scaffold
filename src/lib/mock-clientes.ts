// Dados mockados em memória — substituir por backend real no futuro.
export type ClienteStatus = "Ativo" | "Inativo" | "Prospect";

export interface Cliente {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  empresa: string;
  status: ClienteStatus;
}

export const clientesMock: Cliente[] = [
  {
    id: "1",
    nome: "Ana Souza",
    email: "ana@padariaflor.com.br",
    telefone: "(11) 98765-4321",
    empresa: "Padaria Flor",
    status: "Ativo",
  },
  {
    id: "2",
    nome: "Bruno Lima",
    email: "bruno@techlab.io",
    telefone: "(21) 99887-6655",
    empresa: "TechLab",
    status: "Prospect",
  },
  {
    id: "3",
    nome: "Carla Mendes",
    email: "carla@studio23.com",
    telefone: "(31) 91234-5678",
    empresa: "Studio 23",
    status: "Ativo",
  },
  {
    id: "4",
    nome: "Diego Rocha",
    email: "diego@rochaadv.com.br",
    telefone: "(41) 99876-1122",
    empresa: "Rocha Advocacia",
    status: "Inativo",
  },
  {
    id: "5",
    nome: "Elisa Prado",
    email: "elisa@bellafit.com",
    telefone: "(51) 98123-4567",
    empresa: "BellaFit",
    status: "Ativo",
  },
];