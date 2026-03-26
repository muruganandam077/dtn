import { useState, useEffect, useRef } from 'react'
import { ApiService } from './services/api';
import { getLocalMessages, saveMessageLocal, createLocalMessage } from './services/db';
import { Send, Wifi, WifiOff, RefreshCcw, Map as MapIcon, MessageSquare } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';

// Define custom marker icon using CDN safely
import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function MapUpdater({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center[0] !== 0 || center[1] !== 0) {
      map.flyTo(center, zoom, { animate: true, duration: 2 });
    }
  }, [center, zoom, map]);
  return null;
}

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [serverIp, setServerIp] = useState(() => localStorage.getItem('serverIp') || window.location.hostname);
  const [serverPort, setServerPort] = useState(() => Number(localStorage.getItem('serverPort')) || 8001);
  const [userId] = useState(() => localStorage.getItem('userId') || `User_${Math.floor(Math.random() * 1000)}`);
  const [isConnected, setIsConnected] = useState(false);
  const [view, setView] = useState('chat'); // 'chat' or 'map'
  const [location, setLocation] = useState(null); // {lat, lng}
  const [locationError, setLocationError] = useState(false);
  
  const apiRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('userId', userId);
    localStorage.setItem('serverIp', serverIp);
    localStorage.setItem('serverPort', serverPort);
    loadLocalMessages();
    
    // Request geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocationError(false); },
        (err) => { console.warn("Location error:", err); setLocationError(true); },
        { enableHighAccuracy: true }
      );
      
      // Keep location updated
      const watchId = navigator.geolocation.watchPosition(
        (pos) => { setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocationError(false); },
        (err) => setLocationError(true),
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    } else {
        setLocationError(true);
    }
  }, [userId, serverIp, serverPort]);

  useEffect(() => {
    if (apiRef.current) {
      if (apiRef.current.ws) apiRef.current.ws.close();
      if (apiRef.current.reconnectTimer) clearTimeout(apiRef.current.reconnectTimer);
    }

    apiRef.current = new ApiService(serverIp, serverPort, async (msg) => {
      const isNew = await saveMessageLocal(msg);
      if (isNew) {
        setMessages(prev => {
          const _msgs = prev.filter(p => p.id !== msg.id);
          _msgs.push(msg);
          _msgs.sort((a, b) => {
            if (a.priority !== b.priority) return (b.priority || 1) - (a.priority || 1);
            return new Date(b.timestamp) - new Date(a.timestamp);
          });
          return _msgs;
        });
      }
    });

    apiRef.current.connectWebSocket((status) => setIsConnected(status));

    return () => {
      if (apiRef.current && apiRef.current.ws) {
        apiRef.current.ws.close();
        apiRef.current = null;
      }
    };
  }, [serverIp, serverPort]);

  const loadLocalMessages = async () => {
    const msgs = await getLocalMessages();
    setMessages(msgs);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Use current location
    const lat = location ? location.lat : null;
    const lng = location ? location.lng : null;

    const newMsg = await createLocalMessage(input, userId, lat, lng);
    setMessages(prev => {
      const _msgs = [newMsg, ...prev];
      _msgs.sort((a, b) => {
        if (a.priority !== b.priority) return (b.priority || 1) - (a.priority || 1);
        return new Date(b.timestamp) - new Date(a.timestamp);
      });
      return _msgs;
    });
    setInput('');

    if (apiRef.current && isConnected) {
      apiRef.current.sendMessage(newMsg);
    }
  };

  const manualSyncHttp = async () => {
    if (apiRef.current) {
      const serverMsgs = await apiRef.current.fetchMessages();
      if (serverMsgs) {
        let anyNew = false;
        for (const m of serverMsgs) {
          const isNew = await saveMessageLocal(m);
          if (isNew) anyNew = true;
        }
        if (anyNew) loadLocalMessages();
      }
    }
  };

  const renderMap = () => {
    const mapMsgs = messages.filter(m => m.latitude && m.longitude);
    
    let defaultCenter = location ? [location.lat, location.lng] : [0, 0];
    let defaultZoom = location ? 14 : 2;
    
    // If we have no location but we have messages, center on the latest message!
    if (!location && mapMsgs.length > 0) {
        defaultCenter = [mapMsgs[0].latitude, mapMsgs[0].longitude];
        defaultZoom = 13;
    }

    return (
      <div className="flex-1 w-full bg-slate-200 z-0 relative flex flex-col">
        {locationError && !location && (
            <div className="bg-red-100 text-red-700 text-xs p-2 text-center flex justify-between items-center z-10 font-bold border-b border-red-200 shadow-sm">
                <span>GPS Blocked by Phone (HTTP).</span>
                <button 
                  onClick={() => {
                      const lat = (Math.random() * 0.05) + 37.77; // Fake SF location
                      const lng = (Math.random() * 0.05) - 122.42;
                      setLocation({lat, lng}); 
                      setLocationError(false);
                  }} 
                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-full shadow transition-all active:scale-95"
                >
                  Mock GPS
                </button>
            </div>
        )}
        <div className="flex-1 w-full relative z-0">
          <MapContainer center={defaultCenter} zoom={defaultZoom} style={{ height: '100%', width: '100%' }}>
            <MapUpdater center={defaultCenter} zoom={defaultZoom} />
          {/* OSM Base Layer */}
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          
          {mapMsgs.map(msg => (
            <Marker key={msg.id} position={[msg.latitude, msg.longitude]}>
              <Popup>
                <div className="text-xs">
                  <strong>{msg.sender_id}</strong>
                  {msg.priority > 3 && <span className="ml-2 text-red-500 font-bold">P{msg.priority}</span>}
                  <p className="my-1">{msg.content}</p>
                  <p className="text-[10px] text-gray-500">{new Date(msg.timestamp).toLocaleString()}</p>
                </div>
              </Popup>
            </Marker>
          ))}
          {location && (
            <Marker position={[location.lat, location.lng]}>
              <Popup>You are here</Popup>
            </Marker>
          )}
        </MapContainer>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-white shadow-xl relative">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4 shadow-md flex justify-between items-center z-10">
        <div>
          <h1 className="text-xl font-bold tracking-wide">DTN Mesh</h1>
          <p className="text-xs opacity-80 mt-1">ID: {userId}</p>
        </div>
        <div className="flex flex-col items-end">
          <div className="flex items-center gap-2 bg-black/20 px-3 py-1 rounded-full backdrop-blur-sm">
            {isConnected ? <Wifi size={14} className="text-green-300" /> : <WifiOff size={14} className="text-red-300" />}
            <span className="text-[10px] font-medium uppercase tracking-wider">{isConnected ? 'Online' : 'Offline'}</span>
          </div>
          <button onClick={manualSyncHttp} className="flex items-center gap-1 text-[10px] uppercase font-bold text-white/70 hover:text-white mt-2 transition">
            <RefreshCcw size={10} /> Sync DB
          </button>
        </div>
      </div>

      {/* Connection Info Bar */}
      <div className="bg-slate-100 p-2 text-xs flex justify-between items-center px-4 border-b z-10 relative">
        <span className="font-semibold text-slate-600">Edge Node:</span>
        <div className="flex gap-1">
          <input
            type="text"
            value={serverIp}
            onChange={(e) => setServerIp(e.target.value)}
            className="bg-white border-2 border-slate-200 rounded-md px-2 py-1 text-right w-28 font-mono focus:border-blue-500 focus:ring-0 outline-none transition"
          />
          <input
            type="number"
            value={serverPort}
            onChange={(e) => setServerPort(Number(e.target.value))}
            className="bg-white border-2 border-slate-200 rounded-md px-2 py-1 text-right w-16 font-mono focus:border-blue-500 focus:ring-0 outline-none transition"
          />
        </div>
      </div>
      
      {/* View Toggle */}
      <div className="flex bg-white shadow-sm z-10 relative">
        <button 
          className={`flex-1 py-2 text-sm font-semibold flex justify-center items-center gap-2 ${view === 'chat' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500'}`}
          onClick={() => setView('chat')}
        >
          <MessageSquare size={16} /> Chat
        </button>
        <button 
          className={`flex-1 py-2 text-sm font-semibold flex justify-center items-center gap-2 ${view === 'map' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500'}`}
          onClick={() => setView('map')}
        >
          <MapIcon size={16} /> Mission Map
        </button>
      </div>

      {/* Main Content Area */}
      {view === 'map' ? renderMap() : (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col-reverse gap-4 bg-[#f8f9fa] z-0 relative">
          {messages.map(msg => {
            const isMine = msg.sender_id === userId;
            const isHighPriority = msg.priority >= 8;
            return (
              <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} max-w-[85%] ${isMine ? 'ml-auto' : 'mr-auto'}`}>
                <div className={`
                  p-3.5 rounded-2xl shadow-sm relative transition-all duration-300
                  ${isMine ? 'bg-blue-500 text-white rounded-tr-sm' : 'bg-white border text-gray-800 rounded-tl-sm shadow-md'}
                  ${isHighPriority && !isMine ? 'border-red-500 border-2 bg-red-50 !shadow-red-200 shadow-md' : ''}
                `}>
                  <div className="text-[10px] font-bold tracking-wider uppercase mb-1.5 opacity-80 flex gap-4 items-center">
                    <span>{isMine ? 'You' : msg.sender_id}</span>
                    {msg.priority > 3 && (
                      <span className={`px-2 py-0.5 rounded-full ${isMine ? 'bg-white/20 text-white' : 'bg-red-500 text-white shadow-sm'}`}>
                        Priority: {msg.priority}
                      </span>
                    )}
                  </div>
                  <div className="text-[14px] leading-relaxed break-words">{msg.content}</div>
                  <div className="text-[10px] text-right mt-2 font-medium opacity-60 flex justify-between items-center w-full gap-2">
                    <span>{msg.latitude && msg.longitude ? '📍' : ''}</span>
                    <span>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {msg.is_local && !msg.is_synced && isMine && <span className="ml-1 opacity-100 animate-pulse text-[12px]">⏳</span>}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
          {messages.length === 0 && (
            <div className="text-center text-slate-400 my-auto flex flex-col items-center">
              <WifiOff size={48} className="mb-4 opacity-20" />
              <p className="text-sm">No messages yet.</p>
              <p className="text-xs mt-2 max-w-[200px] leading-relaxed">Connect to an Edge Node and send a message to sync with the Mesh.</p>
            </div>
          )}
        </div>
      )}

      {/* Input */}
      {view === 'chat' && (
        <form onSubmit={handleSend} className="p-4 bg-white border-t border-slate-200 flex gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10 relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="New message..."
            className="flex-1 bg-slate-100 placeholder:text-slate-400 text-slate-700 rounded-full px-5 py-3 outline-none focus:ring-2 focus:ring-blue-500 transition shadow-inner"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="bg-blue-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-full p-3 hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5 transition active:translate-y-0 disabled:hover:translate-y-0 disabled:hover:shadow-none min-w-[48px] flex justify-center items-center"
          >
            <Send size={20} className={input.trim() ? "ml-0.5" : ""} />
          </button>
        </form>
      )}
    </div>
  )
}

export default App
