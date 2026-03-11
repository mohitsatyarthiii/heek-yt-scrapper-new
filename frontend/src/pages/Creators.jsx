import { useEffect, useState } from "react";
import {
  Search,
  Mail,
  Users,
  Globe,
  Filter,
  ChevronDown,
  ExternalLink,
  Youtube,
  Tag,
  Layers,
  Download,
  MailOpen,
  TrendingUp,
  BarChart3,
  Sparkles,
  Moon,
  Sun,
  Copy,
  Check,
  Eye,
  EyeOff,
  X,
  SlidersHorizontal,
  Grid3x3,
  List,
  ChevronLeft,
  ChevronRight,
  Loader2
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "https://api.heekentertainment.com";

export default function Creators() {
  const [channels, setChannels] = useState([]);
  const [filteredChannels, setFilteredChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [subscriberFilter, setSubscriberFilter] = useState("all");
  const [keywordFilter, setKeywordFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [emailFilter, setEmailFilter] = useState("all");
  const [uniqueCountries, setUniqueCountries] = useState([]);
  const [uniqueKeywords, setUniqueKeywords] = useState([]);
  const [copiedEmail, setCopiedEmail] = useState(null);
  const [darkMode, setDarkMode] = useState(true);
  const [viewMode, setViewMode] = useState("table"); // table or grid
  const [showFilters, setShowFilters] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [hoveredRow, setHoveredRow] = useState(null);
  const [stats, setStats] = useState(null);
  const [speed, setSpeed] = useState(null);

  // Format numbers
  const formatNumber = (num) => {
    if (!num && num !== 0) return "N/A";
    if (num >= 1000000000) return (num / 1000000000).toFixed(1) + "B";
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  };

  // Get channel URL
  const getChannelUrl = (creator) => {
    if (creator.profileUrl) return creator.profileUrl;
    switch (creator.platform) {
      case 'linkedin': return `https://linkedin.com/in/${creator.channelId}`;
      case 'instagram': return `https://instagram.com/${creator.channelId}`;
      case 'x': return `https://x.com/${creator.channelId}`;
      default: return `https://youtube.com/channel/${creator.channelId}`;
    }
  };

  // Platform styles
  const getPlatformConfig = (platform) => {
    const configs = {
      youtube: { 
        label: 'YouTube', 
        icon: Youtube,
        bg: 'bg-gradient-to-br from-red-500 to-red-600',
        lightBg: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400',
        color: 'text-red-500'
      },
      linkedin: { 
        label: 'LinkedIn', 
        icon: Users,
        bg: 'bg-gradient-to-br from-blue-500 to-blue-600',
        lightBg: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400',
        color: 'text-blue-500'
      },
      instagram: { 
        label: 'Instagram', 
        icon: Layers,
        bg: 'bg-gradient-to-br from-pink-500 to-purple-600',
        lightBg: 'bg-pink-50 text-pink-600 dark:bg-pink-500/10 dark:text-pink-400',
        color: 'text-pink-500'
      },
      x: { 
        label: 'X', 
        icon: Mail,
        bg: 'bg-gradient-to-br from-slate-600 to-slate-700',
        lightBg: 'bg-slate-50 text-slate-600 dark:bg-slate-500/10 dark:text-slate-400',
        color: 'text-slate-500'
      }
    };
    return configs[platform] || configs.youtube;
  };

  // Copy email to clipboard
  const copyToClipboard = (email) => {
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  // Fetch channels
  const fetchChannels = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (keywordFilter !== "all") params.set("keyword", keywordFilter);
      if (platformFilter !== "all") params.set("platform", platformFilter);
      params.set("showAll", "true");
      
      const qs = params.toString() ? `?${params.toString()}` : "";
      const data = await fetch(API + "/channels" + qs).then((r) => r.json());
      
      setChannels(data);
      setFilteredChannels(data);
      
      const countries = [...new Set(data.map(c => c.country).filter(Boolean))];
      setUniqueCountries(countries);
    } catch (error) {
      console.error("Error fetching channels:", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch keywords
  const fetchKeywords = async () => {
    try {
      const keywords = await fetch(API + "/keywords").then(r => r.json());
      setUniqueKeywords(keywords);
    } catch (error) {
      console.error("Error fetching keywords:", error);
    }
  };

  // Fetch stats
  const fetchStats = async () => {
    try {
      const data = await fetch(API + "/stats").then(r => r.json());
      setStats(data);
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  // Fetch speed
  const fetchSpeed = async () => {
    try {
      const data = await fetch(API + "/speed").then(r => r.json());
      setSpeed(data);
    } catch (error) {
      console.error("Error fetching speed:", error);
    }
  };

  // Apply filters
  useEffect(() => {
    let filtered = [...channels];

    if (searchTerm) {
      filtered = filtered.filter(
        (channel) =>
          channel.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          channel.email?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (countryFilter !== "all") {
      filtered = filtered.filter((channel) => channel.country === countryFilter);
    }

    if (subscriberFilter !== "all") {
      filtered = filtered.filter((channel) => {
        const subs = channel.subscribers || 0;
        switch (subscriberFilter) {
          case "under10k": return subs < 10000;
          case "10kto100k": return subs >= 10000 && subs < 100000;
          case "100kto1m": return subs >= 100000 && subs < 1000000;
          case "over1m": return subs >= 1000000;
          default: return true;
        }
      });
    }

    if (emailFilter !== "all") {
      filtered = filtered.filter((channel) => {
        const hasEmail = !!channel.email;
        return emailFilter === "with-email" ? hasEmail : !hasEmail;
      });
    }

    setFilteredChannels(filtered);
    setCurrentPage(1);
  }, [searchTerm, countryFilter, subscriberFilter, emailFilter, channels]);

  // Initial data fetch
  useEffect(() => {
    fetchKeywords();
    fetchStats();
    fetchSpeed();
    
    fetchChannels();
    const i = setInterval(() => {
      fetchChannels();
      fetchSpeed();
    }, 10000);
    
    return () => clearInterval(i);
  }, [keywordFilter, platformFilter]);

  // Pagination
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredChannels.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredChannels.length / itemsPerPage);

  // Stats calculations
  const totalSubscribers = channels.reduce((acc, c) => acc + (c.subscribers || 0), 0);
  const withEmail = channels.filter(c => c.email).length;
  const withoutEmail = channels.filter(c => !c.email).length;
  const emailRate = channels.length > 0 ? ((withEmail / channels.length) * 100).toFixed(1) : 0;

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      darkMode 
        ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white' 
        : 'bg-gradient-to-br from-slate-50 via-white to-slate-50 text-slate-900'
    }`}>
      {/* Floating Background Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-cyan-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative max-w-7xl mx-auto p-4 lg:p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-2xl ${
                darkMode ? 'bg-gradient-to-br from-cyan-500 to-blue-600' : 'bg-gradient-to-br from-cyan-600 to-blue-700'
              } shadow-lg shadow-cyan-500/25`}>
                <Youtube className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
                  Creator Analytics
                </h1>
                <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Track and manage creators across all platforms
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Theme Toggle */}
              <button
                onClick={() => setDarkMode(!darkMode)}
                className={`p-2 rounded-xl transition-all ${
                  darkMode 
                    ? 'bg-slate-800 hover:bg-slate-700 text-yellow-400' 
                    : 'bg-white hover:bg-slate-100 text-slate-700 shadow-md'
                }`}
              >
                {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              
              {/* View Toggle */}
              <button
                onClick={() => setViewMode(viewMode === 'table' ? 'grid' : 'table')}
                className={`p-2 rounded-xl transition-all ${
                  darkMode 
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' 
                    : 'bg-white hover:bg-slate-100 text-slate-700 shadow-md'
                }`}
              >
                {viewMode === 'table' ? <Grid3x3 className="w-5 h-5" /> : <List className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
            <div className={`group relative overflow-hidden rounded-2xl transition-all duration-300 hover:scale-105 ${
              darkMode 
                ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700 hover:border-cyan-500/50' 
                : 'bg-white shadow-lg hover:shadow-xl border border-slate-200'
            }`}>
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="relative p-4">
                <div className="flex items-center justify-between mb-2">
                  <Users className={`w-5 h-5 ${darkMode ? 'text-cyan-400' : 'text-cyan-600'}`} />
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
                  }`}>
                    Total
                  </span>
                </div>
                <p className="text-2xl font-bold">{channels.length}</p>
                <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Creators</p>
              </div>
            </div>

            <div className={`group relative overflow-hidden rounded-2xl transition-all duration-300 hover:scale-105 ${
              darkMode 
                ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700 hover:border-green-500/50' 
                : 'bg-white shadow-lg hover:shadow-xl border border-slate-200'
            }`}>
              <div className="absolute inset-0 bg-gradient-to-r from-green-500/10 to-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="relative p-4">
                <div className="flex items-center justify-between mb-2">
                  <Mail className={`w-5 h-5 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {emailRate}%
                  </span>
                </div>
                <p className="text-2xl font-bold">{withEmail}</p>
                <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>With Email</p>
              </div>
            </div>

            <div className={`group relative overflow-hidden rounded-2xl transition-all duration-300 hover:scale-105 ${
              darkMode 
                ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700 hover:border-purple-500/50' 
                : 'bg-white shadow-lg hover:shadow-xl border border-slate-200'
            }`}>
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="relative p-4">
                <div className="flex items-center justify-between mb-2">
                  <TrendingUp className={`w-5 h-5 ${darkMode ? 'text-purple-400' : 'text-purple-600'}`} />
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
                  }`}>
                    Total
                  </span>
                </div>
                <p className="text-2xl font-bold">{formatNumber(totalSubscribers)}</p>
                <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Subscribers</p>
              </div>
            </div>

            <div className={`group relative overflow-hidden rounded-2xl transition-all duration-300 hover:scale-105 ${
              darkMode 
                ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700 hover:border-blue-500/50' 
                : 'bg-white shadow-lg hover:shadow-xl border border-slate-200'
            }`}>
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="relative p-4">
                <div className="flex items-center justify-between mb-2">
                  <BarChart3 className={`w-5 h-5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
                  }`}>
                    Avg
                  </span>
                </div>
                <p className="text-2xl font-bold">{formatNumber(Math.round(totalSubscribers / (channels.length || 1)))}</p>
                <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Per Creator</p>
              </div>
            </div>

            <div className={`group relative overflow-hidden rounded-2xl transition-all duration-300 hover:scale-105 ${
              darkMode 
                ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700 hover:border-yellow-500/50' 
                : 'bg-white shadow-lg hover:shadow-xl border border-slate-200'
            }`}>
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="relative p-4">
                <div className="flex items-center justify-between mb-2">
                  <Sparkles className={`w-5 h-5 ${darkMode ? 'text-yellow-400' : 'text-yellow-600'}`} />
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
                  }`}>
                    Speed
                  </span>
                </div>
                <p className="text-2xl font-bold">{speed?.perHour || 0}</p>
                <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Per Hour</p>
              </div>
            </div>

            <div className={`group relative overflow-hidden rounded-2xl transition-all duration-300 hover:scale-105 ${
              darkMode 
                ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700 hover:border-indigo-500/50' 
                : 'bg-white shadow-lg hover:shadow-xl border border-slate-200'
            }`}>
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="relative p-4">
                <div className="flex items-center justify-between mb-2">
                  <Globe className={`w-5 h-5 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`} />
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                    darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {uniqueCountries.length}
                  </span>
                </div>
                <p className="text-2xl font-bold">{uniqueCountries.length}</p>
                <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Countries</p>
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className={`rounded-2xl transition-all duration-300 ${
            darkMode 
              ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700' 
              : 'bg-white shadow-lg border border-slate-200'
          }`}>
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center gap-2 text-sm font-medium"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  Filters & Options
                  <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                </button>
                
                <div className="flex items-center gap-3">
                  <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Showing <span className="font-bold text-white">{filteredChannels.length}</span> of {channels.length}
                  </span>
                  
                  <button
                    onClick={() => {
                      const params = new URLSearchParams();
                      if (keywordFilter !== "all") params.set("keyword", keywordFilter);
                      if (platformFilter !== "all") params.set("platform", platformFilter);
                      params.set("showAll", "true");
                      window.open(API + "/channels/export?" + params.toString(), "_blank");
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
                      darkMode
                        ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:shadow-lg hover:shadow-cyan-500/25'
                        : 'bg-gradient-to-r from-cyan-600 to-blue-700 text-white hover:shadow-lg hover:shadow-cyan-600/25'
                    }`}
                  >
                    <Download className="w-4 h-4" />
                    Export CSV
                  </button>
                </div>
              </div>

              {showFilters && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3">
                  {/* Search */}
                  <div className="relative col-span-1 lg:col-span-2">
                    <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${
                      darkMode ? 'text-slate-500' : 'text-slate-400'
                    }`} />
                    <input
                      type="text"
                      placeholder="Search by name or email..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className={`w-full pl-9 pr-4 py-2.5 rounded-xl transition-all ${
                        darkMode
                          ? 'bg-slate-900/50 border border-slate-700 text-white placeholder-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500'
                          : 'bg-white border border-slate-200 text-slate-900 placeholder-slate-400 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500'
                      }`}
                    />
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm("")}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2"
                      >
                        <X className={`w-4 h-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                      </button>
                    )}
                  </div>

                  {/* Keyword Filter */}
                  <div className="relative">
                    <Tag className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${
                      darkMode ? 'text-slate-500' : 'text-slate-400'
                    }`} />
                    <select
                      value={keywordFilter}
                      onChange={(e) => setKeywordFilter(e.target.value)}
                      className={`w-full pl-9 pr-8 py-2.5 rounded-xl appearance-none cursor-pointer transition-all ${
                        darkMode
                          ? 'bg-slate-900/50 border border-slate-700 text-white focus:border-cyan-500'
                          : 'bg-white border border-slate-200 text-slate-900 focus:border-cyan-500'
                      }`}
                    >
                      <option value="all">All Keywords</option>
                      {uniqueKeywords.map((kw) => (
                        <option key={kw} value={kw}>{kw}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  </div>

                  {/* Platform Filter */}
                  <div className="relative">
                    <Layers className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${
                      darkMode ? 'text-slate-500' : 'text-slate-400'
                    }`} />
                    <select
                      value={platformFilter}
                      onChange={(e) => setPlatformFilter(e.target.value)}
                      className={`w-full pl-9 pr-8 py-2.5 rounded-xl appearance-none cursor-pointer transition-all ${
                        darkMode
                          ? 'bg-slate-900/50 border border-slate-700 text-white focus:border-cyan-500'
                          : 'bg-white border border-slate-200 text-slate-900 focus:border-cyan-500'
                      }`}
                    >
                      <option value="all">All Platforms</option>
                      <option value="youtube">YouTube</option>
                      <option value="linkedin">LinkedIn</option>
                      <option value="instagram">Instagram</option>
                      <option value="x">X (Twitter)</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  </div>

                  {/* Country Filter */}
                  <div className="relative">
                    <Globe className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${
                      darkMode ? 'text-slate-500' : 'text-slate-400'
                    }`} />
                    <select
                      value={countryFilter}
                      onChange={(e) => setCountryFilter(e.target.value)}
                      className={`w-full pl-9 pr-8 py-2.5 rounded-xl appearance-none cursor-pointer transition-all ${
                        darkMode
                          ? 'bg-slate-900/50 border border-slate-700 text-white focus:border-cyan-500'
                          : 'bg-white border border-slate-200 text-slate-900 focus:border-cyan-500'
                      }`}
                    >
                      <option value="all">All Countries</option>
                      {uniqueCountries.map((country) => (
                        <option key={country} value={country}>
                          {country || "Unknown"}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  </div>

                  {/* Subscriber Filter */}
                  <div className="relative">
                    <Users className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${
                      darkMode ? 'text-slate-500' : 'text-slate-400'
                    }`} />
                    <select
                      value={subscriberFilter}
                      onChange={(e) => setSubscriberFilter(e.target.value)}
                      className={`w-full pl-9 pr-8 py-2.5 rounded-xl appearance-none cursor-pointer transition-all ${
                        darkMode
                          ? 'bg-slate-900/50 border border-slate-700 text-white focus:border-cyan-500'
                          : 'bg-white border border-slate-200 text-slate-900 focus:border-cyan-500'
                      }`}
                    >
                      <option value="all">All Subscribers</option>
                      <option value="under10k">Under 10K</option>
                      <option value="10kto100k">10K - 100K</option>
                      <option value="100kto1m">100K - 1M</option>
                      <option value="over1m">Over 1M</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  </div>

                  {/* Email Filter */}
                  <div className="relative">
                    <Mail className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${
                      darkMode ? 'text-slate-500' : 'text-slate-400'
                    }`} />
                    <select
                      value={emailFilter}
                      onChange={(e) => setEmailFilter(e.target.value)}
                      className={`w-full pl-9 pr-8 py-2.5 rounded-xl appearance-none cursor-pointer transition-all ${
                        darkMode
                          ? 'bg-slate-900/50 border border-slate-700 text-white focus:border-cyan-500'
                          : 'bg-white border border-slate-200 text-slate-900 focus:border-cyan-500'
                      }`}
                    >
                      <option value="all">All Emails</option>
                      <option value="with-email">With Email</option>
                      <option value="without-email">Without Email</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content Area */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
          </div>
        ) : viewMode === 'table' ? (
          /* Table View */
          <div className={`rounded-2xl overflow-hidden border transition-all ${
            darkMode ? 'border-slate-700 bg-slate-800/50 backdrop-blur-sm' : 'border-slate-200 bg-white shadow-lg'
          }`}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className={darkMode ? 'bg-slate-900/50' : 'bg-slate-50'}>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Platform</th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Creator</th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Followers</th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Keyword</th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Email</th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {currentItems.map((c, index) => {
                    const platform = getPlatformConfig(c.platform);
                    const PlatformIcon = platform.icon;
                    const hasEmail = !!c.email;
                    
                    return (
                      <tr
                        key={`${c.channelId}-${c.platform}`}
                        className={`group transition-all duration-200 ${
                          darkMode 
                            ? 'hover:bg-slate-700/50' 
                            : 'hover:bg-slate-50'
                        }`}
                        onMouseEnter={() => setHoveredRow(index)}
                        onMouseLeave={() => setHoveredRow(null)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${platform.lightBg}`}>
                            <PlatformIcon className="w-3 h-3" />
                            {platform.label}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <a
                            href={getChannelUrl(c)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 group/link"
                          >
                            <span className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                              {c.title || "Untitled"}
                            </span>
                            <ExternalLink className={`w-3 h-3 transition-opacity ${
                              hoveredRow === index ? 'opacity-100' : 'opacity-0'
                            } ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                          </a>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Users className={`w-4 h-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                            <span className={`font-semibold ${
                              darkMode ? 'text-white' : 'text-slate-900'
                            }`}>
                              {formatNumber(c.subscribers)}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            {c.keyword || '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {hasEmail ? (
                            <div className="flex items-center gap-2">
                              <a
                                href={`mailto:${c.email}`}
                                className={`text-sm transition-colors ${
                                  darkMode ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-600 hover:text-cyan-700'
                                }`}
                              >
                                {c.email}
                              </a>
                              <button
                                onClick={() => copyToClipboard(c.email)}
                                className="p-1 rounded-lg hover:bg-slate-700 transition-colors"
                              >
                                {copiedEmail === c.email ? (
                                  <Check className="w-3 h-3 text-green-500" />
                                ) : (
                                  <Copy className={`w-3 h-3 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                                )}
                              </button>
                            </div>
                          ) : (
                            <span className={`text-sm ${darkMode ? 'text-slate-600' : 'text-slate-400'}`}>
                              No email
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${
                            hasEmail
                              ? darkMode ? 'bg-green-500/10 text-green-400' : 'bg-green-100 text-green-700'
                              : darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {hasEmail ? <MailOpen className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                            {hasEmail ? 'Has Email' : 'No Email'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className={`px-6 py-4 border-t flex items-center justify-between ${
                darkMode ? 'border-slate-700' : 'border-slate-200'
              }`}>
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className={`p-2 rounded-lg transition-colors ${
                    darkMode
                      ? 'hover:bg-slate-700 disabled:opacity-50 disabled:hover:bg-transparent'
                      : 'hover:bg-slate-100 disabled:opacity-50 disabled:hover:bg-transparent'
                  }`}
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className={`p-2 rounded-lg transition-colors ${
                    darkMode
                      ? 'hover:bg-slate-700 disabled:opacity-50 disabled:hover:bg-transparent'
                      : 'hover:bg-slate-100 disabled:opacity-50 disabled:hover:bg-transparent'
                  }`}
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {currentItems.map((c) => {
              const platform = getPlatformConfig(c.platform);
              const PlatformIcon = platform.icon;
              const hasEmail = !!c.email;
              
              return (
                <div
                  key={`${c.channelId}-${c.platform}`}
                  className={`group relative overflow-hidden rounded-2xl transition-all duration-300 hover:scale-105 hover:shadow-2xl ${
                    darkMode
                      ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700 hover:border-cyan-500/50'
                      : 'bg-white shadow-lg border border-slate-200 hover:shadow-xl'
                  }`}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  
                  <div className="relative p-6">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className={`p-3 rounded-xl ${platform.bg} shadow-lg`}>
                        <PlatformIcon className="w-6 h-6 text-white" />
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${
                        hasEmail
                          ? darkMode ? 'bg-green-500/10 text-green-400' : 'bg-green-100 text-green-700'
                          : darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {hasEmail ? <MailOpen className="w-3 h-3" /> : <Mail className="w-3 h-3" />}
                        {hasEmail ? 'Email' : 'No Email'}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="mb-4">
                      <a
                        href={getChannelUrl(c)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 group/link"
                      >
                        <h3 className={`text-lg font-semibold line-clamp-1 ${
                          darkMode ? 'text-white' : 'text-slate-900'
                        }`}>
                          {c.title || "Untitled"}
                        </h3>
                        <ExternalLink className={`w-4 h-4 opacity-0 group-hover/link:opacity-100 transition-opacity ${
                          darkMode ? 'text-slate-400' : 'text-slate-500'
                        }`} />
                      </a>
                      
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs ${
                          darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
                        }`}>
                          <Tag className="w-3 h-3" />
                          {c.keyword || 'No keyword'}
                        </span>
                        {c.country && (
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs ${
                            darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'
                          }`}>
                            <Globe className="w-3 h-3" />
                            {c.country}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Users className={`w-4 h-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                        <span className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {formatNumber(c.subscribers)}
                        </span>
                      </div>
                      <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        followers
                      </span>
                    </div>

                    {/* Email */}
                    {hasEmail ? (
                      <div className={`p-3 rounded-xl ${
                        darkMode ? 'bg-slate-900/50' : 'bg-slate-50'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <Mail className={`w-4 h-4 flex-shrink-0 ${
                              darkMode ? 'text-cyan-400' : 'text-cyan-600'
                            }`} />
                            <a
                              href={`mailto:${c.email}`}
                              className={`text-sm truncate ${
                                darkMode ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-600 hover:text-cyan-700'
                              }`}
                            >
                              {c.email}
                            </a>
                          </div>
                          <button
                            onClick={() => copyToClipboard(c.email)}
                            className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors flex-shrink-0"
                          >
                            {copiedEmail === c.email ? (
                              <Check className="w-3 h-3 text-green-500" />
                            ) : (
                              <Copy className={`w-3 h-3 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={`p-3 rounded-xl text-center text-sm ${
                        darkMode ? 'bg-slate-900/50 text-slate-500' : 'bg-slate-50 text-slate-400'
                      }`}>
                        No email available
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredChannels.length === 0 && (
          <div className="text-center py-16">
            <div className={`inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-4 ${
              darkMode ? 'bg-slate-800' : 'bg-slate-100'
            }`}>
              <Search className={`w-8 h-8 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`} />
            </div>
            <h3 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              No creators found
            </h3>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Try adjusting your filters or search term
            </p>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
}