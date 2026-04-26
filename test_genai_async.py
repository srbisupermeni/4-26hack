import asyncio
import os
from google import genai
from google.genai import types

async def main():
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
    
    # Try text streaming
    print("Testing text stream...")
    # NOTE: aio is used for async client
    response_stream = await client.aio.models.generate_content_stream(
        model="gemini-2.5-flash",
        contents="Hello! Give me a long response."
    )
    async for chunk in response_stream:
        print(chunk.text, end="")
    print("\nDone")

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(main())
