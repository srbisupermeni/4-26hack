from nba_api.stats.endpoints import scoreboardv2, playbyplayv2
import datetime

date_str = (datetime.datetime.now() - datetime.timedelta(days=2)).strftime('%Y-%m-%d')
print("Fetching games for:", date_str)
board = scoreboardv2.ScoreboardV2(game_date=date_str)
games = board.game_header.get_dict()['data']
if not games:
    print("No games found on that date.")
else:
    game_id = games[0][2]
    matchup = f"{games[0][5]} @ {games[0][6]}"
    print(f"Testing Game ID {game_id} ({matchup})")
    
    pbp = playbyplayv2.PlayByPlayV2(game_id=game_id)
    plays = pbp.play_by_play.get_dict()['data']
    print(f"Total plays: {len(plays)}")
    if len(plays) > 0:
        # Example of top 5
        for p in plays[:5]:
            print(f"Q{p[4]} {p[6]} - {p[7]} | {p[10]} | {p[11]} | {p[9]}")
