from http.server import BaseHTTPRequestHandler
import json
import math
from collections import Counter

class RecommendationEngine:
    def clean_list(self, val):
        if not val: return []
        try:
            if isinstance(val, str):
                val = val.replace('[','').replace(']','').replace('"','').replace("'",'').split(',')
            return [str(x).strip().lower() for x in val if x.strip()]
        except:
            return []

    def get_recommendations(self, users, destinations):
        if not destinations:
            return []

        # --- 1. BUDGET LOGIC ---
        valid_budgets = []
        for u in users:
            try:
                val = u.get('budget_max')
                if val is not None and str(val).strip() != "":
                    valid_budgets.append(float(val))
            except:
                continue 

        if valid_budgets:
            avg_max_budget = sum(valid_budgets) / len(valid_budgets)
        else:
            avg_max_budget = 5000.0 # Default fallback

        # --- 2. TAGS LOGIC ---
        group_tags = []
        for u in users:
            try:
                acts = self.clean_list(u.get('preferred_activities'))
                types = self.clean_list(u.get('preferred_types'))
                group_tags.extend(acts + types)
            except:
                continue 

        if not group_tags: 
            group_tags = ["nature", "city", "relax", "scenic", "food", "adventure"]
        
        group_vec = Counter(group_tags)
        mag_group = math.sqrt(sum(val**2 for val in group_vec.values()))
        if mag_group == 0: mag_group = 1

        scored_destinations = []
        for dest in destinations:
            try:
                # --- SCORE 1: TAG MATCHING (55% Weight) ---
                d_type = str(dest.get('type') or "")
                d_tags_list = self.clean_list(dest.get('tags')) 
                d_tags_str = " ".join(d_tags_list)
                d_text = f"{d_type} {d_tags_str}".lower()
                
                if not d_text.strip():
                    d_text = str(dest.get('name') or "").lower()

                dest_vec = Counter(d_text.split())
                common_words = set(group_vec.keys()) & set(dest_vec.keys())
                dot_product = sum(group_vec[word] * dest_vec[word] for word in common_words)
                mag_dest = math.sqrt(sum(val**2 for val in dest_vec.values()))

                tag_similarity = 0
                if mag_dest > 0:
                    tag_similarity = dot_product / (mag_group * mag_dest)

                # --- SCORE 2: PRICE MATCHING (45% Weight) ---
                price_similarity = 0
                try:
                    price = float(dest.get('price_min') or 0)
                    if price <= avg_max_budget:
                        price_similarity = 1.0
                    else:
                        price_similarity = avg_max_budget / price if price > 0 else 0
                        if price_similarity < 0: price_similarity = 0
                except:
                    price_similarity = 0.5

                final_score = (tag_similarity * 0.55) + (price_similarity * 0.45)
                dest['similarity'] = final_score
                scored_destinations.append(dest)
            except Exception:
                continue

        scored_destinations.sort(key=lambda x: x.get('similarity', 0), reverse=True)
        return scored_destinations[:10]

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_len = int(self.headers.get('Content-Length', 0))
            if content_len == 0:
                self._send_json([])
                return

            post_data = self.rfile.read(content_len)
            input_data = json.loads(post_data)

            users = input_data.get('users', [])
            destinations = input_data.get('destinations', [])

            engine = RecommendationEngine()
            results = engine.get_recommendations(users, destinations)
            self._send_json(results)

        except Exception as e:
            self._send_error(str(e))

    def _send_json(self, data):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _send_error(self, msg):
        self.send_response(500)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({"error": msg}).encode())