from http.server import BaseHTTPRequestHandler
import json
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.metrics.pairwise import cosine_similarity

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            # 1. Read Input Data (HTTP Request)
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            input_data = json.loads(post_data)

            users = input_data.get('users', [])
            destinations = input_data.get('destinations', [])

            # Handle Empty Data
            if not users or not destinations:
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps([]).encode())
                return

            # ==========================================
            # A. BUILD GROUP PROFILE (SAFE MODE)
            # ==========================================
            
            # 1. Budget Calculation (Skip None values)
            valid_min = [u.get('budget_min') for u in users if u.get('budget_min') is not None]
            valid_max = [u.get('budget_max') for u in users if u.get('budget_max') is not None]
            
            # Default to 5000 if no one set a max budget
            avg_max_budget = np.mean(valid_max) if valid_max else 5000

            # 2. Aggregated Preferences
            group_tags = []
            for u in users:
                # Handle None/Null
                acts = u.get('preferred_activities') or []
                types = u.get('preferred_types') or []

                # Handle JSON strings "[...]" or CSV "a,b"
                if isinstance(acts, str): 
                    acts = acts.replace('[','').replace(']','').replace('"','').split(',')
                if isinstance(types, str): 
                    types = types.replace('[','').replace(']','').replace('"','').split(',')

                # Add to list
                group_tags.extend([str(x).strip() for x in acts if x])
                group_tags.extend([str(x).strip() for x in types if x])

            group_profile_str = " ".join(group_tags).lower()

            # SAFETY: Prevent crash on empty group profile
            if not group_profile_str.strip():
                group_profile_str = "nature city beach adventure relax"

            # ==========================================
            # B. ML ENGINE
            # ==========================================
            df = pd.DataFrame(destinations)

            # Ensure columns exist
            for col in ['type', 'state', 'name', 'price_min']:
                if col not in df.columns: df[col] = ''

            # Create Tags
            df['tags'] = (df['type'].astype(str) + " " + df['state'].astype(str) + " " + df['name'].astype(str)).str.lower()

            # Vectorize & Calculate Similarity
            try:
                vectorizer = CountVectorizer()
                all_text = [group_profile_str] + df['tags'].tolist()
                matrix = vectorizer.fit_transform(all_text)
                cosine_sim = cosine_similarity(matrix[0:1], matrix[1:])
                df['similarity'] = cosine_sim[0]
            except Exception:
                df['similarity'] = 0

            # ==========================================
            # C. FILTERING
            # ==========================================
            # Budget Boost (+10% score if affordable)
            # Handle price being string or number
            df['price_min'] = pd.to_numeric(df['price_min'], errors='coerce').fillna(0)
            
            affordable_mask = df['price_min'] <= (avg_max_budget * 1.2)
            df.loc[affordable_mask, 'similarity'] += 0.1

            # Sort and Top 10
            recommended = df.sort_values(by='similarity', ascending=False).head(10)

            # 3. Send Response (JSON)
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            # Convert DataFrame to Dictionary
            result = recommended.to_dict(orient='records')
            self.wfile.write(json.dumps(result).encode())

        except Exception as e:
            # Error Handling
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())