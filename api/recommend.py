from http.server import BaseHTTPRequestHandler
import json
import math
from collections import Counter

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            # 1. Safe Input Reading
            content_len = int(self.headers.get('Content-Length', 0))
            if content_len == 0:
                self._send_json([])
                return

            post_data = self.rfile.read(content_len)
            input_data = json.loads(post_data)

            users = input_data.get('users', [])
            destinations = input_data.get('destinations', [])

            if not destinations:
                self._send_json([])
                return

            # ==========================================
            # A. ROBUST GROUP PROFILE BUILDER
            # ==========================================
            
            # --- 1. BUDGET LOGIC ---
            valid_budgets = []
            for u in users:
                try:
                    val = u.get('budget_max')
                    # Check if val is not None and not empty string
                    if val is not None and str(val).strip() != "":
                        valid_budgets.append(float(val))
                except:
                    continue # Skip this user's budget if corrupt

            # RULE: If valid budgets exist, average them. If ALL are NULL, use default 5000.
            if valid_budgets:
                avg_max_budget = sum(valid_budgets) / len(valid_budgets)
            else:
                avg_max_budget = 5000.0 # Default fallback

            # --- 2. TAGS LOGIC ---
            group_tags = []
            for u in users:
                try:
                    # Clean and merge both activity and type preferences
                    acts = self._clean_list(u.get('preferred_activities'))
                    types = self._clean_list(u.get('preferred_types'))
                    group_tags.extend(acts + types)
                except:
                    continue 

            # RULE: If no tags found (All NULL), use generic travel tags
            if not group_tags: 
                group_tags = ["nature", "city", "relax", "scenic", "food", "adventure"]
            
            # Create Vector and Magnitude
            group_vec = Counter(group_tags)
            mag_group = math.sqrt(sum(val**2 for val in group_vec.values()))
            
            # Safety: If magnitude is 0 (shouldn't happen due to defaults), make it 1 to avoid crash
            if mag_group == 0: mag_group = 1

            # ==========================================
            # B. SCORING ENGINE
            # ==========================================
            scored_destinations = []

            for dest in destinations:
                try:
                    # 1. Build Destination Vector (Handle missing fields safely)
                    d_type = str(dest.get('type') or "")
                    d_state = str(dest.get('state') or "")
                    d_name = str(dest.get('name') or "")
                    
                    d_text = f"{d_type} {d_state} {d_name}".lower()
                    dest_vec = Counter(d_text.split())

                    # 2. Cosine Similarity
                    common_words = set(group_vec.keys()) & set(dest_vec.keys())
                    dot_product = sum(group_vec[word] * dest_vec[word] for word in common_words)
                    
                    mag_dest = math.sqrt(sum(val**2 for val in dest_vec.values()))

                    similarity = 0
                    if mag_dest > 0:
                        similarity = dot_product / (mag_group * mag_dest)

                    # 3. Budget Bonus
                    try:
                        price = float(dest.get('price_min') or 0)
                        # If price is within 20% over budget, or budget is high default
                        if price <= (avg_max_budget * 1.2):
                            similarity += 0.1
                    except:
                        pass # Ignore price error, keep calculated similarity

                    # Store Result
                    dest['similarity'] = similarity
                    scored_destinations.append(dest)
                
                except Exception:
                    # If one destination fails, skip it. Don't crash the whole app.
                    continue

            # ==========================================
            # C. SORT & RESPONSE
            # ==========================================
            # Sort by score descending
            scored_destinations.sort(key=lambda x: x.get('similarity', 0), reverse=True)
            
            # Return Top 10
            self._send_json(scored_destinations[:10])

        except Exception as e:
            # Catch global crashes
            self._send_error(str(e))

    # --- HELPERS ---
    def _clean_list(self, val):
        if not val: return []
        try:
            if isinstance(val, str):
                # Handle stringified arrays like "['Nature', 'Beach']"
                val = val.replace('[','').replace(']','').replace('"','').replace("'",'').split(',')
            return [str(x).strip().lower() for x in val if x.strip()]
        except:
            return []

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