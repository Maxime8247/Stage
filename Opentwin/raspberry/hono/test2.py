import random
import time
import json
import paho.mqtt.client as mqtt

HONO_HOST = "172.20.10.2"
HONO_PORT = 1883

TENANT = "DEFAULT_TENANT"
DEVICE_ID = "capteur-pc2"

client = mqtt.Client()

client.username_pw_set(
    username=f"auth-id@{TENANT}",
    password="motdepasse"
)

client.connect(HONO_HOST, HONO_PORT)

while True:
    temp = round(random.uniform(20, 30), 2)

    payload = {
        "temperature": temp
    }

    topic = f"telemetry/{TENANT}/{DEVICE_ID}"

    client.publish(topic, json.dumps(payload))

    print("Envoyé :", payload)

    time.sleep(5)
