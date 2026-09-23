/**
 * A ligação viva a uma mesa de poker.
 *
 * O resto do site pergunta ao servidor de meio em meio minuto. Uma mesa com
 * cinco pessoas não pode ser assim: quando alguém joga, os outros quatro têm
 * de saber no instante seguinte, e a perguntar de segundo a segundo a conta de
 * pedidos acabava num fim de semana.
 *
 * Então a ligação fica aberta e é a mesa que avisa. Do lado de cá isto é só um
 * cano: recebe a mesa já vista do nosso lugar, guarda-a, e manda as jogadas
 * para lá. Quem decide o que acontece é sempre o servidor.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { enderecoDaMesa } from './api';
import type { MesaViva } from './tipos';

/** De quanto em quanto se diz olá, para a ligação não ser dada por morta. */
const OLA = 25_000;
/** Quando cai, tenta outra vez, cada vez com mais calma. */
const ESPERAS = [600, 1200, 2500, 5000, 10000, 20000];

export type Ligacao = 'parada' | 'a-ligar' | 'ligada' | 'caiu' | 'sem-servidor';

export type Jogada = { a: string; [k: string]: unknown };

export function useMesaViva(mesa: string | null, nome: string, chave: string) {
  const [estado, setEstado] = useState<MesaViva | null>(null);
  const [ligacao, setLigacao] = useState<Ligacao>('parada');
  const [recado, setRecado] = useState('');

  const cano = useRef<WebSocket | null>(null);
  /* Quem somos, numa referência: a ligação abre uma vez e o nome pode ser
     escolhido depois dela estar aberta. */
  const quem = useRef({ nome, chave });
  quem.current = { nome, chave };

  const manda = useCallback((o: Jogada) => {
    const c = cano.current;
    if (c && c.readyState === WebSocket.OPEN) c.send(JSON.stringify(o));
  }, []);

  useEffect(() => {
    if (!mesa) {
      setLigacao('parada');
      setEstado(null);
      return;
    }

    let parado = false;
    let tentativas = 0;
    let volta = 0;
    let bate = 0;

    const abrir = async () => {
      if (parado) return;
      const endereco = await enderecoDaMesa(mesa);
      if (parado) return;
      if (!endereco) return setLigacao('sem-servidor');

      setLigacao((l) => (l === 'ligada' ? l : 'a-ligar'));
      const c = new WebSocket(endereco);
      cano.current = c;

      c.onopen = () => {
        tentativas = 0;
        setLigacao('ligada');
        const eu = quem.current;
        if (eu.nome && eu.chave) c.send(JSON.stringify({ a: 'entrar', ...eu }));
        bate = window.setInterval(() => {
          if (c.readyState === WebSocket.OPEN) c.send('ola');
        }, OLA);
      };

      c.onmessage = (e) => {
        // o "ok" é a resposta ao olá, e não tem nada lá dentro
        if (typeof e.data !== 'string' || e.data === 'ok') return;
        let veio;
        try {
          veio = JSON.parse(e.data);
        } catch {
          return;
        }
        /* A hora a que isto chegou fica marcada: e com ela e com a hora do
           servidor que se sabe de quanto e a diferenca entre os dois relogios. */
        if (veio.t === 'mesa') setEstado({ ...veio, recebidoEm: Date.now() } as MesaViva);
        if (veio.t === 'recado') setRecado(String(veio.texto || ''));
      };

      c.onclose = () => {
        window.clearInterval(bate);
        if (parado) return;
        setLigacao('caiu');
        volta = window.setTimeout(abrir, ESPERAS[Math.min(tentativas++, ESPERAS.length - 1)]);
      };
    };

    abrir();

    return () => {
      parado = true;
      window.clearInterval(bate);
      window.clearTimeout(volta);
      const c = cano.current;
      cano.current = null;
      if (c) {
        c.onclose = null;
        c.close();
      }
    };
  }, [mesa]);

  /* O nome pode ser escolhido com a ligação já aberta: quando isso acontece,
     diz-se quem somos sem fechar nada. */
  useEffect(() => {
    if (nome && chave) manda({ a: 'entrar', nome, chave });
  }, [nome, chave, manda]);

  return { estado, ligacao, recado, limparRecado: () => setRecado(''), manda };
}

/**
 * Quantos segundos faltam a quem está a jogar.
 *
 * O prazo vem no relógio do servidor, que pode não ser o nosso. Por isso vem
 * também a hora de lá, e a diferença entre as duas é o que faz a conta bater
 * mesmo num telemóvel com as horas trocadas.
 */
export function restam(estado: MesaViva | null, agora: number): number {
  if (!estado || !estado.mao || !estado.mao.prazo) return 0;
  const desvio = estado.agora - estado.recebidoEm;
  return Math.max(0, Math.round((estado.mao.prazo - (agora + desvio)) / 1000));
}
