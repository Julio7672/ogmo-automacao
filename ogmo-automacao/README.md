# OGMO Suape — automação agendada

Executa **diariamente às 09:10, 10:10, 11:10, 15:40 e 16:40** no fuso `America/Sao_Paulo`.

## Instalação (Ubuntu / servidor Linux)

```bash
npm install
npx playwright install --with-deps chromium
cp .env.example .env
nano .env
npm run check
npm run once
```

Preencha as credenciais no `.env`, sem compartilhá-las em repositórios. O site usa HTTP, não HTTPS; a conexão não é criptografada. Considere o risco e, se possível, confirme com o operador se existe endereço HTTPS oficial. **Altere a senha que foi compartilhada na conversa.**

## Ativação permanente

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Execute o comando que o `pm2 startup` imprimir. Veja logs com `pm2 logs ogmo-automacao` e registros estruturados em `logs/events.jsonl`. Capturas em `artifacts/`.

## Estados registrados

- `NO_OPEN_CALL`: detectou `NÃO TEM CHAMADA ABERTA!` e interrompeu.
- `SELECTION_CLICKED_UNVERIFIED`: clicou em selecionar tudo, mas o salvamento **não foi comprovado**.
- `CONFIRMED`: somente quando `SUCCESS_TEXT` for configurado e aparecer exatamente na página.
- `FAILED`: erro com captura de tela.
- `SKIPPED_ALREADY_RUNNING`: outra execução detinha a trava.

## Limitações e cuidados

- **Não foi testado no site real.** Os seletores dos inputs e dos botões precisam ser validados, assim como a existência de confirmação posterior ao clique.
- O script não contorna CAPTCHA, autenticação multifator nem bloqueios do site.
- A trava `ogmo.lock` é local ao host; use uma única instância PM2. Se o processo for encerrado abruptamente, a trava pode permanecer. Verifique que não existe outra execução antes de remover o arquivo.
- O agendador só executa se o processo estiver ativo no momento programado. Não recupera execuções perdidas durante indisponibilidade do servidor.
- O resultado `SELECTION_CLICKED_UNVERIFIED` **não** significa inscrição confirmada. Inspecione a tela após clicar e configure `SUCCESS_TEXT` apenas quando souber o texto real.
- Respeite as regras de uso do portal e não execute tentativas excessivas.
