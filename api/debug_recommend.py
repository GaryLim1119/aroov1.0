import json
from recommend import handler

def test_manual():
    print("Starting manual test...")
    try:
        h = handler(None, ('127.0.0.1', 8080), None)
        print("Handler initialized.")
        
        result = h._clean_list('["Nature", "City"]')
        print(f"Clean list result: {result}")
        assert result == ["nature", "city"]
        
        print("Manual test PASSED.")
    except Exception as e:
        print(f"Manual test FAILED: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_manual()
