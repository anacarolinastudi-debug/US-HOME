# Contexto do Projeto US-HOME

Este documento registra as solicitações feitas para o projeto e as alterações implementadas.

## 2026-06-30

Solicitações:
- Criar um documento de contexto para salvar solicitações e alterações.
- Retirar a aba Histórico.
- Quando uma despesa for apagada, remover a informação dela do sistema.
- Mostrar despesas recorrentes sempre um mês à frente para previsibilidade de pagamentos.
- Trocar a seleção de meses para uma janela suspensa aberta pela seta para baixo.

Alterações:
- Adicionado este `CONTEXTO.md`.
- Removida a aba/rota Histórico da interface principal.
- Removida a permissão de Histórico do painel Admin.
- Alterado o fluxo de exclusão de despesas para apagar o registro definitivamente via RPC `cancel_expense`.
- Adicionada migration `0003_delete_and_recurring_preview.sql` para ajustar exclusão definitiva e geração de recorrentes do mês atual e do próximo mês.
- Atualizado o seletor de meses para usar dropdown.
- Adicionada projeção visual do próximo mês para despesas recorrentes quando a instância ainda não existir no banco.
