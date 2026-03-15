import json
import pytest
from recommend import RecommendationEngine

def test_clean_list():
    engine = RecommendationEngine()
    assert engine.clean_list('["Nature", "City"]') == ["nature", "city"]
    assert engine.clean_list("'Nature', 'City'") == ["nature", "city"]
    assert engine.clean_list(None) == []
    assert engine.clean_list("") == []

def test_recommendation_logic():
    engine = RecommendationEngine()
    
    users = [
        {
            "budget_max": 500,
            "preferred_activities": "Nature, Hiking",
            "preferred_types": "Outdoor"
        }
    ]
    
    destinations = [
        {
            "name": "Nature Spot",
            "type": "Outdoor",
            "tags": "Nature, Hiking",
            "price_min": 200
        },
        {
            "name": "City Mall",
            "type": "Indoor",
            "tags": "Shopping",
            "price_min": 100
        }
    ]
    
    results = engine.get_recommendations(users, destinations)
    
    assert len(results) > 0
    # The "Nature Spot" should be the top result due to tag matching and price
    assert results[0]['name'] == "Nature Spot"
    assert 'similarity' in results[0]
    assert results[0]['similarity'] > 0

def test_budget_fallback():
    engine = RecommendationEngine()
    users = [{"budget_max": ""}] # Invalid budget
    destinations = [{"name": "Expensve Place", "price_min": 10000}]
    
    # Logic should fallback to 5000.0 average
    results = engine.get_recommendations(users, destinations)
    assert len(results) == 1
    # price_similarity = 5000 / 10000 = 0.5
    # tag_similarity = 0 (no interest match)
    # final_score = 0*0.55 + 0.5*0.45 = 0.225
    assert results[0]['similarity'] == pytest.approx(0.225)
