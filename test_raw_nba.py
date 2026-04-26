import requests
import json

headers = {
    'Host': 'stats.nba.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/114.0',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.5',
    'Origin': 'https://www.nba.com',
    'Referer': 'https://www.nba.com/',
    'Connection': 'keep-alive',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
}

url = "https://stats.nba.com/stats/playbyplayv2?EndPeriod=10&EndRange=55800&GameID=0042300405&RangeType=2&StartPeriod=1&StartRange=0"

try:
    r = requests.get(url, headers=headers, timeout=10)
    data = r.json()
    if 'resultSets' in data:
        plays = data['resultSets'][0]['rowSet']
        print(f"RAW SUCCESS! Found {len(plays)} plays.")
        for p in plays[:5]:
            print(f"Q{p[4]} | {p[6]} | {p[7]}")
    else:
        print("Keys present:", data.keys())
except Exception as e:
    print("Raw Request Failed:", repr(e))
