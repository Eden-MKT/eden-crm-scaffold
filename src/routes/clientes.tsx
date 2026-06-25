import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { clientesMock, type ClienteStatus } from "@/lib/mock-clientes";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes — Éden Marketing CRM" },
      { name: "description", content: "Gerenciamento de clientes da agência." },
    ],
  }),
  component: ClientesPage,
});

// Mapeia status -> variante visual do Badge.
function statusVariant(status: ClienteStatus): "default" | "secondary" | "outline" {
  switch (status) {
    case "Ativo":
      return "default";
    case "Prospect":
      return "secondary";
    case "Inativo":
      return "outline";
  }
}

function ClientesPage() {
  // TODO: trocar mock por dados reais quando o backend estiver disponível.
  const clientes = clientesMock;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            {clientes.length} clientes cadastrados.
          </p>
        </div>
        <Button
          onClick={() => {
            // Placeholder — abrir modal/criar formulário no futuro.
            console.log("Adicionar cliente");
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Adicionar cliente
        </Button>
      </div>

      <div className="rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clientes.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.nome}</TableCell>
                <TableCell>{c.email}</TableCell>
                <TableCell>{c.telefone}</TableCell>
                <TableCell>{c.empresa}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(c.status)}>{c.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}