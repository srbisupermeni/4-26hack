import os
from dotenv import load_dotenv
load_dotenv()
from google import genai

try:
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
    for m in client.models.list():
        if "gemini" in m.name:
            print(m.name)
except Exception as e:
    print("Error:", e)
