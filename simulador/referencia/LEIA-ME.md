# Referência

Este diretório guarda a planilha que serve de fonte de verdade comportamental
para o simulador:

    Simulador_GoiasFomento 08-05-2025.xlsx

Ela não é lida pelo aplicativo em tempo de execução. Está aqui para que a
auditoria seja reproduzível: qualquer pessoa pode rodar

    python3 simulador/ferramentas/auditar_planilha.py \
        "simulador/referencia/Simulador_GoiasFomento 08-05-2025.xlsx" \
        simulador/auditoria/

e obter o mesmo inventário de abas, fórmulas e parâmetros que originou o
MAPA_DE_REGRAS_FINANCEIRAS.md e a MATRIZ_EXCEL_APLICATIVO.md.

Quando uma nova versão da planilha entrar em vigor, ela deve ser adicionada
aqui com o nome preservado, e não substituir a anterior — as simulações
guardam a versão dos parâmetros que usaram.
