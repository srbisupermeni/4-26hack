/**
 * Settings Page for user preferences.
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Save, User, Heart, Mic, Globe } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const NBA_TEAMS = [
  'LAL', 'GSW', 'BOS', 'MIA', 'CHI', 'NYK', 'BKN', 'PHI',
  'MIL', 'PHX', 'DEN', 'DAL', 'LAC', 'MEM', 'NOP', 'SAC',
  'ATL', 'CLE', 'TOR', 'IND', 'WAS', 'ORL', 'DET', 'CHA',
  'MIN', 'OKC', 'POR', 'UTA', 'SAS', 'HOU'
];

const PERSONAS = [
  { id: 'analyst', name: '分析师', desc: '冷静理性的战术分析' },
  { id: 'trash_talker', name: '垃圾话之王', desc: '毒舌嘲讽风格' },
  { id: 'emotional', name: '铁杆球迷', desc: '激情澎湃的死忠粉' },
];

export function SettingsPage() {
  const { user, preferences, updateProfile, updatePreferences } = useAuth();

  const [nickname, setNickname] = useState(user?.nickname || '');
  const [favoriteTeams, setFavoriteTeams] = useState<string[]>(preferences?.favorite_teams || []);
  const [favoritePlayers, setFavoritePlayers] = useState(preferences?.favorite_players?.join(', ') || '');
  const [preferredPersona, setPreferredPersona] = useState(preferences?.preferred_persona || 'analyst');
  const [ttsEnabled, setTtsEnabled] = useState(preferences?.tts_enabled ?? true);
  const [language, setLanguage] = useState(preferences?.language || 'zh');

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  useEffect(() => {
    if (user) setNickname(user.nickname || '');
    if (preferences) {
      setFavoriteTeams(preferences.favorite_teams || []);
      setFavoritePlayers(preferences.favorite_players?.join(', ') || '');
      setPreferredPersona(preferences.preferred_persona || 'analyst');
      setTtsEnabled(preferences.tts_enabled ?? true);
      setLanguage(preferences.language || 'zh');
    }
  }, [user, preferences]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage('');

    try {
      // Update profile
      await updateProfile({ nickname });

      // Update preferences
      const playersArray = favoritePlayers
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);

      await updatePreferences({
        favorite_teams: favoriteTeams,
        favorite_players: playersArray,
        preferred_persona: preferredPersona,
        tts_enabled: ttsEnabled,
        language,
      });

      setSaveMessage('保存成功！');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (err: any) {
      setSaveMessage('保存失败: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleTeam = (team: string) => {
    setFavoriteTeams(prev =>
      prev.includes(team) ? prev.filter(t => t !== team) : [...prev, team]
    );
  };

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-orange-500/5 via-transparent to-purple-500/5 pointer-events-none" />

      <div className="relative max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            to="/app"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            返回应用
          </Link>
          <h1 className="text-3xl font-bold text-white">设置</h1>
          <p className="text-gray-400 mt-2">个性化你的观赛体验</p>
        </div>

        <div className="space-y-6">
          {/* Profile section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-gray-800 p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <User className="w-5 h-5 text-orange-400" />
              <h2 className="text-lg font-semibold text-white">个人信息</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">邮箱</label>
                <input
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl text-gray-500 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">昵称</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="输入你的昵称"
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
                />
              </div>
            </div>
          </motion.div>

          {/* Favorite teams section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-gray-800 p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <Heart className="w-5 h-5 text-orange-400" />
              <h2 className="text-lg font-semibold text-white">喜欢的球队</h2>
            </div>

            <div className="flex flex-wrap gap-2">
              {NBA_TEAMS.map(team => (
                <button
                  key={team}
                  onClick={() => toggleTeam(team)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    favoriteTeams.includes(team)
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  {team}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Favorite players section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-gray-800 p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <User className="w-5 h-5 text-orange-400" />
              <h2 className="text-lg font-semibold text-white">喜欢的球员</h2>
            </div>

            <div>
              <input
                type="text"
                value={favoritePlayers}
                onChange={(e) => setFavoritePlayers(e.target.value)}
                placeholder="用逗号分隔，例如: LeBron, Curry, Durant"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
              />
              <p className="mt-2 text-xs text-gray-500">输入多个球员名字，用逗号分隔</p>
            </div>
          </motion.div>

          {/* Persona section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-gray-800 p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <Mic className="w-5 h-5 text-orange-400" />
              <h2 className="text-lg font-semibold text-white">AI 人设</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {PERSONAS.map(persona => (
                <button
                  key={persona.id}
                  onClick={() => setPreferredPersona(persona.id)}
                  className={`p-4 rounded-xl text-left transition-colors ${
                    preferredPersona === persona.id
                      ? 'bg-orange-500/20 border-2 border-orange-500'
                      : 'bg-gray-800 border-2 border-transparent hover:border-gray-700'
                  }`}
                >
                  <div className="font-medium text-white">{persona.name}</div>
                  <div className="text-sm text-gray-400 mt-1">{persona.desc}</div>
                </button>
              ))}
            </div>
          </motion.div>

          {/* Other settings */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-gray-800 p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <Globe className="w-5 h-5 text-orange-400" />
              <h2 className="text-lg font-semibold text-white">其他设置</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-white">语音播报</div>
                  <div className="text-xs text-gray-400">AI 回复自动转为语音</div>
                </div>
                <button
                  onClick={() => setTtsEnabled(!ttsEnabled)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    ttsEnabled ? 'bg-orange-500' : 'bg-gray-700'
                  }`}
                >
                  <div
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      ttsEnabled ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">语言</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-colors"
                >
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>
          </motion.div>

          {/* Save button */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50 text-white font-semibold rounded-xl transition-colors flex items-center gap-2"
            >
              {isSaving ? (
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white" />
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  保存设置
                </>
              )}
            </button>

            {saveMessage && (
              <span className={`text-sm ${saveMessage.includes('成功') ? 'text-green-400' : 'text-red-400'}`}>
                {saveMessage}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
