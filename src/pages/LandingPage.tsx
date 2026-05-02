/**
 * Landing Page - Product introduction and showcase.
 */

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Zap,
  MessageSquare,
  Volume2,
  Video,
  BarChart3,
  Globe,
  ChevronRight,
  Play,
  ArrowRight,
  Brain,
  Users,
  Sparkles,
  Monitor,
  Headphones,
  Bot
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const FEATURES = [
  {
    icon: Brain,
    title: 'AI 实时陪伴',
    description: '像身边懂球的朋友一样，实时提供反应、洞察和场景化解说',
    color: 'from-orange-500 to-red-500',
  },
  {
    icon: MessageSquare,
    title: '智能对话',
    description: '支持多种 AI 人设，从专业分析师到毒舌垃圾话王',
    color: 'from-purple-500 to-pink-500',
  },
  {
    icon: Volume2,
    title: '语音互动',
    description: '语音输入 + 语音播报，真正的实时语音对话体验',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: Video,
    title: '视觉分析',
    description: 'AI 实时分析比赛画面，捕捉精彩瞬间并生成评论',
    color: 'from-green-500 to-emerald-500',
  },
  {
    icon: Monitor,
    title: '零延迟体验',
    description: '双播放器架构，AI 提前准备话术，用户感知即时反应',
    color: 'from-yellow-500 to-orange-500',
  },
  {
    icon: Bot,
    title: '3D 数字人',
    description: '可选的 3D 数字人形象，支持口型同步和表情驱动',
    color: 'from-indigo-500 to-purple-500',
  },
];

const SPORTS = [
  { name: 'NBA', emoji: '🏀', desc: '实时比赛数据 + AI 解说' },
  { name: 'CS2', emoji: '🎮', desc: '电竞赛事实时分析' },
  { name: 'LOL', emoji: '⚔️', desc: '英雄联盟比赛陪伴' },
];

const HOW_IT_WORKS = [
  {
    step: 1,
    title: '选择赛事',
    description: '支持 NBA 实时比赛、CS2、LOL 等多种体育和电竞赛事',
    icon: Globe,
  },
  {
    step: 2,
    title: 'AI 陪伴启动',
    description: 'AI 自动分析比赛数据和画面，实时生成专业解说',
    icon: Sparkles,
  },
  {
    step: 3,
    title: '互动体验',
    description: '与 AI 对话、提问、吐槽，享受沉浸式观赛体验',
    icon: Headphones,
  },
];

export function LandingPage() {
  const { isAuthenticated } = useAuth();
  const [activeFeature, setActiveFeature] = useState(0);

  return (
    <div className="min-h-screen bg-gray-950 text-white overflow-hidden">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950/80 backdrop-blur-xl border-b border-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold">VStandby</span>
            </div>

            <div className="flex items-center gap-4">
              {isAuthenticated ? (
                <Link
                  to="/app"
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-xl transition-colors"
                >
                  进入应用
                </Link>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="px-4 py-2 text-gray-300 hover:text-white font-medium transition-colors"
                  >
                    登录
                  </Link>
                  <Link
                    to="/register"
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-medium rounded-xl transition-colors"
                  >
                    免费注册
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4">
        {/* Background effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500/10 border border-orange-500/20 rounded-full text-orange-400 text-sm mb-8">
              <Sparkles className="w-4 h-4" />
              AI 驱动的观赛新体验
            </div>

            <h1 className="text-5xl sm:text-7xl font-bold mb-6 leading-tight">
              <span className="bg-gradient-to-r from-orange-400 via-red-400 to-purple-400 bg-clip-text text-transparent">
                AI 实时观赛伴侣
              </span>
            </h1>

            <p className="text-xl sm:text-2xl text-gray-400 mb-10 max-w-3xl mx-auto">
              让一个人的观赛不再孤单。<br />
              VStandby 像身边懂球的朋友，陪你一起看、一起聊、一起嗨。
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to={isAuthenticated ? '/app' : '/register'}
                className="px-8 py-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-semibold rounded-2xl transition-all transform hover:scale-105 flex items-center gap-2 text-lg"
              >
                开始体验
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a
                href="#features"
                className="px-8 py-4 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-2xl transition-colors flex items-center gap-2 text-lg"
              >
                了解更多
                <ChevronRight className="w-5 h-5" />
              </a>
            </div>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="mt-20 grid grid-cols-3 gap-8 max-w-2xl mx-auto"
          >
            {[
              { value: '3+', label: '支持赛事' },
              { value: '3', label: 'AI 人设' },
              { value: '24/7', label: '实时陪伴' },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl sm:text-4xl font-bold text-orange-400">{stat.value}</div>
                <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Sports Section */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">支持多种赛事</h2>
            <p className="text-gray-400 text-lg">体育和电竞，全覆盖</p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {SPORTS.map((sport, i) => (
              <motion.div
                key={sport.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-gray-800 p-8 text-center hover:border-orange-500/50 transition-colors"
              >
                <div className="text-5xl mb-4">{sport.emoji}</div>
                <h3 className="text-2xl font-bold mb-2">{sport.name}</h3>
                <p className="text-gray-400">{sport.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">核心功能</h2>
            <p className="text-gray-400 text-lg">打造沉浸式 AI 观赛体验</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                onHoverStart={() => setActiveFeature(i)}
                className={`relative bg-gray-900/80 backdrop-blur-xl rounded-2xl border p-6 transition-all cursor-default ${
                  activeFeature === i
                    ? 'border-orange-500/50 shadow-lg shadow-orange-500/10'
                    : 'border-gray-800 hover:border-gray-700'
                }`}
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4`}>
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-gray-400">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 bg-gray-900/50">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">如何使用</h2>
            <p className="text-gray-400 text-lg">三步开启 AI 观赛之旅</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {HOW_IT_WORKS.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.2 }}
                className="relative text-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center mx-auto mb-6">
                  <step.icon className="w-8 h-8 text-white" />
                </div>
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-sm">
                  {step.step}
                </div>
                <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                <p className="text-gray-400">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">
              准备好开启 AI 观赛之旅了吗？
            </h2>
            <p className="text-gray-400 text-lg mb-8">
              加入 VStandby，让每一场比赛都不再孤单
            </p>
            <Link
              to={isAuthenticated ? '/app' : '/register'}
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white font-semibold rounded-2xl transition-all transform hover:scale-105 text-lg"
            >
              免费开始
              <ArrowRight className="w-5 h-5" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-gray-800">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold">VStandby</span>
          </div>
          <p className="text-sm text-gray-500">
            © 2026 VStandby. AI 驱动的实时观赛伴侣。
          </p>
        </div>
      </footer>
    </div>
  );
}
