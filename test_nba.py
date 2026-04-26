from nba_api.stats.endpoints import leaguegamefinder
import sys

def test():
    try:
        # Fetch last 5 games
        game_finder = leaguegamefinder.LeagueGameFinder()
        games = game_finder.get_data_frames()[0]
        # Most recent game will be at top, check games.head()
        print(games.head(5)[['GAME_ID', 'MATCHUP', 'GAME_DATE']])
    except Exception as e:
        print("Error:", e)

test()
