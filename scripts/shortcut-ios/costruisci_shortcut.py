#!/usr/bin/env python3
"""
Genera il comando iOS "Carica su Kommessa" (menu Condividi dell'app Foto).

Struttura, volutamente MINIMA (meno azioni = meno superficie che si rompe a un
aggiornamento di iOS), e senza cicli:

  1. Testo            → il token personale (l'utente lo incolla una volta)
  2. Imposta variabile "token"
  3. Ottieni contenuto URL (GET /api/link/commesse, header Authorization)
  4. Ottieni valore dizionario "commesse"
  5. Scegli da elenco (mostra `etichetta`)
  6. Ottieni valore dizionario "id"
  7. Imposta variabile "commessa"
  8. Ottieni contenuto URL (POST /api/link/upload, form: commessaId + file)
  9. Ottieni valore dizionario "messaggio"
 10. Mostra notifica

Output: un .plist non firmato, che `shortcuts sign` trasforma in .shortcut.
"""

import plistlib
import subprocess
import sys
import uuid
from pathlib import Path

# URL CANONICO, con il www: l'apex risponde 307 verso www, e per un POST
# multipart significherebbe spedire il corpo due volte.
BASE_URL = "https://www.kommessa.it"
SEGNAPOSTO_TOKEN = "INCOLLA-QUI-IL-TUO-TOKEN"
CON_RICERCA = False

# Elenco completo delle classi di contenuto accettate, copiato da un comando
# reale. I comandi veri le dichiarano tutte.
CLASSI_INPUT = [
    "WFAppStoreAppContentItem", "WFArticleContentItem", "WFContactContentItem",
    "WFDateContentItem", "WFEmailAddressContentItem", "WFGenericFileContentItem",
    "WFImageContentItem", "WFiTunesProductContentItem", "WFLocationContentItem",
    "WFDCMapsLinkContentItem", "WFAVAssetContentItem", "WFPDFContentItem",
    "WFPhoneNumberContentItem", "WFRichTextContentItem",
    "WFSafariWebPageContentItem", "WFStringContentItem", "WFURLContentItem",
]

# Carattere segnaposto che Shortcuts usa per innestare una variabile nel testo.
OGGETTO = "￼"


def uid() -> str:
    return str(uuid.uuid4()).upper()


def testo_con_variabili(template: str, variabili: list[str]) -> dict:
    """
    `template` contiene un OGGETTO per ogni variabile, in ordine.
    Shortcuts localizza le variabili per posizione del carattere.
    """
    allegati = {}
    posizione = -1
    for nome in variabili:
        posizione = template.index(OGGETTO, posizione + 1)
        allegati[f"{{{posizione}, 1}}"] = {"Type": "Variable", "VariableName": nome}
    return {
        "Value": {"string": template, "attachmentsByRange": allegati},
        "WFSerializationType": "WFTextTokenString",
    }


def variabile(nome: str) -> dict:
    """Riferimento a una variabile come valore intero di un campo."""
    return {
        "Value": {"Type": "Variable", "VariableName": nome},
        "WFSerializationType": "WFTextTokenAttachment",
    }


def uscita_azione(uuid_azione: str, nome: str) -> dict:
    """
    Riferimento all'output di un'azione tramite UUID.
    Piu' robusto del nome della variabile magica, che iOS LOCALIZZA: su un
    iPhone in inglese "Valore dizionario" non esiste, e il riferimento si
    romperebbe. L'UUID invece e' stabile in ogni lingua.
    """
    return {"Type": "ActionOutput", "OutputUUID": uuid_azione, "OutputName": nome}


def input_comando() -> dict:
    """L'input del comando: le foto selezionate nell'app Foto."""
    return {
        "Value": {"Type": "ExtensionInput"},
        "WFSerializationType": "WFTextTokenAttachment",
    }


def campo_file(nome: str) -> dict:
    """
    Campo FILE di un modulo (`WFHTTPBodyType: "Form"`).

    ⚠️ La forma esatta, ricavata leggendo un'azione configurata a mano nella UI
    e rileggendola dal database — due tentativi a naso erano falliti in modi
    diversi e istruttivi:
      * `WFItemType: 5` con l'allegato NUDO come valore → il parser va in
        eccezione e l'app crasha all'import (comando non installabile);
      * `WFItemType: 0` con l'allegato nudo → si importa, ma il file viene
        spedito come TESTO e al server non arriva nessun allegato.
    Il tipo 5 e' corretto; il valore va **avvolto due volte**, con un
    `WFTokenAttachmentParameterState` attorno al `WFTextTokenAttachment`.
    """
    return {
        "WFItemType": 5,
        "WFKey": {
            "Value": {"string": nome, "attachmentsByRange": {}},
            "WFSerializationType": "WFTextTokenString",
        },
        "WFValue": {
            "Value": input_comando(),
            "WFSerializationType": "WFTokenAttachmentParameterState",
        },
    }


def ingresso(uuid_azione: str, nome: str) -> dict:
    """
    Aggancia l'input di un'azione all'uscita di un'altra.

    ⚠️ NON esiste un concatenamento implicito: un'azione senza `WFInput`
    esplicito non riceve niente, e nella UI si riconosce perche' mostra un
    segnaposto grigio ("Dizionario") invece del nome del valore. Il guasto e'
    silenzioso — l'azione restituisce vuoto e il comando tira dritto.
    """
    return {
        "Value": uscita_azione(uuid_azione, nome),
        "WFSerializationType": "WFTextTokenAttachment",
    }


def azione(identificatore: str, parametri: dict) -> dict:
    return {
        "WFWorkflowActionIdentifier": identificatore,
        "WFWorkflowActionParameters": parametri,
    }


def costruisci(con_ricerca: bool = False) -> dict:
    uuid_token = uid()
    uuid_etichette = uid()
    uuid_messaggio = uid()
    uuid_lista = uid()      # GET commesse
    uuid_scelta = uid()     # scelta dell'utente
    uuid_upload = uid()     # POST upload
    uuid_cerca = uid()      # domanda di ricerca (solo variante con ricerca)

    # Ricerca senza rami condizionali: si chiede SEMPRE, e il caso vuoto si
    # comporta da solo — `?q=` vuoto fa tornare la lista completa. Un `se`
    # dentro un comando rapido sarebbe piu' fragile di quanto valga.
    prologo = (
        [
            azione(
                "is.workflow.actions.ask",
                {
                    "UUID": uuid_cerca,
                    "WFAskActionPrompt": "Cerca una commessa (vuoto = tutte)",
                    "WFInputType": "Text",
                    "WFAskActionDefaultAnswer": "",
                },
            )
        ]
        if con_ricerca
        else []
    )

    url_commesse = (
        {
            "Value": {
                "string": f"{BASE_URL}/api/link/commesse?q={OGGETTO}",
                "attachmentsByRange": {
                    f"{{{len(BASE_URL) + len('/api/link/commesse?q=')}, 1}}": uscita_azione(
                        uuid_cerca, "Risposta fornita"
                    )
                },
            },
            "WFSerializationType": "WFTextTokenString",
        }
        if con_ricerca
        else f"{BASE_URL}/api/link/commesse"
    )

    azioni = prologo + [
        # 1 — il token. È l'unica cosa che l'utente deve toccare.
        azione(
            "is.workflow.actions.gettext",
            {
                "UUID": uuid_token,
                "WFTextActionText": SEGNAPOSTO_TOKEN,
            },
        ),
        # 2 — in variabile, così lo si usa in due punti senza riscriverlo.
        azione(
            "is.workflow.actions.setvariable",
            {"WFInput": ingresso(uuid_token, "Testo"), "WFVariableName": "token"},
        ),
        # 3 — elenco commesse recenti.
        azione(
            "is.workflow.actions.downloadurl",
            {
                "UUID": uuid_lista,
                "WFURL": url_commesse,
                "WFHTTPMethod": "GET",
                "ShowHeaders": True,
                "WFHTTPHeaders": {
                    "Value": {
                        "WFDictionaryFieldValueItems": [
                            {
                                "WFItemType": 0,
                                "WFKey": {
                                    "Value": {"string": "Authorization", "attachmentsByRange": {}},
                                    "WFSerializationType": "WFTextTokenString",
                                },
                                "WFValue": {
                                    "Value": {
                                        "string": f"Bearer {OGGETTO}",
                                        "attachmentsByRange": {
                                            "{7, 1}": {
                                                "Type": "Variable",
                                                "VariableName": "token",
                                            }
                                        },
                                    },
                                    "WFSerializationType": "WFTextTokenString",
                                },
                            }
                        ]
                    },
                    "WFSerializationType": "WFDictionaryFieldValue",
                },
            },
        ),
        # 4 — dal JSON estrai l'elenco delle ETICHETTE (stringhe).
        # Far scegliere fra dizionari e' possibile ma Shortcuts li mostra in
        # modo imprevedibile: con le stringhe la lista e' leggibile, e il
        # server ri-risolve l'etichetta scelta in commessa.
        azione(
            "is.workflow.actions.getvalueforkey",
            {
                "UUID": uuid_etichette,
                "WFInput": ingresso(uuid_lista, "Contenuti dell'URL"),
                "WFGetDictionaryValueType": "Value",
                "WFDictionaryKey": "etichette",
            },
        ),
        # 5 — la scelta.
        # Due dettagli imparati leggendo un comando VERO:
        #  * il prompt e' un oggetto testo strutturato, non una stringa: con una
        #    stringa semplice il parametro non si inizializza e la schermata di
        #    scelta non compare proprio (il comando tira dritto fino in fondo);
        #  * l'input si dichiara ESPLICITAMENTE, non ci si affida al
        #    concatenamento implicito con l'azione precedente.
        azione(
            "is.workflow.actions.choosefromlist",
            {
                "WFInput": {
                    "Value": uscita_azione(uuid_etichette, "etichette"),
                    "WFSerializationType": "WFTextTokenAttachment",
                },
                "WFChooseFromListActionPrompt": {
                    "Value": {
                        "string": "Su quale commessa?",
                        "attachmentsByRange": {},
                    },
                    "WFSerializationType": "WFTextTokenString",
                },
                "WFChooseFromListActionSelectMultiple": False,
                "UUID": uuid_scelta,
            },
        ),
        azione(
            "is.workflow.actions.setvariable",
            {
                "WFInput": ingresso(uuid_scelta, "Elemento scelto"),
                "WFVariableName": "scelta",
            },
        ),
        # 8 — invio: TUTTA la selezione in una richiesta sola.
        azione(
            "is.workflow.actions.downloadurl",
            {
                "UUID": uuid_upload,
                "WFURL": f"{BASE_URL}/api/link/upload",
                "WFHTTPMethod": "POST",
                "ShowHeaders": True,
                "WFHTTPBodyType": "Form",
                "WFHTTPHeaders": {
                    "Value": {
                        "WFDictionaryFieldValueItems": [
                            {
                                "WFItemType": 0,
                                "WFKey": {
                                    "Value": {"string": "Authorization", "attachmentsByRange": {}},
                                    "WFSerializationType": "WFTextTokenString",
                                },
                                "WFValue": {
                                    "Value": {
                                        "string": f"Bearer {OGGETTO}",
                                        "attachmentsByRange": {
                                            "{7, 1}": {
                                                "Type": "Variable",
                                                "VariableName": "token",
                                            }
                                        },
                                    },
                                    "WFSerializationType": "WFTextTokenString",
                                },
                            }
                        ]
                    },
                    "WFSerializationType": "WFDictionaryFieldValue",
                },
                "WFFormValues": {
                    "Value": {
                        "WFDictionaryFieldValueItems": [
                            {
                                # 0 = testo
                                "WFItemType": 0,
                                "WFKey": {
                                    "Value": {"string": "etichetta", "attachmentsByRange": {}},
                                    "WFSerializationType": "WFTextTokenString",
                                },
                                "WFValue": {
                                    "Value": {
                                        "string": OGGETTO,
                                        "attachmentsByRange": {
                                            "{0, 1}": {
                                                "Type": "Variable",
                                                "VariableName": "scelta",
                                            }
                                        },
                                    },
                                    "WFSerializationType": "WFTextTokenString",
                                },
                            },
                            campo_file("file"),
                        ]
                    },
                    "WFSerializationType": "WFDictionaryFieldValue",
                },
            },
        ),
        # 9 — il server manda una frase pronta.
        azione(
            "is.workflow.actions.getvalueforkey",
            {
                "UUID": uuid_messaggio,
                "WFInput": ingresso(uuid_upload, "Contenuti dell'URL"),
                "WFGetDictionaryValueType": "Value",
                "WFDictionaryKey": "messaggio",
            },
        ),
        # 10 — notifica finale.
        azione(
            "is.workflow.actions.notification",
            {
                "WFNotificationActionTitle": "Kommessa",
                "WFNotificationActionBody": {
                    "Value": {
                        "string": OGGETTO,
                        "attachmentsByRange": {
                            "{0, 1}": uscita_azione(uuid_messaggio, "messaggio")
                        },
                    },
                    "WFSerializationType": "WFTextTokenString",
                },
                "WFNotificationActionSound": True,
            },
        ),
    ]

    return {
        # Valori ricavati da comandi REALI presenti sul Mac (Shortcuts.sqlite):
        # `WFWorkflowClientVersion` e' una STRINGA di versione, non un numero
        # inventato — un valore fuori scala fa fallire l'import in silenzio.
        "WFWorkflowClientVersion": "1146.16",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowIcon": {
            "WFWorkflowIconStartColor": 946986751,  # blu
            "WFWorkflowIconGlyphNumber": 59511,      # nuvola con freccia
        },
        # Compare nel menu Condividi.
        "WFWorkflowTypes": ["ActionExtension"],
        # I comandi veri dichiarano l'elenco COMPLETO delle classi accettate,
        # non un sottoinsieme: con tre sole voci l'import puo' rifiutare.
        "WFWorkflowInputContentItemClasses": CLASSI_INPUT,
        "WFWorkflowOutputContentItemClasses": [],
        "WFWorkflowHasShortcutInputVariables": True,
        "WFWorkflowImportQuestions": [],
        "WFWorkflowActions": azioni,
    }


def costruisci_video() -> dict:
    """
    Variante VIDEO: carica un file per volta **direttamente su R2**.

    `/api/link/upload` fa passare i byte dentro la richiesta al nostro server, e
    lì la piattaforma taglia a 100 MB. Qui invece si fa come l'app: si chiede un
    indirizzo firmato, si spediscono i byte a Cloudflare, si conferma. Il tetto
    diventa quello di R2 (5 GB).

    Un file per esecuzione, di proposito: il caso "tanti file" richiederebbe un
    ciclo, e dentro un ciclo l'elemento corrente si riferisce con un nome che
    iOS **localizza** — la stessa trappola che ha gia' fatto fallire due
    versioni di questo comando. Qui il file e' l'input del comando, riferimento
    che invece e' stabile in ogni lingua.
    """
    u_token, u_cerca, u_lista = uid(), uid(), uid()
    u_etichette, u_scelta = uid(), uid()
    u_prepara, u_url, u_rif = uid(), uid(), uid()
    u_completa, u_messaggio = uid(), uid()

    def header_auth():
        return {
            "Value": {
                "WFDictionaryFieldValueItems": [
                    {
                        "WFItemType": 0,
                        "WFKey": {
                            "Value": {"string": "Authorization", "attachmentsByRange": {}},
                            "WFSerializationType": "WFTextTokenString",
                        },
                        "WFValue": {
                            "Value": {
                                "string": f"Bearer {OGGETTO}",
                                "attachmentsByRange": {
                                    "{7, 1}": {"Type": "Variable", "VariableName": "token"}
                                },
                            },
                            "WFSerializationType": "WFTextTokenString",
                        },
                    }
                ]
            },
            "WFSerializationType": "WFDictionaryFieldValue",
        }

    def campo_testo(chiave: str, variabile: str):
        return {
            "WFItemType": 0,
            "WFKey": {
                "Value": {"string": chiave, "attachmentsByRange": {}},
                "WFSerializationType": "WFTextTokenString",
            },
            "WFValue": {
                "Value": {
                    "string": OGGETTO,
                    "attachmentsByRange": {
                        "{0, 1}": {"Type": "Variable", "VariableName": variabile}
                    },
                },
                "WFSerializationType": "WFTextTokenString",
            },
        }

    def estrai(uuid_sorgente: str, chiave: str, uuid_mio: str):
        return azione(
            "is.workflow.actions.getvalueforkey",
            {
                "UUID": uuid_mio,
                "WFInput": ingresso(uuid_sorgente, "Contenuti dell'URL"),
                "WFGetDictionaryValueType": "Value",
                "WFDictionaryKey": chiave,
            },
        )

    azioni = [
        azione("is.workflow.actions.gettext",
               {"UUID": u_token, "WFTextActionText": SEGNAPOSTO_TOKEN}),
        azione("is.workflow.actions.setvariable",
               {"WFInput": ingresso(u_token, "Testo"), "WFVariableName": "token"}),
        azione("is.workflow.actions.ask",
               {"UUID": u_cerca,
                "WFAskActionPrompt": "Cerca una commessa (vuoto = tutte)",
                "WFInputType": "Text", "WFAskActionDefaultAnswer": ""}),
        azione("is.workflow.actions.downloadurl", {
            "UUID": u_lista,
            "WFURL": {
                "Value": {
                    "string": f"{BASE_URL}/api/link/commesse?q={OGGETTO}",
                    "attachmentsByRange": {
                        f"{{{len(BASE_URL) + len('/api/link/commesse?q=')}, 1}}":
                            uscita_azione(u_cerca, "Risposta fornita")
                    },
                },
                "WFSerializationType": "WFTextTokenString",
            },
            "WFHTTPMethod": "GET", "ShowHeaders": True, "WFHTTPHeaders": header_auth(),
        }),
        estrai(u_lista, "etichette", u_etichette),
        azione("is.workflow.actions.choosefromlist", {
            "UUID": u_scelta,
            "WFInput": ingresso(u_etichette, "etichette"),
            "WFChooseFromListActionPrompt": "Su quale commessa?",
            "WFChooseFromListActionSelectMultiple": False,
        }),
        azione("is.workflow.actions.setvariable",
               {"WFInput": ingresso(u_scelta, "Elemento scelto"), "WFVariableName": "scelta"}),
        # 1° passo: chiedi l'indirizzo firmato
        azione("is.workflow.actions.downloadurl", {
            "UUID": u_prepara,
            "WFURL": f"{BASE_URL}/api/link/prepara",
            "WFHTTPMethod": "POST", "ShowHeaders": True, "WFHTTPHeaders": header_auth(),
            "WFHTTPBodyType": "Form",
            "WFFormValues": {
                "Value": {"WFDictionaryFieldValueItems": [campo_testo("etichetta", "scelta")]},
                "WFSerializationType": "WFDictionaryFieldValue",
            },
        }),
        estrai(u_prepara, "url", u_url),
        azione("is.workflow.actions.setvariable",
               {"WFInput": ingresso(u_url, "url"), "WFVariableName": "indirizzo"}),
        estrai(u_prepara, "fileRefId", u_rif),
        azione("is.workflow.actions.setvariable",
               {"WFInput": ingresso(u_rif, "fileRefId"), "WFVariableName": "riferimento"}),
        # 2° passo: i byte vanno DIRETTI a Cloudflare, non passano da noi
        azione("is.workflow.actions.downloadurl", {
            "WFURL": {
                "Value": {
                    "string": OGGETTO,
                    "attachmentsByRange": {
                        "{0, 1}": {"Type": "Variable", "VariableName": "indirizzo"}
                    },
                },
                "WFSerializationType": "WFTextTokenString",
            },
            "WFHTTPMethod": "PUT",
            "WFHTTPBodyType": "File",
            "WFRequestVariable": input_comando(),
        }),
        # 3° passo: conferma, e da qui riparte la solita coda (miniatura, sync)
        azione("is.workflow.actions.downloadurl", {
            "UUID": u_completa,
            "WFURL": f"{BASE_URL}/api/link/completa",
            "WFHTTPMethod": "POST", "ShowHeaders": True, "WFHTTPHeaders": header_auth(),
            "WFHTTPBodyType": "Form",
            "WFFormValues": {
                "Value": {"WFDictionaryFieldValueItems": [campo_testo("fileRefId", "riferimento")]},
                "WFSerializationType": "WFDictionaryFieldValue",
            },
        }),
        estrai(u_completa, "messaggio", u_messaggio),
        azione("is.workflow.actions.notification", {
            "WFNotificationActionTitle": "Kommessa",
            "WFNotificationActionBody": {
                "Value": {
                    "string": OGGETTO,
                    "attachmentsByRange": {"{0, 1}": uscita_azione(u_messaggio, "messaggio")},
                },
                "WFSerializationType": "WFTextTokenString",
            },
            "WFNotificationActionSound": True,
        }),
    ]

    base = costruisci()
    base["WFWorkflowActions"] = azioni
    return base


def main() -> int:
    # Secondo argomento opzionale: il token da incastonare. Serve per produrre
    # una copia gia' pronta per UNA persona (che quindi non deve incollare
    # niente). Il file diventa una credenziale: si consegna via AirDrop, mai
    # con un link, e si revoca il token se il telefono si perde.
    global SEGNAPOSTO_TOKEN, CON_RICERCA
    CON_RICERCA = "--ricerca" in sys.argv
    video = "--video" in sys.argv
    sys.argv = [a for a in sys.argv if a not in ("--ricerca", "--video")]
    if len(sys.argv) > 2:
        SEGNAPOSTO_TOKEN = sys.argv[2]
    destinazione = Path(sys.argv[1] if len(sys.argv) > 1 else "CaricaSuKommessa")
    # NB: `shortcuts sign` rifiuta qualunque estensione che non sia .shortcut,
    # anche se il contenuto e' un plist valido.
    non_firmato = destinazione.with_name(destinazione.name + "_nonfirmato.shortcut")
    firmato = destinazione.with_suffix(".shortcut")

    with open(non_firmato, "wb") as f:
        contenuto = costruisci_video() if video else costruisci(con_ricerca=CON_RICERCA)
        plistlib.dump(contenuto, f, fmt=plistlib.FMT_BINARY)
    print(f"plist scritto: {non_firmato} ({non_firmato.stat().st_size} byte)")

    esito = subprocess.run(
        ["shortcuts", "sign", "-m", "anyone", "-i", str(non_firmato), "-o", str(firmato)],
        capture_output=True,
        text=True,
    )
    if esito.returncode != 0:
        print("FIRMA FALLITA:")
        print(esito.stdout)
        print(esito.stderr)
        return 1
    print(f"firmato: {firmato} ({firmato.stat().st_size} byte)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
