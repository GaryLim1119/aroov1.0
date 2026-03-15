import time
import json
import random
import math
from recommend import RecommendationEngine

def generate_mock_data(num_users, num_destinations, tags_per_user=5):
    all_possible_tags = ["nature", "city", "relax", "scenic", "food", "adventure", "museum", "hiking", "beach", "urban", "nightlife", "history"]
    
    users = []
    for i in range(num_users):
        user_tags = random.sample(all_possible_tags, min(tags_per_user, len(all_possible_tags)))
        users.append({
            "budget_max": random.randint(200, 5000),
            "preferred_activities": ", ".join(user_tags[:len(user_tags)//2]),
            "preferred_types": ", ".join(user_tags[len(user_tags)//2:])
        })
    
    destinations = []
    for i in range(num_destinations):
        dest_tags = random.sample(all_possible_tags, 3)
        destinations.append({
            "name": f"Dest_{i}",
            "type": random.choice(all_possible_tags),
            "tags": ", ".join(dest_tags),
            "price_min": random.randint(100, 4000)
        })
    
    return users, destinations

def run_scalability_test():
    engine = RecommendationEngine()
    test_cases = [
        (10, 50),   # Standard Group
        (50, 100),  # Large Group
        (100, 200), # Exteme Case (100 Users)
    ]
    
    print(f"{'Users':<10} | {'Dests':<10} | {'Time (ms)':<10} | {'Status'}")
    print("-" * 50)
    
    for num_users, num_dests in test_cases:
        users, destinations = generate_mock_data(num_users, num_dests)
        
        start = time.perf_counter()
        engine.get_recommendations(users, destinations)
        end = time.perf_counter()
        
        duration = (end - start) * 1000
        status = "PASS" if duration < 500 else "SLOW" # Scalability threshold 500ms for 100 users
        
        print(f"{num_users:<10} | {num_dests:<10} | {duration:<10.2f} | {status}")

def test_accuracy():
    """
    Accuracy is defined as 'Relevance Precision'. 
    If we create a destination that PERFECTLY matches user interests and budget, 
    it MUST be in the #1 spot.
    """
    engine = RecommendationEngine()
    
    # 1. Setup a group with specific interests
    users = [
        {"budget_max": 1000, "preferred_activities": "Nature, Hiking", "preferred_types": "Quiet"}
    ]
    
    # 2. Setup destinations: 1 perfect match, many decoys
    perfect_match = {
        "name": "Perfect Nature Getaway",
        "type": "Quiet",
        "tags": "Nature, Hiking",
        "price_min": 500
    }
    
    decoys = [
        {"name": f"Decoy_{i}", "type": "City", "tags": "Shopping, Party", "price_min": 2000}
        for i in range(19)
    ]
    
    destinations = decoys + [perfect_match]
    random.shuffle(destinations)
    
    print("\n--- Accuracy Test (Target: 100% Relevance) ---")
    results = engine.get_recommendations(users, destinations)
    
    top_result = results[0]
    accuracy_score = 0
    
    if top_result['name'] == "Perfect Nature Getaway":
        accuracy_score = 100
        print("Result: SUCCESS - Perfect match found at #1 position.")
    else:
        # Find where it is
        rank = -1
        for i, r in enumerate(results):
            if r['name'] == "Perfect Nature Getaway":
                rank = i + 1
                break
        accuracy_score = max(0, 100 - (rank * 10)) if rank > 0 else 0
        print(f"Result: FAIL - Perfect match found at #{rank}.")

    print(f"Accuracy Score: {accuracy_score}%")

if __name__ == "__main__":
    run_scalability_test()
    test_accuracy()
