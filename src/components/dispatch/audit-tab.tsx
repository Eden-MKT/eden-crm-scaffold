// Auditoria: dispatch_audit_log, mais recentes primeiro, paginação 50.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { AUDIT_PER_PAGE, dispatchKeys, fetchAudit } from "@/lib/dispatch/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtDate } from "./dispatch-ui";

function resumePayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "—";
  const entries = Object.entries(payload as Record<string, unknown>);
  if (!entries.length) return "—";
  return entries
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ")
    .slice(0, 200);
}

export function AuditTab() {
  const [page, setPage] = useState(0);
  const { data } = useQuery({
    queryKey: dispatchKeys.audit(page),
    queryFn: () => fetchAudit(page),
  });

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / AUDIT_PER_PAGE));

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quando</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Entidade</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>Detalhes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.rows.length ?? 0) === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nenhum registro de auditoria.
                </TableCell>
              </TableRow>
            ) : (
              data?.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {fmtDate(r.criado_em)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{r.acao}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{r.entidade}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.entidade_id ? r.entidade_id.slice(0, 8) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {resumePayload(r.payload)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {data?.total ?? 0} registro(s) — página {page + 1} de {totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  );
}
