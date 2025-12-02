# TitanNVR

Sistema de videovigilancia empresarial moderno con IA para gestionar más de 80 cámaras IP de forma eficiente.

## Stack Tecnológico

- **Motor de Video:** Go2RTC (WebRTC/MSE con latencia cero)
- **Detección IA:** Frigate NVR (detección de objetos en tiempo real)
- **Mensajería:** Eclipse Mosquitto (MQTT broker)
- **Backend:** Python 3.11 + FastAPI + SQLAlchemy (Async)
- **Frontend:** React + Vite + TypeScript + TailwindCSS + Shadcn/ui
- **Base de Datos:** SQLite (desarrollo) / PostgreSQL (producción)
- **Orquestación:** Docker Compose

## Estructura del Proyecto

```
/backend    - API REST con FastAPI
/frontend   - Aplicación React
/config     - Configuraciones (go2rtc.yaml, frigate.yml, mosquitto/)
/storage    - Grabaciones, clips, base de datos
```

## Inicio Rápido

```bash
# Levantar todos los servicios
docker-compose up -d

# Ver logs
docker-compose logs -f

# Solo servicios core (sin IA)
docker-compose up -d go2rtc backend frontend
```

## Puertos

| Servicio | Puerto | Descripción |
|----------|--------|-------------|
| Frontend | 5173   | Interfaz web |
| Backend  | 8000   | API REST (/docs para Swagger) |
| Go2RTC   | 1984   | Streaming WebRTC/MSE |
| Go2RTC   | 8554   | RTSP Server |
| Frigate  | 5000   | UI Frigate + API |
| MQTT     | 1883   | Broker mensajes |

## Arquitectura de IA

```
Cámara IP
    ↓ (RTSP)
Go2RTC (conversión a WebRTC/MSE)
    ↓ (RTSP interno)
Frigate (detección de objetos)
    ↓ (MQTT eventos)
Backend (webhooks /api/events/frigate)
    ↓ (notificaciones)
Frontend (alertas en tiempo real)
```

## Detección de Objetos

Frigate detecta automáticamente:
- 🧑 Personas
- 🚗 Vehículos
- 🐕 Perros
- 🐈 Gatos

## API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/cameras` | Listar cámaras |
| POST | `/api/cameras` | Crear cámara |
| POST | `/api/sync` | Sincronizar Go2RTC |
| POST | `/api/frigate/sync` | Sincronizar Frigate |
| POST | `/api/events/frigate` | Webhook de Frigate |
| GET | `/api/events` | Eventos recientes |

## Desarrollo

El proyecto está configurado con hot-reload:

- Backend: Cambios en `/backend` se recargan automáticamente
- Frontend: Vite HMR habilitado
- Frigate: Config se regenera al agregar/eliminar cámaras

## Licencia

Propietario - TitanNVR
