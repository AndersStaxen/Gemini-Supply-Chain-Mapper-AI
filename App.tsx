
import React, { useState, useEffect, useRef } from 'react';
import { 
  TrendingUp, 
  MapPin, 
  Plus, 
  Trash2, 
  Loader2, 
  Globe, 
  ExternalLink,
  ChevronRight,
  Info,
  Sun,
  Moon,
  Search,
  Sparkles,
  AlertTriangle,
  X,
  Layers,
  Check,
  Building2,
  DollarSign,
  RefreshCcw,
  TrendingUp as StockIcon
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import { analyzeSupplyChain, analyzePortfolioRisk } from './services/gemini';
import { StockItem, AnalysisResult, MapMarker } from './types';

declare const L: any;

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const TYPE_COLORS: Record<string, string> = {
  'HQ': '#f43f5e',
  'Factory': '#3b82f6',
  'Supplier': '#10b981',
  'Customer': '#f59e0b'
};

const App: React.FC = () => {
  const [portfolio, setPortfolio] = useState<StockItem[]>([]);
  const [newTicker, setNewTicker] = useState('');
  const [selectedStock, setSelectedStock] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Record<string, AnalysisResult>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [userLoc, setUserLoc] = useState<{ latitude: number, longitude: number } | undefined>();
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  
  const [visibleTypes, setVisibleTypes] = useState<Record<string, boolean>>({
    HQ: true,
    Factory: true,
    Supplier: true,
    Customer: true
  });

  const [riskReport, setRiskReport] = useState<string | null>(null);
  const [isRiskLoading, setIsRiskLoading] = useState(false);
  const [showRiskModal, setShowRiskModal] = useState(false);

  const mapInstanceRef = useRef<any>(null);
  const markersLayerRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const lastAnalyzedTicker = useRef<string | null>(null);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLoc({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        () => console.warn("Geolocation permission denied.")
      );
    }
    const timer = setTimeout(() => initMap(), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (mapInstanceRef.current && tileLayerRef.current) {
      mapInstanceRef.current.removeLayer(tileLayerRef.current);
      const tileUrl = darkMode 
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
      tileLayerRef.current = L.tileLayer(tileUrl, { maxZoom: 20 }).addTo(mapInstanceRef.current);
    }
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  const initMap = () => {
    if (mapInstanceRef.current) return;
    const mapEl = document.getElementById('map-container');
    if (!mapEl) return;
    const map = L.map('map-container', { zoomControl: false, attributionControl: false }).setView([20, 0], 2);
    const tileUrl = darkMode 
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    tileLayerRef.current = L.tileLayer(tileUrl, { maxZoom: 20 }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    mapInstanceRef.current = map;
    markersLayerRef.current = L.layerGroup().addTo(map);
  };

  const parseMarkers = (content: string): MapMarker[] => {
    const markers: MapMarker[] = [];
    content.split('\n').forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('MARKER|')) {
        const parts = trimmed.split('|');
        if (parts.length >= 6) {
          const lat = parseFloat(parts[3]);
          const lng = parseFloat(parts[4]);
          if (!isNaN(lat) && !isNaN(lng)) {
            markers.push({ id: `marker-${idx}`, type: parts[1] as any, title: parts[2], lat, lng, description: parts[5] });
          }
        }
      }
    });
    return markers;
  };

  const updateMapMarkers = (markers: MapMarker[], shouldFitBounds: boolean = false) => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;
    markersLayerRef.current.clearLayers();
    if (markers.length === 0) return;
    const bounds = L.latLngBounds([]);
    markers.forEach(m => {
      const color = TYPE_COLORS[m.type] || '#333';
      const marker = L.circleMarker([m.lat, m.lng], {
        radius: 10, fillColor: color, color: darkMode ? '#1e293b' : '#fff', weight: 3, opacity: 1, fillOpacity: 0.9,
      }).addTo(markersLayerRef.current);
      marker.bindPopup(`
        <div class="p-2 min-w-[200px] ${darkMode ? 'text-slate-100' : 'text-slate-900'}">
          <div class="text-[10px] font-black tracking-widest text-slate-400 uppercase mb-1">${m.type}</div>
          <strong class="block mb-1">${m.title}</strong>
          <p class="text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'} leading-snug">${m.description}</p>
        </div>
      `, { className: darkMode ? 'dark-popup' : '' });
      bounds.extend([m.lat, m.lng]);
    });
    if (shouldFitBounds && markers.length > 0) mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] });
  };

  const handleAddStock = () => {
    if (newTicker.trim()) {
      const ticker = newTicker.toUpperCase();
      const companyName = window.prompt(`Enter company name for ${ticker}:`) || ticker;
      
      setPortfolio([...portfolio, { 
        ticker, 
        shares: 1, 
        price: 0,
        companyName,
        marketCap: '...'
      }]);
      setNewTicker('');
    }
  };

  const removeStock = (ticker: string) => {
    setPortfolio(portfolio.filter(s => s.ticker !== ticker));
    if (selectedStock === ticker) {
      setSelectedStock(null);
      lastAnalyzedTicker.current = null;
    }
  };

  const runAnalysis = async (ticker: string) => {
    setLoading(ticker);
    setErrors(prev => ({ ...prev, [ticker]: null }));
    try {
      const result = await analyzeSupplyChain(ticker, userLoc);
      
      setPortfolio(prev => prev.map(s => {
        if (s.ticker === ticker) {
          return {
            ...s,
            price: result.price ?? s.price,
            marketCap: result.marketCap ?? s.marketCap
          };
        }
        return s;
      }));

      setAnalysis(prev => ({ ...prev, [ticker]: result }));
      setSelectedStock(ticker);
      lastAnalyzedTicker.current = ticker;
    } catch (err) {
      console.error("Analysis failed", err);
      setErrors(prev => ({ ...prev, [ticker]: "Failed to retrieve real-time data. Please ensure the ticker is correct and try again." }));
      setSelectedStock(ticker);
    } finally {
      setLoading(null);
    }
  };

  const runPortfolioRisk = async () => {
    setIsRiskLoading(true);
    setShowRiskModal(true);
    try {
      const result = await analyzePortfolioRisk(portfolio, analysis);
      setRiskReport(result);
    } catch (err) {
      console.error("Portfolio risk analysis failed", err);
      setRiskReport("Failed to generate strategic risk report. Please try again.");
    } finally {
      setIsRiskLoading(false);
    }
  };

  useEffect(() => {
    if (selectedStock && analysis[selectedStock]) {
      const markers = parseMarkers(analysis[selectedStock].content);
      const filteredMarkers = markers.filter(m => visibleTypes[m.type]);
      const tickerChanged = lastAnalyzedTicker.current !== selectedStock;
      updateMapMarkers(filteredMarkers, tickerChanged);
      if (tickerChanged) lastAnalyzedTicker.current = selectedStock;
    } else {
      if (markersLayerRef.current) markersLayerRef.current.clearLayers();
    }
  }, [selectedStock, analysis, visibleTypes]);

  const toggleType = (type: string) => {
    setVisibleTypes(prev => ({ ...prev, [type]: !prev[type] }));
  };

  const chartData = portfolio.map(item => ({ name: item.ticker, value: Math.max(item.shares * item.price, 0.1) }));

  const selectedStockData = portfolio.find(s => s.ticker === selectedStock);
  const currentAnalysis = selectedStock ? analysis[selectedStock] : null;
  const currentError = selectedStock ? errors[selectedStock] : null;

  return (
    <div className={`flex h-screen ${darkMode ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'} font-sans overflow-hidden transition-colors duration-300`}>
      
      {/* Sidebar */}
      <div className={`w-80 border-r ${darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'} flex flex-col shadow-xl z-10 transition-colors duration-300`}>
        <div className={`p-6 border-b ${darkMode ? 'border-slate-800 bg-slate-950' : 'border-slate-100 bg-slate-900'} text-white flex justify-between items-center`}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-6 h-6 text-blue-400" />
              <h1 className="text-xl font-bold tracking-tight">SupplyChain IQ</h1>
            </div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Geospatial Risk Analysis</p>
          </div>
          <button onClick={() => setDarkMode(!darkMode)} className={`p-2 rounded-xl transition-all ${darkMode ? 'bg-slate-800 text-yellow-400 hover:bg-slate-700' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto space-y-4">
          <button 
            onClick={runPortfolioRisk}
            disabled={portfolio.length === 0}
            className={`w-full p-3 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 hover:scale-[1.02] transition-transform active:scale-100 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed`}
          >
            <Sparkles className="w-4 h-4" />
            Portfolio Risk Report
          </button>

          <div className="flex gap-2">
            <input 
              type="text" placeholder="Add Ticker (e.g. MSFT)" 
              className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${darkMode ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' : 'bg-white border-slate-200 text-slate-900'}`}
              value={newTicker} onChange={(e) => setNewTicker(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddStock()}
            />
            <button onClick={handleAddStock} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"><Plus className="w-5 h-5" /></button>
          </div>

          <div className="space-y-2">
            {portfolio.length === 0 ? (
              <div className="text-center py-10 opacity-50 px-4">
                <p className="text-sm font-medium">Your portfolio is empty.</p>
                <p className="text-xs">Add a ticker above to get started.</p>
              </div>
            ) : (
              portfolio.map((item) => (
                <div 
                  key={item.ticker}
                  className={`p-4 rounded-xl border transition-all cursor-pointer group ${selectedStock === item.ticker ? (darkMode ? 'border-blue-500 bg-blue-900/20' : 'border-blue-500 bg-blue-50/50') : (darkMode ? 'border-slate-800 hover:border-slate-600 bg-slate-800/50' : 'border-slate-100 hover:border-slate-300 bg-white')}`}
                  onClick={() => setSelectedStock(item.ticker)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg">{item.ticker}</span>
                        {loading === item.ticker && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                      </div>
                      <span className={`text-xs font-semibold ${darkMode ? 'text-slate-400' : 'text-slate-500'} flex items-center gap-1`}>
                        <Building2 className="w-3 h-3" />
                        {item.companyName}
                      </span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); removeStock(item.ticker); }} className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-all"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  
                  <div className="flex justify-between items-end mt-2">
                    <div className="flex flex-col gap-1">
                      <div className={`text-[10px] font-medium flex items-center gap-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {item.shares} Share{item.shares !== 1 ? 's' : ''} • <span className={item.price > 0 ? 'text-green-500' : ''}>${item.price > 0 ? item.price.toLocaleString() : '---'}</span>
                      </div>
                      <div className={`text-[10px] font-bold flex items-center gap-1 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                        <DollarSign className="w-2.5 h-2.5" />
                        Cap: {item.marketCap}
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); runAnalysis(item.ticker); }} className={`text-xs px-3 py-1.5 rounded-full font-semibold flex items-center gap-1 transition-colors ${analysis[item.ticker] ? (darkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600') : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                      {analysis[item.ticker] ? 'Refresh' : 'Analyze'} <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {portfolio.length > 0 && (
          <div className={`p-4 border-t h-48 ${darkMode ? 'border-slate-800 bg-slate-900/50' : 'border-slate-200 bg-slate-50'}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} innerRadius={40} outerRadius={60} paddingAngle={5} dataKey="value">
                  {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <RechartsTooltip contentStyle={{ backgroundColor: darkMode ? '#0f172a' : '#fff', borderColor: darkMode ? '#334155' : '#e2e8f0', color: darkMode ? '#f8fafc' : '#0f172a' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Main Map Area */}
      <div className="flex-1 flex flex-col relative">
        <div id="map-container" className="absolute inset-0 z-0" />
        
        {/* Map Layers Toggle Control */}
        <div className={`absolute top-6 left-6 z-20 p-2 rounded-2xl shadow-xl border backdrop-blur-md transition-all duration-300 ${darkMode ? 'bg-slate-900/80 border-slate-700 text-white' : 'bg-white/80 border-slate-200 text-slate-900'}`}>
          <div className="flex items-center gap-2 px-3 py-1 mb-2">
            <Layers className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-bold uppercase tracking-widest opacity-60">Layer Controls</span>
          </div>
          <div className="flex flex-col gap-1">
            {Object.entries(TYPE_COLORS).map(([type, color]) => (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`flex items-center justify-between gap-4 px-3 py-2 rounded-xl transition-all ${
                  visibleTypes[type] 
                    ? (darkMode ? 'bg-slate-800' : 'bg-slate-100') 
                    : 'opacity-50 grayscale hover:grayscale-0'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-xs font-semibold">{type}</span>
                </div>
                {visibleTypes[type] && <Check className="w-3 h-3 text-blue-500" />}
              </button>
            ))}
          </div>
        </div>
        
        {/* Risk Modal */}
        {showRiskModal && (
          <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6">
            <div className={`w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col rounded-3xl shadow-2xl animate-in zoom-in duration-300 ${darkMode ? 'bg-slate-900 border border-slate-700' : 'bg-white border border-slate-200'}`}>
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <AlertTriangle className="text-amber-500 w-6 h-6" />
                  Strategic Portfolio Risk Report
                </h2>
                <button onClick={() => setShowRiskModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><X className="w-6 h-6" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 prose prose-slate dark:prose-invert max-w-none">
                {isRiskLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
                    <p className="font-medium text-slate-500 animate-pulse">Consulting Gemini Pro for strategic insights...</p>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap leading-relaxed text-slate-700 dark:text-slate-300 text-sm">
                    {riskReport || "No report generated."}
                  </div>
                )}
              </div>
              <div className="p-6 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button onClick={() => setShowRiskModal(false)} className="px-6 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl font-bold hover:opacity-90 transition-opacity">Close Report</button>
              </div>
            </div>
          </div>
        )}

        {/* Selected Stock Panel */}
        {selectedStock && (currentAnalysis || currentError) && (
          <div className={`absolute top-6 right-6 bottom-6 w-96 backdrop-blur shadow-2xl rounded-2xl border z-10 flex flex-col overflow-hidden animate-in slide-in-from-right duration-300 ${darkMode ? 'bg-slate-900/90 border-slate-700' : 'bg-white/95 border-slate-200'}`}>
            <div className={`p-5 border-b flex justify-between items-center ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2"><Globe className="w-5 h-5 text-blue-500" />{selectedStock} Analysis</h2>
                <div className="flex gap-2 mt-1">
                  {Object.entries(TYPE_COLORS).map(([type, color]) => (
                    <div key={type} className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-[10px] text-slate-500 font-bold uppercase">{type}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => setSelectedStock(null)} className="text-slate-400 hover:text-slate-600 p-1"><X className="w-5 h-5" /></button>
            </div>

            {/* Visual Stock Snapshot */}
            {selectedStockData && (
              <div className={`px-5 py-4 border-b flex items-center gap-4 transition-colors ${darkMode ? 'bg-slate-800/40 border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
                {/* Logo section */}
                <div className={`w-12 h-12 rounded-xl flex-shrink-0 border flex items-center justify-center overflow-hidden bg-white shadow-sm transition-all ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                   {currentAnalysis?.domain ? (
                     <img 
                       src={`https://logo.clearbit.com/${currentAnalysis.domain}`} 
                       alt={selectedStockData.ticker}
                       className="w-full h-full object-contain p-1.5"
                       onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
                     />
                   ) : (
                     <Building2 className="w-6 h-6 text-slate-400" />
                   )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`text-[10px] font-black uppercase tracking-tighter mb-0.5 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`}>Market Context</p>
                  <p className="text-sm font-bold truncate leading-none mb-1">{selectedStockData.companyName}</p>
                  <p className={`text-[10px] font-medium truncate ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{currentAnalysis?.domain || 'Website unavailable'}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-[10px] font-black uppercase tracking-tighter mb-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Live Price • Cap</p>
                  <p className="text-sm font-bold leading-none whitespace-nowrap">
                    {selectedStockData.price > 0 ? `$${selectedStockData.price.toLocaleString()}` : '---'} • {selectedStockData.marketCap}
                  </p>
                </div>
              </div>
            )}

            <div className={`flex-1 overflow-y-auto scrollbar-hide flex flex-col ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              {currentError ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
                  <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-500">
                    <AlertTriangle className="w-8 h-8" />
                  </div>
                  <h3 className="font-bold text-lg">Analysis Unavailable</h3>
                  <p className="text-sm text-slate-500">{currentError}</p>
                  <button 
                    onClick={() => runAnalysis(selectedStock!)}
                    disabled={loading === selectedStock}
                    className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {loading === selectedStock ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                    Retry Analysis
                  </button>
                </div>
              ) : (
                <div className="p-6 text-sm leading-relaxed">
                  <div className="flex items-center gap-2 mb-4 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[10px] font-bold uppercase tracking-widest text-blue-500">
                    <Search className="w-3 h-3" /> Powered by Gemini Flash 2.5 + Grounding
                  </div>
                  {currentAnalysis?.content.split('\n').filter(line => {
                    const l = line.trim();
                    return !l.startsWith('MARKER|') && !l.startsWith('PRICE|') && !l.startsWith('CAP|') && !l.startsWith('DOMAIN|');
                  }).join('\n').split('\n\n').map((para, i) => <p key={i} className="mb-4">{para}</p>)}
                </div>
              )}
            </div>

            {currentAnalysis?.sources && currentAnalysis.sources.length > 0 && !currentError && (
              <div className={`p-4 border-t ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Info className="w-3 h-3" /> Grounding Sources</h3>
                <div className="space-y-2 max-h-40 overflow-y-auto scrollbar-hide">
                  {currentAnalysis.sources.map((src, i) => (
                    <a key={i} href={src.uri} target="_blank" rel="noopener noreferrer" className={`flex items-center justify-between p-2 rounded-lg border transition-all text-xs ${darkMode ? 'bg-slate-900 border-slate-800 hover:border-blue-500 text-slate-300' : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm text-slate-700'}`}>
                      <span className="font-semibold truncate mr-2">{src.title}</span><ExternalLink className="w-3 h-3 text-blue-500 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!selectedStock && (
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none z-10 backdrop-blur-sm p-8 rounded-3xl border transition-all duration-300 ${darkMode ? 'bg-slate-900/60 border-slate-800 text-white' : 'bg-white/50 border-white/50 text-slate-900'}`}>
            <div className={`w-16 h-16 shadow-xl rounded-2xl flex items-center justify-center mx-auto mb-4 border transition-colors ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-100'}`}>
              <MapPin className={`w-8 h-8 ${darkMode ? 'text-blue-400' : 'text-blue-500'}`} />
            </div>
            <h3 className="text-lg font-bold">Interactive Supply Chain Map</h3>
            <p className={`text-sm max-w-[250px] mx-auto mt-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Select a stock or run a <strong>Global Risk Report</strong> for strategic AI insights across your entire portfolio.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
