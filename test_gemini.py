import os
from google import genai
try:
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents="Hello",
    )
    print("gemini-2.0-flash works:", response.text)
except Exception as e:
    print("Failed gemini-2.0-flash:", e)

try:
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents="Hello",
    )
    print("gemini-2.5-flash works:", response.text)
except Exception as e:
    print("Failed gemini-2.5-flash:", e)

try:
    response = client.models.generate_content(
        model="gemini-1.5-flash-latest",
        contents="Hello",
    )
    print("gemini-1.5-flash-latest works:", response.text)
except Exception as e:
    print("Failed gemini-1.5-flash-latest:", e)
