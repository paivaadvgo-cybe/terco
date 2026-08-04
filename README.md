# Santo Terço

Aplicativo para rezar o Santo Terço. Funciona sem internet, sem conta, sem
anúncios e sem enviar nada para lugar nenhum.

---

# Como publicar no GitHub Pages

Passo a passo completo. Se você nunca usou o GitHub, siga na ordem — não é
preciso instalar nada nem saber programar. Leva uns dez minutos.

## 1. Criar a conta

Se ainda não tem, entre em **github.com** e crie uma conta gratuita. Guarde o
nome de usuário que escolher: ele vai aparecer no endereço do aplicativo.

## 2. Criar o repositório

1. Depois de entrar, clique no **+** no canto superior direito e escolha
   **New repository**.
2. Em **Repository name**, escreva `terco`.
3. Deixe marcado **Public**. Precisa ser público para o Pages funcionar na
   conta gratuita.
4. **Não** marque nada em "Add a README file" nem nas outras caixas.
5. Clique em **Create repository**.

## 3. Enviar os arquivos

Na página que abrir, procure o link **uploading an existing file**.

1. Abra a pasta `publicar` no seu computador.
2. Selecione **tudo o que está dentro dela** — não a pasta em si, mas o
   conteúdo: `index.html`, `manifest.json`, `sw.js`, `escuta-local.js`,
   `README.md`, e a pasta `icones`.
3. Arraste tudo para a área de upload do GitHub.
4. Espere as barras de progresso terminarem.
5. Lá embaixo, clique no botão verde **Commit changes**.

> **Atenção ao arquivo `.nojekyll`.** Ele é invisível em algumas
> configurações do Windows e do Mac, e o upload pelo navegador às vezes o
> ignora. Se ele não aparecer na lista de arquivos do repositório, crie-o
> à mão: clique em **Add file → Create new file**, escreva `.nojekyll` como
> nome, deixe o conteúdo vazio e clique em **Commit changes**. Sem ele, o
> GitHub pode processar os arquivos de um jeito que atrapalha.

## 4. Ligar o GitHub Pages

1. No repositório, clique em **Settings** (a engrenagem, no topo).
2. No menu da esquerda, clique em **Pages**.
3. Em **Source**, escolha **Deploy from a branch**.
4. Em **Branch**, escolha `main` e a pasta `/ (root)`.
5. Clique em **Save**.

Espere de um a cinco minutos. Recarregue a página de Settings → Pages: vai
aparecer o endereço, no formato

```
https://SEU-USUARIO.github.io/terco/
```

Esse é o endereço do aplicativo. Anote e teste no celular.

## 5. Instalar no celular

1. Abra o endereço no **Chrome** do Android ou no **Safari** do iPhone.
2. **Android:** toque nos três pontinhos e escolha *Instalar aplicativo* ou
   *Adicionar à tela inicial*.
3. **iPhone:** toque no botão de compartilhar (o quadrado com a seta) e
   escolha *Adicionar à Tela de Início*.

Depois de instalado, o ícone fica na tela do celular e o aplicativo abre em
tela cheia, sem a barra do navegador — e funciona sem internet.

---

# Como atualizar depois

Quando houver uma versão nova do `index.html`:

1. No repositório, clique em **Add file → Upload files** e envie o arquivo
   novo por cima do antigo.
2. **Importante:** abra o arquivo `sw.js` no GitHub, clique no lápis para
   editar e mude o número da linha

   ```js
   const CACHE = "santo-terco-v1";
   ```

   para `"santo-terco-v2"`, depois `v3`, e assim por diante.

Esse número é o que faz os celulares que já instalaram irem buscar a versão
nova. Sem mudá-lo, quem já usava continua vendo a versão antiga, guardada no
próprio aparelho — e você vai achar que a atualização não funcionou.

---

# O que funciona em cada situação

| Como a pessoa abre | O que funciona |
|---|---|
| Pelo endereço publicado (`https://`) | Tudo |
| Arquivo salvo no aparelho, aberto com duplo clique | Terço completo, imagens, voz e Modo Direção |

As três funções que usam microfone — acompanhar pela voz, reconhecer dentro do
aparelho e transcrever comentários — **só funcionam pelo endereço publicado**.
Não é limitação do aplicativo: o navegador não libera o microfone para um
arquivo aberto direto do aparelho, e não há como contornar. Nessa situação o
aplicativo mostra as opções desabilitadas, com a explicação na tela.

---

# Os arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | O aplicativo inteiro. Sozinho, já reza o terço completo. |
| `manifest.json` | Faz o navegador oferecer "instalar na tela inicial". |
| `sw.js` | Faz funcionar sem internet depois do primeiro acesso. |
| `icones/` | Ícone do aplicativo na tela do celular. |
| `escuta-local.js` | Opcional. Só é carregado se a pessoa ligar o reconhecimento dentro do aparelho. Se você apagar, tudo o mais continua igual. |
| `.nojekyll` | Arquivo vazio que evita o GitHub processar os arquivos indevidamente. |

---

# Para mandar por WhatsApp

Se quiser dar o terço para alguém sem depender de internet nem de endereço,
mande apenas o `index.html`. A pessoa salva no celular ou no computador, abre,
e reza. Não instala nada, não cria conta, não precisa de rede.

---

# Privacidade

O aplicativo não usa contas, não tem anúncios, não coleta estatísticas e não
manda nada para servidor nenhum. Tudo o que ele guarda — o terço em andamento,
o histórico e as preferências — fica só no navegador de quem está usando.

Há três exceções, todas desligadas por padrão e todas avisadas com clareza na
própria tela antes de ligar:

- **Acompanhar pela voz** usa o reconhecimento de fala do navegador, que no
  Chrome envia o áudio para servidores do Google.
- **Reconhecer dentro do aparelho** baixa um modelo uma única vez e depois não
  envia áudio nenhum para lugar nenhum.
- **Transcrever comentários** usa uma chave de API do próprio usuário e envia
  áudio para o provedor que ele escolher.

---

# Conferência pastoral pendente

Os textos das orações seguem as versões mais difundidas no Brasil, mas alguns
pontos merecem conferência com um sacerdote ou catequista antes de uma
divulgação ampla:

- a redação do **Glória ao Pai** (forma curta ou longa), do **Oferecimento** e
  da **Oração final**, que variam entre comunidades;
- as **vinte meditações**, que são texto novo e são lidas em voz alta quando a
  locução completa está ligada;
- a **fórmula falada do anúncio** de cada mistério;
- os **emblemas da Assunção e da Visitação**, os dois de iconografia menos
  consagrada entre os vinte;
- a **tabela de variantes regionais** usada pelo acompanhamento por voz, que
  precisa incluir as formas rezadas na sua comunidade para acompanhar bem.
