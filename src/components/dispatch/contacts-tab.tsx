// Contatos do Disparador: tabela paginada + busca + contadores, import CSV
// (com opt-in + base legal LGPD obrigatórios), adicionar manual e suprimir
// (append-only). Toda supressão é INSERT em suppression_list, nunca DELETE.
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Plus, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  addContact,
  CONTACTS_PER_PAGE,
  dispatchKeys,
  fetchContacts,
  fetchContactStats,
  importContacts,
  parseCsv,
  suppressContact,
  type ImportResult,
  type ImportRow,
} from "@/lib/dispatch/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { fmtDate } from "./dispatch-ui";

const BASE_LEGAL = [
  { value: "consentimento", label: "Consentimento" },
  { value: "legitimo_interesse", label: "Legítimo interesse" },
  { value: "execucao_contrato", label: "Execução de contrato" },
];

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-2">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function ContactsTab() {
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const { data: stats } = useQuery({
    queryKey: dispatchKeys.contactStats(),
    queryFn: fetchContactStats,
  });
  const { data } = useQuery({
    queryKey: dispatchKeys.contacts(page, search),
    queryFn: () => fetchContacts(page, search),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: [...dispatchKeys.all, "contacts"] });
    qc.invalidateQueries({ queryKey: dispatchKeys.contactStats() });
  };

  const suppress = useMutation({
    mutationFn: (tel: string) => suppressContact(tel),
    onSuccess: () => {
      toast.success("Contato suprimido.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / CONTACTS_PER_PAGE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <StatPill label="Total" value={stats?.total ?? 0} />
        <StatPill label="Com opt-in" value={stats?.optIn ?? 0} />
        <StatPill label="Contatados" value={stats?.contatados ?? 0} />
        <StatPill label="Suprimidos" value={stats?.suprimidos ?? 0} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(0);
            setSearch(searchInput);
          }}
        >
          <Input
            placeholder="Buscar por telefone, nome, empresa..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-64"
          />
          <Button type="submit" variant="outline">
            Buscar
          </Button>
        </form>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => setAddOpen(true)}>
            <Plus /> Adicionar
          </Button>
          <Button onClick={() => setImportOpen(true)}>
            <Upload /> Importar CSV
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Telefone</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Nicho</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Opt-in</TableHead>
              <TableHead>Base legal</TableHead>
              <TableHead>Contatado</TableHead>
              <TableHead>Último disparo</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.rows.length ?? 0) === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  Nenhum contato.
                </TableCell>
              </TableRow>
            ) : (
              data?.rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.telefone}</TableCell>
                  <TableCell>{c.nome ?? "—"}</TableCell>
                  <TableCell>{c.empresa ?? "—"}</TableCell>
                  <TableCell>{c.nicho ?? "—"}</TableCell>
                  <TableCell>{c.origem ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={c.opt_in ? "success" : "outline"}>
                      {c.opt_in ? "Sim" : "Não"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{c.base_legal_lgpd ?? "—"}</TableCell>
                  <TableCell>{c.contatado ? "Sim" : "Não"}</TableCell>
                  <TableCell className="text-xs">{fmtDate(c.ultimo_disparo_em)}</TableCell>
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" title="Suprimir">
                          <Ban className="text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Suprimir {c.telefone}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            O número entra na lista de supressão e nunca mais receberá disparos.
                            Esta ação é permanente (append-only) e não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => suppress.mutate(c.telefone)}
                          >
                            Suprimir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {data?.total ?? 0} contato(s) — página {page + 1} de {totalPages}
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

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onDone={refresh} />
      <AddContactDialog open={addOpen} onOpenChange={setAddOpen} onDone={refresh} />
    </div>
  );
}

function ImportDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [confirmOptIn, setConfirmOptIn] = useState(false);
  const [baseLegal, setBaseLegal] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => {
    setRows([]);
    setFileName("");
    setConfirmOptIn(false);
    setBaseLegal("");
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    const mapped: ImportRow[] = parsed.map((r) => ({
      telefone: r.telefone ?? r.phone ?? r.celular ?? "",
      nome: r.nome ?? r.name,
      empresa: r.empresa ?? r.company,
      nicho: r.nicho,
      origem: r.origem,
      opt_in_source: r.opt_in_source ?? r.optin_source,
    }));
    setRows(mapped);
    setFileName(file.name);
    setResult(null);
  };

  const run = useMutation({
    mutationFn: () => importContacts(rows, baseLegal),
    onSuccess: (r) => {
      setResult(r);
      toast.success(`${r.importados} contato(s) importado(s).`);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canImport = rows.length > 0 && confirmOptIn && !!baseLegal && !run.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar contatos (CSV)</DialogTitle>
          <DialogDescription>
            Colunas: <b>telefone</b> (obrigatória), nome, empresa, nicho, origem, opt_in_source.
            Telefones são normalizados para E.164 BR; duplicados e suprimidos são ignorados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
          {fileName && (
            <p className="text-xs text-muted-foreground">
              {fileName}: {rows.length} linha(s) detectada(s).
            </p>
          )}

          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={confirmOptIn}
              onCheckedChange={(v) => setConfirmOptIn(v === true)}
              className="mt-0.5"
            />
            <span>
              Confirmo que estes contatos têm <b>opt-in</b> válido para receber mensagens.
            </span>
          </label>

          <div>
            <Label className="mb-1 block text-xs">Base legal (LGPD)</Label>
            <Select value={baseLegal} onValueChange={setBaseLegal}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a base legal" />
              </SelectTrigger>
              <SelectContent>
                {BASE_LEGAL.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {result && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <p>
                Importados: <b>{result.importados}</b> · Duplicados: {result.duplicados} ·
                Suprimidos: {result.suprimidos} · Inválidos: {result.invalidos.length}
              </p>
              {result.invalidos.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground">Primeiras linhas inválidas:</p>
                  <ul className="mt-1 max-h-32 overflow-y-auto text-xs text-destructive">
                    {result.invalidos.slice(0, 10).map((iv, i) => (
                      <li key={i}>
                        linha {iv.linha}: "{iv.valor}" — {iv.motivo}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button disabled={!canImport} onClick={() => run.mutate()}>
            {run.isPending ? "Importando..." : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddContactDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    telefone: "",
    nome: "",
    empresa: "",
    nicho: "",
    origem: "",
    baseLegal: "",
  });

  const reset = () =>
    setForm({ telefone: "", nome: "", empresa: "", nicho: "", origem: "", baseLegal: "" });

  const save = useMutation({
    mutationFn: () =>
      addContact({
        telefone: form.telefone,
        nome: form.nome,
        empresa: form.empresa,
        nicho: form.nicho,
        origem: form.origem,
        baseLegal: form.baseLegal,
      }),
    onSuccess: () => {
      toast.success("Contato adicionado.");
      reset();
      onOpenChange(false);
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSave = form.telefone.trim() && form.baseLegal && !save.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar contato</DialogTitle>
          <DialogDescription>
            O contato é criado com opt-in (origem manual). Informe a base legal LGPD.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="mb-1 block text-xs">Telefone *</Label>
            <Input
              placeholder="(11) 99999-9999"
              value={form.telefone}
              onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block text-xs">Nome</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Empresa</Label>
              <Input
                value={form.empresa}
                onChange={(e) => setForm((f) => ({ ...f, empresa: e.target.value }))}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Nicho</Label>
              <Input
                value={form.nicho}
                onChange={(e) => setForm((f) => ({ ...f, nicho: e.target.value }))}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Origem</Label>
              <Input
                value={form.origem}
                onChange={(e) => setForm((f) => ({ ...f, origem: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Base legal (LGPD) *</Label>
            <Select
              value={form.baseLegal}
              onValueChange={(v) => setForm((f) => ({ ...f, baseLegal: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {BASE_LEGAL.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!canSave} onClick={() => save.mutate()}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
