import { useEffect, useState } from "react";
import {
  PlayCircle,
  Users,
  Mail,
  TrendingUp,
  Globe2,
  Activity,
  Clock,
  Target,
  MapPin,
  Filter,
  Sparkles,
  BarChart3,
  Zap,
  RefreshCw,
  ChevronRight,
  Pause,
  Play,
  Trash2,
  Plus,
  XCircle,
  CheckCircle,
  AlertCircle,
  Loader2,
  Monitor,
  Gauge,
  RotateCcw
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "https://api.heekentertainment.com";

// Queue Card Component
const QueueCard = ({ item, onPause, onResume, onDelete }) => {
  const getStatusIcon = () => {
    switch(item.status) {
      case 'running':
        return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'paused':
        return <Pause className="w-4 h-4 text-yellow-400" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusColor = () => {
    switch(item.status) {
      case 'running': return 'border-blue-500/50 bg-blue-500/5';
      case 'completed': return 'border-green-500/50 bg-green-500/5';
      case 'paused': return 'border-yellow-500/50 bg-yellow-500/5';
      case 'failed': return 'border-red-500/50 bg-red-500/5';
      default: return 'border-slate-700 bg-slate-800/50';
    }
  };

  const progress = item.progress?.collected ? 
    Math.round((item.progress.collected / item.targetCount) * 100) : 0;

  return (
    <div className={`relative border rounded-xl p-4 transition-all duration-300 hover:scale-[1.02] ${getStatusColor()}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <h3 className="font-semibold text-white">{item.keyword}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            (item.source || '').includes('youtube') ? 'bg-red-500/20 text-red-300' :
            (item.source || '').includes('linkedin') ? 'bg-blue-500/20 text-blue-300' :
            (item.source || '').includes('instagram') ? 'bg-pink-500/20 text-pink-300' :
            (item.source || '').includes('x') ? 'bg-slate-600/50 text-slate-300' :
            'bg-slate-700 text-slate-300'
          }`}>
            {item.source || 'youtube-api'}
          </span>
          {item.retryCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 flex items-center gap-0.5">
              <RotateCcw className="w-3 h-3" /> {item.retryCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {item.status === 'running' && (
            <button 
              onClick={() => onPause(item._id)}
              className="p-1.5 hover:bg-yellow-500/20 rounded-lg transition-colors"
              title="Pause"
            >
              <Pause className="w-4 h-4 text-yellow-400" />
            </button>
          )}
          {item.status === 'paused' && (
            <button 
              onClick={() => onResume(item._id)}
              className="p-1.5 hover:bg-green-500/20 rounded-lg transition-colors"
              title="Resume"
            >
              <Play className="w-4 h-4 text-green-400" />
            </button>
          )}
          <button 
            onClick={() => onDelete(item._id)}
            className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-slate-400">
          <span>Progress:</span>
          <span className="text-white font-medium">
            {item.progress?.collected || 0}/{item.targetCount}
          </span>
        </div>
        
        {/* Progress Bar */}
        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
          <div className="bg-slate-800/50 rounded-lg p-2">
            <p className="text-slate-500">Country</p>
            <p className="text-white font-medium">{item.country || 'IN'}</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-2">
            <p className="text-slate-500">Min Subs</p>
            <p className="text-white font-medium">{(item.minSubs || 0).toLocaleString()}</p>
          </div>
        </div>

        {item.stats?.channelsFound > 0 && (
          <div className="flex gap-3 mt-2 text-xs border-t border-slate-700 pt-2">
            <span className="text-slate-400">
              📊 {item.stats.channelsFound} channels
            </span>
            <span className="text-slate-400">
              ✉️ {item.stats.emailsFound} emails
            </span>
          </div>
        )}
      </div>

      {item.status === 'running' && (
        <div className="absolute -top-1 -right-1">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
        </div>
      )}
    </div>
  );
};

export default function Dashboard() {
  const [stats, setStats] = useState({});
  const [logs, setLogs] = useState([]);
  const [queue, setQueue] = useState([]);
  const [keywordStats, setKeywordStats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [scraperRunning, setScraperRunning] = useState(false);
  const [workerStatus, setWorkerStatus] = useState({ activeWorkers: 0, maxWorkers: 5, workers: [] });
  const [browserStatus, setBrowserStatus] = useState({ total: 0, inUse: 0, available: 0 });
  const [speed, setSpeed] = useState({ perHour: 0 });

  const [keywords, setKeywords] = useState("");
  const [country, setCountry] = useState("IN");
  const [minSubs, setMinSubs] = useState(0);
  const [target, setTarget] = useState(1000);
  const [selectedSources, setSelectedSources] = useState(["youtube-api"]);

  // Fetch all data
  const fetchAllData = async () => {
    try {
      // Fetch stats
      const statsRes = await fetch(API + "/stats");
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      // Fetch logs
      const logsRes = await fetch(API + "/logs");
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setLogs(logsData);
      }

      // Fetch queue
      const queueRes = await fetch(API + "/queue");
      if (queueRes.ok) {
        const queueData = await queueRes.json();
        setQueue(queueData);
      }

      // Fetch keyword stats
      const keywordRes = await fetch(API + "/keyword-stats");
      if (keywordRes.ok) {
        const keywordData = await keywordRes.json();
        setKeywordStats(keywordData.keywordStats || []);
      }

      // Fetch scraper status (includes worker pool + browser pool)
      const statusRes = await fetch(API + "/scraper/status");
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setScraperRunning(statusData.isRunning);
        if (statusData.workerPool) setWorkerStatus(statusData.workerPool);
        if (statusData.browserPool) setBrowserStatus(statusData.browserPool);
      }

      // Fetch speed estimates
      try {
        const estimateRes = await fetch(API + "/scraper/estimates");
        if (estimateRes.ok) {
          const estimateData = await estimateRes.json();
          setSpeed({
            perHour: estimateData.ratePerHour || 0,
            eta: estimateData.estimatedMinutes || 0,
            remaining: estimateData.remaining || 0,
          });
        }
      } catch { /* estimates endpoint may not exist yet */ }

    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  // Start scraper — sends selected sources array
  const startScraper = async () => {
    setLoading(true);
    try {
      const keywordArray = keywords.split(',').map(k => k.trim()).filter(k => k);

      const response = await fetch(API + "/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: keywordArray,
          country,
          minSubs: Number(minSubs),
          target: Number(target),
          sources: selectedSources,
        })
      });

      if (response.ok) {
        setKeywords("");
        fetchAllData();
      }
    } catch (error) {
      console.error("Error starting scraper:", error);
    } finally {
      setLoading(false);
    }
  };

  // Stop scraper
  const stopScraper = async () => {
    try {
      await fetch(API + "/scraper/stop", { method: "POST" });
      fetchAllData();
    } catch (error) {
      console.error("Error stopping scraper:", error);
    }
  };

  // Queue controls
  const pauseQueueItem = async (id) => {
    try {
      await fetch(API + `/queue/pause/${id}`, { method: "POST" });
      fetchAllData();
    } catch (error) {
      console.error("Error pausing queue item:", error);
    }
  };

  const resumeQueueItem = async (id) => {
    try {
      await fetch(API + `/queue/resume/${id}`, { method: "POST" });
      fetchAllData();
    } catch (error) {
      console.error("Error resuming queue item:", error);
    }
  };

  const deleteQueueItem = async (id) => {
    try {
      await fetch(API + `/queue/${id}`, { method: "DELETE" });
      fetchAllData();
    } catch (error) {
      console.error("Error deleting queue item:", error);
    }
  };

  const clearCompleted = async () => {
    try {
      await fetch(API + "/queue/clear", { method: "POST" });
      fetchAllData();
    } catch (error) {
      console.error("Error clearing queue:", error);
    }
  };

  useEffect(() => {
    fetchAllData();
    if (autoRefresh) {
      const i = setInterval(fetchAllData, 3000);
      return () => clearInterval(i);
    }
  }, [autoRefresh]);

  // Calculate dynamic stats
  const successRate = stats?.total ? Math.round((stats.withEmail / stats.total) * 100) : 0;
  const topCountry = stats?.topCountries?.[0]?._id || "N/A";
  const topCountryCount = stats?.topCountries?.[0]?.count || 0;

  // Queue stats
  const activeJobs = queue.filter(j => j.status === 'running').length;
  const pendingJobs = queue.filter(j => j.status === 'pending').length;
  const completedJobs = queue.filter(j => j.status === 'completed').length;

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-linear-to-r from-cyan-500/10 to-blue-500/10 rounded-2xl blur-xl" />
          <div className="relative flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
                <Sparkles className="w-8 h-8 text-cyan-400" />
                Scraper Control Center
                <span className="text-sm font-normal text-slate-500 ml-2 flex items-center gap-1">
                  <Activity className="w-4 h-4" />
                  v3.0
                </span>
              </h1>
              <p className="text-slate-400">Multi-platform parallel creator scraper with email extraction</p>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Worker Pool Badge */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                workerStatus.activeWorkers > 0
                  ? 'border-blue-500/50 bg-blue-500/10'
                  : 'border-slate-700 bg-slate-800/50'
              }`}>
                <Gauge className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-medium text-slate-300">
                  {workerStatus.activeWorkers}/{workerStatus.maxWorkers} Workers
                </span>
              </div>

              {/* Browser Pool Badge */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                browserStatus.inUse > 0
                  ? 'border-purple-500/50 bg-purple-500/10'
                  : 'border-slate-700 bg-slate-800/50'
              }`}>
                <Monitor className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-medium text-slate-300">
                  {browserStatus.inUse}/{browserStatus.total} Browsers
                </span>
              </div>

              {/* Scraper Status */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                scraperRunning
                  ? 'border-green-500/50 bg-green-500/10'
                  : 'border-slate-700 bg-slate-800/50'
              }`}>
                <span className={`w-2 h-2 rounded-full ${scraperRunning ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`} />
                <span className="text-xs font-medium text-slate-300">
                  {scraperRunning ? 'Running' : 'Idle'}
                </span>
              </div>

              {/* Auto-refresh toggle */}
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                  autoRefresh
                    ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400'
                    : 'bg-slate-800/50 border-slate-700 text-slate-400'
                }`}
              >
                <RefreshCw className={`w-4 h-4 ${autoRefresh ? 'animate-spin' : ''}`} />
                <span className="text-xs font-medium">Auto</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          {/* Total Collected Card */}
          <div className="group relative bg-gradient-to-br from-slate-900 to-slate-800/50 border border-slate-800 rounded-2xl p-6 hover:border-cyan-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/5">
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-slate-400 text-sm mb-1 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Total Collected
                </p>
                <h2 className="text-4xl font-bold text-white mb-2">
                  {stats?.total ?? 0}
                </h2>
                <p className="text-xs text-slate-500">Across all campaigns</p>
              </div>
              <div className="w-12 h-12 bg-cyan-500/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Users className="w-6 h-6 text-cyan-400" />
              </div>
            </div>
          </div>

          {/* With Email Card */}
          <div className="group relative bg-gradient-to-br from-slate-900 to-slate-800/50 border border-slate-800 rounded-2xl p-6 hover:border-purple-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/5">
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-slate-400 text-sm mb-1 flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  With Email
                </p>
                <h2 className="text-4xl font-bold text-white mb-2">
                  {stats?.withEmail ?? 0}
                </h2>
                <p className="text-xs text-slate-500">{successRate}% success rate</p>
              </div>
              <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Mail className="w-6 h-6 text-purple-400" />
              </div>
            </div>
          </div>

          {/* Email Hit Rate Card */}
          <div className="group relative bg-gradient-to-br from-slate-900 to-slate-800/50 border border-slate-800 rounded-2xl p-6 hover:border-green-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-green-500/5">
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-slate-400 text-sm mb-1 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Email Hit Rate
                </p>
                <h2 className="text-4xl font-bold text-green-400 mb-2">
                  {stats?.emailRate ?? 0}%
                </h2>
                <p className="text-xs text-slate-500">Above target</p>
              </div>
              <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Zap className="w-6 h-6 text-green-400" />
              </div>
            </div>
          </div>

          {/* Top Country Card */}
          <div className="group relative bg-gradient-to-br from-slate-900 to-slate-800/50 border border-slate-800 rounded-2xl p-6 hover:border-orange-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-orange-500/5">
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-slate-400 text-sm mb-1 flex items-center gap-2">
                  <Globe2 className="w-4 h-4" />
                  Top Country
                </p>
                <h2 className="text-4xl font-bold text-white mb-2 flex items-baseline gap-2">
                  {topCountry}
                  <span className="text-sm font-normal text-slate-500">
                    ({topCountryCount})
                  </span>
                </h2>
                <p className="text-xs text-slate-500">Leading region</p>
              </div>
              <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <MapPin className="w-6 h-6 text-orange-400" />
              </div>
            </div>
          </div>

          {/* Speed Card */}
          <div className="group relative bg-gradient-to-br from-slate-900 to-slate-800/50 border border-slate-800 rounded-2xl p-6 hover:border-yellow-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-yellow-500/5">
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-slate-400 text-sm mb-1 flex items-center gap-2">
                  <Gauge className="w-4 h-4" />
                  Emails / Hour
                </p>
                <h2 className="text-4xl font-bold text-yellow-400 mb-2">
                  {speed.perHour || 0}
                </h2>
                <p className="text-xs text-slate-500">
                  {speed.eta > 0 ? `~${Math.round(speed.eta)}m remaining` : 'Calculating...'}
                </p>
              </div>
              <div className="w-12 h-12 bg-yellow-500/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Zap className="w-6 h-6 text-yellow-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Control Center */}
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-blue-500/5 rounded-2xl" />
          <div className="relative bg-slate-900/90 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
            
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                <PlayCircle className="w-5 h-5 text-cyan-400" />
                Add Keywords to Queue
              </h2>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Filter className="w-4 h-4" />
                <span>Configure and add keywords</span>
              </div>
            </div>

            {/* Multi-Platform Source Selector */}
            <div className="mb-4">
              <label className="text-sm text-slate-400 flex items-center gap-2 mb-2">
                <span className="w-1 h-1 bg-red-400 rounded-full" />
                Sources (select multiple)
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'youtube-all', label: 'YouTube', color: 'red', icon: '▶' },
                  { id: 'linkedin-all', label: 'LinkedIn', color: 'blue', icon: '💼' },
                  { id: 'instagram-all', label: 'Instagram', color: 'pink', icon: '📸' },
                  { id: 'x-all', label: 'X (Twitter)', color: 'slate', icon: '𝕏' },
                ].map(src => {
                  const isSelected = selectedSources.includes(src.id);

                  const colorMap = {
                    red: isSelected ? 'bg-red-500/20 border-red-500/60 text-red-300' : 'bg-slate-800/50 border-slate-700 text-slate-400',
                    blue: isSelected ? 'bg-blue-500/20 border-blue-500/60 text-blue-300' : 'bg-slate-800/50 border-slate-700 text-slate-400',
                    pink: isSelected ? 'bg-pink-500/20 border-pink-500/60 text-pink-300' : 'bg-slate-800/50 border-slate-700 text-slate-400',
                    slate: isSelected ? 'bg-slate-600/30 border-slate-500/60 text-slate-200' : 'bg-slate-800/50 border-slate-700 text-slate-400',
                  };

                  return (
                    <button
                      key={src.id}
                      onClick={() => {
                        setSelectedSources(prev =>
                          isSelected ? prev.filter(s => s !== src.id) : [...prev, src.id]
                        );
                      }}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
                        colorMap[src.color]
                      } ${isSelected ? 'scale-105 shadow-lg' : 'hover:scale-[1.02]'}`}
                    >
                      <span>{src.icon}</span>
                      {src.label}
                      {isSelected && <CheckCircle className="w-3.5 h-3.5 ml-0.5" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* Keywords Input */}
              <div className="space-y-2">
                <label className="text-sm text-slate-400 flex items-center gap-2">
                  <span className="w-1 h-1 bg-cyan-400 rounded-full" />
                  Keywords (comma separated)
                </label>
                <input
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl p-3 text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                  placeholder="ai, crypto, tech"
                  value={keywords}
                  onChange={e => setKeywords(e.target.value)}
                />
              </div>

              {/* Country Input */}
              <div className="space-y-2">
                <label className="text-sm text-slate-400 flex items-center gap-2">
                  <span className="w-1 h-1 bg-purple-400 rounded-full" />
                  Country
                </label>
                <input
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl p-3 text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition-colors"
                  placeholder="Country code"
                  value={country}
                  onChange={e => setCountry(e.target.value)}
                />
              </div>

              {/* Min Subs Input */}
              <div className="space-y-2">
                <label className="text-sm text-slate-400 flex items-center gap-2">
                  <span className="w-1 h-1 bg-green-400 rounded-full" />
                  Min Subscribers
                </label>
                <input
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl p-3 text-white placeholder-slate-600 focus:outline-none focus:border-green-500 transition-colors"
                  type="number"
                  value={minSubs}
                  onChange={e => setMinSubs(e.target.value)}
                />
              </div>

              {/* Target Input */}
              <div className="space-y-2">
                <label className="text-sm text-slate-400 flex items-center gap-2">
                  <span className="w-1 h-1 bg-orange-400 rounded-full" />
                  Target per Keyword
                </label>
                <input
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-xl p-3 text-white placeholder-slate-600 focus:outline-none focus:border-orange-500 transition-colors"
                  type="number"
                  value={target}
                  onChange={e => setTarget(e.target.value)}
                />
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                <label className="text-sm text-slate-400 opacity-0">Actions</label>
                <div className="flex gap-2">
                  <button
                    onClick={startScraper}
                    disabled={loading || !keywords}
                    className="flex-1 h-[50px] bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-700 disabled:cursor-not-allowed rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Plus className="w-5 h-5" />
                        Add to Queue
                      </>
                    )}
                  </button>
                  
                  {scraperRunning ? (
                    <button
                      onClick={stopScraper}
                      className="h-[50px] px-4 bg-red-600/20 hover:bg-red-600/30 border border-red-500/50 rounded-xl text-red-400 flex items-center justify-center transition-all duration-300"
                      title="Stop Scraper"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => fetch(API + "/scraper/start", { method: "POST" })}
                      className="h-[50px] px-4 bg-green-600/20 hover:bg-green-600/30 border border-green-500/50 rounded-xl text-green-400 flex items-center justify-center transition-all duration-300"
                      title="Start Scraper"
                    >
                      <Play className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Queue Summary */}
            {queue.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-800 flex items-center gap-4 text-sm">
                <span className="text-slate-400">Queue Summary:</span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  <span className="text-slate-300">{activeJobs} Running</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                  <span className="text-slate-300">{pendingJobs} Pending</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <span className="text-slate-300">{completedJobs} Completed</span>
                </span>
                {speed.perHour > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-cyan-500 rounded-full"></span>
                    <span className="text-cyan-300 font-medium">{speed.perHour}/hr</span>
                  </span>
                )}
                {completedJobs > 0 && (
                  <button
                    onClick={clearCompleted}
                    className="ml-auto text-xs text-slate-500 hover:text-slate-400 transition-colors"
                  >
                    Clear Completed
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Main Content - Queue Cards and Logs Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Queue Cards Section */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-purple-500/5 rounded-2xl" />
            <div className="relative bg-slate-900/90 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
              
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                  <Target className="w-5 h-5 text-blue-400" />
                  Queue Manager
                </h2>
                <span className="text-sm text-slate-400">
                  {queue.length} items
                </span>
              </div>

              {/* Queue Cards Grid — grouped by groupId */}
              <div className="h-[500px] overflow-y-auto custom-scrollbar pr-2 space-y-3">
                {queue.length > 0 ? (
                  (() => {
                    // Group queue items by groupId
                    const groups = {};
                    const ungrouped = [];
                    queue.forEach(item => {
                      if (item.groupId) {
                        if (!groups[item.groupId]) groups[item.groupId] = [];
                        groups[item.groupId].push(item);
                      } else {
                        ungrouped.push(item);
                      }
                    });

                    const rendered = [];

                    // Render grouped items with a header
                    Object.entries(groups).forEach(([gid, items]) => {
                      const groupKeyword = items[0]?.keyword || 'Unknown';
                      const groupRunning = items.some(i => i.status === 'running');
                      rendered.push(
                        <div key={`group-${gid}`} className={`rounded-xl border p-3 space-y-2 ${
                          groupRunning ? 'border-blue-500/30 bg-blue-500/5' : 'border-slate-700/50 bg-slate-800/30'
                        }`}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-slate-300 font-medium flex items-center gap-1.5">
                              <Sparkles className="w-3 h-3 text-cyan-400" />
                              {groupKeyword}
                            </span>
                            <span className="text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded-full">
                              {items.length} sources
                            </span>
                          </div>
                          {items.map(item => (
                            <QueueCard
                              key={item._id}
                              item={item}
                              onPause={pauseQueueItem}
                              onResume={resumeQueueItem}
                              onDelete={deleteQueueItem}
                            />
                          ))}
                        </div>
                      );
                    });

                    // Render ungrouped items
                    ungrouped.forEach(item => {
                      rendered.push(
                        <QueueCard
                          key={item._id}
                          item={item}
                          onPause={pauseQueueItem}
                          onResume={resumeQueueItem}
                          onDelete={deleteQueueItem}
                        />
                      );
                    });

                    return rendered;
                  })()
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600">
                    <Target className="w-12 h-12 mb-3 opacity-50" />
                    <p className="text-lg font-medium">Queue is empty</p>
                    <p className="text-sm">Add keywords to start scraping</p>
                  </div>
                )}
              </div>

              {/* Keyword Stats Summary */}
              {keywordStats.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-800">
                  <h3 className="text-sm font-medium text-slate-400 mb-3">Keyword Performance</h3>
                  <div className="space-y-2">
                    {keywordStats.slice(0, 3).map((stat) => (
                      <div key={stat._id} className="flex items-center justify-between text-xs">
                        <span className="text-slate-300">{stat._id}</span>
                        <span className="text-slate-400">
                          {stat.channelsFound} channels • {stat.emailsFound} emails
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Live Logs Section */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-green-500/5 to-emerald-500/5 rounded-2xl" />
            <div className="relative bg-slate-900/90 backdrop-blur-sm border border-slate-800 rounded-2xl p-6">
              
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                    <Activity className="w-5 h-5 text-green-400" />
                    Live Activity Feed
                  </h2>
                  <span className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 border border-green-500/30 rounded-full">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-xs text-green-400">LIVE</span>
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Clock className="w-4 h-4" />
                  <span>Last updated: {new Date().toLocaleTimeString()}</span>
                </div>
              </div>

              <div className="bg-slate-950/50 border border-slate-800 rounded-xl p-4 h-[500px] overflow-y-auto custom-scrollbar">
                {logs.length > 0 ? (
                  <div className="space-y-3">
                    {logs.map((log, index) => (
                      <div
                        key={log._id || index}
                        className="group relative bg-slate-900/50 border border-slate-800 rounded-lg p-3 hover:border-green-500/30 transition-all duration-300 hover:translate-x-1"
                      >
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-green-500 to-emerald-500 rounded-l-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="flex items-start gap-3 ml-2">
                          <span className="text-xs font-mono text-green-400 min-w-[70px]">
                            [{new Date(log.createdAt).toLocaleTimeString()}]
                          </span>
                          <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-green-400 transition-colors" />
                          <span className={`text-sm flex-1 ${
                            log.type === 'error' ? 'text-red-400' :
                            log.type === 'success' ? 'text-green-400' :
                            log.type === 'warning' ? 'text-yellow-400' :
                            'text-slate-300'
                          }`}>
                            {log.message}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600">
                    <Activity className="w-12 h-12 mb-3 opacity-50" />
                    <p className="text-lg font-medium">No logs available</p>
                    <p className="text-sm">Start the scraper to see live activity</p>
                  </div>
                )}
              </div>

              {/* Logs Footer */}
              <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <span className="w-1 h-1 bg-green-500 rounded-full" />
                    {logs.length} events
                  </span>
                  <span className="flex items-center gap-1">
                    <BarChart3 className="w-3 h-3" />
                    Real-time updates
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Custom Scrollbar Styles */}
        <style jsx>{`
          .custom-scrollbar::-webkit-scrollbar {
            width: 8px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: rgba(15, 23, 42, 0.5);
            border-radius: 10px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(34, 211, 238, 0.3);
            border-radius: 10px;
            transition: all 0.3s;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: rgba(34, 211, 238, 0.5);
          }
        `}</style>
      </div>
    </div>
  );
}