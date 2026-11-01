#!/usr/bin/env python3
"""
PONT SERVEUR PYTHON POUR DISTILLATION QWEN -> NODE.JS BITNET
Exécute Qwen2.5 (ou simule les logits si transformers n'est pas installé)
et expose une API HTTP JSON compatible avec OllamaTeacherClient.
"""

import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

MODEL_NAME = "Qwen/Qwen2.5-0.5B-Instruct"
PORT = 11435

class QwenEngine:
    def __init__(self):
        self.has_torch = False
        try:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer
            print(f"[Python-Qwen] Chargement de {MODEL_NAME} sur GPU/CPU...")
            self.tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
            self.model = AutoModelForCausalLM.from_pretrained(
                MODEL_NAME, 
                torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
                device_map="auto"
            )
            self.has_torch = True
            print("[Python-Qwen] Modèle Qwen opérationnel avec Tensor Cores.")
        except Exception as e:
            print(f"[Python-Qwen] Mode simulation actif (Transformers absent ou non configuré: {e})")

    def get_embedding_and_logits(self, text, out_dim=64, num_classes=4):
        if self.has_torch:
            import torch
            inputs = self.tokenizer(text, return_tensors="pt").to(self.model.device)
            with torch.no_grad():
                outputs = self.model(**inputs, output_hidden_states=True)
                # Dernier état caché de la dernière couche
                hidden = outputs.hidden_states[-1][0, -1, :out_dim].cpu().float().tolist()
                logits = outputs.logits[0, -1, :num_classes].cpu().float().tolist()
                return {"embedding": hidden, "logits": logits}
        else:
            # Simulation déterministe pour tests sans GPU
            emb = [(hash(text + str(i)) % 1000) / 500.0 - 1.0 for i in range(out_dim)]
            logits = [(hash(text) % 10 - 5.0) + (i * 1.5) for i in range(num_classes)]
            return {"embedding": emb, "logits": logits}

qwen_instance = QwenEngine()

class TeacherRequestHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path in ("/api/embeddings", "/api/teacher"):
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode("utf-8"))
            prompt = data.get("prompt", "")

            result = qwen_instance.get_embedding_and_logits(prompt)
            response_bytes = json.dumps(result).encode("utf-8")

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(response_bytes)))
            self.end_headers()
            self.wfile.write(response_bytes)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        return # Silence logs

def run_server():
    server_address = ("", PORT)
    httpd = HTTPServer(server_address, TeacherRequestHandler)
    print(f"[Python-Qwen] Serveur enseignant à l'écoute sur http://localhost:{PORT}")
    httpd.serve_forever()

if __name__ == "__main__":
    run_server()