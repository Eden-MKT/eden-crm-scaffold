import { LoginPage } from "@/components/auth/login-page";

// Login do portal do cliente — mesma tela animada da equipe, com os textos do
// card ajustados para o cliente. O export PortalLogin é o usado nas rotas.
export function PortalLogin() {
  return <LoginPage variant="client" />;
}
