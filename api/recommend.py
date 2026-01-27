from http.server import BaseHTTPRequestHandler
import json
import math
from collections import Counter

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            # 1. Read Input Safely
            # Use .get() to avoid crashing if header is missing
            content_len = int(self.headers.get('Content-Length', 0))
            if content_len == 0:
                self._send_json([])
                return

            post_data = self.rfile.read(content_len)
            input_data = json.loads(post_data)

            users = input_data.get('users', [])
            destinations = input_data.get('destinations', [])

            if not users or not destinations:
                self._send_json([])
                return

            # ==========================================
            # A. BUILD GROUP PROFILE
            # ==========================================
            # 1. Budget
            valid_max = [float(u['budget_max']) for u in users if u.get('budget_max') is not None]
            avg_max_budget = sum(valid_max) / len(valid_max) if valid_max else 5000

            # 2. Tags
            group_tags = []
            for u in users:
                acts = self._clean_list(u.get('preferred_activities'))
                types = self._clean_list(u.get('preferred_types'))
                group_tags.extend(acts + types)

            if not group_tags: 
                group_tags = ["nature", "city", "relax"]
            
            # Create Group Vector
            group_vec = Counter(group_tags)
            
            # OPTIMIZATION: Calculate Group Magnitude ONCE here (instead of inside the loop)
            mag_group = math.sqrt(sum(val**2 for val in group_vec.values()))

            # ==========================================
            # B. MATH ENGINE (Cosine Similarity)
            # ==========================================
            scored_destinations = []

            for dest in destinations:
                # 1. Build Destination Vector
                d_text = f"{dest.get('type','')} {dest.get('state','')} {dest.get('name','')}".lower()
                dest_vec = Counter(d_text.split())

                # 2. Calculate Similarity
                # Intersection of words (Dot Product)
                common_words = set(group_vec.keys()) & set(dest_vec.keys())
                dot_product = sum(group_vec[word] * dest_vec[word] for word in common_words)
                
                # Dest Magnitude
                mag_dest = math.sqrt(sum(val**2 for val in dest_vec.values()))

                if mag_group * mag_dest == 0:
                    similarity = 0
                else:
                    similarity = dot_product / (mag_group * mag_dest)

                # 3. Budget Bonus
                try:
                    price = float(dest.get('price_min') or 0)
                    if price <= (avg_max_budget * 1.2):
                        similarity += 0.1
                except:
                    pass # Ignore price errors

                # Store Result
                dest['similarity'] = similarity
                scored_destinations.append(dest)

            # ==========================================
            # C. SORT & RESPONSE
            # ==========================================
            scored_destinations.sort(key=lambda x: x['similarity'], reverse=True)
            self._send_json(scored_destinations[:10])

        except Exception as e:
            self._send_error(str(e))

    # --- HELPER FUNCTIONS ---
    
    def _clean_list(self, val):
        if not val: return []
        if isinstance(val, str):
            # Clean stringified lists like "['Nature', 'Beach']"
            val = val.replace('[','').replace(']','').replace('"','').replace("'",'').split(',')
        return [str(x).strip().lower() for x in val if x]

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