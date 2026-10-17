# ioBroker.envertech-local

Reads Envertech microinverters **locally over TCP**, without the cloud.

Tested with an EVT800 at port `14889` (MID `30819660`, firmware `V3.01.20`). That unit reports four channels (`30819660`–`30819663`).

## Requirements

1. The inverter is joined to the LAN (STA mode).
2. Under **Other Setting**, **Protocol** is **TCP Server** and the port is **14889**.
3. During the day, with sun: without PV input the unit often stays in standby.
4. Only one TCP client can be connected. Do not run the EnverView app at the same time as this adapter.

The web page on the inverter IP shows Wi-Fi and system settings only. It does not show live power.

## Configuration

| Field | Example | Meaning |
| --- | --- | --- |
| IP address | `192.168.1.241` | LAN address of the Wi-Fi module |
| TCP port | `14889` | Port from Other Setting |
| Serial / MID | `30819660` | MID shown on the system page |
| Poll interval | `60` | Poll period on the open TCP connection, in seconds |
| Reconnect | `30` | Delay after the connection drops, in seconds |

Install the adapter from the ioBroker admin adapter list, or from a local checkout with the usual ioBroker install flow. Create an instance and fill in the fields above.

## States

- `envertech-local.0.info.connection`
- `envertech-local.0.info.lastUpdate`
- `envertech-local.0.inverter.power` (W)
- `envertech-local.0.inverter.energy` (kWh, lifetime)
- `envertech-local.0.inverter.energyDaily` (kWh, since midnight)
- `envertech-local.0.module1.*` … `module4.*`  
  `voltageDc`, `power`, `energy`, `temperature`, `voltageAc`, `frequency`, `current`

## Direct readout

From a checkout of this repository you can query the inverter without starting ioBroker:

```bash
npm ci
npm test
npm run build
npm run read -- --host 192.168.1.241 --port 14889 --serial 30819660 --timeout 90
```

## Notes

- At night `info.connection` usually stays `false`. Power is set to `0`. The energy counters keep their last values.
- The local protocol is the same one used by OpenEVT and the Home Assistant EVT800 integrations.

## Changelog

### 0.1.2 (2026-10-17)

* (Andreas) Require Node.js 22, add repository CI, and refresh the admin translations.
* (Andreas) Track poll and reconnect timers through the adapter so compact mode can stop them.

### 0.1.1

* (Andreas) Fix reconnect after a timeout and set the inverter id before the first live frame.

### 0.1.0

* (Andreas) Initial release: local TCP readout without the cloud.

## License

MIT License

Copyright (c) 2026 Andreas

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

The same text is stored in the [LICENSE](LICENSE) file.
