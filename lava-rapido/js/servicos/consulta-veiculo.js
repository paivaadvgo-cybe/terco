/**
 * VehicleLookupService — o que se sabe sobre uma placa.
 *
 * Hoje, e de propósito, **só o que foi digitado neste aparelho**. Quando a placa
 * já passou por aqui, o aplicativo recupera tipo, modelo e histórico do próprio
 * banco; quando não passou, não sabe nada e diz que não sabe.
 *
 * **Não há consulta a base de veículos, e não há endereço fictício neste
 * arquivo.** Consultar dado de veículo por placa é acesso a base pública
 * regulada, que exige autorização, contrato e finalidade declarada. Escrever
 * aqui uma URL inventada — ainda que comentada, ainda que «só de exemplo» —
 * criaria a impressão de um recurso que não existe e de uma permissão que
 * ninguém tem.
 *
 * O lugar da integração futura está pronto: `registrarProvedor` recebe uma
 * função e a consulta passa a usá-la. Quem tiver a autorização escreve a
 * função; nada mais no aplicativo muda.
 */

/** @type {null | { funcao: (placa: string) => Promise<object>, nome: string }} */
let provedor = null;

export function registrarProvedor(funcao, nome = 'externo') {
  provedor = funcao ? { funcao, nome } : null;
}

export function origemConfigurada() {
  return provedor ? provedor.nome : 'local';
}

/**
 * Consulta uma placa.
 *
 * A resposta local vem primeiro e é devolvida mesmo quando há provedor externo:
 * é instantânea, funciona sem internet e é a que interessa no atendimento —
 * quantas vezes o carro veio e o que ele costuma pedir.
 */
export async function consultar(placa, armazenamento) {
  const ficha = await armazenamento.fichaDaPlaca(placa);
  const local = ficha
    ? {
      origem: 'local',
      conhecido: true,
      placa,
      tipo: ficha.tipo,
      modelo: ficha.modelo,
      lavagens: ficha.lavagens,
      ultimaEm: ficha.ultima?.criadaEm ?? null,
      ultimoServicoId: ficha.ultimoServicoId,
    }
    : { origem: 'local', conhecido: false, placa };

  if (!provedor) return local;

  try {
    const externo = await provedor.funcao(placa);
    return { ...local, ...externo, origem: provedor.nome, conhecido: local.conhecido || Boolean(externo) };
  } catch {
    // Consulta externa que falha não pode atrapalhar o atendimento: vale o local.
    return local;
  }
}
