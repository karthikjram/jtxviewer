import requests
import json
from datetime import datetime, timezone
import pytz

def send_call_transcript(transcript, caller_name, caller_phone):
    # API endpoint
    url = 'http://localhost:3000/webhook'
    
    # Get current time in IST
    ist = pytz.timezone('Asia/Kolkata')
    current_time = datetime.now(ist).isoformat()
    
    # Prepare the payload
    payload = {
        "id": f"call_{int(datetime.now().timestamp())}",  # Generate unique ID using timestamp
        "timestamp": current_time,
        "transcript": transcript,
        "caller": {
            "name": caller_name,
            "phone": caller_phone
        }
    }
    
    # Set headers
    headers = {
        'Content-Type': 'application/json'
    }
    
    try:
        # Send POST request
        response = requests.post(url, json=payload, headers=headers)
        
        # Check if request was successful
        if response.status_code == 200:
            print("Call transcript sent successfully!")
            print("Response:", response.json())
        else:
            print(f"Error: Server returned status code {response.status_code}")
            print("Response:", response.text)
            
    except requests.exceptions.RequestException as e:
        print(f"Error sending request: {e}")

# Example usage
if __name__ == "__main__":
    # Example call transcript
    transcript = """Hi, I'm calling about the new JioFiber Gaming Plus plan. 
    I've been experiencing some latency issues while playing online games. 
    My connection speed is good but the ping seems high."""
    
    caller_name = "Arjun Kumar"
    caller_phone = "+91-9876543210"
    
    send_call_transcript(transcript, caller_name, caller_phone)
