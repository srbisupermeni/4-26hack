from nba_api.stats.endpoints import playbyplayv2
import time
import json

# Game 5 of 2024 NBA Finals: Celtics vs Mavericks
game_id_finals = "0042300405"
print(f"Fetching game ID: {game_id_finals}")

try:
    pbp = playbyplayv2.PlayByPlayV2(game_id=game_id_finals)
    data = pbp.get_dict()
    # Check if 'resultSets' or 'resultSet' exists
    if 'resultSets' in data:
        plays = data['resultSets'][0]['rowSet']
        print(f"Success via resultSets! Found {len(plays)} plays.")
        for p in plays[:5]:
            print(f"Q{p[4]} | {p[6]} | {p[7]}")
            
except Exception as e:
    print("Failed playbyplayv2:", repr(e))

    # Let's try playbyplay instead of v2
    from nba_api.stats.endpoints import playbyplay
    try:
        pbp1 = playbyplay.PlayByPlay(game_id=game_id_finals)
        data1 = pbp1.get_dict()
        if 'resultSets' in data1:
            plays1 = data1['resultSets'][0]['rowSet']
            print(f"Success via playbyplay v1! Found {len(plays1)} plays.")
            for p in plays1[:5]:
                print(f"Q{p[4]} | {p[6]} | {p[7]}")
    except Exception as e2:
        print("Failed playbyplay v1:", repr(e2))
