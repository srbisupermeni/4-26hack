import asyncio
import websockets
import json

async def test_ws():
    try:
        async with websockets.connect('ws://localhost:8000/api/ws/nba') as ws:
            for _ in range(3):
                data = await ws.recv()
                print('Received:', json.loads(data)['lastPlay'])
    except Exception as e:
        print('Error:', e)
asyncio.run(test_ws())
