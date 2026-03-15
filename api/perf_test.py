import time
import json
from recommend import RecommendationEngine

def measure_performance():
    engine = RecommendationEngine()
    
    # Simulate a realistic dataset
    users = [
        {
            "budget_max": 1000,
            "preferred_activities": "Hiking, Swimming, Nature",
            "preferred_types": "Outdoor, Adventure"
        } for _ in range(5) # 5 users in a group
    ]
    
    # 50 destinations to score
    destinations = [
        {
            "name": f"Destination {i}",
            "type": "Outdoor" if i % 2 == 0 else "Indoor",
            "tags": "Nature, Hiking, Forest" if i % 2 == 0 else "Shopping, Museum",
            "price_min": 100 + (i * 10)
        } for i in range(50)
    ]
    
    print(f"--- Performance Test: Recommendation Engine ---")
    print(f"Input size: {len(users)} users, {len(destinations)} destinations")
    
    # Measure execution time
    start_time = time.perf_counter()
    results = engine.get_recommendations(users, destinations)
    end_time = time.perf_counter()
    
    duration_ms = (end_time - start_time) * 1000
    
    print(f"Execution Time: {duration_ms:.2f} ms")
    print(f"Results Count: {len(results)}")
    
    # Success Criteria: Response time < 200ms
    status = "SUCCESS" if duration_ms < 200 else "FAIL"
    print(f"Status (Target < 200ms): {status}")
    
    return duration_ms, status

if __name__ == "__main__":
    measure_performance()
