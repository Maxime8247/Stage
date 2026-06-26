\# Installation d'OpenTwins



Ce document décrit les principales étapes réalisées afin de préparer l'environnement nécessaire au déploiement d'OpenTwins.



\## Prérequis



\* Debian 13

\* Accès Internet

\* Droits administrateur (`sudo`)



\---



\# 1. Installation de kubectl



Télécharger la dernière version stable :



```bash

curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"

```



Installer le binaire :



```bash

sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

```



Vérifier l'installation :



```bash

kubectl version --client --output=yaml

```



\---



\# 2. Installation de K3s



Installer K3s :



```bash

curl -sfL https://get.k3s.io | sh -

```



Créer le dossier de configuration :



```bash

mkdir -p \~/.kube

```



Copier le fichier de configuration :



```bash

sudo cp /etc/rancher/k3s/k3s.yaml \~/.kube/config

sudo chown $USER:$USER \~/.kube/config

```



Configurer la variable d'environnement :



```bash

export KUBECONFIG=\~/.kube/config

echo "export KUBECONFIG=\~/.kube/config" >> \~/.bashrc

```



Vérifier le cluster :



```bash

kubectl get nodes

```



\---



\# 3. Installation de Helm



Télécharger le script officiel :



```bash

curl -fsSL -o get\_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3

```



Rendre le script exécutable :



```bash

chmod 700 get\_helm.sh

```



Installer Helm :



```bash

./get\_helm.sh

```



Vérifier l'installation :



```bash

helm version

```



\---



\# 4. Ajout du dépôt OpenTwins



Ajouter le dépôt officiel :



```bash

helm repo add ertis-research https://ertis-research.github.io/helm-charts/

```



Mettre à jour les dépôts :



```bash

helm repo update

```



\---



\# Vérification



Contrôler que les outils sont correctement installés :



```bash

kubectl get nodes

helm version

```



Une fois ces étapes réalisées, l'environnement est prêt pour le déploiement d'OpenTwins à l'aide des Helm Charts officiels.



