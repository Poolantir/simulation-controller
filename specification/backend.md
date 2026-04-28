# Backend
Flask backend. The backend serves 3 purposes:
1. connect to nodes via BLE (see [.env](../.env) for bluetooth GATT attributes)
2. connect to Firebase (see [.env](../.env) for credentials)
3. Read simulation settings set within the frontend
4. Real-Time FIFO scheduler (see [scheduler.md](./scheduler.md))

## Firebase service account

The backend uses a **Google Cloud service account** to authenticate Firestore REST calls (POST sensor_events, PATCH stalls, runQuery). The browser API key (`VITE_FIREBASE_API_KEY`) is insufficient for server-side writes.

Set the env var `GOOGLE_APPLICATION_CREDENTIALS` to the absolute path of the service account JSON key:

```
GOOGLE_APPLICATION_CREDENTIALS=/path/to/poolantir-service-account.json
```

The service account needs at minimum the **Cloud Datastore User** IAM role on the project.