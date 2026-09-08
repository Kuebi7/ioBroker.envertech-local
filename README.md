# ioBroker.envertech-local

Liest Envertech-Mikrowechselrichter **lokal über TCP**, ohne Cloud.

Getestet gegen `192.168.1.241:14889` (MID `30819660`, Firmware `V3.01.20`). Das Gerät liefert vier Kanäle (`30819660`–`30819663`).

## Voraussetzungen

1. Wechselrichter hängt im LAN (STA-Modus).
2. Unter **Other Setting** steht **Protocol = TCP Server**, Port **14889**.
3. Tagsüber / bei Sonne: ohne PV-Eingang geht das Gerät oft in den Standby.
4. Nur eine TCP-Verbindung: EnverView-App und dieser Adapter nicht gleichzeitig.

Die Webseite unter der IP zeigt nur WLAN/System, keine Live-Leistung.

## Installation

Im ioBroker-Hauptverzeichnis:

```bash
npm install /pfad/zu/envertech_local
iobroker add envertech-local
```

Oder den Ordner nach `opt/iobroker/node_modules/iobroker.envertech-local` kopieren, `npm install` und `npm run build` dort ausführen, danach Instanz anlegen.

## Konfiguration

| Feld | Beispiel | Bedeutung |
| --- | --- | --- |
| IP-Adresse | `192.168.1.241` | LAN-IP des WLAN-Moduls |
| TCP-Port | `14889` | Port aus Other Setting |
| Seriennummer / MID | `30819660` | MID auf der System-Seite |
| Abfrageintervall | `60` | Poll auf der offenen TCP-Verbindung |
| Reconnect | `30` | Wartezeit nach Verbindungsabbruch |

## States

- `envertech-local.0.info.connection`
- `envertech-local.0.info.lastUpdate`
- `envertech-local.0.inverter.power` (W)
- `envertech-local.0.inverter.energy` (kWh, Lebensdauer)
- `envertech-local.0.inverter.energyDaily` (kWh, ab Mitternacht)
- `envertech-local.0.module1.*` … `module4.*`  
  `voltageDc`, `power`, `energy`, `temperature`, `voltageAc`, `frequency`, `current`

## Direkt testen (ohne ioBroker)

```bash
npm install
npm test
npm run build
npm run read -- --host 192.168.1.241 --port 14889 --serial 30819660 --timeout 90
```

## Hinweise

- Nachts bleibt `info.connection` meist `false`, Leistung wird auf `0` gesetzt, die Energiezähler bleiben stehen.
- Das lokale Protokoll ist dasselbe, das OpenEVT und die Home-Assistant-EVT800-Integrationen nutzen.
