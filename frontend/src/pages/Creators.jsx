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
  MailOpen
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "https://api.heekentertainment.com";

export default function Creators() {
  const [channels, setChannels] = useState([]);
  const [filteredChannels, setFilteredChannels] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [countryFilter, setCountryFilter] = useState("all");
  const [subscriberFilter, setSubscriberFilter] = useState("all");
  const [keywordFilter, setKeywordFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [emailFilter, setEmailFilter] = useState("all"); // New email filter state
  const [uniqueCountries, setUniqueCountries] = useState([]);
  const [uniqueKeywords, setUniqueKeywords] = useState([]);

  // Format subscribers with K, M, B suffixes
  const formatSubscribers = (count) => {
    if (!count && count !== 0) return "N/A";
    if (count >= 1000000000) {
      return (count / 1000000000).toFixed(1) + "B";
    }
    if (count >= 1000000) {
      return (count / 1000000).toFixed(1) + "M";
    }
    if (count >= 1000) {
      return (count / 1000).toFixed(1) + "K";
    }
    return count.toString();
  };

  // Generate profile URL based on platform
  const getChannelUrl = (creator) => {
    if (creator.profileUrl) return creator.profileUrl;
    switch (creator.platform) {
      case 'linkedin': return `https://linkedin.com/in/${creator.channelId}`;
      case 'instagram': return `https://instagram.com/${creator.channelId}`;
      case 'x': return `https://x.com/${creator.channelId}`;
      default: return `https://youtube.com/channel/${creator.channelId}`;
    }
  };

  const getPlatformLabel = (platform) => {
    switch (platform) {
      case 'youtube': return 'YT';
      case 'linkedin': return 'LI';
      case 'instagram': return 'IG';
      case 'x': return 'X';
      default: return 'YT';
    }
  };

  const getPlatformColor = (platform) => {
    switch (platform) {
      case 'youtube': return 'bg-red-500/20 text-red-400';
      case 'linkedin': return 'bg-blue-500/20 text-blue-400';
      case 'instagram': return 'bg-pink-500/20 text-pink-400';
      case 'x': return 'bg-slate-500/20 text-slate-300';
      default: return 'bg-red-500/20 text-red-400';
    }
  };

  // Get email status color
  const getEmailStatusColor = (hasEmail) => {
    return hasEmail 
      ? 'bg-green-500/20 text-green-400' 
      : 'bg-slate-500/20 text-slate-400';
  };

  // Generate mailto link
  const getMailtoLink = (email) => {
    return `mailto:${email}`;
  };

  const fetchChannels = async () => {
    try {
      const params = new URLSearchParams();
      if (keywordFilter !== "all") params.set("keyword", keywordFilter);
      if (platformFilter !== "all") params.set("platform", platformFilter);
      // Note: Email filter is applied client-side, not in API request
      const qs = params.toString() ? `?${params.toString()}` : "";

      const data = await fetch(API + "/channels" + qs).then((r) => r.json());
      setChannels(data);
      setFilteredChannels(data);

      const countries = [...new Set(data.map(c => c.country).filter(Boolean))];
      setUniqueCountries(countries);
    } catch (error) {
      console.error("Error fetching channels:", error);
    }
  };

  const fetchKeywords = async () => {
    try {
      const keywords = await fetch(API + "/keywords").then(r => r.json());
      setUniqueKeywords(keywords);
    } catch (error) {
      console.error("Error fetching keywords:", error);
    }
  };

  // Apply filters whenever search term or filters change
  useEffect(() => {
    let filtered = [...channels];

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (channel) =>
          channel.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          channel.email?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply country filter
    if (countryFilter !== "all") {
      filtered = filtered.filter((channel) => channel.country === countryFilter);
    }

    // Apply subscriber filter
    if (subscriberFilter !== "all") {
      filtered = filtered.filter((channel) => {
        const subs = channel.subscribers || 0;
        switch (subscriberFilter) {
          case "under10k":
            return subs < 10000;
          case "10kto100k":
            return subs >= 10000 && subs < 100000;
          case "100kto1m":
            return subs >= 100000 && subs < 1000000;
          case "over1m":
            return subs >= 1000000;
          default:
            return true;
        }
      });
    }

    // Apply email filter (NEW)
    if (emailFilter !== "all") {
      filtered = filtered.filter((channel) => {
        const hasEmail = !!channel.email;
        return emailFilter === "with-email" ? hasEmail : !hasEmail;
      });
    }

    setFilteredChannels(filtered);
  }, [searchTerm, countryFilter, subscriberFilter, emailFilter, channels]);

  useEffect(() => {
    fetchKeywords();
  }, []);

  useEffect(() => {
    fetchChannels();
    const i = setInterval(fetchChannels, 5000);
    return () => clearInterval(i);
  }, [keywordFilter, platformFilter]);

  // Calculate stats
  const totalSubscribers = channels.reduce((acc, c) => acc + (c.subscribers || 0), 0);
  const averageSubscribers = channels.length ? Math.round(totalSubscribers / channels.length) : 0;
  
  // Calculate email stats
  const withEmail = channels.filter(c => c.email).length;
  const withoutEmail = channels.filter(c => !c.email).length;
  const emailRate = channels.length > 0 ? ((withEmail / channels.length) * 100).toFixed(1) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-8">
      {/* Header Section */}
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
              <Youtube className="w-8 h-8 text-red-500" />
              Creator Analytics Dashboard
            </h1>
            <p className="text-slate-400">Track and manage creators across all platforms</p>
          </div>
          
          {/* Stats Cards - Updated to include email stats */}
          <div className="flex gap-4">
            <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-xl px-6 py-3">
              <p className="text-slate-400 text-sm">Total Creators</p>
              <p className="text-2xl font-bold text-white">{channels.length}</p>
            </div>
            <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-xl px-6 py-3">
              <p className="text-slate-400 text-sm">With Email</p>
              <p className="text-2xl font-bold text-green-400">{withEmail}</p>
            </div>
            <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-xl px-6 py-3">
              <p className="text-slate-400 text-sm">Email Rate</p>
              <p className="text-2xl font-bold text-cyan-400">{emailRate}%</p>
            </div>
            <div className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-xl px-6 py-3">
              <p className="text-slate-400 text-sm">Total Subs</p>
              <p className="text-2xl font-bold text-white">{formatSubscribers(totalSubscribers)}</p>
            </div>
          </div>
        </div>

        {/* Filters Section - Added Email Filter */}
        <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-4 mb-4">
            <Filter className="w-5 h-5 text-slate-400" />
            <h2 className="text-white font-semibold">Filters</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            {/* Keyword Filter */}
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-500" />
              <select
                value={keywordFilter}
                onChange={(e) => setKeywordFilter(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-8 py-2.5 text-white appearance-none cursor-pointer focus:outline-none focus:border-cyan-500 transition-colors"
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
              <Layers className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-500" />
              <select
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-8 py-2.5 text-white appearance-none cursor-pointer focus:outline-none focus:border-cyan-500 transition-colors"
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
              <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-500" />
              <select
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-8 py-2.5 text-white appearance-none cursor-pointer focus:outline-none focus:border-cyan-500 transition-colors"
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
              <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-500" />
              <select
                value={subscriberFilter}
                onChange={(e) => setSubscriberFilter(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-8 py-2.5 text-white appearance-none cursor-pointer focus:outline-none focus:border-cyan-500 transition-colors"
              >
                <option value="all">All Subscribers</option>
                <option value="under10k">Under 10K</option>
                <option value="10kto100k">10K - 100K</option>
                <option value="100kto1m">100K - 1M</option>
                <option value="over1m">Over 1M</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            </div>

            {/* Email Filter - NEW */}
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-500" />
              <select
                value={emailFilter}
                onChange={(e) => setEmailFilter(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-8 py-2.5 text-white appearance-none cursor-pointer focus:outline-none focus:border-cyan-500 transition-colors"
              >
                <option value="all">All Emails</option>
                <option value="with-email">With Email</option>
                <option value="without-email">Without Email</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            </div>

            {/* Results Count + Export */}
            <div className="flex items-center justify-end gap-3 text-slate-400">
              <span className="text-sm">
                Showing <span className="text-white font-semibold">{filteredChannels.length}</span> of{" "}
                <span className="text-white font-semibold">{channels.length}</span> creators
              </span>
              <button
                onClick={() => {
                  const params = new URLSearchParams();
                  if (keywordFilter !== "all") params.set("keyword", keywordFilter);
                  if (platformFilter !== "all") params.set("platform", platformFilter);
                  const qs = params.toString() ? `?${params.toString()}` : "";
                  window.open(API + "/channels/export" + qs, "_blank");
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-cyan-400 text-sm hover:bg-cyan-500/20 hover:border-cyan-500/50 transition-all"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </div>
          </div>
        </div>

        {/* Table Section */}
        <div className="bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
          <table className="w-full">
            <thead>
              <tr className="bg-gradient-to-r from-slate-800 to-slate-900">
                <th className="p-5 text-center w-16">
                  <div className="flex items-center justify-center text-slate-300 font-semibold">
                    <Layers className="w-4 h-4 text-purple-400" />
                  </div>
                </th>
                <th className="p-5 text-left">
                  <div className="flex items-center gap-2 text-slate-300 font-semibold">
                    <Youtube className="w-4 h-4 text-red-400" />
                    Creator
                  </div>
                </th>
                <th className="p-5 text-center">
                  <div className="flex items-center justify-center gap-2 text-slate-300 font-semibold">
                    <Users className="w-4 h-4 text-blue-400" />
                    Followers
                  </div>
                </th>
                <th className="p-5 text-center">
                  <div className="flex items-center justify-center gap-2 text-slate-300 font-semibold">
                    <Tag className="w-4 h-4 text-amber-400" />
                    Keyword
                  </div>
                </th>
                <th className="p-5 text-left">
                  <div className="flex items-center gap-2 text-slate-300 font-semibold">
                    <Mail className="w-4 h-4 text-cyan-400" />
                    Email
                  </div>
                </th>
                <th className="p-5 text-center w-24">
                  <div className="flex items-center justify-center gap-2 text-slate-300 font-semibold">
                    <MailOpen className="w-4 h-4 text-green-400" />
                    Status
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredChannels.length > 0 ? (
                filteredChannels.map((c, index) => (
                  <tr
                    key={`${c.channelId}-${c.platform || 'youtube'}`}
                    className="group border-t border-slate-800 hover:bg-slate-800/50 transition-all duration-300"
                  >
                    <td className="p-5 text-center">
                      <span className={`inline-flex items-center justify-center px-2 py-1 rounded-md text-xs font-bold ${getPlatformColor(c.platform)}`}>
                        {getPlatformLabel(c.platform)}
                      </span>
                    </td>
                    <td className="p-5">
                      <a
                        href={getChannelUrl(c)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 text-white hover:text-cyan-400 transition-colors group/link"
                      >
                        <span className="font-medium">{c.title || "Untitled"}</span>
                        <ExternalLink className="w-3 h-3 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                      </a>
                    </td>
                    <td className="p-5 text-center">
                      <span className="inline-flex items-center justify-center px-3 py-1 bg-gradient-to-r from-slate-800 to-slate-700 rounded-full text-sm font-semibold text-white">
                        {formatSubscribers(c.subscribers)}
                      </span>
                    </td>
                    <td className="p-5 text-center">
                      <span className="text-slate-400 text-sm">{c.keyword || "-"}</span>
                    </td>
                    <td className="p-5">
                      {c.email ? (
                        <a
                          href={getMailtoLink(c.email)}
                          className="inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors group"
                        >
                          <Mail className="w-4 h-4" />
                          <span className="border-b border-cyan-400/30 group-hover:border-cyan-300">
                            {c.email}
                          </span>
                        </a>
                      ) : (
                        <span className="text-slate-600">No email</span>
                      )}
                    </td>
                    <td className="p-5 text-center">
                      <span className={`inline-flex items-center justify-center px-2 py-1 rounded-md text-xs font-bold ${getEmailStatusColor(!!c.email)}`}>
                        {c.email ? 'Has Email' : 'No Email'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="p-12 text-center">
                    <div className="flex flex-col items-center gap-3 text-slate-500">
                      <Search className="w-12 h-12 opacity-50" />
                      <p className="text-lg">No creators found</p>
                      <p className="text-sm">Try adjusting your filters</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}