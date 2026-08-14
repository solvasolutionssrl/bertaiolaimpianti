/**
 * Export PDF della pianificazione settimanale (motore vettoriale jsPDF).
 *
 * Client-only: jsPDF viene importato dinamicamente al momento della chiamata
 * (come lo `stampa-qr-client`). Nessuna dipendenza nuova, testo nitido, file
 * leggeri, multi-pagina e multi-file (un download per categoria) triviali.
 *
 * Layout PER-DIPENDENTE (scelta cliente): righe dipendenti × giorni, A4 verticale.
 * Header col nome/logo del tenant REALE (generico, dual-addon safe). Le celle
 * mostrano nome cantiere + id commessa piccolo + fascia; le assenze in tinta rosa.
 *
 * Il motore è "muto": disegna esattamente i `giorni` e le `celle` che riceve.
 * La scelta di quali giorni includere è del chiamante.
 */

export type TipoVocePdf = 'cantiere' | 'evento' | 'formazione' | 'assenza';

export interface VocePdf {
  /** Riga principale: nome cantiere / titolo evento / tipo assenza. */
  testo: string;
  /** Riga piccola: id commessa interno, orario, ecc. */
  sub?: string;
  tipo: TipoVocePdf;
  bozza?: boolean;
}

export interface RigaPdf {
  nome: string;
  mansione?: string | null;
  /** Una lista di voci per ciascun giorno mostrato (len = giorni.length). */
  celle: VocePdf[][];
}

export interface GiornoPdf {
  nome: string; // "Lun"
  giorno: string; // "13"
  weekend: boolean;
}

export interface EsportaPdfOpts {
  tenantNome: string;
  logoUrl?: string | null;
  brandColor?: string | null; // hex, es. "#1340A6"
  titolo: string; // "Pianificazione settimanale" | "Assenze · Ferie e permessi"
  categoriaLabel?: string | null; // "Officina" | "Tutti i gruppi"
  settimana: number;
  anno: number;
  rangeLabel: string; // "13 luglio · 19 luglio 2026"
  giorni: GiornoPdf[];
  righe: RigaPdf[];
  filename: string;
}

type RGB = [number, number, number];

const INK: RGB = [30, 41, 59]; // slate-800
const MUTED: RGB = [100, 116, 139]; // slate-500
const LINE: RGB = [203, 213, 225]; // slate-300
const LINE_SOFT: RGB = [226, 232, 240]; // slate-200
const WEEKEND_BG: RGB = [248, 250, 252]; // slate-50
const HEAD_BG: RGB = [241, 245, 249]; // slate-100
const ROSE_BG: RGB = [255, 228, 230]; // rose-100
const ROSE_INK: RGB = [159, 18, 57]; // rose-800
const BRAND_FALLBACK: RGB = [19, 64, 166]; // #1340A6

function hexToRgb(hex?: string | null): RGB {
  if (!hex) return BRAND_FALLBACK;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return BRAND_FALLBACK;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Colore-tinta per tipo voce (bordo sinistro della cella). */
function tintaTipo(tipo: TipoVocePdf, brand: RGB): RGB {
  if (tipo === 'evento') return [13, 148, 136]; // teal-600
  if (tipo === 'formazione') return [124, 58, 237]; // violet-600
  if (tipo === 'assenza') return ROSE_INK;
  return brand;
}

/**
 * Carica il logo del tenant come data URL (via canvas → PNG). Best-effort: se
 * l'immagine è cross-origin senza CORS, non carica o va in timeout → null, e il
 * PDF usa il solo wordmark. Non blocca mai l'export.
 */
async function caricaLogo(url?: string | null): Promise<{ dataUrl: string; ratio: number } | null> {
  if (!url) return null;
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: { dataUrl: string; ratio: number } | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), 4000);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx || !canvas.width || !canvas.height) return finish(null);
          ctx.drawImage(img, 0, 0);
          finish({ dataUrl: canvas.toDataURL('image/png'), ratio: canvas.width / canvas.height });
        } catch {
          finish(null); // canvas "tainted" (CORS) → fallback wordmark
        }
      };
      img.onerror = () => {
        clearTimeout(timer);
        finish(null);
      };
      img.src = url;
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}

/**
 * Costruisce il documento PDF (senza salvarlo). Estratto per essere testabile
 * fuori dal browser (`pdf.output('arraybuffer')`); `esportaPianificazionePDF`
 * lo salva. Il caricamento del logo è best-effort (null in ambienti senza DOM).
 */
export async function costruisciDocumentoPdf(opts: EsportaPdfOpts) {
  const { default: JsPDF } = await import('jspdf');
  const brand = hexToRgb(opts.brandColor);
  const logo = await caricaLogo(opts.logoUrl);

  const pdf = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PW = pdf.internal.pageSize.getWidth(); // 210
  const PH = pdf.internal.pageSize.getHeight(); // 297
  const M = 12; // margine
  const contentW = PW - M * 2;

  // Basta una voce in bozza perché il foglio sia una bozza: il timbro va in
  // testa una volta, non ripetuto in ogni casella.
  const conBozze = opts.righe.some((r) => r.celle.some((c) => c.some((v) => v.bozza)));

  const nGiorni = Math.max(1, opts.giorni.length);
  const dipColW = 34;
  const dayColW = (contentW - dipColW) / nGiorni;

  const setFill = (c: RGB) => pdf.setFillColor(c[0], c[1], c[2]);
  const setText = (c: RGB) => pdf.setTextColor(c[0], c[1], c[2]);
  const setDraw = (c: RGB) => pdf.setDrawColor(c[0], c[1], c[2]);

  // ── Header di pagina (logo/nome + settimana) ──────────────────────
  const disegnaHeader = (): number => {
    let x = M;
    const topY = M;
    if (logo) {
      const h = 10;
      const w = Math.min(38, h * logo.ratio);
      try {
        pdf.addImage(logo.dataUrl, 'PNG', x, topY, w, h);
        x += w + 3;
      } catch {
        /* ignora: prosegue col wordmark */
      }
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    setText(brand);
    pdf.text(opts.tenantNome, x, topY + 5.5);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    setText(MUTED);
    pdf.text(opts.titolo, x, topY + 10);
    // Misurato ORA, col corpo del titolo: `getTextWidth` usa il font corrente,
    // quindi chiederlo dopo aver rimpicciolito darebbe un numero sbagliato.
    const titoloW = pdf.getTextWidth(opts.titolo);

    // Un timbro «bozza» solo, piccolo, accanto al titolo — non uno per casella.
    if (conBozze) {
      const et = 'BOZZA';
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(5.5);
      const bw = pdf.getTextWidth(et) + 2.6;
      // A destra ci sono settimana e periodo: se il titolo è lungo il timbro
      // scivola sotto invece di finirci addosso.
      const accanto = x + titoloW + 2.5;
      const stretto = accanto + bw > PW - M - 46;
      const bx = stretto ? x : accanto;
      const by = topY + (stretto ? 11.2 : 7.1);
      setFill(HEAD_BG);
      setDraw(LINE);
      pdf.setLineWidth(0.2);
      pdf.roundedRect(bx, by, bw, 3.6, 0.6, 0.6, 'FD');
      setText(MUTED);
      pdf.text(et, bx + 1.3, by + 2.5);
    }

    // Blocco destro: settimana + range + categoria (right-aligned).
    const rx = PW - M;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    setText(INK);
    pdf.text(`Settimana ${opts.settimana} · ${opts.anno}`, rx, topY + 4, { align: 'right' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    setText(MUTED);
    pdf.text(opts.rangeLabel, rx, topY + 8.5, { align: 'right' });
    if (opts.categoriaLabel) {
      pdf.setFont('helvetica', 'bold');
      setText(brand);
      pdf.text(opts.categoriaLabel, rx, topY + 13, { align: 'right' });
    }

    const ruleY = topY + 16;
    setDraw(brand);
    pdf.setLineWidth(0.5);
    pdf.line(M, ruleY, PW - M, ruleY);
    return ruleY + 4;
  };

  // ── Header di tabella (Dipendente | giorni) ───────────────────────
  const HEAD_H = 8;
  const disegnaTestaTabella = (y: number): number => {
    setFill(HEAD_BG);
    pdf.rect(M, y, contentW, HEAD_H, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    setText(MUTED);
    pdf.text('DIPENDENTE', M + 2, y + 5.4);
    opts.giorni.forEach((g, i) => {
      const cx = M + dipColW + dayColW * i + dayColW / 2;
      setText(g.weekend ? MUTED : INK);
      pdf.text(`${g.nome} ${g.giorno}`, cx, y + 5.4, { align: 'center' });
    });
    setDraw(LINE);
    pdf.setLineWidth(0.2);
    pdf.line(M, y + HEAD_H, PW - M, y + HEAD_H);
    return y + HEAD_H;
  };

  // ── Misura l'altezza di una riga (in base al testo che va a capo) ──
  const PAD = 1.6;
  const LH_MAIN = 3.2; // interlinea riga principale
  const LH_SUB = 2.7; // interlinea sub
  const misuraCella = (voci: VocePdf[]): number => {
    if (voci.length === 0) return 0;
    let h = 0;
    pdf.setFontSize(7);
    for (const v of voci) {
      const linee = pdf.splitTextToSize(v.testo, dayColW - 3) as string[];
      h += Math.max(1, linee.length) * LH_MAIN;
      if (v.sub) h += LH_SUB;
      h += 1.2; // gap tra voci
    }
    return h + PAD;
  };
  const misuraRiga = (r: RigaPdf): number => {
    let max = 7; // altezza minima
    for (const c of r.celle) max = Math.max(max, misuraCella(c) + PAD);
    return Math.max(9, max);
  };

  // ── Disegna una cella ─────────────────────────────────────────────
  const disegnaCella = (voci: VocePdf[], x: number, y: number, w: number, h: number, weekend: boolean) => {
    if (weekend) {
      setFill(WEEKEND_BG);
      pdf.rect(x, y, w, h, 'F');
    }
    let cy = y + PAD + 2.4;
    for (const v of voci) {
      const tint = tintaTipo(v.tipo, brand);
      const assenza = v.tipo === 'assenza';
      pdf.setFontSize(7);
      const linee = pdf.splitTextToSize(v.testo, w - 3) as string[];
      const blockH =
        Math.max(1, linee.length) * LH_MAIN + (v.sub ? LH_SUB : 0) + 0.8;
      // sfondo tinta per le assenze
      if (assenza) {
        setFill(ROSE_BG);
        pdf.rect(x + 0.6, cy - 2.6, w - 1.2, blockH + 1.4, 'F');
      }
      // barretta tinta a sinistra
      setFill(tint);
      pdf.rect(x + 0.6, cy - 2.6, 0.9, blockH + 1.4, 'F');
      // testo principale
      pdf.setFont('helvetica', assenza ? 'bold' : 'normal');
      setText(assenza ? ROSE_INK : INK);
      pdf.text(linee, x + 2.4, cy);
      cy += Math.max(1, linee.length) * LH_MAIN;
      if (v.sub) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(5.6);
        setText(assenza ? ROSE_INK : MUTED);
        pdf.text(v.sub, x + 2.4, cy);
        cy += LH_SUB;
      }
      // Il «bozza» NON si scrive qui. Stava in ogni casella, giorno per
      // giorno e persona per persona: ripetuto decine di volte sullo stesso
      // foglio e per giunta sopra il nome del cantiere, che copriva. Finché
      // non si va a regime stampano tutti così, quindi vale una volta sola —
      // il timbro sta nell'intestazione (vedi `disegnaHeader`).
      cy += 1.6;
    }
  };

  // ── Footer ────────────────────────────────────────────────────────
  let pagina = 0;
  const disegnaFooter = () => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    setText(MUTED);
    pdf.text('Kommessa · Pianificazione', M, PH - 6);
    pdf.text(`Pagina ${pagina}`, PW - M, PH - 6, { align: 'right' });
  };

  // ── Loop di disegno con paginazione ───────────────────────────────
  const nuovaPagina = (): number => {
    if (pagina > 0) {
      disegnaFooter();
      pdf.addPage();
    }
    pagina++;
    const afterHeader = disegnaHeader();
    return disegnaTestaTabella(afterHeader);
  };

  let y = nuovaPagina();
  const bottom = PH - 12;

  if (opts.righe.length === 0) {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(9);
    setText(MUTED);
    pdf.text('Nessuna assegnazione nel periodo selezionato.', M + 2, y + 8);
  }

  opts.righe.forEach((r, ri) => {
    const rowH = misuraRiga(r);
    if (y + rowH > bottom) y = nuovaPagina();

    // zebra
    if (ri % 2 === 1) {
      setFill([252, 252, 253]);
      pdf.rect(M, y, contentW, rowH, 'F');
    }
    // colonna dipendente
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    setText(INK);
    const nomeLines = pdf.splitTextToSize(r.nome, dipColW - 3) as string[];
    pdf.text(nomeLines.slice(0, 2), M + 2, y + 4.6);
    if (r.mansione) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6);
      setText(MUTED);
      pdf.text(
        (pdf.splitTextToSize(r.mansione, dipColW - 3) as string[]).slice(0, 1),
        M + 2,
        y + 4.6 + nomeLines.slice(0, 2).length * 3,
      );
    }
    // celle giorni
    opts.giorni.forEach((g, i) => {
      const x = M + dipColW + dayColW * i;
      disegnaCella(r.celle[i] ?? [], x, y, dayColW, rowH, g.weekend);
    });

    // riga separatrice
    setDraw(LINE_SOFT);
    pdf.setLineWidth(0.15);
    pdf.line(M, y + rowH, PW - M, y + rowH);
    y += rowH;
  });

  disegnaFooter();
  return pdf;
}

/**
 * Genera e scarica il PDF. Ritorna quando il file è stato salvato.
 */
export async function esportaPianificazionePDF(opts: EsportaPdfOpts): Promise<void> {
  const pdf = await costruisciDocumentoPdf(opts);
  pdf.save(opts.filename.endsWith('.pdf') ? opts.filename : `${opts.filename}.pdf`);
}
