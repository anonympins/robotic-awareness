#!/usr/bin/env python3
"""
PONT SERVEUR PYTHON POUR DISTILLATION QWEN -> NODE.JS BITNET
Exécute Qwen2.5 (ou simule les logits si transformers n'est pas installé)
et expose une API HTTP JSON compatible avec OllamaTeacherClient.

Résilience :
1. PyTorch / Transformers local si disponible.
2. Relais automatique vers Ollama local (http://localhost:11434) sinon.
3. Mode simulation déterministe en dernier recours.
"""

import argparse
import json
import math
import random
import shutil
import subprocess
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODEL_NAME = "Qwen/Qwen2.5-0.5B-Instruct"
OLLAMA_BASE_URL = "http://localhost:11434"
OLLAMA_FALLBACK_MODEL = "qwen2.5:0.5b"
OLLAMA_EMBED_FALLBACK_MODEL = "nomic-embed-text"
PORT = 11435
PREFER_OLLAMA = True  # Priorise Ollama local par défaut si présent
OLLAMA_KEEP_ALIVE = "60m"
EMBED_CACHE_LIMIT = 2048
BITGEMM_API_URL = "http://localhost:7701"

# ---------------------------------------------------------------------------
# 1. MODULES D'EXPERTS THÉMATIQUES (MOE_DOMAINS)
# ---------------------------------------------------------------------------
MOE_DOMAINS = {
    "robotics_awareness": {
        "name": "Perception spatiale & Odométrie",
        "weight": 1.15,
        "system": "Tu es un chercheur en robotique autonome, perception spatiale, odométrie visuelle et contrôle moteur.",
        "seeds": [
            "L'odométrie visuelle fusionne les données gyroscopiques pour estimer précisément la trajectoire spatiale du robot.",
            "La perception spatiale calcule la carte de profondeur et évite les obstacles dynamiques avec fluidité.",
            "Le contrôle moteur module le couple des servomoteurs pour stabiliser le centre de masse du châssis.",
            "Les capteurs lidar tracent un nuage de points pour assurer la localisation et la cartographie simultanées.",
            "L'estimation d'état inertielle compense le glissement des roues sur les surfaces irrégulières."
        ]
    },
    "physics_astronomy": {
        "name": "Physique fondamentale & Astronomie",
        "weight": 1.0,
        "system": "Tu es un astrophysicien et thermodynamicien renommé.",
        "seeds": [
            "Les principes de la thermodynamique régissent le transfert d'énergie thermique et l'accroissement continu de l'entropie.",
            "Les télescopes spatiaux observent le décalage spectral des galaxies lointaines pour quantifier l'expansion cosmique.",
            "L'effondrement gravitationnel d'une naine blanche au-delà de la masse de Chandrasekhar déclenche une supernova thermonucléaire.",
            "Le rayonnement synchrotron produit par des particules relativistes éclaire les structures des nébuleuses magnétisées.",
            "La courbure de l'espace-temps dévie la trajectoire des photons à proximité d'un champ gravitationnel intense."
        ]
    },
    "math_logic": {
        "name": "Algèbre matricielle & Logique déductive",
        "weight": 1.25,
        "system": "Tu es un mathématicien expert en algèbre matricielle, espaces vectoriels hermitiens et logique formelle.",
        "seeds": [
            "La décomposition en valeurs singulières factorise tout opérateur linéaire dans un espace vectoriel de dimension finie.",
            "Les transformations orthogonales préservent la norme euclidienne ainsi que les angles des vecteurs propres.",
            "La logique déductive garantit l'invariance formelle des axiomes sans engendrer de contradiction sémantique.",
            "La diagonalisation spectrale des matrices symétriques simplifie la résolution des équations différentielles couplées.",
            "L'espace préhilbertien complet fournit le cadre d'orthogonalité pour la convergence des séries de Fourier."
        ]
    },
    "algorithms_bitnet": {
        "name": "Quantification 1-bit & Calcul BitGEMM",
        "weight": 1.30,
        "system": "Tu es un chercheur spécialisé en quantification ternaire 1-bit, compression binaire et calcul tensoriel optimisé.",
        "seeds": [
            "La quantification 1-bit remplace les multiplications scalaires coûteuses par des additions entières ultrarapides.",
            "L'architecture BitGEMM compresse les poids synaptiques en valeurs ternaires pour maximiser l'efficacité énergétique.",
            "Le calcul tensoriel binaire réduit l'empreinte mémoire vive tout en préservant la capacité d'abstraction du modèle.",
            "La normalisation L2 vectorielle stabilise la rétropropagation discrète lors de la distillation des gradients.",
            "Les masques binaires et les opérations logiques accélèrent l'évaluation autorégressive des séquences de jetons."
        ]
    },
    "neurosciences_cognition": {
        "name": "Neurosciences & Intégration sensori-motrice",
        "weight": 1.10,
        "system": "Tu es un neurobiologiste spécialiste de la plasticité synaptique et de la mémoire épisodique.",
        "seeds": [
            "La plasticité synaptique module la connectivité dendritique selon les règles d'apprentissage hebbien.",
            "La mémoire épisodique consolide les représentations temporelles lors des cycles de repos hippocampique.",
            "L'intégration sensori-motrice synchronise les afférences proprioceptives pour déclencher des réponses réflexes optimales.",
            "Les circuits neuronaux récurrents encodent les dépendances contextuelles à travers des résonances oscillatoires.",
            "La potentialisation à long terme fortifie les réseaux de transmission synaptique soumis à des stimulations répétées."
        ]
    }
}

# Force le vidage de stdout pour un affichage instantané sous Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)


def l2_normalize(vector):
    """Normalise un vecteur pour que ||v||_2 = 1.0 (valeurs dans [-1.0, 1.0])."""
    norm = math.sqrt(sum(x * x for x in vector))
    if norm < 1e-12:
        return vector
    return [x / norm for x in vector]


def text_to_pseudo_embedding(text, dim=64):
    """Projette un texte généré en un vecteur continu déterministe de dimension `dim`."""
    vector = [0.0] * dim
    for idx, char in enumerate(text):
        slot = (ord(char) * 31 + idx * 17) % dim
        vector[slot] += math.sin(idx + ord(char))
    return l2_normalize(vector)


def is_garbled_prompt(prompt: str) -> bool:
    """
    Détecte les résidus de corpus corrompus ou numériques (ex: '[8] ii reis 17.25.', '29.11 e 146.14.').
    """
    if not prompt or len(prompt.strip()) < 4:
        return True
    cleaned = prompt.strip()
    words = [w for w in cleaned.split() if w.isalpha()]
    # Trop peu de mots alphabétiques pour former une phrase compréhensible
    if len(words) < 2:
        return True
    # Ratio de lettres alphabétiques trop faible (bruit, chiffres, références)
    alpha_count = sum(c.isalpha() for c in cleaned)
    if alpha_count < 6 or (alpha_count / max(1, len(cleaned))) < 0.45:
        return True
    return False


class QwenEngine:
    def __init__(self, prefer_ollama=PREFER_OLLAMA, model_name=MODEL_NAME, ollama_model=None):
        self.mode = "simulation"
        self.model_name = model_name
        self.custom_ollama_model = ollama_model
        self.ollama_model = ollama_model or OLLAMA_FALLBACK_MODEL
        self.ollama_process = None
        self.ollama_use_generation = False
        self._cache = {}

        # 1. Tentative Ollama local (si priorisé ou si PyTorch n'est pas requis)
        if prefer_ollama:
            if self._try_init_ollama():
                return
            print("[Python-Qwen] Ollama non disponible, tentative de bascule vers PyTorch...", flush=True)

        # 2. Tentative PyTorch / Transformers
        if self._try_init_torch():
            return

        # 3. Tentative Ollama en repli si PyTorch a échoué (dans le cas où prefer_ollama=False)
        if not prefer_ollama and self._try_init_ollama():
            return

        # 4. Repli Simulation
        print("[Python-Qwen] Mode simulation déterministe actif.", flush=True)

    def _ensure_ollama_daemon(self):
        """Démarre le serveur Ollama en arrière-plan si le port 11434 n'est pas actif."""
        ollama_bin = shutil.which("ollama")
        if not ollama_bin:
            return False

        print("[Python-Qwen] Lancement du démon 'ollama serve' en arrière-plan...", flush=True)
        try:
            self.ollama_process = subprocess.Popen(
                [ollama_bin, "serve"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            # Attente active du démarrage (max 6 secondes)
            for _ in range(12):
                time.sleep(0.5)
                try:
                    with urllib.request.urlopen(f"{OLLAMA_BASE_URL}/api/tags", timeout=1.0) as resp:
                        if resp.status == 200:
                            return True
                except Exception:
                    continue
        except Exception as e:
            print(f"[Python-Qwen] Échec du démarrage automatique d'Ollama ({e}).", flush=True)
        return False

    def _pull_ollama_model(self, model_name):
        """Télécharge le modèle dans Ollama via CLI ou API REST."""
        print(f"[Python-Qwen] Téléchargement du modèle Ollama '{model_name}'...", flush=True)
        ollama_bin = shutil.which("ollama")
        if ollama_bin:
            res = subprocess.run([ollama_bin, "pull", model_name])
            return res.returncode == 0
        else:
            try:
                payload = json.dumps({"name": model_name, "stream": False}).encode("utf-8")
                req = urllib.request.Request(
                    f"{OLLAMA_BASE_URL}/api/pull",
                    data=payload,
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=300.0) as resp:
                    return resp.status == 200
            except Exception as e:
                print(f"[Python-Qwen] Erreur lors du pull Ollama ({e}).", flush=True)
                return False

    def _unload_ollama_model(self, model_name):
        """Décharge le modèle de la mémoire d'Ollama pour forcer sa réinitialisation avec les flags d'embeddings."""
        print(f"[Python-Qwen] Déchargement du cache Ollama '{model_name}' pour basculer en mode embeddings...", flush=True)
        ollama_bin = shutil.which("ollama")
        if ollama_bin:
            try:
                subprocess.run([ollama_bin, "stop", model_name], capture_output=True, timeout=5)
            except Exception:
                pass
        try:
            payload = json.dumps({"model": model_name, "keep_alive": 0}).encode("utf-8")
            req = urllib.request.Request(
                f"{OLLAMA_BASE_URL}/api/generate",
                data=payload,
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=5.0) as resp:
                resp.read()
        except Exception:
            pass
        time.sleep(1.0)

    def _try_init_torch(self):
        try:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer

            print(f"[Python-Qwen] Chargement de {self.model_name} sur GPU/CPU...", flush=True)
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            self.model = AutoModelForCausalLM.from_pretrained(
                self.model_name,
                torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
                device_map="auto",
            )
            self.mode = "torch"
            print("[Python-Qwen] Modèle Qwen opérationnel avec Tensor Cores.", flush=True)
            return True
        except Exception as e:
            print(f"[Python-Qwen] PyTorch non disponible ({e}).", flush=True)
            return False

    def _try_init_ollama(self):
        try:
            # Test de connexion immédiate ou démarrage automatique
            reachable = False
            try:
                with urllib.request.urlopen(f"{OLLAMA_BASE_URL}/api/tags", timeout=1.5) as resp:
                    reachable = (resp.status == 200)
            except Exception:
                reachable = self._ensure_ollama_daemon()

            if not reachable:
                return False

            if self.custom_ollama_model:
                self.ollama_model = self.custom_ollama_model
            else:
                with urllib.request.urlopen(f"{OLLAMA_BASE_URL}/api/tags", timeout=2.0) as resp:
                    tags_data = json.loads(resp.read().decode("utf-8"))
                    models = [m.get("name", "") for m in tags_data.get("models", [])]
                    qwen_models = [m for m in models if "qwen" in m.lower()]
                    embed_models = [m for m in models if any(k in m.lower() for k in ("embed", "minilm", "bge"))]

                    if qwen_models and not embed_models:
                        self.ollama_model = qwen_models[0]
                    elif embed_models:
                        self.ollama_model = embed_models[0]
                    elif models:
                        self.ollama_model = models[0]
                    else:
                        self.ollama_model = OLLAMA_FALLBACK_MODEL

            # 1. Tentative d'utilisation des embeddings natifs
            test_emb = self._try_embeddings_probe()
            if test_emb and len(test_emb) > 0:
                self.mode = "ollama"
                self.ollama_use_generation = False
                print(f"[Python-Qwen] Relais Ollama opérationnel en mode embeddings sur {OLLAMA_BASE_URL} (modèle: {self.ollama_model}, dim={len(test_emb)}).", flush=True)
                return True

            # 2. Si le modèle CausalLM (qwen) ne supporte pas l'endpoint embeddings,
            # bascule transparente sur le mode génération textuelle (/api/generate)
            print(f"[Python-Qwen] Bascule sur le mode génération/distillation textuelle pour '{self.ollama_model}'...", flush=True)
            test_gen = self._query_ollama_generate("echo ok", max_tokens=5)
            if test_gen is not None:
                self.mode = "ollama"
                self.ollama_use_generation = True
                print(f"[Python-Qwen] Relais Ollama opérationnel en mode génération textuelle (modèle: {self.ollama_model}).", flush=True)
                return True
        except Exception as err:
            print(f"[Python-Qwen] Ollama injoignable ou erreur d'initialisation embeddings ({err}).", flush=True)
        return False

    def _try_embeddings_probe(self):
        """Tente une requête d'embedding sans lever d'exception bloquante."""
        try:
            return self._query_ollama_embeddings("healthcheck")
        except RuntimeError as err:
            if "model not found" in str(err).lower():
                self._pull_ollama_model(self.ollama_model)
                return self._query_ollama_embeddings("healthcheck")
            return None
        except Exception:
            return None

    def _query_ollama_embeddings(self, text):
        """Interroge Ollama / llama-server : tente /api/embed, /v1/embeddings, puis /api/embeddings."""
        last_error = None

        # 1. Endpoint moderne Ollama (/api/embed)
        try:
            payload = json.dumps({"model": self.ollama_model, "input": text, "keep_alive": OLLAMA_KEEP_ALIVE}).encode("utf-8")
            req = urllib.request.Request(
                f"{OLLAMA_BASE_URL}/api/embed",
                data=payload,
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=15.0) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                embeddings = res.get("embeddings", [])
                if embeddings and len(embeddings) > 0:
                    return embeddings[0]
                if "embedding" in res:
                    return res["embedding"]
        except urllib.error.HTTPError as err:
            err_msg = err.read().decode("utf-8", errors="ignore")
            if "does not support embeddings" in err_msg:
                raise RuntimeError(f"does not support embeddings: {err_msg.strip()}")
            if "not found" in err_msg or "try pulling" in err_msg:
                raise RuntimeError(f"model not found: {err_msg.strip()}")
            last_error = f"/api/embed -> HTTP {err.code}: {err_msg or err.reason}"
        except Exception as err:
            last_error = f"/api/embed -> {err}"

        # 2. Endpoint OpenAI-compatible (/v1/embeddings pour llama-server / vLLM)
        try:
            payload = json.dumps({"model": self.ollama_model, "input": text, "keep_alive": OLLAMA_KEEP_ALIVE}).encode("utf-8")
            req = urllib.request.Request(
                f"{OLLAMA_BASE_URL}/v1/embeddings",
                data=payload,
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=10.0) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                data_list = res.get("data", [])
                if data_list and "embedding" in data_list[0]:
                    return data_list[0]["embedding"]
        except urllib.error.HTTPError as err:
            err_msg = err.read().decode("utf-8", errors="ignore")
            if "does not support embeddings" in err_msg:
                raise RuntimeError(f"Serveur local non configuré pour les embeddings ({err_msg.strip()}). Relancez avec --embeddings.")
        except Exception:
            pass

        # 3. Repli sur l'ancien endpoint Ollama (/api/embeddings)
        try:
            payload = json.dumps({"model": self.ollama_model, "prompt": text, "keep_alive": OLLAMA_KEEP_ALIVE}).encode("utf-8")
            req = urllib.request.Request(
                f"{OLLAMA_BASE_URL}/api/embeddings",
                data=payload,
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=15.0) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                return res.get("embedding", [])
        except urllib.error.HTTPError as err:
            err_msg = err.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"{last_error} | /api/embeddings -> HTTP {err.code}: {err_msg or err.reason}")
        except Exception as err:
            raise RuntimeError(f"{last_error} | /api/embeddings -> {err}")

    def _query_ollama_generate(self, prompt, system_prompt=None, max_tokens=48):
        """Interroge Ollama /api/generate pour produire du texte ou des décisions."""
        try:
            payload = {
                "model": self.ollama_model,
                "prompt": prompt,
                "stream": False,
                "keep_alive": OLLAMA_KEEP_ALIVE,
                "options": {"num_predict": max_tokens, "temperature": 0.2},
            }
            if system_prompt:
                payload["system"] = system_prompt
            req = urllib.request.Request(
                f"{OLLAMA_BASE_URL}/api/generate",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=30.0) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                return res.get("response", "")
        except Exception as e:
            print(f"[Python-Qwen] Erreur /api/generate ({e}).", flush=True)
            return None

    # -----------------------------------------------------------------------
    # 2. MOTEUR DE GÉNÉRATION DE CONNAISSANCES SPÉCIALISÉES (generate_knowledge)
    # -----------------------------------------------------------------------
    def generate_knowledge(self, domain_key, prompt=None, max_tokens=64):
        """
        Génère un énoncé scientifique structuré via PyTorch, Ollama ou repli simulation.
        """
        domain = MOE_DOMAINS.get(domain_key, MOE_DOMAINS["algorithms_bitnet"])
        seed = prompt if prompt else random.choice(domain["seeds"])

        # 1. Mode PyTorch CausalLM
        if self.mode == "torch":
            try:
                import torch
                instruction = f"{domain['system']}\nÉcris une phrase scientifique précise et concise sur : {seed}"
                formatted = f"<|im_start|>system\n{domain['system']}<|im_end|>\n<|im_start|>user\n{instruction}<|im_end|>\n<|im_start|>assistant\n"
                inputs = self.tokenizer(formatted, return_tensors="pt").to(self.model.device)
                with torch.no_grad():
                    out = self.model.generate(
                        **inputs,
                        max_new_tokens=max_tokens,
                        temperature=0.7,
                        do_sample=True,
                        pad_token_id=self.tokenizer.eos_token_id
                    )
                generated_text = self.tokenizer.decode(out[0][inputs.input_ids.shape[1]:], skip_special_tokens=True).strip()
                first_sentence = generated_text.split("\n")[0].strip()
                if len(first_sentence) >= 15:
                    return first_sentence
            except Exception as e:
                print(f"[Python-Qwen] Erreur génération PyTorch ({e}), repli...", flush=True)

        # 2. Mode Relais Ollama
        if self.mode == "ollama":
            prompt_req = f"Rédige une unique assertion scientifique rigoureuse, autonome et en français à partir de cette idée : '{seed}'."
            text = self._query_ollama_generate(prompt_req, system_prompt=domain["system"], max_tokens=max_tokens)
            if text:
                cleaned = text.strip().replace('"', '').replace('\n', ' ')
                first_sentence = cleaned.split('.')[0] + '.'
                if len(first_sentence) >= 20:
                    return first_sentence

        # 3. Repli Simulation Déterministe
        variations = [
            "analyse rigoureusement les interactions dynamiques.",
            "optimise les coefficients matriciels sous contrainte énergétique.",
            "établit une correspondance formelle entre théorie et observation empirique.",
            "restructure l'espace latent pour maximiser le pouvoir prédictif."
        ]
        base_seed = seed.rstrip(". ")
        complement = variations[hash(seed) % len(variations)]
        return f"{base_seed}, ce qui {complement}"

    def get_embedding_and_logits(self, text, out_dim=64, num_classes=4):
        cache_key = (text, out_dim, num_classes)
        if cache_key in self._cache:
            return dict(self._cache[cache_key])

        raw_embedding = []
        logits = []

        if self.mode == "torch":
            try:
                import torch
                inputs = self.tokenizer(text, return_tensors="pt").to(self.model.device)
                with torch.no_grad():
                    outputs = self.model(**inputs, output_hidden_states=True)
                    # Dernier état caché de la dernière couche
                    hidden_state = outputs.hidden_states[-1][0, -1, :].cpu().float().tolist()
                    raw_embedding = hidden_state[:out_dim]
                    logits = outputs.logits[0, -1, :num_classes].cpu().float().tolist()
            except Exception as e:
                print(f"[Python-Qwen] Erreur inférence Torch ({e}), repli simulation.", flush=True)

        elif self.mode == "ollama":
            if not self.ollama_use_generation:
                try:
                    full_emb = self._query_ollama_embeddings(text)
                    if full_emb:
                        raw_embedding = full_emb[:out_dim]
                        logits = [sum(raw_embedding[i::num_classes]) for i in range(num_classes)]
                except Exception:
                    self.ollama_use_generation = True

            if self.ollama_use_generation:
                generated_text = self._query_ollama_generate(text)
                if generated_text:
                    raw_embedding = text_to_pseudo_embedding(generated_text, dim=out_dim)
                    logits = [
                        sum(ord(c) for c in generated_text[i::num_classes]) % 10.0 - 5.0
                        for i in range(num_classes)
                    ]
                    
        # Repli si aucune embedding générée
        if not raw_embedding:
            used_source = "simulation (fallback)" if self.mode != "simulation" else "simulation"
            raw_embedding = [(hash(text + str(i)) % 1000) / 500.0 - 1.0 for i in range(out_dim)]
            logits = [(hash(text) % 10 - 5.0) + (i * 1.5) for i in range(num_classes)]

        # Ajustement de dimension dynamique (padding si out_dim > len)
        if len(raw_embedding) < out_dim:
            raw_embedding.extend([0.0] * (out_dim - len(raw_embedding)))
        else:
            raw_embedding = raw_embedding[:out_dim]

        # Normalisation L2 de l'embedding pour respecter la plage [-1.0, 1.0] de BitNet
        normalized_embedding = l2_normalize(raw_embedding)

        result = {
            "embedding": normalized_embedding,
            "logits": logits[:num_classes],
            "source": f"{self.mode} ({'generate' if self.ollama_use_generation else 'embed'})" if self.mode == "ollama" else self.mode,
        }

        # Insertion dans le cache LRU
        if len(self._cache) >= EMBED_CACHE_LIMIT:
            self._cache.pop(next(iter(self._cache)))
        self._cache[cache_key] = result

        return dict(result)


# ---------------------------------------------------------------------------
# 3. ROUTEUR & ORCHESTRATEUR MOE (MoEBitGEMMTrainer)
# ---------------------------------------------------------------------------
class MoEBitGEMMTrainer:
    """
    Échantillonne les domaines d'experts, applique des poids différenciés,
    génère les formulations et les injecte automatiquement dans l'API BitGEMM.
    """
    def __init__(self, engine, api_url=BITGEMM_API_URL):
        self.engine = engine
        self.api_url = api_url.rstrip("/")
        self.domains = MOE_DOMAINS
        self.domain_keys = list(self.domains.keys())
        self.weights = [self.domains[k]["weight"] for k in self.domain_keys]

    def sample_domain(self):
        """Échantillonnage stochastique selon la distribution pondérée des experts."""
        return random.choices(self.domain_keys, weights=self.weights, k=1)[0]

    def train_step(self, domain=None, lr=0.03, retrain_grammar=False):
        chosen_domain = domain if domain else self.sample_domain()
        meta = self.domains[chosen_domain]
        statement = self.engine.generate_knowledge(chosen_domain)

        payload = {
            "text": statement,
            "weight": meta.get("weight", 1.0),
            "lr": lr,
            "retrain_grammar": retrain_grammar
        }

        req = urllib.request.Request(
            f"{self.api_url}/ingest",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )

        try:
            with urllib.request.urlopen(req, timeout=12.0) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                return {
                    "success": True,
                    "domain": chosen_domain,
                    "domain_name": meta["name"],
                    "statement": statement,
                    "bitgemm": result.get("bitgemm", {}),
                    "vocabulary": result.get("symbolic_vocabulary", 0),
                    "merges": result.get("tokenizer_merges", 0),
                }
        except Exception as e:
            return {
                "success": False,
                "domain": chosen_domain,
                "error": str(e),
                "statement": statement
            }

    def bootstrap_game(self, count_per_domain=3):
        """Initialise le jeu avec un jeu de données thématique équilibré et lisible."""
        print(f"\n\x1b[32m=== INITIALISATION THÉMATIQUE DU JEU (MoE Seed Bank) ===\x1b[0m", flush=True)
        total_injected = 0
        for domain_key, meta in self.domains.items():
            seeds = meta.get("seeds", [])[:count_per_domain]
            for seed in seeds:
                payload = {
                    "text": seed,
                    "weight": meta.get("weight", 1.0),
                    "lr": 0.04,
                    "retrain_grammar": False
                }
                try:
                    req = urllib.request.Request(f"{self.api_url}/ingest", data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"})
                    with urllib.request.urlopen(req, timeout=10.0):
                        total_injected += 1
                except Exception as e:
                    print(f"  \x1b[33m[Bootstrap] Échec injection ({e})\x1b[0m", flush=True)
        print(f"\x1b[32m✔ {total_injected} assertions thématiques injectées pour initialiser le jeu.\x1b[0m\n", flush=True)
        return total_injected

    def run_training_loop(self, steps=10, delay_sec=0.2, retrain_every=10):
        print(f"\n\x1b[35m=== DÉMARRAGE ENTRAÎNEMENT MoE -> BitGEMM ({steps} étapes) ===\x1b[0m", flush=True)
        for i in range(1, steps + 1):
            retrain = (i % retrain_every == 0)
            res = self.train_step(retrain_grammar=retrain)
            if res.get("success"):
                bg = res.get("bitgemm", {})
                print(f"  [Étape {i:02d}/{steps:02d}] Expert: \x1b[36m{res['domain']}\x1b[0m | Vocab: {bg.get('vocabSize', '?')} | Loss: {bg.get('avgLoss', '?')} | Acc: {bg.get('top1Accuracy', '?')}\n         ↳ \"{res['statement'][:85]}...\"", flush=True)
            else:
                print(f"  [Étape {i:02d}/{steps:02d}] \x1b[31mErreur d'ingestion :\x1b[0m {res.get('error')}", flush=True)
            time.sleep(delay_sec)


class TeacherRequestHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        t0 = time.perf_counter()
        if self.path in ("/api/embeddings", "/api/teacher", "/api/embed", "/api/generate", "/api/distill"):
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode("utf-8"))
            
            # Mode génération de texte synthétique direct
            if self.path in ("/api/generate", "/api/distill"):
                prompt = data.get("prompt", "")
                sys_prompt = data.get("system", "")
                max_tokens = int(data.get("max_tokens", 64))
                gen_text = qwen_instance._query_ollama_generate(prompt, system_prompt=sys_prompt, max_tokens=max_tokens) or ""
                res_obj = {"response": gen_text, "model": qwen_instance.ollama_model}
                response_bytes = json.dumps(res_obj).encode("utf-8")
                source_mode = f"{qwen_instance.mode} (generate)"
                preview = (prompt[:45] + "...") if len(prompt) > 45 else prompt
                out_dim = 0
            else:
                # Support des formats 'prompt', 'input' ou 'text'
                prompt = data.get("prompt") or data.get("input") or data.get("text") or ""
                if isinstance(prompt, list):
                    prompt = " ".join(prompt)
                out_dim = int(data.get("dim", data.get("out_dim", 64)))
                num_classes = int(data.get("num_classes", 4))

                # Substitution si l'invite d'entrée est un résidu textuel illisible
                if is_garbled_prompt(prompt):
                    chosen_domain = moe_orchestrator.sample_domain()
                    replacement = random.choice(MOE_DOMAINS[chosen_domain]["seeds"])
                    print(f"[Python-Qwen] Prompt illisible intercepté (\"{prompt[:30]}\") -> Remplacement par [{chosen_domain}]: \"{replacement[:45]}...\"", flush=True)
                    prompt = replacement

                preview = (prompt[:45] + "...") if len(prompt) > 45 else prompt

                result = qwen_instance.get_embedding_and_logits(prompt, out_dim=out_dim, num_classes=num_classes)
                source_mode = result.pop("source", qwen_instance.mode)
                response_bytes = json.dumps(result).encode("utf-8")
            
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            print(f"[Python-Qwen] POST {self.path} | Mode: {source_mode} | dim={out_dim} | {elapsed_ms:.1f}ms | prompt=\"{preview}\"", flush=True)

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(response_bytes)))
            self.end_headers()
            self.wfile.write(response_bytes)

        elif self.path == "/api/moe/bootstrap":
            injected = moe_orchestrator.bootstrap_game()
            res_bytes = json.dumps({"status": "ok", "injected_thematics": injected}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(res_bytes)))
            self.end_headers()
            self.wfile.write(res_bytes)

        elif self.path in ("/api/moe/step", "/api/moe/generate"):
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length) if content_length > 0 else b"{}"
            data = json.loads(body.decode("utf-8")) if body else {}
            domain = data.get("domain")

            if self.path == "/api/moe/generate":
                prompt = data.get("prompt")
                text = qwen_instance.generate_knowledge(domain or "algorithms_bitnet", prompt=prompt)
                res_bytes = json.dumps({"domain": domain, "knowledge": text}).encode("utf-8")
            else:
                retrain = bool(data.get("retrain_grammar", False))
                step_res = moe_orchestrator.train_step(domain=domain, retrain_grammar=retrain)
                res_bytes = json.dumps(step_res).encode("utf-8")

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(res_bytes)))
            self.end_headers()
            self.wfile.write(res_bytes)
        elif self.path == "/api/thematics":
            # Expose la liste plate de toutes les phrases thématiques validées pour le jeu
            all_thematics = []
            for dom, val in MOE_DOMAINS.items():
                for s in val["seeds"]:
                    all_thematics.append({"domain": dom, "text": s, "weight": val["weight"]})
            res_bytes = json.dumps({"thematics": all_thematics}, ensure_ascii=False, indent=2).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(res_bytes)))
            self.end_headers()
            self.wfile.write(res_bytes)
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        if self.path == "/api/moe/domains":
            data = {
                "domains": MOE_DOMAINS,
                "mode": qwen_instance.mode,
                "api_url": moe_orchestrator.api_url
            }
            res_bytes = json.dumps(data, indent=2).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(res_bytes)))
            self.end_headers()
            self.wfile.write(res_bytes)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        return  # Désactive les logs HTTP bruts au profit du log formaté ci-dessus

def run_server(
    port=PORT,
    prefer_ollama=PREFER_OLLAMA,
    api_url=BITGEMM_API_URL,
    train_steps=0,
    init_game=False,
    model_name=MODEL_NAME,
    ollama_model=None
):
    global qwen_instance, moe_orchestrator
    qwen_instance = QwenEngine(prefer_ollama=prefer_ollama, model_name=model_name, ollama_model=ollama_model)
    moe_orchestrator = MoEBitGEMMTrainer(qwen_instance, api_url=api_url)

    if init_game:
        t_init = threading.Thread(target=moe_orchestrator.bootstrap_game, daemon=True)
        t_init.start()

    if train_steps > 0:
        t = threading.Thread(
            target=moe_orchestrator.run_training_loop,
            args=(train_steps, 0.3, 10),
            daemon=True
        )
        t.start()

    server_address = ("", port)
    httpd = ThreadingHTTPServer(server_address, TeacherRequestHandler)
    print(f"[Python-Qwen] Serveur enseignant & MoE actif sur http://localhost:{port}", flush=True)
    print(f"[Python-Qwen] Routeur vers API BitGEMM : {api_url}", flush=True)
    httpd.serve_forever()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Serveur Enseignant Qwen pour BitNet")
    parser.add_argument("--install-torch", action="store_true", help="Installe automatiquement PyTorch et Transformers via pip dans l'environnement virtuel")
    parser.add_argument("--port", type=int, default=PORT, help="Port d'écoute du serveur")
    parser.add_argument("--torch", action="store_true", help="Forcer la tentative d'utilisation locale de PyTorch en priorité")
    parser.add_argument("--ollama", action="store_true", default=True, help="Prioriser Ollama en mode embeddings")
    parser.add_argument("--model", type=str, default=MODEL_NAME, help="Nom du modèle HuggingFace / PyTorch (ex: Qwen/Qwen2.5-1.5B-Instruct)")
    parser.add_argument("--ollama-model", type=str, default=None, help="Nom exact du modèle Ollama à utiliser (ex: qwen2.5:1.5b, mistral:7b)")
    parser.add_argument("--api-url", type=str, default=BITGEMM_API_URL, help="URL de base de api-server.js")
    parser.add_argument("--train-moe", type=int, default=0, help="Déclenche N étapes d'entraînement MoE vers BitGEMM au démarrage")
    parser.add_argument("--init-game", action="store_true", help="Initialise immédiatement le jeu avec les thématiques d'experts préenregistrées")
    args = parser.parse_args()

    if args.install_torch:
        print(f"[Python-Qwen] Installation de PyTorch et Transformers dans '{sys.executable}'...", flush=True)
        subprocess.run([sys.executable, "-m", "pip", "install", "torch", "transformers", "accelerate"])
        args.torch = True

    prefer_ollama = not args.torch
    run_server(
        port=args.port,
        prefer_ollama=prefer_ollama,
        api_url=args.api_url,
        train_steps=args.train_moe,
        init_game=args.init_game,
        model_name=args.model,
        ollama_model=args.ollama_model
    )