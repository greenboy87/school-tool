/* Bewertungstabellen Sport – Leichtathletik und Schwimmen, Jgst. 5 bis 11.

   Quelle: ISB Bayern, „Empfehlungen zur Einordnung der quantitativen Messergebnisse
   in den Sportlichen Handlungsfeldern Laufen, Springen, Werfen / Leichtathletik und
   Sich im Wasser bewegen / Schwimmen" (2023). Link steht in der Datei selbst unter
   „url" und erscheint im Reiter Sport unter der Tabelle.

   Erzeugt aus dem PDF, nicht abgetippt. Je Disziplin:
     einheit   s | min:s | m | min
     richtung  „weniger" = schneller ist besser, „mehr" = weiter/hoeher/laenger
     noten     1 bis 5 mit Anzeigetext und rechenbarer Zahl (Zeiten in Sekunden)

   Unter Schwimmen steht bewusst kein „Ausdauer (Dauerlauf)“: Beim Erzeugen war
   diese Tabelle versehentlich in beide Sportarten geraten. Sie gehoert zur
   Leichtathletik.

   Diese Datei ist die mitgelieferte Fassung. Wer neuere Tabellen hat, laedt sie im
   Reiter Sport als Datei – die liegt dann lokal und geht dieser hier vor. */
const SportTabellen = {
 "quelle": "ISB Bayern – Empfehlungen zur Leistungsbewertung Sport für weiterführende Schulen (2023), Leichtathletik und Schwimmen",
 "url": "https://www.isb.bayern.de/fileadmin/user_upload/Gymnasium/Faecher/Sport/Leistungserhebungen/2_Empfehlungen_zur_Leistungsbewertung_Sport_fuer_weiterfuehrende_Schulen_2023_Leichtathletik_Schwimmen.pdf",
 "stand": "2023",
 "tabellen": [
  {
   "sportart": "Leichtathletik",
   "geschlecht": "Jungen",
   "jgst": 5,
   "disziplinen": [
    {
     "name": "Ausdauer (Dauerlauf)",
     "einheit": "min",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "20",
       "zahl": 20.0
      },
      "2": {
       "text": "18",
       "zahl": 18.0
      },
      "3": {
       "text": "15",
       "zahl": 15.0
      },
      "4": {
       "text": "12",
       "zahl": 12.0
      },
      "5": {
       "text": "8",
       "zahl": 8.0
      }
     }
    },
    {
     "name": "50 m",
     "einheit": "s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "8,5",
       "zahl": 8.5
      },
      "2": {
       "text": "9,1",
       "zahl": 9.1
      },
      "3": {
       "text": "9,7",
       "zahl": 9.7
      },
      "4": {
       "text": "10,4",
       "zahl": 10.4
      },
      "5": {
       "text": "11,2",
       "zahl": 11.2
      }
     }
    },
    {
     "name": "Weitsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "3,56",
       "zahl": 3.56
      },
      "2": {
       "text": "3,24",
       "zahl": 3.24
      },
      "3": {
       "text": "2,89",
       "zahl": 2.89
      },
      "4": {
       "text": "2,52",
       "zahl": 2.52
      },
      "5": {
       "text": "2,13",
       "zahl": 2.13
      }
     }
    },
    {
     "name": "Hochsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "1,10",
       "zahl": 1.1
      },
      "2": {
       "text": "1,02",
       "zahl": 1.02
      },
      "3": {
       "text": "0,94",
       "zahl": 0.94
      },
      "4": {
       "text": "0,85",
       "zahl": 0.85
      },
      "5": {
       "text": "0,76",
       "zahl": 0.76
      }
     }
    },
    {
     "name": "Wurf 80 g",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "33,00",
       "zahl": 33.0
      },
      "2": {
       "text": "28,50",
       "zahl": 28.5
      },
      "3": {
       "text": "24,00",
       "zahl": 24.0
      },
      "4": {
       "text": "19,50",
       "zahl": 19.5
      },
      "5": {
       "text": "14,00",
       "zahl": 14.0
      }
     }
    }
   ]
  },
  {
   "sportart": "Leichtathletik",
   "geschlecht": "Jungen",
   "jgst": 6,
   "disziplinen": [
    {
     "name": "Ausdauer (Dauerlauf)",
     "einheit": "min",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "24",
       "zahl": 24.0
      },
      "2": {
       "text": "21",
       "zahl": 21.0
      },
      "3": {
       "text": "18",
       "zahl": 18.0
      },
      "4": {
       "text": "14",
       "zahl": 14.0
      },
      "5": {
       "text": "10",
       "zahl": 10.0
      }
     }
    },
    {
     "name": "50 m",
     "einheit": "s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "8,2",
       "zahl": 8.2
      },
      "2": {
       "text": "8,8",
       "zahl": 8.8
      },
      "3": {
       "text": "9,3",
       "zahl": 9.3
      },
      "4": {
       "text": "10,0",
       "zahl": 10.0
      },
      "5": {
       "text": "10,8",
       "zahl": 10.8
      }
     }
    },
    {
     "name": "Weitsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "3,80",
       "zahl": 3.8
      },
      "2": {
       "text": "3,47",
       "zahl": 3.47
      },
      "3": {
       "text": "3,10",
       "zahl": 3.1
      },
      "4": {
       "text": "2,71",
       "zahl": 2.71
      },
      "5": {
       "text": "2,29",
       "zahl": 2.29
      }
     }
    },
    {
     "name": "Hochsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "1,17",
       "zahl": 1.17
      },
      "2": {
       "text": "1,09",
       "zahl": 1.09
      },
      "3": {
       "text": "1,00",
       "zahl": 1.0
      },
      "4": {
       "text": "0,91",
       "zahl": 0.91
      },
      "5": {
       "text": "0,81",
       "zahl": 0.81
      }
     }
    },
    {
     "name": "Wurf 200 g",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "33,00",
       "zahl": 33.0
      },
      "2": {
       "text": "29,50",
       "zahl": 29.5
      },
      "3": {
       "text": "26,00",
       "zahl": 26.0
      },
      "4": {
       "text": "20,50",
       "zahl": 20.5
      },
      "5": {
       "text": "12,00",
       "zahl": 12.0
      }
     }
    }
   ]
  },
  {
   "sportart": "Leichtathletik",
   "geschlecht": "Jungen",
   "jgst": 7,
   "disziplinen": [
    {
     "name": "Ausdauer (Dauerlauf)",
     "einheit": "min",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "27",
       "zahl": 27.0
      },
      "2": {
       "text": "24",
       "zahl": 24.0
      },
      "3": {
       "text": "21",
       "zahl": 21.0
      },
      "4": {
       "text": "16",
       "zahl": 16.0
      },
      "5": {
       "text": "11",
       "zahl": 11.0
      }
     }
    },
    {
     "name": "50 m",
     "einheit": "s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "8,0",
       "zahl": 8.0
      },
      "2": {
       "text": "8,4",
       "zahl": 8.4
      },
      "3": {
       "text": "8,9",
       "zahl": 8.9
      },
      "4": {
       "text": "9,6",
       "zahl": 9.6
      },
      "5": {
       "text": "10,3",
       "zahl": 10.3
      }
     }
    },
    {
     "name": "75 m",
     "einheit": "s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "11,4",
       "zahl": 11.4
      },
      "2": {
       "text": "12,1",
       "zahl": 12.1
      },
      "3": {
       "text": "12,9",
       "zahl": 12.9
      },
      "4": {
       "text": "13,7",
       "zahl": 13.7
      },
      "5": {
       "text": "14,6",
       "zahl": 14.6
      }
     }
    },
    {
     "name": "Weitsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "4,04",
       "zahl": 4.04
      },
      "2": {
       "text": "3,71",
       "zahl": 3.71
      },
      "3": {
       "text": "3,32",
       "zahl": 3.32
      },
      "4": {
       "text": "2,90",
       "zahl": 2.9
      },
      "5": {
       "text": "2,44",
       "zahl": 2.44
      }
     }
    },
    {
     "name": "Hochsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "1,23",
       "zahl": 1.23
      },
      "2": {
       "text": "1,15",
       "zahl": 1.15
      },
      "3": {
       "text": "1,07",
       "zahl": 1.07
      },
      "4": {
       "text": "0,96",
       "zahl": 0.96
      },
      "5": {
       "text": "0,86",
       "zahl": 0.86
      }
     }
    },
    {
     "name": "Wurf 200 g",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "37,00",
       "zahl": 37.0
      },
      "2": {
       "text": "33,50",
       "zahl": 33.5
      },
      "3": {
       "text": "29,00",
       "zahl": 29.0
      },
      "4": {
       "text": "23,00",
       "zahl": 23.0
      },
      "5": {
       "text": "14,00",
       "zahl": 14.0
      }
     }
    },
    {
     "name": "12-Minuten-Lauf",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "2600",
       "zahl": 2600.0
      },
      "2": {
       "text": "2400",
       "zahl": 2400.0
      },
      "3": {
       "text": "2150",
       "zahl": 2150.0
      },
      "4": {
       "text": "1850",
       "zahl": 1850.0
      },
      "5": {
       "text": "1450",
       "zahl": 1450.0
      }
     }
    }
   ]
  },
  {
   "sportart": "Leichtathletik",
   "geschlecht": "Jungen",
   "jgst": 8,
   "disziplinen": [
    {
     "name": "Ausdauer (Dauerlauf)",
     "einheit": "min",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "30",
       "zahl": 30.0
      },
      "2": {
       "text": "27",
       "zahl": 27.0
      },
      "3": {
       "text": "23",
       "zahl": 23.0
      },
      "4": {
       "text": "18",
       "zahl": 18.0
      },
      "5": {
       "text": "12",
       "zahl": 12.0
      }
     }
    },
    {
     "name": "75 m",
     "einheit": "s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "11,1",
       "zahl": 11.1
      },
      "2": {
       "text": "11,8",
       "zahl": 11.8
      },
      "3": {
       "text": "12,5",
       "zahl": 12.5
      },
      "4": {
       "text": "13,3",
       "zahl": 13.3
      },
      "5": {
       "text": "14,2",
       "zahl": 14.2
      }
     }
    },
    {
     "name": "Weitsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "4,28",
       "zahl": 4.28
      },
      "2": {
       "text": "3,94",
       "zahl": 3.94
      },
      "3": {
       "text": "3,53",
       "zahl": 3.53
      },
      "4": {
       "text": "3,09",
       "zahl": 3.09
      },
      "5": {
       "text": "2,60",
       "zahl": 2.6
      }
     }
    },
    {
     "name": "Hochsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "1,30",
       "zahl": 1.3
      },
      "2": {
       "text": "1,22",
       "zahl": 1.22
      },
      "3": {
       "text": "1,13",
       "zahl": 1.13
      },
      "4": {
       "text": "1,02",
       "zahl": 1.02
      },
      "5": {
       "text": "0,91",
       "zahl": 0.91
      }
     }
    },
    {
     "name": "Kugelstoß 3 kg",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "8,12",
       "zahl": 8.12
      },
      "2": {
       "text": "7,22",
       "zahl": 7.22
      },
      "3": {
       "text": "6,31",
       "zahl": 6.31
      },
      "4": {
       "text": "5,21",
       "zahl": 5.21
      },
      "5": {
       "text": "3,92",
       "zahl": 3.92
      }
     }
    },
    {
     "name": "Wurf 200 g",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "42,00",
       "zahl": 42.0
      },
      "2": {
       "text": "37,50",
       "zahl": 37.5
      },
      "3": {
       "text": "32,50",
       "zahl": 32.5
      },
      "4": {
       "text": "25,50",
       "zahl": 25.5
      },
      "5": {
       "text": "17,00",
       "zahl": 17.0
      }
     }
    },
    {
     "name": "12-Minuten-Lauf",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "2700",
       "zahl": 2700.0
      },
      "2": {
       "text": "2450",
       "zahl": 2450.0
      },
      "3": {
       "text": "2200",
       "zahl": 2200.0
      },
      "4": {
       "text": "1900",
       "zahl": 1900.0
      },
      "5": {
       "text": "1500",
       "zahl": 1500.0
      }
     }
    }
   ]
  },
  {
   "sportart": "Leichtathletik",
   "geschlecht": "Jungen",
   "jgst": 9,
   "disziplinen": [
    {
     "name": "Ausdauer (Dauerlauf)",
     "einheit": "min",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "33",
       "zahl": 33.0
      },
      "2": {
       "text": "30",
       "zahl": 30.0
      },
      "3": {
       "text": "25",
       "zahl": 25.0
      },
      "4": {
       "text": "20",
       "zahl": 20.0
      },
      "5": {
       "text": "13",
       "zahl": 13.0
      }
     }
    },
    {
     "name": "75 m",
     "einheit": "s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "10,9",
       "zahl": 10.9
      },
      "2": {
       "text": "11,4",
       "zahl": 11.4
      },
      "3": {
       "text": "12,1",
       "zahl": 12.1
      },
      "4": {
       "text": "12,9",
       "zahl": 12.9
      },
      "5": {
       "text": "13,7",
       "zahl": 13.7
      }
     }
    },
    {
     "name": "100 m",
     "einheit": "s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "13,6",
       "zahl": 13.6
      },
      "2": {
       "text": "14,3",
       "zahl": 14.3
      },
      "3": {
       "text": "15,2",
       "zahl": 15.2
      },
      "4": {
       "text": "16,1",
       "zahl": 16.1
      },
      "5": {
       "text": "17,1",
       "zahl": 17.1
      }
     }
    },
    {
     "name": "Weitsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "4,53",
       "zahl": 4.53
      },
      "2": {
       "text": "4,17",
       "zahl": 4.17
      },
      "3": {
       "text": "3,75",
       "zahl": 3.75
      },
      "4": {
       "text": "3,27",
       "zahl": 3.27
      },
      "5": {
       "text": "2,76",
       "zahl": 2.76
      }
     }
    },
    {
     "name": "Hochsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "1,37",
       "zahl": 1.37
      },
      "2": {
       "text": "1,29",
       "zahl": 1.29
      },
      "3": {
       "text": "1,19",
       "zahl": 1.19
      },
      "4": {
       "text": "1,08",
       "zahl": 1.08
      },
      "5": {
       "text": "0,95",
       "zahl": 0.95
      }
     }
    },
    {
     "name": "Kugelstoß 4 kg",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "9,00",
       "zahl": 9.0
      },
      "2": {
       "text": "8,10",
       "zahl": 8.1
      },
      "3": {
       "text": "7,00",
       "zahl": 7.0
      },
      "4": {
       "text": "5,80",
       "zahl": 5.8
      },
      "5": {
       "text": "4,50",
       "zahl": 4.5
      }
     }
    },
    {
     "name": "Wurf 200 g",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "47,00",
       "zahl": 47.0
      },
      "2": {
       "text": "41,50",
       "zahl": 41.5
      },
      "3": {
       "text": "35,50",
       "zahl": 35.5
      },
      "4": {
       "text": "28,00",
       "zahl": 28.0
      },
      "5": {
       "text": "19,00",
       "zahl": 19.0
      }
     }
    },
    {
     "name": "800 m",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "02:43",
       "zahl": 163
      },
      "2": {
       "text": "02:56",
       "zahl": 176
      },
      "3": {
       "text": "03:16",
       "zahl": 196
      },
      "4": {
       "text": "03:34",
       "zahl": 214
      },
      "5": {
       "text": "04:05",
       "zahl": 245
      }
     }
    },
    {
     "name": "12-Minuten-Lauf",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "2750",
       "zahl": 2750.0
      },
      "2": {
       "text": "2500",
       "zahl": 2500.0
      },
      "3": {
       "text": "2250",
       "zahl": 2250.0
      },
      "4": {
       "text": "1950",
       "zahl": 1950.0
      },
      "5": {
       "text": "1550",
       "zahl": 1550.0
      }
     }
    }
   ]
  },
  {
   "sportart": "Leichtathletik",
   "geschlecht": "Jungen",
   "jgst": 10,
   "disziplinen": [
    {
     "name": "Ausdauer (Dauerlauf)",
     "einheit": "min",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "35",
       "zahl": 35.0
      },
      "2": {
       "text": "31",
       "zahl": 31.0
      },
      "3": {
       "text": "27",
       "zahl": 27.0
      },
      "4": {
       "text": "21",
       "zahl": 21.0
      },
      "5": {
       "text": "14",
       "zahl": 14.0
      }
     }
    },
    {
     "name": "100 m",
     "einheit": "s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "13,3",
       "zahl": 13.3
      },
      "2": {
       "text": "14,0",
       "zahl": 14.0
      },
      "3": {
       "text": "14,8",
       "zahl": 14.8
      },
      "4": {
       "text": "15,7",
       "zahl": 15.7
      },
      "5": {
       "text": "16,7",
       "zahl": 16.7
      }
     }
    },
    {
     "name": "Weitsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "4,77",
       "zahl": 4.77
      },
      "2": {
       "text": "4,40",
       "zahl": 4.4
      },
      "3": {
       "text": "3,96",
       "zahl": 3.96
      },
      "4": {
       "text": "3,46",
       "zahl": 3.46
      },
      "5": {
       "text": "2,92",
       "zahl": 2.92
      }
     }
    },
    {
     "name": "Hochsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "1,44",
       "zahl": 1.44
      },
      "2": {
       "text": "1,36",
       "zahl": 1.36
      },
      "3": {
       "text": "1,25",
       "zahl": 1.25
      },
      "4": {
       "text": "1,14",
       "zahl": 1.14
      },
      "5": {
       "text": "1,00",
       "zahl": 1.0
      }
     }
    },
    {
     "name": "Kugelstoß 5 kg",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "8,80",
       "zahl": 8.8
      },
      "2": {
       "text": "7,90",
       "zahl": 7.9
      },
      "3": {
       "text": "6,90",
       "zahl": 6.9
      },
      "4": {
       "text": "5,70",
       "zahl": 5.7
      },
      "5": {
       "text": "4,30",
       "zahl": 4.3
      }
     }
    },
    {
     "name": "Speerwurf 600 g",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "33,00",
       "zahl": 33.0
      },
      "2": {
       "text": "29,10",
       "zahl": 29.1
      },
      "3": {
       "text": "24,50",
       "zahl": 24.5
      },
      "4": {
       "text": "19,20",
       "zahl": 19.2
      },
      "5": {
       "text": "13,00",
       "zahl": 13.0
      }
     }
    },
    {
     "name": "800 m",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "02:39",
       "zahl": 159
      },
      "2": {
       "text": "02:51",
       "zahl": 171
      },
      "3": {
       "text": "03:07",
       "zahl": 187
      },
      "4": {
       "text": "03:24",
       "zahl": 204
      },
      "5": {
       "text": "03:52",
       "zahl": 232
      }
     }
    },
    {
     "name": "12-Minuten-Lauf",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "2800",
       "zahl": 2800.0
      },
      "2": {
       "text": "2600",
       "zahl": 2600.0
      },
      "3": {
       "text": "2350",
       "zahl": 2350.0
      },
      "4": {
       "text": "2000",
       "zahl": 2000.0
      },
      "5": {
       "text": "1600",
       "zahl": 1600.0
      }
     }
    }
   ]
  },
  {
   "sportart": "Leichtathletik",
   "geschlecht": "Jungen",
   "jgst": 11,
   "disziplinen": [
    {
     "name": "Ausdauer (Dauerlauf)",
     "einheit": "min",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "37",
       "zahl": 37.0
      },
      "2": {
       "text": "33",
       "zahl": 33.0
      },
      "3": {
       "text": "29",
       "zahl": 29.0
      },
      "4": {
       "text": "23",
       "zahl": 23.0
      },
      "5": {
       "text": "15",
       "zahl": 15.0
      }
     }
    },
    {
     "name": "100 m",
     "einheit": "s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "13,1",
       "zahl": 13.1
      },
      "2": {
       "text": "13,6",
       "zahl": 13.6
      },
      "3": {
       "text": "14,4",
       "zahl": 14.4
      },
      "4": {
       "text": "15,3",
       "zahl": 15.3
      },
      "5": {
       "text": "16,2",
       "zahl": 16.2
      }
     }
    },
    {
     "name": "Weitsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "5,01",
       "zahl": 5.01
      },
      "2": {
       "text": "4,64",
       "zahl": 4.64
      },
      "3": {
       "text": "4,18",
       "zahl": 4.18
      },
      "4": {
       "text": "3,65",
       "zahl": 3.65
      },
      "5": {
       "text": "3,07",
       "zahl": 3.07
      }
     }
    },
    {
     "name": "Hochsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "1,50",
       "zahl": 1.5
      },
      "2": {
       "text": "1,42",
       "zahl": 1.42
      },
      "3": {
       "text": "1,32",
       "zahl": 1.32
      },
      "4": {
       "text": "1,19",
       "zahl": 1.19
      },
      "5": {
       "text": "1,05",
       "zahl": 1.05
      }
     }
    },
    {
     "name": "Kugelstoß 5 kg",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "9,54",
       "zahl": 9.54
      },
      "2": {
       "text": "8,65",
       "zahl": 8.65
      },
      "3": {
       "text": "7,55",
       "zahl": 7.55
      },
      "4": {
       "text": "6,24",
       "zahl": 6.24
      },
      "5": {
       "text": "4,85",
       "zahl": 4.85
      }
     }
    },
    {
     "name": "Speerwurf 600 g",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "34,00",
       "zahl": 34.0
      },
      "2": {
       "text": "30,50",
       "zahl": 30.5
      },
      "3": {
       "text": "26,20",
       "zahl": 26.2
      },
      "4": {
       "text": "21,10",
       "zahl": 21.1
      },
      "5": {
       "text": "15,30",
       "zahl": 15.3
      }
     }
    },
    {
     "name": "800 m",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "02:35",
       "zahl": 155
      },
      "2": {
       "text": "02:45",
       "zahl": 165
      },
      "3": {
       "text": "03:00",
       "zahl": 180
      },
      "4": {
       "text": "03:15",
       "zahl": 195
      },
      "5": {
       "text": "03:40",
       "zahl": 220
      }
     }
    },
    {
     "name": "12-Minuten-Lauf",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "2850",
       "zahl": 2850.0
      },
      "2": {
       "text": "2650",
       "zahl": 2650.0
      },
      "3": {
       "text": "2400",
       "zahl": 2400.0
      },
      "4": {
       "text": "2050",
       "zahl": 2050.0
      },
      "5": {
       "text": "1650",
       "zahl": 1650.0
      }
     }
    }
   ]
  },
  {
   "sportart": "Leichtathletik",
   "geschlecht": "Mädchen",
   "jgst": 5,
   "disziplinen": [
    {
     "name": "Ausdauer (Dauerlauf)",
     "einheit": "min",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "20",
       "zahl": 20.0
      },
      "2": {
       "text": "18",
       "zahl": 18.0
      },
      "3": {
       "text": "15",
       "zahl": 15.0
      },
      "4": {
       "text": "12",
       "zahl": 12.0
      },
      "5": {
       "text": "8",
       "zahl": 8.0
      }
     }
    },
    {
     "name": "50 m",
     "einheit": "s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "8,7",
       "zahl": 8.7
      },
      "2": {
       "text": "9,3",
       "zahl": 9.3
      },
      "3": {
       "text": "9,9",
       "zahl": 9.9
      },
      "4": {
       "text": "10,6",
       "zahl": 10.6
      },
      "5": {
       "text": "11,5",
       "zahl": 11.5
      }
     }
    },
    {
     "name": "Weitsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "3,40",
       "zahl": 3.4
      },
      "2": {
       "text": "3,06",
       "zahl": 3.06
      },
      "3": {
       "text": "2,70",
       "zahl": 2.7
      },
      "4": {
       "text": "2,31",
       "zahl": 2.31
      },
      "5": {
       "text": "1,90",
       "zahl": 1.9
      }
     }
    },
    {
     "name": "Hochsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "1,03",
       "zahl": 1.03
      },
      "2": {
       "text": "0,97",
       "zahl": 0.97
      },
      "3": {
       "text": "0,89",
       "zahl": 0.89
      },
      "4": {
       "text": "0,80",
       "zahl": 0.8
      },
      "5": {
       "text": "0,68",
       "zahl": 0.68
      }
     }
    },
    {
     "name": "Wurf 80 g",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "20,00",
       "zahl": 20.0
      },
      "2": {
       "text": "17,50",
       "zahl": 17.5
      },
      "3": {
       "text": "15,00",
       "zahl": 15.0
      },
      "4": {
       "text": "12,00",
       "zahl": 12.0
      },
      "5": {
       "text": "10,00",
       "zahl": 10.0
      }
     }
    }
   ]
  },
  {
   "sportart": "Leichtathletik",
   "geschlecht": "Mädchen",
   "jgst": 6,
   "disziplinen": [
    {
     "name": "Ausdauer (Dauerlauf)",
     "einheit": "min",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "24",
       "zahl": 24.0
      },
      "2": {
       "text": "21",
       "zahl": 21.0
      },
      "3": {
       "text": "18",
       "zahl": 18.0
      },
      "4": {
       "text": "14",
       "zahl": 14.0
      },
      "5": {
       "text": "10",
       "zahl": 10.0
      }
     }
    },
    {
     "name": "50 m",
     "einheit": "s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "8,5",
       "zahl": 8.5
      },
      "2": {
       "text": "9,0",
       "zahl": 9.0
      },
      "3": {
       "text": "9,6",
       "zahl": 9.6
      },
      "4": {
       "text": "10,2",
       "zahl": 10.2
      },
      "5": {
       "text": "11,1",
       "zahl": 11.1
      }
     }
    },
    {
     "name": "Weitsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "3,50",
       "zahl": 3.5
      },
      "2": {
       "text": "3,17",
       "zahl": 3.17
      },
      "3": {
       "text": "2,81",
       "zahl": 2.81
      },
      "4": {
       "text": "2,41",
       "zahl": 2.41
      },
      "5": {
       "text": "1,99",
       "zahl": 1.99
      }
     }
    },
    {
     "name": "Hochsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "1,07",
       "zahl": 1.07
      },
      "2": {
       "text": "1,00",
       "zahl": 1.0
      },
      "3": {
       "text": "0,92",
       "zahl": 0.92
      },
      "4": {
       "text": "0,83",
       "zahl": 0.83
      },
      "5": {
       "text": "0,72",
       "zahl": 0.72
      }
     }
    },
    {
     "name": "Wurf 80 g",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "25,00",
       "zahl": 25.0
      },
      "2": {
       "text": "22,00",
       "zahl": 22.0
      },
      "3": {
       "text": "19,00",
       "zahl": 19.0
      },
      "4": {
       "text": "15,50",
       "zahl": 15.5
      },
      "5": {
       "text": "12,00",
       "zahl": 12.0
      }
     }
    }
   ]
  },
  {
   "sportart": "Leichtathletik",
   "geschlecht": "Mädchen",
   "jgst": 7,
   "disziplinen": [
    {
     "name": "Ausdauer (Dauerlauf)",
     "einheit": "min",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "27",
       "zahl": 27.0
      },
      "2": {
       "text": "24",
       "zahl": 24.0
      },
      "3": {
       "text": "21",
       "zahl": 21.0
      },
      "4": {
       "text": "16",
       "zahl": 16.0
      },
      "5": {
       "text": "11",
       "zahl": 11.0
      }
     }
    },
    {
     "name": "50 m",
     "einheit": "s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "8,2",
       "zahl": 8.2
      },
      "2": {
       "text": "8,6",
       "zahl": 8.6
      },
      "3": {
       "text": "9,2",
       "zahl": 9.2
      },
      "4": {
       "text": "9,9",
       "zahl": 9.9
      },
      "5": {
       "text": "10,7",
       "zahl": 10.7
      }
     }
    },
    {
     "name": "75 m",
     "einheit": "s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "11,9",
       "zahl": 11.9
      },
      "2": {
       "text": "12,7",
       "zahl": 12.7
      },
      "3": {
       "text": "13,5",
       "zahl": 13.5
      },
      "4": {
       "text": "14,4",
       "zahl": 14.4
      },
      "5": {
       "text": "15,4",
       "zahl": 15.4
      }
     }
    },
    {
     "name": "Weitsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "3,61",
       "zahl": 3.61
      },
      "2": {
       "text": "3,28",
       "zahl": 3.28
      },
      "3": {
       "text": "2,91",
       "zahl": 2.91
      },
      "4": {
       "text": "2,52",
       "zahl": 2.52
      },
      "5": {
       "text": "2,09",
       "zahl": 2.09
      }
     }
    },
    {
     "name": "Hochsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "1,11",
       "zahl": 1.11
      },
      "2": {
       "text": "1,04",
       "zahl": 1.04
      },
      "3": {
       "text": "0,97",
       "zahl": 0.97
      },
      "4": {
       "text": "0,88",
       "zahl": 0.88
      },
      "5": {
       "text": "0,77",
       "zahl": 0.77
      }
     }
    },
    {
     "name": "Wurf 200 g",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "25,00",
       "zahl": 25.0
      },
      "2": {
       "text": "21,50",
       "zahl": 21.5
      },
      "3": {
       "text": "18,00",
       "zahl": 18.0
      },
      "4": {
       "text": "14,00",
       "zahl": 14.0
      },
      "5": {
       "text": "10,00",
       "zahl": 10.0
      }
     }
    },
    {
     "name": "12-Minuten-Lauf",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "2300",
       "zahl": 2300.0
      },
      "2": {
       "text": "2100",
       "zahl": 2100.0
      },
      "3": {
       "text": "1850",
       "zahl": 1850.0
      },
      "4": {
       "text": "1600",
       "zahl": 1600.0
      },
      "5": {
       "text": "1300",
       "zahl": 1300.0
      }
     }
    }
   ]
  },
  {
   "sportart": "Leichtathletik",
   "geschlecht": "Mädchen",
   "jgst": 8,
   "disziplinen": [
    {
     "name": "Ausdauer (Dauerlauf)",
     "einheit": "min",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "30",
       "zahl": 30.0
      },
      "2": {
       "text": "27",
       "zahl": 27.0
      },
      "3": {
       "text": "23",
       "zahl": 23.0
      },
      "4": {
       "text": "18",
       "zahl": 18.0
      },
      "5": {
       "text": "12",
       "zahl": 12.0
      }
     }
    },
    {
     "name": "75 m",
     "einheit": "s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "11,7",
       "zahl": 11.7
      },
      "2": {
       "text": "12,4",
       "zahl": 12.4
      },
      "3": {
       "text": "13,2",
       "zahl": 13.2
      },
      "4": {
       "text": "14,1",
       "zahl": 14.1
      },
      "5": {
       "text": "15,0",
       "zahl": 15.0
      }
     }
    },
    {
     "name": "Weitsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "3,71",
       "zahl": 3.71
      },
      "2": {
       "text": "3,39",
       "zahl": 3.39
      },
      "3": {
       "text": "3,02",
       "zahl": 3.02
      },
      "4": {
       "text": "2,62",
       "zahl": 2.62
      },
      "5": {
       "text": "2,18",
       "zahl": 2.18
      }
     }
    },
    {
     "name": "Hochsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "1,16",
       "zahl": 1.16
      },
      "2": {
       "text": "1,09",
       "zahl": 1.09
      },
      "3": {
       "text": "1,01",
       "zahl": 1.01
      },
      "4": {
       "text": "0,93",
       "zahl": 0.93
      },
      "5": {
       "text": "0,83",
       "zahl": 0.83
      }
     }
    },
    {
     "name": "Kugelstoß 3 kg",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "7,20",
       "zahl": 7.2
      },
      "2": {
       "text": "6,50",
       "zahl": 6.5
      },
      "3": {
       "text": "5,70",
       "zahl": 5.7
      },
      "4": {
       "text": "4,70",
       "zahl": 4.7
      },
      "5": {
       "text": "3,50",
       "zahl": 3.5
      }
     }
    },
    {
     "name": "Wurf 200 g",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "27,50",
       "zahl": 27.5
      },
      "2": {
       "text": "24,50",
       "zahl": 24.5
      },
      "3": {
       "text": "20,50",
       "zahl": 20.5
      },
      "4": {
       "text": "16,00",
       "zahl": 16.0
      },
      "5": {
       "text": "11,00",
       "zahl": 11.0
      }
     }
    },
    {
     "name": "12-Minuten-Lauf",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "2350",
       "zahl": 2350.0
      },
      "2": {
       "text": "2150",
       "zahl": 2150.0
      },
      "3": {
       "text": "1900",
       "zahl": 1900.0
      },
      "4": {
       "text": "1650",
       "zahl": 1650.0
      },
      "5": {
       "text": "1350",
       "zahl": 1350.0
      }
     }
    }
   ]
  },
  {
   "sportart": "Leichtathletik",
   "geschlecht": "Mädchen",
   "jgst": 9,
   "disziplinen": [
    {
     "name": "Ausdauer (Dauerlauf)",
     "einheit": "min",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "33",
       "zahl": 33.0
      },
      "2": {
       "text": "30",
       "zahl": 30.0
      },
      "3": {
       "text": "25",
       "zahl": 25.0
      },
      "4": {
       "text": "20",
       "zahl": 20.0
      },
      "5": {
       "text": "13",
       "zahl": 13.0
      }
     }
    },
    {
     "name": "75 m",
     "einheit": "s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "11,5",
       "zahl": 11.5
      },
      "2": {
       "text": "12,1",
       "zahl": 12.1
      },
      "3": {
       "text": "12,8",
       "zahl": 12.8
      },
      "4": {
       "text": "13,7",
       "zahl": 13.7
      },
      "5": {
       "text": "14,6",
       "zahl": 14.6
      }
     }
    },
    {
     "name": "100 m",
     "einheit": "s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "15,0",
       "zahl": 15.0
      },
      "2": {
       "text": "15,9",
       "zahl": 15.9
      },
      "3": {
       "text": "16,8",
       "zahl": 16.8
      },
      "4": {
       "text": "17,8",
       "zahl": 17.8
      },
      "5": {
       "text": "19,0",
       "zahl": 19.0
      }
     }
    },
    {
     "name": "Weitsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "3,81",
       "zahl": 3.81
      },
      "2": {
       "text": "3,49",
       "zahl": 3.49
      },
      "3": {
       "text": "3,13",
       "zahl": 3.13
      },
      "4": {
       "text": "2,72",
       "zahl": 2.72
      },
      "5": {
       "text": "2,27",
       "zahl": 2.27
      }
     }
    },
    {
     "name": "Hochsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "1,20",
       "zahl": 1.2
      },
      "2": {
       "text": "1,13",
       "zahl": 1.13
      },
      "3": {
       "text": "1,06",
       "zahl": 1.06
      },
      "4": {
       "text": "0,98",
       "zahl": 0.98
      },
      "5": {
       "text": "0,88",
       "zahl": 0.88
      }
     }
    },
    {
     "name": "Kugelstoß 3 kg",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "7,40",
       "zahl": 7.4
      },
      "2": {
       "text": "6,70",
       "zahl": 6.7
      },
      "3": {
       "text": "5,90",
       "zahl": 5.9
      },
      "4": {
       "text": "4,90",
       "zahl": 4.9
      },
      "5": {
       "text": "3,70",
       "zahl": 3.7
      }
     }
    },
    {
     "name": "Wurf 200 g",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "31,50",
       "zahl": 31.5
      },
      "2": {
       "text": "27,50",
       "zahl": 27.5
      },
      "3": {
       "text": "23,00",
       "zahl": 23.0
      },
      "4": {
       "text": "18,00",
       "zahl": 18.0
      },
      "5": {
       "text": "12,00",
       "zahl": 12.0
      }
     }
    },
    {
     "name": "Schleuderball 1 kg",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "25,00",
       "zahl": 25.0
      },
      "2": {
       "text": "22,00",
       "zahl": 22.0
      },
      "3": {
       "text": "19,00",
       "zahl": 19.0
      },
      "4": {
       "text": "15,50",
       "zahl": 15.5
      },
      "5": {
       "text": "11,50",
       "zahl": 11.5
      }
     }
    },
    {
     "name": "800 m",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "03:20",
       "zahl": 200
      },
      "2": {
       "text": "03:43",
       "zahl": 223
      },
      "3": {
       "text": "04:08",
       "zahl": 248
      },
      "4": {
       "text": "04:36",
       "zahl": 276
      },
      "5": {
       "text": "05:07",
       "zahl": 307
      }
     }
    },
    {
     "name": "12-Minuten-Lauf",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "2400",
       "zahl": 2400.0
      },
      "2": {
       "text": "2200",
       "zahl": 2200.0
      },
      "3": {
       "text": "1950",
       "zahl": 1950.0
      },
      "4": {
       "text": "1700",
       "zahl": 1700.0
      },
      "5": {
       "text": "1400",
       "zahl": 1400.0
      }
     }
    }
   ]
  },
  {
   "sportart": "Leichtathletik",
   "geschlecht": "Mädchen",
   "jgst": 10,
   "disziplinen": [
    {
     "name": "Ausdauer (Dauerlauf)",
     "einheit": "min",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "35",
       "zahl": 35.0
      },
      "2": {
       "text": "31",
       "zahl": 31.0
      },
      "3": {
       "text": "27",
       "zahl": 27.0
      },
      "4": {
       "text": "21",
       "zahl": 21.0
      },
      "5": {
       "text": "14",
       "zahl": 14.0
      }
     }
    },
    {
     "name": "100 m",
     "einheit": "s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "14,8",
       "zahl": 14.8
      },
      "2": {
       "text": "15,6",
       "zahl": 15.6
      },
      "3": {
       "text": "16,5",
       "zahl": 16.5
      },
      "4": {
       "text": "17,5",
       "zahl": 17.5
      },
      "5": {
       "text": "18,6",
       "zahl": 18.6
      }
     }
    },
    {
     "name": "Weitsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "3,91",
       "zahl": 3.91
      },
      "2": {
       "text": "3,60",
       "zahl": 3.6
      },
      "3": {
       "text": "3,24",
       "zahl": 3.24
      },
      "4": {
       "text": "2,82",
       "zahl": 2.82
      },
      "5": {
       "text": "2,36",
       "zahl": 2.36
      }
     }
    },
    {
     "name": "Hochsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "1,25",
       "zahl": 1.25
      },
      "2": {
       "text": "1,18",
       "zahl": 1.18
      },
      "3": {
       "text": "1,10",
       "zahl": 1.1
      },
      "4": {
       "text": "1,02",
       "zahl": 1.02
      },
      "5": {
       "text": "0,93",
       "zahl": 0.93
      }
     }
    },
    {
     "name": "Kugelstoß 4 kg",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "7,30",
       "zahl": 7.3
      },
      "2": {
       "text": "6,50",
       "zahl": 6.5
      },
      "3": {
       "text": "5,60",
       "zahl": 5.6
      },
      "4": {
       "text": "4,60",
       "zahl": 4.6
      },
      "5": {
       "text": "3,60",
       "zahl": 3.6
      }
     }
    },
    {
     "name": "Speerwurf 400 g",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "21,00",
       "zahl": 21.0
      },
      "2": {
       "text": "18,60",
       "zahl": 18.6
      },
      "3": {
       "text": "15,90",
       "zahl": 15.9
      },
      "4": {
       "text": "13,10",
       "zahl": 13.1
      },
      "5": {
       "text": "10,00",
       "zahl": 10.0
      }
     }
    },
    {
     "name": "Schleuderball 1 kg",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "27,50",
       "zahl": 27.5
      },
      "2": {
       "text": "25,00",
       "zahl": 25.0
      },
      "3": {
       "text": "21,50",
       "zahl": 21.5
      },
      "4": {
       "text": "18,00",
       "zahl": 18.0
      },
      "5": {
       "text": "13,50",
       "zahl": 13.5
      }
     }
    },
    {
     "name": "800 m",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "03:17",
       "zahl": 197
      },
      "2": {
       "text": "03:39",
       "zahl": 219
      },
      "3": {
       "text": "04:03",
       "zahl": 243
      },
      "4": {
       "text": "04:32",
       "zahl": 272
      },
      "5": {
       "text": "05:04",
       "zahl": 304
      }
     }
    },
    {
     "name": "12-Minuten-Lauf",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "2450",
       "zahl": 2450.0
      },
      "2": {
       "text": "2250",
       "zahl": 2250.0
      },
      "3": {
       "text": "2000",
       "zahl": 2000.0
      },
      "4": {
       "text": "1750",
       "zahl": 1750.0
      },
      "5": {
       "text": "1450",
       "zahl": 1450.0
      }
     }
    }
   ]
  },
  {
   "sportart": "Leichtathletik",
   "geschlecht": "Mädchen",
   "jgst": 11,
   "disziplinen": [
    {
     "name": "Ausdauer (Dauerlauf)",
     "einheit": "min",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "37",
       "zahl": 37.0
      },
      "2": {
       "text": "33",
       "zahl": 33.0
      },
      "3": {
       "text": "29",
       "zahl": 29.0
      },
      "4": {
       "text": "23",
       "zahl": 23.0
      },
      "5": {
       "text": "15",
       "zahl": 15.0
      }
     }
    },
    {
     "name": "100 m",
     "einheit": "s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "14,5",
       "zahl": 14.5
      },
      "2": {
       "text": "15,2",
       "zahl": 15.2
      },
      "3": {
       "text": "16,1",
       "zahl": 16.1
      },
      "4": {
       "text": "17,1",
       "zahl": 17.1
      },
      "5": {
       "text": "18,2",
       "zahl": 18.2
      }
     }
    },
    {
     "name": "Weitsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "4,02",
       "zahl": 4.02
      },
      "2": {
       "text": "3,71",
       "zahl": 3.71
      },
      "3": {
       "text": "3,34",
       "zahl": 3.34
      },
      "4": {
       "text": "2,93",
       "zahl": 2.93
      },
      "5": {
       "text": "2,46",
       "zahl": 2.46
      }
     }
    },
    {
     "name": "Hochsprung",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "1,30",
       "zahl": 1.3
      },
      "2": {
       "text": "1,24",
       "zahl": 1.24
      },
      "3": {
       "text": "1,16",
       "zahl": 1.16
      },
      "4": {
       "text": "1,08",
       "zahl": 1.08
      },
      "5": {
       "text": "0,99",
       "zahl": 0.99
      }
     }
    },
    {
     "name": "Kugelstoß 4 kg",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "7,60",
       "zahl": 7.6
      },
      "2": {
       "text": "6,90",
       "zahl": 6.9
      },
      "3": {
       "text": "6,00",
       "zahl": 6.0
      },
      "4": {
       "text": "5,10",
       "zahl": 5.1
      },
      "5": {
       "text": "4,00",
       "zahl": 4.0
      }
     }
    },
    {
     "name": "Speerwurf 400 g",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "21,70",
       "zahl": 21.7
      },
      "2": {
       "text": "19,40",
       "zahl": 19.4
      },
      "3": {
       "text": "16,80",
       "zahl": 16.8
      },
      "4": {
       "text": "14,20",
       "zahl": 14.2
      },
      "5": {
       "text": "11,30",
       "zahl": 11.3
      }
     }
    },
    {
     "name": "Schleuderball 1 kg",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "30,50",
       "zahl": 30.5
      },
      "2": {
       "text": "27,50",
       "zahl": 27.5
      },
      "3": {
       "text": "24,50",
       "zahl": 24.5
      },
      "4": {
       "text": "20,00",
       "zahl": 20.0
      },
      "5": {
       "text": "15,50",
       "zahl": 15.5
      }
     }
    },
    {
     "name": "800 m",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "03:15",
       "zahl": 195
      },
      "2": {
       "text": "03:36",
       "zahl": 216
      },
      "3": {
       "text": "04:00",
       "zahl": 240
      },
      "4": {
       "text": "04:28",
       "zahl": 268
      },
      "5": {
       "text": "05:00",
       "zahl": 300
      }
     }
    },
    {
     "name": "12-Minuten-Lauf",
     "einheit": "m",
     "richtung": "mehr",
     "noten": {
      "1": {
       "text": "2500",
       "zahl": 2500.0
      },
      "2": {
       "text": "2300",
       "zahl": 2300.0
      },
      "3": {
       "text": "2050",
       "zahl": 2050.0
      },
      "4": {
       "text": "1800",
       "zahl": 1800.0
      },
      "5": {
       "text": "1500",
       "zahl": 1500.0
      }
     }
    }
   ]
  },
  {
   "sportart": "Schwimmen",
   "geschlecht": "Jungen",
   "jgst": 5,
   "disziplinen": [
    {
     "name": "25 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:25,0",
       "zahl": 25.0
      },
      "2": {
       "text": "00:27,8",
       "zahl": 27.8
      },
      "3": {
       "text": "00:31,3",
       "zahl": 31.3
      },
      "4": {
       "text": "00:35,7",
       "zahl": 35.7
      },
      "5": {
       "text": "00:41,0",
       "zahl": 41.0
      }
     }
    },
    {
     "name": "25 m Freistil",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:22,0",
       "zahl": 22.0
      },
      "2": {
       "text": "00:24,8",
       "zahl": 24.8
      },
      "3": {
       "text": "00:28,3",
       "zahl": 28.3
      },
      "4": {
       "text": "00:32,7",
       "zahl": 32.7
      },
      "5": {
       "text": "00:38,0",
       "zahl": 38.0
      }
     }
    }
   ]
  },
  {
   "sportart": "Schwimmen",
   "geschlecht": "Jungen",
   "jgst": 6,
   "disziplinen": [
    {
     "name": "50 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:54,9",
       "zahl": 54.9
      },
      "2": {
       "text": "01:02,5",
       "zahl": 62.5
      },
      "3": {
       "text": "01:10,9",
       "zahl": 70.9
      },
      "4": {
       "text": "01:19,9",
       "zahl": 79.9
      },
      "5": {
       "text": "01:29,8",
       "zahl": 89.8
      }
     }
    },
    {
     "name": "50 m Freistil",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:51,0",
       "zahl": 51.0
      },
      "2": {
       "text": "00:58,4",
       "zahl": 58.4
      },
      "3": {
       "text": "01:06,5",
       "zahl": 66.5
      },
      "4": {
       "text": "01:15,4",
       "zahl": 75.4
      },
      "5": {
       "text": "01:25,0",
       "zahl": 85.0
      }
     }
    },
    {
     "name": "50 m Rücken/Seite",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:53,0",
       "zahl": 53.0
      },
      "2": {
       "text": "01:00,6",
       "zahl": 60.6
      },
      "3": {
       "text": "01:09,0",
       "zahl": 69.0
      },
      "4": {
       "text": "01:18,1",
       "zahl": 78.1
      },
      "5": {
       "text": "01:28,0",
       "zahl": 88.0
      }
     }
    }
   ]
  },
  {
   "sportart": "Schwimmen",
   "geschlecht": "Jungen",
   "jgst": 7,
   "disziplinen": [
    {
     "name": "50 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:53,2",
       "zahl": 53.2
      },
      "2": {
       "text": "01:00,3",
       "zahl": 60.3
      },
      "3": {
       "text": "01:08,3",
       "zahl": 68.3
      },
      "4": {
       "text": "01:17,0",
       "zahl": 77.0
      },
      "5": {
       "text": "01:26,8",
       "zahl": 86.8
      }
     }
    },
    {
     "name": "50 m Freistil",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:48,5",
       "zahl": 48.5
      },
      "2": {
       "text": "00:55,3",
       "zahl": 55.3
      },
      "3": {
       "text": "01:02,8",
       "zahl": 62.8
      },
      "4": {
       "text": "01:11,3",
       "zahl": 71.3
      },
      "5": {
       "text": "01:20,6",
       "zahl": 80.6
      }
     }
    },
    {
     "name": "50 m Rücken/Seite",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:51,1",
       "zahl": 51.1
      },
      "2": {
       "text": "00:58,2",
       "zahl": 58.2
      },
      "3": {
       "text": "01:06,1",
       "zahl": 66.1
      },
      "4": {
       "text": "01:14,8",
       "zahl": 74.8
      },
      "5": {
       "text": "01:24,5",
       "zahl": 84.5
      }
     }
    }
   ]
  },
  {
   "sportart": "Schwimmen",
   "geschlecht": "Jungen",
   "jgst": 8,
   "disziplinen": [
    {
     "name": "50 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:51,5",
       "zahl": 51.5
      },
      "2": {
       "text": "00:58,1",
       "zahl": 58.1
      },
      "3": {
       "text": "01:05,6",
       "zahl": 65.6
      },
      "4": {
       "text": "01:14,1",
       "zahl": 74.1
      },
      "5": {
       "text": "01:23,8",
       "zahl": 83.8
      }
     }
    },
    {
     "name": "50 m Freistil",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:46,0",
       "zahl": 46.0
      },
      "2": {
       "text": "00:52,1",
       "zahl": 52.1
      },
      "3": {
       "text": "00:59,1",
       "zahl": 59.1
      },
      "4": {
       "text": "01:07,1",
       "zahl": 67.1
      },
      "5": {
       "text": "01:16,2",
       "zahl": 76.2
      }
     }
    },
    {
     "name": "50 m Rücken/Seite",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:49,3",
       "zahl": 49.3
      },
      "2": {
       "text": "00:55,8",
       "zahl": 55.8
      },
      "3": {
       "text": "01:03,3",
       "zahl": 63.3
      },
      "4": {
       "text": "01:11,6",
       "zahl": 71.6
      },
      "5": {
       "text": "01:21,0",
       "zahl": 81.0
      }
     }
    },
    {
     "name": "100 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "02:00,7",
       "zahl": 120.7
      },
      "2": {
       "text": "02:15,9",
       "zahl": 135.9
      },
      "3": {
       "text": "02:33,2",
       "zahl": 153.2
      },
      "4": {
       "text": "02:52,5",
       "zahl": 172.5
      },
      "5": {
       "text": "03:14,5",
       "zahl": 194.5
      }
     }
    }
   ]
  },
  {
   "sportart": "Schwimmen",
   "geschlecht": "Jungen",
   "jgst": 9,
   "disziplinen": [
    {
     "name": "50 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:49,8",
       "zahl": 49.8
      },
      "2": {
       "text": "00:55,9",
       "zahl": 55.9
      },
      "3": {
       "text": "01:03,0",
       "zahl": 63.0
      },
      "4": {
       "text": "01:11,1",
       "zahl": 71.1
      },
      "5": {
       "text": "01:20,8",
       "zahl": 80.8
      }
     }
    },
    {
     "name": "50 m Freistil",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:43,5",
       "zahl": 43.5
      },
      "2": {
       "text": "00:49,0",
       "zahl": 49.0
      },
      "3": {
       "text": "00:55,5",
       "zahl": 55.5
      },
      "4": {
       "text": "01:03,0",
       "zahl": 63.0
      },
      "5": {
       "text": "01:11,9",
       "zahl": 71.9
      }
     }
    },
    {
     "name": "50 m Rücken/Seite",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:47,4",
       "zahl": 47.4
      },
      "2": {
       "text": "00:53,4",
       "zahl": 53.4
      },
      "3": {
       "text": "01:00,4",
       "zahl": 60.4
      },
      "4": {
       "text": "01:08,3",
       "zahl": 68.3
      },
      "5": {
       "text": "01:17,6",
       "zahl": 77.6
      }
     }
    },
    {
     "name": "100 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "01:55,9",
       "zahl": 115.9
      },
      "2": {
       "text": "02:09,9",
       "zahl": 129.9
      },
      "3": {
       "text": "02:25,8",
       "zahl": 145.8
      },
      "4": {
       "text": "02:43,4",
       "zahl": 163.4
      },
      "5": {
       "text": "03:03,5",
       "zahl": 183.5
      }
     }
    },
    {
     "name": "100 m Freistil",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "01:41,4",
       "zahl": 101.4
      },
      "2": {
       "text": "01:55,7",
       "zahl": 115.7
      },
      "3": {
       "text": "02:11,5",
       "zahl": 131.5
      },
      "4": {
       "text": "02:29,4",
       "zahl": 149.4
      },
      "5": {
       "text": "02:49,6",
       "zahl": 169.6
      }
     }
    }
   ]
  },
  {
   "sportart": "Schwimmen",
   "geschlecht": "Jungen",
   "jgst": 10,
   "disziplinen": [
    {
     "name": "50 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:48,1",
       "zahl": 48.1
      },
      "2": {
       "text": "00:53,7",
       "zahl": 53.7
      },
      "3": {
       "text": "01:00,3",
       "zahl": 60.3
      },
      "4": {
       "text": "01:08,2",
       "zahl": 68.2
      },
      "5": {
       "text": "01:17,7",
       "zahl": 77.7
      }
     }
    },
    {
     "name": "50 m Freistil",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:40,9",
       "zahl": 40.9
      },
      "2": {
       "text": "00:45,9",
       "zahl": 45.9
      },
      "3": {
       "text": "00:51,8",
       "zahl": 51.8
      },
      "4": {
       "text": "00:58,9",
       "zahl": 58.9
      },
      "5": {
       "text": "01:07,5",
       "zahl": 67.5
      }
     }
    },
    {
     "name": "50 m Rücken/Seite",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:45,5",
       "zahl": 45.5
      },
      "2": {
       "text": "00:51,1",
       "zahl": 51.1
      },
      "3": {
       "text": "00:57,5",
       "zahl": 57.5
      },
      "4": {
       "text": "01:05,1",
       "zahl": 65.1
      },
      "5": {
       "text": "01:14,1",
       "zahl": 74.1
      }
     }
    },
    {
     "name": "100 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "01:51,1",
       "zahl": 111.1
      },
      "2": {
       "text": "02:03,9",
       "zahl": 123.9
      },
      "3": {
       "text": "02:18,3",
       "zahl": 138.3
      },
      "4": {
       "text": "02:34,4",
       "zahl": 154.4
      },
      "5": {
       "text": "02:52,5",
       "zahl": 172.5
      }
     }
    },
    {
     "name": "100 m Freistil",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "01:35,8",
       "zahl": 95.8
      },
      "2": {
       "text": "01:48,6",
       "zahl": 108.6
      },
      "3": {
       "text": "02:03,0",
       "zahl": 123.0
      },
      "4": {
       "text": "02:19,4",
       "zahl": 139.4
      },
      "5": {
       "text": "02:38,1",
       "zahl": 158.1
      }
     }
    },
    {
     "name": "100 m Rücken/Seite",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "01:49,2",
       "zahl": 109.2
      },
      "2": {
       "text": "02:02,0",
       "zahl": 122.0
      },
      "3": {
       "text": "02:15,8",
       "zahl": 135.8
      },
      "4": {
       "text": "02:30,8",
       "zahl": 150.8
      },
      "5": {
       "text": "02:47,4",
       "zahl": 167.4
      }
     }
    },
    {
     "name": "400 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "09:51,6",
       "zahl": 591.6
      },
      "2": {
       "text": "10:42,9",
       "zahl": 642.9
      },
      "3": {
       "text": "11:46,4",
       "zahl": 706.4
      },
      "4": {
       "text": "13:03,1",
       "zahl": 783.1
      },
      "5": {
       "text": "14:36,8",
       "zahl": 876.8
      }
     }
    },
    {
     "name": "400 m Freistil",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "09:11,1",
       "zahl": 551.1
      },
      "2": {
       "text": "10:27,5",
       "zahl": 627.5
      },
      "3": {
       "text": "11:47,8",
       "zahl": 707.8
      },
      "4": {
       "text": "13:14,9",
       "zahl": 794.9
      },
      "5": {
       "text": "14:47,0",
       "zahl": 887.0
      }
     }
    }
   ]
  },
  {
   "sportart": "Schwimmen",
   "geschlecht": "Jungen",
   "jgst": 11,
   "disziplinen": [
    {
     "name": "50 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:46,4",
       "zahl": 46.4
      },
      "2": {
       "text": "00:51,5",
       "zahl": 51.5
      },
      "3": {
       "text": "00:57,6",
       "zahl": 57.6
      },
      "4": {
       "text": "01:05,3",
       "zahl": 65.3
      },
      "5": {
       "text": "01:14,7",
       "zahl": 74.7
      }
     }
    },
    {
     "name": "50 m Freistil",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:38,4",
       "zahl": 38.4
      },
      "2": {
       "text": "00:42,7",
       "zahl": 42.7
      },
      "3": {
       "text": "00:48,1",
       "zahl": 48.1
      },
      "4": {
       "text": "00:54,7",
       "zahl": 54.7
      },
      "5": {
       "text": "01:03,1",
       "zahl": 63.1
      }
     }
    },
    {
     "name": "50 m Rücken/Seite",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:43,7",
       "zahl": 43.7
      },
      "2": {
       "text": "00:48,7",
       "zahl": 48.7
      },
      "3": {
       "text": "00:54,7",
       "zahl": 54.7
      },
      "4": {
       "text": "01:01,8",
       "zahl": 61.8
      },
      "5": {
       "text": "01:10,6",
       "zahl": 70.6
      }
     }
    },
    {
     "name": "100 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "01:46,2",
       "zahl": 106.2
      },
      "2": {
       "text": "01:57,9",
       "zahl": 117.9
      },
      "3": {
       "text": "02:10,9",
       "zahl": 130.9
      },
      "4": {
       "text": "02:25,3",
       "zahl": 145.3
      },
      "5": {
       "text": "02:41,5",
       "zahl": 161.5
      }
     }
    },
    {
     "name": "100 m Freistil",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "01:30,1",
       "zahl": 90.1
      },
      "2": {
       "text": "01:41,4",
       "zahl": 101.4
      },
      "3": {
       "text": "01:54,4",
       "zahl": 114.4
      },
      "4": {
       "text": "02:09,3",
       "zahl": 129.3
      },
      "5": {
       "text": "02:26,5",
       "zahl": 146.5
      }
     }
    },
    {
     "name": "100 m Rücken/Seite",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "01:42,9",
       "zahl": 102.9
      },
      "2": {
       "text": "01:54,9",
       "zahl": 114.9
      },
      "3": {
       "text": "02:08,3",
       "zahl": 128.3
      },
      "4": {
       "text": "02:23,2",
       "zahl": 143.2
      },
      "5": {
       "text": "02:40,0",
       "zahl": 160.0
      }
     }
    },
    {
     "name": "400 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "09:33,3",
       "zahl": 573.3
      },
      "2": {
       "text": "10:21,5",
       "zahl": 621.5
      },
      "3": {
       "text": "11:16,2",
       "zahl": 676.2
      },
      "4": {
       "text": "12:31,0",
       "zahl": 751.0
      },
      "5": {
       "text": "14:01,9",
       "zahl": 841.9
      }
     }
    },
    {
     "name": "400 m Freistil",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "08:44,6",
       "zahl": 524.6
      },
      "2": {
       "text": "09:57,3",
       "zahl": 597.3
      },
      "3": {
       "text": "11:12,9",
       "zahl": 672.9
      },
      "4": {
       "text": "12:35,9",
       "zahl": 755.9
      },
      "5": {
       "text": "14:06,0",
       "zahl": 846.0
      }
     }
    }
   ]
  },
  {
   "sportart": "Schwimmen",
   "geschlecht": "Mädchen",
   "jgst": 5,
   "disziplinen": [
    {
     "name": "25 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:26,0",
       "zahl": 26.0
      },
      "2": {
       "text": "00:28,8",
       "zahl": 28.8
      },
      "3": {
       "text": "00:32,3",
       "zahl": 32.3
      },
      "4": {
       "text": "00:36,7",
       "zahl": 36.7
      },
      "5": {
       "text": "00:42,0",
       "zahl": 42.0
      }
     }
    },
    {
     "name": "25 m Freistil",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:24,0",
       "zahl": 24.0
      },
      "2": {
       "text": "00:26,8",
       "zahl": 26.8
      },
      "3": {
       "text": "00:30,3",
       "zahl": 30.3
      },
      "4": {
       "text": "00:34,7",
       "zahl": 34.7
      },
      "5": {
       "text": "00:40,0",
       "zahl": 40.0
      }
     }
    }
   ]
  },
  {
   "sportart": "Schwimmen",
   "geschlecht": "Mädchen",
   "jgst": 6,
   "disziplinen": [
    {
     "name": "50 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:57,6",
       "zahl": 57.6
      },
      "2": {
       "text": "01:04,4",
       "zahl": 64.4
      },
      "3": {
       "text": "01:12,5",
       "zahl": 72.5
      },
      "4": {
       "text": "01:21,9",
       "zahl": 81.9
      },
      "5": {
       "text": "01:33,0",
       "zahl": 93.0
      }
     }
    },
    {
     "name": "50 m Freistil",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:54,6",
       "zahl": 54.6
      },
      "2": {
       "text": "01:02,4",
       "zahl": 62.4
      },
      "3": {
       "text": "01:10,8",
       "zahl": 70.8
      },
      "4": {
       "text": "01:20,1",
       "zahl": 80.1
      },
      "5": {
       "text": "01:30,2",
       "zahl": 90.2
      }
     }
    },
    {
     "name": "50 m Rücken/Seite",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:58,0",
       "zahl": 58.0
      },
      "2": {
       "text": "01:05,7",
       "zahl": 65.7
      },
      "3": {
       "text": "01:14,1",
       "zahl": 74.1
      },
      "4": {
       "text": "01:23,1",
       "zahl": 83.1
      },
      "5": {
       "text": "01:33,0",
       "zahl": 93.0
      }
     }
    }
   ]
  },
  {
   "sportart": "Schwimmen",
   "geschlecht": "Mädchen",
   "jgst": 7,
   "disziplinen": [
    {
     "name": "50 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:56,3",
       "zahl": 56.3
      },
      "2": {
       "text": "01:02,7",
       "zahl": 62.7
      },
      "3": {
       "text": "01:10,4",
       "zahl": 70.4
      },
      "4": {
       "text": "01:19,6",
       "zahl": 79.6
      },
      "5": {
       "text": "01:30,4",
       "zahl": 90.4
      }
     }
    },
    {
     "name": "50 m Freistil",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:52,1",
       "zahl": 52.1
      },
      "2": {
       "text": "00:59,3",
       "zahl": 59.3
      },
      "3": {
       "text": "01:07,1",
       "zahl": 67.1
      },
      "4": {
       "text": "01:15,9",
       "zahl": 75.9
      },
      "5": {
       "text": "01:25,7",
       "zahl": 85.7
      }
     }
    },
    {
     "name": "50 m Rücken/Seite",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:56,2",
       "zahl": 56.2
      },
      "2": {
       "text": "01:03,4",
       "zahl": 63.4
      },
      "3": {
       "text": "01:11,4",
       "zahl": 71.4
      },
      "4": {
       "text": "01:20,1",
       "zahl": 80.1
      },
      "5": {
       "text": "01:29,9",
       "zahl": 89.9
      }
     }
    }
   ]
  },
  {
   "sportart": "Schwimmen",
   "geschlecht": "Mädchen",
   "jgst": 8,
   "disziplinen": [
    {
     "name": "50 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:54,9",
       "zahl": 54.9
      },
      "2": {
       "text": "01:01,0",
       "zahl": 61.0
      },
      "3": {
       "text": "01:08,4",
       "zahl": 68.4
      },
      "4": {
       "text": "01:17,2",
       "zahl": 77.2
      },
      "5": {
       "text": "01:27,8",
       "zahl": 87.8
      }
     }
    },
    {
     "name": "50 m Freistil",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:49,7",
       "zahl": 49.7
      },
      "2": {
       "text": "00:56,2",
       "zahl": 56.2
      },
      "3": {
       "text": "01:03,4",
       "zahl": 63.4
      },
      "4": {
       "text": "01:11,7",
       "zahl": 71.7
      },
      "5": {
       "text": "01:21,1",
       "zahl": 81.1
      }
     }
    },
    {
     "name": "50 m Rücken/Seite",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:54,4",
       "zahl": 54.4
      },
      "2": {
       "text": "01:01,2",
       "zahl": 61.2
      },
      "3": {
       "text": "01:08,7",
       "zahl": 68.7
      },
      "4": {
       "text": "01:17,2",
       "zahl": 77.2
      },
      "5": {
       "text": "01:26,7",
       "zahl": 86.7
      }
     }
    },
    {
     "name": "100 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "02:10,1",
       "zahl": 130.1
      },
      "2": {
       "text": "02:25,1",
       "zahl": 145.1
      },
      "3": {
       "text": "02:41,6",
       "zahl": 161.6
      },
      "4": {
       "text": "02:59,6",
       "zahl": 179.6
      },
      "5": {
       "text": "03:19,5",
       "zahl": 199.5
      }
     }
    }
   ]
  },
  {
   "sportart": "Schwimmen",
   "geschlecht": "Mädchen",
   "jgst": 9,
   "disziplinen": [
    {
     "name": "50 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:53,6",
       "zahl": 53.6
      },
      "2": {
       "text": "00:59,3",
       "zahl": 59.3
      },
      "3": {
       "text": "01:06,4",
       "zahl": 66.4
      },
      "4": {
       "text": "01:14,8",
       "zahl": 74.8
      },
      "5": {
       "text": "01:25,3",
       "zahl": 85.3
      }
     }
    },
    {
     "name": "50 m Freistil",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:47,2",
       "zahl": 47.2
      },
      "2": {
       "text": "00:53,1",
       "zahl": 53.1
      },
      "3": {
       "text": "00:59,7",
       "zahl": 59.7
      },
      "4": {
       "text": "01:07,5",
       "zahl": 67.5
      },
      "5": {
       "text": "01:16,5",
       "zahl": 76.5
      }
     }
    },
    {
     "name": "50 m Rücken/Seite",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:52,7",
       "zahl": 52.7
      },
      "2": {
       "text": "00:58,9",
       "zahl": 58.9
      },
      "3": {
       "text": "01:06,0",
       "zahl": 66.0
      },
      "4": {
       "text": "01:14,2",
       "zahl": 74.2
      },
      "5": {
       "text": "01:23,6",
       "zahl": 83.6
      }
     }
    },
    {
     "name": "100 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "02:05,9",
       "zahl": 125.9
      },
      "2": {
       "text": "02:19,8",
       "zahl": 139.8
      },
      "3": {
       "text": "02:35,4",
       "zahl": 155.4
      },
      "4": {
       "text": "02:52,7",
       "zahl": 172.7
      },
      "5": {
       "text": "03:12,1",
       "zahl": 192.1
      }
     }
    },
    {
     "name": "100 m Freistil",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "01:52,7",
       "zahl": 112.7
      },
      "2": {
       "text": "02:08,2",
       "zahl": 128.2
      },
      "3": {
       "text": "02:25,3",
       "zahl": 145.3
      },
      "4": {
       "text": "02:44,6",
       "zahl": 164.6
      },
      "5": {
       "text": "03:06,6",
       "zahl": 186.6
      }
     }
    }
   ]
  },
  {
   "sportart": "Schwimmen",
   "geschlecht": "Mädchen",
   "jgst": 10,
   "disziplinen": [
    {
     "name": "50 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:52,3",
       "zahl": 52.3
      },
      "2": {
       "text": "00:57,6",
       "zahl": 57.6
      },
      "3": {
       "text": "01:04,3",
       "zahl": 64.3
      },
      "4": {
       "text": "01:12,5",
       "zahl": 72.5
      },
      "5": {
       "text": "01:22,7",
       "zahl": 82.7
      }
     }
    },
    {
     "name": "50 m Freistil",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:44,7",
       "zahl": 44.7
      },
      "2": {
       "text": "00:49,9",
       "zahl": 49.9
      },
      "3": {
       "text": "00:56,0",
       "zahl": 56.0
      },
      "4": {
       "text": "01:03,3",
       "zahl": 63.3
      },
      "5": {
       "text": "01:12,0",
       "zahl": 72.0
      }
     }
    },
    {
     "name": "50 m Rücken/Seite",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:50,9",
       "zahl": 50.9
      },
      "2": {
       "text": "00:56,6",
       "zahl": 56.6
      },
      "3": {
       "text": "01:03,4",
       "zahl": 63.4
      },
      "4": {
       "text": "01:11,2",
       "zahl": 71.2
      },
      "5": {
       "text": "01:20,5",
       "zahl": 80.5
      }
     }
    },
    {
     "name": "100 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "02:01,7",
       "zahl": 121.7
      },
      "2": {
       "text": "02:14,6",
       "zahl": 134.6
      },
      "3": {
       "text": "02:29,3",
       "zahl": 149.3
      },
      "4": {
       "text": "02:45,8",
       "zahl": 165.8
      },
      "5": {
       "text": "03:04,7",
       "zahl": 184.7
      }
     }
    },
    {
     "name": "100 m Freistil",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "01:47,3",
       "zahl": 107.3
      },
      "2": {
       "text": "02:01,2",
       "zahl": 121.2
      },
      "3": {
       "text": "02:16,7",
       "zahl": 136.7
      },
      "4": {
       "text": "02:34,2",
       "zahl": 154.2
      },
      "5": {
       "text": "02:54,1",
       "zahl": 174.1
      }
     }
    },
    {
     "name": "100 m Rücken/Seite",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "01:58,9",
       "zahl": 118.9
      },
      "2": {
       "text": "02:12,1",
       "zahl": 132.1
      },
      "3": {
       "text": "02:26,8",
       "zahl": 146.8
      },
      "4": {
       "text": "02:43,1",
       "zahl": 163.1
      },
      "5": {
       "text": "03:01,5",
       "zahl": 181.5
      }
     }
    },
    {
     "name": "400 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "10:36,5",
       "zahl": 636.5
      },
      "2": {
       "text": "11:45,4",
       "zahl": 705.4
      },
      "3": {
       "text": "13:03,4",
       "zahl": 783.4
      },
      "4": {
       "text": "14:30,5",
       "zahl": 870.5
      },
      "5": {
       "text": "16:09,7",
       "zahl": 969.7
      }
     }
    },
    {
     "name": "400 m Freistil",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "10:02,4",
       "zahl": 602.4
      },
      "2": {
       "text": "11:30,2",
       "zahl": 690.2
      },
      "3": {
       "text": "13:01,8",
       "zahl": 781.8
      },
      "4": {
       "text": "14:41,1",
       "zahl": 881.1
      },
      "5": {
       "text": "16:25,8",
       "zahl": 985.8
      }
     }
    }
   ]
  },
  {
   "sportart": "Schwimmen",
   "geschlecht": "Mädchen",
   "jgst": 11,
   "disziplinen": [
    {
     "name": "50 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:50,9",
       "zahl": 50.9
      },
      "2": {
       "text": "00:55,9",
       "zahl": 55.9
      },
      "3": {
       "text": "01:02,3",
       "zahl": 62.3
      },
      "4": {
       "text": "01:10,1",
       "zahl": 70.1
      },
      "5": {
       "text": "01:20,1",
       "zahl": 80.1
      }
     }
    },
    {
     "name": "50 m Freistil",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:42,3",
       "zahl": 42.3
      },
      "2": {
       "text": "00:46,8",
       "zahl": 46.8
      },
      "3": {
       "text": "00:52,3",
       "zahl": 52.3
      },
      "4": {
       "text": "00:59,1",
       "zahl": 59.1
      },
      "5": {
       "text": "01:07,5",
       "zahl": 67.5
      }
     }
    },
    {
     "name": "50 m Rücken/Seite",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "00:49,1",
       "zahl": 49.1
      },
      "2": {
       "text": "00:54,4",
       "zahl": 54.4
      },
      "3": {
       "text": "01:00,7",
       "zahl": 60.7
      },
      "4": {
       "text": "01:08,3",
       "zahl": 68.3
      },
      "5": {
       "text": "01:17,3",
       "zahl": 77.3
      }
     }
    },
    {
     "name": "100 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "01:57,4",
       "zahl": 117.4
      },
      "2": {
       "text": "02:09,3",
       "zahl": 129.3
      },
      "3": {
       "text": "02:23,1",
       "zahl": 143.1
      },
      "4": {
       "text": "02:39,0",
       "zahl": 159.0
      },
      "5": {
       "text": "02:57,4",
       "zahl": 177.4
      }
     }
    },
    {
     "name": "100 m Freistil",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "01:42,0",
       "zahl": 102.0
      },
      "2": {
       "text": "01:54,3",
       "zahl": 114.3
      },
      "3": {
       "text": "02:08,0",
       "zahl": 128.0
      },
      "4": {
       "text": "02:23,7",
       "zahl": 143.7
      },
      "5": {
       "text": "02:41,7",
       "zahl": 161.7
      }
     }
    },
    {
     "name": "100 m Rücken/Seite",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "01:53,9",
       "zahl": 113.9
      },
      "2": {
       "text": "02:06,3",
       "zahl": 126.3
      },
      "3": {
       "text": "02:20,3",
       "zahl": 140.3
      },
      "4": {
       "text": "02:36,3",
       "zahl": 156.3
      },
      "5": {
       "text": "02:54,5",
       "zahl": 174.5
      }
     }
    },
    {
     "name": "400 m Brust",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "10:20,8",
       "zahl": 620.8
      },
      "2": {
       "text": "11:25,7",
       "zahl": 685.7
      },
      "3": {
       "text": "12:36,2",
       "zahl": 756.2
      },
      "4": {
       "text": "14:01,8",
       "zahl": 841.8
      },
      "5": {
       "text": "15:43,3",
       "zahl": 943.3
      }
     }
    },
    {
     "name": "400 m Freistil",
     "einheit": "min:s",
     "richtung": "weniger",
     "noten": {
      "1": {
       "text": "09:40,2",
       "zahl": 580.2
      },
      "2": {
       "text": "11:04,6",
       "zahl": 664.6
      },
      "3": {
       "text": "12:30,9",
       "zahl": 750.9
      },
      "4": {
       "text": "14:06,0",
       "zahl": 846.0
      },
      "5": {
       "text": "15:50,3",
       "zahl": 950.3
      }
     }
    }
   ]
  }
 ]
};
