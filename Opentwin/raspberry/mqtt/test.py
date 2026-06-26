import random
import time
import json
import paho.mqtt.client as mqtt

BROKER = "172.20.10.2"
PORT = 1883
TOPIC = "telemetry/temperature"

# 1. On crée le client et on ouvre la ligne téléphonique UNE SEULE FOIS
client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, "Simulateur_PC2")
client.connect(BROKER, PORT)

# 2. La fameuse ligne magique qui maintient la connexion ouverte en tâche de fond
client.loop_start()

print(f"Connecté au serveur {BROKER}. Envoi des données en cours...")

try:
    while True:
        temp = round(random.uniform(20, 30), 2)

        # 3. On utilise "value" pour correspondre au code Grafana actuel
        data = {
            "value": temp
        }

        # 4. On publie le message sur la ligne déjà ouverte
        client.publish(TOPIC, json.dumps(data))

        print("Envoyé :", data)

        time.sleep(5)

except KeyboardInterrupt:
    print("\nArrêt du capteur.")
    client.loop_stop()
    client.disconnect()

