import os
from dotenv import load_dotenv
load_dotenv()
from openai import OpenAI

try:
    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": "Hello"}],
        stream=True,
    )
    for c in response:
        if c.choices[0].delta.content:
            print(c.choices[0].delta.content, end="")
except Exception as e:
    print("Error:", e)
