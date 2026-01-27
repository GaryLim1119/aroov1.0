# recommend_engine.py
import sys
import json
import pandas as pd
import numpy as np
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.metrics.pairwise import cosine_similarity

def get_recommendations():
    # 1. Read data from Node.js (passed via stdin)
    try:
        # Read input from stdin
        input_str = sys.stdin.read()
        if not input_str.strip():
            print(json.dumps([]))
            return
        input_data = json.loads(input_str)
    except Exception as e:
        # Output error as JSON so Node can parse it safely
        print(json.dumps({"error": "Invalid input data", "details": str(e)}))
        return

    users = input_data.get('users', [])
    destinations = input_data.get('destinations', [])

    if not users or not destinations:
        print(json.dumps([]))
        return

    # ==========================================
    # A. BUILD GROUP PROFILE (SAFE MODE)
    # ==========================================
    
    # 1. Calculate Group Budget Range
    # Filter out users who have NULL budgets (None)
    valid_min_budgets = [u.get('budget_min') for u in users if u.get('budget_min') is not None]
    valid_max_budgets = [u.get('budget_max') for u in users if u.get('budget_max') is not None]

    # If NO ONE has set a budget, use default defaults (0 - 5000)
    avg_min_budget = np.mean(valid_min_budgets) if valid_min_budgets else 0
    avg_max_budget = np.mean(valid_max_budgets) if valid_max_budgets else 5000

    # 2. Aggregated Preferences (Bag of Words)
    group_tags = []
    
    for u in users:
        # HANDLE NULLS: Check if None, otherwise default to empty list
        acts = u.get('preferred_activities')
        types = u.get('preferred_types')

        if acts is None: acts = []
        if types is None: types = []

        # Parse Strings (if DB sends "[...]" or "a,b,c")
        if isinstance(acts, str):
            acts = acts.strip()
            if acts.startswith('['):
                try: acts = json.loads(acts)
                except: acts = []
            elif ',' in acts:
                acts = acts.split(',')
            elif acts: # Single word string
                acts = [acts]
            else:
                acts = []

        if isinstance(types, str):
            types = types.strip()
            if types.startswith('['):
                try: types = json.loads(types)
                except: types = []
            elif ',' in types:
                types = types.split(',')
            elif types:
                types = [types]
            else:
                types = []
        
        # Clean up whitespace and add to group tags
        if isinstance(acts, list): group_tags.extend([str(x).strip() for x in acts])
        if isinstance(types, list): group_tags.extend([str(x).strip() for x in types])
    
    # Create profile string
    group_profile_str = " ".join(group_tags).lower()

    # SAFETY: If group has ZERO preferences (new users), give a generic tag
    # so the vectorizer doesn't crash on empty input.
    if not group_profile_str.strip():
        group_profile_str = "nature city beach adventure relax" 

    # ==========================================
    # B. PREPARE DESTINATION DATA
    # ==========================================
    df_dest = pd.DataFrame(destinations)
    
    # Safely handle missing columns
    type_col = df_dest['type'] if 'type' in df_dest.columns else pd.Series([''] * len(df_dest))
    state_col = df_dest['state'] if 'state' in df_dest.columns else pd.Series([''] * len(df_dest))
    name_col = df_dest['name'] if 'name' in df_dest.columns else pd.Series([''] * len(df_dest))

    # Create tags column
    df_dest['tags'] = type_col.fillna('') + " " + state_col.fillna('') + " " + name_col.fillna('')
    df_dest['tags'] = df_dest['tags'].str.lower()

    # ==========================================
    # C. MACHINE LEARNING (Cosine Similarity)
    # ==========================================
    try:
        vectorizer = CountVectorizer()
        
        # Fit on all possible text (Group + Destinations)
        all_text = [group_profile_str] + df_dest['tags'].tolist()
        matrix = vectorizer.fit_transform(all_text)
        
        # Calculate Similarity
        cosine_sim = cosine_similarity(matrix[0:1], matrix[1:])
        df_dest['similarity'] = cosine_sim[0]

    except ValueError:
        # Fallback if vectorizer fails (e.g. empty vocabulary)
        df_dest['similarity'] = 0

    # ==========================================
    # D. FILTERING & RANKING
    # ==========================================
    
    # OPTIONAL: Soft Budget Boost
    # If the destination price is within the group's average budget, give a small bonus (+0.1)
    if 'price_min' in df_dest.columns:
        # Handle NaN prices
        df_dest['price_min'] = df_dest['price_min'].fillna(0)
        
        # Define logic: Is it affordable?
        # Affordable if dest_price <= avg_max_budget (plus a little buffer)
        affordable_mask = df_dest['price_min'] <= (avg_max_budget * 1.2)
        
        # Boost score
        df_dest.loc[affordable_mask, 'similarity'] += 0.1

    # Sort by Similarity Score (Highest first)
    recommended = df_dest.sort_values(by='similarity', ascending=False)

    # Return top 10 as JSON
    print(recommended.head(10).to_json(orient='records'))

if __name__ == "__main__":
    get_recommendations()