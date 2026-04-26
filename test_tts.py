import asyncio
import os
from dotenv import load_dotenv
load_dotenv()
from openai import AsyncOpenAI

async def main():
    client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
    response = await client.audio.speech.create(model="tts-1", voice="nova", input="Testing tts.")
    try:
        data = response.content
        print("Success using .content, length:", len(data))
    except Exception as e:
        print("Failed .content:", e)
        try:
            data = response.read()
            print("Success using .read(), length:", len(data))
        except Exception as e2:
            print("Failed .read():", e2)

asyncio.run(main())
