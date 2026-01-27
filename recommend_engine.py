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
        input_data = json.loads(sys.stdin.read())
    except Exception as e:
        print(json.dumps({"error": "Invalid input data"}))
        return

    users = input_data.get('users', [])
    destinations = input_data.get('destinations', [])

    if not users or not destinations:
        print(json.dumps([]))
        return

    # ==========================================
    # A. BUILD GROUP PROFILE
    # ==========================================
    # 1. Calculate Group Budget Range (Average of all members)
    avg_min_budget = np.mean([u.get('budget_min', 0) for u in users])
    avg_max_budget = np.mean([u.get('budget_max', 1000) for u in users])

    # 2. Aggregated Preferences (Bag of Words)
    # We combine every member's liked activities and types into one big string
    group_tags = []
    for u in users:
        # safely handle list or string inputs
        acts = u.get('preferred_activities', [])
        if isinstance(acts, str): acts = json.loads(acts) if '[' in acts else acts.split(',')
        
        types = u.get('preferred_types', [])
        if isinstance(types, str): types = json.loads(types) if '[' in types else types.split(',')
        
        group_tags.extend(acts)
        group_tags.extend(types)
    
    group_profile_str = " ".join(group_tags).lower()

    # ==========================================
    # B. PREPARE DESTINATION DATA
    # ==========================================
    df_dest = pd.DataFrame(destinations)
    
    # Create a "tags" column for destinations (Type + State + Description/Activities if available)
    # Adjust column names based on your actual DB columns
    df_dest['tags'] = df_dest['type'].fillna('') + " " + df_dest['state'].fillna('') + " " + df_dest['name'].fillna('')
    df_dest['tags'] = df_dest['tags'].str.lower()

    # ==========================================
    # C. MACHINE LEARNING (Cosine Similarity)
    # ==========================================
    # Vectorize text data (convert words to numbers)
    vectorizer = CountVectorizer()
    
    # Fit on all possible text (Group + Destinations)
    all_text = [group_profile_str] + df_dest['tags'].tolist()
    matrix = vectorizer.fit_transform(all_text)
    
    # Calculate Similarity: Index 0 is Group, 1...N are destinations
    cosine_sim = cosine_similarity(matrix[0:1], matrix[1:])
    
    # Add similarity score to DataFrame
    df_dest['similarity'] = cosine_sim[0]

    # ==========================================
    # D. FILTERING & RANKING
    # ==========================================
    # 1. Budget Filter (Soft filter: Boost score if in range, penalize if out)
    # Simple logic: If dest_price is within group_avg_budget +/- buffer, keep it.
    # Here we just rank by similarity, but you can hard filter:
    # df_dest = df_dest[df_dest['price_min'] <= avg_max_budget]

    # 2. Sort by Similarity Score (Highest first)
    recommended = df_dest.sort_values(by='similarity', ascending=False)

    # Return top 10 as JSON
    print(recommended.head(10).to_json(orient='records'))

if __name__ == "__main__":
    get_recommendations()