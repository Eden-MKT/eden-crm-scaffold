// Painel raiz do Disparador (Fase 4). Sub-abas: Visão geral | Contatos |
// Templates | Campanhas | Auditoria. Renderizado dentro de /ia-whatsapp quando
// a alternância no topo está em "Disparador".
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MonitorTab } from "./monitor-tab";
import { ContactsTab } from "./contacts-tab";
import { TemplatesTab } from "./templates-tab";
import { CampaignsTab } from "./campaigns-tab";
import { AuditTab } from "./audit-tab";

export function DispatchPanel() {
  return (
    <Tabs defaultValue="monitor" className="flex min-h-0 flex-1 flex-col">
      <TabsList className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="monitor">Visão geral</TabsTrigger>
        <TabsTrigger value="contacts">Contatos</TabsTrigger>
        <TabsTrigger value="templates">Templates</TabsTrigger>
        <TabsTrigger value="campaigns">Campanhas</TabsTrigger>
        <TabsTrigger value="audit">Auditoria</TabsTrigger>
      </TabsList>
      <div className="min-h-0 flex-1 overflow-y-auto pt-4 pb-4">
        <TabsContent value="monitor" className="mt-0">
          <MonitorTab />
        </TabsContent>
        <TabsContent value="contacts" className="mt-0">
          <ContactsTab />
        </TabsContent>
        <TabsContent value="templates" className="mt-0">
          <TemplatesTab />
        </TabsContent>
        <TabsContent value="campaigns" className="mt-0">
          <CampaignsTab />
        </TabsContent>
        <TabsContent value="audit" className="mt-0">
          <AuditTab />
        </TabsContent>
      </div>
    </Tabs>
  );
}
