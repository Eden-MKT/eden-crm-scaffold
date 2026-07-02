## Problema

O preview funciona porque o `.env` que criei existe no sandbox, mas a versão publicada (live) não tem essas variáveis — o `.env` está listado no `.gitignore`, então não vai junto no deploy. Sem `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`, o client do Supabase lança erro no boot e o SSR retorna a tela "This page didn't load".

Como o prefixo `VITE_` é reservado e não pode ser salvo via secrets do Lovable, a forma correta para esse stack (Vite + chaves publishable do Supabase) é **versionar o `.env`** — a `publishable key` é pública por design (protegida por RLS), então não há risco em commitá-la.

## Plano

1. **Editar `.gitignore`**: remover as linhas que ignoram `.env` / `.env.*`, mantendo apenas `*.local` para arquivos locais individuais.
2. **Garantir que `.env` está presente** na raiz com as duas variáveis que você já passou (já criado no preview, só precisa ir junto no commit).
3. **Republicar** o app — o build agora encontra as variáveis e o site live sobe normalmente.

### Detalhes técnicos

- A `publishable key` do Supabase (`sb_publishable_...`) é segura para o front-end; o que NUNCA pode ir pro repo é a `service_role` key.
- Não mexo em código de aplicação, só em `.gitignore` e no `.env`.
