# Backend
Flask backend. The backend serves 3 purposes:
1. connect to nodes via BLE (see [.env](../.env) for bluetooh GATT attributes)
2. connect to Influx DB (see [.env](../.env) for api key)
3. Read simulation settings set within the frontend
4. Real-Time FIFO scheduler (see [scheduler.md](./scheduler.md))