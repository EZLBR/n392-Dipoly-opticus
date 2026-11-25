// ============================================================
//   Vagas de upload simultâneo do Studio
//
//   Cada envio fica em memória (até 5 MiB) e passa pelo Sharp, então o
//   processo limita quantos acontecem ao mesmo tempo. Antes o limite
//   era só global (2): um único cliente com duas conexões lentas (até
//   20 s cada) deixava todos os outros recebendo 503. Agora cada usuário
//   tem a própria vaga, e o teto global continua protegendo a memória.
// ============================================================

export class UploadSlots {
  private total = 0;
  private readonly porUsuario = new Map<string, number>();

  constructor(
    private readonly limitePorUsuario: number,
    private readonly limiteGlobal: number,
  ) {}

  /** Reserva uma vaga. Devolve a função que a libera, ou `null` se não houver vaga. */
  reservar(usuario: string): (() => void) | null {
    const doUsuario = this.porUsuario.get(usuario) ?? 0;
    if (doUsuario >= this.limitePorUsuario || this.total >= this.limiteGlobal) return null;

    this.total++;
    this.porUsuario.set(usuario, doUsuario + 1);

    let liberada = false;
    return () => {
      if (liberada) return;
      liberada = true;
      this.total--;
      const restante = (this.porUsuario.get(usuario) ?? 1) - 1;
      if (restante > 0) this.porUsuario.set(usuario, restante);
      else this.porUsuario.delete(usuario);
    };
  }

  /** Só para diagnóstico e testes. */
  emUso(usuario?: string): number {
    return usuario === undefined ? this.total : this.porUsuario.get(usuario) ?? 0;
  }
}

/**
 * Teto global de envios simultâneos, de `STUDIO_UPLOADS_SIMULTANEOS` (padrão 4).
 * O buffer é de até 5 MiB, mas uma imagem de 4096×4096 decodificada no Sharp
 * passa de 60 MiB: cada vaga pode custar isso de memória no pico.
 */
export function lerTetoDeUploads(valor: string | undefined): number {
  const texto = valor?.trim();
  if (!texto) return 4;
  const teto = Number(texto);
  if (!Number.isInteger(teto) || teto < 1 || teto > 64) {
    throw new Error("STUDIO_UPLOADS_SIMULTANEOS deve ser um inteiro entre 1 e 64.");
  }
  return teto;
}

/**
 * Dois envios por usuário, o mesmo que um usuário tinha antes, e no máximo
 * `STUDIO_UPLOADS_SIMULTANEOS` no processo. Dois envios simultâneos do mesmo
 * usuário continuam chegando à trava de cota no banco (FOR NO KEY UPDATE).
 */
export const studioUploadSlots = new UploadSlots(2, lerTetoDeUploads(process.env.STUDIO_UPLOADS_SIMULTANEOS));
