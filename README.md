# RecargaBus

Aplicação web de recarga de cartão de **transporte público** para Uberaba/MG, com mapa ao vivo dos ônibus.

© 2026 · Desenvolvido por Sofia Tresse Pires

## Funcionalidades

- **Login de conta** — login e senha criam uma conta local (armazenada no navegador, via `localStorage`); existe um acesso de administrador (`admin@recargabus.com` / `admin123`).
- **Meus cartões** — adicione cartões (Comum, Estudante ou Idoso) informando o número de 12 dígitos e, para estudante/idoso, anexando um PDF (apenas simulado no front, não é enviado).
- **Recarga** — fluxo em passos:
  1. Selecionar um dos cartões cadastrados;
  2. Escolher a quantidade de unidades (5, 10, 20 ou 40 — cada unidade custa R$ 4,50);
  3. Confirmar com a senha da conta;
  4. Escolher a forma de pagamento e concluir;
  5. Comprovante da recarga.
- **Formas de pagamento** (todas simuladas):
  - **Pix** — QR Code e código copiável, com contagem regressiva;
  - **Cartão de débito/crédito** — toggle Débito/Crédito; no crédito, parcelamento de 1x a 12x (1x a 3x **sem juros**; a partir de 4x, juros de 2,49% a.m.);
  - **Boleto bancário** — linha digitável copiável, vencimento em 3 dias.
- **Extrato** — histórico de recargas com forma de pagamento e parcelas.
- **Mapa ao Vivo** — posição de ônibus e pontos de Uberaba via API da Auttran, servida através do Worker (`src/index.js`) para contornar CORS.

## Estrutura

```
index.html          Aplicação completa (HTML + CSS + JS, arquivo único)
src/index.js        Worker Cloudflare (proxy CORS da Auttran + assets estáticos)
wrangler.toml       Configuração do Worker (assets estáticos em "public")
public/index.html   Cópia servida do index.html
public/cards/       Imagens dos cartões (comum.jpg, estudante.jpg, idoso.jpg)
cards/              Cópia das imagens para preview local do index.html da raiz
README.md           Este arquivo
```

### Sincronização das cópias

As cópias de `index.html` e das imagens de cartão precisam estar igualadas em 4 lugares para que tudo funcione tanto na versão deployada quanto no preview local (abrir o arquivo direto do disco):

- `index.html` (raiz do repositório)
- `public/index.html`
- `/mnt/c/recargabus/index.html` e `/mnt/c/recargabus/public/index.html` (pasta de deploy no Windows)

```
cp index.html public/index.html
cp index.html /mnt/c/recargabus/index.html
cp index.html /mnt/c/recargabus/public/index.html
cp public/cards/*.jpg cards/
cp public/cards/*.jpg /mnt/c/recargabus/cards/
```

Confira com `md5sum` que as cópias ficam idênticas.

> **Nota:** as imagens usam caminho **relativo** (`cards/*.jpg`), então funcionam tanto no site quanto abrindo o `index.html` localmente (desde que a pasta `cards/` esteja ao lado do arquivo).

## Como rodar

Pré-requisitos: Node.js e Wrangler (`npm install`).

```bash
npm install        # instala o wrangler
npm run dev        # Workers dev (http://localhost:8787)
npm run deploy     # publica o Worker (wrangler deploy)
```

No WSL, o deploy deve ser executado a partir de `/mnt/c/recargabus` (onde o npm/wrangler do Windows está disponível):

```bash
cd /mnt/c/recargabus && npx wrangler deploy
```

O site publicado fica disponível em https://recargabus.sofiatressepires.workers.dev.

## Configuração do Worker

`wrangler.toml` define o diretório assets (`public`) com binding `ASSETS`. O Worker (`src/index.js`) repassa chamadas a `/ajax/fulltable.php` para a Auttran (adicionando CORS) e, para qualquer outra rota, entrega os assets estáticos.