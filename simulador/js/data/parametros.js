/**
 * Parâmetros financeiros — GERADO, não editar à mão.
 *
 * Sai de `ferramentas/extrair_parametros.py`, que lê a planilha de
 * referência. Para mudar um valor aqui, muda-se a planilha e roda-se o
 * extrator de novo; assim a origem de cada número continua rastreável.
 *
 * Toda taxa vem com a unidade em que a planilha a escreveu. A conversão
 * para o período de cálculo é do motor, e cada família de produto
 * converte de um jeito.
 */

export const PARAMETROS = Object.freeze(
{
  "versao": "2024-12-16",
  "vigenciaInicio": "2024-12-16",
  "origem": "Simulador_GoiasFomento 08-05-2025.xlsx",
  "observacaoDeUnidade": "Toda taxa traz a unidade em que a planilha a escreveu. A conversão para o período de cálculo é responsabilidade do motor, e cada aba converte de um jeito: FCO usa (1+i_anual)^(1/12)-1 e Fungetur e FINEP usam (1+i_anual)^(22/252)-1.",
  "tabelaDeEncargos": [
    {
      "grupo": "Linhas para Capital de Giro",
      "unidadeTaxa": "mensal",
      "linhas": [
        {
          "nome": "GoiásFomento Giro",
          "origemLinha": 5,
          "prazoMaximo": 24.0,
          "carenciaMaxima": 3.0,
          "limite": 300000.0,
          "taxaCheia": {
            "valor": 0.023951442892062056,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.018442611026887785,
            "unidade": "mensal",
            "tipo": "efetiva"
          }
        },
        {
          "nome": "GoiásFomento Giro VIP",
          "origemLinha": 6,
          "prazoMaximo": 36.0,
          "carenciaMaxima": 3.0,
          "limite": 300000.0,
          "taxaCheia": {
            "valor": 0.021838080283938927,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.016815321818632975,
            "unidade": "mensal",
            "tipo": "efetiva"
          }
        },
        {
          "nome": "GoiásFomento Giro - IMCF",
          "origemLinha": 7,
          "prazoMaximo": 24.0,
          "carenciaMaxima": 3.0,
          "limite": 300000.0,
          "taxaCheia": {
            "valor": 0.02254253448664664,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.01735775155471791,
            "unidade": "mensal",
            "tipo": "efetiva"
          }
        },
        {
          "nome": "GoiásFomento Giro VIP - IMCF",
          "origemLinha": 8,
          "prazoMaximo": 36.0,
          "carenciaMaxima": 3.0,
          "limite": 300000.0,
          "taxaCheia": {
            "valor": 0.021309739631908152,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.016408499516569277,
            "unidade": "mensal",
            "tipo": "efetiva"
          }
        },
        {
          "nome": "GoiásFomento Giro Consorciado",
          "origemLinha": 9,
          "prazoMaximo": 36.0,
          "carenciaMaxima": 3.0,
          "limite": 300000.0,
          "taxaCheia": {
            "valor": 0.021309739631908152,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.016408499516569277,
            "unidade": "mensal",
            "tipo": "efetiva"
          }
        }
      ]
    },
    {
      "grupo": "Linhas para Investimentos",
      "unidadeTaxa": "mensal",
      "linhas": [
        {
          "nome": "GoiásFomento Investimento",
          "origemLinha": 12,
          "prazoMaximo": 60.0,
          "carenciaMaxima": 12.0,
          "limite": 400000.0,
          "taxaCheia": {
            "valor": 0.020770391882960065,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.01599320174987925,
            "unidade": "mensal",
            "tipo": "efetiva"
          }
        },
        {
          "nome": "GoiásFomento Investimento VIP",
          "origemLinha": 13,
          "prazoMaximo": 60.0,
          "carenciaMaxima": 12.0,
          "limite": 400000.0,
          "taxaCheia": {
            "valor": 0.01983478864498889,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.015272787256641447,
            "unidade": "mensal",
            "tipo": "efetiva"
          }
        },
        {
          "nome": "GoiásFomento Investimento - IMCF",
          "origemLinha": 14,
          "prazoMaximo": 60.0,
          "carenciaMaxima": 12.0,
          "limite": 400000.0,
          "taxaCheia": {
            "valor": 0.019273426702206185,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.014840538560698764,
            "unidade": "mensal",
            "tipo": "efetiva"
          }
        },
        {
          "nome": "GoiásFomento Investimento VIP - IMCF",
          "origemLinha": 15,
          "prazoMaximo": 60.0,
          "carenciaMaxima": 12.0,
          "limite": 400000.0,
          "taxaCheia": {
            "valor": 0.01833782346423501,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.014120124067460958,
            "unidade": "mensal",
            "tipo": "efetiva"
          }
        },
        {
          "nome": "GoiásFomento Eficiência Energética (fixo)",
          "origemLinha": 16,
          "prazoMaximo": 60.0,
          "carenciaMaxima": 6.0,
          "limite": 400000.0,
          "taxaCheia": {
            "valor": 0.01833782346423501,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.014120124067460958,
            "unidade": "mensal",
            "tipo": "efetiva"
          }
        },
        {
          "nome": "GoiásFomento Eficiência Energética MEI (fixo)",
          "origemLinha": 17,
          "prazoMaximo": 60.0,
          "carenciaMaxima": 6.0,
          "limite": 400000.0,
          "taxaCheia": {
            "valor": 0.01833782346423501,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.014120124067460958,
            "unidade": "mensal",
            "tipo": "efetiva"
          }
        }
      ]
    },
    {
      "grupo": "Linhas Especiais para Transportes",
      "unidadeTaxa": "mensal",
      "linhas": [
        {
          "nome": "GoiásFomento Feirantes",
          "origemLinha": 20,
          "prazoMaximo": 60.0,
          "carenciaMaxima": 3.0,
          "limite": 90000.0,
          "taxaCheia": {
            "valor": 0.0198,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0153,
            "unidade": "mensal",
            "tipo": "efetiva"
          }
        },
        {
          "nome": "GoiásFomento Taxi",
          "origemLinha": 21,
          "prazoMaximo": 60.0,
          "carenciaMaxima": 3.0,
          "limite": 90000.0,
          "taxaCheia": {
            "valor": 0.0219,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0159,
            "unidade": "mensal",
            "tipo": "efetiva"
          }
        },
        {
          "nome": "GoiásFomento Mototaxi",
          "origemLinha": 22,
          "prazoMaximo": 60.0,
          "carenciaMaxima": 3.0,
          "limite": 14000.0,
          "taxaCheia": {
            "valor": 0.0219,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0159,
            "unidade": "mensal",
            "tipo": "efetiva"
          }
        },
        {
          "nome": "GoiásFomento Transporte Escolar",
          "origemLinha": 23,
          "prazoMaximo": 60.0,
          "carenciaMaxima": 3.0,
          "limite": 150000.0,
          "taxaCheia": {
            "valor": 0.0219,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0159,
            "unidade": "mensal",
            "tipo": "efetiva"
          }
        },
        {
          "nome": "GoiásFomento TransGás",
          "origemLinha": 24,
          "prazoMaximo": 60.0,
          "carenciaMaxima": 3.0,
          "limite": 40000.0,
          "taxaCheia": {
            "valor": 0.0219,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0159,
            "unidade": "mensal",
            "tipo": "efetiva"
          }
        }
      ]
    },
    {
      "grupo": "Linhas Especiais de Giro Puro",
      "unidadeTaxa": "mensal",
      "linhas": [
        {
          "nome": "GoiásFomento Tecnologia / PQF-IEL / Turismo / FarmaDrogas / Contabilistas",
          "origemLinha": 27,
          "prazoMaximo": 36.0,
          "carenciaMaxima": 3.0,
          "limite": 300000.0,
          "taxaCheia": {
            "valor": 0.02218485176470588,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.017082335858823527,
            "unidade": "mensal",
            "tipo": "efetiva"
          }
        }
      ]
    },
    {
      "grupo": "Linhas Especiais Investimentos",
      "unidadeTaxa": "mensal",
      "linhas": [
        {
          "nome": "GoiásFomento Tecnologia / PQF-IEL / Turismo / FarmaDrogas / Contabilistas",
          "origemLinha": 30,
          "prazoMaximo": 60.0,
          "carenciaMaxima": 12.0,
          "limite": 400000.0,
          "taxaCheia": {
            "valor": 0.018587317661027326,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.01431223459899104,
            "unidade": "mensal",
            "tipo": "efetiva"
          }
        }
      ]
    },
    {
      "grupo": "Linha Microcrédito",
      "unidadeTaxa": "mensal",
      "linhas": [
        {
          "nome": "GoiásFomento Microcrédito Produtivo - Investimento",
          "origemLinha": 33,
          "prazoMaximo": 36.0,
          "carenciaMaxima": 12.0,
          "limite": 21000.0,
          "taxaCheia": {
            "valor": 0.0191571237,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0158999841,
            "unidade": "mensal",
            "tipo": "efetiva"
          }
        },
        {
          "nome": "GoiásFomento Microcrédito Produtivo - Capital de Giro",
          "origemLinha": 34,
          "prazoMaximo": 36.0,
          "carenciaMaxima": 3.0,
          "limite": 21000.0,
          "taxaCheia": null,
          "taxaBonus": null
        }
      ]
    },
    {
      "grupo": "Linhas Fungetur",
      "unidadeTaxa": "anual",
      "linhas": [
        {
          "nome": "GF Turismo Microcrédito Orientado Guias de Turismo",
          "origemLinha": 37,
          "prazoMaximo": 48.0,
          "carenciaMaxima": 12.0,
          "limite": 8000.0,
          "taxaCheia": {
            "valor": 0.025,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "taxaBonus": null,
          "taxaIndexador": {
            "valor": 0.1375,
            "unidade": "anual",
            "tipo": "efetiva"
          }
        },
        {
          "nome": "GF Turismo Giro Puro",
          "origemLinha": 38,
          "prazoMaximo": 60.0,
          "carenciaMaxima": 12.0,
          "limite": 400000.0,
          "taxaCheia": {
            "valor": 0.05,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "taxaBonus": null,
          "taxaIndexador": {
            "valor": 0.1375,
            "unidade": "anual",
            "tipo": "efetiva"
          }
        },
        {
          "nome": "GF Turismo Aquisição de Bens",
          "origemLinha": 39,
          "prazoMaximo": 60.0,
          "carenciaMaxima": 12.0,
          "limite": 1000000.0,
          "taxaCheia": {
            "valor": 0.05,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "taxaBonus": null,
          "taxaIndexador": {
            "valor": 0.1375,
            "unidade": "anual",
            "tipo": "efetiva"
          }
        },
        {
          "nome": "GF Turismo Capital Fixo",
          "origemLinha": 40,
          "prazoMaximo": 240.0,
          "carenciaMaxima": 60.0,
          "limite": 2000000.0,
          "taxaCheia": {
            "valor": 0.05,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "taxaBonus": null,
          "taxaIndexador": {
            "valor": 0.1375,
            "unidade": "anual",
            "tipo": "efetiva"
          }
        }
      ],
      "indexador": "SELIC"
    },
    {
      "grupo": "Linhas FINEP - PORTE I e II",
      "unidadeTaxa": "anual",
      "linhas": [
        {
          "nome": "FINEP - Inovacred",
          "origemLinha": 43,
          "prazoMaximo": 96.0,
          "carenciaMaxima": 24.0,
          "limite": 2000000.0,
          "taxaCheia": {
            "valor": 0.042,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "taxaBonus": null,
          "taxaIndexador": {
            "valor": 0.0119,
            "unidade": "anual",
            "tipo": "efetiva"
          }
        },
        {
          "nome": "FINEP - Inovacred Expresso",
          "origemLinha": 44,
          "prazoMaximo": 48.0,
          "carenciaMaxima": 12.0,
          "limite": 2000000.0,
          "taxaCheia": {
            "valor": 0.042,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "taxaBonus": null,
          "taxaIndexador": {
            "valor": 0.0119,
            "unidade": "anual",
            "tipo": "efetiva"
          }
        },
        {
          "nome": "FINEP - Aquisição Inovadora Telecom",
          "origemLinha": 45,
          "prazoMaximo": 120.0,
          "carenciaMaxima": 24.0,
          "limite": 2000000.0,
          "taxaCheia": {
            "valor": 0.07,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "taxaBonus": null,
          "taxaIndexador": {
            "valor": 0.0119,
            "unidade": "anual",
            "tipo": "efetiva"
          }
        }
      ],
      "indexador": "TR"
    },
    {
      "grupo": "Linhas FINEP - PORTE III",
      "unidadeTaxa": "anual",
      "linhas": [
        {
          "nome": "FINEP - Inovacred",
          "origemLinha": 47,
          "prazoMaximo": 96.0,
          "carenciaMaxima": 24.0,
          "limite": 2000000.0,
          "taxaCheia": {
            "valor": 0.055,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "taxaBonus": null,
          "taxaIndexador": {
            "valor": 0.0119,
            "unidade": "anual",
            "tipo": "efetiva"
          }
        },
        {
          "nome": "FINEP - Inovacred Expresso",
          "origemLinha": 48,
          "prazoMaximo": 48.0,
          "carenciaMaxima": 12.0,
          "limite": 2000000.0,
          "taxaCheia": {
            "valor": 0.055,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "taxaBonus": null,
          "taxaIndexador": {
            "valor": 0.0119,
            "unidade": "anual",
            "tipo": "efetiva"
          }
        },
        {
          "nome": "FINEP - Aquisição Inovadora Telecom",
          "origemLinha": 49,
          "prazoMaximo": 120.0,
          "carenciaMaxima": 24.0,
          "limite": 2000000.0,
          "taxaCheia": {
            "valor": 0.07,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "taxaBonus": null,
          "taxaIndexador": {
            "valor": 0.0119,
            "unidade": "anual",
            "tipo": "efetiva"
          }
        }
      ],
      "indexador": "TR"
    },
    {
      "grupo": "Linhas FCO Empresarial",
      "unidadeTaxa": "anual",
      "linhas": [
        {
          "nome": "FCO MEI",
          "origemLinha": 53,
          "prazoMaximo": 36.0,
          "carenciaMaxima": 3.0,
          "limite": 27000.0,
          "municipioPrioritario": {
            "taxaCheia": {
              "valor": 0.088992,
              "unidade": "anual",
              "tipo": "efetiva"
            },
            "taxaBonus": {
              "valor": 0.082918,
              "unidade": "anual",
              "tipo": "efetiva"
            }
          },
          "municipioNaoPrioritario": {
            "taxaCheia": {
              "valor": 0.09799,
              "unidade": "anual",
              "tipo": "efetiva"
            },
            "taxaBonus": {
              "valor": 0.090567,
              "unidade": "anual",
              "tipo": "efetiva"
            }
          }
        },
        {
          "nome": "FCO Empresarial - (Pequeno)",
          "origemLinha": 54,
          "prazoMaximo": 144.0,
          "carenciaMaxima": 36.0,
          "limite": 2000000.0,
          "municipioPrioritario": {
            "taxaCheia": {
              "valor": 0.088992,
              "unidade": "anual",
              "tipo": "efetiva"
            },
            "taxaBonus": {
              "valor": 0.082918,
              "unidade": "anual",
              "tipo": "efetiva"
            }
          },
          "municipioNaoPrioritario": {
            "taxaCheia": {
              "valor": 0.1277,
              "unidade": "anual",
              "tipo": "efetiva"
            },
            "taxaBonus": {
              "valor": 0.1174,
              "unidade": "anual",
              "tipo": "efetiva"
            }
          }
        },
        {
          "nome": "FCO Empresarial - (Pequeno Médio, Médio I)",
          "origemLinha": 55,
          "prazoMaximo": 144.0,
          "carenciaMaxima": 36.0,
          "limite": 2000000.0,
          "municipioPrioritario": {
            "taxaCheia": {
              "valor": 0.106346,
              "unidade": "anual",
              "tipo": "efetiva"
            },
            "taxaBonus": {
              "valor": 0.097669,
              "unidade": "anual",
              "tipo": "efetiva"
            }
          },
          "municipioNaoPrioritario": {
            "taxaCheia": {
              "valor": 0.1192,
              "unidade": "anual",
              "tipo": "efetiva"
            },
            "taxaBonus": {
              "valor": 0.108696,
              "unidade": "anual",
              "tipo": "efetiva"
            }
          }
        },
        {
          "nome": "FCO Empresarial Giro Dissociado",
          "origemLinha": 56,
          "prazoMaximo": 24.0,
          "carenciaMaxima": 6.0,
          "limite": 2000000.0,
          "municipioPrioritario": {
            "taxaCheia": {
              "valor": 0.0,
              "unidade": "anual",
              "tipo": "efetiva"
            },
            "taxaBonus": {
              "valor": 0.0,
              "unidade": "anual",
              "tipo": "efetiva"
            }
          },
          "municipioNaoPrioritario": {
            "taxaCheia": {
              "valor": 0.0,
              "unidade": "anual",
              "tipo": "efetiva"
            },
            "taxaBonus": {
              "valor": 0.0,
              "unidade": "anual",
              "tipo": "efetiva"
            }
          }
        },
        {
          "nome": "FCO PNMPO Investimento",
          "origemLinha": 57,
          "prazoMaximo": 36.0,
          "carenciaMaxima": 3.0,
          "limite": 21000.0,
          "municipioPrioritario": {
            "taxaCheia": {
              "valor": 0.0,
              "unidade": "anual",
              "tipo": "efetiva"
            },
            "taxaBonus": {
              "valor": 0.0,
              "unidade": "anual",
              "tipo": "efetiva"
            }
          },
          "municipioNaoPrioritario": {
            "taxaCheia": {
              "valor": 0.0,
              "unidade": "anual",
              "tipo": "efetiva"
            },
            "taxaBonus": {
              "valor": 0.0,
              "unidade": "anual",
              "tipo": "efetiva"
            }
          }
        },
        {
          "nome": "FCO PNMPO Giro Dissociado",
          "origemLinha": 58,
          "prazoMaximo": 18.0,
          "carenciaMaxima": 3.0,
          "limite": 7000.0,
          "municipioPrioritario": {
            "taxaCheia": {
              "valor": 0.0,
              "unidade": "anual",
              "tipo": "efetiva"
            },
            "taxaBonus": {
              "valor": 0.0,
              "unidade": "anual",
              "tipo": "efetiva"
            }
          },
          "municipioNaoPrioritario": {
            "taxaCheia": {
              "valor": 0.0,
              "unidade": "anual",
              "tipo": "efetiva"
            },
            "taxaBonus": {
              "valor": 0.0,
              "unidade": "anual",
              "tipo": "efetiva"
            }
          }
        },
        {
          "nome": "FCO Mini e Micro Geração de Energia",
          "origemLinha": 59,
          "prazoMaximo": 96.0,
          "carenciaMaxima": 6.0,
          "limite": 100000.0,
          "municipioPrioritario": {
            "taxaCheia": {
              "valor": 0.0,
              "unidade": "anual",
              "tipo": "efetiva"
            },
            "taxaBonus": {
              "valor": 0.0,
              "unidade": "anual",
              "tipo": "efetiva"
            }
          },
          "municipioNaoPrioritario": {
            "taxaCheia": {
              "valor": 0.0,
              "unidade": "anual",
              "tipo": "efetiva"
            },
            "taxaBonus": {
              "valor": 0.0,
              "unidade": "anual",
              "tipo": "efetiva"
            }
          }
        }
      ]
    },
    {
      "grupo": "Linhas FCO Rural e Verde",
      "unidadeTaxa": "anual",
      "linhas": [
        {
          "nome": "FCO Desenvolvimento Rural",
          "origemLinha": 61,
          "prazoMaximo": 144.0,
          "carenciaMaxima": 36.0,
          "limite": 2000000.0,
          "municipioPrioritario": {
            "taxaCheia": {
              "valor": 0.0905,
              "unidade": "anual",
              "tipo": "efetiva"
            },
            "taxaBonus": {
              "valor": 0.0856,
              "unidade": "anual",
              "tipo": "efetiva"
            }
          },
          "municipioNaoPrioritario": {
            "taxaCheia": null,
            "taxaBonus": null
          }
        },
        {
          "nome": "FCO Verde",
          "origemLinha": 62,
          "prazoMaximo": 240.0,
          "carenciaMaxima": 120.0,
          "limite": 2000000.0,
          "municipioPrioritario": {
            "taxaCheia": {
              "valor": 0.0746,
              "unidade": "anual",
              "tipo": "efetiva"
            },
            "taxaBonus": {
              "valor": 0.0722,
              "unidade": "anual",
              "tipo": "efetiva"
            }
          },
          "municipioNaoPrioritario": {
            "taxaCheia": null,
            "taxaBonus": null
          }
        }
      ]
    }
  ],
  "fatorKFGI": {
    "fatores": {
      "3": 0.0142,
      "4": 0.0062,
      "5": 0.0062,
      "6": 0.0062,
      "7": 0.0042,
      "8": 0.0042,
      "9": 0.0042,
      "10": 0.0031,
      "11": 0.0031,
      "12": 0.0031,
      "13": 0.0027,
      "14": 0.0027,
      "15": 0.0027,
      "16": 0.0024,
      "17": 0.0024,
      "18": 0.0024,
      "19": 0.0022,
      "20": 0.0022,
      "21": 0.0022,
      "22": 0.002,
      "23": 0.002,
      "24": 0.002,
      "25": 0.0018,
      "26": 0.0018,
      "27": 0.0018,
      "28": 0.0017,
      "29": 0.0017,
      "30": 0.0017,
      "31": 0.0016,
      "32": 0.0016,
      "33": 0.0016,
      "34": 0.0015,
      "35": 0.0015,
      "36": 0.0015,
      "37": 0.0014,
      "38": 0.0014,
      "39": 0.0014,
      "40": 0.0013,
      "41": 0.0013,
      "42": 0.0013,
      "43": 0.0013,
      "44": 0.0013,
      "45": 0.0012,
      "46": 0.0012,
      "47": 0.0012,
      "48": 0.0012,
      "49": 0.0011,
      "50": 0.0011,
      "51": 0.0011,
      "52": 0.0011,
      "53": 0.0011,
      "54": 0.0011,
      "55": 0.001,
      "56": 0.001,
      "57": 0.001,
      "58": 0.001,
      "59": 0.001,
      "60": 0.001,
      "61": 0.0009,
      "62": 0.0009,
      "63": 0.0009,
      "64": 0.0009,
      "65": 0.0009,
      "66": 0.0009,
      "67": 0.0009,
      "68": 0.0009,
      "69": 0.0009,
      "70": 0.0008,
      "71": 0.0008,
      "72": 0.0008,
      "73": 0.0008,
      "74": 0.0008,
      "75": 0.0008,
      "76": 0.0008,
      "77": 0.0008,
      "78": 0.0008,
      "79": 0.0007,
      "80": 0.0007,
      "81": 0.0007,
      "82": 0.0007,
      "83": 0.0007,
      "84": 0.0007,
      "85": 0.0007,
      "86": 0.0007,
      "87": 0.0007,
      "88": 0.0007,
      "89": 0.0007,
      "90": 0.0007,
      "91": 0.0006,
      "92": 0.0006,
      "93": 0.0006,
      "94": 0.0006,
      "95": 0.0006,
      "96": 0.0006,
      "97": 0.0006,
      "98": 0.0006,
      "99": 0.0006,
      "100": 0.0006,
      "101": 0.0006,
      "102": 0.0006,
      "103": 0.0005
    },
    "duplicidadesIgnoradas": [
      {
        "prazo": 84,
        "linha": 100,
        "fatorIgnorado": 0.0006,
        "fatorEmVigor": 0.0007
      }
    ]
  },
  "linhasPorAba": {
    "Linhas Giro Puro": {
      "familia": "giro",
      "layout": "mensal_percentual",
      "unidadeTaxa": "mensal",
      "linhas": [
        {
          "nome": "GoiásFomento Giro",
          "origemLinha": 5,
          "taxaCheia": {
            "valor": 0.0227,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 0.0181,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 0.0181,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 24.0,
          "carenciaMaxima": 3.0,
          "limite": 300000.0
        },
        {
          "nome": "GoiásFomento Giro  VIP",
          "origemLinha": 6,
          "taxaCheia": {
            "valor": 0.0219,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 0.0175,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 0.0175,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 36.0,
          "carenciaMaxima": 3.0,
          "limite": 300000.0
        },
        {
          "nome": "GoiásFomento Giro - IMCF",
          "origemLinha": 7,
          "taxaCheia": {
            "valor": 0.0217,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 0.0174,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 0.0174,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 24.0,
          "carenciaMaxima": 3.0,
          "limite": 300000.0
        },
        {
          "nome": "GoiásFomento Giro - VIP IMCF",
          "origemLinha": 8,
          "taxaCheia": {
            "valor": 0.0216,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 0.0172,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 0.0172,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 36.0,
          "carenciaMaxima": 3.0,
          "limite": 300000.0
        },
        {
          "nome": "GoiásFomento Giro Consorciado",
          "origemLinha": 9,
          "taxaCheia": {
            "valor": 0.0216,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 0.0172,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 0.0172,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 36.0,
          "carenciaMaxima": 3.0,
          "limite": 300000.0
        },
        {
          "nome": "GoiásFomento (GIRO)Tecnologia/PQF-IEL/Turismo/FarmaDrogas/ Contabilistas / Mulher Empreendedora",
          "origemLinha": 10,
          "taxaCheia": {
            "valor": 0.0221,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 0.0177,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 0.0177,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 36.0,
          "carenciaMaxima": 3.0,
          "limite": 300000.0
        },
        {
          "nome": "GoiásFomento Microcrédito Produtivo",
          "origemLinha": 11,
          "taxaCheia": {
            "valor": 0.0206,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 36.0,
          "carenciaMaxima": 3.0,
          "limite": 21000.0
        }
      ]
    },
    "Linhas Investimento": {
      "familia": "investimento",
      "layout": "mensal_decimal",
      "unidadeTaxa": "mensal",
      "linhas": [
        {
          "nome": "GoiásFomento Investimento",
          "origemLinha": 5,
          "taxaCheia": {
            "valor": 0.0217,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0174,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 0.0174,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 0.0174,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 60.0,
          "carenciaMaxima": 12.0,
          "limite": 400000.0
        },
        {
          "nome": "GoiásFomento Investimento VIP",
          "origemLinha": 6,
          "taxaCheia": {
            "valor": 0.0213,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.017,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 0.017,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 0.017,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 60.0,
          "carenciaMaxima": 12.0,
          "limite": 400000.0
        },
        {
          "nome": "GoiásFomento Investimento - IMCF",
          "origemLinha": 7,
          "taxaCheia": {
            "valor": 0.0209,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0167,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 0.0167,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 0.0167,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 60.0,
          "carenciaMaxima": 12.0,
          "limite": 400000.0
        },
        {
          "nome": "Goiás Fomento Investimento - VIP IMCF",
          "origemLinha": 8,
          "taxaCheia": {
            "valor": 0.0206,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 60.0,
          "carenciaMaxima": 12.0,
          "limite": 400000.0
        },
        {
          "nome": "GoiásFomento Eficiência Energética (fixo)",
          "origemLinha": 9,
          "taxaCheia": {
            "valor": 0.0206,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 60.0,
          "carenciaMaxima": 6.0,
          "limite": 400000.0
        },
        {
          "nome": "GoiásFomento Eficiência Energética MEI (fixo)",
          "origemLinha": 10,
          "taxaCheia": {
            "valor": 0.0206,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 60.0,
          "carenciaMaxima": 6.0,
          "limite": 30000.0
        },
        {
          "nome": "GoiásFomento (INVESTIMENTO)Tecnologia/PQF-IEL/Turismo/FarmaDrogas/ Contabilistas / Mulher Empreendedora",
          "origemLinha": 11,
          "taxaCheia": {
            "valor": 0.0206,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 60.0,
          "carenciaMaxima": 12.0,
          "limite": 400000.0
        },
        {
          "nome": "GoiásFomento Microcrédito Produtivo - Investimento",
          "origemLinha": 12,
          "taxaCheia": {
            "valor": 0.0206,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 36.0,
          "carenciaMaxima": 12.0,
          "limite": 21000.0
        }
      ]
    },
    "Linhas Transportes": {
      "familia": "transportes",
      "layout": "mensal_decimal",
      "unidadeTaxa": "mensal",
      "linhas": [
        {
          "nome": "GoiásFomento Taxi",
          "origemLinha": 5,
          "taxaCheia": {
            "valor": 0.0206,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 60.0,
          "carenciaMaxima": 3.0,
          "limite": 90000.0
        },
        {
          "nome": "GoiásFomento Mototaxi",
          "origemLinha": 6,
          "taxaCheia": {
            "valor": 0.0206,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 60.0,
          "carenciaMaxima": 3.0,
          "limite": 14000.0
        },
        {
          "nome": "GoiásFomento Transporte Escolar",
          "origemLinha": 7,
          "taxaCheia": {
            "valor": 0.0206,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 60.0,
          "carenciaMaxima": 3.0,
          "limite": 150000.0
        },
        {
          "nome": "Goiás Fomento TransGás",
          "origemLinha": 8,
          "taxaCheia": {
            "valor": 0.0206,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 60.0,
          "carenciaMaxima": 3.0,
          "limite": 40000.0
        },
        {
          "nome": "GoiásFomento Feirantes",
          "origemLinha": 9,
          "taxaCheia": {
            "valor": 0.0206,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 0.0165,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 60.0,
          "carenciaMaxima": 3.0,
          "limite": 200000.0
        }
      ]
    },
    "Mais Crédito": {
      "familia": "microcredito",
      "layout": "mensal_decimal",
      "unidadeTaxa": "mensal",
      "linhas": [
        {
          "nome": "Mais Crédito Aval do FUNDEQ",
          "origemLinha": 5,
          "taxaCheia": {
            "valor": 1.69,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 1.69,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 1.69,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 24.0,
          "carenciaMaxima": 3.0,
          "limite": 21000.0
        },
        {
          "nome": "Mais CrédIto com parceria - Juro Zero e Aval",
          "origemLinha": 6,
          "taxaCheia": {
            "valor": 1.69,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 0.0,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 0.0,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 24.0,
          "carenciaMaxima": 3.0,
          "limite": 21000.0
        },
        {
          "nome": "Mais Crédito Equalização de Juros FUNDEQ",
          "origemLinha": 7,
          "taxaCheia": {
            "valor": 1.69,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 0.0,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 0.0,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 24.0,
          "carenciaMaxima": 3.0,
          "limite": 21000.0
        },
        {
          "nome": "GoiásFomento Giro - VIP IMCF",
          "origemLinha": 8,
          "taxaCheia": {
            "valor": 1.9,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 1.47,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 1.47,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 36.0,
          "carenciaMaxima": 3.0,
          "limite": 300000.0
        },
        {
          "nome": "GoiásFomento Giro Consorciado",
          "origemLinha": 9,
          "taxaCheia": {
            "valor": 1.9,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 1.47,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 1.47,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 36.0,
          "carenciaMaxima": 3.0,
          "limite": 300000.0
        },
        {
          "nome": "GoiásFomento (GIRO)Tecnologia/PQF-IEL/Turismo/FarmaDrogas/ Contabilistas",
          "origemLinha": 10,
          "taxaCheia": {
            "valor": 2.05,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 1.58,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 1.58,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 36.0,
          "carenciaMaxima": 3.0,
          "limite": 300000.0
        },
        {
          "nome": "GoiásFomento Microcrédito Produtivo",
          "origemLinha": 11,
          "taxaCheia": {
            "valor": 1.82,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 1.5,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 1.5,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 1.5,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 36.0,
          "carenciaMaxima": 3.0,
          "limite": 21000.0
        }
      ]
    },
    "Linhas Fungetur": {
      "familia": "fungetur",
      "layout": "anual_percentual",
      "unidadeTaxa": "anual",
      "linhas": [
        {
          "nome": "GF Turismo Microcrédito Orientado Guias de Turismo",
          "origemLinha": 4,
          "taxaCheia": {
            "valor": 0.025,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "prazoMaximo": 48.0,
          "carenciaMaxima": 12.0,
          "limite": 8000.0
        },
        {
          "nome": "GF Turismo Giro Puro",
          "origemLinha": 5,
          "taxaCheia": {
            "valor": 0.05,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "prazoMaximo": 60.0,
          "carenciaMaxima": 12.0,
          "limite": 400000.0
        },
        {
          "nome": "GF Turismo Aquisição de Bens",
          "origemLinha": 6,
          "taxaCheia": {
            "valor": 0.05,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "prazoMaximo": 60.0,
          "carenciaMaxima": 12.0,
          "limite": 1000000.0
        },
        {
          "nome": "GF Turismo Capital Fixo",
          "origemLinha": 7,
          "taxaCheia": null,
          "prazoMaximo": null,
          "carenciaMaxima": null,
          "limite": null
        },
        {
          "nome": "GF Turismo Capital Fixo",
          "origemLinha": 14,
          "taxaCheia": {
            "valor": 0.05,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "prazoMaximo": 240.0,
          "carenciaMaxima": 60.0,
          "limite": 2000000.0
        }
      ]
    },
    "Linhas FINEP": {
      "familia": "finep",
      "layout": "anual_percentual_finep",
      "unidadeTaxa": "anual",
      "linhas": [
        {
          "nome": "FINEP - Inovacred",
          "origemLinha": 4,
          "taxaCheia": {
            "valor": 0.055,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "prazoMaximo": 96.0,
          "carenciaMaxima": 24.0,
          "valorMinimo": 150000.0,
          "limite": 2000000.0
        },
        {
          "nome": "FINEP - Inovacred Expresso",
          "origemLinha": 5,
          "taxaCheia": {
            "valor": 0.055,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "prazoMaximo": 48.0,
          "carenciaMaxima": 12.0,
          "valorMinimo": 50000.0,
          "limite": 2000000.0
        },
        {
          "nome": "FINEP - Aquisição Inovadora Telecom",
          "origemLinha": 6,
          "taxaCheia": {
            "valor": 0.07,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "prazoMaximo": 120.0,
          "carenciaMaxima": 24.0,
          "valorMinimo": 150000.0,
          "limite": 2000000.0
        }
      ]
    },
    "FCO Empresarial": {
      "familia": "fco",
      "layout": "anual_decimal",
      "unidadeTaxa": "anual",
      "linhas": [
        {
          "nome": "FCO MEI",
          "origemLinha": 5,
          "taxaCheia": {
            "valor": 0.088992,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.082918,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "prazoMaximo": 36.0,
          "carenciaMaxima": 3.0,
          "limite": 27000.0
        },
        {
          "nome": "FCO Empresarial Investimento (Pequeno)",
          "origemLinha": 6,
          "taxaCheia": {
            "valor": 0.088992,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.082918,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "prazoMaximo": 144.0,
          "carenciaMaxima": 36.0,
          "limite": 2000000.0
        },
        {
          "nome": "FCO Empresarial Investimento (Pequeno, Médio, Médio I)",
          "origemLinha": 7,
          "taxaCheia": {
            "valor": 0.106346,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.097669,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "prazoMaximo": 144.0,
          "carenciaMaxima": 36.0,
          "limite": 2000000.0
        },
        {
          "nome": "FCO Empresarial Giro Dissociado",
          "origemLinha": 8,
          "taxaCheia": {
            "valor": 0.0,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "prazoMaximo": 24.0,
          "carenciaMaxima": 6.0,
          "limite": 200000.0
        },
        {
          "nome": "FCO PNMPO Investimento",
          "origemLinha": 9,
          "taxaCheia": {
            "valor": 0.0,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "prazoMaximo": 36.0,
          "carenciaMaxima": 3.0,
          "limite": 21000.0
        },
        {
          "nome": "FCO PNMPO Giro Dissociado",
          "origemLinha": 10,
          "taxaCheia": {
            "valor": 0.0,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "prazoMaximo": 18.0,
          "carenciaMaxima": 3.0,
          "limite": 7000.0
        },
        {
          "nome": "FCO Mini e Micro Geração de Energia",
          "origemLinha": 11,
          "taxaCheia": {
            "valor": 0.0,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "prazoMaximo": 96.0,
          "carenciaMaxima": 6.0,
          "limite": 100000.0
        },
        {
          "nome": "LINHA",
          "origemLinha": 15,
          "taxaCheia": null,
          "taxaBonus": null,
          "prazoMaximo": null,
          "carenciaMaxima": null,
          "limite": null
        }
      ]
    },
    "FCO Rural": {
      "familia": "fco",
      "layout": "anual_decimal",
      "unidadeTaxa": "anual",
      "linhas": [
        {
          "nome": "FCO Desenvolvimento Rural",
          "origemLinha": 5,
          "taxaCheia": {
            "valor": 0.0905,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0856,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "prazoMaximo": 144.0,
          "carenciaMaxima": 36.0,
          "limite": 27000.0
        },
        {
          "nome": "FCO Verde",
          "origemLinha": 6,
          "taxaCheia": {
            "valor": 0.0746,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0722,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "prazoMaximo": 240.0,
          "carenciaMaxima": 120.0,
          "limite": 2000000.0
        },
        {
          "nome": "FCO Empresarial Giro Dissociado",
          "origemLinha": 7,
          "taxaCheia": {
            "valor": 0.0,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "prazoMaximo": 24.0,
          "carenciaMaxima": 6.0,
          "limite": 200000.0
        },
        {
          "nome": "FCO PNMPO Investimento",
          "origemLinha": 8,
          "taxaCheia": {
            "valor": 0.0,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "prazoMaximo": 36.0,
          "carenciaMaxima": 3.0,
          "limite": 21000.0
        },
        {
          "nome": "FCO PNMPO Giro Dissociado",
          "origemLinha": 9,
          "taxaCheia": {
            "valor": 0.0,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "prazoMaximo": 18.0,
          "carenciaMaxima": 3.0,
          "limite": 7000.0
        },
        {
          "nome": "FCO Mini e Micro Geração de Energia",
          "origemLinha": 10,
          "taxaCheia": {
            "valor": 0.0,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.0,
            "unidade": "anual",
            "tipo": "efetiva"
          },
          "prazoMaximo": 96.0,
          "carenciaMaxima": 6.0,
          "limite": 100000.0
        },
        {
          "nome": "LINHA",
          "origemLinha": 15,
          "taxaCheia": null,
          "taxaBonus": null,
          "prazoMaximo": null,
          "carenciaMaxima": null,
          "limite": null
        }
      ]
    },
    "Produtor Empreendedor": {
      "familia": "rural",
      "layout": "mensal_decimal",
      "unidadeTaxa": "mensal",
      "linhas": [
        {
          "nome": "Produtor Empreendedor",
          "origemLinha": 5,
          "taxaCheia": {
            "valor": 0.0169,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.005,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 0.005,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 0.005,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 144.0,
          "carenciaMaxima": 36.0,
          "limite": 27000.0
        },
        {
          "nome": "Produtor Empreendedor Fruticultura",
          "origemLinha": 6,
          "taxaCheia": {
            "valor": 0.0169,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaBonus": {
            "valor": 0.005,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG1": {
            "valor": 0.005,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "taxaCG2": {
            "valor": 0.005,
            "unidade": "mensal",
            "tipo": "efetiva"
          },
          "prazoMaximo": 240.0,
          "carenciaMaxima": 120.0,
          "limite": 2000000.0
        },
        {
          "nome": "LINHA",
          "origemLinha": 15,
          "taxaCheia": null,
          "taxaBonus": null,
          "taxaCG1": null,
          "taxaCG2": null,
          "prazoMaximo": null,
          "carenciaMaxima": null,
          "limite": null
        }
      ]
    }
  }
}
);

export default PARAMETROS;
