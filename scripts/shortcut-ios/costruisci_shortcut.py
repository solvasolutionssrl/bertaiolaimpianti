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

BASE_URL = "https://kommessa.it"
SEGNAPOSTO_TOKEN = "INCOLLA-QUI-IL-TUO-TOKEN"

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


def azione(identificatore: str, parametri: dict) -> dict:
    return {
        "WFWorkflowActionIdentifier": identificatore,
        "WFWorkflowActionParameters": parametri,
    }


def costruisci() -> dict:
    uuid_token = uid()
    uuid_commesse = uid()
    uuid_messaggio = uid()

    azioni = [
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
            {"WFVariableName": "token"},
        ),
        # 3 — elenco commesse recenti.
        azione(
            "is.workflow.actions.downloadurl",
            {
                "WFURL": f"{BASE_URL}/api/link/commesse",
                "WFHTTPMethod": "GET",
                "ShowHeaders": True,
                "WFHTTPHeaders": {
                    "Value": {
                        "WFDictionaryFieldValueItems": [
                            {
                                "WFItemType": 0,
                                "WFKey": {
                                    "Value": {"string": "Authorization"},
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
        # 4 — dal JSON estrai l'array.
        azione(
            "is.workflow.actions.getvalueforkey",
            {
                "UUID": uuid_commesse,
                "WFDictionaryKey": "commesse",
            },
        ),
        # 5 — la scelta. `etichetta` e' gia' pronta lato server: una riga sola.
        azione(
            "is.workflow.actions.choosefromlist",
            {
                "WFChooseFromListActionPrompt": "Su quale commessa?",
                "WFChooseFromListActionSelectMultiple": False,
            },
        ),
        # 6 — dell'elemento scelto serve solo l'id.
        azione(
            "is.workflow.actions.getvalueforkey",
            {"WFDictionaryKey": "id"},
        ),
        azione(
            "is.workflow.actions.setvariable",
            {"WFVariableName": "commessa"},
        ),
        # 8 — invio: TUTTA la selezione in una richiesta sola.
        azione(
            "is.workflow.actions.downloadurl",
            {
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
                                    "Value": {"string": "Authorization"},
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
                                    "Value": {"string": "commessaId"},
                                    "WFSerializationType": "WFTextTokenString",
                                },
                                "WFValue": {
                                    "Value": {
                                        "string": OGGETTO,
                                        "attachmentsByRange": {
                                            "{0, 1}": {
                                                "Type": "Variable",
                                                "VariableName": "commessa",
                                            }
                                        },
                                    },
                                    "WFSerializationType": "WFTextTokenString",
                                },
                            },
                            {
                                # 5 = file
                                "WFItemType": 5,
                                "WFKey": {
                                    "Value": {"string": "file"},
                                    "WFSerializationType": "WFTextTokenString",
                                },
                                "WFValue": input_comando(),
                            },
                        ]
                    },
                    "WFSerializationType": "WFDictionaryFieldValue",
                },
            },
        ),
        # 9 — il server manda una frase pronta.
        azione(
            "is.workflow.actions.getvalueforkey",
            {"UUID": uuid_messaggio, "WFDictionaryKey": "messaggio"},
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
        "WFWorkflowClientVersion": "2605.0.5",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowIcon": {
            "WFWorkflowIconStartColor": 946986751,  # blu
            "WFWorkflowIconGlyphNumber": 59511,      # nuvola con freccia
        },
        # Compare nel menu Condividi e accetta immagini e media.
        "WFWorkflowTypes": ["ActionExtension"],
        "WFWorkflowInputContentItemClasses": [
            "WFImageContentItem",
            "WFAVAssetContentItem",
            "WFGenericFileContentItem",
        ],
        "WFWorkflowHasShortcutInputVariables": True,
        "WFWorkflowImportQuestions": [],
        "WFWorkflowActions": azioni,
    }


def main() -> int:
    destinazione = Path(sys.argv[1] if len(sys.argv) > 1 else "CaricaSuKommessa")
    # NB: `shortcuts sign` rifiuta qualunque estensione che non sia .shortcut,
    # anche se il contenuto e' un plist valido.
    non_firmato = destinazione.with_name(destinazione.name + "_nonfirmato.shortcut")
    firmato = destinazione.with_suffix(".shortcut")

    with open(non_firmato, "wb") as f:
        plistlib.dump(costruisci(), f, fmt=plistlib.FMT_BINARY)
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
